import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  dueBalanceAlerts,
  getBalanceAlert,
  markBalanceAlertSent,
  rearmRecoveredAlerts,
  setBalanceAlert,
} from "./balance-alerts.ts";
import { credit, debit } from "./ledger.ts";
import {
  members,
  organizationBilling,
  organizations,
  users,
} from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-10-29T12:00:00Z");

async function org(opts: { balance?: bigint; emails?: [string, string][] }) {
  const id = `org_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  for (const [email, role] of opts.emails ?? [[`${id}@exemple.ca`, "owner"]]) {
    const userId = `u_${randomBytes(5).toString("hex")}`;
    await t.db.insert(users).values({
      id: userId,
      name: email,
      email,
      emailVerified: true,
      locale: "en",
    });
    await t.db
      .insert(members)
      .values({ id: `m_${userId}`, organizationId: id, userId, role });
  }
  if (opts.balance && opts.balance > 0n)
    await credit(t.db, {
      organizationId: id,
      amountMicro: opts.balance,
      idempotencyKey: `c-${id}`,
      configVersion: "cfg_t",
      source: "purchase",
    });
  return id;
}

describe("seuil d'alerte du solde", () => {
  it("se lit, s'enregistre, se met à jour ; seuil nul ou négatif refusé", async () => {
    const id = await org({});
    expect(await getBalanceAlert(t.db, id)).toBeNull();
    await setBalanceAlert(t.db, id, {
      enabled: true,
      thresholdMicro: 5_000_000n,
      updatedBy: "u1",
    });
    expect(await getBalanceAlert(t.db, id)).toMatchObject({
      enabled: true,
      thresholdMicro: 5_000_000n,
      lastAlertedAt: null,
    });
    await setBalanceAlert(t.db, id, {
      enabled: false,
      thresholdMicro: 8_000_000n,
      updatedBy: "u1",
    });
    expect(await getBalanceAlert(t.db, id)).toMatchObject({
      enabled: false,
      thresholdMicro: 8_000_000n,
    });
    await expect(
      setBalanceAlert(t.db, id, { enabled: true, thresholdMicro: 0n }),
    ).rejects.toThrow();
  });
});

describe("alertes à envoyer", () => {
  it("solde sous le seuil : un courriel aux propriétaires seulement, dans leur langue", async () => {
    const id = await org({
      balance: 3_000_000n,
      emails: [
        ["proprio@exemple.ca", "owner"],
        ["membre@exemple.ca", "member"],
      ],
    });
    await setBalanceAlert(t.db, id, {
      enabled: true,
      thresholdMicro: 5_000_000n,
    });
    const due = (await dueBalanceAlerts(t.db, NOW)).filter(
      (d) => d.organizationId === id,
    );
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      thresholdMicro: 5_000_000n,
      availableMicro: 3_000_000n,
      recipients: [{ email: "proprio@exemple.ca", locale: "en" }],
    });
  });

  it("solde au-dessus du seuil, alerte désactivée ou organisation maison : rien", async () => {
    const above = await org({ balance: 9_000_000n });
    await setBalanceAlert(t.db, above, {
      enabled: true,
      thresholdMicro: 5_000_000n,
    });
    const off = await org({ balance: 1_000_000n });
    await setBalanceAlert(t.db, off, {
      enabled: false,
      thresholdMicro: 5_000_000n,
    });
    const house = await org({ balance: 1_000_000n });
    await setBalanceAlert(t.db, house, {
      enabled: true,
      thresholdMicro: 5_000_000n,
    });
    await t.db
      .insert(organizationBilling)
      .values({ organizationId: house, mode: "house" });
    const ids = (await dueBalanceAlerts(t.db, NOW)).map(
      (d) => d.organizationId,
    );
    expect(ids).not.toContain(above);
    expect(ids).not.toContain(off);
    expect(ids).not.toContain(house);
  });

  it("une alerte envoyée n'est pas renvoyée tant que le solde reste bas, puis se réarme quand il remonte", async () => {
    const id = await org({ balance: 3_000_000n });
    await setBalanceAlert(t.db, id, {
      enabled: true,
      thresholdMicro: 5_000_000n,
    });
    expect(await markBalanceAlertSent(t.db, id, NOW)).toBe(true);
    // Deux workers : le second ne marque pas une seconde fois.
    expect(await markBalanceAlertSent(t.db, id, NOW)).toBe(false);
    expect(
      (await dueBalanceAlerts(t.db, NOW)).map((d) => d.organizationId),
    ).not.toContain(id);
    await rearmRecoveredAlerts(t.db);
    expect((await getBalanceAlert(t.db, id))?.lastAlertedAt).not.toBeNull();
    // Recharge au-dessus du seuil : réarmée.
    await credit(t.db, {
      organizationId: id,
      amountMicro: 10_000_000n,
      idempotencyKey: `r-${id}`,
      configVersion: "cfg_t",
      source: "purchase",
    });
    expect(await rearmRecoveredAlerts(t.db)).toBeGreaterThanOrEqual(1);
    expect((await getBalanceAlert(t.db, id))?.lastAlertedAt).toBeNull();
    // Le solde retombe : nouvelle alerte.
    await debit(t.db, {
      organizationId: id,
      amountMicro: 9_000_000n,
      idempotencyKey: `d-${id}`,
      configVersion: "cfg_t",
      kind: "refund",
      source: "stripe_refund",
    });
    expect(
      (await dueBalanceAlerts(t.db, NOW)).map((d) => d.organizationId),
    ).toContain(id);
  });

  it("changer le seuil réarme l'alerte", async () => {
    const id = await org({ balance: 3_000_000n });
    await setBalanceAlert(t.db, id, {
      enabled: true,
      thresholdMicro: 5_000_000n,
    });
    await markBalanceAlertSent(t.db, id, NOW);
    await setBalanceAlert(t.db, id, {
      enabled: true,
      thresholdMicro: 6_000_000n,
    });
    expect((await getBalanceAlert(t.db, id))?.lastAlertedAt).toBeNull();
  });
});
