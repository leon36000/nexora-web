import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { PLANS_TAG } from "../cms/tags";
import { planSourceFromEnv, type SubscriptionPlan } from "./plans";

export interface PublicPlans {
  /** `unavailable` : Directus illisible ou non configuré (la page le dit, sans inventer d'offre). */
  status: "ready" | "empty" | "unavailable";
  plans: SubscriptionPlan[];
}

/**
 * Offres d'abonnement PUBLIÉES pour la page Tarifs (filtre `status = published` appliqué deux fois, voir plans.ts).
 * Lecture en cache avec l'étiquette `subscription-plans`, rafraîchie à la publication et de toute façon sous la minute.
 */
export async function getPublicPlans(): Promise<PublicPlans> {
  "use cache";
  cacheTag(PLANS_TAG);
  try {
    const plans = await planSourceFromEnv().listPublished();
    cacheLife({ stale: 30, revalidate: 60, expire: 3_600 });
    return { status: plans.length > 0 ? "ready" : "empty", plans };
  } catch {
    cacheLife({ stale: 5, revalidate: 10, expire: 60 });
    return { status: "unavailable", plans: [] };
  }
}
