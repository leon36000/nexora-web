import { creativeSettings, type Database } from "@nexora/db";
import { eq } from "drizzle-orm";
import {
  type CreativeConfig,
  creativeConfigSchema,
  defaultCreativeConfig,
} from "./config";
import type { CreativeStore } from "./handlers";

const KEY = "models";

/** Stockage PostgreSQL de la configuration (table creative_settings, clé « models »). */
export function pgCreativeStore(db: Database): CreativeStore {
  return {
    async read() {
      const [row] = await db
        .select()
        .from(creativeSettings)
        .where(eq(creativeSettings.key, KEY));
      if (!row)
        return {
          config: defaultCreativeConfig(),
          updatedAt: null,
          updatedBy: null,
        };
      // Une ligne illisible (schéma futur, édition manuelle) ne casse jamais l'application : retour à « rien de forcé ».
      const parsed = creativeConfigSchema.safeParse(row.value);
      return {
        config: parsed.success
          ? (parsed.data as CreativeConfig)
          : defaultCreativeConfig(),
        updatedAt: parsed.success ? row.updatedAt : null,
        updatedBy: row.updatedBy,
      };
    },
    async write(config, updatedBy) {
      const now = new Date();
      await db
        .insert(creativeSettings)
        .values({ key: KEY, value: config, updatedBy, updatedAt: now })
        .onConflictDoUpdate({
          target: creativeSettings.key,
          set: { value: config, updatedBy, updatedAt: now },
        });
      return now;
    },
  };
}
