import { and, eq, getAccount, usageEvents, webpilotSessions } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activePrices, type Prices } from "./billing.ts";
import {
  advanceSession,
  closeSession,
  dueSessions,
  failOpenSession,
  markBrowserClosed,
  openSession,
  parsePublicSessionId,
  publicSessionId,
  touchSession,
} from "./sessions.ts";
import { fund, newKey, newOrg, publishSheet } from "./test-support.ts";

let t: TestDatabase;
let prices: Prices | null;
beforeAll(async () => {
  t = await createTestDatabase();
  await publishSheet(t.db, {
    browser_minute: { sell: 2000n, upstream: 100n },
  });
  prices = await activePrices(t.db, new Date());
});
afterAll(async () => {
  await t.drop();
});

const T0 = new Date("2026-11-01T10:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

async function start(
  opts: {
    balance?: bigint;
    house?: boolean;
    cap?: bigint;
    maxMinutes?: number;
    idleTimeoutS?: number;
    maxOpen?: number;
  } = {},
) {
  const org = await newOrg(t.db, opts.house);
  const key = await newKey(
    t.db,
    org,
    opts.cap ? { spendCapMicro: opts.cap } : {},
  );
  if (opts.balance) await fund(t.db, org, opts.balance);
  const opened = await openSession(t.db, {
    organizationId: org,
    apiKeyId: key,
    maxMinutes: opts.maxMinutes ?? 10,
    idleTimeoutS: opts.idleTimeoutS ?? 600,
    params: {},
    prices,
    house: Boolean(opts.house),
    maxOpen: opts.maxOpen ?? 3,
    now: T0,
    privacy: { decision: "allow", policyVersion: "pol-1" },
  });
  return { org, key, opened };
}

async function row(id: string) {
  const [r] = await t.db
    .select()
    .from(webpilotSessions)
    .where(eq(webpilotSessions.id, id));
  if (!r) throw new Error("session absente");
  return r;
}
async function events(id: string) {
  return t.db
    .select()
    .from(usageEvents)
    .where(and(eq(usageEvents.endpoint, "webpilot.session")))
    .then((all) => all.filter((e) => e.requestId.startsWith(`wp_ses_${id}_`)));
}
const held = async (org: string) => (await getAccount(t.db, org))?.heldMicro;
const balance = async (org: string) =>
  (await getAccount(t.db, org))?.balanceMicro;

describe("identifiant public", () => {
  it("aller-retour et refus des formes étrangères", () => {
    const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(publicSessionId(uuid)).toBe("ses_0f8fad5bd9cb469fa16570867728950e");
    expect(parsePublicSessionId(publicSessionId(uuid))).toBe(uuid);
    for (const bad of [
      "",
      "crawl_0f8fad5bd9cb469fa16570867728950e",
      "ses_xyz",
      uuid,
    ])
      expect(parsePublicSessionId(bad)).toBeNull();
  });
});

describe("ouverture", () => {
  it("réserve la première minute, une seule, et fixe l'échéance", async () => {
    const { org, opened } = await start({ balance: 10_000n, maxMinutes: 5 });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(await held(org)).toBe(2000n);
    const r = await row(opened.sessionId);
    expect(r).toMatchObject({
      status: "open",
      minutesSettled: 0,
      reservedMicro: 2000n,
      sellCadMicro: 2000n,
      billed: true,
    });
    expect(r.expiresAt.getTime()).toBe(T0.getTime() + 5 * 60_000);
    expect(r.minuteEndsAt.getTime()).toBe(T0.getTime() + 60_000);
    expect(await events(opened.sessionId)).toEqual([]);
  });

  it("refuse sans solde, solde bloqué ou plafond de clé, et ne laisse aucune ligne", async () => {
    const poor = await start({ balance: 1000n });
    expect(poor.opened).toEqual({ ok: false, reason: "insufficient" });
    const none = await start();
    expect(none.opened).toEqual({ ok: false, reason: "insufficient" });
    const capped = await start({ balance: 10_000n, cap: 1000n });
    expect(capped.opened).toEqual({ ok: false, reason: "key_cap" });
    for (const s of [poor, none, capped]) {
      const rows = await t.db
        .select()
        .from(webpilotSessions)
        .where(eq(webpilotSessions.organizationId, s.org));
      expect(rows).toEqual([]);
      expect(await held(s.org)).toBeFalsy();
    }
  });

  it("plafonne les sessions ouvertes par organisation", async () => {
    const org = await newOrg(t.db);
    const key = await newKey(t.db, org);
    await fund(t.db, org, 100_000n);
    const open = () =>
      openSession(t.db, {
        organizationId: org,
        apiKeyId: key,
        maxMinutes: 5,
        idleTimeoutS: 60,
        params: {},
        prices,
        house: false,
        maxOpen: 2,
        now: T0,
        privacy: null,
      });
    expect((await open()).ok).toBe(true);
    expect((await open()).ok).toBe(true);
    expect(await open()).toEqual({ ok: false, reason: "too_many_open" });
    expect(await held(org)).toBe(4000n);
  });

  it("deux ouvertures simultanées ne dépassent pas le plafond", async () => {
    const org = await newOrg(t.db);
    const key = await newKey(t.db, org);
    await fund(t.db, org, 100_000n);
    const open = () =>
      openSession(t.db, {
        organizationId: org,
        apiKeyId: key,
        maxMinutes: 5,
        idleTimeoutS: 60,
        params: {},
        prices,
        house: false,
        maxOpen: 1,
        now: T0,
        privacy: null,
      });
    const out = await Promise.all([open(), open(), open()]);
    expect(out.filter((o) => o.ok)).toHaveLength(1);
  });

  it("l'organisation « maison » ne réserve ni ne débite rien", async () => {
    const { org, opened } = await start({ house: true });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(await held(org)).toBeFalsy();
    const r = await row(opened.sessionId);
    expect(r.billed).toBe(false);
    expect(r.reservationId).toBeNull();
  });
});

describe("facturation par minute entamée", () => {
  it("ne change rien tant que la première minute n'est pas finie", async () => {
    const { org, opened } = await start({ balance: 10_000n });
    if (!opened.ok) throw new Error("ouverture");
    const out = await advanceSession(t.db, opened.sessionId, at(59));
    expect(out?.closedNow).toBe(false);
    expect(await held(org)).toBe(2000n);
    expect(await balance(org)).toBe(10_000n);
  });

  it("règle la minute à son échéance et réserve la suivante dans la même transaction", async () => {
    const { org, opened } = await start({ balance: 10_000n });
    if (!opened.ok) throw new Error("ouverture");
    await advanceSession(t.db, opened.sessionId, at(61));
    expect(await balance(org)).toBe(8000n);
    expect(await held(org)).toBe(2000n);
    const r = await row(opened.sessionId);
    expect(r).toMatchObject({
      minutesSettled: 1,
      costMicro: 2000n,
      status: "open",
    });
    expect(r.minuteEndsAt.getTime()).toBe(T0.getTime() + 120_000);
    const ev = await events(opened.sessionId);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      endpoint: "webpilot.session",
      modelPublicId: "webpilot/session",
      status: "ok",
      unitsBrowserMinute: 1,
      costMicro: 2000n,
      billed: true,
      upstreamCostUsdMicro: 100n,
      privacyDecision: "allow",
      policyVersion: "pol-1",
    });
  });

  it("rattrape plusieurs minutes écoulées, une ligne d'usage par minute", async () => {
    const { org, opened } = await start({ balance: 20_000n });
    if (!opened.ok) throw new Error("ouverture");
    await advanceSession(t.db, opened.sessionId, at(3 * 60 + 10));
    const r = await row(opened.sessionId);
    expect(r.minutesSettled).toBe(3);
    expect(r.costMicro).toBe(6000n);
    expect(await events(opened.sessionId)).toHaveLength(3);
    expect(await held(org)).toBe(2000n);
  });

  it("n'est pas rejouée : deux avances au même instant, même en parallèle, facturent une fois", async () => {
    const { org, opened } = await start({ balance: 20_000n });
    if (!opened.ok) throw new Error("ouverture");
    await Promise.all([
      advanceSession(t.db, opened.sessionId, at(70)),
      advanceSession(t.db, opened.sessionId, at(70)),
      advanceSession(t.db, opened.sessionId, at(70)),
    ]);
    expect((await row(opened.sessionId)).minutesSettled).toBe(1);
    expect(await balance(org)).toBe(18_000n);
    expect(await events(opened.sessionId)).toHaveLength(1);
  });

  it("une fermeture à 10 s coûte une minute pleine et libère tout", async () => {
    const { org, opened } = await start({ balance: 10_000n });
    if (!opened.ok) throw new Error("ouverture");
    const out = await closeSession(
      t.db,
      opened.sessionId,
      "closed_by_client",
      at(10),
    );
    expect(out).toMatchObject({ closedNow: true });
    const r = await row(opened.sessionId);
    expect(r).toMatchObject({
      status: "closed",
      closeReason: "closed_by_client",
      minutesSettled: 1,
      costMicro: 2000n,
      reservationId: null,
      reservedMicro: 0n,
    });
    expect(r.closedAt?.getTime()).toBe(at(10).getTime());
    expect(await held(org)).toBe(0n);
    expect(await balance(org)).toBe(8000n);
  });

  it("une fermeture à 90 s coûte deux minutes (minute entamée)", async () => {
    const { org, opened } = await start({ balance: 10_000n });
    if (!opened.ok) throw new Error("ouverture");
    await closeSession(t.db, opened.sessionId, "closed_by_client", at(90));
    expect((await row(opened.sessionId)).minutesSettled).toBe(2);
    expect(await balance(org)).toBe(6000n);
    expect(await held(org)).toBe(0n);
    expect(await events(opened.sessionId)).toHaveLength(2);
  });

  it("fermer deux fois ne facture pas deux fois et garde le premier motif", async () => {
    const { org, opened } = await start({ balance: 10_000n });
    if (!opened.ok) throw new Error("ouverture");
    await closeSession(t.db, opened.sessionId, "privacy_policy", at(5));
    const again = await closeSession(
      t.db,
      opened.sessionId,
      "closed_by_client",
      at(500),
    );
    expect(again?.closedNow).toBe(false);
    expect((await row(opened.sessionId)).closeReason).toBe("privacy_policy");
    expect(await balance(org)).toBe(8000n);
  });

  it("le solde qui ne couvre pas la minute suivante ferme la session (insufficient_quota)", async () => {
    const { org, opened } = await start({ balance: 4000n });
    if (!opened.ok) throw new Error("ouverture");
    const out = await advanceSession(t.db, opened.sessionId, at(2 * 60 + 5));
    expect(out).toMatchObject({ closedNow: true });
    const r = await row(opened.sessionId);
    expect(r).toMatchObject({
      status: "closed",
      closeReason: "insufficient_quota",
      minutesSettled: 2,
      costMicro: 4000n,
      reservationId: null,
    });
    expect(r.closedAt?.getTime()).toBe(at(120).getTime());
    expect(await balance(org)).toBe(0n);
    expect(await held(org)).toBe(0n);
    const ev = await events(opened.sessionId);
    expect(ev).toHaveLength(2);
    expect(ev.at(-1)?.errorCode).toBe("insufficient_quota");
  });

  it("le plafond de dépense de la clé ferme aussi la session", async () => {
    const { opened } = await start({ balance: 100_000n, cap: 4000n });
    if (!opened.ok) throw new Error("ouverture");
    await advanceSession(t.db, opened.sessionId, at(3 * 60 + 5));
    const r = await row(opened.sessionId);
    expect(r).toMatchObject({
      status: "closed",
      closeReason: "insufficient_quota",
      minutesSettled: 2,
    });
  });

  it("ferme à l'échéance (max_minutes) sans réserver au-delà", async () => {
    const { org, opened } = await start({ balance: 100_000n, maxMinutes: 2 });
    if (!opened.ok) throw new Error("ouverture");
    await advanceSession(t.db, opened.sessionId, at(2 * 60 + 1));
    const r = await row(opened.sessionId);
    expect(r).toMatchObject({
      status: "closed",
      closeReason: "max_minutes",
      minutesSettled: 2,
    });
    expect(r.closedAt?.getTime()).toBe(at(120).getTime());
    expect(await held(org)).toBe(0n);
    expect(await balance(org)).toBe(96_000n);
  });

  it("ferme pour inactivité, facturée jusqu'à l'instant de l'inactivité seulement", async () => {
    const { org, opened } = await start({
      balance: 100_000n,
      idleTimeoutS: 30,
    });
    if (!opened.ok) throw new Error("ouverture");
    await touchSession(t.db, opened.sessionId, at(20), {
      currentHost: "a.test",
    });
    const mid = await advanceSession(t.db, opened.sessionId, at(49));
    expect(mid?.closedNow).toBe(false);
    // Aucune activité depuis 20 s : inactive à 50 s, vue seulement à 400 s (le worker était arrêté).
    await advanceSession(t.db, opened.sessionId, at(400));
    const r = await row(opened.sessionId);
    expect(r).toMatchObject({
      status: "closed",
      closeReason: "idle",
      minutesSettled: 1,
    });
    expect(r.closedAt?.getTime()).toBe(at(50).getTime());
    expect(await balance(org)).toBe(98_000n);
    expect(r.currentHost).toBe("a.test");
  });

  it("la maison est comptée à la valeur du prix public mais jamais débitée", async () => {
    const { org, opened } = await start({ house: true });
    if (!opened.ok) throw new Error("ouverture");
    await closeSession(t.db, opened.sessionId, "closed_by_client", at(70));
    const ev = await events(opened.sessionId);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({
      billed: false,
      costMicro: 0n,
      valueMicro: 2000n,
    });
    expect(await balance(org)).toBeFalsy();
  });

  it("ne garde aucune adresse complète : seulement l'hôte courant", async () => {
    const { opened } = await start({ balance: 10_000n });
    if (!opened.ok) throw new Error("ouverture");
    await touchSession(t.db, opened.sessionId, at(5), {
      currentHost: "exemple.org",
    });
    await closeSession(t.db, opened.sessionId, "closed_by_client", at(6));
    const ev = await events(opened.sessionId);
    expect(ev[0]?.destinationHost).toBe("exemple.org");
    expect(
      JSON.stringify(ev, (_k, v) => (typeof v === "bigint" ? String(v) : v)),
    ).not.toContain("https://");
  });
});

