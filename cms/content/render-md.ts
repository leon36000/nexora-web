#!/usr/bin/env bun
// Texte de relecture : produit `pages/<page>.<langue>.md` à partir du JSON (source de vérité).
// Les fichiers .md sont générés ; un test vérifie qu'ils correspondent au JSON.
//
//   bun run cms/content/render-md.ts

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BlockFile,
  type ClaimsFile,
  type Fields,
  type Json,
  type PageFile,
  readPageFile,
} from "../scripts/lib/content";

export const PAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "pages");

const str = (v: Json | undefined): string => (typeof v === "string" ? v : "");
const list = (v: Json | undefined): Fields[] =>
  Array.isArray(v) ? (v as Fields[]) : [];

/** HTML contrôlé des blocs de texte -> Markdown lisible. */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<a href="([^"]*)">([^<]*)<\/a>/g, "[$2]($1)")
    .replace(/<strong>([^<]*)<\/strong>/g, "**$1**")
    .replace(/<em>([^<]*)<\/em>/g, "*$1*")
    .replace(/<\/p>\s*<p>/g, "\n\n")
    .replace(/<\/?p>/g, "")
    .replace(/<li>/g, "- ")
    .replace(/<\/li>/g, "\n")
    .replace(/<\/?(ul|ol)>/g, "")
    .trim();
}

const NAMES: Record<string, string> = {
  block_hero: "Héros",
  block_section: "Section",
  block_cards: "Cartes",
  block_pricing: "Tarifs",
  block_faq: "FAQ",
  block_cta: "Appel à l'action",
};

function button(label: Json | undefined, href: Json | undefined): string {
  return label ? `[${str(label)}](${str(href)})` : "";
}

function renderBlock(b: BlockFile, i: number): string {
  const t = b.translation;
  const out: string[] = [];
  const claims = (b.claims ?? []).length
    ? ` · Affirmations : ${(b.claims ?? []).join(", ")}`
    : "";
  out.push(
    `### Bloc ${i + 1} — ${NAMES[b.collection] ?? b.collection} (\`${b.collection}\`)`,
  );
  out.push(`*${b.role ?? ""}${claims}*`);
  if (b.fields && Object.keys(b.fields).length)
    out.push(
      `Réglages : ${Object.entries(b.fields)
        .map(([k, v]) => `\`${k}=${String(v)}\``)
        .join(", ")}`,
    );
  switch (b.collection) {
    case "block_hero": {
      if (t.eyebrow) out.push(`**${str(t.eyebrow)}**`);
      out.push(`# ${str(t.headline)}`);
      if (t.subheadline) out.push(str(t.subheadline));
      out.push(
        [
          button(t.primary_label, t.primary_href),
          button(t.secondary_label, t.secondary_href),
        ]
          .filter(Boolean)
          .join(" · "),
      );
      break;
    }
    case "block_section": {
      if (t.title) out.push(`## ${str(t.title)}`);
      if (t.body) out.push(htmlToMarkdown(str(t.body)));
      const items = list(t.items);
      if (items.length)
        out.push(
          items
            .map((it) => `- **${str(it.title)}** ${str(it.text)}`)
            .join("\n"),
        );
      break;
    }
    case "block_cards": {
      if (t.title) out.push(`## ${str(t.title)}`);
      if (t.intro) out.push(str(t.intro));
      for (const c of list(t.cards)) {
        const lines = [`#### ${str(c.title)}`, str(c.text)];
        if (c.href)
          lines.push(`→ [${str(c.link_label) || str(c.href)}](${str(c.href)})`);
        out.push(lines.join("\n\n"));
      }
      break;
    }
    case "block_faq": {
      if (t.title) out.push(`## ${str(t.title)}`);
      for (const q of list(t.items))
        out.push(`#### ${str(q.question)}\n\n${str(q.answer)}`);
      break;
    }
    case "block_cta": {
      out.push(`## ${str(t.title)}`);
      if (t.text) out.push(str(t.text));
      out.push(
        [
          button(t.primary_label, t.primary_href),
          button(t.secondary_label, t.secondary_href),
        ]
          .filter(Boolean)
          .join(" · "),
      );
      break;
    }
    default:
      out.push(`\`\`\`json\n${JSON.stringify(t, null, 2)}\n\`\`\``);
  }
  return out.join("\n\n");
}

