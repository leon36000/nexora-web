import type { SnapshotStore } from "./snapshots";

type Pairs = Array<Partial<Record<"fr-CA" | "en-CA", string | null>>>;

/**
 * Pendant une panne de Directus, une page sans instantané est-elle une page INCONNUE (absente de la dernière liste connue
 * des pages publiées) ? Si oui, 404 plutôt que la page « momentanément indisponible » : un robot d'indexation ne doit pas
 * voir un 200 pour une adresse qui n'existe pas. Sans liste connue (premier démarrage), on n'affirme rien.
 */
export function slugKnownAbsent(
  store: SnapshotStore,
  code: "fr-CA" | "en-CA",
  slug: string,
): boolean {
  const pairs = store.get<Pairs>("slug-pairs");
  if (!Array.isArray(pairs) || pairs.length === 0) return false;
  return !pairs.some((p) => p?.[code] === slug);
}
