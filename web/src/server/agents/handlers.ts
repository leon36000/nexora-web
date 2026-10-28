import {
  AGENT_CATEGORIES,
  AGENT_STATUSES,
  AGENT_VISIBILITIES,
  type Database,
  EMBED_POSITIONS,
  REGIONS,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import {
  envSecretHostCheck,
  type SecretHostCheck,
  secretScopeProblem,
} from "@nexora/vault/scope";
import { secretKindOf } from "@nexora/vault/store";
import { z } from "zod";
import { envOutboundGuard, type OutboundGuard } from "../security/outbound";
import {
  allowMethods,
  HttpError,
  json,
  readBody,
  runAdminRoute,
  uuidParam,
} from "../site-agents/http";
import {
  AgentError,
  addAgentPrice,
  agentIssues,
  applyDiscovery,
  createInstance,
  currentAgentPrice,
  getAgent,
  getEmbedSettings,
  getInstance,
  listAgentPrices,
  listAgents,
  listInstances,
  recordInstanceCheck,
  saveEmbedSettings,
  updateAgent,
  updateInstance,
} from "./catalog";
import { checkInstance, discoverAgents } from "./discovery";

/**
 * API d'administration des agents hébergés : `/api/admin/hosted-agents/*` (D14). Consommée par le module Directus
 * « Agents hébergés » (rien n'y est persisté). Jeton d'administration en temps constant. Aucune réponse ne contient
 * de secret : une instance expose seulement la RÉFÉRENCE du coffre. Les montants (micro-CAD) sont des chaînes.
 */

export interface HostedAgentsAdminDeps {
  db: () => Database;
  adminToken: string | undefined;
  getSecret: (ref: string) => Promise<string>;
  /** Garde des adresses saisies (SSRF) ; défaut : politique de l'environnement (voir @nexora/net). */
  outbound?: OutboundGuard;
  /** Hôtes où une clé du coffre peut partir (R9) ; défaut : NEXORA_SECRET_HOSTS_* de l'environnement. */
  secretHosts?: SecretHostCheck;
  fetch: typeof fetch;
  log: Logger;
  now: () => Date;
  /** Appelé après toute écriture qui change ce que le public voit (revalidation des pages). */
  onChanged?: () => void;
}

const REF = /^[a-z0-9._-]{3,64}$/;
const baseUrl = z
  .string()
  .max(300)
  .transform((v) => v.trim().replace(/\/+$/, "").replace(/\/v1$/, ""))
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        (u.protocol === "http:" || u.protocol === "https:") &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash
      );
    } catch {
      return false;
    }
  }, "URL http(s) attendue");
