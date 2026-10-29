/**
 * Détecteurs de renseignements personnels évidents (Privacy Router, politique « standard »). Fonctions pures,
 * sans accès à la base ni au réseau.
 *
 * Genres reconnus : courriel, téléphone (nord-américain et E.164), carte de crédit (Luhn), NAS canadien (Luhn),
 * IBAN (modulo 97) et secrets (clés `nxk_`, `sk-`, `Bearer`, formats courants). Chaque correspondance est
 * remplacée par un jeton lisible et stable du genre (`[COURRIEL]`, `[TÉLÉPHONE]`…), jamais par une partie de la
 * valeur.
 *
 * Garanties :
 *  - temps linéaire sur le texte (aucune expression à retours arrière non bornés : le corps d'une requête peut
 *    atteindre plusieurs mégaoctets) ;
 *  - une valeur ne reçoit qu'un seul genre : en cas de chevauchement, secret > courriel > carte > IBAN > NAS >
 *    téléphone, puis la plus longue.
 *
 * Limites honnêtes : la détection est heuristique. Elle ne reconnaît ni les noms de personnes, ni les adresses
 * postales, ni les valeurs volontairement déguisées (« jean arobase exemple point ca »), et un numéro de carte ou
 * de NAS qui échoue au contrôle de Luhn n'est pas masqué.
 */

export const DETECTOR_CATEGORIES = [
  "email",
  "phone",
  "credit_card",
  "sin",
  "iban",
  "secret",
] as const;
export type DetectorCategory = (typeof DETECTOR_CATEGORIES)[number];

/** Jeton de remplacement de chaque genre. */
export const CATEGORY_TOKEN: Record<DetectorCategory, string> = {
  email: "[COURRIEL]",
  phone: "[TÉLÉPHONE]",
  credit_card: "[CARTE]",
  sin: "[NAS]",
  iban: "[IBAN]",
  secret: "[SECRET]",
};

export interface Match {
  category: DetectorCategory;
  start: number;
  end: number;
}

/** Priorité en cas de chevauchement (le plus petit gagne). */
const RANK: Record<DetectorCategory, number> = {
  secret: 0,
  email: 1,
  credit_card: 2,
  iban: 3,
  sin: 4,
  phone: 5,
};

// ─── Contrôles de validité ──────────────────────────────────────────────────────

