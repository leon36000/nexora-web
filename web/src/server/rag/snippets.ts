/**
 * Configurations « à copier » pour brancher une base RAG : serveur MCP (agents de code, bots, clients MCP), appel direct
 * à l'API et variables d'environnement. La clé n'y figure que si l'appelant la fournit (à la création, une seule fois) ;
 * sinon un exemple lisible la remplace.
 */
export const KEY_PLACEHOLDER = "nxk_votre_cle";

export function connectionSnippets(input: {
  siteUrl: string;
  baseName: string;
  baseId: string;
  key?: string;
}) {
  const site = input.siteUrl.replace(/\/+$/, "");
  const api = `${site}/v1/rag`;
  const mcpUrl = `${api}/mcp`;
  const key = input.key ?? KEY_PLACEHOLDER;
  const auth = { Authorization: `Bearer ${key}` };
  return {
    /** Format `.mcp.json` (Claude Code et la plupart des clients MCP) : serveur distant en HTTP. */
    mcp: {
      mcpServers: {
        "nexora-rag": { type: "http" as const, url: mcpUrl, headers: auth },
      },
    },
    /** Format de configuration d'OpenCode, repris par Nexora Code : serveur MCP distant. */
    nexoraCode: {
      mcp: {
        "nexora-rag": {
          type: "remote" as const,
          url: mcpUrl,
          headers: auth,
          enabled: true,
        },
      },
    },
    curl: `curl ${api}/bases/${input.baseId}/query \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"query": "votre question", "top_k": 5}'`,
    env: `NEXORA_RAG_URL=${api}\nNEXORA_RAG_API_KEY=${key}\nNEXORA_RAG_BASE_ID=${input.baseId}`,
  };
}
