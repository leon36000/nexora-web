/**
 * Découpage de texte en extraits pour la recherche.
 *
 * Règles : chaque extrait est une TRANCHE contiguë du texte normalisé (`text === source.slice(start, end)`), jamais
 * un assemblage ; il ne dépasse pas `maxChars` ; on coupe de préférence entre les titres, puis entre les paragraphes,
 * puis entre les phrases, puis entre les mots, et seulement en dernier recours au milieu d'un mot (sans jamais
 * séparer une paire de substitution Unicode). Les titres Markdown (hors blocs de code) forment une section dont le
 * chemin (« Guide > Installation ») accompagne chaque extrait.
 */

export interface ChunkOptions {
  /** Taille maximale d'un extrait, en caractères (défaut 3200, environ 800 jetons). */
  maxChars?: number;
  /** Chevauchement visé entre deux extraits consécutifs d'une même section (défaut 400). */
  overlapChars?: number;
  /** Sous cette taille, un extrait déborde sur la section suivante au lieu de rester isolé (défaut 200). */
  minChars?: number;
}

export interface Chunk {
  index: number;
  text: string;
  /** Chemin des titres de la section où l'extrait commence, ou null. */
  heading: string | null;
  /** Position dans le texte NORMALISÉ (voir `normalizeText`). */
  start: number;
  end: number;
}

export const DEFAULT_MAX_CHARS = 3200;
export const DEFAULT_OVERLAP_CHARS = 400;
export const DEFAULT_MIN_CHARS = 200;

/** Fins de ligne unifiées, caractères nuls retirés (PostgreSQL les refuse dans un texte). */
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replaceAll(String.fromCharCode(0), "");
}

interface Unit {
  start: number;
  end: number;
  section: number;
  heading: string | null;
  isHeading: boolean;
}

