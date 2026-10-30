/**
 * Reclassement (rerank) et termes de recherche plein texte. Aucune entrée-sortie : les appels au modèle de
 * reclassement passent par la passerelle de Nexora (facturation en crédits) côté serveur.
 */

export interface RerankScore {
  index: number;
  score: number;
}

/**
 * Lit une réponse au format Cohere (`results[]` avec `index` et `relevance_score`). `null` si la forme est
 * incohérente : index hors limites ou répété, score non numérique ou non fini.
 */
export function parseRerankResults(
  body: unknown,
  documentCount: number,
): RerankScore[] | null {
  if (typeof body !== "object" || body === null) return null;
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  const seen = new Set<number>();
  const out: RerankScore[] = [];
  for (const r of results) {
    if (typeof r !== "object" || r === null) return null;
    const { index, relevance_score: score } = r as {
      index?: unknown;
      relevance_score?: unknown;
    };
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= documentCount ||
      seen.has(index) ||
      typeof score !== "number" ||
      !Number.isFinite(score)
    )
      return null;
    seen.add(index);
    out.push({ index, score });
  }
  return out;
}

export interface Reranked<T> {
  item: T;
  /** Score du reclasseur ; null pour un candidat qu'il n'a pas noté. */
  rerankScore: number | null;
}

/**
 * Trie les candidats par score décroissant. Ceux que le reclasseur n'a pas notés suivent, dans leur ordre d'origine.
 * `minScore` écarte les notés sous le seuil, et les non notés (les échelles diffèrent d'un modèle à l'autre : à régler par modèle).
 */
export function applyRerank<T>(
  candidates: readonly T[],
  scores: readonly RerankScore[],
  options: { topN: number; minScore?: number },
): Reranked<T>[] {
  const byIndex = new Map(scores.map((s) => [s.index, s.score]));
  const scored: Reranked<T>[] = [];
  const unscored: Reranked<T>[] = [];
  candidates.forEach((item, i) => {
    const s = byIndex.get(i);
    // Avec un seuil, un candidat non noté ne l'a pas franchi : il est écarté.
    if (s === undefined) {
      if (options.minScore === undefined)
        unscored.push({ item, rerankScore: null });
    } else if (options.minScore === undefined || s >= options.minScore)
      scored.push({ item, rerankScore: s });
  });
  scored.sort((a, b) => (b.rerankScore as number) - (a.rerankScore as number));
  return [...scored, ...unscored].slice(0, options.topN);
}

const STOP = new Set(
  (
    "le la les un une des du de d l au aux et ou en à a y dans sur sous par pour avec sans ce ces cet cette ça ca se sa son ses " +
    "mon ma mes ton ta tes nos vos leur leurs il elle ils elles on je tu nous vous qui que quoi dont où est sont être été " +
    "the an of and or to in on for with is are be it this that as at by from"
  ).split(" "),
);

const MAX_TERMS = 24;

/**
 * Termes de la requête pour la recherche plein texte : mots de 2 caractères ou plus (lettres, chiffres, soulignés),
 * en minuscules, sans mot vide ni doublon. Seuls des caractères sûrs sortent : le résultat est de toute façon passé
 * comme paramètre lié.
 */
export function queryTerms(query: string): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const m of query.toLowerCase().matchAll(/[\p{L}\p{N}_]+/gu)) {
    const t = m[0];
    if (t.length < 2 || STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    terms.push(t);
    if (terms.length >= MAX_TERMS) break;
  }
  return terms;
}
