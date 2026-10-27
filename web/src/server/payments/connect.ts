import { type Database, paymentSettings, promoCodes } from "@nexora/db";
import type { Logger } from "@nexora/log";
import Stripe from "stripe";
import { HANDLED_EVENT_TYPES } from "../billing/webhook";
import {
  assertKeyAllowed,
  createStripeClient,
  StripeModeError,
  stripeKeyMode,
} from "../stripe/client";
import { auditPayment, getSettings } from "./settings";
import type { PaymentVault } from "./vault";

export const SECRET_KEY_REF = "stripe.secret_key";
export const WEBHOOK_SECRET_REF = "stripe.webhook_secret";
/** Exactement les types d'événements que le serveur traite (une source de vérité : `HANDLED_EVENT_TYPES`). */
export const WEBHOOK_EVENTS = HANDLED_EVENT_TYPES;
const HOOK_DESCRIPTION = "Nexora AI — facturation (créé par l'administration)";

export interface ConnectDeps {
  db: Database;
  vault: PaymentVault;
  /** Adresse publique du site, sans barre finale. */
  siteUrl: string;
  /** Fabrique du client Stripe (injectée : les tests fournissent un faux). */
  createClient: (key: string, allowLive: boolean) => Stripe;
  /** Développement avec stripe-mock : une adresse locale est acceptée. */
  allowLocalUrl: boolean;
  log: Logger;
  now: () => Date;
}

export type ConnectResult =
  | {
      ok: true;
      mode: "test" | "live";
      account: {
        id: string;
        name: string | null;
        country: string | null;
        countryOk: boolean;
      };
      /** `null` : inconnu (clé restreinte sans droit sur Stripe Tax). */
      taxActive: boolean | null;
      webhook: {
        id: string;
        url: string;
        created: boolean;
        updated: boolean;
        replaced: boolean;
      };
      /** Le compte (ou le mode) Stripe n'est plus celui du dernier branchement. */
      accountChanged: boolean;
      warnings: string[];
    }
  | { ok: false; code: ConnectErrorCode; message: string; action: string };

export type ConnectErrorCode =
  | "key_missing"
  | "key_invalid"
  | "live_not_allowed"
  | "key_rejected"
  | "site_url_not_public"
  | "webhook_failed";

const LOCAL_HOST =
  /^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0|.*\.localhost$|.*\.test$)/i;

function isPublicUrl(siteUrl: string): boolean {
  try {
    const u = new URL(siteUrl);
    return u.protocol === "https:" && !LOCAL_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

const errorType = (e: unknown): string =>
  typeof e === "object" && e && "type" in e
    ? String((e as { type: unknown }).type)
    : "unknown";

async function fail(
  deps: ConnectDeps,
  code: ConnectErrorCode,
  message: string,
  action: string,
  persist = true,
): Promise<ConnectResult> {
  if (persist) {
    await getSettings(deps.db);
    await deps.db.update(paymentSettings).set({
      webhookStatus: "error",
      stripeLastError: message,
      updatedAt: deps.now(),
    });
  }
  await auditPayment(deps.db, {
    actor: "admin",
    action: "stripe.connect_failed",
    subject: "stripe",
    detail: { code },
  });
  return { ok: false, code, message, action };
}

type Endpoint = Stripe.WebhookEndpoint;

async function ensureWebhook(
  stripe: Stripe,
  deps: ConnectDeps,
  url: string,
  ownedId: string | null,
  hasSecret: boolean,
): Promise<{
  endpoint: Endpoint;
  secret: string | null;
  created: boolean;
  updated: boolean;
  replaced: boolean;
}> {
  const events = [
    ...WEBHOOK_EVENTS,
  ] as unknown as Stripe.WebhookEndpointCreateParams.EnabledEvent[];
  const all = await stripe.webhookEndpoints
    .list({ limit: 100 })
    .autoPagingToArray({ limit: 1000 });
  const mine =
    ownedId && hasSecret
      ? all.find((e) => e.id === ownedId && e.url === url)
      : undefined;
  if (mine) {
    // Nous possédons déjà son secret : mise à jour sur place (liste d'événements, réactivation).
    const endpoint = await stripe.webhookEndpoints.update(mine.id, {
      enabled_events: events,
      description: HOOK_DESCRIPTION,
      disabled: false,
    });
    return {
      endpoint,
      secret: null,
      created: false,
      updated: true,
      replaced: false,
    };
  }
  // Le secret d'un point n'est lisible qu'à sa création : un point à NOTRE adresse dont nous n'avons pas
  // le secret est remplacé ; ceux des autres adresses ne sont jamais touchés.
  let replaced = false;
  for (const e of all.filter((x) => x.url === url)) {
    await stripe.webhookEndpoints.del(e.id);
    replaced = true;
  }
  const endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: events,
    description: HOOK_DESCRIPTION,
    api_version:
      Stripe.API_VERSION as Stripe.WebhookEndpointCreateParams.ApiVersion,
  });
  if (!endpoint.secret)
    throw new Error("Stripe n'a pas renvoyé le secret du point de webhook");
  return {
    endpoint,
    secret: endpoint.secret,
    created: true,
    updated: false,
    replaced,
  };
}

