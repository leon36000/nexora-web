import { type Executor, vpsEvents } from "@nexora/db";
import { scrubString } from "@nexora/log";

export type VpsActor = "system" | "customer" | "operator" | "stripe" | "worker";

export interface VpsEventInput {
  organizationId?: string | null;
  orderId?: string | null;
  instanceId?: string | null;
  actor: VpsActor;
  kind: string;
  message?: string;
  detail?: Record<string, unknown>;
}

/**
 * Journal d'un VPS (ajout seulement). Les messages sont nettoyés (jetons, clés, mots de passe
 * d'URL) et bornés : le journal est affiché au client, il ne contient ni secret ni renseignement
 * personnel inutile.
 */
export async function recordVpsEvent(
  exec: Executor,
  input: VpsEventInput,
): Promise<void> {
  await exec.insert(vpsEvents).values({
    organizationId: input.organizationId ?? null,
    orderId: input.orderId ?? null,
    instanceId: input.instanceId ?? null,
    actor: input.actor,
    kind: input.kind,
    message: scrubString(input.message ?? "").slice(0, 500),
    detail: input.detail ?? {},
  });
}

/** Message d'erreur court et nettoyé, pour `last_error` et le journal. */
export function safeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return scrubString(text).replace(/\s+/g, " ").slice(0, 300);
}
