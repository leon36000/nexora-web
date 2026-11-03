// Phase 3 : le client se reconnecte, lit son panneau VPS et agit (arrêt, démarrage, redémarrage).
import { randomBytes } from "node:crypto";
const { BASE, SITE_URL: SITE, EMAIL, PASSWORD, INSTANCE, ACTIONS } = process.env;
const call = (path, body, cookie, extra = {}) => fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", redirect: "manual",
  headers: { "content-type": "application/json", accept: "application/json", origin: SITE, ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
let r = await call("/api/auth/sign-in/email", { email: EMAIL, password: PASSWORD });
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
console.log("connexion", r.status);
const page = async () => {
  const p = await fetch(`${BASE}/fr/compte/vps`, { headers: { cookie, accept: "text/html" } });
  const html = await p.text();
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const i = text.search(/10\.77\.0\.\d+/);
  console.log("panneau", p.status, i >= 0 ? text.slice(Math.max(0, i - 220), i + 160) : "(adresse absente) " + text.slice(0, 200));
};
await page();
for (const action of (ACTIONS || "").split(",").filter(Boolean)) {
  r = await call(`/api/account/vps/${INSTANCE}/action`, { action, confirm: true, requestId: `act-${action}-${randomBytes(4).toString("hex")}` }, cookie);
  console.log("action", action, r.status, await r.text());
  await new Promise((s) => setTimeout(s, Number(process.env.WAIT_MS || 20000)));
  await page();
}
