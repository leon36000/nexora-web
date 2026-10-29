import {
  and,
  type Database,
  desc,
  eq,
  inArray,
  WEBPILOT_UNITS,
  type WebpilotUnit,
  webpilotPriceItems,
  webpilotPriceSheets,
} from "@nexora/db";
import { currentFx } from "../gateway/catalog";
import { sellFromMargin } from "../gateway/pricing";

/**
 * Feuille de prix de WebPilot, paramétrée par le fondateur (aucun prix dans le code). Une feuille est un ensemble de
 * prix par unité, versionné et immuable (déclencheur SQL) : changer un prix = publier une nouvelle feuille, qui entre
 * en vigueur à sa date. Garde de marge à la publication : aucune unité n'est vendue sous son coût amont converti en CAD
 * (taux approuvé) majoré du plancher de marge de la feuille.
 */

export type PriceErrorCode =
  | "invalid_request"
  | "margin_floor"
  | "fx_missing"
  | "not_found"
  | "not_a_draft";

export class WebpilotPriceError extends Error {
  readonly code: PriceErrorCode;
  constructor(code: PriceErrorCode, message: string) {
    super(message);
    this.name = "WebpilotPriceError";
    this.code = code;
  }
}

export interface UnitPriceInput {
  /** Prix de vente en micro-CAD. */
  sellCadMicro: bigint;
  /** Coût amont en micro-USD (0 si inconnu : la garde de marge ne peut alors rien vérifier pour cette unité). */
  upstreamUsdMicro: bigint;
}

export interface SheetInput {
  prices: Partial<Record<WebpilotUnit, UnitPriceInput>>;
  status: "draft" | "published";
  effectiveAt?: Date;
  marginFloorBps?: number;
  note?: string;
  createdBy?: string | null;
}

/** Problèmes de marge d'une feuille (vide = valide). Exige un taux de change approuvé dès qu'un coût amont est donné. */
export async function marginProblems(
  db: Database,
  prices: SheetInput["prices"],
  floorBps: number,
  at: Date,
): Promise<string[]> {
  const withCost = Object.entries(prices).filter(
    ([, p]) => p && p.upstreamUsdMicro > 0n,
  );
  if (withCost.length === 0) return [];
  const fx = await currentFx(db, at);
  if (!fx)
    throw new WebpilotPriceError(
      "fx_missing",
      "aucun taux de change approuvé : impossible de vérifier la marge d'un coût amont",
    );
  const problems: string[] = [];
  for (const [unit, p] of withCost) {
    if (!p) continue;
    const minimum = sellFromMargin(
      p.upstreamUsdMicro,
      fx.usdToCadMicro,
      floorBps,
    );
    if (p.sellCadMicro < minimum)
      problems.push(
        `${unit} : prix de vente ${p.sellCadMicro} micro-CAD sous le minimum ${minimum} (coût amont converti + plancher de ${floorBps} points de base)`,
      );
  }
  return problems;
}

function validate(input: SheetInput): void {
  const units = Object.keys(input.prices);
  if (units.length === 0)
    throw new WebpilotPriceError(
      "invalid_request",
      "au moins un prix est requis",
    );
  for (const [unit, p] of Object.entries(input.prices)) {
    if (!(WEBPILOT_UNITS as readonly string[]).includes(unit))
      throw new WebpilotPriceError(
        "invalid_request",
        `unité inconnue : ${unit}`,
      );
    if (!p || p.sellCadMicro < 0n || p.upstreamUsdMicro < 0n)
      throw new WebpilotPriceError(
        "invalid_request",
        `${unit} : montants ≥ 0 attendus`,
      );
  }
  const floor = input.marginFloorBps ?? 0;
  if (!Number.isInteger(floor) || floor < 0 || floor > 100_000)
    throw new WebpilotPriceError(
      "invalid_request",
      "plancher de marge invalide",
    );
}

