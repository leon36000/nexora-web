import { type Database, sql } from "@nexora/db";

const NO_STORE = { "cache-control": "no-store" };

/** État du service : répond 200 si la base app répond, 503 sinon. Aucun détail interne n'est exposé. */
export async function handleHealth(
  db: () => Database,
  options: { timeoutMs?: number } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  let database: "ok" | "error" = "error";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ping = db().execute(sql`SELECT 1`);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });
    await Promise.race([ping, timeout]);
    database = "ok";
  } catch {
    database = "error";
  } finally {
    if (timer) clearTimeout(timer);
  }
  const ok = database === "ok";
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      service: "nexora-web",
      checks: { database },
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: NO_STORE },
  );
}
