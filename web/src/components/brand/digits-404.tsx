import { cn } from "@/lib/cn";
import { PALETTES } from "./mosaic";

/** Chiffres en carrés (cinq rangées de trois) : « 4 », « 0 », « 4 ». Les carrés prennent les teintes de la mosaïque braise ; au centre du zéro, le point de passage (couleur du texte). */
const FOUR = ["x.x", "x.x", "xxx", "..x", "..x"] as const;
const ZERO = ["xxx", "x.x", "x.o", "x.x", "xxx"] as const;
const GLYPHS = [FOUR, ZERO, FOUR] as const;
const CELL = 30;
const SIZE = 27;

/** « 404 » dessiné avec les carrés de la grille de périmètre : décoratif (le titre de la page porte le sens). */
export function Digits404({ className }: { className?: string }) {
  const w = 11 * CELL;
  const h = 5 * CELL;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full text-fg", className)}
    >
      {GLYPHS.flatMap((rows, g) =>
        rows.flatMap((row, r) =>
          [...row].map((c, k) => {
            if (c === ".") return null;
            const x = (g * 4 + k) * CELL + (CELL - SIZE) / 2;
            const y = r * CELL + (CELL - SIZE) / 2;
            return (
              <rect
                // biome-ignore lint/suspicious/noArrayIndexKey: dessin fixe, jamais réordonné
                key={`${g}-${r}-${k}`}
                x={x}
                y={y}
                width={SIZE}
                height={SIZE}
                fill={
                  c === "o"
                    ? "var(--fg)"
                    : PALETTES.braise[((g * 7 + r * 3 + k * 2 + r * g) % 5) + 1]
                }
              />
            );
          }),
        ),
      )}
    </svg>
  );
}
