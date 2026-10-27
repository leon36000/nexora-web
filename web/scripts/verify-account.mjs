// Vérification de l'espace client : axe-core (WCAG 2.2 AA) sur les pages de connexion,
// d'inscription, de récupération et sur le tableau de bord (session ouverte par l'API), en fr et en,
// à 390 et 1440 px ; absence de défilement horizontal ; aucune erreur console.
// Usage : BASE_URL=http://localhost:3540 ACCOUNT_EMAIL=… ACCOUNT_PASSWORD=… bun web/scripts/verify-account.mjs
// (le compte doit exister et avoir son courriel confirmé ; sans identifiants, le tableau de bord est ignoré).
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3540";
const email = process.env.ACCOUNT_EMAIL;
const password = process.env.ACCOUNT_PASSWORD;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const pages = [
  ["connexion", "/compte/connexion"],
  ["inscription", "/compte/inscription"],
  ["mot de passe oublié", "/compte/mot-de-passe-oublie"],
  ["réinitialisation", "/compte/reinitialiser?token=x"],
  ["vérification", "/compte/verification"],
  ["tableau de bord", "/compte"],
];

for (const lang of ["fr", "en"]) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    if (email && password) {
      const res = await context.request.post(`${base}/api/auth/sign-in/email`, {
        data: { email, password },
        headers: { origin: base },
      });
      if (!res.ok()) console.log(`(connexion du compte d'essai refusée : ${res.status()})`);
    }
    for (const [label, path] of pages) {
      if (path === "/compte" && !(email && password)) continue;
      const page = await context.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(base + (lang === "en" ? `/en${path}` : path), { waitUntil: "networkidle" });
      const tag = `${lang}@${width} ${label}`;
      check(`${tag} : <html lang> correct`, (await page.getAttribute("html", "lang")) === (lang === "fr" ? "fr-CA" : "en-CA"));
      check(`${tag} : un seul h1`, (await page.locator("h1").count()) === 1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${tag} : pas de défilement horizontal`, overflow <= 0, `débordement ${overflow}px`);
      check(`${tag} : aucune erreur console`, errors.length === 0, errors.join(" | ").slice(0, 300));
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      // Même critère que verify-ui.mjs : seules les violations sérieuses ou critiques échouent ; les
      // autres sont listées (l'en-tête partagé porte par exemple deux repères « Language » en en-CA).
      const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      check(`${tag} : axe sans violation sérieuse ou critique`, serious.length === 0, `${violations.length} violation(s) au total`);
      for (const v of violations) console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
      await page.close();
    }
    await context.close();
  }
}
await browser.close();
if (failed > 0) {
  console.log(`\n${failed} vérification(s) en échec`);
  process.exit(1);
}
console.log("\nToutes les vérifications passent");
