import { eq } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { finalizeWebpilot } from "@nexora/webpilot";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityBreakdown } from "../gateway/activity";
import { webpilotActivity } from "./activity";
import { publishPrices, seedClient } from "./test-support";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await publishPrices(t.db, {
    page_static: { sell: 1000n, upstream: 100n },
    page_browser: { sell: 6000n },
    browser_minute: { sell: 20_000n },
  });
});
afterAll(async () => {
  await t.drop();
});

async function event(
  org: string,
  key: string,
  operation: "search" | "scrape" | "crawl" | "extract" | "session",
  units: { pageStatic: number; pageBrowser: number; browserMinute: number },
  extra: { status?: "ok" | "error"; house?: boolean } = {},
) {
  const { activePrices } = await import("@nexora/webpilot");
  await finalizeWebpilot(t.db, {
    requestId: `r_${Math.random().toString(16).slice(2)}`,
    organizationId: org,
    apiKeyId: key,
    operation,
    prices: await activePrices(t.db, new Date()),
    status: extra.status ?? "ok",
    httpStatus: 200,
    units,
    reservationId: null,
    house: extra.house ?? true,
    latencyMs: 5,
  });
}
const window = () => ({
  from: new Date(Date.now() - 86_400_000),
  to: new Date(Date.now() + 60_000),
});

describe("activité WebPilot de l'organisation", () => {
  it("pages lues, minutes, requêtes, échecs et valeur par opération", async () => {
    const a = await seedClient(t.db, { house: true });
    const b = await seedClient(t.db, { house: true });
    await event(a.org, a.keyId, "scrape", {
      pageStatic: 1,
      pageBrowser: 0,
      browserMinute: 0,
    });
    await event(a.org, a.keyId, "scrape", {
      pageStatic: 0,
      pageBrowser: 1,
      browserMinute: 0,
    });
    await event(a.org, a.keyId, "crawl", {
      pageStatic: 4,
      pageBrowser: 0,
      browserMinute: 0,
    });
    await event(
      a.org,
      a.keyId,
      "scrape",
      { pageStatic: 1, pageBrowser: 0, browserMinute: 0 },
      { status: "error" },
    );
    await event(b.org, b.keyId, "search", {
      pageStatic: 9,
      pageBrowser: 0,
      browserMinute: 0,
    });
    const out = await webpilotActivity(t.db, {
      organizationId: a.org,
      ...window(),
    });
    expect(out).toMatchObject({
      requests: 4,
      errors: 1,
      pagesStatic: 5,
      pagesBrowser: 1,
      browserMinutes: 0,
      valueMicro: 11_000n,
      costMicro: 0n,
    });
    const scrape = out.byOperation.find((o) => o.operation === "scrape");
    expect(scrape).toMatchObject({ requests: 3, pages: 2 });
    expect(out.byOperation.map((o) => o.operation).sort()).toEqual([
      "crawl",
      "scrape",
    ]);
  });

  it("organisation sans événement WebPilot : zéros", async () => {
    const c = await seedClient(t.db);
    expect(
      await webpilotActivity(t.db, { organizationId: c.org, ...window() }),
    ).toMatchObject({
      requests: 0,
      pagesStatic: 0,
      byOperation: [],
    });
  });

  it("hors fenêtre : ignoré", async () => {
    const a = await seedClient(t.db, { house: true });
    await event(a.org, a.keyId, "scrape", {
      pageStatic: 1,
      pageBrowser: 0,
      browserMinute: 0,
    });
    const old = { from: new Date("2020-01-01"), to: new Date("2020-02-01") };
    expect(
      (await webpilotActivity(t.db, { organizationId: a.org, ...old }))
        .requests,
    ).toBe(0);
  });

  it("la répartition par modèle de la passerelle ne mélange pas WebPilot", async () => {
    const a = await seedClient(t.db, { house: true });
    await event(a.org, a.keyId, "scrape", {
      pageStatic: 1,
      pageBrowser: 0,
      browserMinute: 0,
    });
    const rows = await activityBreakdown(
      t.db,
      { organizationId: a.org, ...window() },
      "model",
    );
    expect(rows.find((r) => r.key.startsWith("webpilot/"))).toBeUndefined();
    void eq;
  });
});
