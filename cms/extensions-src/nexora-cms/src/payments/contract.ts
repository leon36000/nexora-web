import { type RelayConfig, relay, UUID } from "../admin-relay/relay";

// Contrat du module « Paiements » : ${NEXORA_APP_INTERNAL_URL}/api/admin/payments/*. Liste fermée : tout le reste est
// refusé (404), y compris le Coffre (la clé Stripe s'y colle, jamais ici), le catalogue des modèles et les autres
// routes d'administration. Directus ne parle JAMAIS à Stripe : tout passe par l'app.
// « Publier vers Stripe » (`plans/publish`) n'est PAS relayé tel quel : l'endpoint le traite lui-même, car il doit aussi
// écrire les identifiants dans la fiche de l'offre (voir publish-plan.ts).
export const PAYMENTS_RELAY: RelayConfig = {
  codePrefix: "PAIEMENTS",
  apiPath: "/api/admin/payments",
  queryKeys: ["q", "status", "batchId", "limit", "offset"],
  allowed: [
    ["GET", /^$/],
    ["POST", /^stripe\/connect$/],
    ["GET", /^settings$/],
    ["PATCH", /^settings$/],
    ["GET", /^promos$/],
    ["POST", /^promos$/],
    ["POST", /^promos\/batch$/],
    ["POST", /^promos\/sync$/],
    ["PATCH", new RegExp(`^promos/${UUID}$`)],
    ["POST", new RegExp(`^promos/${UUID}/sync$`)],
    ["GET", /^staff$/],
    ["POST", /^staff$/],
    ["GET", /^gifts$/],
    ["POST", new RegExp(`^gifts/${UUID}/revoke$`)],
    ["GET", /^audit$/],
  ],
};

export const relayToPayments = (
  input: Parameters<typeof relay>[1],
  deps: Parameters<typeof relay>[2],
) => relay(PAYMENTS_RELAY, input, deps);

/** Le seul appel que l'endpoint fait lui-même (publication d'une offre) : jamais exposé tel quel au navigateur. */
export const PUBLISH_RELAY: RelayConfig = {
  codePrefix: "PAIEMENTS",
  apiPath: "/api/admin/payments",
  queryKeys: [],
  allowed: [["POST", /^plans\/publish$/]],
};