describe("ouverture ratée", () => {
  it("libère la réservation, ne coûte rien et garde une trace sans unité", async () => {
    const { org, opened } = await start({ balance: 10_000n });
    if (!opened.ok) throw new Error("ouverture");
    expect(await held(org)).toBe(2000n);
    await failOpenSession(t.db, opened.sessionId, at(3));
    const r = await row(opened.sessionId);
    expect(r).toMatchObject({
      status: "closed",
      closeReason: "browser_error",
      minutesSettled: 0,
      costMicro: 0n,
      reservationId: null,
    });
    expect(await held(org)).toBe(0n);
    expect(await balance(org)).toBe(10_000n);
    const ev = await events(opened.sessionId);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      status: "error",
      errorCode: "browser_error",
      unitsBrowserMinute: 0,
      costMicro: 0n,
    });
  });

  it("est sans effet sur une session déjà fermée, et rejouable", async () => {
    const { org, opened } = await start({ balance: 10_000n });
    if (!opened.ok) throw new Error("ouverture");
    await failOpenSession(t.db, opened.sessionId, at(3));
    await failOpenSession(t.db, opened.sessionId, at(4));
    expect(await events(opened.sessionId)).toHaveLength(1);
    expect(await balance(org)).toBe(10_000n);
  });
});

