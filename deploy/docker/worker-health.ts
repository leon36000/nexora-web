// Sonde de santé du conteneur worker (HEALTHCHECK) : le processus principal tourne ET la base `app` répond.
// Lancée par le même point d'entrée que le worker pour disposer de DATABASE_URL (lue depuis son secret).
import { readdirSync, readFileSync } from "node:fs";
import { createDb, sql } from "@nexora/db";

// Le processus « node src/main.ts » existe (le conteneur peut avoir un processus d'init en PID 1).
const running = readdirSync("/proc")
  .filter((d) => /^\d+$/.test(d) && Number(d) !== process.pid)
  .some((d) => {
    try {
      return readFileSync(`/proc/${d}/cmdline`, "utf8")
        .split("\0")
        .includes("src/main.ts");
    } catch {
      return false;
    }
  });
if (!running) {
  console.error("processus principal du worker absent");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL absent");
  process.exit(1);
}
const handle = createDb(url, { max: 1 });
try {
  await handle.db.execute(sql`select 1`);
  await handle.close();
} catch {
  console.error("base de données injoignable");
  process.exit(1);
}
