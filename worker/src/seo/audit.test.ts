import { eq, seoAudits, seoIssues } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AuditDeps, executeAudit, keyPagesFirst } from "./audit.ts";
import { violationsToFindings } from "./audit-a11y.ts";
import { auditLinks, parseLycheeReport } from "./audit-links.ts";
import { scoresToFindings } from "./audit-perf.ts";
import { fingerprintOf, recordFindings } from "./issues.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(seoIssues);
  await t.db.delete(seoAudits);
});
const silent = createLogger({ name: "test", sink: () => {} });

const PUBLIC = "https://nexora.test";
const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc>${PUBLIC}/</loc></url><url><loc>${PUBLIC}/opsys-ai</loc></url><url><loc>${PUBLIC}/en</loc></url></urlset>`;
const page = (title: string, desc: string, path: string) =>
  `<!doctype html><html lang="fr-CA"><head><title>${title}</title><meta name="description" content="${desc}"><link rel="canonical" href="${PUBLIC}${path}"></head><body><h1>Un titre</h1><p>Contenu.</p></body></html>`;
const fakeFetch = (async (url: string | URL | Request) => {
  const u = new URL(String(url));
  if (u.pathname === "/sitemap.xml") return new Response(sitemap);
  const body =
    u.pathname === "/"
      ? page(
          "Nexora : l'IA souveraine pour les entreprises",
          "Une description assez longue pour passer le contrôle de longueur minimale des méta-descriptions du site.",
          "/",
        )
      : page("Un titre", "Courte.", u.pathname);
  return new Response(body, { headers: { "content-type": "text/html" } });
}) as typeof fetch;

const lycheeJson = JSON.stringify({
  total: 10,
  error_map: {
    "http://app/opsys-ai": [
      { url: "http://app/solutions", status: { text: "404", code: 404 } },
    ],
  },
  timeout_map: {},
});

function deps(over: Partial<AuditDeps> = {}): AuditDeps {
  return {
    db: t.db,
    log: silent,
    env: { SEO_AUDIT_BASE_URL: "http://app", SEO_AUDIT_PERF_MAX_PAGES: "2" },
    fetchImpl: fakeFetch,
    runLychee: async () => ({ code: 2, stdout: lycheeJson }),
    axe: async () => ({
      run: async () => [
        {
          id: "color-contrast",
          impact: "serious",
          help: "Contraste insuffisant",
          helpUrl: "https://dequeuniversity.com/x",
          nodes: [{ target: [".a"] }],
        },
      ],
      close: async () => {},
    }),
    lighthouse: async () => ({
      run: async () => ({
        performance: 0.9,
        accessibility: 1,
        "best-practices": 1,
        seo: 1,
        metrics: { lcpMs: 1800, cls: 0, tbtMs: 10 },
      }),
      close: async () => {},
    }),
    ...over,
  };
}
const newAudit = async (kind: "all" | "links" | "structure" = "all") =>
  (
    await t.db.insert(seoAudits).values({ kind, trigger: "manual" }).returning()
  )[0]?.id as string;

describe("conversion des sorties d'outils", () => {
  it("lychee : liens cassés rattachés à la page publique, 429 toléré par les arguments", async () => {
    const r = parseLycheeReport(lycheeJson, (s) =>
      s.replace("http://app", PUBLIC),
    );
    expect(r.findings).toEqual([
      expect.objectContaining({
        kind: "links",
        rule: "links.broken",
        severity: "error",
        url: `${PUBLIC}/opsys-ai`,
        key: "http://app/solutions",
      }),
    ]);
    let args: string[] = [];
    await auditLinks(
      [{ fetchUrl: "http://app/", publicUrl: `${PUBLIC}/` }],
      async (a) => {
        args = a;
        return { code: 0, stdout: JSON.stringify({ total: 1 }) };
      },
    );
    expect(args).toContain("200..=299,429");
    expect(args).toContain("--no-progress");
    await expect(
      auditLinks([{ fetchUrl: "x", publicUrl: "y" }], async () => ({
        code: 1,
        stdout: "",
      })),
    ).rejects.toThrow(/rien produit/);
    expect(() => parseLycheeReport("pas du json", (s) => s)).toThrow();
  });

  it("axe : gravité selon l'impact", () => {
    const f = violationsToFindings(`${PUBLIC}/`, "mobile", [
      {
        id: "color-contrast",
        impact: "serious",
        help: "h",
        helpUrl: "u",
        nodes: [{ target: [".a"] }],
      },
      { id: "region", impact: "moderate", help: "h", helpUrl: "u", nodes: [] },
      { id: "x", impact: "minor", help: "h", helpUrl: "u", nodes: [] },
    ]);
    expect(f.map((x) => x.severity)).toEqual(["error", "warning", "info"]);
  });

  it("Lighthouse : sous 95 avertissement, sous 80 erreur, 95 et plus rien", () => {
    const f = scoresToFindings(`${PUBLIC}/`, {
      performance: 0.78,
      accessibility: 0.9,
      "best-practices": 0.95,
      seo: 1,
      metrics: { lcpMs: 3000, cls: 0.1, tbtMs: 200 },
    });
    expect(f.map((x) => `${x.rule}:${x.severity}`)).toEqual([
      "perf.lighthouse-performance:error",
      "perf.lighthouse-accessibility:warning",
    ]);
  });

  it("pages clés d'abord : courts chemins, français avant anglais", () => {
    const mk = (path: string) => ({ publicUrl: path, fetchUrl: path, path });
    expect(
      keyPagesFirst([mk("/en/a/b"), mk("/en"), mk("/a/b"), mk("/")]).map(
        (p) => p.path,
      ),
    ).toEqual(["/", "/en", "/a/b", "/en/a/b"]);
  });
});

describe("recordFindings : dédoublonnage, résolution, réouverture, ignorés", () => {
  const f = (key: string) => ({
    kind: "links" as const,
    rule: "links.broken",
    severity: "error" as const,
    url: `${PUBLIC}/p`,
    key,
    message: `Lien cassé ${key}`,
  });
  it("un constat reconnu n'est pas dupliqué ; absent au passage suivant il est résolu ; il se rouvre s'il revient ; un constat ignoré le reste", async () => {
    const a1 = await newAudit("links");
    await recordFindings(t.db, a1, "links", [f("a"), f("b")], [`${PUBLIC}/p`]);
    await recordFindings(t.db, a1, "links", [f("a")], [`${PUBLIC}/p`]);
    expect((await t.db.select().from(seoIssues)).length).toBe(2);
    const a2 = await newAudit("links");
    const r2 = await recordFindings(
      t.db,
      a2,
      "links",
      [f("a")],
      [`${PUBLIC}/p`],
    );
    expect(r2.resolved).toBe(1);
    const byKey = async (key: string) =>
      (
        await t.db
          .select()
          .from(seoIssues)
          .where(eq(seoIssues.fingerprint, fingerprintOf(f(key))))
      )[0];
    expect((await byKey("b"))?.status).toBe("resolved");
    expect((await byKey("a"))?.status).toBe("open");
    await t.db
      .update(seoIssues)
      .set({ status: "ignored" })
      .where(eq(seoIssues.fingerprint, fingerprintOf(f("a"))));
    const a3 = await newAudit("links");
    await recordFindings(t.db, a3, "links", [f("a"), f("b")], [`${PUBLIC}/p`]);
    expect((await byKey("a"))?.status).toBe("ignored");
    expect((await byKey("b"))?.status).toBe("open");
    // une page non contrôlée ne voit pas ses constats résolus
    const a4 = await newAudit("links");
    const r4 = await recordFindings(t.db, a4, "links", [], [`${PUBLIC}/autre`]);
    expect(r4.resolved).toBe(0);
  });
});

describe("executeAudit : les quatre volets", () => {
  it("enregistre le résumé et les constats de chaque volet", async () => {
    const id = await newAudit("all");
    expect(await executeAudit(deps(), id)).toBe("succeeded");
    const [audit] = await t.db
      .select()
      .from(seoAudits)
      .where(eq(seoAudits.id, id));
    expect(audit?.status).toBe("succeeded");
    expect(audit?.pagesChecked).toBe(3);
    const summary = audit?.summary as Record<
      string,
      { status: string; issues?: number }
    >;
    expect(Object.keys(summary).sort()).toEqual([
      "a11y",
      "links",
      "perf",
      "structure",
    ]);
    expect(Object.values(summary).every((s) => s.status === "ok")).toBe(true);
    const issues = await t.db.select().from(seoIssues);
    expect(new Set(issues.map((i) => i.kind))).toEqual(
      new Set(["structure", "links", "a11y", "perf"]),
    );
    expect(issues.some((i) => i.rule === "links.broken")).toBe(true);
    expect(issues.some((i) => i.rule === "a11y.color-contrast")).toBe(true);
    expect(audit?.issuesFound).toBe(issues.length);
  });

  it("un volet en échec n'empêche pas les autres et n'efface rien", async () => {
    const id = await newAudit("all");
    const d = deps({
      lighthouse: async () => {
        throw new Error("Chrome introuvable");
      },
    });
    expect(await executeAudit(d, id)).toBe("succeeded");
    const [audit] = await t.db
      .select()
      .from(seoAudits)
      .where(eq(seoAudits.id, id));
    const summary = audit?.summary as Record<
      string,
      { status: string; error?: string }
    >;
    expect(summary.perf?.status).toBe("error");
    expect(summary.perf?.error).toMatch(/Chrome/);
    expect(summary.links?.status).toBe("ok");
    expect(audit?.error).toMatch(/au moins un volet/);
  });

  it("sitemap illisible : l'audit échoue avec un message clair", async () => {
    const id = await newAudit("all");
    const d = deps({
      fetchImpl: (async () =>
        new Response("", { status: 503 })) as typeof fetch,
    });
    expect(await executeAudit(d, id)).toBe("failed");
    const [audit] = await t.db
      .select()
      .from(seoAudits)
      .where(eq(seoAudits.id, id));
    expect(audit?.error).toMatch(/sitemap illisible/);
  });

  it("une réclamation unique : un audit déjà pris n'est pas rejoué", async () => {
    const id = await newAudit("links");
    expect(await executeAudit(deps(), id)).toBe("succeeded");
    expect(await executeAudit(deps(), id)).toBe("skipped");
  });
});
