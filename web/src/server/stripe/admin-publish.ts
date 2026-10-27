import type { Logger } from "@nexora/log";
import type Stripe from "stripe";
import { z } from "zod";
import { checkAdminAuth } from "../auth";
import type { PlanSource } from "../billing/plans";
import { PublishPlanError, publishPlanToStripe } from "./publish-plan";

export interface PublishPlanRouteDeps {
  adminToken: string | undefined;
  plans: PlanSource;
  stripe: () => Promise<Pick<Stripe, "products" | "prices">>;
  log: Logger;
}

const NO_STORE = { "cache-control": "no-store" };
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

const bodySchema = z.object({ code: z.string().min(1).max(100) }).strict();

/**
 * POST /api/admin/stripe/publish-plan { code } — « Publier vers Stripe » (D3). Authentifié par
 * `Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN>`. Lit le plan PUBLIÉ dans Directus, crée ou met à
 * jour le produit et le prix Stripe (mode test), et renvoie leurs identifiants : l'administrateur
 * les écrit ensuite dans la fiche Directus du plan (`stripe_product_id`, `stripe_price_id`).
 */
export async function handlePublishPlan(
  request: Request,
  deps: PublishPlanRouteDeps,
): Promise<Response> {
  const auth = checkAdminAuth(request, deps.adminToken);
  if (auth === "not_configured")
    return json({ error: "admin_not_configured" }, 503);
  if (auth === "unauthorized")
    return json({ error: "unauthorized" }, 401, {
      "www-authenticate": 'Bearer realm="nexora-admin"',
    });

  let parsed: z.infer<typeof bodySchema>;
  try {
    const result = bodySchema.safeParse(await request.json());
    if (!result.success) return json({ error: "invalid_request" }, 422);
    parsed = result.data;
  } catch {
    return json({ error: "invalid_json" }, 422);
  }

  try {
    const plan = await deps.plans.getByCode(parsed.code);
    if (!plan) return json({ error: "plan_not_found" }, 404);
    const result = await publishPlanToStripe(await deps.stripe(), plan);
    deps.log.info("stripe : plan publié", {
      code: plan.code,
      productCreated: result.productCreated,
      priceCreated: result.priceCreated,
    });
    return json({
      code: plan.code,
      ...result,
      appliedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof PublishPlanError)
      return json({ error: "invalid_plan", detail: error.message }, 422);
    deps.log.error("stripe : échec de la publication d'un plan", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "stripe_unavailable" }, 502);
  }
}
