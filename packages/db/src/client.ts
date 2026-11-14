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
  let effectiveHost = options.host;
  if (!effectiveHost) {
    try {
      const candidate = new URL(url).searchParams.get("host");
      if (candidate?.startsWith("/")) effectiveHost = candidate;
    } catch {
      // Laisse postgres.js signaler toute URL mal formée.
    }
  }
  const connectionUrl = effectiveHost
    ? (() => {
        const parsed = new URL(url);
        parsed.searchParams.delete("host");
        return parsed.toString();
      })()
    : url;
  const sql = postgres(connectionUrl, {
    max: options.max ?? 10,
    ...(effectiveHost ? { host: effectiveHost } : {}),
    onnotice: () => {},
  });
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}
