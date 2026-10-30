import "server-only";
import { consumeRateLimit } from "../billing/rate-limit";
import { getDb } from "../db";
import { accountKeysDeps } from "../gateway/deps";
import type { PanelServicesDeps } from "./panel-handlers";
import { productSwitchOn } from "./registry";
import { getCodeWorkspaceService, getRagPanelService } from "./services";

/** Dépendances des routes `/api/account/rag` et `/api/account/code/workspace` : session du compte, limite de débit en base, interrupteurs. */
export async function panelServicesDeps(): Promise<PanelServicesDeps> {
  const base = await accountKeysDeps();
  return {
    siteUrl: base.siteUrl,
    getContext: base.getContext,
    log: base.log,
    rateLimit: (key, options) =>
      consumeRateLimit(getDb(), key, { ...options, now: new Date() }),
    ragEnabled: () => productSwitchOn(process.env.NEXORA_PRODUCT_RAG),
    codeEnabled: () => productSwitchOn(process.env.NEXORA_PRODUCT_CODE),
    rag: getRagPanelService,
    code: getCodeWorkspaceService,
  };
}
