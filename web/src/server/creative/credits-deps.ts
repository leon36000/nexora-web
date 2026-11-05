import "server-only";
import { releaseReservation, reserve, settleReservation } from "@nexora/db";
import { authenticateApiKey } from "../gateway/keys";
import { consumeRateLimit } from "../billing/rate-limit";
import { getDb } from "../db";
import { configVersion, loadBillingConfig } from "../ledger/config";
import { log } from "../log";
import type { CreativeCreditsDeps } from "./credits";

/** Dépendances réelles de l'API crédits, fondées sur la clé d'organisation `nxk_`. */
export function creativeCreditsDeps(): CreativeCreditsDeps {
  return {
    db: getDb,
    now: () => new Date(),
    configVersion: () => configVersion(loadBillingConfig()),
    serviceToken: process.env.NEXORA_CREATIVE_SERVICE_TOKEN,
    log,
    authenticate: authenticateApiKey,
    rateLimit: consumeRateLimit,
    reserve,
    settle: settleReservation,
    release: releaseReservation,
  };
}
