import type { BaseView } from "../rag/bases";
import type { RagBaseSummary, RagPanelService } from "./rag-panel";

/**
 * Adaptateur du RAG managé (chantier B, `web/src/server/rag/`) vers l'interface `RagPanelService` du panneau. Pur : la
 * lecture des bases est injectée (`list`), le branchement de production est dans `services.ts`.
 */
export function toRagSummary(b: BaseView): RagBaseSummary {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    createdAt: b.createdAt,
    documents: b.stats.documents,
    pending: b.stats.pending,
    failed: b.stats.failed,
    usedBytes: b.stats.bytes,
  };
}

export function createRagPanelService(input: {
  list: (orgId: string) => Promise<BaseView[]>;
  siteUrl: string;
}): RagPanelService {
  const site = input.siteUrl.replace(/\/+$/, "");
  return {
    listBases: async (orgId) => (await input.list(orgId)).map(toRagSummary),
    connection: () => ({
      siteUrl: site,
      apiUrl: `${site}/v1/rag`,
      mcpUrl: `${site}/v1/rag/mcp`,
    }),
  };
}
