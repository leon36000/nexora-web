import { describe, expect, it, vi } from "vitest";
import { createDirectusPackSource, packsFromEnv } from "./credit-packs";

const row = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  code: "recharge-25",
  status: "published",
  price_cents: 2500,
  credits: 2500,
  sort: 2,
  ...over,
});

const fetchReturning = (data: unknown[], status = 200) =>
  vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ data }, { status }),
  );
const cfg = (f: unknown) => ({
  baseUrl: "http://directus.test",
  token: "reader-token",
  fetch: f as typeof fetch,
});

describe("lecteur Directus des forfaits de recharge", () => {
  it("demande seulement les forfaits publiés, avec le jeton lecteur, triés", async () => {
    const f = fetchReturning([row()]);
    const packs = await createDirectusPackSource(cfg(f)).listPublished();
    expect(packs).toEqual([
      { code: "recharge-25", priceCents: 2500, credits: 2500 },
    ]);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(decodeURIComponent(url)).toContain("filter[status][_eq]=published");
    expect(url).toContain("/items/credit_packs");
    expect(url).not.toContain("suggested_price_cents");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer reader-token",
    );
  });

  it("n'affiche jamais un brouillon, un forfait sans prix ou à 0 $, ni sans crédit (jamais « à 0 $ »)", async () => {
    const packs = await createDirectusPackSource(
      cfg(
        fetchReturning([
          row({ code: "ok" }),
          row({ code: "brouillon", status: "draft" }),
          row({ code: "sans-prix", price_cents: null }),
          row({ code: "zero", price_cents: 0 }),
          row({ code: "sans-credit", credits: 0 }),
          row({ code: "negatif", price_cents: -5 }),
        ]),
      ),
    ).listPublished();
    expect(packs.map((p) => p.code)).toEqual(["ok"]);
  });

  it("une panne de Directus remonte sans citer le jeton", async () => {
    const down = vi.fn(async () => {
      throw new Error("secret reader-token");
    });
    await expect(
      createDirectusPackSource(cfg(down)).listPublished(),
    ).rejects.toThrow(/Directus injoignable/);
    await expect(
      createDirectusPackSource(cfg(fetchReturning([], 500))).listPublished(),
    ).rejects.toThrow(/500/);
  });

  it("packsFromEnv exige le jeton lecteur", () => {
    expect(() => packsFromEnv({})).toThrow(/DIRECTUS_READER_TOKEN/);
  });
});
