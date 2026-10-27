import { type RelayConfig, relay, UUID } from "../admin-relay/relay";

// Contrat du module « SEO » : ${NEXORA_APP_INTERNAL_URL}/api/admin/seo/*. Liste fermée.
const ADAPTER = "(indexnow|bing|searchconsole|dataforseo|postiz)";

export const SEO_RELAY: RelayConfig = {
  codePrefix: "SEO",
  apiPath: "/api/admin/seo",
  queryKeys: ["limit", "status", "kind", "severity"],
  allowed: [
    ["GET", /^$/],
    ["GET", /^(audits|issues|indexing)$/],
    ["GET", new RegExp(`^audits/${UUID}$`)],
    ["POST", /^audits$/],
    ["PATCH", new RegExp(`^issues/${UUID}$`)],
    ["POST", /^indexing\/run$/],
    ["PATCH", new RegExp(`^adapters/${ADAPTER}$`)],
    ["POST", new RegExp(`^adapters/${ADAPTER}/check$`)],
  ],
};

export const relayToSeo = (
  input: Parameters<typeof relay>[1],
  deps: Parameters<typeof relay>[2],
) => relay(SEO_RELAY, input, deps);
