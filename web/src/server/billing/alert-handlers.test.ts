import { getBalanceAlert } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AccountContext,
  AccountKeysDeps,
} from "../gateway/account-handlers";
import { newOrganization } from "../gateway/test-support";
import { handleSetBalanceAlert } from "./alert-handlers";

let t: TestDatabase;
let org: string;
const SITE = "http://localhost:3500";
beforeAll(async () => {
  t = await createTestDatabase();
  org = await newOrganization(t.db);
});
afterAll(async () => {
  await t.drop();
});

const deps = (ctx: AccountContext | null): AccountKeysDeps => ({
  db: () => t.db,
  siteUrl: SITE,
  getContext: async () => ctx,
  log: createLogger({ name: "test", sink: () => {} }),
  now: () => new Date(),
});
const owner = (): AccountContext => ({
  userId: "u1",
  organizationId: org,
  role: "owner",
});
const put = (body: unknown, origin = SITE) =>
  new Request(`${SITE}/api/account/balance-alert`, {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("alerte de solde bas : enregistrement", () => {
  it("le propriétaire fixe un seuil en dollars (virgule acceptée)", async () => {
    const res = await handleSetBalanceAlert(
      put({ enabled: true, thresholdCad: "12,50" }),
      deps(owner()),
    );
    expect(res.status).toBe(200);
    expect(await getBalanceAlert(t.db, org)).toMatchObject({
      enabled: true,
      thresholdMicro: 12_500_000n,
      updatedBy: "u1",
    });
  });

  it("peut désactiver l'alerte en gardant le seuil", async () => {
    await handleSetBalanceAlert(
      put({ enabled: false, thresholdCad: "20" }),
      deps(owner()),
    );
    expect(await getBalanceAlert(t.db, org)).toMatchObject({
      enabled: false,
      thresholdMicro: 20_000_000n,
    });
  });

  it("refuse un seuil nul, négatif, illisible ou démesuré", async () => {
    for (const thresholdCad of ["0", "-5", "abc", "", "1000001"])
      expect(
        (
          await handleSetBalanceAlert(
            put({ enabled: true, thresholdCad }),
            deps(owner()),
          )
        ).status,
      ).toBe(422);
  });

  it("refuse : origine étrangère, sans session, membre simple, champ inconnu", async () => {
    expect(
      (
        await handleSetBalanceAlert(
          put({ enabled: true, thresholdCad: "5" }, "https://evil.example"),
          deps(owner()),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleSetBalanceAlert(
          put({ enabled: true, thresholdCad: "5" }),
          deps(null),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleSetBalanceAlert(
          put({ enabled: true, thresholdCad: "5" }),
          deps({ ...owner(), role: "member" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleSetBalanceAlert(
          put({ enabled: true, thresholdCad: "5", organizationId: "org_x" }),
          deps(owner()),
        )
      ).status,
    ).toBe(422);
  });

  it("l'organisation vient de la session", async () => {
    const other = await newOrganization(t.db);
    await handleSetBalanceAlert(
      put({ enabled: true, thresholdCad: "7" }),
      deps({ userId: "u2", organizationId: other, role: "owner" }),
    );
    expect((await getBalanceAlert(t.db, other))?.thresholdMicro).toBe(
      7_000_000n,
    );
    expect((await getBalanceAlert(t.db, org))?.thresholdMicro).toBe(
      20_000_000n,
    );
  });
});
