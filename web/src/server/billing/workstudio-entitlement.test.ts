import { subscriptions } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setBillingMode } from "../gateway/house";
import { newOrganization } from "../gateway/test-support";
import { hasWorkstudioEntitlement } from "./workstudio-entitlement";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-10-29T12:00:00Z");
let n = 0;
async function subscribe(
  organizationId: string,
  over: Partial<typeof subscriptions.$inferInsert>,
) {
  n += 1;
  await t.db.insert(subscriptions).values({
    organizationId,
    stripeSubscriptionId: `sub_${n}`,
    stripeCustomerId: `cus_${n}`,
    planCode: "workstudio-demarrage-month",
    status: "active",
    ...over,
  });
}

describe("droit d'ouvrir WorkStudio (côté serveur)", () => {
  it("refuse une organisation sans abonnement", async () => {
    const org = await newOrganization(t.db);
    expect(await hasWorkstudioEntitlement(t.db, org, NOW)).toBe(false);
  });

  it("accepte un abonnement WorkStudio actif, ou en délai de grâce", async () => {
    const active = await newOrganization(t.db);
    await subscribe(active, { status: "active" });
    expect(await hasWorkstudioEntitlement(t.db, active, NOW)).toBe(true);
    const grace = await newOrganization(t.db);
    await subscribe(grace, {
      status: "past_due",
      graceEndsAt: new Date("2026-11-05T00:00:00Z"),
    });
    expect(await hasWorkstudioEntitlement(t.db, grace, NOW)).toBe(true);
  });

  it("refuse un abonnement résilié, impayé, ou dont la grâce est passée", async () => {
    const canceled = await newOrganization(t.db);
    await subscribe(canceled, { status: "canceled" });
    expect(await hasWorkstudioEntitlement(t.db, canceled, NOW)).toBe(false);
    const late = await newOrganization(t.db);
    await subscribe(late, {
      status: "past_due",
      graceEndsAt: new Date("2026-10-01T00:00:00Z"),
    });
    expect(await hasWorkstudioEntitlement(t.db, late, NOW)).toBe(false);
  });

  it("un abonnement de VPS (sans offre) ne donne pas WorkStudio", async () => {
    const org = await newOrganization(t.db);
    await subscribe(org, { planCode: null, status: "active" });
    expect(await hasWorkstudioEntitlement(t.db, org, NOW)).toBe(false);
  });

  it("l'organisation maison (accès gratuit) y a droit sans abonnement ; elle seule", async () => {
    const house = await newOrganization(t.db);
    await setBillingMode(t.db, house, "house");
    expect(await hasWorkstudioEntitlement(t.db, house, NOW)).toBe(true);
    const other = await newOrganization(t.db);
    expect(await hasWorkstudioEntitlement(t.db, other, NOW)).toBe(false);
  });
});
