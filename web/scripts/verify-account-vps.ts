#!/usr/bin/env bun
// Rendu réel de /compte/vps (S6) : inscrit un client de test (courriel vérifié par Mailpit), lui crée une
// commande et deux VPS d'essai directement en base (actif et suspendu), puis charge la page avec axe, à 390 et 1440 px.
//   BASE_URL=http://localhost:3500 bun web/scripts/verify-account-vps.ts [dossier-de-captures]
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { createDb, eq, members, users, vpsEvents, vpsInstances, vpsOrders } from "@nexora/db";
import { createOrder } from "@nexora/vps";

const env: Record<string, string> = {};
const f = fileURLToPath(new URL("../.env.local", import.meta.url));
if (existsSync(f)) for (const l of readFileSync(f, "utf8").split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(l); if (m) env[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, ""); }
const BASE = process.env.BASE_URL ?? "http://localhost:3500";
const MAIL = "http://127.0.0.1:8026";
const email = `vps-ui-${Date.now()}@example.com`;
const PASSWORD = "un-mot-de-passe-solide-42";
const post = (path: string, body: unknown) => fetch(`${BASE}/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) });

const up = await post("/sign-up/email", { email, password: PASSWORD, name: "Camille Tremblay", company: "Tremblay et fils", locale: "fr", callbackURL: "/compte/verification" });
if (!up.ok) throw new Error(`inscription : ${up.status}`);
let text = "";
for (let i = 0; i < 40 && !text; i++) {
  const s = (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as { messages?: { ID: string }[] };
  if (s.messages?.[0]) text = ((await (await fetch(`${MAIL}/api/v1/message/${s.messages[0].ID}`)).json()) as { Text: string }).Text;
  else await new Promise((r) => setTimeout(r, 250));
}
const link = /https?:\/\/\S+verify-email\S*/.exec(text)?.[0];
if (!link) throw new Error("lien de vérification absent");
const u = new URL(link);
await fetch(`${BASE}${u.pathname}${u.search}`, { redirect: "manual" });
const login = await post("/sign-in/email", { email, password: PASSWORD });
if (!login.ok) throw new Error(`connexion : ${login.status}`);
const cookies = login.headers.getSetCookie().map((c) => c.split(";")[0] as string);

const { db, close } = createDb(env.DATABASE_URL as string, { max: 2 });
const [user] = await db.select().from(users).where(eq(users.email, email));
const [member] = await db.select().from(members).where(eq(members.userId, user?.id as string));
const org = member?.organizationId as string;
const { vpsPlans, vpsApps } = await import("@nexora/db");
const [plan] = await db.select().from(vpsPlans).where(eq(vpsPlans.code, "dev-essai-2"));
const [app] = await db.select().from(vpsApps).where(eq(vpsApps.code, "ollama-anythingllm"));
if (!plan || !app) throw new Error("catalogue de développement absent : bun run vps:seed -- --dev --stripe");
const { getPublishedCatalog } = await import("@nexora/vps");
const catalog = await getPublishedCatalog(db);
const KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
for (const [i, status] of (["active", "suspended"] as const).entries()) {
  const { order } = await createOrder(db, { organizationId: org, idempotencyKey: `ui-${email}-${i}`, planCode: plan.code, appCode: app.code, term: "month", sshPublicKey: KEY, maxPerOrganization: 9 }).catch(async () => {
    throw new Error("commande impossible (le catalogue doit être synchronisé avec Stripe)");
  });
  await db.update(vpsOrders).set({ status: "fulfilled", paidAt: new Date(), stripeSubscriptionId: `sub_ui_${i}_${Date.now()}` }).where(eq(vpsOrders.id, order.id));
  const [inst] = await db.insert(vpsInstances).values({ orderId: order.id, organizationId: org, vcpu: 2, ramMb: 4096, diskGb: 80, planCode: plan.code, appCode: app.code, appVersion: app.version, catalogVersionId: catalog?.id as string, vmName: `nx-${order.id.slice(0, 8)}`, ipv4: `10.20.0.${50 + i}`, status, step: "done", power: status === "active" ? "running" : "stopped", activatedAt: new Date(), sshHostKeyFingerprint: "SHA256:SIMULATED" }).returning();
  await db.insert(vpsEvents).values([{ organizationId: org, orderId: order.id, instanceId: inst?.id, actor: "worker", kind: "active", message: "VPS actif" }, { organizationId: org, orderId: order.id, instanceId: inst?.id, actor: "system", kind: "provision_started", message: "provisionnement démarré" }]);
}
await close();

const browser = await chromium.launch();
const shots = process.argv[2];
let bad = 0;
for (const path of ["/compte/vps", "/en/compte/vps"]) {
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addCookies(cookies.map((c) => { const [name, ...v] = c.split("="); return { name: name as string, value: v.join("="), url: BASE }; }));
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const cards = await page.locator("article, [data-vps-card]").count();
    console.log(`${violations.length === 0 && !overflow ? "OK   " : "ÉCHEC"} ${path} @${width} : ${violations.length} violation(s), ${cards} carte(s)${overflow ? ", DÉFILEMENT HORIZONTAL" : ""}`);
    for (const v of violations) {
      console.log(`       - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`);
      if (process.env.DETAIL) console.log(JSON.stringify(v.nodes[0]?.any?.[0]?.data), v.nodes[0]?.html.slice(0, 200));
    }
    bad += violations.length + (overflow ? 1 : 0);
    if (shots) await page.screenshot({ path: `${shots}/compte-vps${path.startsWith("/en") ? "-en" : ""}-${width}.png`, fullPage: true });
    await ctx.close();
  }
}
await browser.close();
process.exit(bad === 0 ? 0 : 1);
