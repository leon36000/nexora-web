import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Demandes de contact et de diagnostic (formulaire public, S3). Chaque demande est enregistrée UNE fois :
 * `fingerprint` (SHA-256 du courriel et du contenu) sert à écarter un doublon reçu dans les 24 h.
 * Les valeurs de `need`, `sector` et `deployment` sont des clés (voir `leads.ts`) ; `notified_at` est
 * renseigné par le worker une fois le courriel de notification envoyé à l'équipe.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fingerprint: text("fingerprint").notNull(),
    lang: text("lang").notNull(),
    need: text("need").notNull(),
    sector: text("sector").notNull(),
    deployment: text("deployment").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company").notNull(),
    message: text("message"),
    /** Consentement marketing : séparé, jamais coché par défaut, jamais déduit de la demande. */
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    index("leads_fingerprint_idx").on(t.fingerprint, t.createdAt),
    index("leads_created_idx").on(t.createdAt),
    check("leads_lang_check", sql`${t.lang} IN ('fr', 'en')`),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
