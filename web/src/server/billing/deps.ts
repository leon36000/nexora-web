import "server-only";
import type Stripe from "stripe";
import { getAccountDictionary } from "@/i18n/account";
import { SITE_URL } from "@/lib/site";
import { getAuth } from "../auth/instance";
import { getDb } from "../db";
import { loadBillingConfig } from "../ledger/config";
import { log } from "../log";
import type { PublishPlanRouteDeps } from "../stripe/admin-publish";
import {
  createStripeClient,
  resolveStripeConfig,
  resolveWebhookSecret,
} from "../stripe/client";
import type { WebhookRouteDeps } from "../stripe/webhook-route";
import { getSecret } from "../vault";
import type { BillingHttpDeps } from "./http";
import { lazyPlanSource, planSourceFromEnv } from "./plans";

const secretDeps = () => ({
  env: process.env,
  getSecret: (ref: string) => getSecret(ref),
});

const cache: { client?: Stripe; key?: string; at?: number } = {};

/** Client Stripe (mode test seulement). Le secret est relu du coffre au plus toutes les 60 s. */
export async function getStripe(): Promise<Stripe> {
  const now = Date.now();
  if (cache.client && cache.at && now - cache.at < 60_000) return cache.client;
  const config = await resolveStripeConfig(secretDeps());
  if (cache.client && cache.key === config.secretKey) {
    cache.at = now;
    return cache.client;
  }
  cache.client = createStripeClient(config);
  cache.key = config.secretKey;
  cache.at = now;
  return cache.client;
}

/** Dépendances de production des routes de facturation, lues dans l'environnement à chaque requête. */
export function billingHttpDeps(): BillingHttpDeps {
  return {
    db: getDb(),
    getSession: async (headers) => {
      const session = await getAuth().api.getSession({ headers });
      if (!session) return null;
      return {
        userId: session.user.id,
        email: session.user.email,
        activeOrganizationId:
          (session.session as { activeOrganizationId?: string | null })
            .activeOrganizationId ?? null,
      };
    },
    stripe: getStripe,
    plans: () => lazyPlanSource(() => planSourceFromEnv()),
    config: loadBillingConfig(),
    siteUrl: SITE_URL,
    productName: (lang) => getAccountDictionary(lang).dashboard.buy.productName,
    log,
  };
}

export function webhookRouteDeps(): WebhookRouteDeps {
  return {
    webhookSecret: () => resolveWebhookSecret(secretDeps()),
    process: {
      db: getDb(),
      plans: lazyPlanSource(() => planSourceFromEnv()),
      config: loadBillingConfig(),
      log,
    },
    log,
  };
}

export function publishPlanDeps(): PublishPlanRouteDeps {
  return {
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    plans: lazyPlanSource(() => planSourceFromEnv()),
    stripe: getStripe,
    log,
  };
}
