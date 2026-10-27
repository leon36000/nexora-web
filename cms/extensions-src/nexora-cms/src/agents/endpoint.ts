// Endpoint /nexora-agents : relais du module « Agents du site » vers l'API d'administration des agents de l'app (D9, D14).
// Réservé aux administrateurs Directus. Ne persiste rien ; seul « méthode chemin : statut » est journalisé.

import { defineEndpoint } from "@directus/extensions-sdk";
import { createRelayHandler } from "../admin-relay/relay";
import { AGENTS_RELAY } from "./contract";

export default defineEndpoint({
  id: "nexora-agents",
  handler: (router, { env, logger }) => {
    router.use(
      createRelayHandler("nexora-agents", AGENTS_RELAY, env, logger) as never,
    );
  },
});
