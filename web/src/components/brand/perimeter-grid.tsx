import { type CSSProperties, type ReactElement, useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Signature graphique Nexora : la « grille de périmètre ».
 *
 * Des carrés qui dessinent une frontière : celle de vos données. Le périmètre est fait de
 * carrés alignés sur une grille ; un point de passage orange marque l'entrée contrôlée.
 * Pur SVG + CSS (pas de canvas, pas de WebGL, aucun script), décoratif (`aria-hidden`).
 * L'animation (un éclat qui parcourt la frontière, un flux de carrés) est définie dans
 * globals.css et désactivée par `prefers-reduced-motion` : l'état de repos se suffit à lui-même.
 *
 * Deux composants :
 *  - <PerimeterGrid>    : arrière-plan de héros (composition large ou compacte pour le mobile) ;
 *  - <PerimeterDiagram> : schéma de flux des deux modes de déploiement (sur place / hébergé).
 * Les couleurs suivent le thème de la section (`fg`, `accent`) ; la signification est toujours
 * portée par un texte HTML voisin, jamais par le dessin seul.
 */

type Cell = readonly [col: number, row: number];

/** Hachage déterministe (même rendu serveur et client, aucun aléa). */
function hash(c: number, r: number): number {
  return (
    ((Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663)) >>> 0) % 100
  );
}

/** Cellules de la frontière d'un rectangle, dans le sens horaire (pour l'éclat qui la parcourt). */
function frontier(c0: number, c1: number, r0: number, r1: number): Cell[] {
  const cells: Cell[] = [];
  for (let c = c0; c <= c1; c++) cells.push([c, r0]);
  for (let r = r0 + 1; r <= r1; r++) cells.push([c1, r]);
  for (let c = c1 - 1; c >= c0; c--) cells.push([c, r1]);
  for (let r = r1 - 1; r > r0; r--) cells.push([c0, r]);
  return cells;
}

type Scene = {
  cols: number;
  rows: number;
  cell: number;
  /** Rectangle du périmètre, en indices de cellules (inclusifs). */
  box: { c0: number; c1: number; r0: number; r1: number };
  /** Point de passage contrôlé, sur le bord gauche du périmètre. */
  gateRow: number;
};

const WIDE: Scene = {
  cols: 30,
  rows: 16,
  cell: 48,
  box: { c0: 17, c1: 28, r0: 3, r1: 12 },
  gateRow: 11,
};
const COMPACT: Scene = {
  cols: 12,
  rows: 7,
  cell: 40,
  box: { c0: 4, c1: 10, r0: 1, r1: 5 },
  gateRow: 3,
};

