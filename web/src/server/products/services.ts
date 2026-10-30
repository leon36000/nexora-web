import "server-only";
import { SITE_URL } from "@/lib/site";
import { codeWorkspaceServiceFromEnv } from "../code/workspace-deps";
import { listBases } from "../rag/bases";
import { ragDeps } from "../rag/deps";
import type { CodeWorkspaceService } from "./code-workspace";
import type { RagPanelService } from "./rag-panel";
import { createRagPanelService } from "./rag-service";
import { productSwitchOn } from "./registry";

/**
 * POINT DE BRANCHEMENT des chantiers B (RAG) et C (Nexora Code hébergé) sur le panneau « Mes outils ».
 *
 * - **RAG (B, fusionné)** : branché sur `server/rag` (`listBases`) ; il ne s'affiche que si `NEXORA_PRODUCT_RAG` est allumé.
 *   « Créer mon RAG » appelle `POST /api/account/rag` du chantier B.
 * - **Nexora Code (F)** : branché sur `server/code/workspace-service.ts` derrière `NEXORA_PRODUCT_CODE` (éteint : `null` et la
 *   page dit « Bientôt » ; allumé sans pilote configuré : `null` et la page dit « indisponible », jamais de faux contenu).
 *   Pour mettre en service : `NEXORA_CODE_DRIVER`, `NEXORA_CODE_IMAGE`, `NEXORA_PRODUCT_CODE=1`, puis passer la fiche `code` à
 *   « disponible » (`docs/nexora-code.md` « Pour allumer », `docs/panneau-mes-outils.md`).
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
  // Derrière l'interrupteur : éteint, aucun service (la page dit « Bientôt »). Allumé sans pilote configuré
  // (NEXORA_CODE_DRIVER absent ou invalide) : null aussi, la page dit « indisponible ».
  if (!productSwitchOn(process.env.NEXORA_PRODUCT_CODE)) return null;
  return codeWorkspaceServiceFromEnv();
}
