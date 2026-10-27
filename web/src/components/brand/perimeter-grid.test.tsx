import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PerimeterGrid } from "./perimeter-grid";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
};

/** Lit les <rect class="fill-accent"> du rendu, en séparant le point de passage (groupe pg-gate) de la traînée. */
function accentRects(shape: "wide" | "compact") {
  const html = renderToStaticMarkup(<PerimeterGrid shape={shape} />);
  const gateGroup = /<g class="pg-gate">([\s\S]*?)<\/g>/.exec(html)?.[1] ?? "";
  const rest = html.replace(/<g class="pg-gate">[\s\S]*?<\/g>/, "");
  const num = (tag: string, name: string) =>
    Number(new RegExp(`\\s${name}="([-0-9.]+)"`).exec(tag)?.[1] ?? Number.NaN);
  const toRect = (tag: string): Rect => ({
    x: num(tag, "x"),
    y: num(tag, "y"),
    width: num(tag, "width"),
    height: num(tag, "height"),
    opacity: /opacity="/.test(tag) ? num(tag, "opacity") : 1,
  });
  const tags = (s: string) => s.match(/<rect [^>]*>/g) ?? [];
  const gateFill = tags(gateGroup).find(
    (t) => t.includes("fill-accent") && !t.includes("stroke-accent"),
  );
  const trail = tags(rest)
    .filter((t) => /class="fill-accent"/.test(t))
    .map(toRect);
  if (!gateFill) throw new Error("point de passage introuvable");
  const g = toRect(gateFill);
  return { gate: { cx: g.x + g.width / 2, cy: g.y + g.height / 2 }, trail };
}

describe.each(["wide", "compact"] as const)(
  "grille de périmètre (%s) : la traînée orange",
  (shape) => {
    it("existe, sur la rangée du point de passage", () => {
      const { gate, trail } = accentRects(shape);
      expect(trail.length).toBeGreaterThanOrEqual(3);
      for (const r of trail) expect(r.y + r.height / 2).toBeCloseTo(gate.cy, 5);
    });

    it("reste À L'INTÉRIEUR du périmètre : rien d'orange à gauche du point de passage (pas de donnée qui sort)", () => {
      const { gate, trail } = accentRects(shape);
      for (const r of trail) expect(r.x + r.width / 2).toBeGreaterThan(gate.cx);
    });

    it("se lit comme une demande qui entre : de plus en plus marquée en s'éloignant du point de passage", () => {
      const { trail } = accentRects(shape);
      const byX = [...trail].sort((a, b) => a.x - b.x);
      for (let i = 1; i < byX.length; i++) {
        const prev = byX[i - 1] as Rect;
        const cur = byX[i] as Rect;
        expect(cur.width).toBeGreaterThanOrEqual(prev.width);
        expect(cur.opacity).toBeGreaterThanOrEqual(prev.opacity);
      }
    });
  },
);
