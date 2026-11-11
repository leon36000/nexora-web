/**
 * Facturation exacte, chantier 4 : preuve de durabilité avec un VRAI arrêt brutal. Un sous-processus Bun exécute une
 * requête en flux (réservation + intention écrites, l'amont a déjà livré du contenu) ; le test le tue par SIGKILL avant
 * tout règlement, puis la reprise du grand livre règle la requête perdue (avant : libération à zéro, aucune trace).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  eq,
  getAccount,
  reconciliationFindings,
  releaseStaleReservationsDetailed,
} from "@nexora/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, createKit, eventsOf, type Kit, M } from "./billing-kit";

let kit: Kit;
beforeAll(async () => {
  kit = await createKit();
});
afterAll(async () => {
  await kit.t.drop();
});

describe("arrêt brutal du processus entre la réservation et le règlement", () => {
  it("SIGKILL en plein flux : la reprise règle la requête à l'estimé et consigne l'anomalie", async () => {
    const c = await client(kit.t, 5n * M);
    const child = spawn(
      "bun",
      [fileURLToPath(new URL("./billing-crash.child.ts", import.meta.url))],
      {
        env: { ...process.env, CRASH_DB_URL: kit.t.url, CRASH_KEY: c.key },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "";
    let err = "";
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`enfant trop lent : ${err}`)),
        25_000,
      );
      child.stdout.on("data", (d) => {
        out += String(d);
        if (out.includes("READY")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on("exit", () => reject(new Error(`enfant sorti : ${err}`)));
    });
    child.removeAllListeners("exit");
    const exited = new Promise((r) => child.once("exit", r));
    child.kill("SIGKILL");
    await exited;

    // Avant la reprise : rien n'est réglé, la réservation est ouverte et l'intention existe.
    expect((await getAccount(kit.t.db, c.org)).heldMicro).toBeGreaterThan(0n);
    expect(await eventsOf(kit.t, c.org)).toHaveLength(0);

    const result = await releaseStaleReservationsDetailed(kit.t.db, {
      olderThan: new Date(Date.now() + 3_600_000),
    });
    expect(result.recovered).toBeGreaterThanOrEqual(1);
    const acct = await getAccount(kit.t.db, c.org);
    expect(acct.heldMicro).toBe(0n);
    expect(acct.balanceMicro).toBeLessThan(5n * M);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e).toMatchObject({
      requestId: "req_crash_1",
      usageSource: "settled_by_recovery",
      status: "aborted",
    });
    const findings = await kit.t.db
      .select()
      .from(reconciliationFindings)
      .where(eq(reconciliationFindings.requestId, "req_crash_1"));
    expect(findings.map((f) => f.kind)).toEqual(["recovered_in_flight"]);
  }, 60_000);
});
