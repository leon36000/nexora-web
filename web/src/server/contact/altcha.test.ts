import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueChallenge, verifyAltcha } from "./altcha";
import { createAltchaStore } from "./store";

const SECRET = "s".repeat(48);
// coût minimal : le test résout réellement la preuve de travail
const fast = { cost: 10, counterMin: 1, counterMax: 20 };

let t: TestDatabase;
let store: ReturnType<typeof createAltchaStore>;
beforeAll(async () => {
  t = await createTestDatabase();
  store = createAltchaStore(t.db);
});
afterAll(async () => {
  await t.drop();
});

async function solved(secret = SECRET, expiresInSeconds = 600) {
  const challenge = await issueChallenge(secret, { ...fast, expiresInSeconds });
  const solution = await solveChallenge({ challenge, deriveKey });
  if (!solution) throw new Error("preuve non résolue");
  return { challenge, solution };
}
const encode = (v: unknown) => btoa(JSON.stringify(v));

describe("défi Altcha auto-hébergé (HMAC côté serveur, sans service tiers)", () => {
  it("un défi résolu est accepté une fois", async () => {
    const payload = encode(await solved());
    expect(await verifyAltcha(payload, SECRET, store)).toEqual({ ok: true });
  });

  it("le rejeu de la même preuve est refusé", async () => {
    const payload = encode(await solved());
    await verifyAltcha(payload, SECRET, store);
    expect(await verifyAltcha(payload, SECRET, store)).toMatchObject({
      ok: false,
      reason: "replayed",
    });
  });

  it("une preuve signée avec un autre secret est refusée", async () => {
    const payload = encode(await solved("x".repeat(48)));
    expect(await verifyAltcha(payload, SECRET, store)).toMatchObject({
      ok: false,
    });
  });

  it("une solution falsifiée est refusée", async () => {
    const s = await solved();
    const key = s.solution.derivedKey;
    const flipped = (key[0] === "0" ? "1" : "0") + key.slice(1);
    const bad = { ...s, solution: { ...s.solution, derivedKey: flipped } };
    expect(await verifyAltcha(encode(bad), SECRET, store)).toMatchObject({
      ok: false,
    });
  });

  it("un défi modifié (coût abaissé) est refusé : la signature le couvre", async () => {
    const s = await solved();
    const params = { ...s.challenge.parameters, cost: 1 };
    const bad = { ...s, challenge: { ...s.challenge, parameters: params } };
    expect(await verifyAltcha(encode(bad), SECRET, store)).toMatchObject({
      ok: false,
    });
  });

  it("un défi expiré est refusé", async () => {
    const payload = encode(await solved(SECRET, -10));
    const r = await verifyAltcha(payload, SECRET, store);
    expect(r.ok).toBe(false);
  });

  it("une charge absente, vide ou illisible est refusée sans exception", async () => {
    for (const bad of [
      undefined,
      "",
      "pas-du-base64!",
      encode({ a: 1 }),
      42,
      null,
    ])
      expect(await verifyAltcha(bad, SECRET, store)).toMatchObject({
        ok: false,
      });
  });

  it("le défi émis porte les paramètres, une signature et une échéance", async () => {
    const c = await issueChallenge(SECRET, fast);
    expect(c.signature).toMatch(/^[0-9a-f]+$/);
    expect(c.parameters.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(c.parameters.algorithm).toBe("PBKDF2/SHA-256");
  });
});
