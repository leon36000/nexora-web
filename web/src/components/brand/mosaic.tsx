import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * Mosaïque : la matière signature de Nexora AI.
 *
 * Un champ de carrés dont la teinte suit une rampe (la « braise » : ambre, orange, vermillon, framboise) et qui se
 * dissout en pixels vers un côté, comme une image qui se calcule. Elle remplace la grille de périmètre des héros, des
 * bandeaux et des fonds de maquette. Pur SVG (une couche par teinte, donc quelques nœuds seulement), déterministe
 * (même rendu serveur et client, aucun aléa), décoratif (`aria-hidden`) ; la signification est toujours portée par le
 * texte voisin. Le mouvement (les couches respirent) est défini dans globals.css sous prefers-reduced-motion.
 */

/** Rampes de teintes, de la plus claire (bord qui se dissout) à la plus soutenue (cœur). Jamais utilisées pour du texte. */
export const PALETTES = {
  braise: ["#ffd37a", "#ffb11a", "#ff8a1f", "#ff5a1f", "#e0341c", "#b01a3c"],
  ciel: ["#e1eeff", "#bcd7ff", "#8fbbff", "#5f9aff", "#3b74f2", "#2a54c4"],
  or: ["#fff3c4", "#ffe58a", "#ffd44d", "#ffc01f", "#f5a30b", "#d98505"],
  menthe: ["#def7ea", "#b4edd2", "#86e0b7", "#57cf98", "#34b27a", "#238d5f"],
  nuit: ["#1b1b2c", "#232338", "#2c2c47", "#36365a", "#44446f", "#565688"],
} as const;

export type MosaicPalette = keyof typeof PALETTES;
export type MosaicToward = "right" | "left" | "top" | "bottom" | "center";

export type MosaicCell = { col: number; row: number; tier: number };

type CellOptions = {
  cols: number;
  rows: number;
  seed: number;
  /** Nombre de teintes de la rampe. */
  tiers: number;
  /** Côté où la mosaïque est pleine et soutenue ; elle se dissout vers le côté opposé. */
  toward: MosaicToward;
  /** 0 : champ plein (toutes les cellules, teintes mêlées) ; 1 : dissolution franche. */
  fade: number;
};

/** Hachage déterministe d'une cellule, dans [0, 1). */
function hash(col: number, row: number, seed: number): number {
  let h =
    Math.imul(col + 1, 73856093) ^
    Math.imul(row + 1, 19349663) ^
    Math.imul(seed + 1, 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Avancée de la cellule vers le côté plein, dans [0, 1]. */
function progress(
  col: number,
  row: number,
  cols: number,
  rows: number,
  toward: MosaicToward,
): number {
  const x = cols > 1 ? col / (cols - 1) : 0.5;
  const y = rows > 1 ? row / (rows - 1) : 0.5;
  switch (toward) {
    case "right":
      return x;
    case "left":
      return 1 - x;
    case "bottom":
      return y;
    case "top":
      return 1 - y;
    case "center":
      return Math.max(0, 1 - Math.hypot((x - 0.5) * 2, (y - 0.5) * 2) / 1.2);
  }
}

/** Cellules dessinées, avec leur teinte (0 = la plus claire). Fonction pure : testée sans rendu. */
export function mosaicCells({
  cols,
  rows,
  seed,
  tiers,
  toward,
  fade,
}: CellOptions): MosaicCell[] {
  const cells: MosaicCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const noise = hash(col, row, seed);
      const t = progress(col, row, cols, rows, toward);
      const v = 0.82 * t * fade + (1 - fade) * 0.5 + (noise - 0.5) * 0.7;
      if (fade > 0) {
        // Dissolution : la densité de carrés monte avec l'avancée, et même au cœur il reste des trous (des pixels éteints).
        const keep = 0.03 + 0.92 * (t ** 1.7 * fade + (1 - fade));
        if (hash(col, row, seed + 101) > keep || v <= 0.2) continue;
      }
      const tier = Math.max(0, Math.min(tiers - 1, Math.floor(v * tiers)));
      cells.push({ col, row, tier });
    }
  }
  return cells;
}

const n = (x: number) => Number(x.toFixed(2));

export type MosaicLayer = { tier: number; color: string; d: string };

/**
 * Couches de la mosaïque, une par teinte (chemin SVG de tous ses carrés). Sert aussi hors React : l'image Open Graph
 * la dessine avec satori. `keep` retire des cellules (par exemple pour laisser le texte respirer).
 */
export function mosaicLayers({
  cols,
  rows,
  seed,
  toward,
  fade,
  palette,
  gap,
  keep,
}: {
  cols: number;
  rows: number;
  seed: number;
  toward: MosaicToward;
  fade: number;
  palette: MosaicPalette;
  gap: number;
  keep?: (cell: MosaicCell) => boolean;
}): MosaicLayer[] {
  const ramp = PALETTES[palette];
  const inset = gap / 2;
  const side = n(1 - gap);
  const square = (col: number, row: number) =>
    `M${n(col + inset)} ${n(row + inset)}h${side}v${side}h${-side}z`;
  const cells = mosaicCells({
    cols,
    rows,
    seed,
    tiers: ramp.length,
    toward,
    fade,
  }).filter((c) => (keep ? keep(c) : true));
  return ramp.flatMap((color, tier) => {
    const layer = cells.filter((c) => c.tier === tier);
    return layer.length > 0
      ? [{ tier, color, d: layer.map((c) => square(c.col, c.row)).join("") }]
      : [];
  });
}

const ALIGN: Record<MosaicToward, string> = {
  right: "xMaxYMid",
  left: "xMinYMid",
  top: "xMidYMin",
  bottom: "xMidYMax",
  center: "xMidYMid",
};

type MosaicProps = {
  cols?: number;
  rows?: number;
  seed?: number;
  palette?: MosaicPalette;
  toward?: MosaicToward;
  fade?: number;
  /** Jeu entre les carrés, en fraction de cellule (0 : champ continu). */
  gap?: number;
  /** Les couches respirent (désactivé par prefers-reduced-motion). */
  animated?: boolean;
  /** Cellules « étincelle » : le point de passage, dessiné dans la couleur du texte du thème. */
  spark?: ReadonlyArray<readonly [col: number, row: number]>;
  className?: string;
};

export function Mosaic({
  cols = 36,
  rows = 18,
  seed = 1,
  palette = "braise",
  toward = "right",
  fade = 0.9,
  gap = 0.07,
  animated = false,
  spark,
  className,
}: MosaicProps) {
  const tiers = PALETTES[palette].length;
  const layers = mosaicLayers({ cols, rows, seed, toward, fade, palette, gap });
  const inset = gap / 2;
  const side = n(1 - gap);
  const square = (col: number, row: number) =>
    `M${n(col + inset)} ${n(row + inset)}h${side}v${side}h${-side}z`;
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio={`${ALIGN[toward]} slice`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className={cn(animated && "mo-animate", className)}
    >
      {layers.map(({ color, tier, d }) => (
        <path
          key={tier}
          className="mo-layer"
          fill={color}
          style={
            {
              "--i": tier,
              "--o": fade > 0 ? n(0.78 + 0.22 * (tier / (tiers - 1))) : 1,
            } as CSSProperties
          }
          d={d}
        />
      ))}
      {spark && spark.length > 0 ? (
        <path
          fill="var(--fg)"
          d={spark.map(([col, row]) => square(col, row)).join("")}
        />
      ) : null}
    </svg>
  );
}