/** Crée une feuille (brouillon, ou publiée si la garde de marge passe). Renvoie son identifiant et sa version. */
export async function createSheet(
  db: Database,
  input: SheetInput,
  now: Date = new Date(),
) {
  validate(input);
  const floor = input.marginFloorBps ?? 0;
  const effectiveAt = input.effectiveAt ?? now;
  if (input.status === "published") {
    const problems = await marginProblems(db, input.prices, floor, effectiveAt);
    if (problems.length > 0)
      throw new WebpilotPriceError("margin_floor", problems.join(" ; "));
  }
  return db.transaction(async (tx) => {
    const [sheet] = await tx
      .insert(webpilotPriceSheets)
      .values({
        effectiveAt,
        marginFloorBps: floor,
        note: input.note ?? "",
        createdBy: input.createdBy ?? null,
      })
      .returning();
    if (!sheet) throw new Error("feuille non créée");
    for (const [unit, p] of Object.entries(input.prices))
      if (p)
        await tx.insert(webpilotPriceItems).values({
          sheetId: sheet.id,
          unit: unit as WebpilotUnit,
          sellCadMicro: p.sellCadMicro,
          upstreamUsdMicro: p.upstreamUsdMicro,
        });
    if (input.status === "published") {
      const [done] = await tx
        .update(webpilotPriceSheets)
        .set({ status: "published", publishedAt: now })
        .where(eq(webpilotPriceSheets.id, sheet.id))
        .returning();
      return done ?? sheet;
    }
    return sheet;
  });
}

/** Publie un brouillon (la date d'entrée en vigueur peut être fixée à ce moment) après la garde de marge. */
export async function publishDraft(
  db: Database,
  sheetId: string,
  options: { effectiveAt?: Date; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const [sheet] = await db
    .select()
    .from(webpilotPriceSheets)
    .where(eq(webpilotPriceSheets.id, sheetId));
  if (!sheet) throw new WebpilotPriceError("not_found", "feuille introuvable");
  if (sheet.status !== "draft")
    throw new WebpilotPriceError(
      "not_a_draft",
      "cette feuille est déjà publiée",
    );
  const items = await db
    .select()
    .from(webpilotPriceItems)
    .where(eq(webpilotPriceItems.sheetId, sheetId));
  const prices: SheetInput["prices"] = {};
  for (const i of items)
    prices[i.unit] = {
      sellCadMicro: i.sellCadMicro,
      upstreamUsdMicro: i.upstreamUsdMicro,
    };
  const effectiveAt = options.effectiveAt ?? sheet.effectiveAt;
  const problems = await marginProblems(
    db,
    prices,
    sheet.marginFloorBps,
    effectiveAt,
  );
  if (problems.length > 0)
    throw new WebpilotPriceError("margin_floor", problems.join(" ; "));
  const [done] = await db
    .update(webpilotPriceSheets)
    .set({ status: "published", publishedAt: now, effectiveAt })
    .where(
      and(
        eq(webpilotPriceSheets.id, sheetId),
        eq(webpilotPriceSheets.status, "draft"),
      ),
    )
    .returning();
  if (!done)
    throw new WebpilotPriceError(
      "not_a_draft",
      "cette feuille est déjà publiée",
    );
  return done;
}

export interface SheetView {
  id: string;
  version: number;
  status: "draft" | "published";
  effectiveAt: string;
  publishedAt: string | null;
  marginFloorBps: number;
  note: string;
  createdBy: string | null;
  createdAt: string;
  /** Montants en chaînes décimales (micro-unités). */
  prices: Partial<
    Record<WebpilotUnit, { sellCadMicro: string; upstreamUsdMicro: string }>
  >;
}

/** Feuilles les plus récentes d'abord, avec leurs prix ; `current` : celle qui s'applique à `now`. */
export async function listSheets(
  db: Database,
  now: Date = new Date(),
  limit = 50,
): Promise<{ current: SheetView | null; sheets: SheetView[] }> {
  const rows = await db
    .select()
    .from(webpilotPriceSheets)
    .orderBy(desc(webpilotPriceSheets.version))
    .limit(limit);
  const items = rows.length
    ? await db
        .select()
        .from(webpilotPriceItems)
        .where(
          inArray(
            webpilotPriceItems.sheetId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  const sheets: SheetView[] = rows.map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status,
    effectiveAt: r.effectiveAt.toISOString(),
    publishedAt: r.publishedAt?.toISOString() ?? null,
    marginFloorBps: r.marginFloorBps,
    note: r.note,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    prices: Object.fromEntries(
      items
        .filter((i) => i.sheetId === r.id)
        .map((i) => [
          i.unit,
          {
            sellCadMicro: i.sellCadMicro.toString(),
            upstreamUsdMicro: i.upstreamUsdMicro.toString(),
          },
        ]),
    ),
  }));
  const current =
    sheets
      .filter((s) => s.status === "published" && new Date(s.effectiveAt) <= now)
      .sort(
        (a, b) =>
          b.effectiveAt.localeCompare(a.effectiveAt) || b.version - a.version,
      )[0] ?? null;
  return { current, sheets };
}
