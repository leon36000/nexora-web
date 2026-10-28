import type { SiteAgent, SiteAgentDefinition, SiteAgentRun } from "@nexora/db";
import type { AgentDirectus } from "./directus-client.ts";
import type { ChatRequest, ChatResult } from "./gateway-client.ts";
import type { IngestedSource } from "./ingest.ts";

export class BudgetExceededError extends Error {
  readonly reason: "month_budget" | "gateway_quota";
  constructor(reason: BudgetExceededError["reason"], message: string) {
    super(message);
    this.name = "BudgetExceededError";
    this.reason = reason;
  }
}

export class RunStoppedError extends Error {
  constructor() {
    super("exécution arrêtée (agent désactivé)");
    this.name = "RunStoppedError";
  }
}

/** Ce qu'une implémentation d'agent peut utiliser. Rien d'autre : pas de base de données, pas de coffre, pas de réseau libre. */
export interface AgentContext {
  run: Pick<SiteAgentRun, "id" | "input" | "trigger">;
  agent: SiteAgent;
  def: SiteAgentDefinition;
  /** Appel de modèle par la passerelle : budget vérifié avant, jetons et coût comptés après, arrêt honoré. */
  chat(
    request: Omit<ChatRequest, "model" | "maxTokens"> & { maxTokens?: number },
  ): Promise<ChatResult>;
  /** Client Directus restreint (liste fermée) ; null pour un agent qui n'écrit pas. */
  directus: AgentDirectus | null;
  /** Lecture seule d'une source externe fournie par un humain. */
  ingest(url: string): Promise<IngestedSource>;
  /** Journal de l'exécution (consultable dans le module Directus). Jamais de secret. */
  event(level: "info" | "warn" | "error", message: string): void;
  /** Sortie de l'exécution : références (brouillons, approbations), propositions. Jamais de secret. */
  output: Record<string, unknown>;
  signal: AbortSignal;
}

export type AgentImpl = (ctx: AgentContext) => Promise<void>;
