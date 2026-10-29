import { sql } from "drizzle-orm";
import {
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
import { apiKeys } from "./schema-gateway.ts";

/**
 * Nexora Privacy Router (v1) : politique de confidentialité par organisation et journal des sorties de
 * données. Aucune colonne de contenu : le journal ne garde que des métadonnées (règles, hôte ou modèle visé,
 * genres de données), jamais un texte, une adresse complète ni une valeur détectée.
 */

export const PRIVACY_LEVELS = ["standard", "renforce", "souverain"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const PRIVACY_DECISIONS = ["allow", "mask", "deny"] as const;
export type PrivacyDecisionValue = (typeof PRIVACY_DECISIONS)[number];

const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));
const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Politique d'une organisation. Une ligne par version : `current` marque la version en vigueur (une seule par
 * organisation, garantie par un index unique partiel) ; les autres lignes sont l'historique. Une organisation sans
 * ligne applique la politique par défaut de Nexora (niveau « standard »), jamais « tout permis ».
 * `config` est validé par zod à l'écriture et à la lecture (`web/src/server/privacy/policy.ts`).
 */
export const privacyPolicies = pgTable(
  "privacy_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    level: text("level").$type<PrivacyLevel>().notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    current: boolean("current").notNull().default(true),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("privacy_policies_org_version_unique").on(
      t.organizationId,
      t.version,
    ),
    uniqueIndex("privacy_policies_org_current_unique")
      .on(t.organizationId)
      .where(sql`${t.current}`),
    check("privacy_policies_version_check", sql`${t.version} >= 1`),
    check(
      "privacy_policies_level_check",
      sql`${t.level} IN (${inList(PRIVACY_LEVELS)})`,
    ),
  ],
);

/**
 * Journal des décisions du Privacy Router : une ligne par sortie évaluée. MÉTADONNÉES seulement (jamais le
 * contenu, jamais l'adresse complète) : `destination` est un hôte ou un identifiant de modèle, `data_kinds` la
 * nature des données (« prompt »…), `detected` les catégories reconnues (« email »…).
 */
export const privacyEvents = pgTable(
  "privacy_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    product: text("product").notNull(),
    operation: text("operation").notNull(),
    decision: text("decision").$type<PrivacyDecisionValue>().notNull(),
    ruleIds: text("rule_ids").array().notNull().default(sql`'{}'::text[]`),
    /** 0 = politique par défaut de Nexora (aucune ligne dans `privacy_policies`). */
    policyVersion: integer("policy_version").notNull().default(0),
    /** Hôte ou identifiant de modèle visé ; jamais un chemin ni une requête. */
    destination: text("destination"),
    destinationKind: text("destination_kind"),
    dataKinds: text("data_kinds").array().notNull().default(sql`'{}'::text[]`),
    detected: text("detected").array().notNull().default(sql`'{}'::text[]`),
    maskedCount: integer("masked_count").notNull().default(0),
    denyReason: text("deny_reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("privacy_events_org_idx").on(t.organizationId, t.createdAt),
    check(
      "privacy_events_decision_check",
      sql`${t.decision} IN (${inList(PRIVACY_DECISIONS)})`,
    ),
    check("privacy_events_counts_check", sql`${t.maskedCount} >= 0`),
  ],
);
