import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { isValidIndexNowKey } from "@nexora/seo";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOrCreateIndexNowKey, readIndexNowKey } from "./indexnow-key";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

describe("clé IndexNow", () => {
  it("aucune clé tant que personne n'en a demandé (la lecture publique ne crée rien)", async () => {
    expect(await readIndexNowKey(t.db)).toBeNull();
  });
  it("générée au premier besoin, stable ensuite, identique pour des appels simultanés", async () => {
    const keys = await Promise.all(
      Array.from({ length: 8 }, () => getOrCreateIndexNowKey(t.db)),
    );
    expect(new Set(keys).size).toBe(1);
    expect(isValidIndexNowKey(keys[0])).toBe(true);
    expect(await getOrCreateIndexNowKey(t.db)).toBe(keys[0]);
    expect(await readIndexNowKey(t.db)).toBe(keys[0]);
  });
});
