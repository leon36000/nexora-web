import type { CSSProperties, ReactElement } from "react";
import { cn } from "@/lib/cn";

/**
 * Schéma de flux « périmètre » : des carrés alignés dessinent la frontière de vos données ; un point de passage orange
 * marque l'entrée contrôlée (modes sur place, hébergé, flux). Pur SVG + CSS, aucun script, décoratif (`aria-hidden`).
 * L'animation (un éclat qui parcourt la frontière, un flux de carrés) est définie dans globals.css et désactivée par
 * `prefers-reduced-motion`. Les couleurs suivent le thème de la section (`fg`, `accent`) ; la signification est toujours
 * portée par un texte HTML voisin, jamais par le dessin seul. (La mosaïque `Mosaic` a remplacé l'ancienne grille de
 * périmètre comme décor de héros.)
 */

type Cell = readonly [col: number, row: number];

/** Cellules de la frontière d'un rectangle, dans le sens horaire (pour l'éclat qui la parcourt). */
function frontier(c0: number, c1: number, r0: number, r1: number): Cell[] {
  const cells: Cell[] = [];
  for (let c = c0; c <= c1; c++) cells.push([c, r0]);
  for (let r = r0 + 1; r <= r1; r++) cells.push([c1, r]);
  for (let c = c1 - 1; c >= c0; c--) cells.push([c, r1]);
  for (let r = r1 - 1; r > r0; r--) cells.push([c0, r]);
  return cells;
}

/* -------------------------------------------------------------------------- */
/* Schéma de flux : les deux modes de déploiement                              */
/* -------------------------------------------------------------------------- */

const D = { cols: 20, rows: 11, cell: 24 } as const;

function cluster(
  key: string,
  c: number,
  r: number,
  nc: number,
  nr: number,
  fillAll = false,
): ReactElement[] {
  const out: ReactElement[] = [];
  const s = 10;
  for (let j = 0; j < nr; j++) {
    for (let i = 0; i < nc; i++) {
      const filled = fillAll || (i + j) % 2 === 0;
      out.push(
        <rect
          key={`${key}-${i}-${j}`}
          x={(c + i) * D.cell + (D.cell - s) / 2}
          y={(r + j) * D.cell + (D.cell - s) / 2}
          width={s}
          height={s}
          className={filled ? "fill-fg" : "fill-none stroke-fg"}
          strokeWidth={filled ? 0 : 1.25}
          opacity={filled ? 0.8 : 0.7}
        />,
      );
    }
  }
  return out;
}

function boxCells(
  key: string,
  c0: number,
  c1: number,
  r0: number,
  r1: number,
  skip?: Cell,
): ReactElement[] {
  const s = 12;
  return frontier(c0, c1, r0, r1)
    .filter(([c, r]) => !(skip && skip[0] === c && skip[1] === r))
    .map(([c, r], i) => (
      <rect
        key={`${key}-${c}-${r}`}
        className="pg-trace fill-fg"
        style={{ "--i": i } as CSSProperties}
        x={c * D.cell + (D.cell - s) / 2}
        y={r * D.cell + (D.cell - s) / 2}
        width={s}
        height={s}
      />
    ));
}

function flowLine(
  key: string,
  x1: number,
  x2: number,
  row: number,
): ReactElement {
  const y = row * D.cell + D.cell / 2;
  return (
    <path
      key={key}
      d={`M ${x1} ${y} H ${x2}`}
      className="pg-flow fill-none stroke-accent"
      strokeWidth={5}
      strokeLinecap="square"
    />
  );
}

/**
 * mode « onsite » : un seul périmètre entoure données, modèles et calcul (chez le client).
 * mode « hosted » : les données du client, à l'extérieur, franchissent un point de passage
 *                   contrôlé vers le périmètre de l'infrastructure Nexora au Québec.
 * mode « flow »   : des documents entrent par le point de passage vers le modèle ; ce qui est préparé ne
 *                   sort qu'après un point d'approbation humaine (carré creux). Rien d'orange ne sort
 *                   du périmètre : l'orange désigne seulement ce qui entre.
 */
