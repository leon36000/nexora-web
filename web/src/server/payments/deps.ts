import "server-only";
import type Stripe from "stripe";
import { getStripe } from "../billing/deps";
import { lazyPlanSource, planSourceFromEnv } from "../billing/plans";
import { getDb } from "../db";
import { loadBillingConfig } from "../ledger/config";
import { log } from "../log";
import { loadKeyring } from "../vault/crypto";
import type { PaymentsAdminDeps } from "./admin-handlers";
import { productionClientFactory } from "./connect";
import { dbVault } from "./vault";

/** Dépendances de production de `/api/admin/payments/*` : lues dans l'environnement à chaque requête. */
export function paymentsAdminDeps(): PaymentsAdminDeps {
  const env = process.env;
  const siteUrl = (env.SITE_URL ?? "http://localhost:3500").replace(/\/+$/, "");
  return {
    db: getDb,
    adminToken: env.NEXORA_APP_ADMIN_TOKEN,
    vault: () => dbVault(getDb(), loadKeyring(env)),
    siteUrl,
    createClient: productionClientFactory(env),
    // Hors production avec le simulateur Stripe : une adresse locale est acceptée (aucun vrai Stripe ne l'appelle).
    allowLocalUrl: env.NODE_ENV !== "production" && Boolean(env.STRIPE_API_BASE_URL),
    stripe: (): Promise<Stripe> => getStripe(),
    plans: () => lazyPlanSource(() => planSourceFromEnv()),
    billingConfig: loadBillingConfig(),
    log,
    now: () => new Date(),
  };
}
