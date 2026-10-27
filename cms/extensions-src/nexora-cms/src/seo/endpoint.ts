// Endpoint /nexora-seo : relais du module « SEO » vers l'API d'administration du SEO de l'app (S8).
// Réservé aux administrateurs Directus. Ne persiste rien ; seul « méthode chemin : statut » est journalisé.

import { defineEndpoint } from "@directus/extensions-sdk";
import { createRelayHandler } from "../admin-relay/relay";
import { SEO_RELAY } from "./contract";

export default defineEndpoint({
  id: "nexora-seo",
  handler: (router, { env, logger }) => {
    router.use(
      createRelayHandler("nexora-seo", SEO_RELAY, env, logger) as never,
    );
  },
});
