import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof drizzle<typeof schema>>;
export type Sql = ReturnType<typeof postgres>;

export interface DbHandle {
  db: Database;
  sql: Sql;
  close(): Promise<void>;
}

/** Ouvre un pool PostgreSQL. L'URL ne doit jamais être journalisée (elle contient le mot de passe). */
export function createDb(
  url: string,
  options: { max?: number } = {},
): DbHandle {
  const sql = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}
