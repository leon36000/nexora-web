// Captures de l'accueil (fr-CA et en-CA) à 390, 768, 1024 et 1440 px -> .data/captures/ (ignoré par git)
// Usage : BASE_URL=http://localhost:3641 bun web/scripts/capture.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.BASE_URL ?? "http://localhost:3641";
const out = join(dirname(fileURLToPath(import.meta.url)), "../../.data/captures");
mkdirSync(out, { recursive: true });

const widths = [390, 768, 1024, 1440];
const pages = [
  { lang: "fr", path: "/" },
  { lang: "en", path: "/en" },
];

const browser = await chromium.launch();
for (const { lang, path } of pages) {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 844 : 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce", // captures déterministes : l'état de repos de l'animation
    });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const file = join(out, `accueil-${lang}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log("capture", file);
    await context.close();
  }
}
await browser.close();
