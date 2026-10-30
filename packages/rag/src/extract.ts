import { type HTMLElement, NodeType, parse } from "node-html-parser";
import { getDocumentProxy, extractText as pdfExtractText } from "unpdf";
import { normalizeText } from "./chunk.ts";

/**
 * Extraction de texte des documents téléversés : .txt, .md, .html et .pdf. Le contenu d'un fichier est une donnée :
 * rien n'est exécuté (HTML : ni script, ni style, ni cadre ; PDF : évaluation de code désactivée dans pdf.js).
 */

export type ExtractKind = "txt" | "md" | "html" | "pdf";

export interface Extracted {
  text: string;
  title: string | null;
  kind: ExtractKind;
  /** PDF : position (dans `text`) du début de chaque page, pour citer la page d'un extrait. */
  pageStarts: number[] | null;
}

export type ExtractErrorCode =
  | "unsupported_type"
  | "too_large"
  | "empty"
  | "corrupt"
  | "encrypted";

export class ExtractError extends Error {
  readonly code: ExtractErrorCode;
  constructor(code: ExtractErrorCode, message: string) {
    super(message);
    this.name = "ExtractError";
    this.code = code;
  }
}

export interface ExtractLimits {
  /** Taille du fichier (défaut 10 Mo). */
  maxBytes?: number;
  /** Longueur du texte extrait (défaut 5 000 000 de caractères). */
  maxChars?: number;
  /** Pages d'un PDF (défaut 500). */
  maxPages?: number;
}

export const SUPPORTED_TYPES_FR =
  "Types pris en charge : .txt, .md, .html et .pdf.";

const EXTENSIONS: Record<string, ExtractKind> = {
  txt: "txt",
  text: "txt",
  md: "md",
  markdown: "md",
  html: "html",
  htm: "html",
  pdf: "pdf",
};
const CONTENT_TYPES: Record<string, ExtractKind> = {
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/pdf": "pdf",
};

function detectKind(input: {
  filename?: string | null;
  contentType?: string | null;
  bytes: Uint8Array;
}): ExtractKind {
  // L'en-tête d'un PDF prime sur le nom : un PDF renommé reste un PDF.
  const head = String.fromCharCode(...input.bytes.subarray(0, 5));
  if (head === "%PDF-") return "pdf";
  const ext = input.filename?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext && EXTENSIONS[ext]) return EXTENSIONS[ext] as ExtractKind;
  const ct = input.contentType?.split(";")[0]?.trim().toLowerCase();
  if (ct && CONTENT_TYPES[ct]) return CONTENT_TYPES[ct] as ExtractKind;
  throw new ExtractError(
    "unsupported_type",
    `Type de fichier non pris en charge. ${SUPPORTED_TYPES_FR}`,
  );
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.includes(0))
    throw new ExtractError(
      "unsupported_type",
      `Ce fichier n'est pas du texte. ${SUPPORTED_TYPES_FR}`,
    );
  let body = bytes;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    body = bytes.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("windows-1252").decode(body);
  }
}

const SKIP = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "object",
  "embed",
  "head",
  "canvas",
  "audio",
  "video",
]);
const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "aside",
  "nav",
  "form",
  "fieldset",
  "blockquote",
  "pre",
  "ul",
  "ol",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "address",
  "details",
  "summary",
  "hr",
]);

function htmlToText(html: string): { text: string; title: string | null } {
  const root = parse(html, {
    blockTextElements: {
      script: false,
      noscript: false,
      style: false,
      pre: true,
    },
  });
  const title =
    root.querySelector("title")?.text.replace(/\s+/g, " ").trim() || null;
  const lines: string[] = [];
  let inline = "";
  const flush = () => {
    const t = inline.replace(/[ \t\r\n ]+/g, " ").trim();
    if (t) lines.push(t);
    inline = "";
  };
  const blank = () => {
    flush();
    if (lines.length && lines.at(-1) !== "") lines.push("");
  };
  const walk = (node: import("node-html-parser").Node) => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      inline += (node as import("node-html-parser").TextNode).text;
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName?.toLowerCase() ?? "";
    if (SKIP.has(tag)) return;
    if (/^h[1-6]$/.test(tag)) {
      blank();
      for (const c of el.childNodes) walk(c);
      const t = inline.replace(/\s+/g, " ").trim();
      inline = "";
      if (t) lines.push(`${"#".repeat(Number(tag[1]))} ${t}`, "");
      return;
    }
    if (tag === "li") {
      flush();
      for (const c of el.childNodes) walk(c);
      const t = inline.replace(/\s+/g, " ").trim();
      inline = "";
      if (t) lines.push(`- ${t}`);
      return;
    }
    if (tag === "tr") {
      flush();
      const cells: string[] = [];
      for (const c of el.childNodes) {
        if (c.nodeType !== NodeType.ELEMENT_NODE) continue;
        const ctag = (c as HTMLElement).tagName?.toLowerCase();
        if (ctag !== "td" && ctag !== "th") continue;
        cells.push((c as HTMLElement).text.replace(/\s+/g, " ").trim());
      }
      const row = cells.filter(Boolean).join(" | ");
      if (row) lines.push(row);
      return;
    }
    if (tag === "br") {
      flush();
      return;
    }
    const block = BLOCK.has(tag);
    if (block) blank();
    for (const c of el.childNodes) walk(c);
    if (block) blank();
  };
  walk(root);
  flush();
  // Un `ul` ferme ses éléments par une ligne vide, pas chaque `li` : on retire les vides en tête et en queue.
  const text = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, title };
}

