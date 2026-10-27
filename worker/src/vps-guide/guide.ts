import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Heading, renderMarkdown } from "./markdown.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** Source du guide (Markdown, versionnée) et PDF généré à partir d'elle. */
export const GUIDE_MD = join(
  root,
  "docs",
  "vps",
  "guide-branchement-proxmox.md",
);
export const GUIDE_PDF = join(
  root,
  "docs",
  "vps",
  "guide-branchement-proxmox.pdf",
);

/** Empreinte courte du texte source : écrite dans le titre du PDF, relue par le test de fraîcheur. */
export const sourceHash = (md: string): string =>
  createHash("sha256").update(md).digest("hex").slice(0, 12);

export const guideTitle = (md: string, h1: string): string =>
  `${h1} (source ${sourceHash(md)})`;

/** Titre (champ /Title) d'un PDF produit par Chromium : chaîne hexadécimale UTF-16BE ou chaîne littérale. */
export function pdfTitle(bytes: Uint8Array): string | null {
  const text = Buffer.from(bytes).toString("latin1");
  const hex = /\/Title\s*<([0-9A-Fa-f]+)>/.exec(text);
  if (hex) {
    const raw = Buffer.from(hex[1] as string, "hex");
    if (raw[0] === 0xfe && raw[1] === 0xff) {
      const body = raw.subarray(2);
      const swapped = Buffer.alloc(body.length - (body.length % 2));
      for (let i = 0; i + 1 < body.length; i += 2) {
        swapped[i] = body[i + 1] as number;
        swapped[i + 1] = body[i] as number;
      }
      return swapped.toString("utf16le");
    }
    return raw.toString("latin1");
  }
  const lit = /\/Title\s*\(([^)]*)\)/.exec(text);
  return lit ? (lit[1] as string) : null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CSS = `
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1b2430; margin: 0; }
.couverture { padding: 0 0 6mm; }
.bandeau { background: #0f2747; color: #fff; padding: 14mm 9mm 11mm; border-radius: 2.5mm; }
.bandeau .marque { letter-spacing: .28em; text-transform: uppercase; font-size: 9pt; color: #9fc2ff; margin: 0 0 6mm; }
.bandeau h1 { font-size: 24pt; line-height: 1.15; margin: 0 0 4mm; font-weight: 700; }
.bandeau .meta { font-size: 9pt; color: #c9d7ee; margin: 0; }
.sommaire { margin: 8mm 0 0; }
.sommaire h2 { font-size: 13pt; margin: 0 0 3mm; color: #0f2747; border: 0; padding: 0; }
.sommaire ol { list-style: none; margin: 0; padding: 0; }
.sommaire li { margin: 0; padding: 1mm 0; border-bottom: 1px dotted #c8d1de; }
.sommaire li.n3 { padding-left: 7mm; font-size: 9.5pt; color: #46556a; border: 0; }
.sommaire a { color: inherit; text-decoration: none; }
.page { padding: 0; }
h2 { font-size: 15pt; color: #0f2747; margin: 8mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 2px solid #2f6bd9; break-after: avoid; }
h3 { font-size: 12pt; color: #1d3a66; margin: 6mm 0 2mm; break-after: avoid; }
p { margin: 0 0 3mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin: 0 0 1mm; }
a { color: #1f5fcc; }
code { font-family: "JetBrains Mono", "DejaVu Sans Mono", "Liberation Mono", monospace; font-size: 9pt; background: #eef2f8; padding: 0 1.2mm; border-radius: 1mm; }
pre { background: #f3f5f9; border: 1px solid #d5dce8; border-left: 3px solid #2f6bd9; border-radius: 1.5mm; padding: 3mm 4mm; margin: 0 0 4mm; white-space: pre-wrap; word-break: break-word; break-inside: avoid; }
pre code { background: none; padding: 0; font-size: 8.6pt; }
table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9.4pt; }
th { text-align: left; background: #0f2747; color: #fff; padding: 1.8mm 2.4mm; font-weight: 600; }
td { padding: 1.6mm 2.4mm; border-bottom: 1px solid #dde3ee; vertical-align: top; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #f6f8fc; }
.encadre { border-radius: 1.5mm; padding: 3mm 4mm; margin: 0 0 4mm; border-left: 4px solid; break-inside: avoid; }
.encadre p:last-child, .encadre ul:last-child, .encadre ol:last-child { margin-bottom: 0; }
.encadre-titre { font-weight: 700; margin: 0 0 1.5mm; }
.encadre.note { background: #eaf2ff; border-color: #2f6bd9; }
.encadre.attention { background: #fff4e0; border-color: #e08a00; }
.encadre.important { background: #fde9e9; border-color: #d23a3a; }
.encadre.astuce { background: #e8f6ec; border-color: #2e9c55; }
hr { border: 0; border-top: 1px solid #cfd7e4; margin: 5mm 0; }
.saut { break-after: page; }
`;

/**
 * Page HTML autonome du guide (aucune ressource externe) : bandeau de titre, sommaire cliquable, puis
 * le contenu. Le titre du document porte l'empreinte du texte source (test de fraîcheur du PDF).
 */
export function buildGuideHtml(md: string, opts: { date: string }): string {
  const { html, headings } = renderMarkdown(md);
  const h1 = headings.find((h) => h.level === 1)?.text ?? "Guide";
  const afterH1 = html.replace(/^<h1[^>]*>.*?<\/h1>/, "");
  const toc = headings
    .filter((h: Heading) => h.level === 2 || h.level === 3)
    .map(
      (h) =>
        `<li class="n${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(guideTitle(md, h1))}</title>
<style>${CSS}</style>
</head>
<body>
<section class="couverture">
<div class="bandeau"><div class="page-marges"><p class="marque">Nexora AI</p><h1>${escapeHtml(h1)}</h1><p class="meta">Version du document : ${sourceHash(md)} · Généré le ${escapeHtml(opts.date)} · Destiné au personnel</p></div></div>
<nav class="sommaire"><h2>Sommaire</h2><ol>${toc}</ol></nav>
</section>
<div class="saut"></div>
<main class="page">${afterH1}</main>
</body>
</html>`;
}
