// Phase 1 : inscription d'un client de test, courriel vérifié (Mailpit), connexion, commande + Checkout (stripe-mock).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const BASE = process.env.BASE, SITE = process.env.SITE_URL, MAIL = "http://mailpit:8025";
const plan = process.env.PLAN, term = process.env.TERM_ || "month";
const sshKey = readFileSync("/run/e2e.pub", "utf8").trim();
const email = `e2e-vps-${randomBytes(4).toString("hex")}@nexora.test`;
const password = `Vps-${randomBytes(9).toString("base64url")}-Zq7!`;
const call = (path, body, cookie) => fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", redirect: "manual",
  headers: { "content-type": "application/json", origin: SITE, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
let r = await call("/api/auth/sign-up/email", { email, password, name: "Client Essai VPS", company: "Essai VPS pc5", locale: "fr", callbackURL: "/compte/verification" });
console.log("inscription", r.status);
let link;
for (let i = 0; i < 20 && !link; i++) {
  await new Promise((s) => setTimeout(s, 1000));
  const list = await (await fetch(`${MAIL}/api/v1/search?query=to:${email}`)).json();
  const id = list.messages?.[0]?.ID;
  if (id) { const m = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json(); link = /https?:\/\/\S+verify-email\S*/.exec(m.Text || "")?.[0]; }
}
if (!link) { console.log("pas de courriel de vérification"); process.exit(1); }
const u = new URL(link);
r = await fetch(`${BASE}${u.pathname}${u.search}`, { redirect: "manual", headers: { origin: SITE } });
console.log("vérification du courriel", r.status);
r = await call("/api/auth/sign-in/email", { email, password });
console.log("connexion", r.status);
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
r = await call("/api/vps/checkout", { plan, app: "serveur-nu", term, sshKey, requestId: `e2e-pc5-${randomBytes(4).toString("hex")}`, lang: "fr" }, cookie);
const out = await r.json().catch(() => ({}));
console.log("checkout", r.status, JSON.stringify(out));
console.log("EMAIL", email); console.log("PASSWORD", password);
