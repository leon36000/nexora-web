import { type HTMLElement, NodeType, parse } from "node-html-parser";
import type { PageSeo } from "./types.ts";

const SKIPPED = new Set(["script", "style", "noscript", "template", "head"]);
const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

/** Texte visible d'un élément : sans script/style/gabarit/JSON-LD ; un espace est inséré entre blocs. */
function visibleTextOf(node: HTMLElement): string {
  const parts: string[] = [];
  const walk = (n: HTMLElement) => {
    for (const child of n.childNodes) {
      if (child.nodeType === NodeType.TEXT_NODE) {
        parts.push((child as unknown as { text: string }).text);
      } else if (child.nodeType === NodeType.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName?.toLowerCase() ?? "";
        if (SKIPPED.has(tag) || el.hasAttribute("hidden")) continue;
        const block = BLOCK.has(tag);
        if (block) parts.push(" ");
        walk(el);
        if (block) parts.push(" ");
      }
    }
  };
  walk(node);
  return parts.join("").replace(/\s+/g, " ").trim();
}

const meta = (root: HTMLElement, attr: "name" | "property", value: string) =>
  root
    .querySelector(`meta[${attr}="${value}"]`)
    ?.getAttribute("content")
    ?.trim() || null;

export interface ExtractOptions {
  status?: number;
  /** Valeur de l'en-tête de réponse X-Robots-Tag, si la page a été récupérée par HTTP. */
  xRobotsTag?: string | null;
}

/** Extrait ce que la page expose aux moteurs. Pur : aucune I/O. */
export function extractPageSeo(
  html: string,
  pageUrl: string,
  options: ExtractOptions = {},
): PageSeo {
  const root = parse(html, { comment: false });
  const base = (() => {
    try {
      return new URL(pageUrl);
    } catch {
      return null;
    }
  })();
  const abs = (href: string | undefined | null) => {
    if (!href) return null;
    try {
      return base ? new URL(href, base).toString() : href;
    } catch {
      return href;
    }
  };

  const title = root.querySelector("title")?.text.replace(/\s+/g, " ").trim();
  const canonicalHref = root
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  const robotsMeta = root
    .querySelectorAll('meta[name="robots"], meta[name="googlebot"]')
    .map((m) => m.getAttribute("content") ?? "");
  const robots = [...robotsMeta, options.xRobotsTag ?? ""]
    .join(",")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");

  const jsonLd: unknown[] = [];
  const jsonLdErrors: string[] = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      jsonLd.push(JSON.parse(s.text));
    } catch (e) {
      jsonLdErrors.push(e instanceof Error ? e.message : "JSON illisible");
    }
  }

  const body = root.querySelector("body") ?? root;
  return {
    url: pageUrl,
    ...(options.status !== undefined ? { status: options.status } : {}),
    lang: root.querySelector("html")?.getAttribute("lang") ?? null,
    title: title || null,
    description: meta(root, "name", "description"),
    canonical: abs(canonicalHref),
    robots,
    noindex: /(^|, )(noindex|none)(,|$)/.test(robots),
    alternates: root
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .flatMap((l) => {
        const hreflang = l.getAttribute("hreflang");
        const href = abs(l.getAttribute("href"));
        return hreflang && href ? [{ hreflang, href }] : [];
      }),
    h1s: body
      .querySelectorAll("h1")
      .map((h) => visibleTextOf(h))
      .filter(Boolean),
    jsonLd,
    jsonLdErrors,
    visibleText: visibleTextOf(body),
    og: {
      title: meta(root, "property", "og:title"),
      description: meta(root, "property", "og:description"),
      image: abs(meta(root, "property", "og:image")),
      url: abs(meta(root, "property", "og:url")),
    },
  };
}
