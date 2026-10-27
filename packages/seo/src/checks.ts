import {
  checkJsonLdConformity,
  KNOWN_JSONLD_TYPES,
  topLevelNodes,
  typesOf,
} from "./conformity.ts";
import { normalizeText, normalizeUrl } from "./text.ts";
import type { PageSeo, SeoFinding } from "./types.ts";

export interface CheckSiteOptions {
  titleMin?: number;
  titleMax?: number;
  descriptionMin?: number;
  descriptionMax?: number;
  /** URL du sitemap : une page noindex n'y a pas sa place, et une page indexable devrait y être. */
  sitemapUrls?: readonly string[];
  /** Exiger `x-default` dès qu'une page déclare des alternates (défaut : oui). */
  requireXDefault?: boolean;
  /** Vérifier aussi la conformité des données structurées au contenu visible (défaut : oui). */
  jsonLdConformity?: boolean;
}

const DEFAULTS = {
  titleMin: 15,
  titleMax: 65,
  descriptionMin: 70,
  descriptionMax: 160,
} as const;

/** Les doublons se cherchent DANS UNE LANGUE : le même titre en fr-CA et en en-CA (nom de produit) est légitime. */
const langOf = (p: PageSeo) => (p.lang ?? "").toLowerCase();

/**
 * Contrôles SEO d'un ensemble de pages RENDUES (récupérées par HTTP ou fixtures) : titres et descriptions uniques
 * et de longueur correcte, canonical, hreflang réciproques, noindex, un seul h1, JSON-LD lisible, connu et conforme.
 * Les pages en erreur HTTP (status >= 400) sont signalées et ne servent pas aux comparaisons.
 */
