import "server-only";
import { createWorkspaceDriver, resolveCodeHosting } from "@nexora/code";
import { SITE_URL } from "@/lib/site";
import { recordStorageUsageIn } from "../billing/entitlements";
import { getDb } from "../db";
import { log } from "../log";
import { loadKeyring } from "../vault/crypto";
import {
  createWorkspaceService,
  type WorkspaceService,
} from "./workspace-service";

let warned = false;

/**
 * Service de l'environnement hébergé de production, construit depuis l'environnement (`NEXORA_CODE_DRIVER`,
 * `NEXORA_CODE_IMAGE`… voir `docs/nexora-code.md`). `null` si le pilote n'est pas configuré ou si ses réglages sont
 * invalides (le panneau dit alors « indisponible » ; un seul avertissement nomme le réglage fautif, jamais sa valeur).
 */
export function codeWorkspaceServiceFromEnv(
  env: Record<string, string | undefined> = process.env,
): WorkspaceService | null {
  const resolved = resolveCodeHosting(env, SITE_URL);
  if (!resolved.ok) {
    if (resolved.reason === "invalid" && !warned) {
      warned = true;
      log.warn("Nexora Code hébergé : réglages invalides", {
        problem: resolved.problem,
      });
    }
    return null;
  }
  return createWorkspaceService({
    db: getDb,
    keyring: () => loadKeyring(env),
    driver: createWorkspaceDriver(resolved.config, (line) => log.info(line)),
    config: resolved.config,
    siteUrl: SITE_URL,
    now: () => new Date(),
    log,
    record: (orgId, delta) =>
      recordStorageUsageIn(getDb(), orgId, "code", delta),
    installCommand: env.NEXORA_CODE_INSTALL_COMMAND?.trim() || null,
  });
}
