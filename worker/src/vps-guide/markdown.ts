/**
 * Rendu Markdown minimal du guide de branchement (sans dépendance). Sous-ensemble volontairement
 * restreint, entièrement échappé : titres, paragraphes, listes (un niveau d'imbrication), tableaux,
 * blocs de code, encadrés (`:::attention Titre` … `:::`), règle, saut de page. Aucun HTML brut ne passe.
 */
export interface Heading {
  level: number;
  id: string;
  text: string;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SAFE_HREF = /^(https:\/\/|mailto:|#)[^\s"'<>]*$/;

function inline(raw: string): string {
  // Le code en ligne est mis de côté pour ne pas être interprété.
  const codes: string[] = [];
  let s = raw.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\uE000${codes.length - 1}\uE001`;
  });
  s = escapeHtml(s);
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, text: string, href: string) => {
      const url = href.replace(/&amp;/g, "&");
      return SAFE_HREF.test(url)
        ? `<a href="${escapeHtml(url)}">${text}</a>`
        : text;
    },
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
  return s.replace(
    /\uE000(\d+)\uE001/g,
    (_m, i: string) => codes[Number(i)] ?? "",
  );
}

interface Ctx {
  headings: Heading[];
  used: Map<string, number>;
}

function uniqueId(ctx: Ctx, text: string): string {
  const base = slugify(text) || "section";
  const n = (ctx.used.get(base) ?? 0) + 1;
  ctx.used.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function renderList(lines: string[], ctx: Ctx): string {
  type Item = { text: string; children: string[] };
  const first = LIST_ITEM.exec(lines[0] ?? "");
  const ordered = /\d+\./.test(first?.[2] ?? "");
  const baseIndent = first?.[1]?.length ?? 0;
  const items: Item[] = [];
  for (const line of lines) {
    const m = LIST_ITEM.exec(line);
    if (m && (m[1]?.length ?? 0) <= baseIndent) {
      items.push({ text: m[3] as string, children: [] });
    } else if (items.length > 0) {
      const last = items[items.length - 1] as Item;
      if (m) last.children.push(line);
      else last.text += ` ${line.trim()}`;
    }
  }
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items
    .map(
      (it) =>
        `<li>${inline(it.text)}${it.children.length ? renderList(it.children, ctx) : ""}</li>`,
    )
    .join("")}</${tag}>`;
}

function renderBlocks(src: string, ctx: Ctx): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Bloc de code
    const fence = /^```\s*([A-Za-z0-9_-]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] as string)) {
        body.push(lines[i] as string);
        i++;
      }
      i++;
      out.push(
        `<pre${fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : ""}><code>${escapeHtml(body.join("\n"))}</code></pre>`,
      );
      continue;
    }
    // Encadré
    const aside = /^:::(note|attention|important|astuce)\s*(.*)$/.exec(line);
    if (aside) {
      const body: string[] = [];
      i++;
      while (i < lines.length && (lines[i] as string).trim() !== ":::") {
        body.push(lines[i] as string);
        i++;
      }
      i++;
      const title = aside[2]?.trim();
      out.push(
        `<aside class="encadre ${aside[1]}">${title ? `<p class="encadre-titre">${inline(title)}</p>` : ""}${renderBlocks(body.join("\n"), ctx)}</aside>`,
      );
      continue;
    }
    if (/^<!--\s*saut\s*-->\s*$/.test(line)) {
      out.push('<div class="saut"></div>');
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] as string).length;
      const text = (heading[2] as string).trim();
      const id = uniqueId(ctx, text);
      ctx.headings.push({ level, id, text });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }
    if (
      TABLE_ROW.test(line) &&
      i + 1 < lines.length &&
      TABLE_SEP.test(lines[i + 1] as string)
    ) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i] as string)) {
        rows.push(cells(lines[i] as string));
        i++;
      }
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows
          .map(
            (r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table>`,
      );
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const block: string[] = [];
      while (
        i < lines.length &&
        (lines[i] as string).trim() !== "" &&
        !/^```/.test(lines[i] as string)
      ) {
        block.push(lines[i] as string);
        i++;
      }
      // Une liste numérotée qui suit une liste à puces (sans ligne vide) reste un bloc séparé.
      const groups: string[][] = [];
      for (const l of block) {
        const m = LIST_ITEM.exec(l);
        const kind =
          m && (m[1]?.length ?? 0) === 0 ? /\d+\./.test(m[2] as string) : null;
        const cur = groups[groups.length - 1];
        const curKind = cur
          ? /\d+\./.test(LIST_ITEM.exec(cur[0] as string)?.[2] ?? "")
          : null;
        if (!cur || (kind !== null && kind !== curKind)) groups.push([l]);
        else cur.push(l);
      }
      for (const g of groups) out.push(renderList(g, ctx));
      continue;
    }
    // Paragraphe
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] as string).trim() !== "" &&
      !/^(#{1,3}\s|```|:::|---+\s*$|<!--)/.test(lines[i] as string) &&
      !LIST_ITEM.test(lines[i] as string) &&
      !TABLE_ROW.test(lines[i] as string)
    ) {
      para.push((lines[i] as string).trim());
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("");
}

export function renderMarkdown(src: string): {
  html: string;
  headings: Heading[];
} {
  const ctx: Ctx = { headings: [], used: new Map() };
  const html = renderBlocks(src, ctx);
  return { html, headings: ctx.headings };
}
