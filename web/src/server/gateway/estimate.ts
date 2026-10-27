/**
 * Estimation PRUDENTE du nombre de jetons d'une requête, avant l'appel (la réservation doit couvrir
 * le coût maximal). Sans tokenizer :
 *
 * - texte ASCII : un jeton pour 3 octets (≈ 4 octets par jeton en français et en anglais, donc une
 *   légère sur-estimation) ;
 * - texte NON ASCII (accents rares, CJK, emojis, caractères combinants) : un jeton par octet UTF-8, car
 *   ces caractères se découpent presque octet par octet ;
 * - image (`image_url`, quelle que soit l'adresse ou le `data:`) : forfait de 1 600 jetons PAR image. La
 *   longueur de l'adresse ne compte jamais (sinon 50 images par URL ne coûteraient que quelques jetons) ;
 * - audio (`input_audio`) : même forfait de 1 600 jetons par élément.
 *
 * Le règlement se fait au coût RÉEL renvoyé par l'amont (le dépassement de la réservation est facturé et
 * peut rendre le solde négatif) : cette estimation ne sert qu'à réserver, puis le reste est libéré.
 */
const ASCII_BYTES_PER_TOKEN = 3;
const NON_ASCII_BYTES_PER_TOKEN = 1;
/** Forfait par image et par clip audio (jetons). */
export const MEDIA_TOKENS = 1600;
const STRUCTURE_TOKENS = 4 / ASCII_BYTES_PER_TOKEN;

function textTokens(value: string): number {
  const bytes = Buffer.byteLength(value, "utf8");
  // Chaîne entièrement ASCII : un octet par caractère.
  if (bytes === value.length) return bytes / ASCII_BYTES_PER_TOKEN;
  let nonAscii = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x80) continue;
    if (c < 0x800) nonAscii += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      nonAscii += 4; // paire de substitution : 4 octets pour deux unités
      i += 1;
    } else nonAscii += 3;
  }
  const ascii = bytes - nonAscii;
  return ascii / ASCII_BYTES_PER_TOKEN + nonAscii / NON_ASCII_BYTES_PER_TOKEN;
}

/** Valeur « est un média » : seul `type` en décide (une clé `image_url` sur un objet `type:"text"` n'en fait pas un). */
const MEDIA_TYPES = new Set(["image_url", "input_audio", "image"]);
/** Clés qui portent le contenu du média (adresse, données) : jamais comptées à la longueur. */
const MEDIA_KEYS = new Set(["image_url", "input_audio", "image"]);
const isMedia = (rec: Record<string, unknown>): boolean =>
  typeof rec.type === "string" && MEDIA_TYPES.has(rec.type);

/** Profondeur au-delà de laquelle on cesse de descendre et on estime d'après la taille JSON. */
const MAX_DEPTH = 40;
/** Estimation « refusée » : dépasse tout contexte, la requête est rejetée plutôt que sous-réservée. */
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

function deepTokens(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 0 : textTokens(json);
  } catch {
    // Imbrication si profonde que la sérialisation échoue : estimation énorme, donc refus en amont.
    return UNBOUNDED;
  }
}

function tokensOf(value: unknown, depth = 0): number {
  if (depth > MAX_DEPTH) return deepTokens(value);
  if (typeof value === "string") return textTokens(value);
  if (typeof value === "number" || typeof value === "boolean")
    return 8 / ASCII_BYTES_PER_TOKEN;
  if (Array.isArray(value))
    return value.reduce<number>(
      (n, v) => n + STRUCTURE_TOKENS + tokensOf(v, depth + 1),
      0,
    );
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    // Un élément média vaut son forfait (jamais la longueur de son adresse ou de ses données) ; tout autre champ
    // qui l'accompagne (texte caché, par exemple) est compté normalement.
    const media = isMedia(rec);
    return Object.entries(rec).reduce(
      (n, [k, v]) =>
        media && MEDIA_KEYS.has(k)
          ? n
          : n + STRUCTURE_TOKENS + textTokens(k) + tokensOf(v, depth + 1),
      media ? MEDIA_TOKENS : 0,
    );
  }
  return 0;
}

export function estimateTokens(value: unknown): number {
  return Math.min(UNBOUNDED, Math.max(1, Math.ceil(tokensOf(value))));
}

/** Jetons de sortie estimés d'après les caractères reçus (flux interrompu sans usage). */
export function estimateOutputTokens(chars: number): number {
  return Math.max(chars > 0 ? 1 : 0, Math.ceil(chars / ASCII_BYTES_PER_TOKEN));
}