async function pdfToText(
  bytes: Uint8Array,
  maxPages: number,
): Promise<{ text: string; pageStarts: number[] }> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // pdf.js détache le tampon qu'on lui passe : copie.
    // `isEvalSupported` existe dans pdf.js mais pas dans les types d'unpdf : l'évaluation de code est désactivée.
    const options = {
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
    } as Parameters<typeof getDocumentProxy>[1];
    pdf = await getDocumentProxy(new Uint8Array(bytes), options);
  } catch (error) {
    if ((error as { name?: string }).name === "PasswordException")
      throw new ExtractError(
        "encrypted",
        "Ce PDF est protégé par un mot de passe : retirez la protection avant de le téléverser.",
      );
    throw new ExtractError("corrupt", "Ce PDF est illisible ou abîmé.");
  }
  try {
    if (pdf.numPages > maxPages)
      throw new ExtractError(
        "too_large",
        `Ce PDF compte ${pdf.numPages} pages ; la limite est de ${maxPages} pages.`,
      );
    const { text: pages } = await pdfExtractText(pdf, { mergePages: false });
    let text = "";
    const pageStarts: number[] = [];
    for (const page of pages) {
      const body = normalizeText(page).trim();
      if (text) text += "\n\n";
      pageStarts.push(text.length);
      text += body;
    }
    return { text, pageStarts };
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    throw new ExtractError("corrupt", "Ce PDF est illisible ou abîmé.");
  } finally {
    // Libère les ressources de pdf.js si cette version l'expose (le document n'est de toute façon pas conservé).
    await (pdf as { destroy?: () => Promise<void> })
      .destroy?.()
      ?.catch(() => undefined);
  }
}

export async function extractText(
  input: {
    filename?: string | null;
    contentType?: string | null;
    bytes: Uint8Array;
  },
  limits: ExtractLimits = {},
): Promise<Extracted> {
  const maxBytes = limits.maxBytes ?? 10 * 1024 * 1024;
  const maxChars = limits.maxChars ?? 5_000_000;
  const maxPages = limits.maxPages ?? 500;
  if (input.bytes.byteLength > maxBytes)
    throw new ExtractError(
      "too_large",
      `Ce fichier dépasse la taille maximale de ${Math.round(maxBytes / (1024 * 1024))} Mo.`,
    );
  const kind = detectKind(input);
  let text: string;
  let title: string | null = null;
  let pageStarts: number[] | null = null;
  if (kind === "pdf") {
    const r = await pdfToText(input.bytes, maxPages);
    text = r.text;
    pageStarts = r.pageStarts;
  } else if (kind === "html") {
    const r = htmlToText(decodeText(input.bytes));
    text = r.text;
    title = r.title;
  } else {
    text = normalizeText(decodeText(input.bytes));
    if (kind === "md")
      title =
        /^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(text)?.[1]?.trim() ?? null;
  }
  if (text.length > maxChars)
    throw new ExtractError(
      "too_large",
      `Le texte extrait dépasse ${maxChars.toLocaleString("fr-CA")} caractères.`,
    );
  if (text.trim().length === 0)
    throw new ExtractError(
      "empty",
      kind === "pdf"
        ? "Ce PDF ne contient aucun texte extractible (peut-être un document numérisé : la reconnaissance de caractères n'est pas offerte)."
        : "Ce document est vide.",
    );
  return { text, title, kind, pageStarts };
}