describe("balayage du worker", () => {
  it("liste les sessions dont une minute, l'échéance ou l'inactivité est échue, et celles à détruire", async () => {
    const fresh = await start({ balance: 10_000n });
    const late = await start({ balance: 10_000n });
    const idle = await start({ balance: 10_000n, idleTimeoutS: 10 });
    const gone = await start({ balance: 10_000n });
    if (
      !fresh.opened.ok ||
      !late.opened.ok ||
      !idle.opened.ok ||
      !gone.opened.ok
    )
      throw new Error("ouverture");
    await closeSession(t.db, gone.opened.sessionId, "closed_by_client", at(5));
    const due = await dueSessions(t.db, at(30), { limit: 200 });
    const ids = (kind: string) =>
      due.filter((d) => d.kind === kind).map((d) => d.id);
    expect(ids("advance")).toContain(idle.opened.sessionId);
    expect(ids("advance")).not.toContain(fresh.opened.sessionId);
    expect(ids("destroy")).toContain(gone.opened.sessionId);
    const later = await dueSessions(t.db, at(61), { limit: 200 });
    expect(
      later.filter((d) => d.kind === "advance").map((d) => d.id),
    ).toContain(late.opened.sessionId);
    await markBrowserClosed(t.db, gone.opened.sessionId, at(31));
    const after = await dueSessions(t.db, at(32), { limit: 200 });
    expect(
      after.filter((d) => d.kind === "destroy").map((d) => d.id),
    ).not.toContain(gone.opened.sessionId);
  });
});
