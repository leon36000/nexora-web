/**
 * Interface entre le panneau « Mes outils » et le RAG géré (chantier B : `packages/rag`, `web/src/server/rag`,
 * `/v1/rag`). Le panneau ne connaît que cette interface : il est testé avec un faux (`test-support.ts`), et le chantier B
 * la remplit en une fonction (`createRagPanelService`, branchée dans `services.ts`). Contrat complet :
 * `docs/panneau-mes-outils.md`.
 *
 * Correspondance avec le chantier B (au moment de l'écriture) : `listBases` ← `listBases(deps, orgId)` ;
 * `createBaseWithKey` ← `createBaseWithKey(deps, …)` (la base ET sa clé dédiée en une seule transaction ; la valeur de la
 * clé n'existe qu'à cet instant) ; `usedBytes` ← `getOrgEntitlements(orgId).storage.byProduct.rag` réparti, ou la somme
 * des octets de la base.
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
  /** Racine de l'API HTTP du RAG (par exemple `https://…/v1/rag`). */
  apiUrl: string;
  /** Adresse du serveur MCP (par exemple `https://…/v1/rag/mcp`). */
  mcpUrl: string;
}

/**
 * Raisons d'un refus de création, traduites par le panneau (jamais de message du service affiché tel quel) :
 * `quota_exceeded` (espace de l'offre épuisé ou absent), `no_credits`, `base_exists` (nom déjà pris), `base_limit`
 * (nombre maximal de bases), `key_limit` (nombre maximal de clés actives), `unavailable` (service ou catalogue de
 * modèles indisponible).
 */
export type RagCreateFailure =
  | "quota_exceeded"
  | "no_credits"
  | "base_exists"
  | "base_limit"
  | "key_limit"
  | "unavailable";

export type RagCreateResult =
  | {
      ok: true;
      base: RagBaseSummary;
      /** Clé dédiée à cette base. `secret` n'est montré qu'UNE fois : le panneau ne le conserve nulle part. */
      key: { id: string; prefix: string; secret: string };
    }
  | { ok: false; reason: RagCreateFailure };

export interface RagPanelService {
  /** Bases de l'organisation, de la plus récente à la plus ancienne. */
  listBases(orgId: string): Promise<RagBaseSummary[]>;
  /** « Créer mon RAG » en un clic : la base et sa clé d'API dédiée. */
  createBaseWithKey(input: {
    orgId: string;
    userId: string;
    name: string;
  }): Promise<RagCreateResult>;
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
