import { randomBytes, randomUUID } from "node:crypto";
import {
  and,
  asc,
  type Database,
  desc,
  eq,
  ilike,
  PROMO_DURATIONS,
  PROMO_KINDS,
  PROMO_SCOPES,
  type PromoStatus,
  promoCodes,
  promoRedemptions,
  sql,
} from "@nexora/db";
import { z } from "zod";
import { auditPayment } from "./settings";

export type PromoRow = typeof promoCodes.$inferSelect;

export type PromoErrorCode =
  | "duplicate"
  | "not_found"
  | "invalid"
  | "batch_too_large";

export class PromoError extends Error {
  readonly code: PromoErrorCode;
  readonly issues?: string[];
  constructor(code: PromoErrorCode, message: string, issues?: string[]) {
    super(message);
    this.name = "PromoError";
    this.code = code;
    this.issues = issues;
  }
}

const CODE_PATTERN = /^[A-Z0-9-]{3,40}$/;

/**
 * Code tel que saisi par le client -> forme canonique (majuscules, sans espaces), ou `null` s'il ne peut pas
 * exister. Stripe n'accepte que lettres, chiffres et tirets : nous nous y limitons.
 */
export function normalizeCode(raw: string): string | null {
  const code = raw.replace(/\s+/g, "").toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

const optionalInt = (min: number, max: number) =>
  z.number().int().min(min).max(max).nullish();

/** Définition d'un code, telle que saisie dans l'admin. Aucun identifiant Stripe : le serveur les écrit. */
export const promoInputSchema = z
  .object({
    code: z.string().min(1).max(80),
    label: z.string().max(120).optional(),
    kind: z.enum(PROMO_KINDS),
    percentOff: optionalInt(1, 100),
    amountOffCents: optionalInt(1, 100_000_000),
    trialDays: optionalInt(1, 365),
    scopes: z.array(z.enum(PROMO_SCOPES)).min(1).max(3),
    duration: z.enum(PROMO_DURATIONS).default("once"),
    durationMonths: optionalInt(1, 36),
    maxRedemptions: optionalInt(1, 1_000_000),
    expiresAt: z.string().datetime().nullish(),
    firstOrderOnly: z.boolean().default(false),
    onePerCustomer: z.boolean().default(false),
    minAmountCents: optionalInt(1, 100_000_000),
  })
  .strict()
  .superRefine((v, ctx) => {
    const bad = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const only = (...allowed: Array<keyof typeof v>) => {
      for (const f of ["percentOff", "amountOffCents", "trialDays"] as const)
        if (v[f] != null && !allowed.includes(f))
          bad(f, "valeur étrangère à ce type de code");
    };
    if (new Set(v.scopes).size !== v.scopes.length) bad("scopes", "portée répétée");
    switch (v.kind) {
      case "percent":
        if (v.percentOff == null) bad("percentOff", "pourcentage requis");
        only("percentOff");
        break;
      case "amount":
        if (v.amountOffCents == null) bad("amountOffCents", "montant requis");
        only("amountOffCents");
        break;
      case "trial":
        if (v.trialDays == null) bad("trialDays", "durée d'essai requise");
        only("trialDays");
        if (v.scopes.some((s) => s !== "subscriptions"))
          bad("scopes", "un code d'essai ne vise que les abonnements");
        break;
      case "free":
      case "staff":
        only();
        break;
    }
    if (v.duration === "repeating" && v.durationMonths == null)
      bad("durationMonths", "nombre de mois requis");
    // Un achat de crédits dont le rabais couvre tout n'accorderait rien : refusé dès la définition.
    if (
      v.scopes.includes("credits") &&
      (v.kind === "free" || (v.kind === "percent" && v.percentOff === 100))
    )
      bad("scopes", "un rabais de 100 % ne peut pas viser les crédits (utilisez un code du personnel)");
  });
export type PromoInput = z.input<typeof promoInputSchema>;

function parseInput(input: unknown) {
  const parsed = promoInputSchema.safeParse(input);
  if (!parsed.success)
    throw new PromoError(
      "invalid",
      "Définition de code invalide.",
      parsed.error.issues.map((i) => `${i.path.join(".") || "code"} : ${i.message}`),
    );
  const code = normalizeCode(parsed.data.code);
  if (!code)
    throw new PromoError(
      "invalid",
      "Définition de code invalide.",
      ["code : 3 à 40 caractères, lettres, chiffres et tirets seulement"],
    );
  return { ...parsed.data, code };
}

function toValues(v: ReturnType<typeof parseInput>, createdBy: string) {
  return {
    code: v.code,
    label: v.label ?? "",
    kind: v.kind,
    percentOff: v.kind === "free" ? null : (v.percentOff ?? null),
    amountOffCents: v.amountOffCents ?? null,
    trialDays: v.trialDays ?? null,
    scopes: [...v.scopes],
    duration: v.duration,
    durationMonths: v.duration === "repeating" ? (v.durationMonths ?? null) : null,
    maxRedemptions: v.maxRedemptions ?? null,
    expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
    firstOrderOnly: v.firstOrderOnly,
    onePerCustomer: v.onePerCustomer,
    minAmountCents: v.minAmountCents ?? null,
    createdBy,
  };
}

const pgCode = (e: unknown): string | undefined => {
  const x = e as { code?: unknown; cause?: { code?: unknown } } | null;
  return String(x?.code ?? x?.cause?.code ?? "") || undefined;
};

export async function createPromo(
  db: Database,
  input: unknown,
  actor: string,
): Promise<PromoRow> {
  const v = parseInput(input);
  try {
    const [row] = await db.insert(promoCodes).values(toValues(v, actor)).returning();
    if (!row) throw new Error("code promo non créé");
    await auditPayment(db, {
      actor,
      action: "promo.create",
      subject: row.code,
      detail: { kind: row.kind, scopes: row.scopes },
    });
    return row;
  } catch (e) {
    if (pgCode(e) === "23505")
      throw new PromoError("duplicate", `Le code « ${v.code} » existe déjà.`);
    throw e;
  }
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 signes, sans I, O, 0, 1 (ambigus)
const MAX_BATCH = 5000;

export interface BatchSpec {
  prefix?: string;
  count: number;
  length: number;
}

/** Codes uniques `PREFIXE-XXXXXXXX` (aléatoire cryptographique, 32 signes : biais nul). */
export function generateCodes(spec: BatchSpec): string[] {
  const prefix = (spec.prefix ?? "").toUpperCase();
  if (!/^[A-Z0-9]{0,12}$/.test(prefix))
    throw new PromoError("invalid", "Préfixe : 12 lettres ou chiffres au plus.");
  if (!Number.isInteger(spec.count) || spec.count < 1 || spec.count > MAX_BATCH)
    throw new PromoError("batch_too_large", `Un lot compte de 1 à ${MAX_BATCH} codes.`);
  if (!Number.isInteger(spec.length) || spec.length < 4 || spec.length > 24)
    throw new PromoError("invalid", "Longueur : 4 à 24 caractères.");
  const out = new Set<string>();
  let guard = 0;
  while (out.size < spec.count) {
    if (++guard > spec.count * 20)
      throw new PromoError("invalid", "Longueur trop courte pour ce nombre de codes.");
    const bytes = randomBytes(spec.length);
    let body = "";
    for (const b of bytes) body += ALPHABET[b & 31];
    out.add(prefix ? `${prefix}-${body}` : body);
  }
  return [...out];
}

export interface BatchInput extends BatchSpec {
  definition: Omit<PromoInput, "code">;
}

/** Génère un lot de codes à usage défini (souvent `maxRedemptions: 1`). Tout ou rien. */
export async function createPromoBatch(
  db: Database,
  input: BatchInput,
  actor: string,
): Promise<{ batchId: string; codes: string[] }> {
  const batchId = randomUUID();
  // Valide la définition une fois (avec un code factice) avant de générer.
  parseInput({ ...input.definition, code: "VALIDATION" });
  const created = await db.transaction(async (tx) => {
    const done: string[] = [];
    for (let round = 0; round < 6 && done.length < input.count; round++) {
      const missing = input.count - done.length;
      const codes = generateCodes({ prefix: input.prefix, count: missing, length: input.length });
      const rows = codes.map((code) => ({
        ...toValues(parseInput({ ...input.definition, code }), actor),
        batchId,
      }));
      const inserted = await tx
        .insert(promoCodes)
        .values(rows)
        .onConflictDoNothing({ target: promoCodes.code })
        .returning({ code: promoCodes.code });
      done.push(...inserted.map((r) => r.code));
    }
    if (done.length < input.count)
      throw new PromoError("invalid", "Impossible de générer assez de codes uniques : allongez-les.");
    await auditPayment(tx, {
      actor,
      action: "promo.batch",
      subject: batchId,
      detail: { count: done.length, prefix: input.prefix ?? "", length: input.length },
    });
    return done;
  });
  return { batchId, codes: created };
}

export async function setPromoStatus(
  db: Database,
  id: string,
  status: PromoStatus,
  actor: string,
): Promise<PromoRow> {
  const [row] = await db
    .update(promoCodes)
    .set({ status, updatedAt: new Date() })
    .where(eq(promoCodes.id, id))
    .returning();
  if (!row) throw new PromoError("not_found", "Code introuvable.");
  await auditPayment(db, {
    actor,
    action: status === "disabled" ? "promo.disable" : "promo.enable",
    subject: row.code,
  });
  return row;
}

export const disablePromo = (db: Database, id: string, actor: string) =>
  setPromoStatus(db, id, "disabled", actor);

export interface PromoListItem extends PromoRow {
  redemptions: number;
  discountCents: number;
}

/** Codes avec leurs statistiques d'utilisation (nombre d'utilisations et rabais total accordé). */
export async function listPromos(
  db: Database,
  filter: { q?: string; status?: PromoStatus; batchId?: string; limit?: number; offset?: number },
): Promise<{ items: PromoListItem[]; total: number }> {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const where = and(
    filter.q ? ilike(promoCodes.code, `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
    filter.status ? eq(promoCodes.status, filter.status) : undefined,
    filter.batchId ? eq(promoCodes.batchId, filter.batchId) : undefined,
  );
  const stats = db
    .select({
      promoCodeId: promoRedemptions.promoCodeId,
      n: sql<number>`count(*)::int`.as("n"),
      cents: sql<number>`coalesce(sum(${promoRedemptions.discountCents}), 0)::int`.as("cents"),
    })
    .from(promoRedemptions)
    .groupBy(promoRedemptions.promoCodeId)
    .as("stats");
  const rows = await db
    .select({
      promo: promoCodes,
      n: sql<number>`coalesce(${stats.n}, 0)`,
      cents: sql<number>`coalesce(${stats.cents}, 0)`,
    })
    .from(promoCodes)
    .leftJoin(stats, eq(stats.promoCodeId, promoCodes.id))
    .where(where)
    .orderBy(desc(promoCodes.createdAt), asc(promoCodes.code))
    .limit(limit)
    .offset(filter.offset ?? 0);
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(promoCodes)
    .where(where);
  return {
    items: rows.map((r) => ({
      ...r.promo,
      redemptions: Number(r.n),
      discountCents: Number(r.cents),
    })),
    total,
  };
}
