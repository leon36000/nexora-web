import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./schema-auth.ts";

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Montants : micro-unités CAD entières (1 CAD = 1 000 000), `bigint` en mode `bigint`.
 * Aucun nombre à virgule flottante n'entre dans le grand livre (D1).
 */
const micro = (name: string) => bigint(name, { mode: "bigint" });

/** Lien organisation ↔ client Stripe (un client Stripe par organisation). */
export const billingCustomers = pgTable(
  "billing_customers",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "restrict" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("billing_customers_stripe_unique").on(t.stripeCustomerId),
  ],
);

/**
 * Compte de crédits d'une organisation (D1/D7). `balanceMicro` et `heldMicro` sont dérivés des
 * écritures de `credit_entries` et ne sont modifiés que dans la même transaction qu'une écriture,
 * sous verrou de ligne. Solde disponible = balance − held. Le solde ne devient négatif que par
 * remboursement ou litige ; `held` n'est jamais négatif (contrainte).
 */
export const creditAccounts = pgTable(
  "credit_accounts",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "restrict" }),
    balanceMicro: micro("balance_micro").notNull().default(sql`0`),
    heldMicro: micro("held_micro").notNull().default(sql`0`),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [check("credit_accounts_held_nonneg", sql`${t.heldMicro} >= 0`)],
);

