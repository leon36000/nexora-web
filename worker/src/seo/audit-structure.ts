import {
  checkSite,
  extractPageSeo,
  type PageSeo,
  parseSitemapXml,
} from "@nexora/seo";
import type { AuditFinding } from "./issues.ts";

/**
 * Volet « structure SEO » : sitemap -> chaque page rendue -> titres/descriptions uniques et de bonne longueur, canonical,
 * hreflang réciproques, noindex, JSON-LD valide et conforme au contenu visible (contrôles de @nexora/seo).
 * Les pages sont lues par `base` (adresse interne) mais jugées sous l'adresse PUBLIQUE du sitemap.
 */
export interface SitemapPages {
  /** URL publique listée par le sitemap. */
  publicUrl: string;
  /** Adresse réellement interrogée (base interne + chemin). */
  fetchUrl: string;
  path: string;
}

export async function readSitemap(
  base: string,
  doFetch: typeof fetch = fetch,
): Promise<SitemapPages[]> {
  const res = await doFetch(`${base.replace(/\/+$/, "")}/sitemap.xml`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`sitemap.xml répond ${res.status}`);
  const entries = parseSitemapXml(await res.text());
  return entries.map((e) => {
    const u = new URL(e.url);
    return {
      publicUrl: e.url,
      path: `${u.pathname}${u.search}`,
      fetchUrl: `${base.replace(/\/+$/, "")}${u.pathname}${u.search}`,
    };
  });
}

export async function auditStructure(
  base: string,
  pages: readonly SitemapPages[],
  doFetch: typeof fetch = fetch,
): Promise<{ findings: AuditFinding[]; pages: number }> {
  const seo: PageSeo[] = [];
  for (const p of pages) {
    try {
      const res = await doFetch(p.fetchUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      const html = await res.text();
      seo.push(
        extractPageSeo(html, p.publicUrl, {
          status: res.status,
          xRobotsTag: res.headers.get("x-robots-tag") ?? undefined,
        }),
      );
    } catch {
      seo.push({
        url: p.publicUrl,
        status: 599,
        lang: null,
        title: null,
        description: null,
        canonical: null,
        robots: "",
        noindex: false,
        alternates: [],
        h1s: [],
        jsonLd: [],
        jsonLdErrors: [],
        visibleText: "",
        og: { title: null, description: null, image: null, url: null },
      });
    }
  }
  const findings = checkSite(seo, {
    sitemapUrls: pages.map((p) => p.publicUrl),
  }).map<AuditFinding>((f) => ({
    ...f,
    kind: "structure",
    key:
      typeof f.detail?.key === "string" ? f.detail.key : f.message.slice(0, 80),
  }));
  void base;
  return { findings, pages: pages.length };
}
