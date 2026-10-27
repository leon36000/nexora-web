import { createDb, type Database, type DbHandle } from "@nexora/db";

const globalForDb = globalThis as unknown as { __nexoraDb?: DbHandle };

/** Base « app » (singleton par processus, conservé entre les rechargements à chaud en développement). */
export function getDb(): Database {
  if (!globalForDb.__nexoraDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL est absent");
    globalForDb.__nexoraDb = createDb(url, { max: 10 });
  }
  return globalForDb.__nexoraDb.db;
}
