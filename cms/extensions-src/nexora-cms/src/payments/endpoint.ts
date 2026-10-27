// Endpoint /nexora-payments : relais du module « Paiements » vers l'API d'administration des paiements de l'app, plus
// « Publier vers Stripe » qui écrit les identifiants dans la fiche de l'offre. Réservé aux administrateurs Directus.
// Ne persiste rien d'autre ; seul « méthode chemin : statut » est journalisé, jamais un corps de requête.

import { defineEndpoint } from "@directus/extensions-sdk";
import { createRelayHandler, relay } from "../admin-relay/relay";
import { revalidate } from "../guard/revalidate";
import { PAYMENTS_RELAY, PUBLISH_RELAY } from "./contract";
import { publishPlanFlow } from "./publish-plan";

type Req = {
  accountability?: { user?: string | null; admin?: boolean } | null;
  body?: unknown;
};
type Res = {
  set: (field: string, value: string) => unknown;
  status: (code: number) => { json: (body: unknown) => unknown };
};

const deny = (res: Res, status: number, code: string, message: string) =>
  res.status(status).json({ errors: [{ message, extensions: { code } }] });

export default defineEndpoint({
  id: "nexora-payments",
  handler: (router, context) => {
    const { env, logger, services, getSchema } = context;

    router.post("/plans/publish", async (req: Req, res: Res) => {
      res.set("Cache-Control", "no-store");
      const acct = req.accountability;
      if (!acct?.user)
        return deny(
          res,
          401,
          "INVALID_CREDENTIALS",
          "Authentification requise.",
        );
      if (acct.admin !== true)
        return deny(res, 403, "FORBIDDEN", "Réservé aux administrateurs.");
      const body = (req.body ?? {}) as { id?: unknown };
      const schema = await getSchema();
      const plans = new services.ItemsService("subscription_plans", {
        schema,
        accountability: acct as never,
      });
      const out = await publishPlanFlow(
        {
          items: {
            readOne: async (id) => {
              try {
                return (await plans.readOne(id, {
                  fields: ["code", "status", "price_cents"],
                })) as Record<string, unknown>;
              } catch {
                return null;
              }
            },
            updateOne: async (id, data) => {
              await plans.updateOne(id, data);
            },
          },
          publishToApp: (code) =>
            relay(
              PUBLISH_RELAY,
              { method: "POST", path: "plans/publish", body: { code } },
              { env },
            ),
          revalidate: (id) =>
            revalidate(
              { collection: "subscription_plans", id, slugs: [] },
              { env, logger },
            ),
        },
        body.id,
      );
      logger.info(`[nexora-payments] POST /plans/publish : ${out.status}`);
      return res.status(out.status).json(out.body);
    });

    router.use(
      createRelayHandler(
        "nexora-payments",
        PAYMENTS_RELAY,
        env,
        logger,
      ) as never,
    );
  },
});
