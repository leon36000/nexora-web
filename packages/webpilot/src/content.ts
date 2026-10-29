import {
  type HTMLElement,
  NodeType,
  parse,
  type TextNode,
} from "node-html-parser";

/**
 * Contenu lisible d'une page : HTML -> markdown, texte, HTML nettoyé et liens. Le contenu d'une page est une
 * DONNÉE non fiable : il est lu, jamais exécuté. Aucun script, style, cadre ni gestionnaire d'événement n'est
 * conservé, et les adresses `javascript:` disparaissent.
 */

export const FORMATS = ["markdown", "text", "html", "links"] as const;
export type Format = (typeof FORMATS)[number];

export interface PageLink {
  url: string;
  text: string;
}
export interface PageMetadata {
  title: string | null;
  language: string | null;
  description: string | null;
  canonicalUrl: string | null;
}
export interface PageContent {
  markdown?: string;
  text?: string;
  html?: string;
  links?: PageLink[];
  metadata: PageMetadata;
}

const MAX_DEPTH = 80;
const DROP_ALWAYS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "canvas",
  "svg",
  "head",
  "link",
  "meta",
  "title",
  "base",
];
const DROP_CHROME = ["nav", "header", "footer", "aside"];
const DROP_CHROME_SELECTOR =
  '[role="navigation"],[role="banner"],[role="contentinfo"],[role="complementary"]';
const BLOCKS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
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
  "header",
  "hgroup",
  "html",
  "main",
  "nav",
  "section",
  "summary",
  "center",
  "p",
  "ul",
  "ol",
  "li",
  "pre",
  "table",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

// --- décodage -----------------------------------------------------------------------------------------------

export function isHtmlType(contentType: string | undefined): boolean {
  if (!contentType) return true;
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "text/html" || type === "application/xhtml+xml";
}

function labelOk(label: string): string | null {
  try {
    return new TextDecoder(label).encoding ? label : null;
  } catch {
    return null;
  }
}

/** Texte du corps : jeu de caractères de l'en-tête, sinon de la balise meta (1 Kio), sinon utf-8. */
export function decodeBody(
  bytes: Uint8Array,
  contentType: string | undefined,
): string {
  const fromHeader = /charset\s*=\s*["']?([\w:.-]+)/i.exec(
    contentType ?? "",
  )?.[1];
  let label = fromHeader ? labelOk(fromHeader) : null;
  if (!label && isHtmlType(contentType)) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
    const meta = /<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i.exec(head)?.[1];
    if (meta) label = labelOk(meta);
  }
  return new TextDecoder(label ?? "utf-8").decode(bytes);
}

// --- aides --------------------------------------------------------------------------------------------------

const collapse = (s: string) => s.replace(/\s+/g, " ");

function absolute(raw: string | undefined, base: string): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.startsWith("#")) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isElement(node: unknown): node is HTMLElement {
  return (node as { nodeType?: number }).nodeType === NodeType.ELEMENT_NODE;
}
function isText(node: unknown): node is TextNode {
  return (node as { nodeType?: number }).nodeType === NodeType.TEXT_NODE;
}
const tag = (el: HTMLElement) => (el.tagName ?? "").toLowerCase();

function hidden(el: HTMLElement): boolean {
  if (el.hasAttribute("hidden")) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  return /display\s*:\s*none/i.test(el.getAttribute("style") ?? "");
}

// --- rendu --------------------------------------------------------------------------------------------------

interface Ctx {
  base: string;
  plain: boolean;
}

function textOf(node: HTMLElement): string {
  return collapse(node.textContent).trim();
}

/** Contenu en ligne d'un élément (phrasage) : une seule ligne de texte avec marques. */
function inline(node: HTMLElement | TextNode, ctx: Ctx, depth: number): string {
  if (isText(node)) return collapse(node.text);
  if (!isElement(node) || hidden(node)) return "";
  if (depth > MAX_DEPTH) return collapse(node.textContent);
  const t = tag(node);
  if (t === "br") return ctx.plain ? "\n" : "  \n";
  if (t === "img") {
    const alt = (node.getAttribute("alt") ?? "").trim();
    const src = absolute(node.getAttribute("src"), ctx.base);
    return !ctx.plain && alt && src
      ? `![${alt}](${src})`
      : ctx.plain
        ? alt
        : "";
  }
  const inner = node.childNodes
    .map((c) => inline(c as HTMLElement | TextNode, ctx, depth + 1))
    .join("");
  if (ctx.plain) return inner;
  const trimmed = inner.trim();
  if (!trimmed) return inner;
  const pad = (mark: string) => {
    const lead = inner.startsWith(" ") ? " " : "";
    const trail = inner.endsWith(" ") ? " " : "";
    return `${lead}${mark}${trimmed}${mark}${trail}`;
  };
  switch (t) {
    case "strong":
    case "b":
      return pad("**");
    case "em":
    case "i":
      return pad("*");
    case "code":
    case "kbd":
    case "samp":
      return pad("`");
    case "a": {
      const href = absolute(node.getAttribute("href"), ctx.base);
      return href ? `[${trimmed}](${href})` : inner;
    }
    default:
      return inner;
  }
}

