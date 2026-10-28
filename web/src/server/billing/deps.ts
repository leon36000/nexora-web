import "server-only";
import type Stripe from "stripe";
import { getAccountDictionary } from "@/i18n/account";
import { SITE_URL } from "@/lib/site";
import { getAuth } from "../auth/instance";
import { getDb } from "../db";
import { loadBillingConfig } from "../ledger/config";
import { log } from "../log";
import { resolveSessionPromotion } from "../payments/session-promotion";
import { isLiveAllowed } from "../payments/settings";
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
import { stripeTrialInspector } from "./trial-guard";

const secretDeps = () => ({
  env: process.env,
  getSecret: (ref: string) => getSecret(ref),
  // Une clé de production n'est acceptée que si le fondateur a autorisé les paiements réels (module Paiements).
  liveAllowed: () => isLiveAllowed(getDb()),
});

const cache: { client?: Stripe; key?: string; at?: number } = {};

/**
 * Client Stripe (mode test par défaut ; production seulement avec l'autorisation explicite du fondateur).
 * Le secret est relu du coffre au plus toutes les 60 s.
 */
export async function getStripe(): Promise<Stripe> {
  const now = Date.now();
  if (cache.client && cache.at && now - cache.at < 60_000) return cache.client;
  const config = await resolveStripeConfig(secretDeps());
  const cacheKey = `${config.secretKey}|${config.allowLive ? "live" : "test"}`;
  if (cache.client && cache.key === cacheKey) {
    cache.at = now;
    return cache.client;
  }
  cache.client = createStripeClient(config);
  cache.key = cacheKey;
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
    liveAllowed: () => isLiveAllowed(getDb()),
    process: {
      db: getDb(),
      plans: lazyPlanSource(() => planSourceFromEnv()),
      config: loadBillingConfig(),
      log,
      resolveSessionPromotion: async (sessionId) =>
        resolveSessionPromotion(await getStripe(), sessionId),
      // Un essai gratuit par carte et par courriel : lecture et résiliation chez Stripe (voir trial-guard.ts).
      trials: {
        inspect: async (id) =>
          stripeTrialInspector(await getStripe()).inspect(id),
        cancel: async (id) =>
          stripeTrialInspector(await getStripe()).cancel(id),
      },
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
