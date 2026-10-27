import { createDb } from "./client.ts";
import { loadRootEnv } from "./env.ts";
import { runMigrations } from "./migrate.ts";

loadRootEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL est absent (voir scripts/init-dev-env.sh).");
  process.exit(1);
}

const handle = createDb(url, { max: 1 });
try {
  await runMigrations(handle.db);
  console.log("Migrations appliquées.");
} catch (error) {
  console.error(
    "Échec des migrations :",
    error instanceof Error ? error.name : "erreur inconnue",
  );
  process.exitCode = 1;
} finally {
  await handle.close();
}
