import { cn } from "@/lib/cn";

/** Chiffres en carrés (cinq rangées de trois) : « 4 », « 0 », « 4 ». Au centre du zéro, le point de passage orange. */
const FOUR = ["x.x", "x.x", "xxx", "..x", "..x"] as const;
const ZERO = ["xxx", "x.x", "x.o", "x.x", "xxx"] as const;
const GLYPHS = [FOUR, ZERO, FOUR] as const;
const CELL = 30;
const SIZE = 22;

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
                className={c === "o" ? "fill-accent" : "fill-fg"}
                opacity={
                  c === "o" ? 1 : 0.14 + ((g * 7 + r * 3 + k) % 5) * 0.07
                }
              />
            );
          }),
        ),
      )}
    </svg>
  );
}
