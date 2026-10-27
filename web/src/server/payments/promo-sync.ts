import { createHash } from "node:crypto";
import {
  and,
  type Database,
  eq,
  isNotNull,
  type PromoScope,
  paymentSettings,
  promoCodes,
  promoRedemptions,
  sql,
  vpsPlans,
} from "@nexora/db";
import type Stripe from "stripe";
import type { PlanSource } from "../billing/plans";
import type { PromoRow } from "./promo";
import { auditPayment, getSettings } from "./settings";

/** Produits Stripe par portée : servent à limiter un coupon aux achats de sa portée. */
export type ScopeProducts = Record<PromoScope, string[]>;

export type SyncOutcome =
  | { state: "synced" | "unchanged" | "updated" | "recreated" | "skipped" }
  | { state: "error"; code: "no_products" | "stripe_error"; message: string };

export interface SyncDeps {
  db: Database;
  stripe: Pick<Stripe, "coupons" | "promotionCodes">;
  products: () => Promise<ScopeProducts>;
  now: () => Date;
}

const errorType = (e: unknown): string =>
  typeof e === "object" && e && "type" in e
    ? String((e as { type: unknown }).type)
    : "unknown";

/** Produits de chaque portée : offres publiées vers Stripe, plans VPS publiés vers Stripe, produits « Crédits ». */
export async function scopeProductsFrom(
  db: Database,
  plans: PlanSource,
): Promise<ScopeProducts> {
  const settings = await getSettings(db);
  const sub = new Set<string>();
  try {
    for (const p of await plans.listPublished())
      if (p.stripeProductId) sub.add(p.stripeProductId);
  } catch {
    // Directus injoignable : la portée « abonnements » n'a alors aucun produit connu (erreur lisible plus loin).
  }
  const vps = await db
    .select({ id: vpsPlans.stripeProductId })
    .from(vpsPlans)
    .where(isNotNull(vpsPlans.stripeProductId));
  return {
    subscriptions: [...sub].sort(),
    vps: [...new Set(vps.map((r) => r.id as string))].sort(),
    credits: [settings.creditsProductFrId, settings.creditsProductEnId].filter(
      (x): x is string => Boolean(x),
    ),
  };
}

/**
 * Produits Stripe « Crédits » (un par langue, créés une seule fois) : le Checkout des crédits les référence,
 * ce qui permet à un coupon de ne viser que les crédits. Idempotent.
 */
export async function ensureCreditsProducts(
  db: Database,
  stripe: Pick<Stripe, "products">,
): Promise<[string, string]> {
  const s = await getSettings(db);
  let fr = s.creditsProductFrId;
  let en = s.creditsProductEnId;
  if (!fr)
    fr = (
      await stripe.products.create(
        {
          name: "Crédits Nexora AI",
          metadata: { nexora_kind: "credits", lang: "fr" },
        },
        { idempotencyKey: "credits-product:fr" },
      )
    ).id;
  if (!en)
    en = (
      await stripe.products.create(
        {
          name: "Nexora AI credits",
          metadata: { nexora_kind: "credits", lang: "en" },
        },
        { idempotencyKey: "credits-product:en" },
      )
    ).id;
  if (fr !== s.creditsProductFrId || en !== s.creditsProductEnId)
    await db.update(paymentSettings).set({
      creditsProductFrId: fr,
      creditsProductEnId: en,
      updatedAt: new Date(),
    });
  return [fr, en];
}

function couponParams(
  promo: PromoRow,
  appliesTo: string[] | null,
): Stripe.CouponCreateParams {
  return {
    name: (promo.label || promo.code).slice(0, 40),
    ...(promo.kind === "amount"
      ? { amount_off: promo.amountOffCents as number, currency: "cad" }
      : {
          percent_off:
            promo.kind === "free" ? 100 : (promo.percentOff as number),
        }),
    duration: promo.duration,
    ...(promo.duration === "repeating"
      ? { duration_in_months: promo.durationMonths as number }
      : {}),
    ...(appliesTo ? { applies_to: { products: appliesTo } } : {}),
    metadata: { promo_code_id: promo.id },
  };
}

function restrictions(
  promo: PromoRow,
): Stripe.PromotionCodeCreateParams.Restrictions | undefined {
  const r: Stripe.PromotionCodeCreateParams.Restrictions = {};
  if (promo.firstOrderOnly) r.first_time_transaction = true;
  if (promo.minAmountCents != null) {
    r.minimum_amount = promo.minAmountCents;
    r.minimum_amount_currency = "cad";
  }
  return Object.keys(r).length ? r : undefined;
}

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);

/**
 * Synchronise UN code avec Stripe (coupon + code de promotion). Jamais appelée par Directus : le serveur de
 * l'app seul parle à Stripe. Les codes du personnel et d'essai n'existent pas chez Stripe.
 */
