import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { chromium } from "@playwright/test";
const OUT = "/tmp/claude-1000/-home-pc6-Desktop-Nexora-Studio/e8c957db-5c05-499a-8980-d742c3991fc0/scratchpad/qa";
const BASE = "http://localhost:3601";
const PW = readFileSync(`${homedir()}/.config/nexora/essai-sso.pw`, "utf8").trim();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "fr-CA" });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url().replace(BASE, "")} ${m.text().slice(0, 140)}`); });
page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("favicon")) errors.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
await page.goto(`${BASE}/compte/connexion`, { waitUntil: "networkidle" });
await page.fill("#email", "essai-sso@nexora.test");
await page.fill("#password", PW);
const signIn = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"), { timeout: 30000 });
await page.locator("form button[type=submit]").click();
const res = await signIn;
console.log("connexion :", res.status(), (await res.text()).slice(0, 160));
await page.waitForURL((u) => !u.pathname.includes("connexion"), { timeout: 30000 });
const pages = ["/compte", "/compte/facturation", "/compte/modeles", "/compte/activite", "/compte/confidentialite", "/compte/workstudio", "/compte/securite"];
for (const p of pages) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/${p.replace(/\//g, "_")}.png`, fullPage: true });
  console.log("ok", p, page.url().replace(BASE, ""), (await page.title()).slice(0, 60));
}
await page.setViewportSize({ width: 390, height: 844 });
for (const p of ["/compte", "/compte/facturation"]) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/mobile${p.replace(/\//g, "_")}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log("mobile", p, "débordement horizontal :", overflow);
}
console.log("erreurs :", errors.length ? "\n" + errors.slice(0, 15).join("\n") : "aucune");
await browser.close();
