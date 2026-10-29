// Contrat du module « Modèles » (D14) avec l'API d'administration de l'app : ${NEXORA_APP_INTERNAL_URL}/api/admin/catalog/*.
// Cette extension ne conserve RIEN : elle relaie une liste fermée d'appels (méthode + chemin) avec le jeton
// d'administration de l'app (NEXORA_APP_ADMIN_TOKEN, variable du conteneur Directus), et rend la réponse telle quelle.

import { type RelayConfig, relay, UUID } from "../admin-relay/relay";

/** Liste fermée des appels relayés. Tout le reste est refusé (404), y compris le coffre et les autres routes d'administration. */
export const CATALOG_RELAY: RelayConfig = {
  codePrefix: "CATALOGUE",
  apiPath: "/api/admin/catalog",
  // `days` : période du rapprochement des coûts (GET usage-report).
  queryKeys: ["days"],
  // la synchronisation LiteLLM peut durer : délai généreux
  timeoutMs: 60_000,
  allowed: [
    ["GET", /^$/],
    ["GET", /^(providers|models|fx-rates|versions|usage-report)$/],
    ["POST", /^(providers|models|fx-rates|versions)$/],
    ["GET", new RegExp(`^(providers|models|versions)/${UUID}$`)],
    ["PATCH", new RegExp(`^(providers|models)/${UUID}$`)],
    ["POST", new RegExp(`^providers/${UUID}/test$`)],
    ["GET", new RegExp(`^models/${UUID}/prices$`)],
    ["POST", new RegExp(`^models/${UUID}/prices$`)],
    ["GET", new RegExp(`^models/${UUID}/routes$`)],
    ["POST", new RegExp(`^models/${UUID}/routes$`)],
    ["POST", new RegExp(`^models/${UUID}/routes/reorder$`)],
    ["GET", new RegExp(`^models/${UUID}/readiness$`)],
    ["PATCH", new RegExp(`^routes/${UUID}$`)],
    ["POST", new RegExp(`^fx-rates/${UUID}/approve$`)],
    ["POST", new RegExp(`^versions/${UUID}/(approve|publish)$`)],
    ["POST", /^sync-litellm$/],
  ],
};

export const isAllowed = (method: string, path: string): boolean =>
  CATALOG_RELAY.allowed.some(
    ([m, re]) => m === method.toUpperCase() && re.test(path),
  );

export type { Relayed } from "../admin-relay/relay";

export const relayToCatalog = (
  input: Parameters<typeof relay>[1],
  deps: Parameters<typeof relay>[2],
) => relay(CATALOG_RELAY, input, deps);
