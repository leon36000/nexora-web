import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./schema-auth.ts";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/**
 * Paiements, vague 2 (D1 à D5) : branchement de Stripe, réglages, codes promo, comptes du personnel
 * et dons. Tout ce qui porte un montant ou un identifiant client vit dans la base `app` (D4 du
 * site) ; l'administration passe par `/api/admin/payments/*` (module Directus « Paiements »).
 * Aucun secret ici : la clé Stripe et le secret du webhook sont au Coffre.
 */

export const WEBHOOK_STATUSES = ["missing", "connected", "error"] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

/** Réglages de paiement (une seule ligne, id « default ») et état du branchement de Stripe. */
export const paymentSettings = pgTable(
  "payment_settings",
  {
    id: text("id").primaryKey().default("default"),
    /**
     * Autorisation EXPLICITE des paiements réels. Tant qu'elle est fausse, une clé de production est
     * refusée et un événement `livemode` est rejeté : c'est le fondateur qui la donne, depuis l'admin.
     */
    liveModeAllowed: boolean("live_mode_allowed").notNull().default(false),
    /** Essai gratuit : carte exigée au départ (défaut) ou non. Une offre peut en décider autrement. */
    trialRequiresCard: boolean("trial_requires_card").notNull().default(true),
    /** Laisser le champ « code promo » de la page de paiement Stripe (`allow_promotion_codes`). */
    stripePageCodes: boolean("stripe_page_codes").notNull().default(true),
    /** Plafond mensuel des crédits offerts à un compte du personnel, en cents CAD (défaut 100 $). */
    staffMonthlyCreditCapCents: integer("staff_monthly_credit_cap_cents")
      .notNull()
      .default(10_000),
    /**
     * Frais de recharge des crédits API (désactivés par défaut) : en points de base (500 = 5 %) avec un
     * minimum en cents. Déduits des crédits accordés : payer 100 $ avec 5 % donne 95 $ de crédits.
     */
    creditsFeeEnabled: boolean("credits_fee_enabled").notNull().default(false),
    creditsFeeBps: integer("credits_fee_bps").notNull().default(500),
    creditsFeeMinCents: integer("credits_fee_min_cents").notNull().default(100),
    stripeMode: text("stripe_mode").$type<"test" | "live">(),
    stripeAccountId: text("stripe_account_id"),
    stripeAccountName: text("stripe_account_name"),
    stripeAccountCountry: text("stripe_account_country"),
    stripeTaxActive: boolean("stripe_tax_active"),
    stripeVerifiedAt: ts("stripe_verified_at"),
    stripeLastError: text("stripe_last_error"),
    webhookEndpointId: text("webhook_endpoint_id"),
    webhookUrl: text("webhook_url"),
    webhookStatus: text("webhook_status")
      .$type<WebhookStatus>()
      .notNull()
      .default("missing"),
    webhookConnectedAt: ts("webhook_connected_at"),
    /** Produits Stripe « Crédits » (un par langue) : permettent de limiter un coupon aux crédits. */
    creditsProductFrId: text("credits_product_fr_id"),
    creditsProductEnId: text("credits_product_en_id"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("payment_settings_singleton", sql`${t.id} = 'default'`),
    check(
      "payment_settings_webhook_status_check",
      sql`${t.webhookStatus} IN (${inList(WEBHOOK_STATUSES)})`,
    ),
    check(
      "payment_settings_fee_check",
      sql`${t.creditsFeeBps} BETWEEN 0 AND 3000 AND ${t.creditsFeeMinCents} >= 0`,
    ),
    check(
      "payment_settings_cap_nonneg",
      sql`${t.staffMonthlyCreditCapCents} >= 0`,
    ),
  ],
);

export const PROMO_KINDS = [
  "percent",
  "amount",
  "free",
  "trial",
  "staff",
] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

export const PROMO_SCOPES = ["subscriptions", "credits", "vps"] as const;
export type PromoScope = (typeof PROMO_SCOPES)[number];

export const PROMO_DURATIONS = ["once", "repeating", "forever"] as const;
export type PromoDuration = (typeof PROMO_DURATIONS)[number];

export const PROMO_STATUSES = ["active", "disabled"] as const;
export type PromoStatus = (typeof PROMO_STATUSES)[number];

/**
 * Codes promo (D3). Définis et générés en lot depuis l'admin ; synchronisés avec Stripe (coupon +
 * code de promotion) par le serveur de l'app seulement. Un code `staff` n'existe JAMAIS chez Stripe :
 * il offre sans passer par Stripe et n'est accepté que d'un compte du personnel (D4).
 */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** En majuscules, sans espace : la saisie est normalisée avant la recherche. */
    code: text("code").notNull(),
    label: text("label").notNull().default(""),
    kind: text("kind").$type<PromoKind>().notNull(),
    /** Type `percent` : 1 à 100. */
    percentOff: integer("percent_off"),
    /** Type `amount` : cents CAD. */
    amountOffCents: integer("amount_off_cents"),
    /** Type `trial` : jours d'essai gratuit (abonnements). */
    trialDays: integer("trial_days"),
    scopes: text("scopes").array().notNull(),
    duration: text("duration").$type<PromoDuration>().notNull().default("once"),
    durationMonths: integer("duration_months"),
    maxRedemptions: integer("max_redemptions"),
    expiresAt: ts("expires_at"),
    firstOrderOnly: boolean("first_order_only").notNull().default(false),
    onePerCustomer: boolean("one_per_customer").notNull().default(false),
    minAmountCents: integer("min_amount_cents"),
    status: text("status").$type<PromoStatus>().notNull().default("active"),
    batchId: uuid("batch_id"),
    stripeCouponId: text("stripe_coupon_id"),
    stripePromotionCodeId: text("stripe_promotion_code_id"),
    /** Empreinte de ce qui a été envoyé à Stripe : sans changement, aucune nouvelle synchronisation. */
    stripeFingerprint: text("stripe_fingerprint"),
    stripeSyncedAt: ts("stripe_synced_at"),
    stripeSyncError: text("stripe_sync_error"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("promo_codes_code_unique").on(t.code),
    index("promo_codes_batch_idx").on(t.batchId),
    check("promo_codes_kind_check", sql`${t.kind} IN (${inList(PROMO_KINDS)})`),
    check(
      "promo_codes_status_check",
      sql`${t.status} IN (${inList(PROMO_STATUSES)})`,
    ),
    check(
      "promo_codes_duration_check",
      sql`${t.duration} IN (${inList(PROMO_DURATIONS)}) AND (${t.duration} <> 'repeating' OR (${t.durationMonths} IS NOT NULL AND ${t.durationMonths} BETWEEN 1 AND 36))`,
    ),
    check(
      "promo_codes_scopes_check",
      sql`cardinality(${t.scopes}) BETWEEN 1 AND 3 AND ${t.scopes} <@ ARRAY[${inList(PROMO_SCOPES)}]::text[]`,
    ),
    check(
      "promo_codes_value_check",
      sql`(
        (${t.kind} = 'percent' AND ${t.percentOff} IS NOT NULL AND ${t.percentOff} BETWEEN 1 AND 100) OR
        (${t.kind} = 'amount' AND ${t.amountOffCents} IS NOT NULL AND ${t.amountOffCents} > 0) OR
        (${t.kind} = 'trial' AND ${t.trialDays} IS NOT NULL AND ${t.trialDays} BETWEEN 1 AND 365) OR
        (${t.kind} IN ('free', 'staff'))
      )`,
    ),
    check(
      "promo_codes_limits_check",
      sql`(${t.maxRedemptions} IS NULL OR ${t.maxRedemptions} > 0) AND (${t.minAmountCents} IS NULL OR ${t.minAmountCents} > 0)`,
    ),
  ],
);