/** Contrôle de Luhn d'une suite de chiffres (aucun autre caractère accepté). */
export function luhnValid(digits: string): boolean {
  if (digits.length === 0 || !/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Longueurs d'IBAN par pays (les pays absents : 15 à 34 caractères, clé modulo 97 valide). */
const IBAN_LENGTHS: Record<string, number> = {
  AT: 20,
  BE: 16,
  CH: 21,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  EE: 20,
  ES: 24,
  FI: 18,
  FR: 27,
  GB: 22,
  GR: 27,
  HR: 21,
  HU: 28,
  IE: 22,
  IS: 26,
  IT: 27,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MT: 31,
  NL: 18,
  NO: 15,
  PL: 28,
  PT: 25,
  RO: 24,
  SE: 24,
  SI: 19,
  SK: 24,
};

/** IBAN valide : lettres et chiffres, longueur du pays, clé modulo 97 égale à 1. Espaces ignorés. */
export function ibanValid(raw: string): boolean {
  const iban = raw.replaceAll(" ", "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expected !== undefined ? iban.length !== expected : iban.length < 15)
    return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 ? code - 55 : code - 48;
    remainder = Number(`${remainder}${value}`) % 97;
  }
  return remainder === 1;
}

// ─── Courriel ───────────────────────────────────────────────────────────────────

const LOCAL_CHAR = /[\p{L}\p{N}._%+'-]/u;
const DOMAIN_CHAR = /[\p{L}\p{N}.-]/u;
const LETTER = /\p{L}/u;

function detectEmails(text: string): Match[] {
  const out: Match[] = [];
  let at = text.indexOf("@");
  while (at !== -1) {
    let start = at;
    while (
      start > 0 &&
      at - start < 64 &&
      LOCAL_CHAR.test(text.charAt(start - 1))
    )
      start--;
    while (start < at && /[.'%+-]/.test(text.charAt(start))) start++;
    let end = at + 1;
    while (
      end < text.length &&
      end - at < 255 &&
      DOMAIN_CHAR.test(text.charAt(end))
    )
      end++;
    while (end > at + 1 && /[.-]/.test(text.charAt(end - 1))) end--;
    const labels = text.slice(at + 1, end).split(".");
    const tld = labels.at(-1) ?? "";
    const valid =
      start < at &&
      labels.length >= 2 &&
      labels.every(
        (label) =>
          label.length > 0 && !label.startsWith("-") && !label.endsWith("-"),
      ) &&
      tld.length >= 2 &&
      [...tld].every((ch) => LETTER.test(ch));
    if (valid) out.push({ category: "email", start, end });
    at = text.indexOf("@", at + 1);
  }
  return out;
}

// ─── Téléphone ──────────────────────────────────────────────────────────────────

const NANP_PHONE =
  /(?<![\w+])(?:\+?1[ .-]?)?(?:\(\d{3}\)[ .-]?|\d{3}[ .-]?)\d{3}[ .-]?\d{4}(?!\d)/gu;
const E164_PHONE = /(?<![\w+])\+[1-9](?:[ .-]?\d){6,14}(?!\d)/gu;

function detectPhones(text: string): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(NANP_PHONE)) {
    const digits = m[0].replace(/\D/g, "");
    const national = digits.length === 11 ? digits.slice(1) : digits;
    if (digits.length === 11 && digits[0] !== "1") continue;
    // Plan de numérotation nord-américain : l'indicatif régional et l'indicatif de central commencent par 2 à 9.
    if (!/[2-9]/.test(national.charAt(0)) || !/[2-9]/.test(national.charAt(3)))
      continue;
    out.push({
      category: "phone",
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  for (const m of text.matchAll(E164_PHONE)) {
    const digits = m[0].replace(/\D/g, "").length;
    if (digits < 8 || digits > 15) continue;
    out.push({
      category: "phone",
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

// ─── Carte de crédit et NAS (groupes de chiffres) ───────────────────────────────

interface Group {
  start: number;
  end: number;
  len: number;
}

/** Séparateurs admis entre groupes de chiffres : un seul caractère (espace, tiret, espaces insécables). */
const GROUP_SEPARATORS = new Set([" ", "-", " ", " "]);
/** Une carte compte au plus six groupes (4-4-4-4, 4-6-5…). */
const MAX_GROUPS = 6;
const WORD_NEIGHBOR = /[\p{L}_]/u;

/** Suites de groupes de chiffres reliés par un séparateur unique. */
function digitChains(text: string): Group[][] {
  const chains: Group[][] = [];
  let current: Group[] = [];
  for (const m of text.matchAll(/\d+/g)) {
    const group: Group = {
      start: m.index,
      end: m.index + m[0].length,
      len: m[0].length,
    };
    const previous = current.at(-1);
    if (
      previous &&
      group.start - previous.end === 1 &&
      GROUP_SEPARATORS.has(text.charAt(previous.end))
    ) {
      current.push(group);
    } else {
      if (current.length) chains.push(current);
      current = [group];
    }
  }
  if (current.length) chains.push(current);
  return chains;
}

/** Les caractères voisins de la fenêtre ne prolongent pas le numéro (lettre, soulignement, signe plus). */
function isolated(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text.charAt(start - 1) : "";
  const after = end < text.length ? text.charAt(end) : "";
  return !(
    (before && (WORD_NEIGHBOR.test(before) || before === "+")) ||
    (after && WORD_NEIGHBOR.test(after))
  );
}

function detectCards(text: string, chains: Group[][]): Match[] {
  const out: Match[] = [];
  for (const chain of chains) {
    let i = 0;
    while (i < chain.length) {
      const first = chain[i];
      let found: Group | null = null;
      let foundIndex = i;
      let digits = "";
      for (let j = i; first && j < chain.length && j < i + MAX_GROUPS; j++) {
        const group = chain[j];
        if (!group) break;
        digits += text.slice(group.start, group.end);
        if (digits.length > 19) break;
        if (
          digits.length >= 13 &&
          /^[2-6]/.test(digits) &&
          luhnValid(digits) &&
          isolated(text, first.start, group.end)
        ) {
          found = group;
          foundIndex = j;
        }
      }
      if (!found || !first) {
        i++;
        continue;
      }
      out.push({ category: "credit_card", start: first.start, end: found.end });
      i = foundIndex + 1;
    }
  }
  return out;
}

/** NAS : neuf chiffres en un bloc ou en trois groupes de trois, jamais prolongés par d'autres chiffres. */
function detectSins(text: string, chains: Group[][]): Match[] {
  const out: Match[] = [];
  for (const chain of chains) {
    const shape = chain.map((g) => g.len).join("-");
    if (shape !== "9" && shape !== "3-3-3") continue;
    const first = chain[0];
    const last = chain.at(-1);
    if (!first || !last) continue;
    const digits = chain.map((g) => text.slice(g.start, g.end)).join("");
    // Le NAS ne commence jamais par 8 ; contrôle de Luhn.
    if (digits[0] === "8" || !luhnValid(digits)) continue;
    if (!isolated(text, first.start, last.end)) continue;
    out.push({ category: "sin", start: first.start, end: last.end });
  }
  return out;
}

// ─── IBAN ───────────────────────────────────────────────────────────────────────

const IBAN_CANDIDATE =
  /(?<![A-Za-z0-9])[A-Za-z]{2}\d{2}(?: ?[A-Za-z0-9]{4}){2,7}(?: ?[A-Za-z0-9]{1,3})?(?![A-Za-z0-9])/gu;

function detectIbans(text: string): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(IBAN_CANDIDATE)) {
    // Le dernier groupe facultatif peut avaler le mot suivant (« … 189 et ») : on retire des mots jusqu'à valider.
    let candidate = m[0];
    while (candidate.length > 0) {
      if (ibanValid(candidate)) {
        out.push({
          category: "iban",
          start: m.index,
          end: m.index + candidate.length,
        });
        break;
      }
      const cut = candidate.lastIndexOf(" ");
      if (cut < 0) break;
      candidate = candidate.slice(0, cut);
    }
  }
  return out;
}

// ─── Secrets ────────────────────────────────────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  // Clés clientes de la passerelle (nxk_ + 256 bits en base64url).
  /(?<![A-Za-z0-9_-])nxk_[A-Za-z0-9_-]{8,}/g,
  // Clés de fournisseurs d'IA et assimilées (sk-…, sk-proj-…, sk-ant-…).
  /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{16,}/g,
  // En-tête Authorization.
  /(?<![A-Za-z0-9])[Bb][Ee][Aa][Rr][Ee][Rr]\s{1,10}[A-Za-z0-9._~+/=-]{16,}/g,
  // Clés d'accès AWS, jetons GitHub et Slack.
  /(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])/g,
  /(?<![A-Za-z0-9_])gh[pousr]_[A-Za-z0-9]{30,}/g,
  /(?<![A-Za-z0-9-])xox[abprs]-[A-Za-z0-9-]{10,}/g,
  // Jeton JWT.
  /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

const PEM_BEGIN = "-----BEGIN ";
const PEM_HEADER = /-----BEGIN (?:[A-Z]+ ){0,3}PRIVATE KEY-----/y;

function detectSecrets(text: string): Match[] {
  const out: Match[] = [];
  for (const pattern of SECRET_PATTERNS)
    for (const m of text.matchAll(pattern))
      out.push({
        category: "secret",
        start: m.index,
        end: m.index + m[0].length,
      });
  // Clé privée PEM : de l'en-tête à la ligne de fin. Sans ligne de fin, seul l'en-tête est masqué, et on ne
  // cherche plus de fin plus loin (une seule recherche ratée : temps linéaire).
  let searchEnd = true;
  let from = text.indexOf(PEM_BEGIN);
  while (from !== -1) {
    PEM_HEADER.lastIndex = from;
    const header = PEM_HEADER.exec(text);
    if (header) {
      let end = from + header[0].length;
      if (searchEnd) {
        const marker = header[0].replace("BEGIN", "END");
        const close = text.indexOf(marker, end);
        if (close === -1) searchEnd = false;
        else end = close + marker.length;
      }
      out.push({ category: "secret", start: from, end });
      from = text.indexOf(PEM_BEGIN, end);
    } else {
      from = text.indexOf(PEM_BEGIN, from + PEM_BEGIN.length);
    }
  }
  return out;
}

// ─── Assemblage ─────────────────────────────────────────────────────────────────

/** Retient une seule correspondance par zone de chevauchement (priorité du genre, puis la plus longue). */
function resolveOverlaps(candidates: Match[]): Match[] {
  const sorted = [...candidates].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const out: Match[] = [];
  let cluster: Match[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const ranked = [...cluster].sort(
      (a, b) =>
        RANK[a.category] - RANK[b.category] ||
        b.end - b.start - (a.end - a.start) ||
        a.start - b.start,
    );
    const accepted: Match[] = [];
    for (const m of ranked)
      if (!accepted.some((a) => m.start < a.end && a.start < m.end))
        accepted.push(m);
    out.push(...accepted);
    cluster = [];
  };
  for (const m of sorted) {
    if (cluster.length > 0 && m.start >= clusterEnd) flush();
    cluster.push(m);
    clusterEnd = cluster.length === 1 ? m.end : Math.max(clusterEnd, m.end);
  }
  if (cluster.length > 0) flush();
  return out.sort((a, b) => a.start - b.start);
}

/** Correspondances des genres demandés, triées par position et sans chevauchement. */
export function findMatches(
  text: string,
  categories: readonly DetectorCategory[] = DETECTOR_CATEGORIES,
): Match[] {
  if (text.length === 0 || categories.length === 0) return [];
  const wanted = new Set(categories);
  const candidates: Match[] = [];
  if (wanted.has("secret")) candidates.push(...detectSecrets(text));
  if (wanted.has("email")) candidates.push(...detectEmails(text));
  if (wanted.has("iban")) candidates.push(...detectIbans(text));
  if (wanted.has("phone")) candidates.push(...detectPhones(text));
  if (wanted.has("credit_card") || wanted.has("sin")) {
    const chains = digitChains(text);
    if (wanted.has("credit_card"))
      candidates.push(...detectCards(text, chains));
    if (wanted.has("sin")) candidates.push(...detectSins(text, chains));
  }
  return resolveOverlaps(candidates);
}

export interface MaskResult {
  text: string;
  /** Nombre de remplacements par genre (aucune valeur). */
  counts: Partial<Record<DetectorCategory, number>>;
}

/** Remplace chaque correspondance par le jeton de son genre. */
export function maskPersonalData(
  text: string,
  categories: readonly DetectorCategory[] = DETECTOR_CATEGORIES,
): MaskResult {
  const matches = findMatches(text, categories);
  if (matches.length === 0) return { text, counts: {} };
  const counts: Partial<Record<DetectorCategory, number>> = {};
  const parts: string[] = [];
  let cursor = 0;
  for (const m of matches) {
    parts.push(text.slice(cursor, m.start), CATEGORY_TOKEN[m.category]);
    cursor = m.end;
    counts[m.category] = (counts[m.category] ?? 0) + 1;
  }
  parts.push(text.slice(cursor));
  return { text: parts.join(""), counts };
}
