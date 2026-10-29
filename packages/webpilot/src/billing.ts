import {
  and,
  apiKeys,
  type Database,
  desc,
  type Executor,
  eq,
  lte,
  releaseReservation,
  reserve,
  settleReservation,
  type UsageStatus,
  usageEvents,
  WEBPILOT_UNITS,
  type WebpilotUnit,
  webpilotPriceItems,
  webpilotPriceSheets,
} from "@nexora/db";

/**
 * Facturation de WebPilot sur le grand livre de la passerelle (mêmes clés, même solde, mêmes écritures).
 * Réserver le coût maximal -> exécuter -> régler au coût réel, règlement et événement d'usage dans UNE transaction.
 *
 * Les prix sont ceux de la feuille publiée en vigueur ; AUCUN prix par défaut n'existe dans le code. Sans feuille
 * (ou sans prix pour l'unité), une organisation cliente reçoit 503 `webpilot_unavailable` ; l'organisation « maison »
 * fonctionne sans facturation (la valeur offerte est comptée quand un prix existe).
 */

export interface Prices {
  sheetId: string;
  version: number;
  /** Version de configuration écrite au grand livre et dans l'événement d'usage. */
  configVersion: string;
  /** Prix par unité ; une unité absente n'est pas vendue. */
  units: Partial<
    Record<WebpilotUnit, { sellCadMicro: bigint; upstreamUsdMicro: bigint }>
  >;
}

export const UNPRICED_VERSION = "webpilot_unpriced";

/** Feuille publiée en vigueur à `at` (la plus récente), ou null si aucune n'est publiée. */
export async function activePrices(
  db: Executor,
  at: Date,
): Promise<Prices | null> {
  const [sheet] = await db
    .select()
    .from(webpilotPriceSheets)
    .where(
      and(
        eq(webpilotPriceSheets.status, "published"),
        lte(webpilotPriceSheets.effectiveAt, at),
      ),
    )
    .orderBy(
      desc(webpilotPriceSheets.effectiveAt),
      desc(webpilotPriceSheets.version),
    )
    .limit(1);
  if (!sheet) return null;
  const items = await db
    .select()
    .from(webpilotPriceItems)
    .where(eq(webpilotPriceItems.sheetId, sheet.id));
  const units: Prices["units"] = {};
  for (const item of items)
    if ((WEBPILOT_UNITS as readonly string[]).includes(item.unit))
      units[item.unit] = {
        sellCadMicro: item.sellCadMicro,
        upstreamUsdMicro: item.upstreamUsdMicro,
      };
  return {
    sheetId: sheet.id,
    version: sheet.version,
    configVersion: `webpilot_prices_v${sheet.version}`,
    units,
  };
}

export interface Units {
  pageStatic: number;
  pageBrowser: number;
  browserMinute: number;
}
export const NO_UNITS: Units = {
  pageStatic: 0,
  pageBrowser: 0,
  browserMinute: 0,
};

const UNIT_KEY: Record<keyof Units, WebpilotUnit> = {
  pageStatic: "page_static",
  pageBrowser: "page_browser",
  browserMinute: "browser_minute",
};

/** Unités du lot pour lesquelles la feuille n'a pas de prix. */
export function unpricedUnits(
  units: Units,
  prices: Prices | null,
): WebpilotUnit[] {
  const missing: WebpilotUnit[] = [];
  for (const key of Object.keys(UNIT_KEY) as (keyof Units)[])
    if (units[key] > 0 && !prices?.units[UNIT_KEY[key]])
      missing.push(UNIT_KEY[key]);
  return missing;
}

/** Prix de vente (micro-CAD) de ces unités. Une unité sans prix compte pour 0 : l'appelant a vérifié avant. */
export function sellCost(units: Units, prices: Prices | null): bigint {
  let total = 0n;
  for (const key of Object.keys(UNIT_KEY) as (keyof Units)[])
    total +=
      BigInt(units[key]) * (prices?.units[UNIT_KEY[key]]?.sellCadMicro ?? 0n);
  return total;
}
/** Coût amont (micro-USD) de ces unités. */
export function upstreamCost(units: Units, prices: Prices | null): bigint {
  let total = 0n;
  for (const key of Object.keys(UNIT_KEY) as (keyof Units)[])
    total +=
      BigInt(units[key]) *
      (prices?.units[UNIT_KEY[key]]?.upstreamUsdMicro ?? 0n);
  return total;
}

export type Reservation =
  | { ok: true; reservationId: string | null; amountMicro: bigint }
  | { ok: false; reason: "insufficient" | "blocked" | "key_cap" };

