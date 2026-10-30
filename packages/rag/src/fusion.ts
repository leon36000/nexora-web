/**
 * Fusion de classements par rangs réciproques (RRF) : le score d'un élément est la somme, sur les listes où il
 * figure, de poids / (k + rang). Ne dépend pas de l'échelle des scores (cosinus et BM25 ne se comparent pas).
 */
export interface Fused<Id> {
  id: Id;
  score: number;
  /** Rang (à partir de 1) dans chaque liste d'entrée, null si absent de cette liste. */
  ranks: (number | null)[];
}

export function reciprocalRankFusion<Id extends string | number>(
  lists: readonly (readonly Id[])[],
  options: { k?: number; weights?: readonly number[] } = {},
): Fused<Id>[] {
  const k = options.k ?? 60;
  const table = new Map<Id, Fused<Id>>();
  lists.forEach((list, li) => {
    const weight = options.weights?.[li] ?? 1;
    let rank = 0;
    const seen = new Set<Id>();
    for (const id of list) {
      if (seen.has(id)) continue;
      seen.add(id);
      rank++;
      let entry = table.get(id);
      if (!entry) {
        entry = { id, score: 0, ranks: lists.map(() => null) };
        table.set(id, entry);
      }
      entry.score += weight / (k + rank);
      entry.ranks[li] = rank;
    }
  });
  // Map conserve l'ordre d'insertion et le tri est stable : une égalité garde l'ordre d'apparition.
  return [...table.values()].sort((a, b) => b.score - a.score);
}
