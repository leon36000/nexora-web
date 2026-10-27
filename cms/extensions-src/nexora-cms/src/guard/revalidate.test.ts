import { describe, expect, test } from "bun:test";
import { revalidate, revalidateConfigProblem } from "./revalidate";

const SECRET = "jeton-secret-de-test";
const env = {
  NEXORA_APP_INTERNAL_URL: "http://app.interne:3500/",
  NEXORA_APP_ADMIN_TOKEN: SECRET,
};
const logger = () => {
  const lines: string[] = [];
  return {
    lines,
    warn: (...a: unknown[]) => lines.push(a.map(String).join(" ")),
    info: (...a: unknown[]) => lines.push(a.map(String).join(" ")),
  };
};

describe("revalidate", () => {
  test("appelle POST /api/revalidate avec le jeton porteur et le corps {collection,id,slugs}", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const log = logger();
    const ok = await revalidate(
      { collection: "pages", id: "p1", slugs: ["accueil", "home"] },
      { env, logger: log, fetchFn },
    );
    expect(ok).toBe(true);
    const seen = calls[0];
    if (!seen) throw new Error("fetch n'a pas été appelé");
    expect(seen.url).toBe("http://app.interne:3500/api/revalidate");
    expect(seen.init.method).toBe("POST");
    expect((seen.init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${SECRET}`,
    );
    expect(JSON.parse(seen.init.body as string)).toEqual({
      collection: "pages",
      id: "p1",
      slugs: ["accueil", "home"],
    });
  });

  test("un échec HTTP ne lève pas, est journalisé sans le jeton", async () => {
    const fetchFn = (async () =>
      new Response("refusé", { status: 401 })) as unknown as typeof fetch;
    const log = logger();
    const ok = await revalidate(
      { collection: "pages", id: "p1", slugs: [] },
      { env, logger: log, fetchFn },
    );
    expect(ok).toBe(false);
    expect(log.lines.join("\n")).toContain("401");
    expect(log.lines.join("\n")).not.toContain(SECRET);
  });

  test("une erreur réseau ne lève pas et ne divulgue pas le jeton", async () => {
    const fetchFn = (async () => {
      throw new Error(`connexion refusée (Authorization: Bearer ${SECRET})`);
    }) as unknown as typeof fetch;
    const log = logger();
    const ok = await revalidate(
      { collection: "pages", id: "p1", slugs: [] },
      { env, logger: log, fetchFn },
    );
    expect(ok).toBe(false);
    expect(log.lines.join("\n")).not.toContain(SECRET);
  });

  test("sans configuration, ne fait rien et le dit", async () => {
    const log = logger();
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const ok = await revalidate(
      { collection: "pages", id: "p1", slugs: [] },
      { env: {}, logger: log, fetchFn },
    );
    expect(ok).toBe(false);
    expect(called).toBe(false);
    expect(log.lines.length).toBe(1);
  });
});

describe("revalidateConfigProblem : la configuration manquante se voit au démarrage, pas à la première publication", () => {
  test("rien à signaler quand l'adresse du site et le jeton sont posés", () => {
    expect(revalidateConfigProblem(env)).toBeNull();
  });

  test("adresse du site absente : le message nomme la variable et la conséquence", () => {
    const m = revalidateConfigProblem({ NEXORA_APP_ADMIN_TOKEN: SECRET });
    expect(m).toContain("NEXORA_APP_INTERNAL_URL");
    expect(m).toContain("publication");
  });

  test("jeton absent ou adresse vide : signalés, sans jamais citer de valeur", () => {
    const m = revalidateConfigProblem({
      NEXORA_APP_INTERNAL_URL: "  ",
      NEXORA_APP_ADMIN_TOKEN: "",
    });
    expect(m).toContain("NEXORA_APP_INTERNAL_URL");
    expect(m).toContain("NEXORA_APP_ADMIN_TOKEN");
    expect(String(revalidateConfigProblem(env))).not.toContain(SECRET);
    expect(
      String(revalidateConfigProblem({ NEXORA_APP_INTERNAL_URL: "http://x" })),
    ).not.toContain("http://x");
  });
});
