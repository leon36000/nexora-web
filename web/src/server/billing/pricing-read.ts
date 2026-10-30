import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { PLANS_TAG } from "../cms/tags";
import { type CreditPack, packsFromEnv } from "./credit-packs";
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
    // `expire` d'au moins 5 minutes : une entrée plus courte ne peut pas être préparée au rendu statique (Next échoue
    // sur « cache miss » au préchauffage). Le rafraîchissement en arrière-plan toutes les 10 s reprend la lecture.
    cacheLife({ stale: 10, revalidate: 10, expire: 600 });
    return { status: "unavailable", plans: [] };
  }
}

export interface PublicPacks {
  status: "ready" | "empty" | "unavailable";
  packs: CreditPack[];
}

/** Forfaits de recharge PUBLIÉS (même étiquette de cache que les offres : une modification rafraîchit la page Tarifs). */
export async function getPublicPacks(): Promise<PublicPacks> {
  "use cache";
  cacheTag(PLANS_TAG);
  try {
    const packs = await packsFromEnv().listPublished();
    cacheLife({ stale: 30, revalidate: 60, expire: 3_600 });
    return { status: packs.length > 0 ? "ready" : "empty", packs };
  } catch {
    cacheLife({ stale: 10, revalidate: 10, expire: 600 });
    return { status: "unavailable", packs: [] };
  }
}
