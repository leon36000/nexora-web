import {
  type Database,
  eq,
  vpsPlans,
} from "@nexora/db";
import {
  getPublishedCatalog,
  markCatalogApplied,
  type StripeApplied,
  type VpsCatalogVersion,
} from "@nexora/vps";
import type Stripe from "stripe";
import type { SubscriptionPlan } from "../billing/plans";
import { publishPlanToStripe } from "../stripe/publish-plan";

/**
 * « Publier vers Stripe » pour les plans VPS (D3) : lit la version de catalogue PUBLIÉE, crée ou met
 * à jour le produit et un prix par durée offerte (mensuel, annuel), puis écrit les identifiants sur
 * la version (état « appliqué ») ET sur les fiches de travail. Les commandes n'utilisent que les
 * prix de la version publiée appliquée : jamais un prix Stripe qui ne correspond pas au catalogue.
 * Réutilise `publishPlanToStripe` de S4 (prix hors taxes, idempotent, ancien prix archivé).
 */
export interface VpsStripeSyncResult {
  version: string;
  plans: Record<string, { productId: string; monthly?: string; yearly?: string; created: number }>;
}

export class VpsSyncError extends Error {
  readonly code: "no_published_catalog" | "nothing_to_sync";
  constructor(code: VpsSyncError["code"], message: string) {
    super(message);
    this.name = "VpsSyncError";
    this.code = code;
  }
}

export async function syncVpsCatalogToStripe(
  db: Database,
  stripe: Pick<Stripe, "products" | "prices">,
  now: Date = new Date(),
): Promise<{ version: VpsCatalogVersion; result: VpsStripeSyncResult }> {
  const published = await getPublishedCatalog(db);
  if (!published) throw new VpsSyncError("no_published_catalog", "aucun catalogue VPS publié");
  if (published.snapshot.plans.length === 0)
    throw new VpsSyncError("nothing_to_sync", "aucun plan publié");

  const result: VpsStripeSyncResult = { version: published.short, plans: {} };
  const applied: StripeApplied = { plans: {} };
  try {
    for (const plan of published.snapshot.plans) {
      const [row] = await db.select().from(vpsPlans).where(eq(vpsPlans.id, plan.id));
      let productId = row?.stripeProductId ?? null;
      const entry: { productId: string; monthly?: string; yearly?: string } = { productId: "" };
      let created = 0;
      for (const [interval, cents, known] of [
        ["month", plan.priceMonthlyCents, row?.stripePriceMonthlyId ?? null],
        ["year", plan.priceYearlyCents, row?.stripePriceYearlyId ?? null],
      ] as const) {
        if (cents == null) continue;
        const asSub: SubscriptionPlan = {
          id: plan.id,
          code: `vps-${plan.code}`,
          kind: "vps",
          interval,
          priceCents: cents,
          includedCreditsCents: 0,
          stripeProductId: productId,
          stripePriceId: known,
          translations: {
            "fr-CA": { name: `VPS ${plan.name}`, description: plan.descriptionFr || null, features: [] },
            "en-CA": { name: `VPS ${plan.name}`, description: plan.descriptionEn || null, features: [] },
          },
        };
        const out = await publishPlanToStripe(stripe, asSub);
        productId = out.stripeProductId;
        entry.productId = out.stripeProductId;
        if (interval === "month") entry.monthly = out.stripePriceId;
        else entry.yearly = out.stripePriceId;
        if (out.priceCreated) created++;
      }
      applied.plans[plan.code] = entry;
      result.plans[plan.code] = { ...entry, created };
      await db
        .update(vpsPlans)
        .set({
          stripeProductId: entry.productId,
          stripePriceMonthlyId: entry.monthly ?? null,
          stripePriceYearlyId: entry.yearly ?? null,
          updatedAt: now,
        })
        .where(eq(vpsPlans.id, plan.id));
    }
  } catch (error) {
    await markCatalogApplied(db, published.id, {
      status: "failed",
      detail: { error: error instanceof Error ? error.name : "erreur" },
    }, now);
    throw error;
  }
  await markCatalogApplied(db, published.id, { status: "applied", detail: { stripe: applied } }, now);
  const updated = await getPublishedCatalog(db);
  return { version: updated ?? published, result };
}
