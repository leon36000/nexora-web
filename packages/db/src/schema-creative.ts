import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Réglages de Nexora Creative modifiés depuis l'administration (clé/valeur, JSON non secret).
 * Clé « models » : configuration des modèles (voir web/src/server/creative/config.ts). Aucun secret ici :
 * les moteurs cloud désignent leur clé par une référence du Coffre.
 */
export const creativeSettings = pgTable("creative_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
