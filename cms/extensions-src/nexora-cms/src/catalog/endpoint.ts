// Endpoint /nexora-catalog : relais du module « Modèles » vers l'API d'administration du catalogue de l'app (D14).
// Réservé aux administrateurs Directus. Ne persiste rien (aucune collection, activité ni révision) ; seul le
// couple « méthode chemin : statut » est journalisé, jamais un corps de requête.

import { defineEndpoint } from "@directus/extensions-sdk";
import { createRelayHandler } from "../admin-relay/relay";
import { CATALOG_RELAY } from "./contract";

export default defineEndpoint({
  id: "nexora-catalog",
  handler: (router, { env, logger }) => {
    router.use(
      createRelayHandler("nexora-catalog", CATALOG_RELAY, env, logger) as never,
    );
  },
});
