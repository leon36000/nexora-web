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

/** En mode de labo isolé, seuls les sockets Unix locaux sont acceptés. */
function isolatedLabConnection(value: string): {
  url: string;
  connectionUrl: string;
  socket: string;
} {
  try {
    const url = new URL(value);
    const hosts = url.searchParams.getAll("host");
    const socketPath = hosts[0];
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname !== "localhost" ||
      url.password !== "" ||
      hosts.length !== 1 ||
      !socketPath?.startsWith("/") ||
      socketPath.includes(",")
    )
      throw new Error("invalid");
    url.searchParams.delete("host");
    return { url: value, connectionUrl: url.toString(), socket: socketPath };
  } catch {
    throw new Error(
      "NEXORA_TEST_DATABASE_URL doit viser un socket PostgreSQL Unix local sans mot de passe.",
    );
  }
}

/**
 * Crée une base PostgreSQL jetable (nexora_test_xxxx) sur le serveur de DATABASE_URL, y applique
 * les migrations et la renvoie. La base « app » n'est jamais touchée par les tests.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const explicitLabUrl = process.env.NEXORA_TEST_DATABASE_URL;
  const lab =
    explicitLabUrl !== undefined ? isolatedLabConnection(explicitLabUrl) : null;
  let adminUrl: string | undefined;
  if (lab) {
    adminUrl = lab.url;
  } else {
    loadRootEnv();
    adminUrl = process.env.DATABASE_URL;
  }
  if (!adminUrl) {
    throw new Error(
      "DATABASE_URL est absent : lance la pile et scripts/init-dev-env.sh.",
    );
  }
  const name = `nexora_test_${randomBytes(6).toString("hex")}`;
  const socketOptions = lab ? { host: lab.socket } : {};
  const admin = postgres(lab?.connectionUrl ?? adminUrl, {
    ...socketOptions,
    max: 1,
    onnotice: () => {},
  });
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const handle = createDb(url.toString(), { ...socketOptions, max: 10 });
  await runMigrations(handle.db);

  return {
    ...handle,
    url: url.toString(),
    async drop() {
      await handle.close();
      const cleaner = postgres(lab?.connectionUrl ?? adminUrl, {
        ...socketOptions,
        max: 1,
        onnotice: () => {},
      });
      try {
        await cleaner.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleaner.end({ timeout: 5 });
      }
    },
  };
}