function SceneArt({ scene, id }: { scene: Scene; id: string }) {
  const { cols, rows, cell, box, gateRow } = scene;
  const half = cell / 2;
  const edge = Math.round(cell * 0.56); // côté d'un carré de frontière
  const path = frontier(box.c0, box.c1, box.r0, box.r1);
  const nodes: ReactElement[] = [];

  // Carrés de la frontière (sauf le point de passage).
  path.forEach(([c, r], i) => {
    if (c === box.c0 && r === gateRow) return;
    nodes.push(
      <rect
        key={`f-${c}-${r}`}
        className="pg-trace fill-fg"
        style={{ "--i": i } as CSSProperties}
        x={c * cell + half - edge / 2}
        y={r * cell + half - edge / 2}
        width={edge}
        height={edge}
      />,
    );
  });

  // Point de passage : un carré orange plus grand, cerné d'un filet.
  const gx = box.c0 * cell + half;
  const gy = gateRow * cell + half;
  const gate = Math.round(edge * 1.25);
  const gateNode = (
    <g key="gate" className="pg-gate">
      <rect
        x={gx - gate / 2 - 6}
        y={gy - gate / 2 - 6}
        width={gate + 12}
        height={gate + 12}
        className="fill-none stroke-accent"
        strokeWidth={1.5}
      />
      <rect
        x={gx - gate / 2}
        y={gy - gate / 2}
        width={gate}
        height={gate}
        className="fill-accent"
      />
    </g>
  );

  // Flux entrant vers le point de passage : carrés décroissants, de plus en plus marqués.
  for (let k = 1; k <= 4; k++) {
    const c = box.c0 - k;
    if (c < 0) break;
    const s = Math.round(cell * (0.34 - k * 0.04));
    nodes.push(
      <rect
        key={`in-${k}`}
        className="fill-accent"
        opacity={0.85 - k * 0.14}
        x={c * cell + half - s / 2}
        y={gy - s / 2}
        width={s}
        height={s}
      />,
    );
  }

  // Données à l'intérieur du périmètre (denses) et à l'extérieur (rares, très discrètes).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const onBorder =
        c >= box.c0 &&
        c <= box.c1 &&
        r >= box.r0 &&
        r <= box.r1 &&
        (c === box.c0 || c === box.c1 || r === box.r0 || r === box.r1);
      if (onBorder) continue;
      const inside = c > box.c0 && c < box.c1 && r > box.r0 && r < box.r1;
      const h = hash(c, r);
      if (inside && h < 22) {
        const s = h < 7 ? Math.round(cell * 0.3) : Math.round(cell * 0.18);
        nodes.push(
          <rect
            key={`d-${c}-${r}`}
            className="fill-fg"
            opacity={h < 7 ? 0.55 : 0.3}
            x={c * cell + half - s / 2}
            y={r * cell + half - s / 2}
            width={s}
            height={s}
          />,
        );
      } else if (!inside && h < 6 && !(r === gateRow && c < box.c0)) {
        const s = Math.round(cell * 0.14);
        nodes.push(
          <rect
            key={`o-${c}-${r}`}
            className="fill-fg"
            opacity={0.2}
            x={c * cell + half - s / 2}
            y={r * cell + half - s / 2}
            width={s}
            height={s}
          />,
        );
      }
    }
  }

  const w = cols * cell;
  const h = rows * cell;
  return (
    <>
      <defs>
        {/* Trame : un point carré à chaque intersection de la grille. */}
        <pattern
          id={`${id}-dots`}
          width={cell}
          height={cell}
          patternUnits="userSpaceOnUse"
        >
          <rect
            x={half - 1.5}
            y={half - 1.5}
            width={3}
            height={3}
            className="fill-fg"
            opacity={0.2}
          />
        </pattern>
        {/* Fondu des bords : le dessin s'efface vers l'extérieur pour laisser respirer le texte. */}
        <radialGradient
          id={`${id}-fade`}
          cx={`${((box.c0 + box.c1 + 1) / 2 / cols) * 100}%`}
          cy={`${((box.r0 + box.r1 + 1) / 2 / rows) * 100}%`}
          r="58%"
        >
          <stop offset="0.45" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <rect width={w} height={h} fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}-mask)`}>
        <rect width={w} height={h} fill={`url(#${id}-dots)`} />
        {nodes}
      </g>
      {gateNode}
    </>
  );
}

type PerimeterGridProps = {
  /** "wide" : fond de héros sur grand écran ; "compact" : composition propre au mobile. */
  shape?: "wide" | "compact";
  animated?: boolean;
  className?: string;
};

export function PerimeterGrid({
  shape = "wide",
  animated = true,
  className,
}: PerimeterGridProps) {
  const id = useId().replace(/:/g, "");
  const scene = shape === "wide" ? WIDE : COMPACT;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${scene.cols * scene.cell} ${scene.rows * scene.cell}`}
      preserveAspectRatio={
        shape === "wide" ? "xMaxYMid slice" : "xMidYMid meet"
      }
      className={cn(
        "pointer-events-none h-full w-full text-fg",
        animated && "pg-animate",
        className,
      )}
    >
      <SceneArt scene={scene} id={id} />
    </svg>
  );
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
 */
export function PerimeterDiagram({
  mode,
  className,
}: {
  mode: "onsite" | "hosted";
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
      {mode === "onsite" ? (
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
