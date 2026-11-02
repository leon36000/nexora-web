// Contrôle axe-core (WCAG 2.2 AA) des pages de la refonte « Signal », à 390 et 1440 px.
// Usage : BASE_URL=http://localhost:3510 bun web/scripts/axe-signal.mjs [/chemin ...]
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3510";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/solutions/reception-virtuelle", "/solutions/surveillance-ia", "/infrastructure", "/ressources", "/en"];
const browser = await chromium.launch();
let total = 0;
for (const path of paths)
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    for (const v of r.violations) {
      total++;
      console.log(`${path} @${width} ${v.id} (${v.impact}) : ${v.nodes.length} nœud(s)`);
      for (const n of v.nodes.slice(0, 3)) console.log(`   ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1] ?? ""}`);
    }
    await context.close();
  }
await browser.close();
console.log(total === 0 ? "axe : aucune violation" : `axe : ${total} violation(s)`);
process.exit(total === 0 ? 0 : 1);
