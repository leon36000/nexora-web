import { type RelayConfig, relay, UUID } from "../admin-relay/relay";

// Contrat du module « Agents du site » : ${NEXORA_APP_INTERNAL_URL}/api/admin/site-agents/*.
// Liste fermée : tout le reste est refusé (404), y compris le Coffre, le catalogue et les autres routes d'administration.
const AGENT = "(redacteur|traducteur|seo|veille|sante)";

export const AGENTS_RELAY: RelayConfig = {
  codePrefix: "AGENTS",
  apiPath: "/api/admin/site-agents",
  queryKeys: ["agent", "limit"],
  allowed: [
    ["GET", /^$/],
    ["GET", /^runs$/],
    ["GET", new RegExp(`^runs/${UUID}$`)],
    ["POST", /^credit$/],
    ["PATCH", new RegExp(`^${AGENT}$`)],
    ["POST", new RegExp(`^${AGENT}/(run|stop|gateway-key)$`)],
  ],
};

export const relayToAgents = (
  input: Parameters<typeof relay>[1],
  deps: Parameters<typeof relay>[2],
) => relay(AGENTS_RELAY, input, deps);