export function PerimeterDiagram({
  mode,
  className,
}: {
  mode: "onsite" | "hosted" | "flow";
  className?: string;
}) {
  const half = D.cell / 2;
  const gateSize = 16;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${D.cols * D.cell} ${D.rows * D.cell}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn(
        "pointer-events-none h-auto w-full text-fg pg-animate",
        className,
      )}
    >
      {mode === "flow" ? (
        <>
          {cluster("src", 1, 4, 2, 3)}
          {boxCells("p", 5, 18, 1, 9, [5, 5])}
          <g className="pg-gate">
            <rect
              x={5 * D.cell + half - gateSize / 2 - 5}
              y={5 * D.cell + half - gateSize / 2 - 5}
              width={gateSize + 10}
              height={gateSize + 10}
              className="fill-none stroke-accent"
              strokeWidth={1.5}
            />
            <rect
              x={5 * D.cell + half - gateSize / 2}
              y={5 * D.cell + half - gateSize / 2}
              width={gateSize}
              height={gateSize}
              className="fill-accent"
            />
          </g>
          {cluster("model", 8, 4, 3, 3)}
          {/* Approbation : un carré creux sur le trajet de sortie, jamais de ligne orange vers l'extérieur. */}
          <rect
            x={14 * D.cell + half - 9}
            y={5 * D.cell + half - 9}
            width={18}
            height={18}
            className="fill-none stroke-fg"
            strokeWidth={2}
          />
          <rect
            x={14 * D.cell + half - 3}
            y={5 * D.cell + half - 3}
            width={6}
            height={6}
            className="fill-fg"
          />
          {cluster("use", 16, 4, 1, 3, true)}
          {flowLine("f1", 3 * D.cell + 4, 5 * D.cell - 14, 5)}
          {flowLine("f2", 5 * D.cell + 18, 8 * D.cell - 4, 5)}
          <path
            d={`M ${11 * D.cell + 4} ${5 * D.cell + half} H ${14 * D.cell - 12}`}
            className="fill-none stroke-fg"
            strokeWidth={2}
            strokeDasharray="4 5"
            opacity={0.6}
          />
        </>
      ) : mode === "onsite" ? (
        <>
          {boxCells("p", 1, 18, 1, 9)}
          {cluster("data", 3, 3, 3, 3)}
          {cluster("model", 8, 4, 3, 3)}
          {cluster("use", 14, 3, 2, 4, true)}
          {flowLine("f1", 6 * D.cell + 4, 8 * D.cell - 4, 5)}
          {flowLine("f2", 11 * D.cell + 4, 14 * D.cell - 4, 5)}
        </>
      ) : (
        <>
          {cluster("client", 1, 4, 3, 3)}
          {boxCells("p", 7, 18, 1, 9, [7, 5])}
          <g className="pg-gate">
            <rect
              x={7 * D.cell + half - gateSize / 2 - 5}
              y={5 * D.cell + half - gateSize / 2 - 5}
              width={gateSize + 10}
              height={gateSize + 10}
              className="fill-none stroke-accent"
              strokeWidth={1.5}
            />
            <rect
              x={7 * D.cell + half - gateSize / 2}
              y={5 * D.cell + half - gateSize / 2}
              width={gateSize}
              height={gateSize}
              className="fill-accent"
            />
          </g>
          {cluster("model", 10, 3, 3, 3)}
          {cluster("store", 15, 5, 2, 3, true)}
          {flowLine("f1", 4 * D.cell + 4, 7 * D.cell - 14, 5)}
          {flowLine("f2", 7 * D.cell + 18, 10 * D.cell - 4, 5)}
        </>
      )}
    </svg>
  );
}
