import { type Database, eq, seoSettings } from "@nexora/db";
import { generateIndexNowKey, isValidIndexNowKey } from "@nexora/seo";

const KEY_NAME = "indexnow_key";

/** Clé IndexNow enregistrée, ou null. Lecture seule : aucune requête publique ne crée de clé. */
export async function readIndexNowKey(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ value: seoSettings.value })
    .from(seoSettings)
    .where(eq(seoSettings.key, KEY_NAME));
  return row && isValidIndexNowKey(row.value) ? row.value : null;
}

/**
 * Clé IndexNow du site, générée au premier besoin (32 hex) et conservée dans `seo_settings`. La clé est PUBLIQUE par
 * conception du protocole (le fichier `/<clé>.txt` la prouve) : ce n'est pas un secret, donc pas dans le Coffre.
 * Deux appels simultanés convergent sur la même clé (insertion sans écrasement, puis relecture).
 */
export async function getOrCreateIndexNowKey(db: Database): Promise<string> {
  const existing = await readIndexNowKey(db);
  if (existing) return existing;
  await db
    .insert(seoSettings)
    .values({ key: KEY_NAME, value: generateIndexNowKey() })
    .onConflictDoNothing();
  const key = await readIndexNowKey(db);
  if (!key) throw new Error("clé IndexNow non enregistrée");
  return key;
}