const micro = z
  .union([
    z.string().regex(/^\d{1,18}$/),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform((v) => BigInt(v));

const instanceFields = {
  name: z.string().trim().min(1).max(100),
  baseUrl,
  secretRef: z.string().regex(REF).nullable(),
  region: z.enum(REGIONS),
  enabled: z.boolean(),
};
/**
 * Adresse de l'instance (SSRF), portée de la clé et hôte de la clé (R9) : refus 422 avant toute écriture. `current` :
 * l'état enregistré lors d'une modification (l'hôte est contrôlé sur la paire effective adresse + clé).
 */
async function assertInstanceTargets(
  db: Database,
  deps: HostedAgentsAdminDeps,
  input: { baseUrl?: string; secretRef?: string | null },
  current?: { baseUrl: string; secretRef: string | null },
): Promise<void> {
  if (input.baseUrl !== undefined) {
    const r = await (deps.outbound ?? envOutboundGuard)(input.baseUrl);
    if (!r.ok)
      throw new HttpError(422, "url_blocked", {
        message: r.reason,
        field: "baseUrl",
      });
  }
  if (input.secretRef) {
    const problem = secretScopeProblem(
      "workstudio-instance",
      input.secretRef,
      await secretKindOf(db, input.secretRef),
    );
    if (problem) throw new HttpError(422, "secret_scope", { message: problem });
  }
  const baseUrl = input.baseUrl ?? current?.baseUrl;
  const secretRef =
    input.secretRef !== undefined ? input.secretRef : current?.secretRef;
  if (secretRef && baseUrl) {
    const problem = (deps.secretHosts ?? envSecretHostCheck)(
      "workstudio-instance",
      baseUrl,
    );
    if (problem)
      throw new HttpError(422, "secret_host", {
        message: problem,
        field: "baseUrl",
      });
  }
}

const instanceCreate = z
  .object({
    code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
    name: instanceFields.name,
    baseUrl: instanceFields.baseUrl,
    secretRef: instanceFields.secretRef.optional(),
    region: instanceFields.region.optional(),
    enabled: instanceFields.enabled.optional(),
  })
  .strict();
const instancePatch = z.object(instanceFields).partial().strict();

const agentPatch = z
  .object({
    upstreamId: z.string().max(200),
    nameFr: z.string().trim().max(120),
    nameEn: z.string().trim().max(120),
    descriptionFr: z.string().trim().max(2000),
    descriptionEn: z.string().trim().max(2000),
    category: z.enum(AGENT_CATEGORIES),
    visibility: z.enum(AGENT_VISIBILITIES),
    runTokenCap: z.number().int().min(1).max(1_000_000),
    status: z.enum(AGENT_STATUSES),
  })
  .partial()
  .strict();

const priceCreate = z
  .object({
    inputCadMicro: micro.optional(),
    outputCadMicro: micro.optional(),
    perRunCadMicro: micro.optional(),
    isTrial: z.boolean().optional(),
    note: z.string().max(500).optional(),
    effectiveAt: z.iso
      .datetime()
      .transform((v) => new Date(v))
      .optional(),
  })
  .strict();

const embedPatch = z
  .object({
    enabled: z.boolean(),
    origin: z.string().max(200).nullable(),
    chatIdentifier: z.string().max(100).nullable(),
    pages: z.array(z.string().max(100)).max(20),
    position: z.enum(EMBED_POSITIONS),
    color: z.string().max(7).nullable(),
    labelFr: z.string().max(80).nullable(),
    labelEn: z.string().max(80).nullable(),
  })
  .partial()
  .strict();

const STATUS_OF: Record<string, number> = {
  not_found: 404,
  conflict: 409,
  invalid_request: 422,
  invalid_transition: 409,
  publication_refused: 422,
};

export async function handleHostedAgentsAdmin(
  request: Request,
  path: string[],
  deps: HostedAgentsAdminDeps,
): Promise<Response> {
  return runAdminRoute(
    request,
    path,
    deps,
    "agents hébergés",
    () => route(request, path, deps),
    (error) =>
      error instanceof AgentError
        ? json(
            {
              error: error.code,
              message: error.message,
              ...(error.details ? { issues: error.details } : {}),
            },
            STATUS_OF[error.code] ?? 400,
          )
        : null,
  );
}

async function agentView(db: Database, id: string, now: Date) {
  const agent = await getAgent(db, id);
  return {
    ...agent,
    currentPrice: await currentAgentPrice(db, id, now),
    issues: await agentIssues(db, id, now),
  };
}

async function route(
  request: Request,
  path: string[],
  deps: HostedAgentsAdminDeps,
): Promise<Response> {
  const db = deps.db();
  const now = deps.now();
  const [a, b, c] = path;
  const ok = (data: unknown, status = 200) => json(data, status);
  const changed = () => deps.onChanged?.();

  // GET /api/admin/hosted-agents : vue d'ensemble
  if (!a) {
    allowMethods(request, "GET");
    const [instances, agents, embed] = await Promise.all([
      listInstances(db),
      listAgents(db),
      getEmbedSettings(db),
    ]);
    return ok({
      instances,
      agents: await Promise.all(agents.map((x) => agentView(db, x.id, now))),
      embed,
    });
  }

  if (a === "instances") {
    if (!b) {
      const method = allowMethods(request, "GET", "POST");
      if (method === "GET") return ok({ instances: await listInstances(db) });
      const input = await readBody(request, instanceCreate);
      await assertInstanceTargets(db, deps, input);
      const created = await createInstance(db, input);
      deps.log.info("agents hébergés : instance créée", { code: created.code });
      return ok(created, 201);
    }
    const id = uuidParam(b);
    if (c === "test" || c === "discover") {
      allowMethods(request, "POST");
      const instance = await getInstance(db, id);
      const reach = {
        getSecret: deps.getSecret,
        fetch: deps.fetch,
        secretHosts: deps.secretHosts ?? envSecretHostCheck,
      };
      // L'adresse est revérifiée à chaque appel : elle a pu changer de destination depuis l'enregistrement.
      const target = await (deps.outbound ?? envOutboundGuard)(
        instance.baseUrl,
      );
      if (!target.ok) {
        const detail = `adresse refusée : ${target.reason}`;
        const updated = await recordInstanceCheck(
          db,
          id,
          { ok: false, detail },
          now,
        );
        return ok(
          c === "test"
            ? { ok: false, detail, instance: updated }
            : { ok: false, detail },
          c === "test" ? 200 : 502,
        );
      }
      if (c === "test") {
        const check = await checkInstance(instance, reach);
        const updated = await recordInstanceCheck(db, id, check, now);
        deps.log.info("agents hébergés : instance testée", {
          code: instance.code,
          ok: check.ok,
        });
        return ok({ ok: check.ok, detail: check.detail, instance: updated });
      }
      const outcome = await discoverAgents(instance, reach);
      await recordInstanceCheck(db, id, outcome, now);
      if (!outcome.ok) return ok({ ok: false, detail: outcome.detail }, 502);
      const result = await applyDiscovery(db, id, outcome.agents, now);
      deps.log.info("agents hébergés : découverte", {
        code: instance.code,
        created: result.created.length,
        seen: result.seen.length,
        missing: result.missing.length,
      });
      return ok({
        ok: true,
        detail: outcome.detail,
        created: result.created,
        seen: result.seen,
        missing: result.missing,
      });
    }
    if (c) throw new HttpError(404, "not_found");
    const method = allowMethods(request, "GET", "PATCH");
    if (method === "GET") return ok(await getInstance(db, id));
    const patch = await readBody(request, instancePatch);
    await assertInstanceTargets(db, deps, patch, await getInstance(db, id));
    const updated = await updateInstance(db, id, patch);
    changed();
    return ok(updated);
  }

  if (a === "agents") {
    if (!b) {
      allowMethods(request, "GET");
      const agents = await listAgents(db);
      return ok({
        agents: await Promise.all(agents.map((x) => agentView(db, x.id, now))),
      });
    }
    const id = uuidParam(b);
    if (c === "prices") {
      const method = allowMethods(request, "GET", "POST");
      if (method === "GET")
        return ok({ prices: await listAgentPrices(db, id) });
      const price = await addAgentPrice(
        db,
        id,
        await readBody(request, priceCreate),
        now,
      );
      deps.log.info("agents hébergés : prix ajouté", { agentId: id });
      changed();
      return ok(price, 201);
    }
    if (c) throw new HttpError(404, "not_found");
    const method = allowMethods(request, "GET", "PATCH");
    if (method === "GET")
      return ok({
        ...(await agentView(db, id, now)),
        prices: await listAgentPrices(db, id),
      });
    const patch = await readBody(request, agentPatch);
    const updated = await updateAgent(db, id, patch, now);
    if (patch.status)
      deps.log.info("agents hébergés : statut d'agent", {
        slug: updated.slug,
        status: updated.status,
      });
    changed();
    return ok(await agentView(db, id, now));
  }

  if (a === "embed" && !b) {
    const method = allowMethods(request, "GET", "PATCH");
    if (method === "GET") return ok(await getEmbedSettings(db));
    const saved = await saveEmbedSettings(
      db,
      await readBody(request, embedPatch),
      now,
    );
    deps.log.info("agents hébergés : bulle WorkStudio", {
      enabled: saved.enabled,
    });
    changed();
    return ok(saved);
  }

  throw new HttpError(404, "not_found");
}
