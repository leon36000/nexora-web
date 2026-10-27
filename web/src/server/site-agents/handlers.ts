import {
  agentGatewayKeyRef,
  agentMonthSpendMicro,
  and,
  apiKeys,
  credit,
  creditAccounts,
  type Database,
  desc,
  enqueue,
  ensureSiteAgents,
  eq,
  getAccount,
  getAgentDefinition,
  INTERNAL_AGENTS_ORG,
  inArray,
  isNull,
  LedgerError,
  models,
  organizations,
  type SiteAgent,
  type SiteAgentDefinition,
  type SiteAgentKey,
  siteAgentRuns,
  siteAgents,
  sql,
  vaultSecrets,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { Keyring } from "@nexora/vault/crypto";
import { putSecret } from "@nexora/vault/store";
import { z } from "zod";
import { createApiKey } from "../gateway/keys";
import {
  allowMethods,
  HttpError,
  json,
  limitParam,
  readBody,
  runAdminRoute,
  uuidParam,
} from "./http";

/**
 * API d'administration des agents du site : `/api/admin/site-agents/*` (D9, D14). Consommée par le module Directus
 * « Agents du site » (rien n'y est persisté). Jeton d'administration en temps constant. Aucune réponse ne contient
 * de secret : la clé de passerelle d'un agent est écrite dans le Coffre et seule sa fin (4 caractères) se lit.
 */

export interface SiteAgentsAdminDeps {
  db: () => Database;
  adminToken: string | undefined;
  /** Trousseau du Coffre (clé maîtresse). Lève si absent : la génération de clé répond alors 503. */
  keyring: () => Keyring;
  log: Logger;
  now: () => Date;
}

/** Garde-fous (micro-CAD) : un PATCH de budget ne dépasse pas 100 $, une allocation de crédit 500 $ par appel. */
export const MAX_BUDGET_MICRO = 100_000_000n;
export const MAX_CREDIT_MICRO = 500_000_000n;

const micro = z
  .union([
    z.string().regex(/^\d{1,18}$/),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform((v) => BigInt(v));

const flatConfig = z
  .record(
    z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/),
    z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
  )
  .refine((o) => Object.keys(o).length <= 20, "trop de clés")
  .refine((o) => JSON.stringify(o).length <= 4000, "trop volumineux");

const patchSchema = z
  .object({
    enabled: z.boolean(),
    budgetMicro: micro,
    model: z.string().min(3).max(120).nullable(),
    config: flatConfig,
  })
  .partial()
  .strict();

const runSchema = z
  .object({
    brief: z.string().trim().min(10).max(4000),
    sourceUrl: z
      .string()
      .max(500)
      .refine((v) => {
        try {
          const u = new URL(v);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      }, "URL http(s) attendue"),
    pageId: z.uuid(),
  })
  .partial()
  .strict();

const creditSchema = z
  .object({
    amountMicro: micro,
    idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,120}$/),
    note: z.string().max(200).optional(),
  })
  .strict();

type Agent = SiteAgent;
const isAgentKey = (k: string | undefined): k is SiteAgentKey =>
  !!k && getAgentDefinition(k) !== undefined;

function definitionOf(key: string | undefined): SiteAgentDefinition {
  const def = key ? getAgentDefinition(key) : undefined;
  if (!def) throw new HttpError(404, "not_found");
  return def;
}

async function loadAgent(db: Database, key: SiteAgentKey): Promise<Agent> {
  await ensureSiteAgents(db);
  const [row] = await db
    .select()
    .from(siteAgents)
    .where(eq(siteAgents.key, key));
  if (!row) throw new HttpError(404, "not_found");
  return row;
}

/** Secrets présents (non révoqués) parmi des références, sans rien déchiffrer. */
async function vaultPresence(
  db: Database,
  refs: string[],
): Promise<Map<string, string>> {
  if (refs.length === 0) return new Map();
  const rows = await db
    .select({ ref: vaultSecrets.ref, last4: vaultSecrets.last4 })
    .from(vaultSecrets)
    .where(
      and(inArray(vaultSecrets.ref, refs), isNull(vaultSecrets.revokedAt)),
    );
  return new Map(rows.map((r) => [r.ref, r.last4]));
}

function describeAgent(
  a: Agent,
  def: SiteAgentDefinition,
  spentMonthMicro: bigint,
  vault: Map<string, string>,
) {
  return {
    key: a.key,
    name: def.name,
    mission: def.mission,
    usesLlm: def.usesLlm,
    writesDrafts: def.writesDrafts,
    inputs: def.inputs,
    model: a.model,
    enabled: a.enabled,
    budgetMicro: a.budgetMicro,
    spentMonthMicro,
    state: a.state,
    lastRunAt: a.lastRunAt,
    lastError: a.lastError,
    promptTokensTotal: a.promptTokensTotal,
    completionTokensTotal: a.completionTokensTotal,
    costTotalMicro: a.costTotalMicro,
    gatewayKey: a.gatewayKeyRef
      ? vault.has(a.gatewayKeyRef)
        ? { present: true, last4: vault.get(a.gatewayKeyRef) }
        : { present: false }
      : { present: false },
    directusToken: {
      present: a.directusTokenRef ? vault.has(a.directusTokenRef) : false,
    },
    config: a.config,
  };
}

function computeState(
  agent: Pick<Agent, "state">,
  def: SiteAgentDefinition,
  enabled: boolean,
  budgetMicro: bigint,
  spent: bigint,
): Agent["state"] {
  if (!enabled) return "disabled";
  if (def.usesLlm && spent >= budgetMicro) return "budget_exceeded";
  if (agent.state === "running" || agent.state === "error") return agent.state;
  return "idle";
}

async function ensureInternalOrg(db: Database): Promise<void> {
  await db
    .insert(organizations)
    .values({
      id: INTERNAL_AGENTS_ORG.id,
      name: INTERNAL_AGENTS_ORG.name,
      slug: INTERNAL_AGENTS_ORG.slug,
    })
    .onConflictDoNothing();
  await db
    .insert(creditAccounts)
    .values({ organizationId: INTERNAL_AGENTS_ORG.id })
    .onConflictDoNothing();
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const asDb = (tx: Tx) => tx as unknown as Database;

export async function handleSiteAgentsAdmin(
  request: Request,
  path: string[],
  deps: SiteAgentsAdminDeps,
): Promise<Response> {
  return runAdminRoute(
    request,
    path,
    { adminToken: deps.adminToken, log: deps.log },
    "agents du site",
    () => route(request, path, deps),
    (error) => {
      if (error instanceof LedgerError)
        return json(
          { error: error.code, message: "Écriture du grand livre refusée." },
          409,
        );
      return null;
    },
  );
}

async function route(
  request: Request,
  path: string[],
  deps: SiteAgentsAdminDeps,
): Promise<Response> {
  const db = deps.db();
  const now = deps.now();
  const [a, b] = path;

  // GET / : vue d'ensemble
  if (!a) {
    allowMethods(request, "GET");
    const agents = await ensureSiteAgents(db);
    const refs = agents.flatMap((x) =>
      [x.gatewayKeyRef, x.directusTokenRef].filter((r): r is string => !!r),
    );
    const vault = await vaultPresence(db, refs);
    const described = await Promise.all(
      agents.map(async (x) => {
        const def = getAgentDefinition(x.key);
        if (!def) return null;
        return describeAgent(
          x,
          def,
          await agentMonthSpendMicro(db, x.key, now),
          vault,
        );
      }),
    );
    const account = await getAccount(db, INTERNAL_AGENTS_ORG.id);
    return json({
      agents: described.filter((x) => x !== null),
      gateway: {
        orgName: INTERNAL_AGENTS_ORG.name,
        availableMicro: account.availableMicro,
        heldMicro: account.heldMicro,
        balanceMicro: account.balanceMicro,
      },
    });
  }

  if (a === "credit" && !b) {
    allowMethods(request, "POST");
    const body = await readBody(request, creditSchema);
    if (body.amountMicro <= 0n || body.amountMicro > MAX_CREDIT_MICRO)
      throw new HttpError(422, "invalid_request", {
        issues: [{ path: "amountMicro", code: "out_of_range" }],
      });
    await ensureInternalOrg(db);
    const { entry, replayed } = await credit(db, {
      organizationId: INTERNAL_AGENTS_ORG.id,
      amountMicro: body.amountMicro,
      idempotencyKey: `internal-allocation:${body.idempotencyKey}`,
      configVersion: "internal_allocation",
      source: "internal_allocation",
      metadata: { allocated_by: "admin-api", note: body.note ?? null },
    });
    const account = await getAccount(db, INTERNAL_AGENTS_ORG.id);
    deps.log.info("agents du site : crédit alloué", {
      amountMicro: body.amountMicro.toString(),
      replayed,
    });
    return json(
      {
        replayed,
        entryId: entry.id,
        balanceMicro: account.balanceMicro,
        availableMicro: account.availableMicro,
      },
      replayed ? 200 : 201,
    );
  }

  if (a === "runs") {
    allowMethods(request, "GET");
    if (!b) {
      const url = new URL(request.url);
      const agent = url.searchParams.get("agent");
      if (agent && !isAgentKey(agent))
        throw new HttpError(422, "invalid_request");
      const rows = await db
        .select({
          id: siteAgentRuns.id,
          agentKey: siteAgentRuns.agentKey,
          trigger: siteAgentRuns.trigger,
          status: siteAgentRuns.status,
          model: siteAgentRuns.model,
          promptTokens: siteAgentRuns.promptTokens,
          completionTokens: siteAgentRuns.completionTokens,
          costMicro: siteAgentRuns.costMicro,
          error: siteAgentRuns.error,
          createdAt: siteAgentRuns.createdAt,
          startedAt: siteAgentRuns.startedAt,
          finishedAt: siteAgentRuns.finishedAt,
          output: siteAgentRuns.output,
        })
        .from(siteAgentRuns)
        .where(
          agent ? eq(siteAgentRuns.agentKey, agent as SiteAgentKey) : undefined,
        )
        .orderBy(desc(siteAgentRuns.createdAt))
        .limit(limitParam(url, 25, 100));
      return json({ runs: rows });
    }
    const [run] = await db
      .select()
      .from(siteAgentRuns)
      .where(eq(siteAgentRuns.id, uuidParam(b)));
    if (!run) throw new HttpError(404, "not_found");
    return json({ run });
  }

  // /{key}[/action]
  const def = definitionOf(a);
  const key = def.key;
  const action = b;

  if (!action) {
    allowMethods(request, "PATCH");
    const body = await readBody(request, patchSchema);
    const agent = await loadAgent(db, key);
    const enabled = body.enabled ?? agent.enabled;
    const budget = body.budgetMicro ?? agent.budgetMicro;
    const model = body.model !== undefined ? body.model : agent.model;
    if (budget > MAX_BUDGET_MICRO)
      throw new HttpError(422, "invalid_request", {
        issues: [{ path: "budgetMicro", code: "out_of_range" }],
      });
    if (body.model && body.model !== agent.model) {
      if (!def.usesLlm) throw new HttpError(409, "agent_without_llm");
      const [found] = await db
        .select({ id: models.id })
        .from(models)
        .where(
          and(eq(models.publicId, body.model), eq(models.status, "published")),
        );
      if (!found) throw new HttpError(422, "model_unknown");
    }
    if (enabled && !agent.enabled) {
      const vault = await vaultPresence(
        db,
        [agent.gatewayKeyRef, agent.directusTokenRef].filter(
          (r): r is string => !!r,
        ),
      );
      if (def.usesLlm) {
        if (!model) throw new HttpError(409, "model_missing");
        if (!agent.gatewayKeyRef || !vault.has(agent.gatewayKeyRef))
          throw new HttpError(409, "gateway_key_missing");
      }
      if (def.usesLlm && budget <= 0n) throw new HttpError(409, "budget_zero");
      if (def.writesDrafts) {
        if (!agent.directusTokenRef || !vault.has(agent.directusTokenRef))
          throw new HttpError(409, "directus_token_missing");
      }
    } else if (enabled && def.usesLlm && budget <= 0n) {
      throw new HttpError(409, "budget_zero");
    }
    const spent = await agentMonthSpendMicro(db, key, now);
    const state = computeState(agent, def, enabled, budget, spent);

    await db.transaction(async (tx) => {
      const t = asDb(tx);
      await t
        .update(siteAgents)
        .set({
          enabled,
          budgetMicro: budget,
          model,
          state,
          ...(body.config ? { config: body.config } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(siteAgents.key, key));
      if (!enabled && agent.enabled) await stopQueuedRuns(t, key, now);
      if (model !== agent.model && agent.gatewayKeyId)
        await t
          .update(apiKeys)
          .set({ allowedModels: model ? [model] : null })
          .where(eq(apiKeys.id, agent.gatewayKeyId));
    });
    deps.log.info("agents du site : réglage modifié", {
      agent: key,
      enabled,
      state,
    });
    return json({ agent: await describeOne(db, key, now) });
  }

  if (action === "run") {
    allowMethods(request, "POST");
    const body = await readBody(request, runSchema, { optional: true });
    for (const input of def.inputs)
      if (input.required && body[input.field] === undefined)
        throw new HttpError(422, "invalid_request", {
          issues: [{ path: input.field, code: "required" }],
        });
    const allowedFields = new Set(def.inputs.map((i) => i.field));
    for (const field of Object.keys(body))
      if (!allowedFields.has(field as "brief" | "sourceUrl" | "pageId"))
        throw new HttpError(422, "invalid_request", {
          issues: [{ path: field, code: "unrecognized_key" }],
        });
    const agent = await loadAgent(db, key);
    if (!agent.enabled) throw new HttpError(409, "agent_disabled");
    if (def.usesLlm) {
      const spent = await agentMonthSpendMicro(db, key, now);
      if (spent >= agent.budgetMicro)
        throw new HttpError(409, "budget_exceeded");
    }
    const result = await db.transaction(async (tx) => {
      const t = asDb(tx);
      const [run] = await t
        .insert(siteAgentRuns)
        .values({
          agentKey: key,
          trigger: "manual",
          status: "queued",
          input: body,
          model: agent.model,
          requestedBy: "admin",
        })
        .returning({ id: siteAgentRuns.id });
      if (!run) throw new Error("exécution non créée");
      const job = await enqueue(t, {
        type: "site-agent.run",
        payload: { runId: run.id },
        idempotencyKey: `site-agent-run:${run.id}`,
        maxAttempts: 1,
      });
      await t
        .update(siteAgentRuns)
        .set({ jobId: job.id })
        .where(eq(siteAgentRuns.id, run.id));
      return { runId: run.id, jobId: job.id };
    });
    deps.log.info("agents du site : exécution demandée", { agent: key });
    return json(result, 202);
  }

  if (action === "stop") {
    allowMethods(request, "POST");
    await loadAgent(db, key);
    const stopped = await db.transaction(async (tx) => {
      const t = asDb(tx);
      await t
        .update(siteAgents)
        .set({ enabled: false, state: "disabled", updatedAt: sql`now()` })
        .where(eq(siteAgents.key, key));
      return stopQueuedRuns(t, key, now);
    });
    deps.log.info("agents du site : arrêt demandé", { agent: key, stopped });
    return json({ key, enabled: false, stoppedQueued: stopped });
  }

  if (action === "gateway-key") {
    allowMethods(request, "POST");
    if (!def.usesLlm) throw new HttpError(409, "agent_without_llm");
    const agent = await loadAgent(db, key);
    if (!agent.model) throw new HttpError(409, "model_missing");
    let keyring: Keyring;
    try {
      keyring = deps.keyring();
    } catch {
      throw new HttpError(503, "vault_not_configured");
    }
    const ref = agentGatewayKeyRef(key);
    const result = await db.transaction(async (tx) => {
      const t = asDb(tx);
      await ensureInternalOrg(t);
      const created = await createApiKey(t, {
        organizationId: INTERNAL_AGENTS_ORG.id,
        name: `agent-${key}`,
        allowedModels: [agent.model as string],
        rpmLimit: 30,
        createdBy: "admin-api",
      });
      const stored = await putSecret(t, keyring, {
        ref,
        value: created.key,
        kind: "other",
      });
      if (agent.gatewayKeyId)
        await t
          .update(apiKeys)
          .set({ revokedAt: sql`now()` })
          .where(
            and(eq(apiKeys.id, agent.gatewayKeyId), isNull(apiKeys.revokedAt)),
          );
      await t
        .update(siteAgents)
        .set({
          gatewayKeyId: created.record.id,
          gatewayKeyRef: ref,
          updatedAt: sql`now()`,
        })
        .where(eq(siteAgents.key, key));
      return { ref, last4: stored.last4 };
    });
    deps.log.info("agents du site : clé de passerelle générée", { agent: key });
    return json(result, 201);
  }

  throw new HttpError(404, "not_found");
}

async function stopQueuedRuns(
  db: Database,
  key: SiteAgentKey,
  now: Date,
): Promise<number> {
  const rows = await db
    .update(siteAgentRuns)
    .set({ status: "stopped", finishedAt: now })
    .where(
      and(eq(siteAgentRuns.agentKey, key), eq(siteAgentRuns.status, "queued")),
    )
    .returning({ id: siteAgentRuns.id });
  return rows.length;
}

async function describeOne(db: Database, key: SiteAgentKey, now: Date) {
  const agent = await loadAgent(db, key);
  const def = getAgentDefinition(key) as SiteAgentDefinition;
  const vault = await vaultPresence(
    db,
    [agent.gatewayKeyRef, agent.directusTokenRef].filter(
      (r): r is string => !!r,
    ),
  );
  return describeAgent(
    agent,
    def,
    await agentMonthSpendMicro(db, key, now),
    vault,
  );
}
