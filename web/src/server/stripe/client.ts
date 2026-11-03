import Stripe from "stripe";

/**
 * Client Stripe. MODE TEST PAR DÉFAUT : les paiements réels exigent l'accord explicite du fondateur
 * (AGENTS.md). Une clé `sk_live_…` est refusée tant que le réglage « paiements réels autorisés »
 * (`payment_settings.live_mode_allowed`, posé depuis le module Paiements de l'admin, journalisé) n'est
 * pas levé : le code sait travailler en production, mais ne le fait que sur ce geste explicite.
 */
export class StripeModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeModeError";
  }
}

const TEST_KEY = /^(sk|rk)_test_[A-Za-z0-9_]+$/;

/** Vérifie qu'une clé est une clé de test. Ne cite jamais la valeur dans le message. */
export function assertTestModeKey(key: string): void {
  if (!TEST_KEY.test(key))
    throw new StripeModeError(
      "La clé Stripe doit être une clé de test (sk_test_… ou rk_test_…) ; les paiements réels sont désactivés.",
    );
}

const LIVE_KEY = /^(sk|rk)_live_[A-Za-z0-9_]+$/;

/** Mode d'une clé Stripe d'après son préfixe ; `null` si ce n'est pas une clé Stripe. Ne cite jamais la valeur. */
export function stripeKeyMode(key: string): "test" | "live" | null {
  if (TEST_KEY.test(key)) return "test";
  if (LIVE_KEY.test(key)) return "live";
  return null;
}

/** Clé de test, ou clé de production SEULEMENT si les paiements réels sont autorisés. */
export function assertKeyAllowed(key: string, liveAllowed: boolean): void {
  const mode = stripeKeyMode(key);
  if (mode === "test") return;
  if (mode === "live") {
    if (liveAllowed) return;
    throw new StripeModeError(
      "Clé de production refusée : les paiements réels ne sont pas autorisés (réglage du module Paiements).",
    );
  }
  throw new StripeModeError(
    "La valeur n'est pas une clé secrète Stripe (sk_test_… / sk_live_… ou rk_…).",
  );
}

/**
 * Hôtes admis pour le simulateur : la boucle locale, et le service `stripe-mock` du réseau interne de
 * la pile d'essai (STRIPE_TEST_MOCK_URL). Rien d'autre : une clé de test ne part jamais vers un tiers.
 */
const LOOPBACK = new Set([
  "127.0.0.1",
  "localhost",
  "[::1]",
  "::1",
  "stripe-mock",
]);

export interface StripeClientConfig {
  secretKey: string;
  /** Simulateur stripe-mock (développement) : boucle locale seulement. */
  mockUrl?: string;
  /** Clé de production permise (réglage explicite du fondateur). */
  allowLive?: boolean;
}

export function createStripeClient(config: StripeClientConfig): Stripe {
  assertKeyAllowed(config.secretKey, config.allowLive === true);
  if (config.mockUrl) {
    if (stripeKeyMode(config.secretKey) === "live")
      throw new StripeModeError(
        "Le simulateur Stripe ne reçoit jamais une clé de production.",
      );
    const url = new URL(config.mockUrl);
    if (!LOOPBACK.has(url.hostname))
      throw new StripeModeError(
        "Le simulateur Stripe doit être sur la boucle locale ou le service stripe-mock.",
      );
    return new Stripe(config.secretKey, {
      host: url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      protocol: url.protocol.replace(":", "") as "http" | "https",
      maxNetworkRetries: 0,
    });
  }
  return new Stripe(config.secretKey, { maxNetworkRetries: 2 });
}

interface SecretDeps {
  env: Record<string, string | undefined>;
  getSecret: (ref: string) => Promise<string>;
  /** Les paiements réels sont-ils autorisés ? (réglage de l'admin ; défaut : non) */
  liveAllowed?: () => Promise<boolean>;
}

async function readSecret(deps: SecretDeps, envName: string, ref: string) {
  const dev = deps.env.NODE_ENV !== "production";
  const fromEnv = dev ? deps.env[envName] : undefined;
  if (fromEnv) return fromEnv;
  try {
    return await deps.getSecret(ref);
  } catch {
    throw new Error(
      `Secret Stripe absent : coller « ${ref} » dans le Coffre${dev ? ` (ou définir ${envName})` : ""}.`,
    );
  }
}

/**
 * Clé d'API : coffre (`stripe.secret_key`) ; en développement seulement, `STRIPE_SECRET_KEY` et
 * `STRIPE_API_BASE_URL` (stripe-mock) ont priorité. Hors développement, ces variables sont ignorées.
 */
export async function resolveStripeConfig(
  deps: SecretDeps,
): Promise<StripeClientConfig> {
  const secretKey = await readSecret(
    deps,
    "STRIPE_SECRET_KEY",
    "stripe.secret_key",
  );
  const allowLive =
    stripeKeyMode(secretKey) === "live" && deps.liveAllowed
      ? await deps.liveAllowed()
      : false;
  assertKeyAllowed(secretKey, allowLive);
  return {
    secretKey,
    mockUrl: mockUrlFor(deps.env, secretKey),
    ...(allowLive ? { allowLive: true } : {}),
  };
}

/**
 * Adresse du simulateur Stripe : en développement STRIPE_API_BASE_URL ; en production SEULEMENT
 * STRIPE_TEST_MOCK_URL (pile d'essai, opt-in de l'opérateur) et jamais avec une clé de production.
 */
export function mockUrlFor(
  env: Record<string, string | undefined>,
  secretKey: string,
): string | undefined {
  if (stripeKeyMode(secretKey) !== "test") return undefined;
  const dev = env.NODE_ENV !== "production";
  return (
    (dev ? env.STRIPE_API_BASE_URL : env.STRIPE_TEST_MOCK_URL) || undefined
  );
}

/** Secret de signature des webhooks : coffre (`stripe.webhook_secret`) ou, en développement, STRIPE_WEBHOOK_SECRET. */
export async function resolveWebhookSecret(deps: SecretDeps): Promise<string> {
  return readSecret(deps, "STRIPE_WEBHOOK_SECRET", "stripe.webhook_secret");
}
