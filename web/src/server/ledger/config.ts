import { createHash } from "node:crypto";

/**
 * Paramètres de facturation versionnés (D3/D7). Chaque écriture du grand livre et chaque achat
 * enregistre la `config_version` appliquée, pour pouvoir expliquer a posteriori une règle d'expiration
 * ou une limite d'achat. Plus tard, ces valeurs viendront d'une configuration publiée dans Directus.
 */
export interface BillingConfig {
  currency: "cad";
  /** Durée de vie des crédits achetés (D7 : 12 mois, réglable). */
  creditExpiryMonths: number;
  /** Bornes d'un achat de crédits, avant taxes, en cents. */
  minPurchaseCents: number;
  maxPurchaseCents: number;
  /** Délai de grâce après un échec de paiement d'abonnement. */
  graceDays: number;
}

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  currency: "cad",
  creditExpiryMonths: 12,
  minPurchaseCents: 2_000,
  maxPurchaseCents: 500_000,
  graceDays: 7,
};

function intFromEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min)
    throw new Error(`${name} : entier ≥ ${min} attendu`);
  return n;
}

export function loadBillingConfig(
  env: Record<string, string | undefined> = process.env,
): BillingConfig {
  const d = DEFAULT_BILLING_CONFIG;
  const config: BillingConfig = {
    currency: "cad",
    creditExpiryMonths: intFromEnv(
      env,
      "BILLING_CREDIT_EXPIRY_MONTHS",
      d.creditExpiryMonths,
      1,
    ),
    minPurchaseCents: intFromEnv(
      env,
      "BILLING_MIN_PURCHASE_CENTS",
      d.minPurchaseCents,
      50,
    ),
    maxPurchaseCents: intFromEnv(
      env,
      "BILLING_MAX_PURCHASE_CENTS",
      d.maxPurchaseCents,
      50,
    ),
    graceDays: intFromEnv(env, "BILLING_GRACE_DAYS", d.graceDays, 1),
  };
  if (config.minPurchaseCents > config.maxPurchaseCents)
    throw new Error(
      "BILLING_MIN_PURCHASE_CENTS ne peut pas dépasser BILLING_MAX_PURCHASE_CENTS",
    );
  return config;
}

/** Empreinte stable (JSON canonique, clés triées) de la configuration. */
export function configVersion(config: BillingConfig): string {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(config).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  return `cfg_${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}