export async function syncPromo(
  deps: SyncDeps,
  promo: PromoRow,
): Promise<SyncOutcome> {
  if (promo.kind === "staff" || promo.kind === "trial")
    return { state: "skipped" };
  const record = async (set: Partial<typeof promoCodes.$inferInsert>) =>
    deps.db
      .update(promoCodes)
      .set({ ...set, updatedAt: deps.now() })
      .where(eq(promoCodes.id, promo.id));

  const scopeProducts = await deps.products();
  const everywhere = promo.scopes.length === 3;
  let appliesTo: string[] | null = null;
  if (!everywhere) {
    const lacking = (promo.scopes as PromoScope[]).filter(
      (s) => scopeProducts[s].length === 0,
    );
    if (lacking.length > 0) {
      const message = `Aucun produit Stripe pour la portée (${lacking.join(", ")}) : lancez d'abord « Publier vers Stripe » pour les offres concernées, puis resynchronisez.`;
      await record({ stripeSyncError: message });
      return { state: "error", code: "no_products", message };
    }
    appliesTo = [
      ...new Set(
        (promo.scopes as PromoScope[]).flatMap((s) => scopeProducts[s]),
      ),
    ].sort();
  }
  const fp = fingerprint({
    coupon: couponParams(promo, appliesTo),
    code: promo.code,
    expires: promo.expiresAt?.toISOString() ?? null,
    max: promo.maxRedemptions,
    restrictions: restrictions(promo) ?? null,
  });
  const wantActive = promo.status === "active";

  try {
    // Déjà synchronisé et identique : seul le statut peut avoir changé.
    if (promo.stripePromotionCodeId && promo.stripeFingerprint === fp) {
      const current = await deps.stripe.promotionCodes.retrieve(
        promo.stripePromotionCodeId,
      );
      if (current.active === wantActive) {
        if (promo.stripeSyncError) await record({ stripeSyncError: null });
        return { state: "unchanged" };
      }
      await deps.stripe.promotionCodes.update(promo.stripePromotionCodeId, {
        active: wantActive,
      });
      await record({ stripeSyncedAt: deps.now(), stripeSyncError: null });
      return { state: "updated" };
    }

    let recreated = false;
    if (promo.stripePromotionCodeId) {
      // Définition changée (produits de la portée) : l'ancien code de promotion est désactivé.
      await deps.stripe.promotionCodes.update(promo.stripePromotionCodeId, {
        active: false,
      });
      recreated = true;
    }
    const [{ used } = { used: 0 }] = await deps.db
      .select({ used: sql<number>`count(*)::int` })
      .from(promoRedemptions)
      .where(eq(promoRedemptions.promoCodeId, promo.id));
    let remaining: number | undefined;
    if (promo.maxRedemptions != null) {
      remaining = promo.maxRedemptions - used;
      if (remaining <= 0) {
        await record({ stripeSyncError: null });
        return { state: "unchanged" };
      }
    }
    const coupon = await deps.stripe.coupons.create(
      couponParams(promo, appliesTo),
      {
        idempotencyKey: `promo-coupon:${promo.id}:${fp}`,
      },
    );
    const r = restrictions(promo);
    const code = await deps.stripe.promotionCodes.create(
      {
        promotion: { type: "coupon", coupon: coupon.id },
        code: promo.code,
        active: wantActive,
        ...(remaining != null ? { max_redemptions: remaining } : {}),
        ...(promo.expiresAt
          ? { expires_at: Math.floor(promo.expiresAt.getTime() / 1000) }
          : {}),
        ...(r ? { restrictions: r } : {}),
        metadata: { promo_code_id: promo.id },
      },
      { idempotencyKey: `promo-code:${promo.id}:${fp}` },
    );
    await record({
      stripeCouponId: coupon.id,
      stripePromotionCodeId: code.id,
      stripeFingerprint: fp,
      stripeSyncedAt: deps.now(),
      stripeSyncError: null,
    });
    await auditPayment(deps.db, {
      actor: "system",
      action: recreated ? "promo.stripe_recreated" : "promo.stripe_synced",
      subject: promo.code,
    });
    return { state: recreated ? "recreated" : "synced" };
  } catch (e) {
    const message = `Stripe a refusé la synchronisation (${errorType(e)}).`;
    await record({ stripeSyncError: message });
    return { state: "error", code: "stripe_error", message };
  }
}

export interface SyncReport {
  synced: number;
  skipped: number;
  errors: number;
}

/** Synchronise tous les codes qui en ont besoin (nouveaux, ou dont la portée a changé). */
export async function syncAllPromos(deps: SyncDeps): Promise<SyncReport> {
  const rows = await deps.db
    .select()
    .from(promoCodes)
    .where(and(eq(promoCodes.status, "active")));
  const report: SyncReport = { synced: 0, skipped: 0, errors: 0 };
  for (const promo of rows) {
    const out = await syncPromo(deps, promo);
    if (out.state === "skipped") report.skipped++;
    else if (out.state === "error") report.errors++;
    else if (out.state !== "unchanged") report.synced++;
  }
  return report;
}
