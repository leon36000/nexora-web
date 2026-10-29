import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { activePrices } from "@nexora/webpilot";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addFxRate, approveFxRate } from "../gateway/catalog";
import {
  createSheet,
  listSheets,
  publishDraft,
  WebpilotPriceError,
} from "./prices";
import { handlePricesAdmin, type PricesAdminDeps } from "./prices-admin";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof WebpilotPriceError ? e.code : String(e);
  }
};
const past = () => new Date(Date.now() - 60_000);

async function approveFx(usdToCadMicro = 1_400_000n) {
  const fx = await addFxRate(t.db, { usdToCadMicro, effectiveAt: past() });
  await approveFxRate(t.db, fx.id, "test");
}

describe("feuille de prix", () => {
  it("sans coût amont, publie directement ; activePrices la voit", async () => {
    const sheet = await createSheet(t.db, {
      prices: { page_static: { sellCadMicro: 5000n, upstreamUsdMicro: 0n } },
      status: "published",
      effectiveAt: past(),
    });
    expect(sheet.status).toBe("published");
    const prices = await activePrices(t.db, new Date());
    expect(prices?.units.page_static?.sellCadMicro).toBe(5000n);
    expect(prices?.units.page_browser).toBeUndefined();
  });

  it("un brouillon n'est pas en vigueur ; le publier le devient", async () => {
    const draft = await createSheet(t.db, {
      prices: { page_static: { sellCadMicro: 7000n, upstreamUsdMicro: 0n } },
      status: "draft",
    });
    expect(
      (await activePrices(t.db, new Date()))?.units.page_static?.sellCadMicro,
    ).toBe(5000n);
    await publishDraft(t.db, draft.id, { effectiveAt: past() });
    expect(
      (await activePrices(t.db, new Date()))?.units.page_static?.sellCadMicro,
    ).toBe(7000n);
    expect(await code(publishDraft(t.db, draft.id))).toBe("not_a_draft");
    expect(
      await code(publishDraft(t.db, "00000000-0000-0000-0000-000000000000")),
    ).toBe("not_found");
  });

  it("garde de marge : refuse un prix sous le coût amont converti (plancher compris)", async () => {
    // Pas de taux approuvé : impossible de vérifier un coût amont.
    expect(
      await code(
        createSheet(t.db, {
          prices: {
            page_static: { sellCadMicro: 10_000n, upstreamUsdMicro: 1000n },
          },
          status: "published",
        }),
      ),
    ).toBe("fx_missing");
    await approveFx(1_400_000n); // 1 USD = 1,40 CAD
    // 1000 micro-USD = 1400 micro-CAD ; plancher 50 % => 2100 minimum.
    const floor = { marginFloorBps: 5000, upstreamUsdMicro: 1000n };
    expect(
      await code(
        createSheet(t.db, {
          prices: { page_static: { sellCadMicro: 2099n, ...floor } },
          status: "published",
          marginFloorBps: 5000,
        }),
      ),
    ).toBe("margin_floor");
    expect(
      await code(
        createSheet(t.db, {
          prices: {
            page_static: { sellCadMicro: 2100n, upstreamUsdMicro: 1000n },
          },
          status: "published",
          marginFloorBps: 5000,
          effectiveAt: past(),
        }),
      ),
    ).toBe("ok");
    // Sans plancher, jamais sous le coût converti.
    expect(
      await code(
        createSheet(t.db, {
          prices: {
            page_browser: { sellCadMicro: 1399n, upstreamUsdMicro: 1000n },
          },
          status: "published",
        }),
      ),
    ).toBe("margin_floor");
    // Un brouillon peut être enregistré sous le plancher, pas publié.
    const draft = await createSheet(t.db, {
      prices: {
        page_browser: { sellCadMicro: 1000n, upstreamUsdMicro: 1000n },
      },
      status: "draft",
    });
    expect(await code(publishDraft(t.db, draft.id))).toBe("margin_floor");
  });

  it("prix distinct pour le rendu navigateur et la minute de session", async () => {
    await createSheet(t.db, {
      prices: {
        page_static: { sellCadMicro: 2200n, upstreamUsdMicro: 0n },
        page_browser: { sellCadMicro: 9000n, upstreamUsdMicro: 0n },
        browser_minute: { sellCadMicro: 30_000n, upstreamUsdMicro: 0n },
      },
      status: "published",
      effectiveAt: new Date(Date.now() - 1000),
    });
    const p = await activePrices(t.db, new Date());
    expect(p?.units.page_browser?.sellCadMicro).toBe(9000n);
    expect(p?.units.browser_minute?.sellCadMicro).toBe(30_000n);
  });

  it("refuse une feuille vide, une unité inconnue, un montant négatif", async () => {
    expect(await code(createSheet(t.db, { prices: {}, status: "draft" }))).toBe(
      "invalid_request",
    );
    expect(
      await code(
        createSheet(t.db, {
          prices: {
            gigaoctet: { sellCadMicro: 1n, upstreamUsdMicro: 0n },
          } as never,
          status: "draft",
        }),
      ),
    ).toBe("invalid_request");
    expect(
      await code(
        createSheet(t.db, {
          prices: { page_static: { sellCadMicro: -1n, upstreamUsdMicro: 0n } },
          status: "draft",
        }),
      ),
    ).toBe("invalid_request");
  });

  it("liste : la feuille en vigueur et l'historique, montants en chaînes", async () => {
    const out = await listSheets(t.db, new Date());
    expect(out.sheets.length).toBeGreaterThan(3);
    expect(out.current?.status).toBe("published");
    expect(typeof out.current?.prices.page_static?.sellCadMicro).toBe("string");
  });
});

