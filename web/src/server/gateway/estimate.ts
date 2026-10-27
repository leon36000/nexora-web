/**
 * Estimation PRUDENTE du nombre de jetons d'une requête, avant l'appel (la réservation doit couvrir
 * le coût maximal). Sans tokenizer : un jeton pour 3 octets UTF-8 sur-estime légèrement le français
 * et l'anglais (≈ 4 octets par jeton). Les images en `data:` valent 2 000 jetons chacune. Le coût
 * réel vient toujours de l'usage renvoyé par l'amont ; l'estimation sert à réserver, puis le reste
 * est libéré.
 */
const BYTES_PER_TOKEN = 3;
const IMAGE_TOKENS = 2000;
const STRUCTURE_BYTES = 4;

function bytesOf(value: unknown, depth = 0): number {
  if (depth > 40) return 0;
  if (typeof value === "string") {
    if (value.startsWith("data:")) return IMAGE_TOKENS * BYTES_PER_TOKEN;
    return Buffer.byteLength(value, "utf8");
  }
  if (typeof value === "number" || typeof value === "boolean") return 8;
  if (Array.isArray(value))
    return value.reduce<number>(
      (n, v) => n + STRUCTURE_BYTES + bytesOf(v, depth + 1),
      0,
    );
  if (value && typeof value === "object") {
    return Object.entries(value).reduce(
      (n, [k, v]) => n + STRUCTURE_BYTES + k.length + bytesOf(v, depth + 1),
      0,
    );
  }
  return 0;
}

export function estimateTokens(value: unknown): number {
  return Math.max(1, Math.ceil(bytesOf(value) / BYTES_PER_TOKEN));
}

/** Jetons de sortie estimés d'après les caractères reçus (flux interrompu sans usage). */
export function estimateOutputTokens(chars: number): number {
  return Math.max(chars > 0 ? 1 : 0, Math.ceil(chars / BYTES_PER_TOKEN));
}
