/**
 * Relief du champ de lumière (matière « Signal » n° 2) : somme de quelques ondes lentes, continue et sans hasard.
 * Module pur (sans React) : partagé par le <canvas> du site et par l'image Open Graph.
 */
export function terrain(x: number, z: number, t: number, relief: number) {
  return (
    relief *
    (0.55 *
      Math.sin(2.6 * x + 1.7 * z + t * 0.22) *
      Math.cos(3.1 * z - t * 0.15) +
      0.28 * Math.sin(6.3 * x - 4.1 * z + t * 0.35) +
      0.17 * Math.cos(9.7 * x + 7.3 * z - t * 0.28))
  );
}

/** Points du champ projetés en perspective dans un cadre w × h (instant t figé) : [x, y, taille, opacité]. */
export function fieldPoints(opts: {
  w: number;
  h: number;
  cols: number;
  horizon: number;
  relief: number;
  t?: number;
}): [number, number, number, number][] {
  const { w, h, cols, horizon, relief, t = 8 } = opts;
  const rows = Math.round(cols * 0.46);
  const hy = h * horizon;
  const cam = 0.42;
  const out: [number, number, number, number][] = [];
  for (let j = 0; j < rows; j++) {
    const z = j / (rows - 1);
    const s = 1 / (0.28 + z * 2.4);
    const alpha = 0.85 * (1 - z) ** 1.35 + 0.06;
    const size = 1.9 - z * 1.3;
    for (let i = 0; i < cols; i++) {
      const x = (i / (cols - 1)) * 2 - 1;
      const sx = w / 2 + x * w * 0.95 * s;
      const sy = hy + (cam - terrain(x, z, t, relief)) * h * 0.95 * s;
      if (sx < 0 || sx > w || sy < hy - 2 || sy > h) continue;
      out.push([sx, sy, size, alpha]);
    }
  }
  return out;
}
