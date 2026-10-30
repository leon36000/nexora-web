/**
 * Interface entre le panneau « Mes outils » et le RAG géré (chantier B : `packages/rag`, `web/src/server/rag`,
 * `/v1/rag`, `/api/account/rag`). La page ne connaît que cette interface : elle est testée avec un faux
 * (`test-support.ts`) ; l'implémentation réelle est `createRagPanelService` (`rag-service.ts`).
 *
 * La CRÉATION n'est pas dans l'interface : « Créer mon RAG » appelle `POST /api/account/rag { name }` du chantier B,
 * qui crée la base et sa clé dédiée (valeur montrée une seule fois). Voir `docs/rag.md` §1.
 */

export interface RagBaseSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  documents: number;
  /** Documents en attente d'indexation. */
  pending: number;
  /** Documents dont l'indexation a échoué. */
  failed: number;
  /** Espace occupé par la base (documents et vecteurs), en octets. */
  usedBytes: number;
}

export interface RagConnectionInfo {
  /** Adresse publique du site (`SITE_URL`) : base des extraits à copier. */
  siteUrl: string;
  /** Racine de l'API HTTP du RAG (par exemple `https://…/v1/rag`). */
  apiUrl: string;
  /** Adresse du serveur MCP (par exemple `https://…/v1/rag/mcp`). */
  mcpUrl: string;
}

export interface RagPanelService {
  /** Bases de l'organisation, de la plus récente à la plus ancienne. */
  listBases(orgId: string): Promise<RagBaseSummary[]>;
  /** Adresses à donner à un bot, à Nexora Code ou à un autre outil. */
  connection(): RagConnectionInfo;
}

const norm = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Premier nom libre : « Mon RAG », « Mon RAG 2 », « Mon RAG 3 »… (comparaison sans casse). */
export function defaultBaseName(
  base: string,
  taken: readonly string[],
): string {
  const used = new Set(taken.map(norm));
  if (!used.has(norm(base))) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(norm(candidate))) return candidate;
  }
}

export type RagPanelModel =
  | { kind: "soon" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | {
      kind: "ready";
      bases: RagBaseSummary[];
      totalBytes: number;
      connection: RagConnectionInfo;
      defaultName: string;
    };

/**
 * État de la page RAG. `enabled` : interrupteur `NEXORA_PRODUCT_RAG` ; éteint, la page dit « Bientôt » et le service
 * n'est jamais appelé. Allumé sans service branché : « indisponible » (jamais de liste inventée). Une erreur du service
 * devient l'état d'erreur : son message n'atteint pas la page.
 */
export async function loadRagPanel(input: {
  enabled: boolean;
  service: RagPanelService | null;
  orgId: string;
  defaultNameBase: string;
}): Promise<RagPanelModel> {
  if (!input.enabled) return { kind: "soon" };
  if (!input.service) return { kind: "unavailable" };
  try {
    const bases = await input.service.listBases(input.orgId);
    return {
      kind: "ready",
      bases,
      totalBytes: bases.reduce((sum, b) => sum + b.usedBytes, 0),
      connection: input.service.connection(),
      defaultName: defaultBaseName(
        input.defaultNameBase,
        bases.map((b) => b.name),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}
