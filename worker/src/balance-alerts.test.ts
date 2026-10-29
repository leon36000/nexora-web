import { randomBytes } from "node:crypto";
import {
  credit,
  getBalanceAlert,
  members,
  organizations,
  setBalanceAlert,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  composeBalanceAlert,
  registerBalanceAlertHandler,
} from "./balance-alerts.ts";
import { defaultRegistry } from "./handlers.ts";
import { HandlerRegistry } from "./registry.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
const silent = createLogger({ name: "test", sink: () => {} });
const ctx = { log: silent, signal: new AbortController().signal };
const job = {
  id: "j",
  type: "billing.balance-alerts",
  payload: {},
  attempt: 1,
  maxAttempts: 1,
};
const M = 1_000_000n;

async function orgWithOwner(email: string, balance: bigint, locale = "fr") {
  const id = `org_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  const userId = `u_${randomBytes(5).toString("hex")}`;
  await t.db
    .insert(users)
    .values({ id: userId, name: "P", email, emailVerified: true, locale });
  await t.db
    .insert(members)
    .values({ id: `m_${userId}`, organizationId: id, userId, role: "owner" });
  await credit(t.db, {
    organizationId: id,
    amountMicro: balance,
    idempotencyKey: `c-${id}`,
    configVersion: "t",
    source: "purchase",
  });
  await setBalanceAlert(t.db, id, { enabled: true, thresholdMicro: 5n * M });
  return id;
}

function register(sent: { to: string; subject: string; text: string }[]) {
  return registerBalanceAlertHandler(new HandlerRegistry(), {
    db: t.db,
    log: silent,
    mailer: {
      async send(m) {
        sent.push({ to: m.to, subject: m.subject, text: m.text });
      },
    },
    from: "site@exemple.ca",
    siteUrl: "https://exemple.ca",
    now: () => new Date("2026-10-29T12:00:00Z"),
  });
}

describe("courriel d'alerte de solde", () => {
  it("fr : montants et lien de l'espace client, aucun secret", () => {
    const m = composeBalanceAlert(
      { thresholdMicro: 5n * M, availableMicro: 3_500_000n, locale: "fr" },
      "https://exemple.ca",
    );
    expect(m.subject).toContain("solde");
    expect(m.text).toContain("3,50");
    expect(m.text).toContain("5,00");
    expect(m.text).toContain("https://exemple.ca/compte/facturation");
  });
  it("en : texte anglais, adresse /en/", () => {
    const m = composeBalanceAlert(
      { thresholdMicro: 5n * M, availableMicro: 3_500_000n, locale: "en" },
      "https://exemple.ca",
    );
    expect(m.subject).toMatch(/balance/i);
    expect(m.text).toContain("https://exemple.ca/en/compte/facturation");
  });
});

describe("tâche billing.balance-alerts", () => {
  it("le registre du worker la connaît", () => {
    expect(defaultRegistry({ db: t.db, log: silent }).types()).toContain(
      "billing.balance-alerts",
    );
  });

  it("envoie un courriel par propriétaire sous le seuil, une seule fois", async () => {
    const id = await orgWithOwner("bas@exemple.ca", 3n * M);
    const ok = await orgWithOwner("ok@exemple.ca", 9n * M);
    const sent: { to: string; subject: string; text: string }[] = [];
    const handler = register(sent).get("billing.balance-alerts");
    if (!handler) throw new Error("gestionnaire attendu");
    await handler(job, ctx);
    expect(sent.filter((s) => s.to === "bas@exemple.ca")).toHaveLength(1);
    expect(sent.some((s) => s.to === "ok@exemple.ca")).toBe(false);
    expect((await getBalanceAlert(t.db, id))?.lastAlertedAt).not.toBeNull();
    expect((await getBalanceAlert(t.db, ok))?.lastAlertedAt).toBeNull();
    await handler(job, ctx);
    expect(sent.filter((s) => s.to === "bas@exemple.ca")).toHaveLength(1);
  });

  it("sans messagerie configurée : rien n'est marqué envoyé (on réessaiera)", async () => {
    const id = await orgWithOwner("sansmail@exemple.ca", 1n * M);
    const registry = registerBalanceAlertHandler(new HandlerRegistry(), {
      db: t.db,
      log: silent,
      mailer: null,
      from: "site@exemple.ca",
      siteUrl: "https://exemple.ca",
    });
    await registry.get("billing.balance-alerts")?.(job, ctx);
    expect((await getBalanceAlert(t.db, id))?.lastAlertedAt).toBeNull();
  });

  it("un envoi en échec ne marque pas l'alerte", async () => {
    const id = await orgWithOwner("panne@exemple.ca", 1n * M);
    const registry = registerBalanceAlertHandler(new HandlerRegistry(), {
      db: t.db,
      log: silent,
      mailer: {
        async send() {
          throw new Error("SMTP indisponible");
        },
      },
      from: "site@exemple.ca",
      siteUrl: "https://exemple.ca",
    });
    await expect(
      registry.get("billing.balance-alerts")?.(job, ctx),
    ).rejects.toThrow();
    expect((await getBalanceAlert(t.db, id))?.lastAlertedAt).toBeNull();
  });
});
