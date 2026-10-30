import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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

  describe("système de cartes, de sections et de mouvement (polissage visuel)", () => {
    /** Tous les fichiers .tsx d'un dossier, récursivement (hors tests). */
    const tsx = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return tsx(path);
        return path.endsWith(".tsx") && !path.endsWith(".test.tsx")
          ? [path]
          : [];
      });
    const root = new URL("..", import.meta.url).pathname;

    it("les durées de transition sont 150, 200 ou 250 ms (jetons --dur-*), partout hors du panneau du compte", () => {
      expect(css).toMatch(/--dur-fast:\s*150ms/);
      expect(css).toMatch(/--dur-base:\s*200ms/);
      expect(css).toMatch(/--dur-slow:\s*250ms/);
      const bad: string[] = [];
      for (const file of [
        ...tsx(join(root, "components")),
        ...tsx(join(root, "app")),
      ]) {
        if (file.includes("/components/account/")) continue;
        for (const m of readFileSync(file, "utf8").matchAll(
          /\bduration-(\d+)\b/g,
        ))
          if (![150, 200, 250].includes(Number(m[1])))
            bad.push(`${file.replace(root, "")}: duration-${m[1]}`);
      }
      expect(bad).toEqual([]);
    });

    it("toute animation CSS est déclarée sous prefers-reduced-motion: no-preference (les @keyframes seuls en sortent)", () => {
      // Parcours des accolades : chaque `{` est étiqueté par le texte qui le précède.
      const stack: string[] = [];
      const outside: string[] = [];
      let from = 0;
      for (let i = 0; i < css.length; i++) {
        const c = css[i];
        if (c === "{") {
          stack.push(css.slice(from, i).trim());
          from = i + 1;
        } else if (c === "}") {
          stack.pop();
          from = i + 1;
        } else if (c === ";") {
          const decl = css.slice(from, i).trim();
          from = i + 1;
          if (
            /^animation(-name)?\s*:/.test(decl) &&
            !stack.some((s) => s.startsWith("@keyframes")) &&
            !stack.some((s) =>
              s.includes("prefers-reduced-motion: no-preference"),
            )
          )
            outside.push(decl);
        }
      }
      expect(outside).toEqual([]);
    });

    it("les cartes, les cadres de grille et les puces ont un rayon par rôle, tous dans l'échelle de 2 à 12 px", () => {
      for (const role of ["card", "frame", "chip"])
        expect(css).toMatch(
          new RegExp(`--radius-${role}:\\s*var\\(--radius-(xs|sm|md|lg|xl)\\)`),
        );
    });

    it("une carte n'a qu'un jeu d'espacements (24 px, puis 32 px dès sm)", () => {
      expect(css).toMatch(/--pad-card:\s*1\.5rem/);
      expect(css).toMatch(/--pad-card-lg:\s*2rem/);
      const card = readFileSync(join(root, "components/ui/card.tsx"), "utf8");
      expect(card).toContain("p-6 sm:p-8");
      expect(card).not.toContain("sm:p-7");
    });
  });
});