/** Blocs (paragraphes, titres, listes…) d'un conteneur, sans ligne vide entre eux : l'appelant joint. */
function blocks(node: HTMLElement, ctx: Ctx, depth: number): string[] {
  const out: string[] = [];
  let run = "";
  const flush = () => {
    const text = run
      .replace(/[ \t]+\n/g, "\n")
      .replace(/ {2,}/g, " ")
      .trim();
    if (text) out.push(text);
    run = "";
  };
  for (const child of node.childNodes) {
    if (isText(child)) {
      run += collapse(child.text);
      continue;
    }
    if (!isElement(child) || hidden(child)) continue;
    const t = tag(child);
    if (DROP_ALWAYS.includes(t)) continue;
    if (!BLOCKS.has(t)) {
      run += inline(child, ctx, depth + 1);
      continue;
    }
    flush();
    out.push(...block(child, ctx, depth + 1));
  }
  flush();
  return out;
}

function listItems(el: HTMLElement, ctx: Ctx, depth: number): string[] {
  const ordered = tag(el) === "ol";
  const lines: string[] = [];
  let n = 0;
  for (const li of el.childNodes) {
    if (!isElement(li) || tag(li) !== "li" || hidden(li)) continue;
    n += 1;
    const marker = ordered ? `${n}. ` : "- ";
    const inner = blocks(li, ctx, depth + 1);
    const [first = "", ...rest] = inner.flatMap((b) => b.split("\n"));
    lines.push(`${marker}${first}`);
    for (const r of rest) lines.push(`${" ".repeat(ordered ? 3 : 2)}${r}`);
  }
  return [lines.join("\n")];
}

function tableRows(el: HTMLElement, ctx: Ctx): string[] {
  const rows = el.querySelectorAll("tr");
  const cells = rows.map((tr) =>
    tr.childNodes
      .filter(
        (c): c is HTMLElement =>
          isElement(c) && (tag(c) === "td" || tag(c) === "th"),
      )
      .map((c) =>
        inline(c, ctx, 0).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim(),
      ),
  );
  const width = Math.max(0, ...cells.map((r) => r.length));
  if (width === 0) return [];
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  if (ctx.plain) return [cells.map((r) => pad(r).join("\t")).join("\n")];
  const lines = cells.map((r) => `| ${pad(r).join(" | ")} |`);
  lines.splice(1, 0, `| ${Array(width).fill("---").join(" | ")} |`);
  return [lines.join("\n")];
}

function block(el: HTMLElement, ctx: Ctx, depth: number): string[] {
  if (depth > MAX_DEPTH)
    return [collapse(el.textContent).trim()].filter(Boolean);
  const t = tag(el);
  if (/^h[1-6]$/.test(t)) {
    const text = inline(el, ctx, depth).replace(/\s+/g, " ").trim();
    return text
      ? [ctx.plain ? text : `${"#".repeat(Number(t[1]))} ${text}`]
      : [];
  }
  switch (t) {
    case "ul":
    case "ol":
      return listItems(el, ctx, depth);
    case "pre": {
      const code = el.textContent.replace(/^\n/, "").replace(/\n$/, "");
      return ctx.plain ? [code] : [`\`\`\`\n${code}\n\`\`\``];
    }
    case "blockquote": {
      const inner = blocks(el, ctx, depth + 1).join("\n\n");
      return ctx.plain || !inner
        ? [inner].filter(Boolean)
        : [
            inner
              .split("\n")
              .map((l) => `> ${l}`.trimEnd())
              .join("\n"),
          ];
    }
    case "table":
      return tableRows(el, ctx);
    case "hr":
      return ctx.plain ? [] : ["---"];
    case "p": {
      const text = inline(el, ctx, depth)
        .replace(/[ \t]+\n/g, "\n")
        .replace(/ {2,}/g, " ")
        .trim();
      return text ? [text] : [];
    }
    default:
      return blocks(el, ctx, depth);
  }
}

// --- sélection du contenu ------------------------------------------------------------------------------------

