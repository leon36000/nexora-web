// Audit axe (WCAG 2.0 à 2.2 AA + bonnes pratiques) des pages publiques retouchées, à 390 et 1440 px, plus le menu mobile
// ouvert, l'absence de défilement horizontal et les cibles tactiles de 44 px sur téléphone.
// Usage : BASE_URL=http://localhost:3711 bun web/scripts/audit-polissage.mjs
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.BASE_URL ?? "http://localhost:3711";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const PATHS = [
  "/", "/en", "/solutions", "/solutions/courriels", "/workstudio", "/suite", "/apps", "/apps/code", "/apps/rag", "/apps/privacy-router",
  "/en/apps", "/en/apps/code", "/modeles", "/modeles/nexora/glm-5.3", "/modeles/comparer", "/modeles/comparer?m=nexora/glm-5.3&m=nexora/kimi-k3",
  "/modeles/benchmarks", "/en/modeles", "/docs/api", "/faq", "/contact", "/en/contact", "/vps", "/vps/n8n", "/tarifs", "/agents", "/page-inconnue-polissage", "/en/unknown-page",
];
const browser = await chromium.launch();
let total = 0;
const problems = [];
for (const path of PATHS) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude("nextjs-portal").analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    total++;
    const line = `${path}@${width} : axe ${violations.length}, débord ${overflow}px, erreurs JS ${errors.length}`;
    console.log(violations.length || overflow > 0 || errors.length ? "ÉCHEC " : "OK    ", line);
    for (const v of violations) {
      console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
      problems.push(line);
    }
    if (overflow > 0 || errors.length) problems.push(line);
    await context.close();
  }
}
// menu mobile
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude("nextjs-portal").analyze();
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("dialog[open] a, dialog[open] button")]
      .map((el) => [el.textContent.trim().slice(0, 24), Math.round(el.getBoundingClientRect().height)])
      .filter(([, h]) => h > 0 && h < 44),
  );
  console.log(`menu mobile ouvert : axe ${violations.length}, cibles < 44 px : ${small.length}`, small.slice(0, 5).join(" | "));
  if (violations.length || small.length) problems.push("menu mobile");
  await context.close();
}
await browser.close();
console.log(`\n${total} pages auditées, ${problems.length} problème(s)`);
process.exit(problems.length ? 1 : 0);