export const ENTRY_KINDS = [
  "credit",
  "reserve",
  "settle",
  "release",
  "refund",
  "dispute",
  "expire",
  "overage",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/**
 * Écritures du grand livre : IMMUABLES (un déclencheur refuse UPDATE, DELETE et TRUNCATE). Chaque
 * écriture porte deux variations signées : sur le solde (`balanceDelta`) et sur les montants
 * réservés (`heldDelta`). Les signes sont contraints par type d'écriture.
 */
export const creditEntries = pgTable(
  "credit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: text("kind").$type<EntryKind>().notNull(),
    balanceDeltaMicro: micro("balance_delta_micro").notNull(),
    heldDeltaMicro: micro("held_delta_micro").notNull(),
    /** Solde et montant réservé juste après l'écriture (photo prise sous verrou). */
    balanceAfterMicro: micro("balance_after_micro").notNull(),
    heldAfterMicro: micro("held_after_micro").notNull(),
    /** Clé d'idempotence globale : un rejeu renvoie l'écriture d'origine. */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Version de configuration (D3) appliquée lors de l'écriture. */
    configVersion: text("config_version").notNull(),
    /** D'où vient l'écriture : purchase, subscription, usage, stripe_refund, stripe_dispute… */
    source: text("source").notNull(),
    reservationId: uuid("reservation_id"),
    /** Pour `expire` : la ligne `credit` (lot) dont des crédits expirent. */
    lotEntryId: uuid("lot_entry_id"),
    /** Pour `refund` et `dispute` : l'achat de crédits concerné. */
    purchaseId: uuid("purchase_id"),
    /** Échéance d'un lot de crédits (écritures `credit` seulement). */
    expiresAt: ts("expires_at"),
    externalRef: text("external_ref"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("credit_entries_idempotency_unique").on(t.idempotencyKey),
    index("credit_entries_org_idx").on(t.organizationId, t.createdAt),
    index("credit_entries_lot_idx").on(t.lotEntryId),
    index("credit_entries_purchase_idx").on(t.purchaseId),
    check(
      "credit_entries_kind_check",
      sql`${t.kind} IN ('credit','reserve','settle','release','refund','dispute','expire','overage')`,
    ),
    // Un solde disponible négatif n'est permis que par remboursement, litige ou dépassement de
    // réservation « overage » (D1/D7 : le coût réel est dû) : jamais par une réservation ni par
    // une expiration, quelle que soit la logique applicative.
    check(
      "credit_entries_no_overdraft_check",
      sql`(${t.kind} NOT IN ('reserve','expire') OR ${t.balanceAfterMicro} - ${t.heldAfterMicro} >= 0)`,
    ),
    // Signes par type : crédit +, réserve +held, règlement/libération −held, retraits −solde.
    check(
      "credit_entries_signs_check",
      sql`(
        (${t.kind} = 'credit'  AND ${t.balanceDeltaMicro} > 0 AND ${t.heldDeltaMicro} = 0) OR
        (${t.kind} = 'reserve' AND ${t.balanceDeltaMicro} = 0 AND ${t.heldDeltaMicro} > 0) OR
        (${t.kind} = 'settle'  AND ${t.balanceDeltaMicro} <= 0 AND ${t.heldDeltaMicro} < 0 AND ${t.balanceDeltaMicro} >= ${t.heldDeltaMicro}) OR
        (${t.kind} = 'release' AND ${t.balanceDeltaMicro} = 0 AND ${t.heldDeltaMicro} < 0) OR
        (${t.kind} IN ('refund','dispute','expire','overage') AND ${t.balanceDeltaMicro} < 0 AND ${t.heldDeltaMicro} = 0)
      )`,
    ),
  ],
);

export const RESERVATION_STATUSES = ["open", "settled", "released"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Réservations de crédits (montant maximal estimé d'une requête). Seule table mutable du grand livre. */
export const creditReservations = pgTable(
  "credit_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    amountMicro: micro("amount_micro").notNull(),
    /** Coût réel facturé (règlement plafonné à la réservation + dépassement éventuel). */
    settledMicro: micro("settled_micro"),
    status: text("status").$type<ReservationStatus>().notNull().default("open"),
    /** Clé API qui a émis la requête (null : appel interne). Sert à rendre ou ajuster `spent_micro`. */
    apiKeyId: uuid("api_key_id"),
    /** Le montant a aussi été retenu sur le plafond de dépense de la clé (clé plafonnée). */
    keySpendHeld: boolean("key_spend_held").notNull().default(false),
    idempotencyKey: text("idempotency_key").notNull(),
    configVersion: text("config_version").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
  },
  (t) => [
    uniqueIndex("credit_reservations_idempotency_unique").on(t.idempotencyKey),
    index("credit_reservations_open_idx").on(t.status, t.createdAt),
    check("credit_reservations_amount_pos", sql`${t.amountMicro} > 0`),
    check(
      "credit_reservations_status_check",
      sql`${t.status} IN ('open','settled','released')`,
    ),
  ],
);

export const PURCHASE_STATUSES = [
  "paid",
  "partially_refunded",
  "refunded",
  "disputed",
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Achats de crédits (paiement unique par Stripe Checkout). Le montant en crédits = avant taxes. */
export const creditPurchases = pgTable(
  "credit_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    currency: text("currency").notNull().default("cad"),
    amountSubtotalCents: integer("amount_subtotal_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    amountTotalCents: integer("amount_total_cents").notNull(),
    creditsMicro: micro("credits_micro").notNull(),
    status: text("status").$type<PurchaseStatus>().notNull().default("paid"),
    configVersion: text("config_version").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("credit_purchases_session_unique").on(
      t.stripeCheckoutSessionId,
    ),
    uniqueIndex("credit_purchases_pi_unique").on(t.stripePaymentIntentId),
    index("credit_purchases_org_idx").on(t.organizationId),
    check("credit_purchases_credits_pos", sql`${t.creditsMicro} > 0`),
    check(
      "credit_purchases_status_check",
      sql`${t.status} IN ('paid','partially_refunded','refunded','disputed')`,
    ),
  ],
);

/**
 * Crédits inclus accordés par UNE facture d'abonnement payée (I2). Sert de « source » de reprise,
 * comme `credit_purchases` pour un achat : les remboursements et litiges de cette facture débitent
 * le grand livre au prorata de `amount_paid_cents` (taxes comprises). L'écriture de crédit et les
 * débits portent l'identifiant de cette ligne dans `credit_entries.purchase_id` (colonne sans clé
 * étrangère : elle désigne la source de paiement, achat ou facture). Une ligne n'existe que si la
 * facture a réellement encaissé de l'argent (`amount_paid_cents > 0`, M4).
 */
export const subscriptionCreditGrants = pgTable(
  "subscription_credit_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Montant encaissé par la facture, taxes comprises : dénominateur du prorata. */
    amountPaidCents: integer("amount_paid_cents").notNull(),
    creditsMicro: micro("credits_micro").notNull(),
    configVersion: text("config_version").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscription_credit_grants_invoice_unique").on(
      t.stripeInvoiceId,
    ),
    index("subscription_credit_grants_org_idx").on(t.organizationId),
    check("subscription_credit_grants_credits_pos", sql`${t.creditsMicro} > 0`),
    check("subscription_credit_grants_paid_pos", sql`${t.amountPaidCents} > 0`),
  ],
);

/**
 * Offres annuelles : les crédits inclus sont versés MOIS PAR MOIS, un douzième chaque mois, chacun valable le mois en
 * cours. Une facture annuelle payée crée une ligne `subscription_credit_grants` (source des remboursements et litiges,
 * `credits_micro` = total de l'année) et douze tranches ; la première est versée tout de suite, les autres par la tâche
 * `ledger.grant-tranches` du worker à leur échéance. `original_micro` est le douzième d'origine, `amount_micro` ce qui
 * reste à verser (un remboursement le réduit), `reduced_micro` ce qui en a été retiré. Statuts : `pending` (à verser),
 * `held` (suspendue par un litige ouvert : `hold_ref`), `granted` (versée), `canceled` (plus rien à verser).
 */
export const TRANCHE_STATUSES = [
  "pending",
  "held",
  "granted",
  "canceled",
] as const;
export type TrancheStatus = (typeof TRANCHE_STATUSES)[number];

export const subscriptionCreditTranches = pgTable(
  "subscription_credit_tranches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => subscriptionCreditGrants.id, { onDelete: "restrict" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** 0 à 11. */
    seq: integer("seq").notNull(),
    dueAt: ts("due_at").notNull(),
    /** Fin du mois couvert : le douzième expire à cette date. */
    expiresAt: ts("expires_at").notNull(),
    originalMicro: micro("original_micro").notNull(),
    amountMicro: micro("amount_micro").notNull(),
    reducedMicro: micro("reduced_micro").notNull().default(sql`0`),
    status: text("status").$type<TrancheStatus>().notNull().default("pending"),
    /** Litige qui suspend la tranche (`status = 'held'`). */
    holdRef: text("hold_ref"),
    grantedAt: ts("granted_at"),
    canceledAt: ts("canceled_at"),
    cancelReason: text("cancel_reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscription_credit_tranches_grant_seq_unique").on(
      t.grantId,
      t.seq,
    ),
    index("subscription_credit_tranches_due_idx").on(t.status, t.dueAt),
    index("subscription_credit_tranches_sub_idx").on(t.stripeSubscriptionId),
    check(
      "subscription_credit_tranches_amounts",
      sql`${t.originalMicro} > 0 AND ${t.amountMicro} >= 0 AND ${t.reducedMicro} >= 0 AND ${t.amountMicro} + ${t.reducedMicro} <= ${t.originalMicro}`,
    ),
    check(
      "subscription_credit_tranches_status_check",
      sql`${t.status} IN ('pending','held','granted','canceled')`,
    ),
    check("subscription_credit_tranches_seq", sql`${t.seq} BETWEEN 0 AND 11`),
  ],
);

