import type { PublicModel } from "@/server/gateway/public";

/**
 * Modèles proches d'un modèle : même type, au moins une étiquette en commun (sinon rien, on ne recommande pas sans
 * raison), classés par nombre d'étiquettes communes puis par écart de prix d'entrée (en rapport de prix), puis par nom.
 */
export function similarModels(
  model: PublicModel,
  catalog: readonly PublicModel[],
  limit = 3,
  locale = "fr-CA",
): PublicModel[] {
  const tags = new Set(model.sheet.tags ?? []);
  if (tags.size === 0) return [];
  const price = Number(model.inputPerMillion);
  const gap = (m: PublicModel) => {
    const p = Number(m.inputPerMillion);
    return price > 0 && p > 0
      ? Math.abs(Math.log(p / price))
      : p === price
        ? 0
        : Infinity;
  };
  return catalog
    .filter((m) => m.id !== model.id && m.kind === model.kind)
    .map((m) => ({
      m,
      shared: (m.sheet.tags ?? []).filter((t) => tags.has(t)).length,
    }))
    .filter((x) => x.shared > 0)
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        gap(a.m) - gap(b.m) ||
        a.m.name.localeCompare(b.m.name, locale),
    )
    .slice(0, limit)
    .map((x) => x.m);
}
