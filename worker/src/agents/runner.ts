import {
  agentMonthSpendMicro,
  type Database,
  eq,
  getAgentDefinition,
  type SiteAgent,
  type SiteAgentRunEvent,
  siteAgentRuns,
  siteAgents,
  sql,
} from "@nexora/db";
import { type Logger, scrubString } from "@nexora/log";
import {
  type AgentContext,
  type AgentImpl,
  BudgetExceededError,
  RunStoppedError,
} from "./context.ts";
import type { AgentDirectus } from "./directus-client.ts";
import {
  type ChatRequest,
  type GatewayClient,
  GatewayError,
} from "./gateway-client.ts";
import { type IngestOptions, ingestSource } from "./ingest.ts";

/**
 * Cycle de vie d'une exécution d'agent : démarrage, budget, arrêt, journal, comptage des jetons et du coût, état.
 * AUCUN modèle n'intervient dans ce fichier : c'est du code qui décide de lancer, d'arrêter et de consigner.
 */

export interface RunnerDeps {
  db: Database;
  log: Logger;
  /** Lit un secret du Coffre (clé de passerelle, jeton Directus). Jamais journalisé. */
  readSecret(ref: string): Promise<string>;
  gateway(apiKey: string): GatewayClient;
  directus(token: string): AgentDirectus;
  agents: Partial<Record<string, AgentImpl>>;
  ingest?: IngestOptions;
  now?: () => Date;
}

const MAX_EVENTS = 100;
const clean = (s: string, max = 400) => scrubString(s).slice(0, max);

export type RunOutcome =
  | "succeeded"
  | "failed"
  | "stopped"
  | "budget_exceeded"
  | "skipped";

