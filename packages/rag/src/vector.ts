/**
 * Vecteurs de la recherche. Tous les extraits sont stockés en `halfvec(1024)` : un seul index couvre tous les modèles
 * d'embedding. Un vecteur plus court est complété par des zéros (le cosinus ne change pas) ; un vecteur plus long est
 * tronqué puis renormalisé seulement si le modèle le permet (Matryoshka). Tout vecteur est normalisé à 1 : le cosinus
 * devient un produit scalaire.
 */

export const RAG_DIMS = 1024;

export class VectorError extends Error {
  readonly code: "empty" | "not_finite" | "zero" | "too_long";
  constructor(code: VectorError["code"]) {
    super(`vecteur invalide : ${code}`);
    this.name = "VectorError";
    this.code = code;
  }
}

export function fitVector(
  raw: readonly number[],
  options: { matryoshka: boolean },
): number[] {
  if (raw.length === 0) throw new VectorError("empty");
  if (raw.length > RAG_DIMS && !options.matryoshka)
    throw new VectorError("too_long");
  const out = new Array<number>(RAG_DIMS).fill(0);
  let sum = 0;
  const used = Math.min(raw.length, RAG_DIMS);
  for (let i = 0; i < used; i++) {
    const x = raw[i];
    if (typeof x !== "number" || !Number.isFinite(x))
      throw new VectorError("not_finite");
    out[i] = x;
    sum += x * x;
  }
  // Les valeurs tronquées doivent aussi être finies (un NaN caché dans la queue invaliderait la réponse).
  for (let i = used; i < raw.length; i++)
    if (!Number.isFinite(raw[i])) throw new VectorError("not_finite");
  const norm = Math.sqrt(sum);
  if (!(norm > 0)) throw new VectorError("zero");
  for (let i = 0; i < used; i++) out[i] = (out[i] as number) / norm;
  return out;
}

/** Littéral pgvector (`[0.1,0.2]`), jamais interpolé dans du SQL : toujours passé comme paramètre lié. */
export function toVectorLiteral(v: readonly number[]): string {
  return `[${v.map((x) => formatFloat(x)).join(",")}]`;
}

function formatFloat(x: number): string {
  if (x === 0) return "0";
  // 8 chiffres significatifs suffisent à la demi-précision ; toPrecision peut sortir en notation exponentielle (acceptée par pgvector).
  return String(Number(x.toPrecision(8)));
}

/** Provision par extrait pour les métadonnées de ligne (titre de section, positions, identifiants). */
export const CHUNK_OVERHEAD_BYTES = 256;
/** En-tête d'un `halfvec` (4 octets de longueur et de dimension, plus l'alignement). */
const HALFVEC_HEADER_BYTES = 8;

/**
 * Espace compté pour un extrait : son texte (octets UTF-8) + son vecteur demi-précision + une provision. Les index
 * (HNSW, plein texte) ne sont PAS comptés : voir docs/rag.md, « limites honnêtes ».
 */
export function chunkStorageBytes(text: string): number {
  return (
    new TextEncoder().encode(text).length +
    RAG_DIMS * 2 +
    HALFVEC_HEADER_BYTES +
    CHUNK_OVERHEAD_BYTES
  );
}
