import { describe, expect, it, vi } from "vitest";
import { handleRevalidate, planRevalidation } from "./revalidate";

const TOKEN = "t".repeat(40);
const silent = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silent;
  },
};

function setup(over: { adminToken?: string | undefined } = {}) {
  const tags: [string, unknown][] = [];
  const paths: string[] = [];
  const deps = {
    adminToken: "adminToken" in over ? over.adminToken : TOKEN,
    revalidateTag: vi.fn((tag: string, profile: unknown) => {
      tags.push([tag, profile]);
    }),
    revalidatePath: vi.fn((p: string) => {
      paths.push(p);
    }),
    log: silent,
  };
  return { deps, tags, paths };
}

const post = (
  body: unknown,
  headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` },
) =>
  new Request("http://localhost/api/revalidate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("planRevalidation : offres d'abonnement", () => {
  it("une offre modifiée rafraîchit la page Tarifs (étiquette et deux adresses)", () => {
    const plan = planRevalidation({
      collection: "subscription_plans",
      id: "p1",
      slugs: [],
    });
    expect(plan.tags).toEqual(["subscription-plans"]);
    expect(plan.paths).toEqual(["/tarifs", "/en/pricing"]);
  });
});

describe("planRevalidation", () => {
  it("page : étiquette par identifiant, par slug et par langue, et chemins fr + en", () => {
    const plan = planRevalidation({
      collection: "pages",
      id: "abc",
      slugs: ["", "opsys-ai"],
    });
    expect(plan.tags).toEqual(
      expect.arrayContaining([
        "page:pages:abc",
        "page-slug:fr-CA:",
        "page-slug:fr-CA:opsys-ai",
        "page-slug:en-CA:",
        "page-slug:en-CA:opsys-ai",
        // la table de correspondance des slugs (sélecteur de langue, liens de navigation) change avec toute page
        "slugs",
      ]),
    );
    expect(plan.paths.sort()).toEqual([
      "/en",
      "/en/opsys-ai",
      "/fr",
      "/fr/opsys-ai",
    ]);
  });

  it("dédoublonne et écarte les slugs douteux, sans bloquer les autres", () => {
    const plan = planRevalidation({
      collection: "pages",
      id: "abc",
      slugs: ["a", "a", "../etc", "A B", "x/y", ""],
    });
    expect(plan.paths.sort()).toEqual([
      "/en",
      "/en/a",
      "/en/x/y",
      "/fr",
      "/fr/a",
      "/fr/x/y",
    ]);
    expect(plan.tags.filter((t) => t === "page:pages:abc")).toHaveLength(1);
  });

  it("navigation -> nav ; réglages -> site ; collection inconnue -> rien", () => {
    expect(
      planRevalidation({ collection: "navigation", id: "n", slugs: [] }),
    ).toEqual({ tags: ["nav"], paths: [] });
    expect(
      planRevalidation({ collection: "site_settings", id: "s", slugs: [] }),
    ).toEqual({ tags: ["site"], paths: [] });
    expect(
      planRevalidation({ collection: "claims", id: "c", slugs: [] }),
    ).toEqual({ tags: [], paths: [] });
  });
});

describe("handleRevalidate : authentification", () => {
  it("refuse sans jeton, avec un mauvais jeton ou un schéma autre que Bearer (401)", async () => {
    const attempts: Record<string, string>[] = [
      {},
      { authorization: "Bearer mauvais-jeton-mauvais-jeton-mauvais-jeton" },
      { authorization: `Basic ${TOKEN}` },
      { authorization: TOKEN },
    ];
    for (const headers of attempts) {
      const { deps } = setup();
      const res = await handleRevalidate(
        post({ collection: "pages", id: "a", slugs: [] }, headers),
        deps,
      );
      expect(res.status).toBe(401);
      expect(deps.revalidateTag).not.toHaveBeenCalled();
      expect(deps.revalidatePath).not.toHaveBeenCalled();
    }
  });

  it("échoue fermé si le jeton attendu manque ou est trop court (503)", async () => {
    for (const adminToken of [undefined, "", "court"]) {
      const { deps } = setup({ adminToken });
      const res = await handleRevalidate(
        post({ collection: "pages", id: "a", slugs: [] }),
        deps,
      );
      expect(res.status).toBe(503);
      expect(deps.revalidateTag).not.toHaveBeenCalled();
    }
  });
});

describe("handleRevalidate : corps", () => {
  it("rejette un JSON illisible (400) et une forme invalide (422)", async () => {
    const { deps } = setup();
    expect((await handleRevalidate(post("pas du json"), deps)).status).toBe(
      400,
    );
    expect(
      (await handleRevalidate(post({ collection: "pages" }), deps)).status,
    ).toBe(422);
    expect(
      (
        await handleRevalidate(
          post({ collection: "pages", id: "a", slugs: "x" }),
          deps,
        )
      ).status,
    ).toBe(422);
    expect(deps.revalidateTag).not.toHaveBeenCalled();
  });

  it("rejette un corps trop gros (413)", async () => {
    const { deps } = setup();
    const big = { collection: "pages", id: "a", slugs: ["x".repeat(200_000)] };
    expect((await handleRevalidate(post(big), deps)).status).toBe(413);
  });
});

describe("handleRevalidate : effets", () => {
  it("appelle revalidateTag(étiquette, profil) à deux arguments et revalide les chemins des deux langues", async () => {
    const { deps, tags, paths } = setup();
    const res = await handleRevalidate(
      post({ collection: "pages", id: "abc", slugs: ["", "opsys-ai"] }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(tags.length).toBeGreaterThan(0);
    for (const [, profile] of tags) expect(profile).toEqual({ expire: 0 });
    expect(tags.map(([t]) => t)).toContain("page:pages:abc");
    expect(paths).toEqual(
      expect.arrayContaining(["/fr", "/en", "/fr/opsys-ai", "/en/opsys-ai"]),
    );
    const body = (await res.json()) as {
      revalidated: boolean;
      tags: string[];
      paths: string[];
    };
    expect(body.revalidated).toBe(true);
    expect(body.tags).toContain("page:pages:abc");
  });

  it("une panne de revalidation répond 500 sans divulguer le jeton", async () => {
    const { deps } = setup();
    deps.revalidateTag.mockImplementation(() => {
      throw new Error(`échec avec Bearer ${TOKEN}`);
    });
    const res = await handleRevalidate(
      post({ collection: "pages", id: "a", slugs: [] }),
      deps,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(TOKEN);
  });
});
