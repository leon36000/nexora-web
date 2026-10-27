// Captures S2 : pages rendues depuis Directus à 390 et 1440 px -> docs/captures/s2/
// Usage : BASE_URL=http://localhost:3500 PAGES="fr:/:accueil-fr,en:/en:accueil-en,fr:/opsys-ai:opsys-ai-fr" bun web/scripts/capture-s2.mjs
//   PAGES = liste de « langue:chemin:nom » ; WIDTHS = largeurs séparées par des virgules (défaut 390,1440) ; OUT = dossier.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.BASE_URL ?? "http://localhost:3500";
const out = resolve(process.env.OUT ?? join(dirname(fileURLToPath(import.meta.url)), "../../docs/captures/s2"));
mkdirSync(out, { recursive: true });
const widths = (process.env.WIDTHS ?? "390,1440").split(",").map(Number);
const pages = (process.env.PAGES ?? "fr:/:accueil-fr,en:/en:accueil-en").split(",").map((p) => {
  const [lang, path, name] = p.split(":");
  return { lang, path, name };
});

const browser = await chromium.launch();
for (const { path, name } of pages) {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 844 : 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce", // captures déterministes : l'état de repos de l'animation
    });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const file = join(out, `${name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log("capture", file);
    await context.close();
  }
}
await browser.close();
