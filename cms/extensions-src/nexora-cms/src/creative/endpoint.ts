// Endpoint /nexora-creative : relais du module « Nexora Creative » vers l'API d'administration de l'app.
// Réservé aux administrateurs Directus. Ne persiste rien ; seul « méthode chemin : statut » est journalisé.

import { defineEndpoint } from "@directus/extensions-sdk";
import { createRelayHandler } from "../admin-relay/relay";
import { CREATIVE_RELAY } from "./contract";

export default defineEndpoint({
  id: "nexora-creative",
  handler: (router, { env, logger }) => {
    router.use(
      createRelayHandler(
        "nexora-creative",
        CREATIVE_RELAY,
        env,
        logger,
      ) as never,
    );
  },
});
