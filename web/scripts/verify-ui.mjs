// Vérification de l'interface : axe-core (WCAG 2.2 AA), menus (focus, Échap), langue,
// mouvement réduit, absence de défilement horizontal.
// Usage : BASE_URL=http://localhost:3641 bun web/scripts/verify-ui.mjs
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.BASE_URL ?? "http://localhost:3641";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${name}${detail ? " — " + detail : ""}`);
};

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
async function axe(page, label) {
  const { violations, incomplete } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  check(`axe ${label} : aucune violation sérieuse ou critique`, serious.length === 0, `${violations.length} violation(s) au total, ${incomplete.length} à vérifier à la main`);
  for (const v of violations) console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nœud(s)) ${v.nodes[0]?.target}`);
  for (const v of incomplete) console.log(`       ? ${v.id}: ${v.help} (${v.nodes.length} nœud(s)) ${v.nodes[0]?.target}`);
}

const browser = await chromium.launch();
const open = async (path, width, opts = {}) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + path, { waitUntil: "networkidle" });
  return { context, page, errors };
};

for (const [lang, path] of [["fr", "/"], ["en", "/en"]]) {
  for (const width of [390, 1440]) {
    const { context, page, errors } = await open(path, width);
    check(`${lang}@${width} : <html lang> correct`, (await page.getAttribute("html", "lang")) === (lang === "fr" ? "fr-CA" : "en-CA"));
    check(`${lang}@${width} : un seul h1`, (await page.locator("h1").count()) === 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${lang}@${width} : pas de défilement horizontal`, overflow <= 0, `débordement ${overflow}px`);
    check(`${lang}@${width} : aucune erreur console`, errors.length === 0, errors.join(" | "));
    await axe(page, `${lang}@${width}`);
    await context.close();
  }
}

// Reflux à 320 px (WCAG 1.4.10)
{
  const { context, page } = await open("/", 320);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("fr@320 : reflux sans défilement horizontal", overflow <= 0, `débordement ${overflow}px`);
  await context.close();
}

// Menu Produits (bureau) : divulgation, Échap, retour du focus, clic ou focus à l'extérieur
{
  const { context, page } = await open("/", 1440);
  const button = page.getByRole("button", { name: "Produits" });
  check("Produits : fermé au départ", (await button.getAttribute("aria-expanded")) === "false");
  await button.focus();
  await page.keyboard.press("Enter");
  check("Produits : s'ouvre au clavier (Entrée)", (await button.getAttribute("aria-expanded")) === "true");
  check("Produits : six entrées visibles", (await page.locator(`#${await button.getAttribute("aria-controls")} a:visible`).count()) === 6);
  await axe(page, "fr@1440 menu Produits ouvert");
  await page.keyboard.press("Tab");
  check("Produits : le focus entre dans le panneau", await page.evaluate(() => !!document.activeElement.closest("[id] ul a")));
  await page.keyboard.press("Escape");
  check("Produits : Échap referme", (await button.getAttribute("aria-expanded")) === "false");
  check("Produits : le focus revient au bouton", await button.evaluate((el) => el === document.activeElement));
  await button.click();
  await page.mouse.click(700, 500);
  check("Produits : un clic à l'extérieur referme", (await button.getAttribute("aria-expanded")) === "false");
  await context.close();
}

// Menu mobile : modale, focus piégé, Échap, retour du focus
{
  const { context, page } = await open("/", 390);
  const trigger = page.getByRole("button", { name: "Ouvrir le menu" });
  await trigger.click();
  const dialog = page.locator("dialog[open]");
  check("Menu mobile : s'ouvre", (await dialog.count()) === 1);
  check("Menu mobile : focus placé dans la boîte", await page.evaluate(() => !!document.activeElement.closest("dialog")));
  let escaped = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (!(await page.evaluate(() => !!document.activeElement.closest("dialog")))) escaped = true;
  }
  check("Menu mobile : focus piégé (40 tabulations sans en sortir)", !escaped);
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Shift+Tab");
    if (!(await page.evaluate(() => !!document.activeElement.closest("dialog")))) escaped = true;
  }
  check("Menu mobile : focus piégé en sens inverse", !escaped);
  const links = await dialog.locator("a").evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check("Menu mobile : navigation complète", ["IA souveraine", "Solutions", "Tarifs", "Ressources", "Planifier un diagnostic", "Connexion"].every((t) => links.some((l) => l.startsWith(t))), links.join(" · "));
  check("Menu mobile : entrées Produits (6)", ["VPS", "Modèles et API", "Agents", "WorkStudio", "Suite logicielle", "OPSYS-AI"].every((t) => links.some((l) => l.startsWith(t))));
  await axe(page, "fr@390 menu mobile ouvert");
  await page.keyboard.press("Escape");
  check("Menu mobile : Échap ferme", (await page.locator("dialog[open]").count()) === 0);
  check("Menu mobile : le focus revient au bouton d'ouverture", await trigger.evaluate((el) => el === document.activeElement));
  await context.close();
}

// Sélecteur de langue
{
  const fr = await open("/", 1440);
  check("Langue : depuis fr, EN pointe vers /en", (await fr.page.locator('header a[hreflang="en-CA"]').first().getAttribute("href")) === "/en");
  check("Langue : fr marqué comme courant", (await fr.page.locator('header a[hreflang="fr-CA"]').first().getAttribute("aria-current")) === "true");
  await fr.context.close();
  const en = await open("/en", 1440);
  check("Langue : depuis en, FR pointe vers /", (await en.page.locator('footer a[hreflang="fr-CA"]').first().getAttribute("href")) === "/");
  await en.context.close();
}

// Mouvement réduit
{
  const animName = (page) => page.evaluate(() => getComputedStyle(document.querySelector(".pg-trace")).animationName);
  const reduced = await open("/", 1440, { reducedMotion: "reduce" });
  check("Mouvement réduit : animation désactivée", (await animName(reduced.page)) === "none");
  await reduced.context.close();
  const normal = await open("/", 1440, { reducedMotion: "no-preference" });
  check("Mouvement normal : animation active", (await animName(normal.page)) !== "none");
  await normal.context.close();
}

// Pas de décor non masqué : tout SVG décoratif est aria-hidden
{
  const { context, page } = await open("/", 1440);
  const bad = await page.evaluate(() => [...document.querySelectorAll("svg")].filter((s) => s.getAttribute("aria-hidden") !== "true").length);
  check("SVG décoratifs : tous aria-hidden", bad === 0, `${bad} SVG sans aria-hidden`);
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
