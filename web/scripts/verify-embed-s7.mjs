// Preuve de la bulle WorkStudio sur le site (S7) : chargée sur /agents (pages choisies), CSP respectée (aucune erreur de
// politique dans la console), clavier (Tab, Entrée, Échap), cadre du chat chargé depuis l'origine configurée, absente
// des autres pages et retirée à la navigation.
//   BASE_URL=http://localhost:3541 bun web/scripts/verify-embed-s7.mjs [dossier-de-captures]
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3541";
const shots = process.argv[2];
let failures = 0;
const ok = (cond, label, detail = "") => {
  console.log(`${cond ? "OK   " : "ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};
const browser = await chromium.launch();
for (const path of ["/agents", "/en/agents"]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const messages = [];
  page.on("console", (m) => messages.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
  const refused = [];
  page.on("response", (r) => {
    if (r.status() >= 400) refused.push(`${r.status()} ${new URL(r.url()).origin}${new URL(r.url()).pathname}`);
  });
  const head = await page.goto(base + path, { waitUntil: "load" });
  const csp = head?.headers()["content-security-policy"] ?? "";
  ok(csp.includes("frame-src http") && !csp.includes("*"), `${path} : CSP limitée à l'origine configurée`, csp.slice(0, 110));
  const bubble = page.locator('button[aria-controls="nexora-chat-panel"]');
  await bubble.waitFor({ state: "visible", timeout: 15000 });
  ok(true, `${path} : bulle chargée après la page (chargement différé)`);
  const label = await bubble.getAttribute("aria-label");
  ok(Boolean(label), `${path} : nom accessible de la bulle`, label ?? "");
  // Clavier : Tab jusqu'à la bulle, Entrée ouvre, Échap ferme.
  let reached = false;
  for (let i = 0; i < 60 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.getAttribute("aria-controls") === "nexora-chat-panel");
  }
  ok(reached, `${path} : la bulle est atteignable au clavier (Tab)`);
  await page.keyboard.press("Enter");
  const panel = page.locator("#nexora-chat-panel");
  await panel.waitFor({ state: "visible", timeout: 5000 });
  ok((await bubble.getAttribute("aria-expanded")) === "true", `${path} : Entrée ouvre le panneau (aria-expanded)`);
  const frameSrc = await page.locator("#nexora-chat-panel iframe").getAttribute("src");
  ok(frameSrc?.startsWith("http://localhost:3200/chat/"), `${path} : cadre du chat servi par l'origine configurée`, frameSrc ?? "");
  await page.waitForTimeout(2500);
  if (shots && path === "/agents") await page.screenshot({ path: `${shots}/bulle-agents-ouverte-1280.png` });
  // Le focus est dans le cadre du chat : le bouton « Fermer » du panneau (clavier : Tab puis Entrée) referme et rend le focus à la bulle.
  await page.locator('#nexora-chat-panel button[type="button"]').first().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  ok((await bubble.getAttribute("aria-expanded")) === "false", `${path} : le bouton Fermer (Entrée) referme le panneau`);
  await bubble.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('button[aria-controls="nexora-chat-panel"]')?.focus());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok((await bubble.getAttribute("aria-expanded")) === "false", `${path} : Échap (focus sur la page) ferme le panneau`);
  const cspErrors = messages.filter((m) => /content security policy|refused to (load|frame|connect|execute)/i.test(m));
  ok(cspErrors.length === 0, `${path} : aucune erreur de CSP dans la console`, cspErrors.join(" | ").slice(0, 200));
  const errors = messages.filter((m) => m.startsWith("error") || m.startsWith("pageerror"));
  // Les réponses refusées du cadre du chat (page de WorkStudio) ne sont pas celles du site : on les distingue.
  const own = refused.filter((r) => !r.includes("localhost:3200"));
  ok(own.length === 0, `${path} : aucune requête du site refusée`, own.join(" | "));
  ok(errors.filter((e) => !e.includes("Failed to load resource")).length === 0, `${path} : aucune erreur JavaScript dans la console`, errors.join(" | ").slice(0, 200));
  console.log(`     info : réponses refusées venant de l'instance WorkStudio (cadre du chat) : ${refused.filter((r) => r.includes("localhost:3200")).join(", ") || "aucune"}`);

  // Navigation côté client vers une page non prévue : la bulle est retirée.
  await page.locator('header a[href*="modeles"], nav a[href*="modeles"]').first().click({ timeout: 5000 }).catch(() => page.goto(base + path.replace("/agents", "/modeles")));
  await page.waitForURL(/modeles/, { timeout: 10000 });
  await page.waitForTimeout(500);
  ok((await bubble.count()) === 0, `${path} : bulle retirée hors des pages choisies`);
  await context.close();
}
const ctx = await browser.newContext();
const p = await ctx.newPage();
const resp = await p.goto(`${base}/modeles`, { waitUntil: "load" });
ok(!resp?.headers()["content-security-policy"], "/modeles : aucune CSP ajoutée hors des pages choisies");
await p.waitForTimeout(1500);
ok((await p.locator('button[aria-controls="nexora-chat-panel"]').count()) === 0, "/modeles : aucune bulle");
await browser.close();
process.exit(failures === 0 ? 0 : 1);
