import { eq, sql } from "drizzle-orm";
import type { Executor } from "./ledger.ts";
import {
  type FindingKind,
  reconciliationFindings,
  usageIntents,
} from "./schema-reconciliation.ts";

/**
 * Journal d'intention de la passerelle et journal des écarts (audit F-01, F-06). Voir `schema-reconciliation.ts`.
 * Ces fonctions n'importent rien du grand livre (seulement son type d'exécuteur) : la reprise qui règle une
 * requête perdue vit dans `ledger.ts`, à côté de la libération des réservations.
 */

export interface IntentInput {
  requestId: string;
  organizationId: string;
  apiKeyId: string;
  /** Réservation du grand livre ; null : organisation « maison » (aucun débit). */
  reservationId: string | null;
  modelPublicId: string;
  endpoint: string;
  configVersion: string;
  stream: boolean;
  /** Identifiant d'appel envoyé à LiteLLM avant l'appel ; null pour un agent hébergé. */
  litellmCallId: string | null;
  promptEstimate: number;
  /** Coût de l'invite estimée au prix figé (µCAD) : ce que la reprise facture à une requête perdue. */
  recoveryCostMicro: bigint;
  recoveryUpstreamCostUsdNano: bigint;
  priceInputMicro: bigint;
  priceOutputMicro: bigint;
  priceCacheMicro: bigint | null;
  priceCacheWriteMicro: bigint | null;
  priceWindow: string | null;
  fxUsdToCadMicro: bigint | null;
}

/**
 * Écrit l'intention « pending » d'une requête. À appeler dans la MÊME transaction que la réservation, avant l'appel
 * amont. Idempotent par identifiant de requête.
 */
export async function recordIntent(
  exec: Executor,
  input: IntentInput,
): Promise<void> {
  await exec
    .insert(usageIntents)
    .values({ ...input, status: "pending" })
    .onConflictDoNothing({ target: usageIntents.requestId });
}

/** Marque l'intention d'une requête comme réglée (dans la transaction du règlement). Sans effet si elle n'est plus en attente. */
export async function resolveIntent(
  exec: Executor,
  requestId: string,
): Promise<void> {
  await exec
    .update(usageIntents)
    .set({ status: "settled", resolvedAt: sql`now()` })
    .where(
      sql`${usageIntents.requestId} = ${requestId} AND ${usageIntents.status} = 'pending'`,
    );
}

export interface FindingInput {
  /** Clé d'idempotence : rejouer le même constat met la ligne à jour au lieu d'en créer une autre. */
  dedupeKey: string;
  kind: FindingKind;
  runId?: string | null;
  organizationId?: string | null;
  requestId?: string | null;
  generationId?: string | null;
  litellmCallId?: string | null;
  provider?: string | null;
  model?: string | null;
  /** Jour UTC AAAA-MM-JJ. */
  day?: string | null;
  expectedUsdNano?: bigint | null;
  actualUsdNano?: bigint | null;
  deltaUsdNano?: bigint | null;
  deltaPct?: number | null;
  detail?: Record<string, unknown>;
}

/**
 * Consigne un écart. Idempotent par `dedupeKey` : un second constat met à jour les montants et le détail, jamais le
 * statut de révision ni la date de première constatation.
 */
export async function recordFinding(
  exec: Executor,
  f: FindingInput,
): Promise<void> {
  const values = {
    dedupeKey: f.dedupeKey,
    kind: f.kind,
    runId: f.runId ?? null,
    organizationId: f.organizationId ?? null,
    requestId: f.requestId ?? null,
    generationId: f.generationId ?? null,
    litellmCallId: f.litellmCallId ?? null,
    provider: f.provider ?? null,
    model: f.model ?? null,
    day: f.day ?? null,
    expectedUsdNano: f.expectedUsdNano ?? null,
    actualUsdNano: f.actualUsdNano ?? null,
    deltaUsdNano: f.deltaUsdNano ?? null,
    deltaPct:
      f.deltaPct === null || f.deltaPct === undefined
        ? null
        : f.deltaPct.toFixed(4),
    detail: f.detail ?? {},
  };
  const { dedupeKey: _key, kind: _kind, ...updatable } = values;
  await exec.insert(reconciliationFindings).values(values).onConflictDoUpdate({
    target: reconciliationFindings.dedupeKey,
    set: updatable,
  });
}

/** L'intention d'une requête, ou undefined. */
export async function getIntent(exec: Executor, requestId: string) {
  const [row] = await exec
    .select()
    .from(usageIntents)
    .where(eq(usageIntents.requestId, requestId));
  return row;
}
