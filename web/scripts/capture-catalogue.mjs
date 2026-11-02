// Captures du catalogue des modèles (1440 px et 390 px), liste, filtre actif, fiche, anglais.
// Usage : BASE_URL=http://localhost:8081 SORTIE=/chemin/dossier bun web/scripts/capture-catalogue.mjs
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3510";
const out = process.env.SORTIE ?? ".";
const vues = [
  ["liste", "/modeles", "#catalogue"],
  ["filtre-code", "/modeles?etiquette=code&prix-entree=1&tri=prix-entree#catalogue", "#catalogue"],
  ["fiche", "/modeles/nexora/glm-5.3", "main"],
  ["liste-en", "/en/modeles", "#catalogue"],
];
const browser = await chromium.launch();
for (const [nom, chemin, ancre] of vues)
  for (const [taille, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(base + chemin, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate((a) => {
      const el = document.querySelector(a.split("#").pop() ? `#${a.split("#").pop()}` : a) ?? document.querySelector(a);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 56);
    }, ancre.startsWith("#") ? ancre : `#${ancre}`).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/catalogue-${nom}-${taille}.jpg`, type: "jpeg", quality: 82 });
    await ctx.close();
  }
await browser.close();