/** Utilisations d'un code (statistiques et limites « un par client » et « première commande »). */
export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promoCodeId: uuid("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "restrict" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    scope: text("scope").$type<"subscriptions" | "credits" | "vps">().notNull(),
    /** `stripe` : appliqué par un paiement Stripe ; `gift` : offert sans Stripe (code du personnel). */
    source: text("source").$type<"stripe" | "gift">().notNull(),
    stripeSessionId: text("stripe_session_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Rabais accordé, en cents CAD (0 si inconnu ou pour un essai). */
    discountCents: integer("discount_cents").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("promo_redemptions_session_unique")
      .on(t.promoCodeId, t.stripeSessionId)
      .where(sql`${t.stripeSessionId} IS NOT NULL`),
    index("promo_redemptions_code_idx").on(t.promoCodeId, t.createdAt),
    index("promo_redemptions_org_idx").on(t.organizationId),
    check(
      "promo_redemptions_scope_check",
      sql`${t.scope} IN (${inList(PROMO_SCOPES)}) AND ${t.source} IN ('stripe', 'gift')`,
    ),
  ],
);

/** Comptes du personnel (D4) : seuls ceux-là peuvent utiliser un code `staff`. Posé depuis l'admin. */
export const staffAccounts = pgTable("staff_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "restrict" }),
  grantedBy: text("granted_by").notNull(),
  note: text("note").notNull().default(""),
  createdAt: ts("created_at").notNull().defaultNow(),
  /** Non nul : le drapeau est retiré (les dons déjà accordés restent, révocables un par un). */
  revokedAt: ts("revoked_at"),
});

export const GIFT_KINDS = ["subscription", "vps", "credits"] as const;
export type GiftKind = (typeof GIFT_KINDS)[number];

/**
 * Dons du personnel (D4) : abonnement ou VPS offert SANS Stripe, crédits offerts plafonnés par mois.
 * Une ligne par don, révocable depuis l'admin.
 */
export const giftGrants = pgTable(
  "gift_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    promoCodeId: uuid("promo_code_id").references(() => promoCodes.id, {
      onDelete: "restrict",
    }),
    kind: text("kind").$type<GiftKind>().notNull(),
    planCode: text("plan_code"),
    /** Abonnement offert : identifiant synthétique `gift_<uuid>` dans `subscriptions`. */
    subscriptionRef: text("subscription_ref"),
    vpsOrderId: uuid("vps_order_id"),
    /** Crédits offerts, en micro-CAD. */
    creditsMicro: bigint("credits_micro", { mode: "bigint" }),
    status: text("status")
      .$type<"active" | "revoked">()
      .notNull()
      .default("active"),
    reason: text("reason").notNull().default(""),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    revokedBy: text("revoked_by"),
    revokeReason: text("revoke_reason"),
  },
  (t) => [
    uniqueIndex("gift_grants_idempotency_unique").on(t.idempotencyKey),
    index("gift_grants_org_idx").on(t.organizationId, t.createdAt),
    index("gift_grants_user_month_idx").on(t.userId, t.kind, t.createdAt),
    check(
      "gift_grants_kind_check",
      sql`${t.kind} IN (${inList(GIFT_KINDS)}) AND ${t.status} IN ('active', 'revoked')`,
    ),
  ],
);

/** Journal des actions de paiement de l'équipe (AJOUT SEULEMENT, déclencheur SQL). Aucun secret. */
export const paymentAudit = pgTable(
  "payment_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `admin` (module Paiements), `customer`, `stripe`, `system`. */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    subject: text("subject").notNull().default(""),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("payment_audit_created_idx").on(t.createdAt)],
);
