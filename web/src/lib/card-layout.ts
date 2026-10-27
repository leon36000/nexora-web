/**
 * Répartition des cartes sur grand écran : la grille s'adapte au nombre de cartes pour ne jamais laisser
 * une carte seule sur sa rangée (5 cartes sur 3 colonnes : 3 + 2, les deux dernières plus larges).
 * Sur une grille de 12 colonnes, chaque carte reçoit un empan de 12 / (cartes de sa rangée).
 */

/** Tailles de rangées pour `n` cartes et au plus `max` colonnes (2 à 4). */
export function desktopRows(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  const limit = Math.min(Math.max(Math.round(max), 2), 4);
  // si la répartition laisse une carte seule, on essaie une colonne de plus (3 cartes sur 2 colonnes : 3)
  for (let cols = limit; cols <= 4; cols++) {
    const rows = Math.ceil(n / cols);
    const base = Math.floor(n / rows);
    const extra = n % rows;
    const sizes = Array.from({ length: rows }, (_, i) =>
      i < extra ? base + 1 : base,
    );
    if (sizes.every((s) => s >= 2)) return sizes;
  }
  // inatteignable pour n >= 2 (4 colonnes suffisent toujours), conservé par sécurité
  return [n];
}

/** Empan (sur 12) de chaque carte, dans l'ordre. */
export function desktopSpans(n: number, max: number): number[] {
  return desktopRows(n, max).flatMap((size) =>
    Array.from({ length: size }, () => 12 / size),
  );
}
