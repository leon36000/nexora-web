import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./schema-auth.ts";
import { apiKeys } from "./schema-gateway.ts";

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Nexora Code : connexion de l'agent de code par le compte Nexora (flux « code d'appareil ») et environnement de
 * travail hébergé (un conteneur par personne). Ces tables portent des identifiants clients : elles vivent dans la
 * base `app`, jamais dans Directus (D4). Aucun secret en clair : les codes sont conservés par empreinte, les clés
 * `nxk_` par l'empreinte de `api_keys`, le mot de passe de l'environnement dans le coffre.
 */

export const CODE_DEVICE_STATUSES = [
  "pending",
  "approved",
  "denied",
  "delivered",
] as const;
export type CodeDeviceStatus = (typeof CODE_DEVICE_STATUSES)[number];

const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/**
 * Demande de connexion d'un appareil. Le code d'appareil (256 bits, secret du CLI) et le code d'utilisateur (saisi par
 * la personne) ne sont conservés que par empreinte SHA-256. La clé `nxk_` n'est PAS rangée ici : elle est créée au
 * moment de la remise (premier `poll` après l'approbation) et n'existe qu'une fois, dans la réponse.
 */
export const codeDeviceCodes = pgTable(
  "code_device_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceCodeHash: text("device_code_hash").notNull(),
    userCodeHash: text("user_code_hash").notNull(),
    deviceName: text("device_name").notNull(),
    client: text("client").notNull(),
    clientVersion: text("client_version"),
    /** `pending` → `approved` ou `denied` ; `approved` → `delivered` (clé remise, usage unique). */
    status: text("status")
      .$type<CodeDeviceStatus>()
      .notNull()
      .default("pending"),
    expiresAt: ts("expires_at").notNull(),
    /** Dernier sondage du CLI (pour répondre `slow_down` quand il va trop vite). */
    lastPolledAt: ts("last_polled_at"),
    approvedUserId: text("approved_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedOrganizationId: text("approved_organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    approvedAt: ts("approved_at"),
    /** Clé créée à la remise (seule son empreinte existe, dans `api_keys`). */
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    deliveredAt: ts("delivered_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("code_device_codes_device_hash_unique").on(t.deviceCodeHash),
    uniqueIndex("code_device_codes_user_hash_unique").on(t.userCodeHash),
    index("code_device_codes_expires_idx").on(t.expiresAt),
    check(
      "code_device_codes_status_check",
      sql`${t.status} IN (${inList(CODE_DEVICE_STATUSES)})`,
    ),
  ],
);

export const CODE_DESIRED_STATUSES = ["stopped", "running"] as const;
export type CodeDesiredStatus = (typeof CODE_DESIRED_STATUSES)[number];

/**
 * Environnement hébergé d'une personne (un conteneur `nexora/code-workspace` et son volume). `proxy_id` est
 * l'identifiant opaque de l'adresse `/code/ws/<proxy_id>/…` (jamais l'identifiant de la personne). Le mot de passe du
 * serveur est rangé chiffré dans le coffre (`code-workspace-password.<id>`), la clé `nxk_` dédiée n'est qu'une ligne de
 * `api_keys` (empreinte) : elle est recréée à chaque création du conteneur.
 */
export const codeWorkspaces = pgTable(
  "code_workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    proxyId: text("proxy_id").notNull(),
    containerName: text("container_name").notNull(),
    volumeName: text("volume_name").notNull(),
    /** Port local publié par le conteneur (127.0.0.1:port → 4096). */
    port: integer("port").notNull(),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    /** Ce que la personne veut : `running` après un démarrage, `stopped` après un arrêt (manuel ou inactivité). */
    desiredStatus: text("desired_status")
      .$type<CodeDesiredStatus>()
      .notNull()
      .default("stopped"),
    /** Code court de la dernière erreur d'approvisionnement (jamais un message de Docker). */
    lastError: text("last_error"),
    lastActivityAt: ts("last_activity_at"),
    lastStartedAt: ts("last_started_at"),
    lastStoppedAt: ts("last_stopped_at"),
    /** Octets du volume déjà comptés dans le quota (`storage_usage`, produit `code`). */
    accountedBytes: bigint("accounted_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    sizeMeasuredAt: ts("size_measured_at"),
    /** Le volume dépasse l'espace de l'offre : le service refuse de démarrer tant que ça dure. */
    quotaBlocked: boolean("quota_blocked").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("code_workspaces_person_unique").on(t.organizationId, t.userId),
    uniqueIndex("code_workspaces_proxy_unique").on(t.proxyId),
    uniqueIndex("code_workspaces_container_unique").on(t.containerName),
    uniqueIndex("code_workspaces_volume_unique").on(t.volumeName),
    uniqueIndex("code_workspaces_port_unique").on(t.port),
    index("code_workspaces_running_idx").on(t.desiredStatus),
    check(
      "code_workspaces_status_check",
      sql`${t.desiredStatus} IN (${inList(CODE_DESIRED_STATUSES)})`,
    ),
    check("code_workspaces_bytes_check", sql`${t.accountedBytes} >= 0`),
    check("code_workspaces_port_check", sql`${t.port} BETWEEN 1024 AND 65535`),
  ],
);
