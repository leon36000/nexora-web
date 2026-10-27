// Essai de l'espace client de la passerelle (S5) dans un navigateur : création d'une clé (valeur affichée
// une seule fois), liste, révocation, section d'usage, axe-core (WCAG 2.2 AA) en fr et en, à 390 et 1440 px.
// Usage : BASE_URL=http://localhost:3510 ACCOUNT_EMAIL=… ACCOUNT_PASSWORD=… bun web/scripts/verify-gateway-account.mjs
// (le compte doit exister, avoir son courriel confirmé et être propriétaire de son organisation).
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3510";
const email = process.env.ACCOUNT_EMAIL;
const password = process.env.ACCOUNT_PASSWORD;
if (!email || !password) {
  console.error("ACCOUNT_EMAIL et ACCOUNT_PASSWORD sont requis.");
  process.exit(1);
}
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: base });
const login = await context.request.post("/api/auth/sign-in/email", {
  headers: { origin: base, "content-type": "application/json" },
  data: { email, password },
});
check("connexion par l'API", login.ok());
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

await page.goto("/compte", { waitUntil: "networkidle" });
const heading = page.getByRole("heading", { name: "Clés API", level: 2 });
check("section « Clés API » affichée", await heading.isVisible());

// Création : la valeur n'apparaît qu'une fois.
await page.getByLabel("Nom de la clé").fill("Essai navigateur");
await page.getByLabel(/Plafond de dépense/).fill("12,50");
await page.getByRole("button", { name: "Créer la clé" }).click();
const field = page.getByTestId("new-key");
await field.waitFor({ timeout: 10_000 });
const value = await field.inputValue();
check("la clé nxk_… est affichée à la création", /^nxk_[A-Za-z0-9_-]{43}$/.test(value));
const prefix = value.slice(0, 11);
await page.getByRole("button", { name: "J’ai copié la clé" }).click();
await page.waitForLoadState("networkidle");
check("la valeur disparaît après fermeture", (await page.getByTestId("new-key").count()) === 0 && !(await page.content()).includes(value));
await page.reload({ waitUntil: "networkidle" });
check("après rechargement, seul le préfixe est visible", !(await page.content()).includes(value.slice(4)) && (await page.getByText(`${prefix}…`).count()) > 0, prefix);

// La clé fonctionne sur /v1 (modèle publié) puis, révoquée, est refusée.
const call = () =>
  fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${value}` } }).then((r) => r.status);
check("la clé est acceptée par /v1/models", (await call()) === 200);

// Axe sur le compte (avec la section), fr et en, deux largeurs.
for (const path of ["/compte", "/en/compte"]) {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path, { waitUntil: "networkidle" });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`axe ${path} @${width}`, violations.length === 0 && overflow <= 0, `${violations.length} violation(s), débordement ${overflow}px`);
    for (const v of violations) console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  }
}

// Révocation.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("/compte", { waitUntil: "networkidle" });
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "Révoquer la clé Essai navigateur" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Révoquée"), null, { timeout: 10_000 });
check("la clé apparaît « Révoquée »", true);
check("la clé révoquée est refusée (401)", (await call()) === 401);

check("aucune erreur console", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