const HEADING_LINE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^[ \t]{0,3}(```|~~~)/;

/** Paragraphes (tranches taillées) d'une plage, séparés par des lignes vides. */
function paragraphSpans(
  text: string,
  from: number,
  to: number,
): [number, number][] {
  const spans: [number, number][] = [];
  const re = /\n[ \t]*\n+/g;
  let cursor = from;
  const slice = text.slice(from, to);
  re.lastIndex = 0;
  for (let m = re.exec(slice); m; m = re.exec(slice)) {
    pushTrimmed(text, spans, cursor, from + m.index);
    cursor = from + m.index + m[0].length;
  }
  pushTrimmed(text, spans, cursor, to);
  return spans;
}

function pushTrimmed(
  text: string,
  out: [number, number][],
  from: number,
  to: number,
) {
  let s = from;
  let e = to;
  while (s < e && /\s/.test(text.charAt(s))) s++;
  while (e > s && /\s/.test(text.charAt(e - 1))) e--;
  if (e > s) out.push([s, e]);
}

/** Coupe une plage trop longue : phrases, puis mots, puis coupe dure. Chaque morceau tient dans `max`. */
function splitOversize(
  text: string,
  from: number,
  to: number,
  max: number,
): [number, number][] {
  if (to - from <= max) return [[from, to]];
  const sentences: [number, number][] = [];
  const re = /[.!?…。]["')\]»”]*\s+/g;
  const slice = text.slice(from, to);
  let cursor = from;
  for (let m = re.exec(slice); m; m = re.exec(slice)) {
    pushTrimmed(text, sentences, cursor, from + m.index + m[0].length);
    cursor = from + m.index + m[0].length;
  }
  pushTrimmed(text, sentences, cursor, to);
  const out: [number, number][] = [];
  for (const [s, e] of sentences) {
    if (e - s <= max) out.push([s, e]);
    else out.push(...hardSplit(text, s, e, max));
  }
  return out;
}

function hardSplit(
  text: string,
  from: number,
  to: number,
  max: number,
): [number, number][] {
  const out: [number, number][] = [];
  let s = from;
  while (to - s > max) {
    let e = s + max;
    // Dernier espace de la fenêtre, s'il n'est pas trop près du début ; sinon coupe dure.
    let cut = -1;
    for (let p = e; p > s + max / 2; p--) {
      if (/\s/.test(text.charAt(p))) {
        cut = p;
        break;
      }
    }
    if (cut > 0) e = cut;
    else if (isLow(text.charCodeAt(e)) && isHigh(text.charCodeAt(e - 1))) e--;
    pushTrimmed(text, out, s, e);
    s = e;
    while (s < to && /\s/.test(text.charAt(s))) s++;
  }
  pushTrimmed(text, out, s, to);
  return out;
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

function buildUnits(text: string, max: number): Unit[] {
  // 1. Lignes de titre (hors blocs de code).
  interface Sec {
    start: number;
    heading: string | null;
    headingLineEnd: number | null;
  }
  const secs: Sec[] = [{ start: 0, heading: null, headingLineEnd: null }];
  const stack: { level: number; title: string }[] = [];
  let inFence = false;
  let pos = 0;
  while (pos <= text.length) {
    let nl = text.indexOf("\n", pos);
    if (nl === -1) nl = text.length;
    const line = text.slice(pos, nl);
    if (FENCE.test(line)) inFence = !inFence;
    else if (!inFence) {
      const m = HEADING_LINE.exec(line);
      if (m?.[1] && m[2]) {
        const level = m[1].length;
        while (stack.length && (stack.at(-1)?.level ?? 0) >= level) stack.pop();
        stack.push({ level, title: m[2].trim() });
        secs.push({
          start: pos,
          heading: stack.map((h) => h.title).join(" > "),
          headingLineEnd: nl,
        });
      }
    }
    pos = nl + 1;
  }
  // 2. Unités : la ligne de titre seule, puis les paragraphes de la section.
  const units: Unit[] = [];
  secs.forEach((sec, si) => {
    const end = secs[si + 1]?.start ?? text.length;
    let bodyFrom = sec.start;
    if (sec.headingLineEnd !== null) {
      const hs: [number, number][] = [];
      pushTrimmed(text, hs, sec.start, sec.headingLineEnd);
      for (const [s, e] of hs)
        units.push({
          start: s,
          end: e,
          section: si,
          heading: sec.heading,
          isHeading: true,
        });
      bodyFrom = sec.headingLineEnd;
    }
    for (const [ps, pe] of paragraphSpans(text, bodyFrom, end))
      for (const [s, e] of splitOversize(text, ps, pe, max))
        units.push({
          start: s,
          end: e,
          section: si,
          heading: sec.heading,
          isHeading: false,
        });
  });
  return units;
}

export function chunkText(source: string, options: ChunkOptions = {}): Chunk[] {
  const max = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlap = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const min = options.minChars ?? DEFAULT_MIN_CHARS;
  if (!Number.isInteger(max) || max < 100)
    throw new RangeError("maxChars doit être un entier d'au moins 100");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap > max / 2)
    throw new RangeError(
      "overlapChars doit être un entier compris entre 0 et la moitié de maxChars",
    );
  const text = normalizeText(source);
  const units = buildUnits(text, max);
  const out: Chunk[] = [];
  const n = units.length;
  let i = 0;
  // Début imposé par un chevauchement partiel (à l'intérieur de l'unité précédente) et titre hérité.
  let override: { at: number; heading: string | null } | null = null;
  while (i < n) {
    const first = units[i] as Unit;
    let start = first.start;
    let heading = first.heading;
    if (override && first.end - override.at <= max) {
      start = override.at;
      heading = override.heading;
    }
    override = null;
    let j = i;
    while (j < n) {
      const u = units[j] as Unit;
      if (u.end - start > max) break;
      const prev = units[j - 1];
      // Frontière de section : on coupe là dès que l'extrait a une taille utile.
      if (
        j > i &&
        prev &&
        u.section !== prev.section &&
        prev.end - start >= min
      )
        break;
      j++;
    }
    if (j === i) j = i + 1; // garde-fou : chaque unité tient dans max
    // Un titre ne finit jamais un extrait : il ouvre le suivant.
    if (j < n && j - 1 > i && (units[j - 1] as Unit).isHeading) j--;
    const last = units[j - 1] as Unit;
    out.push({
      index: out.length,
      text: text.slice(start, last.end),
      heading,
      start,
      end: last.end,
    });
    if (j >= n) break;
    const upcoming = units[j] as Unit;
    if (overlap === 0 || upcoming.section !== last.section) {
      i = j;
      continue;
    }
    // Chevauchement : recul de quelques unités entières (au plus `overlap` caractères) dans la même section...
    let k = j;
    while (
      k - 1 > i &&
      (units[k - 1] as Unit).section === last.section &&
      last.end - (units[k - 1] as Unit).start <= overlap
    )
      k--;
    if (k < j) {
      i = k;
      continue;
    }
    // ... sinon recul partiel jusqu'à une frontière de mot.
    let p = last.end - overlap;
    if (p > start) {
      while (p < last.end && !/\s/.test(text.charAt(p))) p++;
      while (p < last.end && /\s/.test(text.charAt(p))) p++;
      if (p < last.end && p > start)
        override = { at: p, heading: last.heading };
    }
    i = j;
  }
  return out;
}

/** Texte envoyé au modèle d'embedding : le chemin de section précède l'extrait qui ne commence pas par un titre. */
export function embeddingInput(chunk: Chunk): string {
  if (!chunk.heading || /^#{1,6}[ \t]/.test(chunk.text)) return chunk.text;
  return `${chunk.heading}\n\n${chunk.text}`;
}
