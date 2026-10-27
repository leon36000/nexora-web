// axe-core sur les états interactifs de S3 : contact (étape 2, erreurs, confirmation) et sommaire mobile ouvert.
//   BASE_URL=http://localhost:3500 bun web/scripts/axe-s3.mjs
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3500";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
let total = 0;
const browser = await chromium.launch();
async function scan(page, name) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  console.log(`${violations.length === 0 ? "OK   " : "ÉCHEC"} ${name} : ${violations.length} violation(s)`);
  for (const v of violations) console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  total += violations.length;
}
for (const [lang, path, need, next, back] of [
  ["fr", "/contact", "Un diagnostic pour cerner mon besoin", "Continuer", "Retour"],
  ["en", "/en/contact", "A diagnostic to pin down my need", "Continue", "Back"],
]) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "load" });
    await page.getByLabel(need).waitFor();
    await page.getByRole("button", { name: next }).click(); // étape 1 vide : erreurs
    await page.waitForTimeout(400);
    await scan(page, `${path} @${width} étape 1 avec erreurs`);
    await page.getByLabel(need).check();
    await page.locator("select").selectOption({ index: 1 });
    await page.locator('input[name="deployment"]').first().check();
    await page.getByRole("button", { name: next }).click();
    await page.getByRole("button", { name: back }).waitFor();
    await page.waitForTimeout(800);
    await scan(page, `${path} @${width} étape 2`);
    await page.locator('button[type="submit"]').click(); // étape 2 vide : erreurs
    await page.waitForTimeout(500);
    await scan(page, `${path} @${width} étape 2 avec erreurs`);
    await context.close();
  }
}
for (const [path, label] of [["/opsys-ai", "Sur cette page"], ["/en/opsys-ai", "On this page"]]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.locator("details summary", { hasText: label }).click();
  await scan(page, `${path} @390 sommaire ouvert`);
  await context.close();
}
await browser.close();
process.exit(total === 0 ? 0 : 1);
