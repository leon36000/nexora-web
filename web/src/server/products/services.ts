import "server-only";
import { SITE_URL } from "@/lib/site";
import { listBases } from "../rag/bases";
import { ragDeps } from "../rag/deps";
import type { CodeWorkspaceService } from "./code-workspace";
import type { RagPanelService } from "./rag-panel";
import { createRagPanelService } from "./rag-service";

/**
 * POINT DE BRANCHEMENT des chantiers B (RAG) et C (Nexora Code hébergé) sur le panneau « Mes outils ».
 *
 * - **RAG (B, fusionné)** : branché sur `server/rag` (`listBases`) ; il ne s'affiche que si `NEXORA_PRODUCT_RAG` est allumé.
 *   « Créer mon RAG » appelle `POST /api/account/rag` du chantier B.
 * - **Nexora Code (C)** : `null` tant que le chantier n'est pas fusionné. Avec l'interrupteur éteint la page dit « Bientôt » ;
 *   allumé sans service, elle dit « indisponible » (jamais de faux contenu). À la fusion : renvoyer ici l'implémentation de
 *   `CodeWorkspaceService`, puis allumer `NEXORA_PRODUCT_CODE=1` et passer la fiche `code` à « disponible »
 *   (`docs/panneau-mes-outils.md`).
 *
 * Import statique, pas de registre mutable : les routes et les pages sont des paquets séparés du serveur, un service
 * enregistré dans l'un ne serait pas visible dans l'autre.
 */
export function getRagPanelService(): RagPanelService {
  return createRagPanelService({
    list: (orgId) => listBases(ragDeps(), orgId),
    siteUrl: SITE_URL,
  });
}

export function getCodeWorkspaceService(): CodeWorkspaceService | null {
  return null;
}