describe("API d'administration", () => {
  const TOKEN = "t".repeat(40);
  const deps = (adminToken: string | undefined = TOKEN): PricesAdminDeps => ({
    db: () => t.db,
    adminToken,
    log: createLogger({ name: "t", sink: () => undefined }),
    now: () => new Date(),
  });
  const call = async (
    method: string,
    body?: unknown,
    token: string | null = TOKEN,
    d = deps(),
  ) => {
    const res = await handlePricesAdmin(
      new Request("http://x/api/admin/webpilot/prices", {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      d,
    );
    return {
      status: res.status,
      json: (await res.json()) as Record<string, any>,
    };
  };

  it("refuse sans jeton, avec un mauvais jeton, et échoue fermé sans jeton configuré", async () => {
    expect((await call("GET", undefined, null)).status).toBe(401);
    expect((await call("GET", undefined, "mauvais")).status).toBe(401);
    expect(
      (
        await call("GET", undefined, TOKEN, {
          ...deps(),
          adminToken: undefined,
        })
      ).status,
    ).toBe(503);
    expect(
      (await call("PUT", { prices: {}, status: "draft" }, null)).status,
    ).toBe(401);
  });

  it("PUT crée puis publie ; GET lit ; la marge refuse en 422", async () => {
    const draft = await call("PUT", {
      prices: { page_static: { sellCadMicro: "3300" } },
      status: "draft",
      note: "essai",
    });
    expect(draft.status).toBe(201);
    expect(draft.json.status).toBe("draft");
    const published = await call("PUT", { publishDraft: draft.json.id });
    expect(published.status).toBe(200);
    expect(published.json.status).toBe("published");
    const again = await call("PUT", { publishDraft: draft.json.id });
    expect(again.status).toBe(409);
    const got = await call("GET");
    expect(got.status).toBe(200);
    expect(got.json.current.prices.page_static.sellCadMicro).toBe("3300");
    const low = await call("PUT", {
      prices: { page_static: { sellCadMicro: 1, upstreamUsdMicro: 100_000 } },
      status: "published",
    });
    expect(low.status).toBe(422);
    expect(low.json.error.code).toBe("margin_floor");
    expect((await call("PUT", { n: 1 })).status).toBe(400);
    expect((await call("DELETE")).status).toBe(405);
  });
});
