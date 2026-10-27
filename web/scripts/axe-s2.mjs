// axe-core (WCAG 2.2 AA + bonnes pratiques) sur les pages rendues depuis Directus, à 390 et 1440 px.
// Usage : BASE_URL=http://localhost:3500 PATHS="/,/en,/opsys-ai,/en/opsys-ai" bun web/scripts/axe-s2.mjs
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3500";
const paths = (process.env.PATHS ?? "/,/en,/opsys-ai,/en/opsys-ai").split(",");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
let total = 0;
const browser = await chromium.launch();
for (const path of paths) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    const { violations, incomplete } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const h1 = await page.locator("h1").count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`${violations.length === 0 ? "OK   " : "ÉCHEC"} ${path} @${width} : ${violations.length} violation(s), ${incomplete.length} à vérifier à la main, ${h1} h1, débordement ${overflow}px`);
    for (const v of violations) console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
    for (const v of incomplete) console.log(`       ? ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
    total += violations.length;
    await context.close();
  }
}
await browser.close();
process.exit(total === 0 ? 0 : 1);
