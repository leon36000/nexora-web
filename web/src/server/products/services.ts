import "server-only";
import type { CodeWorkspaceService } from "./code-workspace";
import type { RagPanelService } from "./rag-panel";

/**
 * POINT DE BRANCHEMENT des chantiers B (RAG) et C (Nexora Code hébergé) sur le panneau « Mes outils ».
 *
 * Tant que les chantiers ne sont pas fusionnés, les deux fonctions rendent `null` : avec l'interrupteur éteint la page
 * dit « Bientôt » ; allumé sans service, elle dit « indisponible » (jamais de faux contenu). À la fusion :
 *
 * - **RAG (B)** : importer `createRagPanelService` (qui implémente `RagPanelService` à partir de `listBases`,
 *   `createBaseWithKey` et de l'adresse publique du site) et le renvoyer ici, puis allumer `NEXORA_PRODUCT_RAG=1`.
 * - **Nexora Code (C)** : importer l'implémentation de `CodeWorkspaceService` (pilote d'approvisionnement) et la renvoyer
 *   ici, puis allumer `NEXORA_PRODUCT_CODE=1`. Passer aussi l'état de la fiche Nexora Apps `code` / `rag` à « disponible »
 *   dans `i18n/apps.ts` (voir `docs/panneau-mes-outils.md`).
 *
 * Import statique, pas de registre mutable : les routes et les pages sont des paquets séparés du serveur, un service
 * enregistré dans l'un ne serait pas visible dans l'autre.
 */
export function getRagPanelService(): RagPanelService | null {
  return null;
}

export function getCodeWorkspaceService(): CodeWorkspaceService | null {
  return null;
}
