import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { createDb, type DbHandle } from "./client.ts";
import { loadRootEnv } from "./env.ts";
import { runMigrations } from "./migrate.ts";

export interface TestDatabase extends DbHandle {
  /** URL de la base jetable (secret : ne pas journaliser). */
  url: string;
  drop(): Promise<void>;
}

/**
 * Crée une base PostgreSQL jetable (nexora_test_xxxx) sur le serveur de DATABASE_URL, y applique
 * les migrations et la renvoie. La base « app » n'est jamais touchée par les tests.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  loadRootEnv();
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      "DATABASE_URL est absent : lance la pile et scripts/init-dev-env.sh.",
    );
  }
  const name = `nexora_test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const handle = createDb(url.toString(), { max: 10 });
  await runMigrations(handle.db);

  return {
    ...handle,
    url: url.toString(),
    async drop() {
      await handle.close();
      const cleaner = postgres(adminUrl, { max: 1, onnotice: () => {} });
      try {
        await cleaner.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleaner.end({ timeout: 5 });
      }
    },
  };
}
