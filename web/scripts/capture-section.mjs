// Capture d'une section précise (sélecteur) ou de l'écran, à une largeur donnée, sans mouvement par défaut.
// Usage : BASE_URL=… OUT=… bun web/scripts/capture-section.mjs <chemin> <sélecteur|écran> <largeur> <nom>
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [path, selector, w, name] = process.argv.slice(2);
const width = Number(w);
const browser = await chromium.launch(
  process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {},
);
const context = await browser.newContext({
  viewport: { width, height: width < 768 ? 844 : 900 },
  deviceScaleFactor: 1,
  reducedMotion: process.env.MOTION === "1" ? "no-preference" : "reduce",
});
const page = await context.newPage();
await page.goto((process.env.BASE_URL ?? "http://localhost:3510") + path, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.evaluate(() => document.fonts.ready);
const file = join(process.env.OUT ?? ".", `${name}.jpg`);
if (selector === "écran") await page.screenshot({ path: file, quality: 70 });
else if (selector === "page")
  await page.screenshot({ path: file, quality: 55, fullPage: true });
else {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await el.screenshot({ path: file, quality: 70 });
}
console.log(file);
await browser.close();
