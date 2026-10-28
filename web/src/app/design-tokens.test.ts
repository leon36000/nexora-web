import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("jetons de la direction « Instrument »", () => {
  it("toutes les paires de couleurs de texte et de graphisme passent leur seuil WCAG (script de contraste)", () => {
    const script = new URL("../../scripts/contrast.mjs", import.meta.url);
    // Le script sort en code 1 si une paire est sous son seuil : execFileSync lèverait alors une erreur.
    const out = execFileSync(process.execPath, [script.pathname], {
      encoding: "utf8",
    });
    expect(out).not.toContain("ÉCHEC");
    expect(out.match(/^OK/gm)?.length).toBeGreaterThanOrEqual(25);
  });

  it("une seule couleur d'accent : l'orange signal ; la rampe braise ne sert pas au texte", () => {
    expect(css).toMatch(/--color-ember-500:\s*#ff5a1f/);
    expect(css).toMatch(/--on-accent:\s*var\(--color-ink-950\)/);
    // le jeton de texte d'accent est l'orange foncé (clair) ou l'orange clair (sombre), jamais la rampe
    expect(css).toMatch(/--accent-text:\s*var\(--color-ember-700\)/);
    expect(css).toMatch(/--accent-text:\s*var\(--color-ember-400\)/);
  });

  it("les angles sont francs : aucun rayon au-delà de 12 px", () => {
    const radii = [...css.matchAll(/--radius-[a-z]+:\s*([0-9.]+)rem/g)].map(
      (m) => Number(m[1]) * 16,
    );
    expect(radii.length).toBe(5);
    expect(Math.max(...radii)).toBeLessThanOrEqual(12);
  });

  it("la mosaïque, le balayage et la bande braise ne bougent que sous prefers-reduced-motion: no-preference", () => {
    const start = css.indexOf(
      "@media (prefers-reduced-motion: no-preference)",
      css.indexOf(".mo-layer"),
    );
    const block = css.slice(start);
    for (const cls of [".mo-animate .mo-layer", ".scan", ".stripe-cell"])
      expect(block, cls).toContain(cls);
  });

  it("n'embarque aucune bibliothèque d'animation ni de 3D (CSS et SVG seulement)", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies ?? {}))
      expect(name).not.toMatch(
        /three|lottie|framer-motion|gsap|motion|pixi|babylon/i,
      );
  });
});