/**
 * « Vérifier et brancher Stripe » (D2) : lit la clé collée au Coffre, la vérifie (mode, compte, pays, Stripe Tax),
 * crée ou met à jour le point de webhook `<SITE_URL>/api/stripe/webhook` avec exactement les événements gérés,
 * range le secret `whsec_` au Coffre et enregistre l'état. Rejouable sans effet de bord.
 */
export async function connectStripe(deps: ConnectDeps): Promise<ConnectResult> {
  const settings = await getSettings(deps.db);
  const key = await deps.vault.get(SECRET_KEY_REF);
  if (!key)
    return fail(
      deps,
      "key_missing",
      "Aucune clé secrète Stripe au Coffre.",
      "Collez la clé secrète Stripe dans le module Coffre sous la référence « stripe.secret_key » (type Paiement), puis revenez cliquer « Vérifier et brancher Stripe ».",
      false,
    );
  const mode = stripeKeyMode(key);
  if (!mode)
    return fail(
      deps,
      "key_invalid",
      "La valeur de « stripe.secret_key » n'est pas une clé secrète Stripe.",
      "Recollez la clé secrète (sk_test_… ou sk_live_…, ou une clé restreinte rk_…) dans le Coffre.",
    );
  try {
    assertKeyAllowed(key, settings.liveModeAllowed);
  } catch (e) {
    if (e instanceof StripeModeError)
      return fail(
        deps,
        "live_not_allowed",
        "Clé de production détectée, mais les paiements réels ne sont pas autorisés.",
        "Si vous êtes prêt à encaisser de l'argent réel, cochez « Autoriser les paiements réels » dans les réglages du module Paiements, puis relancez le branchement. Sinon, collez une clé de test.",
      );
    throw e;
  }

  const url = `${deps.siteUrl.replace(/\/+$/, "")}/api/stripe/webhook`;
  if (!deps.allowLocalUrl && !isPublicUrl(url))
    return fail(
      deps,
      "site_url_not_public",
      "L'adresse du site (SITE_URL) n'est pas publique en HTTPS : Stripe ne pourrait pas y envoyer ses événements.",
      "Définissez SITE_URL avec l'adresse publique https du site, redéployez, puis relancez le branchement. En local, utilisez « stripe listen » de la CLI Stripe.",
    );

  const stripe = deps.createClient(key, mode === "live");
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(null);
  } catch (e) {
    deps.log.warn("stripe : clé refusée au branchement", {
      type: errorType(e),
    });
    return fail(
      deps,
      "key_rejected",
      `Stripe a refusé la clé (${errorType(e)}).`,
      "Vérifiez que la clé est complète et active, recollez-la dans le Coffre, puis relancez le branchement.",
    );
  }

  const warnings: string[] = [];
  const country = account.country ?? null;
  const countryOk = country === "CA";
  if (!countryOk)
    warnings.push(
      `Le pays du compte Stripe est « ${country ?? "inconnu"} » : le Canada (CA) est attendu pour TPS et TVQ.`,
    );
  let taxActive: boolean | null = null;
  try {
    taxActive = (await stripe.tax.settings.retrieve()).status === "active";
  } catch {
    taxActive = null;
  }
  if (taxActive === false)
    warnings.push(
      "Stripe Tax n'est pas actif : activez-le et ajoutez les inscriptions TPS/TVQ dans le tableau de bord Stripe, sinon les taxes ne seront pas perçues.",
    );
  if (taxActive === null)
    warnings.push(
      "L'état de Stripe Tax n'a pas pu être lu (clé restreinte ?) : vérifiez-le dans le tableau de bord Stripe.",
    );

  let hook: Awaited<ReturnType<typeof ensureWebhook>>;
  try {
    const hasSecret = (await deps.vault.summary(WEBHOOK_SECRET_REF)).present;
    hook = await ensureWebhook(
      stripe,
      deps,
      url,
      settings.webhookEndpointId,
      hasSecret,
    );
  } catch (e) {
    deps.log.error("stripe : création du point de webhook impossible", {
      type: errorType(e),
    });
    return fail(
      deps,
      "webhook_failed",
      `Le point de webhook n'a pas pu être créé (${errorType(e)}).`,
      "Vérifiez que la clé a le droit « Webhook Endpoints : écriture » (clé restreinte) ou utilisez la clé secrète standard, puis relancez le branchement.",
    );
  }
  if (hook.secret)
    await deps.vault.put(WEBHOOK_SECRET_REF, hook.secret, "payment");

  // Un autre compte (ou le passage du test à la production) ne connaît aucun des objets de l'ancien : on les oublie.
  const accountChanged =
    (settings.stripeAccountId !== null &&
      settings.stripeAccountId !== account.id) ||
    (settings.stripeMode !== null && settings.stripeMode !== mode);
  if (accountChanged) {
    await deps.db
      .update(paymentSettings)
      .set({ creditsProductFrId: null, creditsProductEnId: null });
    await deps.db.update(promoCodes).set({
      stripeCouponId: null,
      stripePromotionCodeId: null,
      stripeFingerprint: null,
      stripeSyncedAt: null,
    });
    warnings.push(
      "Le compte ou le mode Stripe a changé : relancez « Publier vers Stripe » pour chaque offre d'abonnement et pour le catalogue VPS, puis resynchronisez les codes promo.",
    );
  }
  const name =
    account.business_profile?.name ??
    account.settings?.dashboard?.display_name ??
    null;
  await deps.db.update(paymentSettings).set({
    stripeMode: mode,
    stripeAccountId: account.id,
    stripeAccountName: name,
    stripeAccountCountry: country,
    stripeTaxActive: taxActive,
    stripeVerifiedAt: deps.now(),
    stripeLastError: null,
    webhookEndpointId: hook.endpoint.id,
    webhookUrl: url,
    webhookStatus: "connected",
    webhookConnectedAt: deps.now(),
    updatedAt: deps.now(),
  });
  await auditPayment(deps.db, {
    actor: "admin",
    action: "stripe.connect",
    subject: account.id,
    detail: {
      mode,
      country,
      taxActive,
      webhookEndpoint: hook.endpoint.id,
      created: hook.created,
      replaced: hook.replaced,
    },
  });
  return {
    ok: true,
    mode,
    account: { id: account.id, name, country, countryOk },
    taxActive,
    accountChanged,
    webhook: {
      id: hook.endpoint.id,
      url,
      created: hook.created,
      updated: hook.updated,
      replaced: hook.replaced,
    },
    warnings,
  };
}

