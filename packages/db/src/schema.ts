import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const JOB_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "dead",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** File de tâches (D13) : consommée par le worker avec FOR UPDATE SKIP LOCKED. */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    /** Historique des échecs : [{ attempt, at, message }], messages nettoyés. */
    errors: jsonb("errors").$type<JobError[]>().notNull().default([]),
    /** Un même couple (clé) ne crée qu'une tâche ; NULL = pas d'idempotence demandée. */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("jobs_idempotency_key_unique").on(t.idempotencyKey),
    index("jobs_claim_idx").on(t.status, t.availableAt),
    check(
      "jobs_status_check",
      sql`${t.status} IN ('pending', 'running', 'succeeded', 'dead')`,
    ),
  ],
);

export interface JobError {
  attempt: number;
  at: string;
  message: string;
}

export const VAULT_KINDS = [
  "llm_provider",
  "payment",
  "proxmox",
  "other",
] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];

/**
 * Coffre (D2) : chiffrement par enveloppe. `ciphertext` est chiffré par une clé de données
 * aléatoire par secret ; cette clé (`dataKeyEncrypted`) est chiffrée par la clé maîtresse
 * `masterKeyVersion`. Une ligne révoquée ne conserve aucun matériel chiffré.
 */
export const vaultSecrets = pgTable(
  "vault_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ref: text("ref").notNull(),
    kind: text("kind").$type<VaultKind>().notNull(),
    algorithm: text("algorithm").notNull().default("aes-256-gcm"),
    iv: text("iv").notNull(),
    ciphertext: text("ciphertext").notNull(),
    authTag: text("auth_tag").notNull(),
    dataKeyEncrypted: text("data_key_encrypted").notNull(),
    last4: text("last4").notNull(),
    masterKeyVersion: integer("master_key_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("vault_secrets_ref_unique").on(t.ref),
    check(
      "vault_secrets_kind_check",
      sql`${t.kind} IN ('llm_provider', 'payment', 'proxmox', 'other')`,
    ),
  ],
);

export const CONFIG_VERSION_STATUSES = [
  "draft",
  "approved",
  "published",
  "superseded",
] as const;
export type ConfigVersionStatus = (typeof CONFIG_VERSION_STATUSES)[number];

/** Versions figées des configurations publiées (D3) : ce qui a été appliqué, avec son hash. */
export const configVersions = pgTable(
  "config_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collection: text("collection").notNull(),
    itemId: text("item_id").notNull(),
    hash: text("hash").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    /** Flux D14 : draft → approved → published → superseded. Les lignes de S1 sont `published`. */
    status: text("status")
      .$type<ConfigVersionStatus>()
      .notNull()
      .default("published"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Null tant que la version n'est pas publiée. */
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow(),
    /** État « appliqué » écrit en retour par une synchronisation (LiteLLM, Stripe…). */
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedStatus: text("applied_status"),
    appliedDetail: jsonb("applied_detail").$type<Record<string, unknown>>(),
  },
  (t) => [
    check(
      "config_versions_status_check",
      sql`${t.status} IN ('draft', 'approved', 'published', 'superseded')`,
    ),
    unique("config_versions_item_hash_unique").on(
      t.collection,
      t.itemId,
      t.hash,
    ),
    index("config_versions_item_idx").on(t.collection, t.itemId, t.publishedAt),
  ],
);

/** Idempotence des webhooks (D7) : un événement d'un fournisseur n'est traité qu'une fois. */
export const processedEvents = pgTable(
  "processed_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique("processed_events_provider_event_unique").on(t.provider, t.eventId),
  ],
);

export * from "./schema-agents.ts";
export * from "./schema-auth.ts";
export * from "./schema-billing.ts";
export * from "./schema-gateway.ts";
export * from "./schema-leads.ts";
export * from "./schema-oauth.ts";
export * from "./schema-payments.ts";
export * from "./schema-site.ts";
export * from "./schema-vps.ts";
