/**
 * Texte riche contrôlé (liste blanche).
 *
 * Le CMS fournit du HTML produit par un éditeur restreint (gras, italique, lien, listes, titres 2 et 3,
 * citation). On ne le réinjecte JAMAIS tel quel : il est analysé en un arbre de nœuds reconstruits
 * uniquement à partir de balises autorisées, puis rendu en éléments React (le texte est échappé par React,
 * il n'y a aucun `dangerouslySetInnerHTML`). Ce qui n'est pas autorisé est écarté :
 * - script, style, iframe, objets, svg… : supprimés AVEC leur contenu ;
 * - toute autre balise : « déballée » (on garde le texte, pas la balise) ;
 * - tout attribut sauf `href` d'un lien, et `href` filtré par `safeHref` ;
 * - commentaires, déclarations, CDATA : ignorés.
 */
import { safeHref } from "./safe-href";

export type RichElementTag =
  | "p"
  | "br"
  | "strong"
  | "em"
  | "a"
  | "ul"
  | "ol"
  | "li"
  | "h2"
  | "h3"
  | "blockquote";

export type RichNode =
  | { type: "text"; value: string }
  | { type: "el"; tag: RichElementTag; href?: string; children: RichNode[] };

const ALIASES: Record<string, RichElementTag> = {
  p: "p",
  br: "br",
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  a: "a",
  ul: "ul",
  ol: "ol",
  li: "li",
  h2: "h2",
  h3: "h3",
  blockquote: "blockquote",
};

/** Éléments supprimés avec leur contenu. */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "textarea",
  "title",
  "head",
  "select",
  "button",
]);

const BLOCKS = new Set<RichElementTag>([
  "p",
  "ul",
  "ol",
  "h2",
  "h3",
  "blockquote",
]);

export const MAX_INPUT = 100_000;
const MAX_DEPTH = 24;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: String.fromCharCode(0xa0),
  laquo: "«",
  raquo: "»",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      const ok =
        Number.isInteger(code) &&
        code > 0x1f &&
        code <= 0x10ffff &&
        !(code >= 0xd800 && code <= 0xdfff) &&
        !(code >= 0x7f && code <= 0x9f);
      // une référence invalide disparaît (jamais de caractère de contrôle)
      return ok || code === 0x09 || code === 0x0a
        ? String.fromCodePoint(code)
        : "";
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

const START_TAG =
  /^<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=/>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/;
