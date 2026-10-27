import Stripe from "stripe";

/**
 * Client Stripe, MODE TEST SEULEMENT. Les paiements réels exigent l'accord explicite du fondateur
 * (AGENTS.md) : une clé `sk_live_…` est refusée ici, et lever cette garde est une décision de code
 * à prendre à ce moment-là, pas un réglage.
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

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export interface StripeClientConfig {
  secretKey: string;
  /** Simulateur stripe-mock (développement) : boucle locale seulement. */
  mockUrl?: string;
}

export function createStripeClient(config: StripeClientConfig): Stripe {
  assertTestModeKey(config.secretKey);
  if (config.mockUrl) {
    const url = new URL(config.mockUrl);
    if (!LOOPBACK.has(url.hostname))
      throw new StripeModeError(
        "Le simulateur Stripe doit être sur la boucle locale.",
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
  assertTestModeKey(secretKey);
  const dev = deps.env.NODE_ENV !== "production";
  return {
    secretKey,
    mockUrl: dev ? deps.env.STRIPE_API_BASE_URL || undefined : undefined,
  };
}

/** Secret de signature des webhooks : coffre (`stripe.webhook_secret`) ou, en développement, STRIPE_WEBHOOK_SECRET. */
export async function resolveWebhookSecret(deps: SecretDeps): Promise<string> {
  return readSecret(deps, "STRIPE_WEBHOOK_SECRET", "stripe.webhook_secret");
}
