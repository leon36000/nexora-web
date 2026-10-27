// axe-core et captures des pages publiques des agents hébergés (S7) : /agents et une fiche, en fr et en, à 390 et 1440 px,
// en schéma clair et sombre (émulation de prefers-color-scheme ; les sections « sombres » du site sont des tons de
// section), plus la bulle WorkStudio quand elle est activée (aucune erreur de CSP dans la console).
//   BASE_URL=http://localhost:3541 AGENT=assistant-general bun web/scripts/axe-s7.mjs [dossier-de-captures]
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3541";
const agent = process.env.AGENT ?? "assistant-general";
const shots = process.argv[2];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
let total = 0;
const browser = await chromium.launch();
for (const path of ["/agents", "/en/agents", `/agents/${agent}`, `/en/agents/${agent}`]) {
  for (const width of [390, 1440]) {
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await context.newPage();
      const problems = [];
      page.on("console", (m) => {
        if (m.type() === "error" || /content security policy|csp/i.test(m.text())) problems.push(m.text().slice(0, 160));
      });
      await page.goto(base + path, { waitUntil: "networkidle" });
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const bad = violations.length + (overflow ? 1 : 0);
      console.log(`${bad === 0 ? "OK   " : "ÉCHEC"} ${path} @${width} ${scheme} : ${violations.length} violation(s)${overflow ? ", DÉFILEMENT HORIZONTAL" : ""}`);
      for (const v of violations) console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
      for (const p of problems) console.log(`       console : ${p}`);
      total += bad;
      if (shots) await page.screenshot({ path: `${shots}/${path.replace(/^\//, "").replace(/\//g, "_")}-${width}-${scheme}.png`, fullPage: true });
      await context.close();
    }
  }
}
await browser.close();
process.exit(total === 0 ? 0 : 1);
