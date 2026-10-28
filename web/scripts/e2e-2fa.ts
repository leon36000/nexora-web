#!/usr/bin/env bun
// Parcours de la double authentification dans un NAVIGATEUR réel (vague 2, sécurité), sur un site de production lancé :
//   inscription (API) -> vérification du courriel (Mailpit) -> connexion par l'interface -> page /compte/securite ->
//   activation (mot de passe, QR, codes de secours, premier code) -> déconnexion -> connexion avec mot de passe PUIS
//   code à six chiffres -> espace client. Échoue aussi à la moindre violation de CSP ou erreur de console.
//   BASE_URL=http://localhost:3524 MAILPIT_URL=http://127.0.0.1:8026 bun web/scripts/e2e-2fa.ts [--capture dossier]
// Refuse toute adresse qui n'est pas locale. Crée un compte de test dans la base du site visé.
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = (process.env.BASE_URL ?? "http://localhost:3524").replace(
  /\/+$/,
  "",
);
const MAILPIT = (process.env.MAILPIT_URL ?? "http://127.0.0.1:8026").replace(
  /\/+$/,
  "",
);
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(BASE).hostname)) {
  console.error("Refusé : adresse non locale.");
  process.exit(2);
}
const capture = process.argv.includes("--capture")
  ? (process.argv[process.argv.indexOf("--capture") + 1] as string)
  : null;
if (capture) mkdirSync(capture, { recursive: true });

let failures = 0;
const say = (ok: boolean, label: string, detail = "") => {
  console.log(
    `${ok ? "OK   " : "ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures += 1;
};

function base32Bytes(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret: string, steps = 0): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + steps));
  const h = createHmac("sha1", base32Bytes(secret)).update(counter).digest();
  const o = (h[19] as number) & 0xf;
  const code =
    (((h[o] as number) & 0x7f) << 24) |
    (((h[o + 1] as number) & 0xff) << 16) |
    (((h[o + 2] as number) & 0xff) << 8) |
    ((h[o + 3] as number) & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

const PASSWORD = `Phrase-${randomBytes(6).toString("hex")}-Longue-2026`;
const email = `e2e-2fa-${randomBytes(4).toString("hex")}@example.com`;

// Compte vérifié (API + Mailpit).
const signup = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({
    email,
    password: PASSWORD,
    name: "Testeur Deux Facteurs",
    locale: "fr",
  }),
});
say(signup.status === 200, "inscription", `HTTP ${signup.status}`);
let link = "";
for (let i = 0; i < 20 && !link; i++) {
  const list = (await (
    await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    )
  ).json()) as { messages?: { ID: string }[] };
  const id = list.messages?.[0]?.ID;
  if (id) {
    const msg = (await (
      await fetch(`${MAILPIT}/api/v1/message/${id}`)
    ).json()) as {
      Text: string;
    };
    link =
      /https?:\/\/[^\s"<>]+verify-email[^\s"<>]*/.exec(msg.Text)?.[0] ?? "";
  }
  if (!link) await new Promise((r) => setTimeout(r, 300));
}
if (!link) {
  console.error("courriel de vérification introuvable");
  process.exit(1);
}
await fetch(link, { redirect: "manual" });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  serviceWorkers: "block",
});
const page = await context.newPage();
const problems: string[] = [];
page.on("console", (m) => {
  const t = m.text();
  if (
    /content security policy|refused to (load|connect|frame|execute)/i.test(t)
  )
    problems.push(`CSP : ${t.slice(0, 200)}`);
  else if (m.type() === "error" && !/status of (401|403|429)/.test(t))
    problems.push(`console : ${t.slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`erreur de page : ${e.message}`));

async function login() {
  await page.goto(`${BASE}/compte/connexion`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page
    .getByRole("button", { name: /connecter|sign in/i })
    .first()
    .click();
}

await login();
await page.waitForURL(/\/compte$/, { timeout: 20_000 });
say(true, "connexion par l'interface (sans second facteur)");

await page.goto(`${BASE}/compte/securite`, { waitUntil: "networkidle" });
say(
  (await page.textContent("h1"))?.includes("Sécurité du compte") === true,
  "page /compte/securite affichée",
);
if (capture)
  await page.screenshot({ path: join(capture, "securite-1-avant.png") });
await page.fill("#enable-password", PASSWORD);
await page.getByRole("button", { name: /commencer/i }).click();
await page.waitForSelector("svg[role=img]", { timeout: 20_000 });
say(true, "QR code affiché");
const secret = (
  await page.locator("code").first().textContent()
)?.trim() as string;
say(
  /^[A-Z2-7]{16,}$/.test(secret),
  "clé de configuration affichée",
  `${secret.length} caractères`,
);
const codes = await page.locator("ul[aria-label] li").allTextContents();
say(codes.length === 10, "dix codes de secours affichés", String(codes.length));
if (capture)
  await page.screenshot({
    path: join(capture, "securite-2-qr.png"),
    fullPage: true,
  });
await page.fill("#confirm-code", totp(secret, -1));
await page.getByRole("button", { name: /^activer$/i }).click();
await page.waitForSelector("text=la double authentification est activée", {
  timeout: 20_000,
});
say(true, "activation confirmée par le premier code");
if (capture)
  await page.screenshot({
    path: join(capture, "securite-3-active.png"),
    fullPage: true,
  });

// Déconnexion puis connexion à deux facteurs.
await page.goto(`${BASE}/compte`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /déconnecter/i }).click();
await page.waitForURL(/connexion/, { timeout: 20_000 });
await login();
await page.waitForSelector("#two-factor-code", { timeout: 20_000 });
say(true, "la connexion demande le code à six chiffres");
if (capture)
  await page.screenshot({ path: join(capture, "connexion-2fa.png") });
await page.fill("#two-factor-code", "000000");
await page.getByRole("button", { name: /vérifier/i }).click();
await page.waitForSelector("text=n’est pas valide", { timeout: 20_000 });
say(true, "un mauvais code est refusé avec un message");
await page.fill("#two-factor-code", totp(secret, 1));
await page.getByRole("button", { name: /vérifier/i }).click();
await page.waitForURL(/\/compte$/, { timeout: 20_000 });
say(true, "le bon code ouvre l'espace client");

say(
  problems.length === 0,
  "aucune violation de CSP ni erreur de console",
  problems.join(" | "),
);
await browser.close();
console.log(failures === 0 ? "\nTOUT EST VERT" : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
