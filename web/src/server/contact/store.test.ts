import { eq, jobs, leads } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fingerprintOf, parseContact } from "./schema";
import { createAltchaStore, NOTIFY_JOB, saveLead } from "./store";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(jobs);
  await t.db.delete(leads);
});

const input = {
  need: "diagnostic",
  sector: "construction",
  deployment: "heberge",
  name: "Marc Gagnon",
  email: "marc@exemple.ca",
  company: "Gagnon et fils",
  message: "Nous voulons trier nos courriels.",
};
const data = (over: Record<string, unknown> = {}) => {
  const r = parseContact({ ...input, ...over });
  if (!r.ok) throw new Error("fixture");
  return r.data;
};

describe("enregistrement d'une demande", () => {
  it("enregistre la demande une fois et met la notification en file dans la même transaction", async () => {
    const d = data();
    const r = await saveLead(t.db, d, fingerprintOf(d), "fr");
    expect(r.status).toBe("created");
    const rows = await t.db.select().from(leads);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "marc@exemple.ca",
      lang: "fr",
      marketingConsent: false,
      notifiedAt: null,
    });
    const queue = await t.db.select().from(jobs);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ type: NOTIFY_JOB, status: "pending" });
    // la charge ne contient que l'identifiant : aucun renseignement personnel dans la file
    expect(queue[0]?.payload).toEqual({ leadId: rows[0]?.id });
  });

  it("une même demande dans les 24 h n'est ni réenregistrée ni renotifiée", async () => {
    const d = data();
    const first = await saveLead(t.db, d, fingerprintOf(d), "fr");
    const again = await saveLead(
      t.db,
      data({ email: "MARC@exemple.ca" }),
      fingerprintOf(d),
      "fr",
    );
    expect(again.status).toBe("duplicate");
    expect(again.id).toBe(first.id);
    expect(await t.db.select().from(leads)).toHaveLength(1);
    expect(await t.db.select().from(jobs)).toHaveLength(1);
  });

  it("deux envois simultanés de la même demande ne produisent qu'une ligne", async () => {
    const d = data();
    const fp = fingerprintOf(d);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => saveLead(t.db, d, fp, "fr")),
    );
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(await t.db.select().from(leads)).toHaveLength(1);
    expect(await t.db.select().from(jobs)).toHaveLength(1);
  });

  it("au-delà de 24 h, la même demande est de nouveau acceptée", async () => {
    const d = data();
    const fp = fingerprintOf(d);
    await saveLead(t.db, d, fp, "fr");
    await t.db
      .update(leads)
      .set({ createdAt: new Date(Date.now() - 25 * 3_600_000) })
      .where(eq(leads.fingerprint, fp));
    const r = await saveLead(t.db, d, fp, "fr");
    expect(r.status).toBe("created");
    expect(await t.db.select().from(leads)).toHaveLength(2);
  });

  it("un autre contenu du même courriel est une autre demande", async () => {
    const a = data();
    const b = data({ message: "Autre besoin" });
    await saveLead(t.db, a, fingerprintOf(a), "fr");
    const r = await saveLead(t.db, b, fingerprintOf(b), "en");
    expect(r.status).toBe("created");
    expect(await t.db.select().from(leads)).toHaveLength(2);
  });

  it("garde le consentement marketing tel que donné", async () => {
    const d = data({ marketingConsent: true });
    await saveLead(t.db, d, fingerprintOf(d), "en");
    const row = (await t.db.select().from(leads))[0];
    expect(row).toMatchObject({ marketingConsent: true, lang: "en" });
  });
});

describe("registre des défis Altcha utilisés", () => {
  it("n'accepte un défi qu'une seule fois, même en parallèle", async () => {
    const store = createAltchaStore(t.db);
    const id = `n-${Math.random()}`;
    const out = await Promise.all(
      Array.from({ length: 5 }, () => store.setIfAbsent(id)),
    );
    expect(out.filter(Boolean)).toHaveLength(1);
    expect(await store.get(id)).toBe(true);
    expect(await store.get("jamais-vu")).toBeFalsy();
  });
});
