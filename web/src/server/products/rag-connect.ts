/**
 * Extraits de connexion au RAG géré, à copier dans Nexora Code, un bot ou un autre outil. Fonction pure : la clé n'est
 * connue qu'à la création (elle n'est jamais relisible), donc sans clé les extraits portent un espace réservé.
 *
 * - `code` : configuration MCP distante de Nexora Code (fork d'OpenCode : clé `mcp`, serveur `type: "remote"`). Le chantier
 *   Nexora Code confirme ou remplace ce format à sa sortie (voir `docs/panneau-mes-outils.md`).
 * - `mcp` : configuration générique `mcpServers` à transport HTTP (Claude Code, Codex et la plupart des clients MCP).
 * - `http` : appel REST `POST …/bases/{id}/query` du RAG.
 */
export interface RagSnippetInput {
  apiUrl: string;
  mcpUrl: string;
  /** Clé fraîchement créée, ou null (espace réservé). */
  key: string | null;
  /** Base visée par l'appel HTTP, ou null (espace réservé). */
  baseId: string | null;
  placeholders: { key: string; baseId: string; question: string };
}

/** Échappe une valeur pour un mot entre apostrophes d'un shell (la clé n'en contient pas, mais on ne le suppose pas). */
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export function buildRagSnippets(input: RagSnippetInput): {
  code: string;
  mcp: string;
  http: string;
} {
  const key = input.key ?? input.placeholders.key;
  const baseId = input.baseId ?? input.placeholders.baseId;
  const authorization = `Bearer ${key}`;
  const code = JSON.stringify(
    {
      mcp: {
        "nexora-rag": {
          type: "remote",
          url: input.mcpUrl,
          headers: { Authorization: authorization },
          enabled: true,
        },
      },
    },
    null,
    2,
  );
  const mcp = JSON.stringify(
    {
      mcpServers: {
        "nexora-rag": {
          type: "http",
          url: input.mcpUrl,
          headers: { Authorization: authorization },
        },
      },
    },
    null,
    2,
  );
  const body = JSON.stringify({ query: input.placeholders.question }, null, 1)
    .replace(/\n\s*/g, " ")
    .replace(/^\{ /, "{ ")
    .replace(/ \}$/, " }");
  const http = [
    `curl -X POST ${shellQuote(`${input.apiUrl}/bases/${baseId}/query`)} \\`,
    `  -H ${shellQuote(`Authorization: ${authorization}`)} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d ${shellQuote(body)}`,
  ].join("\n");
  return { code, mcp, http };
}
