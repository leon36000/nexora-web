// axe-core sur les pages clés à 390 et 1440 px, avec et sans mouvement réduit.
//   BASE_URL=http://localhost:3521 bun web/scripts/axe-pages.mjs [chemin ...]
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3521";
const paths = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/", "/workstudio", "/opsys-ai", "/vps", "/modeles", "/contact", "/agents", "/docs/api", "/compte/connexion", "/compte/inscription", "/page-qui-nexiste-pas", "/en", "/en/vps", "/galerie-marque"];
const browser = await chromium.launch();
let total = 0;
for (const width of [390, 1440]) {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
    const page = await ctx.newPage();
    for (const p of paths) {
      await page.goto(base + p, { waitUntil: "networkidle" });
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      total += r.violations.length;
      for (const v of r.violations)
        console.log(`${width} ${reducedMotion} ${p} : ${v.id} (${v.impact}) x${v.nodes.length} ${v.nodes[0]?.target?.join(" ")}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log("violations axe au total :", total);
