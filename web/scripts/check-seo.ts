#!/usr/bin/env bun
// Contrôle SEO d'un site EN MARCHE : robots.txt, sitemap.xml, llms.txt, puis chaque page du sitemap (fr et en) :
// titres et descriptions uniques, canonical, hreflang réciproques, noindex, h1, JSON-LD valide et conforme au visible,
// image Open Graph servie. Sort en code 1 s'il y a une erreur.
//
//   BASE_URL=http://localhost:3531 bun web/scripts/check-seo.ts
//   EXPECT_ENV=staging BASE_URL=… bun web/scripts/check-seo.ts    (préproduction : Disallow: / et X-Robots-Tag attendus)
//
// Le site doit avoir été lancé avec SITE_URL = BASE_URL (les URL absolues du sitemap en dépendent).

import {
  checkSite,
  extractPageSeo,
  normalizeUrl,
  type PageSeo,
  parseSitemapXml,
  type SeoFinding,
} from "@nexora/seo";

const BASE = (process.env.BASE_URL ?? "http://localhost:3500").replace(
  /\/+$/,
  "",
);
const EXPECT = process.env.EXPECT_ENV === "staging" ? "staging" : "production";
const findings: SeoFinding[] = [];
const note = (
  f: Omit<SeoFinding, "severity"> & { severity?: SeoFinding["severity"] },
) => findings.push({ severity: "error", ...f });
const say = (s = "") => console.log(s);

async function get(path: string) {
  const res = await fetch(path.startsWith("http") ? path : BASE + path, {
    redirect: "manual",
    headers: { "user-agent": "NexoraSeoCheck/1.0" },
  });
  return { res, text: await res.text().catch(() => "") };
}

say(`# Contrôle SEO — ${BASE} (environnement attendu : ${EXPECT})`);

// ---- robots.txt
const robots = await get("/robots.txt");
say(`\n## robots.txt (${robots.res.status})`);
if (robots.res.status !== 200)
  note({
    rule: "robots.status",
    url: `${BASE}/robots.txt`,
    message: `robots.txt répond ${robots.res.status}.`,
  });
const groups = robots.text
  .split(/\n\s*\n/)
  .map((g) => g.trim())
  .filter(Boolean);