/** Réserve `amountMicro` ; un montant nul ne réserve rien. `house` : jamais de réservation. */
export async function reserveWebpilot(
  db: Database,
  input: {
    organizationId: string;
    apiKeyId: string;
    idempotencyKey: string;
    amountMicro: bigint;
    configVersion: string;
    house: boolean;
  },
): Promise<Reservation> {
  if (input.house || input.amountMicro <= 0n)
    return { ok: true, reservationId: null, amountMicro: 0n };
  const result = await reserve(db, {
    organizationId: input.organizationId,
    amountMicro: input.amountMicro,
    idempotencyKey: input.idempotencyKey,
    configVersion: input.configVersion,
    apiKeyId: input.apiKeyId,
  });
  switch (result.status) {
    case "key_cap_exceeded":
      return { ok: false, reason: "key_cap" };
    case "blocked":
      return { ok: false, reason: "blocked" };
    case "insufficient_funds":
      return { ok: false, reason: "insufficient" };
    default:
      return {
        ok: true,
        reservationId: result.reservation.id,
        amountMicro: input.amountMicro,
      };
  }
}

export type Operation = "search" | "scrape" | "crawl" | "extract" | "session";

export interface EventInput {
  requestId: string;
  organizationId: string;
  apiKeyId: string;
  operation: Operation;
  configVersion: string;
  status: UsageStatus;
  httpStatus: number;
  errorCode?: string | null;
  units: Units;
  /** Montant débité (0 pour une organisation « maison » ou une erreur). */
  chargedMicro: bigint;
  /** Valeur au prix public (organisation « maison » : ce qu'une organisation ordinaire aurait payé). */
  valueMicro: bigint;
  upstreamUsdMicro: bigint;
  billed: boolean;
  /** Hôte visité : jamais l'adresse complète (décision O-6). */
  destinationHost?: string | null;
  privacy?: { decision: string; policyVersion: string } | null;
  reservationId: string | null;
  latencyMs: number;
}

/** Écrit l'événement d'usage (métadonnées seulement), idempotent par `requestId`. Renvoie faux si déjà écrit. */
export async function writeEvent(
  tx: Executor,
  e: EventInput,
): Promise<boolean> {
  const [inserted] = await tx
    .insert(usageEvents)
    .values({
      requestId: e.requestId,
      organizationId: e.organizationId,
      apiKeyId: e.apiKeyId,
      modelPublicId: `webpilot/${e.operation}`,
      endpoint: `webpilot.${e.operation}`,
      configVersion: e.configVersion,
      status: e.status,
      httpStatus: e.httpStatus,
      errorCode: e.errorCode ?? null,
      costMicro: e.chargedMicro,
      valueMicro: e.valueMicro,
      billed: e.billed,
      upstreamCostUsdMicro: e.upstreamUsdMicro,
      unitsPageStatic: e.units.pageStatic,
      unitsPageBrowser: e.units.pageBrowser,
      unitsBrowserMinute: e.units.browserMinute,
      destinationHost: e.destinationHost ?? null,
      privacyDecision: e.privacy?.decision ?? null,
      policyVersion: e.privacy?.policyVersion ?? null,
      latencyMs: e.latencyMs,
      reservationId: e.reservationId,
    })
    .onConflictDoNothing({ target: usageEvents.requestId })
    .returning({ id: usageEvents.id });
  if (inserted)
    await tx
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, e.apiKeyId));
  return Boolean(inserted);
}

export interface FinalizeInput {
  requestId: string;
  organizationId: string;
  apiKeyId: string;
  operation: Operation;
  prices: Prices | null;
  status: UsageStatus;
  httpStatus: number;
  errorCode?: string | null;
  /** Unités livrées ; ignorées (0) si le statut est « error » : une erreur avant livraison ne coûte rien. */
  units: Units;
  reservationId: string | null;
  house: boolean;
  destinationHost?: string | null;
  privacy?: { decision: string; policyVersion: string } | null;
  latencyMs: number;
}

/** Règle la réservation au coût réel et écrit l'événement d'usage dans UNE transaction ; idempotent. */
export async function finalizeWebpilot(
  db: Database,
  input: FinalizeInput,
): Promise<{ costMicro: bigint; replayed: boolean }> {
  const failed = input.status === "error";
  const units = failed ? { ...NO_UNITS } : input.units;
  const value = sellCost(units, input.prices);
  const upstream = upstreamCost(units, input.prices);
  const configVersion = input.prices?.configVersion ?? UNPRICED_VERSION;
  return db.transaction(async (tx) => {
    let charged = 0n;
    if (!input.house && input.reservationId) {
      if (failed) {
        await releaseReservation(tx, {
          organizationId: input.organizationId,
          reservationId: input.reservationId,
        });
      } else {
        const settled = await settleReservation(tx, {
          organizationId: input.organizationId,
          reservationId: input.reservationId,
          actualMicro: value,
        });
        charged = settled.chargedMicro;
      }
    } else if (!input.house) charged = value;
    const inserted = await writeEvent(tx, {
      requestId: input.requestId,
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId,
      operation: input.operation,
      configVersion,
      status: input.status,
      httpStatus: input.httpStatus,
      errorCode: input.errorCode,
      units,
      chargedMicro: input.house ? 0n : charged,
      valueMicro: input.house ? value : charged,
      upstreamUsdMicro: upstream,
      billed: !input.house,
      destinationHost: input.destinationHost,
      privacy: input.privacy,
      reservationId: input.house ? null : input.reservationId,
      latencyMs: input.latencyMs,
    });
    return { costMicro: input.house ? 0n : charged, replayed: !inserted };
  });
}