/**
 * Essais gratuits consommés, par moyen de paiement et par adresse courriel : un essai par carte (empreinte Stripe
 * `card.fingerprint`) et par courriel normalisé, pour une famille d'offre. Les clés sont des empreintes SHA-256 : la base
 * ne garde ni l'empreinte de carte ni le courriel en clair. Une carte ou un courriel déjà inscrit pour un AUTRE
 * abonnement annule l'essai du nouveau (voir `billing/trial-guard.ts`).
 */
export const TRIAL_CLAIM_KINDS = ["card", "email"] as const;
export type TrialClaimKind = (typeof TRIAL_CLAIM_KINDS)[number];

export const trialClaims = pgTable(
  "trial_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<TrialClaimKind>().notNull(),
    keyHash: text("key_hash").notNull(),
    family: text("family").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trial_claims_key_unique").on(t.kind, t.keyHash, t.family),
    index("trial_claims_sub_idx").on(t.stripeSubscriptionId),
    check("trial_claims_kind_check", sql`${t.kind} IN ('card','email')`),
  ],
);

/** Essais annulés parce que la carte ou le courriel avait déjà servi (journal d'audit, aucune donnée personnelle). */
export const trialDenials = pgTable(
  "trial_denials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    family: text("family").notNull(),
    /** `card` ou `email` : la clé qui avait déjà servi. */
    reason: text("reason").$type<TrialClaimKind>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trial_denials_sub_unique").on(t.stripeSubscriptionId),
    check("trial_denials_reason_check", sql`${t.reason} IN ('card','email')`),
  ],
);

/**
 * Litiges de paiement (Stripe `charge.dispute.*`) par organisation. Une organisation dont un litige est ouvert ou perdu ne
 * reçoit plus d'essai gratuit ni de rabais (Ruling du 28/10) ; un litige gagné lève la restriction. `status` : `open`
 * (créé), `won` (gagné ou clos sans perte), `lost`.
 */
