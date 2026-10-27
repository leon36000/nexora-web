// Captures pleine page de pages clés à 390 et 1440 px (mouvement réduit : état de repos déterministe).
// Usage : BASE_URL=http://localhost:3521 OUT=/chemin/sortie bun web/scripts/capture-pages.mjs [prefixe]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3521";
const out = process.env.OUT ?? "captures";
const prefix = process.argv[2] ?? "apres";
mkdirSync(out, { recursive: true });

const pages = [
  ["accueil", "/"],
  ["workstudio", "/workstudio"],
  ["opsys", "/opsys-ai"],
  ["vps", "/vps"],
  ["modeles", "/modeles"],
  ["contact", "/contact"],
  ["agents", "/agents"],
  ["docs-api", "/docs/api"],
  ["connexion", "/compte/connexion"],
  ["introuvable", "/page-qui-nexiste-pas"],
];
const only = process.env.ONLY?.split(",");

const browser = await chromium.launch();
for (const width of [390, 1440]) {
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  for (const [name, path] of pages) {
    if (only && !only.includes(name)) continue;
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `${prefix}-${name}-${width}.png`), fullPage: true });
    console.log("capture", prefix, name, width);
  }
  await context.close();
}
await browser.close();