const END_TAG = /^<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/;
const ATTR = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function hrefOf(attrs: string): string | null {
  ATTR.lastIndex = 0;
  for (let m = ATTR.exec(attrs); m; m = ATTR.exec(attrs)) {
    if ((m[1] ?? "").toLowerCase() !== "href") continue;
    return safeHref(decodeEntities(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return null;
}

type Frame = {
  /** Étiquette autorisée, ou null pour une balise inconnue « déballée ». */
  tag: RichElementTag | null;
  name: string;
  children: RichNode[];
  href?: string;
};

export function parseRichText(html: string): RichNode[] {
  const src = html.length > MAX_INPUT ? html.slice(0, MAX_INPUT) : html;
  const root: Frame = { tag: null, name: "#root", children: [] };
  const stack: Frame[] = [root];
  const top = () => stack[stack.length - 1] as Frame;

  const pushText = (value: string) => {
    if (value === "") return;
    const children = top().children;
    const last = children[children.length - 1];
    if (last?.type === "text") last.value += value;
    else children.push({ type: "text", value });
  };
  /** Retire le cadre du dessus et l'attache à son parent (ou le déballe). */
  const closeTop = () => {
    const f = stack.pop() as Frame;
    const parent = top();
    if (f.tag === null) {
      for (const c of f.children) {
        if (c.type === "text") {
          const last = parent.children[parent.children.length - 1];
          if (last?.type === "text") last.value += c.value;
          else parent.children.push(c);
        } else parent.children.push(c);
      }
    } else {
      parent.children.push({
        type: "el",
        tag: f.tag,
        ...(f.href ? { href: f.href } : {}),
        children: f.children,
      });
    }
  };
  const insideAnchor = () => stack.some((f) => f.tag === "a");
  const topAllowedTag = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const t = (stack[i] as Frame).tag;
      if (t) return t;
    }
    return null;
  };

  let i = 0;
  let textStart = 0;
  const flushText = (end: number) => {
    if (end > textStart) pushText(decodeEntities(src.slice(textStart, end)));
  };

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) break;
    const rest = src.slice(lt);

    // commentaire, CDATA, déclaration, instruction
    if (rest.startsWith("<!--")) {
      flushText(lt);
      const end = src.indexOf("-->", lt + 4);
      i = textStart = end === -1 ? src.length : end + 3;
      continue;
    }
    if (rest.startsWith("<![CDATA[")) {
      flushText(lt);
      const end = src.indexOf("]]>", lt + 9);
      i = textStart = end === -1 ? src.length : end + 3;
      continue;
    }
    if (rest.startsWith("<!") || rest.startsWith("<?")) {
      flushText(lt);
      const end = src.indexOf(">", lt + 2);
      i = textStart = end === -1 ? src.length : end + 1;
      continue;
    }

    const endTag = END_TAG.exec(rest);
    if (endTag) {
      flushText(lt);
      const name = (endTag[1] as string).toLowerCase();
      // ferme jusqu'au cadre correspondant s'il existe ; sinon ignore la fermeture orpheline
      let idx = -1;
      for (let k = stack.length - 1; k >= 1; k--) {
        if ((stack[k] as Frame).name === name) {
          idx = k;
          break;
        }
      }
      if (idx !== -1) while (stack.length > idx) closeTop();
      i = textStart = lt + endTag[0].length;
      continue;
    }

    const startTag = START_TAG.exec(rest);
    if (startTag) {
      flushText(lt);
      const name = (startTag[1] as string).toLowerCase();
      const attrs = startTag[2] ?? "";
      const selfClosed = startTag[3] === "/";
      i = textStart = lt + startTag[0].length;

      if (DROP_WITH_CONTENT.has(name)) {
        if (!selfClosed) {
          const close = new RegExp(`</${name}\\s*>`, "i");
          const m = close.exec(src.slice(i));
          i = textStart = m ? i + m.index + m[0].length : src.length;
        }
        continue;
      }

      const tag = ALIASES[name] ?? null;
      if (tag === "br") {
        top().children.push({ type: "el", tag: "br", children: [] });
        continue;
      }
      if (tag === null) {
        // balise inconnue : déballée (on garde son contenu), sauf les éléments vides
        if (
          !selfClosed &&
          !/^(img|hr|input|meta|link|base|source|wbr)$/.test(name)
        ) {
          if (stack.length < MAX_DEPTH)
            stack.push({ tag: null, name, children: [] });
        }
        continue;
      }
      if (stack.length >= MAX_DEPTH) continue;

      if (tag === "a") {
        const href = hrefOf(attrs);
        if (!href || insideAnchor()) {
          // lien refusé ou imbriqué : on garde le texte seulement
          if (!selfClosed) stack.push({ tag: null, name, children: [] });
          continue;
        }
        stack.push({ tag, name, children: [], href });
        continue;
      }

      // fermetures implicites
      if (BLOCKS.has(tag)) {
        while (topAllowedTag() === "p") {
          // ferme les inconnus posés sur le paragraphe puis le paragraphe lui-même
          closeTop();
        }
      }
      if (tag === "li") {
        while (stack.length > 1 && topAllowedTag() === "li") closeTop();
      }
      stack.push({ tag, name, children: [] });
      continue;
    }

    // '<' isolé : du texte
    i = lt + 1;
  }
  flushText(src.length);
  while (stack.length > 1) closeTop();
  return root.children;
}

/** Texte visible d'un arbre (entités décodées), une espace entre les blocs. */
export function richTextToPlain(nodes: RichNode[]): string {
  const parts: string[] = [];
  const walk = (list: RichNode[]) => {
    for (const n of list) {
      if (n.type === "text") parts.push(n.value);
      else if (n.tag === "br") parts.push(" ");
      else {
        const block = n.tag !== "strong" && n.tag !== "em" && n.tag !== "a";
        if (block) parts.push(" ");
        walk(n.children);
        if (block) parts.push(" ");
      }
    }
  };
  walk(nodes);
  return parts
    .join("")
    .replace(/[ \t\n\r\f]+/g, " ")
    .trim();
}