export async function executeRun(
  deps: RunnerDeps,
  runId: string,
  signal: AbortSignal = new AbortController().signal,
): Promise<RunOutcome> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  // Réclame l'exécution (une seule fois) : queued -> running.
  const [claimed] = await db
    .update(siteAgentRuns)
    .set({ status: "running", startedAt: now() })
    .where(
      sql`${siteAgentRuns.id} = ${runId} AND ${siteAgentRuns.status} = 'queued'`,
    )
    .returning();
  if (!claimed) return "skipped";
  const [agentRow] = await db
    .select()
    .from(siteAgents)
    .where(eq(siteAgents.key, claimed.agentKey));
  const def = getAgentDefinition(claimed.agentKey);
  const events: SiteAgentRunEvent[] = [];
  const output: Record<string, unknown> = {};
  let promptTokens = 0;
  let completionTokens = 0;
  let costMicro = 0n;

  const event: AgentContext["event"] = (level, message) => {
    if (events.length < MAX_EVENTS)
      events.push({ at: now().toISOString(), level, message: clean(message) });
  };
  const persistProgress = async () => {
    await db
      .update(siteAgentRuns)
      .set({
        events,
        output,
        promptTokens,
        completionTokens,
        costMicro,
      })
      .where(eq(siteAgentRuns.id, runId));
  };
  const finish = async (
    status: "succeeded" | "failed" | "stopped" | "budget_exceeded",
    error: string | null,
  ): Promise<RunOutcome> => {
    await db
      .update(siteAgentRuns)
      .set({
        status,
        error: error ? clean(error) : null,
        events,
        output,
        promptTokens,
        completionTokens,
        costMicro,
        finishedAt: now(),
      })
      .where(eq(siteAgentRuns.id, runId));
    if (agentRow) await updateAgentAfterRun(deps, agentRow, status, error);
    deps.log.info("exécution d'agent terminée", {
      runId,
      agent: claimed.agentKey,
      status,
      costMicro: costMicro.toString(),
    });
    return status;
  };

  if (!agentRow || !def) {
    event("error", "agent inconnu");
    return finish("failed", "agent inconnu");
  }
  const impl = deps.agents[agentRow.key];
  if (!impl) {
    event("error", "agent sans implémentation");
    return finish("failed", "agent sans implémentation");
  }
  if (!agentRow.enabled) {
    event("warn", "agent désactivé : exécution arrêtée");
    return finish("stopped", null);
  }

  await db
    .update(siteAgents)
    .set({ state: "running", lastRunAt: now(), updatedAt: now() })
    .where(eq(siteAgents.key, agentRow.key));
  event("info", `démarrage (déclencheur : ${claimed.trigger})`);

  // Garde de budget AVANT toute chose coûteuse.
  const checkBudget = async () => {
    const [fresh] = await db
      .select()
      .from(siteAgents)
      .where(eq(siteAgents.key, agentRow.key));
    if (!fresh?.enabled) throw new RunStoppedError();
    if (def.usesLlm) {
      const spent = await agentMonthSpendMicro(db, agentRow.key, now());
      if (spent >= fresh.budgetMicro)
        throw new BudgetExceededError(
          "month_budget",
          `budget mensuel atteint (${microToCad(spent)} sur ${microToCad(fresh.budgetMicro)} CAD)`,
        );
    }
    return fresh;
  };

  try {
    const fresh = await checkBudget();
    let gateway: GatewayClient | null = null;
    if (def.usesLlm) {
      if (!fresh.gatewayKeyRef)
        throw new Error("clé de passerelle non configurée");
      gateway = deps.gateway(await deps.readSecret(fresh.gatewayKeyRef));
      if (!fresh.model) throw new Error("aucun modèle configuré");
    }
    let directus: AgentDirectus | null = null;
    if (def.writesDrafts) {
      if (!fresh.directusTokenRef)
        throw new Error("jeton Directus non configuré");
      directus = deps.directus(await deps.readSecret(fresh.directusTokenRef));
    }

    const ctx: AgentContext = {
      run: { id: runId, input: claimed.input, trigger: claimed.trigger },
      agent: fresh,
      def,
      directus,
      output,
      signal,
      event,
      ingest: (url) => ingestSource(url, deps.ingest),
      async chat(request) {
        if (!gateway) throw new Error("cet agent n'appelle pas de modèle");
        const current = await checkBudget();
        // Plafond de sortie du modèle (raisonnement compris pour un modèle « pensant »), réglable par agent.
        const cap = Number(current.config.maxTokens);
        const ceiling = Number.isSafeInteger(cap) && cap > 0 ? cap : 4096;
        const req: ChatRequest = {
          ...request,
          model: current.model as string,
          maxTokens: Math.min(request.maxTokens ?? ceiling, ceiling),
        };
        try {
          const res = await gateway.chat(req);
          promptTokens += res.promptTokens;
          completionTokens += res.completionTokens;
          costMicro += res.costMicro;
          await db
            .update(siteAgents)
            .set({
              promptTokensTotal: sql`${siteAgents.promptTokensTotal} + ${res.promptTokens}`,
              completionTokensTotal: sql`${siteAgents.completionTokensTotal} + ${res.completionTokens}`,
              costTotalMicro: sql`${siteAgents.costTotalMicro} + ${res.costMicro}`,
            })
            .where(eq(siteAgents.key, agentRow.key));
          await persistProgress();
          event(
            "info",
            `appel du modèle ${res.model} : ${res.promptTokens} + ${res.completionTokens} jetons, ${microToCad(res.costMicro)} CAD`,
          );
          return res;
        } catch (e) {
          if (
            e instanceof GatewayError &&
            (e.code === "insufficient_quota" ||
              e.code === "account_blocked" ||
              e.code === "key_cap")
          )
            throw new BudgetExceededError("gateway_quota", e.message);
          throw e;
        }
      },
    };
    await impl(ctx);
    return await finish("succeeded", null);
  } catch (e) {
    if (e instanceof RunStoppedError) {
      event("warn", e.message);
      return finish("stopped", null);
    }
    if (e instanceof BudgetExceededError) {
      event("warn", `arrêt propre : ${e.message}`);
      return finish("budget_exceeded", e.message);
    }
    const message = e instanceof Error ? e.message : "erreur inconnue";
    event("error", message);
    return finish("failed", message);
  }
}

async function updateAgentAfterRun(
  deps: RunnerDeps,
  agent: SiteAgent,
  status: "succeeded" | "failed" | "stopped" | "budget_exceeded",
  error: string | null,
) {
  const { db } = deps;
  const [fresh] = await db
    .select()
    .from(siteAgents)
    .where(eq(siteAgents.key, agent.key));
  const def = getAgentDefinition(agent.key);
  const spent = await agentMonthSpendMicro(db, agent.key, deps.now?.());
  let state: SiteAgent["state"] = "idle";
  if (!fresh?.enabled) state = "disabled";
  else if (
    def?.usesLlm &&
    (status === "budget_exceeded" || spent >= fresh.budgetMicro)
  )
    state = "budget_exceeded";
  else if (status === "failed") state = "error";
  await db
    .update(siteAgents)
    .set({
      state,
      lastError:
        status === "succeeded"
          ? null
          : status === "stopped"
            ? (fresh?.lastError ?? null)
            : clean(error ?? "échec", 400),
      updatedAt: new Date(),
    })
    .where(eq(siteAgents.key, agent.key));
}

/** 1 234 567 -> « 1,2346 » (CAD, 4 décimales au plus). */
function microToCad(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const frac = (micro % 1_000_000n).toString().padStart(6, "0").slice(0, 4);
  return `${whole},${frac}`;
}