/** Markdown d'une page (une langue). Déterministe : le test compare au fichier écrit. */
export function renderMarkdown(f: PageFile): string {
  const route =
    f.locale === "fr-CA"
      ? `/${f.seo.slug}${f.seo.slug ? "/" : ""}`
      : `/en/${f.seo.slug}${f.seo.slug ? "/" : ""}`;
  const out: string[] = [];
  out.push(`# ${f.seo.title} — ${f.locale}`);
  out.push(
    `> Texte de relecture **généré** par \`bun run cms/content/render-md.ts\` à partir de \`${f.page}.${f.locale}.json\`. Ne pas modifier à la main : corriger le JSON, puis régénérer.`,
  );
  out.push(
    [
      "## Métadonnées",
      "",
      `- Page : \`${f.page}\` · langue : \`${f.locale}\` · statut visé : \`${f.status}\` · noindex : ${f.noindex ? "oui" : "non"}`,
      `- Route : \`${route}\` · slug : \`${f.seo.slug}\``,
      `- Titre SEO (${[...f.seo.seo_title].length} caractères) : ${f.seo.seo_title}`,
      `- Description SEO (${[...f.seo.seo_description].length} caractères) : ${f.seo.seo_description}`,
    ].join("\n"),
  );
  out.push("## Contenu");
  f.blocks.forEach((b, i) => {
    out.push(renderBlock(b, i));
  });
  return `${out.join("\n\n")}\n`;
}

export const README_PATH = join(dirname(PAGES_DIR), "README.md");
const MARK_START = "<!-- claims:start -->";
const MARK_END = "<!-- claims:end -->";
const cell = (v: string) => v.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** Tableau « affirmation sensible → entrée du registre », avec les blocs où elle est utilisée. */
export function claimsTable(): string {
  const claims = JSON.parse(
    readFileSync(join(dirname(PAGES_DIR), "claims.json"), "utf8"),
  ) as ClaimsFile;
  const used = new Map<string, string[]>();
  for (const name of readdirSync(PAGES_DIR).filter((n) =>
    n.endsWith(".fr-CA.json"),
  )) {
    const f = readPageFile(join(PAGES_DIR, name));
    f.blocks.forEach((b, i) => {
      for (const c of b.claims ?? []) {
        const list = used.get(c) ?? [];
        list.push(`${f.page} #${i + 1}`);
        used.set(c, list);
      }
    });
  }
  const rows = claims.claims.map(
    (c) =>
      `| ${c.id} | ${cell(c.statement)} | ${c.kind} | ${(used.get(c.id) ?? []).join(", ")} | ${cell(c.evidence)} | ${cell(c.source_version)} | ${c.approval_status} |`,
  );
  return [
    "| Code | Affirmation (fr-CA) | Type | Utilisée dans (page #bloc) | Preuve | Source et version | État |",
    "|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

/** Remplace le tableau du README entre les deux marqueurs. */
export function readmeWithTable(readme: string): string {
  const a = readme.indexOf(MARK_START);
  const b = readme.indexOf(MARK_END);
  if (a < 0 || b < a) throw new Error("marqueurs claims absents du README");
  return `${readme.slice(0, a + MARK_START.length)}\n\n${claimsTable()}\n\n${readme.slice(b)}`;
}

export function writeAll() {
  for (const name of readdirSync(PAGES_DIR).filter((n) =>
    n.endsWith(".json"),
  )) {
    const f = readPageFile(join(PAGES_DIR, name));
    const target = join(PAGES_DIR, name.replace(/\.json$/, ".md"));
    writeFileSync(target, renderMarkdown(f));
    console.log(`  ${target.split("/").slice(-2).join("/")}`);
  }
  writeFileSync(
    README_PATH,
    readmeWithTable(readFileSync(README_PATH, "utf8")),
  );
  console.log("  README.md (tableau des affirmations)");
}

if (import.meta.main) writeAll();