export type StripeState = "no_key" | "key_unverified" | "connected" | "error";

export interface StripeStatus {
  state: StripeState;
  keyPresent: boolean;
  keyLast4: string | null;
  webhookSecretPresent: boolean;
  mode: "test" | "live" | null;
  accountId: string | null;
  accountName: string | null;
  accountCountry: string | null;
  taxActive: boolean | null;
  webhookUrl: string | null;
  webhookEndpointId: string | null;
  verifiedAt: string | null;
  lastError: string | null;
  liveModeAllowed: boolean;
  events: readonly string[];
  /** Ce que l'administrateur doit faire maintenant (vide si rien). */
  action: string;
}

/** État du branchement, tel que l'admin l'affiche : dérivé des réglages ET de la présence réelle des secrets au Coffre. */
export async function readStripeStatus(deps: {
  db: Database;
  vault: PaymentVault;
  siteUrl: string;
}): Promise<StripeStatus> {
  const s = await getSettings(deps.db);
  const key = await deps.vault.summary(SECRET_KEY_REF);
  const hook = await deps.vault.summary(WEBHOOK_SECRET_REF);
  const expectedUrl = `${deps.siteUrl.replace(/\/+$/, "")}/api/stripe/webhook`;
  let state: StripeState;
  let action = "";
  let lastError = s.stripeLastError;
  if (!key.present) {
    state = "no_key";
    action =
      "Collez la clé secrète Stripe dans le module Coffre (référence « stripe.secret_key », type Paiement), puis cliquez « Vérifier et brancher Stripe ».";
  } else if (s.webhookStatus === "connected" && !hook.present) {
    state = "error";
    lastError = "Le secret du webhook n'est plus au Coffre.";
    action =
      "Cliquez « Vérifier et brancher Stripe » : un nouveau secret sera créé et rangé au Coffre.";
  } else if (s.webhookStatus === "connected" && s.webhookUrl !== expectedUrl) {
    state = "error";
    lastError = "L'adresse du site a changé depuis le branchement.";
    action =
      "Cliquez « Vérifier et brancher Stripe » pour recréer le point de webhook à la nouvelle adresse.";
  } else if (s.webhookStatus === "connected") {
    state = "connected";
  } else if (s.webhookStatus === "error") {
    state = "error";
    action =
      "Corrigez le problème indiqué, puis cliquez « Vérifier et brancher Stripe ».";
  } else {
    state = "key_unverified";
    action = "La clé est au Coffre : cliquez « Vérifier et brancher Stripe ».";
  }
  return {
    state,
    keyPresent: key.present,
    keyLast4: key.last4,
    webhookSecretPresent: hook.present,
    mode: s.stripeMode,
    accountId: s.stripeAccountId,
    accountName: s.stripeAccountName,
    accountCountry: s.stripeAccountCountry,
    taxActive: s.stripeTaxActive,
    webhookUrl: s.webhookUrl,
    webhookEndpointId: s.webhookEndpointId,
    verifiedAt: s.stripeVerifiedAt?.toISOString() ?? null,
    lastError,
    liveModeAllowed: s.liveModeAllowed,
    events: WEBHOOK_EVENTS,
    action,
  };
}

/** Fabrique de production : client réel (ou stripe-mock en développement). */
export function productionClientFactory(
  env: Record<string, string | undefined>,
) {
  return (key: string, allowLive: boolean): Stripe =>
    createStripeClient({
      secretKey: key,
      allowLive,
      mockUrl:
        env.NODE_ENV !== "production" && stripeKeyMode(key) === "test"
          ? env.STRIPE_API_BASE_URL || undefined
          : undefined,
    });
}
