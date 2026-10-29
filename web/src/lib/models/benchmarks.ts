import type { ModelBenchmark } from "@nexora/db";
import type { PublicModel } from "@/server/gateway/public";
import { normalizeText, slugify } from "./query";

/**
 * Mesures publiées d'un modèle, classements par épreuve et comparaison côte à côte. Module pur.
 *
 * Honnêteté : chaque mesure garde l'éditeur qui l'a publiée et sa source. Les méthodes diffèrent d'un éditeur à l'autre :
 * un « meilleur résultat » n'est désigné que si l'éditeur ET l'unité sont les mêmes pour toutes les colonnes.
 */
export interface BenchmarkGroup {
  /** `null` : mesures sans catégorie (affichées à la fin sous un titre générique). */
  category: string | null;
  items: ModelBenchmark[];
}

/** Regroupe par catégorie dans l'ordre d'apparition ; les mesures sans catégorie en dernier. */
export function groupBenchmarks(
  benchmarks: readonly ModelBenchmark[],
): BenchmarkGroup[] {
  const groups = new Map<string, BenchmarkGroup>();
  let rest: BenchmarkGroup | null = null;
  for (const b of benchmarks) {
    const category = b.category?.trim();
    if (!category) {
      rest ??= { category: null, items: [] };
      rest.items.push(b);
      continue;
    }
    const g = groups.get(category) ?? { category, items: [] };
    g.items.push(b);
    groups.set(category, g);
  }
  return rest ? [...groups.values(), rest] : [...groups.values()];
}

/** Longueur de barre (0 à 100) : seulement pour un pourcentage ; sinon `null` (un Elo n'a pas de plafond à 100). */
export function scorePercent(b: ModelBenchmark): number | null {
  return b.unit.trim() === "%" && b.score >= 0 && b.score <= 100
    ? b.score
    : null;
}

export const benchmarkKey = (
  b: Pick<ModelBenchmark, "name" | "unit">,
): string => `${normalizeText(b.name)}|${normalizeText(b.unit)}`;

/** Durées et coûts : un résultat plus bas est meilleur, on ne les classe pas dans l'ordre décroissant. */
const LOWER_IS_BETTER_UNIT =
  /^(ms|s|sec|secondes?|seconds?|min|minutes?|h|\$|cad|usd|\$\/m)$/i;
export const isRankable = (b: Pick<ModelBenchmark, "unit">): boolean =>
  !LOWER_IS_BETTER_UNIT.test(b.unit.trim());

export interface RankingRow {
  model: PublicModel;
  benchmark: ModelBenchmark;
}
export interface Ranking {
  key: string;
  slug: string;
  name: string;
  unit: string;
  category: string | null;
  rows: RankingRow[];
  /** Éditeurs des mesures de ce tableau (plusieurs = non strictement comparables). */
  publishers: string[];
  modelCount: number;
}

/** Une table par épreuve publiée pour au moins `minModels` modèles distincts, plus fournie d'abord. */
export function buildRankings(
  models: readonly PublicModel[],
  minModels = 3,
  locale = "fr-CA",
): Ranking[] {
  const byKey = new Map<string, Ranking>();
  for (const model of models)
    for (const benchmark of model.sheet.benchmarks ?? []) {
      if (!isRankable(benchmark)) continue;
      const key = benchmarkKey(benchmark);
      const r = byKey.get(key) ?? {
        key,
        slug: slugify(
          `${benchmark.name} ${benchmark.unit === "%" ? "" : benchmark.unit}`,
        ),
        name: benchmark.name.trim(),
        unit: benchmark.unit.trim(),
        category: benchmark.category?.trim() || null,
        rows: [],
        publishers: [],
        modelCount: 0,
      };
      r.rows.push({ model, benchmark });
      byKey.set(key, r);
    }
  const out: Ranking[] = [];
  for (const r of byKey.values()) {
    r.modelCount = new Set(r.rows.map((x) => x.model.id)).size;
    if (r.modelCount < minModels) continue;
    r.rows.sort(
      (a, b) =>
        b.benchmark.score - a.benchmark.score ||
        a.model.name.localeCompare(b.model.name, locale) ||
        a.benchmark.publisher.localeCompare(b.benchmark.publisher, locale),
    );
    r.publishers = [...new Set(r.rows.map((x) => x.benchmark.publisher))];
    out.push(r);
  }
  return out.sort(
    (a, b) =>
      b.modelCount - a.modelCount || a.name.localeCompare(b.name, locale),
  );
}

export interface CompareRow {
  key: string;
  name: string;
  unit: string;
  category: string | null;
  /** Une cellule par modèle comparé (même ordre) ; `null` quand le modèle n'a pas cette mesure. */
  cells: (ModelBenchmark | null)[];
  /** Même éditeur et même unité dans toutes les cellules remplies. */
  comparable: boolean;
  /** Colonne du meilleur résultat, seulement si `comparable` et sans égalité. */
  best: number | null;
}

/** Épreuves présentes chez au moins deux des modèles comparés, dans l'ordre d'apparition. */
export function commonBenchmarks(models: readonly PublicModel[]): CompareRow[] {
  const rows = new Map<string, CompareRow>();
  models.forEach((model, col) => {
    for (const b of model.sheet.benchmarks ?? []) {
      const key = benchmarkKey(b);
      const row = rows.get(key) ?? {
        key,
        name: b.name.trim(),
        unit: b.unit.trim(),
        category: b.category?.trim() || null,
        cells: models.map(() => null),
        comparable: true,
        best: null,
      };
      // Première mesure d'un modèle pour cette épreuve (la fiche détaille les autres).
      row.cells[col] ??= b;
      rows.set(key, row);
    }
  });
  const out: CompareRow[] = [];
  for (const row of rows.values()) {
    const filled = row.cells.filter((c): c is ModelBenchmark => c !== null);
    if (filled.length < 2) continue;
    const first = filled[0] as ModelBenchmark;
    row.comparable = filled.every(
      (c) => c.publisher === first.publisher && c.unit === first.unit,
    );
    if (row.comparable && isRankable(first)) {
      const top = Math.max(...filled.map((c) => c.score));
      const winners = row.cells
        .map((c, i) => (c && c.score === top ? i : -1))
        .filter((i) => i >= 0);
      row.best = winners.length === 1 ? (winners[0] as number) : null;
    }
    out.push(row);
  }
  return out;
}
