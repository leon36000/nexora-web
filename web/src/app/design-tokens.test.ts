import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("jetons de l'identité « Signal »", () => {
  it("toutes les paires de couleurs de texte et de graphisme passent leur seuil WCAG (script de contraste)", () => {
    const script = new URL("../../scripts/contrast.mjs", import.meta.url);
    // Le script sort en code 1 si une paire est sous son seuil : execFileSync lèverait alors une erreur.
    const out = execFileSync(process.execPath, [script.pathname], {
      encoding: "utf8",
    });
    expect(out).not.toContain("ÉCHEC");
    expect(out.match(/^OK/gm)?.length).toBeGreaterThanOrEqual(25);
  });

  it("accent principal ion ; le flare (chaud) est un contrepoint rare, jamais l'accent des liens ni des focus", () => {
    expect(css).toMatch(/--color-abyss-950:\s*#05070b/);
    expect(css).toMatch(/--color-ion-400:\s*#3ec8ff/);
    expect(css).toMatch(/--color-flare-500:\s*#ff6a2b/);
    expect(css).toMatch(/--accent-text:\s*var\(--color-ion-400\)/);
    expect(css).toMatch(/--accent-text:\s*var\(--color-ion-700\)/);
    expect(css).toMatch(/--focus:\s*var\(--color-ion-400\)/);
    expect(css).not.toMatch(/--accent-[a-z]+:\s*var\(--color-flare/);
  });

  it("la mosaïque et la rampe braise ont disparu (elles faisaient penser à Mistral)", () => {
    expect(css).not.toMatch(/mosa|braise|stripe|ember|mo-layer|mo-blink/i);
    const root = new URL("..", import.meta.url).pathname;
    const files = execFileSync("git", ["ls-files", "components", "app"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
    const offenders = files.filter((f) =>
      /from "@\/components\/brand\/mosaic|<Mosaic\b/.test(
        readFileSync(join(root, f), "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("des rayons de 2 à 10 px", () => {
    const radii = [...css.matchAll(/--radius-[a-z]+:\s*([0-9.]+)rem/g)].map(
      (m) => Number(m[1]) * 16,
    );
    expect(radii.length).toBe(5);
    expect(Math.max(...radii)).toBeLessThanOrEqual(10);
    expect(Math.min(...radii)).toBeGreaterThanOrEqual(2);
  });

  it("le balayage, les ondes et les cadres de détection ne bougent que sous prefers-reduced-motion: no-preference", () => {
    const start = css.indexOf(
      "@media (prefers-reduced-motion: no-preference)",
      css.indexOf(".wave-bar"),
    );
    const block = css.slice(start);
    for (const cls of [
      ".wave-animate .wave-bar",
      ".scan-loop .scanline",
      ".detect-animate",
      ".live-dot",
      '[data-motion="pause"]',
    ])
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
