// axe-core et captures des pages VPS publiques (S6) : /vps, une fiche installable, un guide, en fr et en, à 390 et 1440 px,
// plus le configurateur avec une erreur de clé SSH.
//   BASE_URL=http://localhost:3500 bun web/scripts/axe-s6.mjs [dossier-de-captures]
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3500";
const shots = process.argv[2];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
let total = 0;
const browser = await chromium.launch();
for (const path of ["/vps", "/en/vps", "/vps/ollama-anythingllm", "/en/vps/hermes-agent", "/vps/n8n"]) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(`${violations.length === 0 && !overflow ? "OK   " : "ÉCHEC"} ${path} @${width} : ${violations.length} violation(s)${overflow ? ", DÉFILEMENT HORIZONTAL" : ""}`);
    for (const v of violations) console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
    total += violations.length + (overflow ? 1 : 0);
    if (shots) await page.screenshot({ path: `${shots}/${path.replace(/\//g, "_") || "_"}-${width}.png`, fullPage: true });
    await context.close();
  }
}
// Configurateur : envoi d'une clé invalide -> erreur annoncée, sans violation.
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${base}/vps`, { waitUntil: "networkidle" });
const key = page.locator("textarea").first();
await key.fill("motdepasse123");
await page.locator("form button[type=submit], #configurateur button[type=submit]").first().click();
await page.waitForTimeout(800);
const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
console.log(`${violations.length === 0 ? "OK   " : "ÉCHEC"} /vps configurateur avec erreur : ${violations.length} violation(s)`);
for (const v of violations) console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
total += violations.length;
await browser.close();
process.exit(total === 0 ? 0 : 1);
