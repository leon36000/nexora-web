import type { RichNode } from "@/lib/rich-text";
import { safeHref } from "@/lib/safe-href";
import type { Block, CardStatus, PageModel } from "@/server/cms/model";

/**
 * Page publiée -> Markdown propre (llms-full.txt). Généré depuis le MODÈLE de page, c'est-à-dire ce que la page affiche :
 * aucun texte écrit pour l'occasion, aucun HTML, liens absolus. Les titres de la page commencent au niveau 4 (le fichier
 * occupe les niveaux 1 à 3).
 */
export interface MarkdownOptions {
  /** Adresse du site : rend absolus les liens relatifs. */
  siteUrl: string;
  /** Adapte un lien saisi dans Directus à la langue (correspondance des slugs) ; défaut : tel quel. */
  resolveHref?: (href: string) => string;
  /** Libellés d'état des cartes (« Disponible », « En pilote »…), selon la langue ; absents = non écrits. */
  statusLabels?: Partial<Record<CardStatus, string>>;
}

const squash = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, " ").trim();

/** Échappe ce qui changerait le sens du Markdown dans un texte brut. */
const escapeMd = (s: string) => s.replace(/([\\*_`[\]])/g, "\\$1");

/** Lien absolu, sans barre oblique finale ; `null` si le lien n'est pas sûr. */
export function absoluteHref(
  href: string | null | undefined,
  options: Pick<MarkdownOptions, "siteUrl" | "resolveHref">,
): string | null {
  const safe = safeHref(href);
  if (!safe) return null;
  const resolved = options.resolveHref ? options.resolveHref(safe) : safe;
  if (resolved.startsWith("/") && !resolved.startsWith("//")) {
    const cut = resolved.search(/[?#]/);
    const path = cut === -1 ? resolved : resolved.slice(0, cut);
    const rest = cut === -1 ? "" : resolved.slice(cut);
    const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : "";
    return `${options.siteUrl}${trimmed}${rest}`;
  }
  return /^(https?:|mailto:|tel:)/i.test(resolved) ? resolved : null;
}

type RichOptions = Pick<MarkdownOptions, "siteUrl" | "resolveHref"> & {
  /** Niveau de titre d'un `h2` du texte riche (`h3` = niveau + 1). Défaut : 4. */
  baseHeading?: number;
};

function inline(nodes: readonly RichNode[], options: RichOptions): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return escapeMd(n.value);
      const inner = inline(n.children, options);
      switch (n.tag) {
        case "strong":
          return inner.trim() ? `**${inner.trim()}**` : "";
        case "em":
          return inner.trim() ? `*${inner.trim()}*` : "";
        case "br":
          return "\n";
        case "a": {
          const href = absoluteHref(n.href, options);
          return href && inner.trim() ? `[${inner.trim()}](${href})` : inner;
        }
        default:
          return inner;
      }
    })
    .join("");
}

function blocks(nodes: readonly RichNode[], options: RichOptions): string[] {
  const out: string[] = [];
  const base = options.baseHeading ?? 4;
  let run: RichNode[] = [];
  const flush = () => {
    const text = squash(inline(run, options));
    if (text) out.push(text);
    run = [];
  };
  for (const n of nodes) {
    if (n.type === "text" || ["strong", "em", "a", "br"].includes(n.tag)) {
      run.push(n);
      continue;
    }
    flush();
    switch (n.tag) {
      case "p": {
        const text = squash(inline(n.children, options));
        if (text) out.push(text);
        break;
      }
      case "h2":
      case "h3": {
        const text = squash(inline(n.children, options));
        if (text)
          out.push(`${"#".repeat(base + (n.tag === "h3" ? 1 : 0))} ${text}`);
        break;
      }
      case "ul":
      case "ol": {
        const items = n.children
          .filter((c) => c.type === "el" && c.tag === "li")
          .map((c, i) => {
            const li = c as Extract<RichNode, { type: "el" }>;
            const text = squash(
              blocks(li.children, options).join(" ").replace(/\n/g, " "),
            );
            return text ? `${n.tag === "ol" ? `${i + 1}.` : "-"} ${text}` : "";
          })
          .filter(Boolean);
        if (items.length > 0) out.push(items.join("\n"));
        break;
      }
      case "blockquote": {
        const text = blocks(n.children, options).join("\n\n");
        if (text)
          out.push(
            text
              .split("\n")
              .map((l) => (l ? `> ${l}` : ">"))
              .join("\n"),
          );
        break;
      }
      case "li":
        out.push(`- ${squash(inline(n.children, options))}`);
        break;
      default:
        break;
    }
  }
  flush();
  return out;
}

/** Texte riche contrôlé -> Markdown (paragraphes séparés d'une ligne vide, listes, citations, titres, liens absolus). */
export function richToMarkdown(
  nodes: readonly RichNode[],
  options: Partial<RichOptions> = {},
): string {
  return blocks(nodes, { siteUrl: "", ...options }).join("\n\n");
}

const heading = (level: number, text: string | null | undefined) =>
  squash(text) ? `${"#".repeat(level)} ${squash(text)}` : "";

/** Lien Markdown d'un appel à l'action, ou `null`. */
function link(
  cta: { label: string; href: string } | null,
  options: MarkdownOptions,
): string | null {
  if (!cta) return null;
  const href = absoluteHref(cta.href, options);
  const label = squash(cta.label);
  return href && label ? `[${escapeMd(label)}](${href})` : null;
}

const bullets = (items: (string | null)[]) =>
  items
    .filter((x): x is string => !!x)
    .map((x) => `- ${x}`)
    .join("\n");

function blockToMarkdown(block: Block, options: MarkdownOptions): string[] {
  const parts: string[] = [];
  const push = (...xs: (string | null | undefined)[]) => {
    for (const x of xs) if (x?.trim()) parts.push(x.trim());
  };
  switch (block.type) {
    case "hero":
      push(
        block.eyebrow ? `*${escapeMd(squash(block.eyebrow))}*` : null,
        block.headline ? `**${escapeMd(squash(block.headline))}**` : null,
        block.subheadline ? escapeMd(squash(block.subheadline)) : null,
        bullets([link(block.primary, options), link(block.secondary, options)]),
      );
      break;
    case "section":
      push(
        heading(4, escapeMd(squash(block.title))),
        block.body
          ? richToMarkdown(block.body, { ...options, baseHeading: 5 })
          : null,
        bullets(
          block.items.map((i) =>
            i.title || i.text
              ? `${i.title ? `**${escapeMd(squash(i.title))}**` : ""}${i.title && i.text ? " " : ""}${i.text ? escapeMd(squash(i.text)) : ""}`
              : null,
          ),
        ),
      );
      break;
    case "cards":
      push(
        heading(4, escapeMd(squash(block.title))),
        block.intro ? escapeMd(squash(block.intro)) : null,
        bullets(
          block.cards.map((c) => {
            const head = c.title ?? c.label;
            if (!head && !c.text) return null;
            const status = c.status ? options.statusLabels?.[c.status] : null;
            const href = absoluteHref(c.href, options);
            const more =
              href && c.linkLabel
                ? ` [${escapeMd(squash(c.linkLabel))}](${href})`
                : "";
            const text = c.text
              ? escapeMd(
                  c.text
                    .split("\n")
                    .map((l) => squash(l))
                    .filter(Boolean)
                    .join(" "),
                )
              : "";
            return `${head ? `**${escapeMd(squash(head))}**` : ""}${head && text ? " : " : ""}${text}${status ? ` (${status})` : ""}${more}`;
          }),
        ),
      );
      break;
    case "pricing":
      push(
        heading(4, escapeMd(squash(block.title))),
        block.intro ? escapeMd(squash(block.intro)) : null,
        ...block.plans.map((p) =>
          [
            `**${escapeMd(squash(p.name))}**${p.priceLabel ? ` : ${escapeMd(squash(p.priceLabel))}` : ""}${p.billingNote ? ` (${escapeMd(squash(p.billingNote))})` : ""}`,
            p.description ? escapeMd(squash(p.description)) : null,
            bullets(p.features.map((f) => escapeMd(squash(f)))),
            bullets([link(p.cta, options)]),
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
        block.note ? escapeMd(squash(block.note)) : null,
      );
      break;
    case "faq":
      push(
        heading(4, escapeMd(squash(block.title))),
        ...block.items.map(
          (q) =>
            `${heading(5, escapeMd(squash(q.question)))}\n\n${escapeMd(squash(q.answer))}`,
        ),
      );
      break;
    case "cta":
      push(
        heading(4, escapeMd(squash(block.title))),
        block.text ? escapeMd(squash(block.text)) : null,
        bullets([link(block.primary, options), link(block.secondary, options)]),
      );
      break;
  }
  return parts;
}

/**
 * Corps Markdown d'une page : les blocs dans l'ordre, séparés d'une ligne vide, terminé par un saut de ligne.
 * Le titre de la page et son adresse sont ajoutés par l'appelant (`llms-full.ts`).
 */
export function pageToMarkdown(
  page: PageModel,
  options: MarkdownOptions,
): string {
  const parts = page.blocks.flatMap((b) => blockToMarkdown(b, options));
  return parts.length === 0 ? "" : `${parts.join("\n\n")}\n`;
}