function cleanTree(root: HTMLElement, onlyMain: boolean): HTMLElement {
  for (const t of DROP_ALWAYS)
    for (const el of root.querySelectorAll(t)) el.remove();
  for (const el of root.querySelectorAll("[hidden],[aria-hidden='true']"))
    el.remove();
  let main: HTMLElement = root;
  if (onlyMain) {
    const candidate =
      root.querySelector("main") ??
      root.querySelector('[role="main"]') ??
      root.querySelector("article");
    if (candidate) main = candidate;
    for (const t of DROP_CHROME)
      for (const el of main.querySelectorAll(t)) el.remove();
    for (const el of main.querySelectorAll(DROP_CHROME_SELECTOR)) el.remove();
  }
  return main;
}

function sanitizeHtml(root: HTMLElement): string {
  for (const el of root.querySelectorAll("*")) {
    for (const name of Object.keys(el.attributes)) {
      const value = el.getAttribute(name) ?? "";
      if (
        name.toLowerCase().startsWith("on") ||
        /^\s*(javascript|data|vbscript):/i.test(value)
      ) {
        if (
          name.toLowerCase() === "href" ||
          name.toLowerCase() === "src" ||
          name.toLowerCase().startsWith("on")
        )
          el.removeAttribute(name);
      }
    }
  }
  return root.innerHTML.trim();
}

function metadataOf(doc: HTMLElement, base: string): PageMetadata {
  const meta = (selector: string) =>
    doc.querySelector(selector)?.getAttribute("content")?.trim() || null;
  const title =
    doc.querySelector("title")?.textContent.trim() ||
    meta('meta[property="og:title"]') ||
    doc.querySelector("h1")?.textContent.trim() ||
    null;
  return {
    title: title ? collapse(title).trim() : null,
    language: doc.querySelector("html")?.getAttribute("lang")?.trim() || null,
    description:
      meta('meta[name="description"]') ||
      meta('meta[property="og:description"]'),
    canonicalUrl: absolute(
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      base,
    ),
  };
}

function baseOf(doc: HTMLElement, pageUrl: string): string {
  return (
    absolute(doc.querySelector("base")?.getAttribute("href"), pageUrl) ??
    pageUrl
  );
}

function linksOf(root: HTMLElement, base: string): PageLink[] {
  const seen = new Set<string>();
  const out: PageLink[] = [];
  for (const a of root.querySelectorAll("a")) {
    const url = absolute(a.getAttribute("href"), base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: textOf(a).slice(0, 200) });
  }
  return out;
}

export interface ExtractOptions {
  formats: readonly Format[];
  onlyMainContent: boolean;
}

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const MAX_NESTING = 256;

/** Profondeur d'imbrication approximative (balises ouvertes non fermées) : borne la récursion de l'analyseur. */
function nestingExceeds(html: string): boolean {
  let depth = 0;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g)) {
    const name = (m[2] ?? "").toLowerCase();
    if (VOID.has(name) || m[3]) continue;
    depth = m[1] ? Math.max(0, depth - 1) : depth + 1;
    if (depth > MAX_NESTING) return true;
  }
  return false;
}

/** Page absurdement imbriquée : texte seul, sans analyse d'arbre. */
function flattened(html: string): string {
  return collapse(
    html
      .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  ).trim();
}

export function extractContent(
  html: string,
  pageUrl: string,
  options: ExtractOptions,
): PageContent {
  if (nestingExceeds(html))
    return plainContent(flattened(html), options.formats);
  const doc = parse(html, { comment: false });
  const base = baseOf(doc, pageUrl);
  const metadata = metadataOf(doc, base);
  const wants = new Set(options.formats);
  const out: PageContent = { metadata };
  // Les liens se prennent sur la page entière (menus compris) : ce sont ceux qu'une exploration suivra.
  if (wants.has("links"))
    out.links = linksOf(parse(html, { comment: false }), base);
  const root = cleanTree(doc, options.onlyMainContent);
  const render = (plain: boolean) =>
    blocks(root, { base, plain }, 0)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  if (wants.has("markdown")) out.markdown = render(false);
  if (wants.has("text")) out.text = render(true);
  if (wants.has("html")) out.html = sanitizeHtml(root);
  return out;
}

/** Liens d'une page pour une exploration (toute la page, `<base>` respectée), sans doublon ni ancre. */
export function extractLinks(html: string, pageUrl: string): string[] {
  if (nestingExceeds(html)) return [];
  const doc = parse(html, { comment: false });
  return linksOf(doc, baseOf(doc, pageUrl)).map((l) => l.url);
}

/** Contenu non HTML (texte brut, JSON) : repris tel quel. */
export function plainContent(
  text: string,
  formats: readonly Format[],
): PageContent {
  const wants = new Set(formats);
  return {
    ...(wants.has("markdown") ? { markdown: text } : {}),
    ...(wants.has("text") ? { text } : {}),
    ...(wants.has("html") ? { html: "" } : {}),
    ...(wants.has("links") ? { links: [] } : {}),
    metadata: {
      title: null,
      language: null,
      description: null,
      canonicalUrl: null,
    },
  };
}