say(
  `${groups.length} groupe(s) ; lignes Sitemap : ${
    robots.text
      .split("\n")
      .filter((l) => /^sitemap:/i.test(l))
      .join(" | ") || "aucune"
  }`,
);
if (EXPECT === "staging") {
  if (
    !/User-Agent: \*\s*\nDisallow: \/\s*$/im.test(robots.text) ||
    /Sitemap:/i.test(robots.text)
  )
    note({
      rule: "robots.staging-open",
      url: `${BASE}/robots.txt`,
      message:
        "Préproduction : robots.txt doit être « Disallow: / » pour tous, sans sitemap.",
    });
} else {
  const must = [
    ["Googlebot", /User-Agent: Googlebot\s*\nAllow: \//i],
    ["OAI-SearchBot", /User-Agent: OAI-SearchBot\s*\nAllow: \//i],
    ["GPTBot", /User-Agent: GPTBot\s*\nDisallow: \/\s*(\n|$)/i],
    ["ClaudeBot", /User-Agent: ClaudeBot\s*\nDisallow: \/\s*(\n|$)/i],
  ] as const;
  for (const [bot, re] of must)
    if (!re.test(robots.text))
      note({
        rule: "robots.policy",
        url: `${BASE}/robots.txt`,
        message: `Politique inattendue pour ${bot}.`,
      });
  if (!robots.text.includes(`Sitemap: ${BASE}/sitemap.xml`))
    note({
      rule: "robots.sitemap",
      url: `${BASE}/robots.txt`,
      message: "Ligne Sitemap absente ou mauvaise.",
    });
}

// ---- sitemap.xml
const sm = await get("/sitemap.xml");
const entries = sm.res.status === 200 ? parseSitemapXml(sm.text) : [];
say(`\n## sitemap.xml (${sm.res.status}) — ${entries.length} URL`);
if (entries.length === 0)
  note({
    rule: "sitemap.empty",
    url: `${BASE}/sitemap.xml`,
    message: "Sitemap vide ou illisible.",
  });
const byUrl = new Map(entries.map((e) => [normalizeUrl(e.url), e]));
for (const e of entries) {
  say(
    `- ${e.url}  lastmod=${e.lastmod ?? "(omis)"}  alternates=${e.alternates.map((a) => a.hreflang).join(",") || "—"}`,
  );
  if (e.lastmod && Number.isNaN(Date.parse(e.lastmod)))
    note({
      rule: "sitemap.lastmod",
      url: e.url,
      message: `lastmod illisible (${e.lastmod}).`,
    });
  if (
    e.alternates.length > 0 &&
    !e.alternates.some((a) => normalizeUrl(a.href) === normalizeUrl(e.url))
  )
    note({
      rule: "sitemap.hreflang-self",
      url: e.url,
      message: "L'entrée n'est pas dans ses propres alternates.",
    });
  for (const a of e.alternates) {
    const other = byUrl.get(normalizeUrl(a.href));
    if (!other)
      note({
        rule: "sitemap.hreflang-target",
        url: e.url,
        message: `Alternate ${a.hreflang} vers une URL absente du sitemap (${a.href}).`,
      });
    else if (
      !other.alternates.some(
        (b) => normalizeUrl(b.href) === normalizeUrl(e.url),
      )
    )
      note({
        rule: "sitemap.hreflang-not-reciprocal",
        url: e.url,
        message: `Alternate ${a.hreflang} non réciproque (${a.href}).`,
      });
  }
}

// ---- llms.txt
const llms = await get("/llms.txt");
say(`\n## llms.txt (${llms.res.status})`);
if (
  llms.res.status !== 200 ||
  !llms.res.headers.get("content-type")?.startsWith("text/plain")
)
  note({
    rule: "llms.status",
    url: `${BASE}/llms.txt`,
    message: "llms.txt absent ou mal typé.",
  });
const llmsLinks = [...llms.text.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) =>
  normalizeUrl(m[1] as string),
);
for (const l of llmsLinks)
  if (!byUrl.has(l))
    note({
      rule: "llms.not-in-sitemap",
      url: l,
      severity: "warning",
      message: "Lien de llms.txt absent du sitemap.",
    });
say(
  `${llmsLinks.length} lien(s), tous présents au sitemap : ${llmsLinks.every((l) => byUrl.has(l))}`,
);

// ---- pages
const pages: PageSeo[] = [];
say("\n## Pages");
for (const e of entries) {
  const { res, text } = await get(e.url);
  const p = extractPageSeo(text, e.url, {
    status: res.status,
    xRobotsTag: res.headers.get("x-robots-tag"),
  });
  pages.push(p);
  const types = p.jsonLd
    .flatMap((j) => (Array.isArray(j) ? j : [j]))
    .map((j) => String((j as { "@type"?: string })["@type"] ?? "?"));
  say(
    `- ${e.url}  [${res.status}] titre ${[...(p.title ?? "")].length} car., description ${[...(p.description ?? "")].length} car., h1=${p.h1s.length}, JSON-LD: ${types.join("+") || "aucun"}`,
  );
  if (
    EXPECT === "staging" &&
    !/noindex/.test(`${res.headers.get("x-robots-tag")}`)
  )
    note({
      rule: "staging.x-robots-tag",
      url: e.url,
      message: "Préproduction : X-Robots-Tag noindex absent.",
    });
  if (
    EXPECT === "production" &&
    /noindex/.test(`${res.headers.get("x-robots-tag")}`)
  )
    note({
      rule: "production.x-robots-tag",
      url: e.url,
      message: "Production : X-Robots-Tag noindex ne devrait pas être posé.",
    });
  // image Open Graph
  if (p.og.image) {
    const img = await fetch(p.og.image.replace(/^https?:\/\/[^/]+/, BASE));
    const buf = await img.arrayBuffer();
    const ok =
      img.status === 200 &&
      img.headers.get("content-type")?.startsWith("image/png") &&
      buf.byteLength > 2000;
    say(
      `    og:image ${p.og.image} -> ${img.status} ${img.headers.get("content-type")} ${buf.byteLength} o`,
    );
    if (!ok)
      note({
        rule: "og.image",
        url: e.url,
        message: `Image Open Graph inutilisable (${img.status}).`,
      });
  } else
    note({
      rule: "og.image-missing",
      severity: "warning",
      url: e.url,
      message: "og:image absent.",
    });
}

// En préproduction les pages sont noindex PAR CHOIX : on ne leur demande pas d'être dans le sitemap.
findings.push(
  ...checkSite(pages, {
    sitemapUrls: EXPECT === "staging" ? undefined : entries.map((e) => e.url),
  }),
);

// ---- rapport
const errors = findings.filter((f) => f.severity === "error");
const warnings = findings.filter((f) => f.severity === "warning");
say(
  `\n## Constats : ${errors.length} erreur(s), ${warnings.length} avertissement(s), ${findings.length - errors.length - warnings.length} information(s)`,
);
for (const f of findings.filter((x) => x.severity !== "info"))
  say(`- [${f.severity}] ${f.rule} — ${f.url} — ${f.message}`);
say(
  errors.length === 0 ? "\nRÉSULTAT : aucune erreur." : "\nRÉSULTAT : ÉCHEC.",
);
process.exit(errors.length === 0 ? 0 : 1);
