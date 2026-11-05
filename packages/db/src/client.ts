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
  options: { max?: number; host?: string } = {},
): DbHandle {
  const connectionUrl = options.host
    ? (() => {
        const parsed = new URL(url);
        parsed.searchParams.delete("host");
        return parsed.toString();
      })()
    : url;
  const sql = postgres(connectionUrl, {
    max: options.max ?? 10,
    ...(options.host ? { host: options.host } : {}),
    onnotice: () => {},
  });
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}