export function checkSite(
  pages: readonly PageSeo[],
  options: CheckSiteOptions = {},
): SeoFinding[] {
  const o = { ...DEFAULTS, ...options };
  const findings: SeoFinding[] = [];
  const add = (
    f: Omit<SeoFinding, "severity"> & { severity?: SeoFinding["severity"] },
  ) => findings.push({ severity: "error", ...f });

  const live = pages.filter((p) => (p.status ?? 200) < 400);
  for (const p of pages)
    if ((p.status ?? 200) >= 400)
      add({
        rule: "page.http-error",
        url: p.url,
        message: `La page répond ${p.status}.`,
        detail: { status: p.status },
      });

  const byUrl = new Map(live.map((p) => [normalizeUrl(p.url), p]));
  const indexable = live.filter((p) => !p.noindex);

  // titres et descriptions
  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  for (const p of indexable) {
    if (!p.title)
      add({ rule: "title.missing", url: p.url, message: "Titre absent." });
    else {
      const n = [...p.title].length;
      if (n < o.titleMin)
        add({
          rule: "title.short",
          severity: "warning",
          url: p.url,
          message: `Titre trop court (${n} caractères, minimum ${o.titleMin}).`,
          detail: { length: n },
        });
      if (n > o.titleMax)
        add({
          rule: "title.long",
          severity: "warning",
          url: p.url,
          message: `Titre trop long (${n} caractères, maximum ${o.titleMax}) : il sera tronqué.`,
          detail: { length: n },
        });
      const key = `${langOf(p)}|${normalizeText(p.title)}`;
      titles.set(key, [...(titles.get(key) ?? []), p.url]);
    }
    if (!p.description)
      add({
        rule: "description.missing",
        url: p.url,
        message: "Meta description absente.",
      });
    else {
      const n = [...p.description].length;
      if (n < o.descriptionMin)
        add({
          rule: "description.short",
          severity: "warning",
          url: p.url,
          message: `Description trop courte (${n} caractères, minimum ${o.descriptionMin}).`,
          detail: { length: n },
        });
      if (n > o.descriptionMax)
        add({
          rule: "description.long",
          severity: "warning",
          url: p.url,
          message: `Description trop longue (${n} caractères, maximum ${o.descriptionMax}).`,
          detail: { length: n },
        });
      const key = `${langOf(p)}|${normalizeText(p.description)}`;
      descriptions.set(key, [...(descriptions.get(key) ?? []), p.url]);
    }
  }
  for (const [kind, map] of [
    ["title", titles],
    ["description", descriptions],
  ] as const)
    for (const urls of map.values())
      if (urls.length > 1)
        for (const url of urls)
          add({
            rule: `${kind}.duplicate`,
            url,
            message: `${kind === "title" ? "Titre" : "Description"} identique sur ${urls.length} pages.`,
            detail: { pages: urls },
          });

  // canonical
  for (const p of indexable) {
    if (!p.canonical) {
      add({
        rule: "canonical.missing",
        url: p.url,
        message: "Lien canonical absent.",
      });
      continue;
    }
    if (!/^https?:\/\//.test(p.canonical))
      add({
        rule: "canonical.relative",
        url: p.url,
        message: "Le canonical doit être une URL absolue.",
      });
    else if (normalizeUrl(p.canonical) !== normalizeUrl(p.url))
      add({
        rule: "canonical.not-self",
        severity: "warning",
        url: p.url,
        message: `Le canonical pointe ailleurs (${p.canonical}).`,
        detail: { canonical: p.canonical },
      });
  }

  // hreflang
  for (const p of indexable) {
    if (p.alternates.length === 0) continue;
    const self = normalizeUrl(p.canonical ?? p.url);
    const hrefs = p.alternates.map((a) => normalizeUrl(a.href));
    if (!hrefs.includes(self))
      add({
        rule: "hreflang.self-missing",
        url: p.url,
        message:
          "Les alternates hreflang ne contiennent pas la page elle-même.",
      });
    if (
      (options.requireXDefault ?? true) &&
      p.alternates.length > 1 &&
      !p.alternates.some((a) => a.hreflang === "x-default")
    )
      add({
        rule: "hreflang.x-default-missing",
        url: p.url,
        message: "x-default absent des alternates hreflang.",
      });
    for (const a of p.alternates) {
      const target = byUrl.get(normalizeUrl(a.href));
      if (!target) {
        if (normalizeUrl(a.href) !== normalizeUrl(p.url))
          add({
            rule: "hreflang.target-not-checked",
            severity: "info",
            url: p.url,
            message: `Alternate ${a.hreflang} vers une page non vérifiée (${a.href}).`,
            detail: { href: a.href },
          });
        continue;
      }
      if (target === p) continue;
      const back = target.alternates.some(
        (b) =>
          normalizeUrl(b.href) === normalizeUrl(p.canonical ?? p.url) ||
          normalizeUrl(b.href) === normalizeUrl(p.url),
      );
      if (!back)
        add({
          rule: "hreflang.not-reciprocal",
          url: p.url,
          message: `L'alternate ${a.hreflang} (${a.href}) ne renvoie pas vers cette page.`,
          detail: { href: a.href, hreflang: a.hreflang },
        });
      if (target.noindex)
        add({
          rule: "hreflang.target-noindex",
          url: p.url,
          message: `L'alternate ${a.hreflang} pointe vers une page noindex.`,
          detail: { href: a.href },
        });
    }
  }

  // noindex et sitemap
  if (options.sitemapUrls) {
    const inSitemap = new Set(options.sitemapUrls.map(normalizeUrl));
    for (const p of live) {
      const inMap = inSitemap.has(normalizeUrl(p.url));
      if (p.noindex && inMap)
        add({
          rule: "sitemap.noindex-listed",
          url: p.url,
          message: "Une page noindex figure dans le sitemap.",
        });
      if (!p.noindex && !inMap)
        add({
          rule: "sitemap.indexable-missing",
          severity: "warning",
          url: p.url,
          message: "Une page indexable ne figure pas dans le sitemap.",
        });
    }
  }

  // h1 et données structurées
  for (const p of live) {
    if (p.h1s.length !== 1)
      add({
        rule: "h1.count",
        severity: p.h1s.length === 0 ? "error" : "warning",
        url: p.url,
        message: `${p.h1s.length} titre(s) h1 (un seul attendu).`,
        detail: { count: p.h1s.length },
      });
    for (const e of p.jsonLdErrors)
      add({
        rule: "jsonld.parse",
        url: p.url,
        message: `JSON-LD illisible : ${e}`,
      });
    for (const node of topLevelNodes(p.jsonLd)) {
      const types = typesOf(node);
      if (
        types.length > 0 &&
        !types.some((t) =>
          (KNOWN_JSONLD_TYPES as readonly string[]).includes(t),
        )
      )
        add({
          rule: "jsonld.unknown-type",
          severity: "warning",
          url: p.url,
          message: `Type JSON-LD inattendu : ${types.join(", ")}.`,
        });
    }
    if (options.jsonLdConformity ?? true)
      findings.push(
        ...checkJsonLdConformity(p.jsonLd, p.visibleText, { url: p.url }),
      );
  }
  return findings;
}
