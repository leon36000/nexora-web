// Captures pleine page de la refonte « Signal » (bureau 1440 px et téléphone 390 px), sans mouvement (état de repos).
// Usage : BASE_URL=http://localhost:3510 OUT=/chemin bun web/scripts/capture-signal.mjs [/chemin ...]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3510";
const out = process.env.OUT ?? ".data/captures-signal";
const widths = (process.env.WIDTHS ?? "1440,390").split(",").map(Number);
mkdirSync(out, { recursive: true });
const paths = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/", "/solutions/reception-virtuelle", "/solutions/surveillance-ia", "/infrastructure", "/apps/creative", "/en"];

// PROXY=socks5://127.0.0.1:1055 : passer par le tailnet (pc6 est en mode « userspace »)
const browser = await chromium.launch(
  process.env.PROXY ? { proxy: { server: process.env.PROXY } } : {},
);
for (const path of paths) {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 844 : 900 },
      deviceScaleFactor: width < 768 ? 2 : 1,
      reducedMotion: process.env.MOTION === "1" ? "no-preference" : "reduce",
    });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    // fait défiler la page pour charger les images paresseuses
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    const name = `${path.replace(/^\/|\/$/g, "").replace(/\//g, "_") || "accueil"}-${width < 768 ? "mobile" : "bureau"}.png`;
    await page.screenshot({ path: join(out, name), fullPage: true });
    console.log("capture", name);
    await context.close();
  }
}
await browser.close();
