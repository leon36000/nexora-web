// Endpoint /nexora-hosted-agents : relais du module « Agents hébergés » vers l'API d'administration de l'app (D14).
// Réservé aux administrateurs Directus. Ne persiste rien ; seul « méthode chemin : statut » est journalisé.

import { defineEndpoint } from "@directus/extensions-sdk";
import { createRelayHandler } from "../admin-relay/relay";
import { HOSTED_AGENTS_RELAY } from "./contract";

export default defineEndpoint({
  id: "nexora-hosted-agents",
  handler: (router, { env, logger }) => {
    router.use(
      createRelayHandler(
        "nexora-hosted-agents",
        HOSTED_AGENTS_RELAY,
        env,
        logger,
      ) as never,
    );
  },
});