export const DISPUTE_STATUSES = ["open", "won", "lost"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const paymentDisputes = pgTable(
  "payment_disputes",
  {
    /** Identifiant du litige chez Stripe (`dp_…`). */
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    status: text("status").$type<DisputeStatus>().notNull().default("open"),
    amountCents: integer("amount_cents").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
  },
  (t) => [
    index("payment_disputes_org_idx").on(t.organizationId, t.status),
    check(
      "payment_disputes_status_check",
      sql`${t.status} IN ('open','won','lost')`,
    ),
  ],
);

/**
 * Lien facture ↔ paiement Stripe. Depuis l'API 2025+, ni la facture ni la charge ne se
 * référencent mutuellement : seul l'événement `invoice_payment.paid` les relie. Une ligne par
 * facture ; elle peut arriver avant ou après `invoice.paid`.
 */
export const stripeInvoicePayments = pgTable(
  "stripe_invoice_payments",
  {
    stripeInvoiceId: text("stripe_invoice_id").primaryKey(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("stripe_invoice_payments_pi_idx").on(t.stripePaymentIntentId),
    index("stripe_invoice_payments_charge_idx").on(t.stripeChargeId),
  ],
);

export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
  "canceled",
  /** Offert par l'équipe (D4) : aucun Stripe, accès complet, révocable depuis l'admin. */
  "gifted",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Miroir local des abonnements Stripe (machine à états : web/src/server/billing/subscription-state.ts). */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    planCode: text("plan_code"),
    stripePriceId: text("stripe_price_id"),
    status: text("status").$type<SubscriptionStatus>().notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    /** Fin du délai de grâce après un échec de paiement ; NULL hors grâce. */
    graceEndsAt: ts("grace_ends_at"),
    canceledAt: ts("canceled_at"),
    /** `created` (secondes) du dernier événement appliqué : écarte les événements en retard. */
    lastEventCreated: bigint("last_event_created", { mode: "number" })
      .notNull()
      .default(0),
    configVersion: text("config_version"),
    /** Période de facturation de l'offre au dernier événement appliqué (`month` ou `year`) ; NULL pour un VPS. */
    billingInterval: text("billing_interval").$type<"month" | "year">(),
    /**
     * Espace disque de l'offre (octets), copié de l'offre Directus (`included_storage_gb`) à chaque facture
     * appliquée, comme `configVersion` : le quota se lit donc dans la base `app` seule, sans appel à Directus.
     */
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_stripe_unique").on(t.stripeSubscriptionId),
    index("subscriptions_org_idx").on(t.organizationId),
    check(
      "subscriptions_status_check",
      sql`${t.status} IN ('incomplete','incomplete_expired','trialing','active','past_due','unpaid','paused','canceled','gifted')`,
    ),
    check(
      "subscriptions_interval_check",
      sql`${t.billingInterval} IS NULL OR ${t.billingInterval} IN ('month','year')`,
    ),
    check(
      "subscriptions_storage_quota_check",
      sql`${t.storageQuotaBytes} >= 0`,
    ),
  ],
);

/** Produits qui consomment de l'espace disque du client (quota commun à l'organisation, ventilé par produit). */
export const STORAGE_PRODUCTS = [
  "workstudio",
  "code",
  "rag",
  "creative",
  "bot",
] as const;
export type StorageProduct = (typeof STORAGE_PRODUCTS)[number];

/**
 * Espace utilisé par organisation et par produit (octets). Une ligne par (organisation, produit) ; écrite seulement
 * par `recordStorageUsage` (`web/src/server/billing/entitlements.ts`), sous le verrou de `organization_storage`.
 */
export const storageUsage = pgTable(
  "storage_usage",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    product: text("product").$type<StorageProduct>().notNull(),
    usedBytes: bigint("used_bytes", { mode: "bigint" }).notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.product] }),
    check("storage_usage_nonneg", sql`${t.usedBytes} >= 0`),
    check(
      "storage_usage_product_check",
      sql`${t.product} IN ('workstudio','code','rag','creative','bot')`,
    ),
  ],
);

/**
 * Go supplémentaires d'une organisation (octets, en plus de l'espace de son offre). La ligne sert aussi de verrou aux
 * écritures d'usage de l'organisation (`SELECT … FOR UPDATE`), ce qui rend la vérification du quota atomique.
 */
export const organizationStorage = pgTable(
  "organization_storage",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "restrict" }),
    extraBytes: bigint("extra_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("organization_storage_extra_nonneg", sql`${t.extraBytes} >= 0`),
  ],
);

/** Limitation de débit des routes de facturation (fenêtre fixe, partagée entre les instances). */
export const apiRateLimits = pgTable("api_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});

/**
 * Alerte de solde bas d'une organisation (une ligne par organisation) : quand le solde disponible passe sous le
 * seuil, les propriétaires reçoivent UN courriel ; `last_alerted_at` marque l'alerte envoyée et n'est effacé que
 * lorsque le solde remonte au-dessus du seuil (pas de courriel répété tant que le solde reste bas).
 */
export const balanceAlerts = pgTable(
  "balance_alerts",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    thresholdMicro: micro("threshold_micro").notNull(),
    lastAlertedAt: ts("last_alerted_at"),
    updatedBy: text("updated_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("balance_alerts_threshold_check", sql`${t.thresholdMicro} > 0`),
  ],
);
