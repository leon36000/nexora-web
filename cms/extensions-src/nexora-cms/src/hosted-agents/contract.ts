import { type RelayConfig, relay, UUID } from "../admin-relay/relay";

// Contrat du module « Agents hébergés » : ${NEXORA_APP_INTERNAL_URL}/api/admin/hosted-agents/*.
// Liste fermée : tout le reste est refusé (404), y compris le Coffre, le catalogue des modèles et les autres routes
// d'administration. La clé d'espace WorkStudio ne transite JAMAIS ici : elle se colle dans le module Coffre.
export const HOSTED_AGENTS_RELAY: RelayConfig = {
  codePrefix: "HOSTED_AGENTS",
  apiPath: "/api/admin/hosted-agents",
  queryKeys: [],
  allowed: [
    ["GET", /^$/],
    ["GET", /^instances$/],
    ["POST", /^instances$/],
    ["GET", new RegExp(`^instances/${UUID}$`)],
    ["PATCH", new RegExp(`^instances/${UUID}$`)],
    ["POST", new RegExp(`^instances/${UUID}/(test|discover)$`)],
    ["GET", /^agents$/],
    ["GET", new RegExp(`^agents/${UUID}$`)],
    ["PATCH", new RegExp(`^agents/${UUID}$`)],
    ["GET", new RegExp(`^agents/${UUID}/prices$`)],
    ["POST", new RegExp(`^agents/${UUID}/prices$`)],
    ["GET", /^embed$/],
    ["PATCH", /^embed$/],
  ],
};

export const relayToHostedAgents = (
  input: Parameters<typeof relay>[1],
  deps: Parameters<typeof relay>[2],
) => relay(HOSTED_AGENTS_RELAY, input, deps);
