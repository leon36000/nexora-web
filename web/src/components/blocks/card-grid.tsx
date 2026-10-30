import { desktopSpans } from "@/lib/card-layout";
import { cn } from "@/lib/cn";

/**
 * Grille de cartes qui s'adapte à leur nombre : sur grand écran, 12 colonnes et un empan par carte
 * (5 cartes sur 3 colonnes : 3 + 2, les deux dernières plus larges) ; sur tablette, 2 colonnes et la
 * dernière carte d'un nombre impair occupe toute la rangée. Jamais une carte seule sur sa rangée en bureau.
 */
export const CARD_GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-12";

const SPAN: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  12: "lg:col-span-12",
};

/** Classes de chaque cellule, dans l'ordre des cartes. */
export function cellClasses(count: number, maxColumns: number): string[] {
  return desktopSpans(count, maxColumns).map((span) =>
    cn("flex sm:max-lg:last:odd:col-span-2", SPAN[span] ?? "lg:col-span-4"),
  );
}

/**
 * Grille à filets : les cartes sont des cellules séparées par des filets d'un pixel (le fond de la grille montre à
 * travers l'interstice), dans un cadre à angles francs. Mêmes empans que `CARD_GRID`.
 */
export const CELL_GRID =
  "grid gap-px overflow-hidden rounded-frame border border-line bg-line sm:grid-cols-2 lg:grid-cols-12";
