import { publishPlanDeps } from "@/server/billing/deps";
import { handlePublishPlan } from "@/server/stripe/admin-publish";

export const dynamic = "force-dynamic";

// Contrat (consommé par l'administration) :
//   POST { code } + Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN>
//   → 200 { code, stripeProductId, stripePriceId, productCreated, priceCreated, previousPriceArchived, appliedAt }
//   · 401 · 404 plan non publié · 422 corps ou prix invalide · 502 Stripe indisponible
export async function POST(request: Request) {
  return handlePublishPlan(request, publishPlanDeps());
}
