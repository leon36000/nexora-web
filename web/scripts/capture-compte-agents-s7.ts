#!/usr/bin/env bun
// Capture de l'espace client avec la consommation par agent (S7) : compte d'essai local (inscription par l'API,
// courriel marqué vérifié en base de DÉVELOPPEMENT), crédit de TEST, deux appels réels à agent/<slug>, puis
// captures de /compte (fr, en) à 390 et 1440 px et axe-core.
//   AGENT=assistant-general BASE_URL=http://localhost:3541 bun web/scripts/capture-compte-agents-s7.ts <dossier>
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { createDb, eq, members, users } from "@nexora/db";
import { chromium } from "@playwright/test";
import { grantTestCredit } from "../src/server/gateway/dev-credit";
import { createApiKey } from "../src/server/gateway/keys";

const base = (process.env.BASE_URL ?? "http://localhost:3541").replace(
  /\/+$/,
  "",
);
const agent = process.env.AGENT ?? "assistant-general";
const out = process.argv[2];
const env: Record<string, string> = {};
for (const l of readFileSync(
  fileURLToPath(new URL("../.env.local", import.meta.url)),
  "utf8",
).split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m) env[m[1] as string] = m[2] as string;
}
const handle = createDb(env.DATABASE_URL as string, { max: 2 });
const db = handle.db;

const email = `essai-s7-${randomBytes(4).toString("hex")}@exemple.test`;
const password = randomBytes(18).toString("base64url");
const signup = await fetch(`${base}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({
    email,
    password,
    name: "Essai S7",
    company: "Entreprise d’essai S7",
    locale: "fr",
  }),
});
if (!signup.ok) throw new Error(`inscription refusée : ${signup.status}`);
await db
  .update(users)
  .set({ emailVerified: true })
  .where(eq(users.email, email));
const [user] = await db.select().from(users).where(eq(users.email, email));
const [member] = await db
  .select()
  .from(members)
  .where(eq(members.userId, user?.id as string));
const org = member?.organizationId as string;
await grantTestCredit(db, {
  organizationId: org,
  amountMicro: 5_000_000n,
  label: `compte-s7-${email}`,
});
const { key } = await createApiKey(db, {
  organizationId: org,
  name: "Essai S7",
});
for (const stream of [false, true]) {
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: `agent/${agent}`,
      stream,
      messages: [{ role: "user", content: "Bonjour, en cinq mots." }],
    }),
  });
  await r.text();
  console.log(`appel ${stream ? "diffusé" : "non diffusé"} : HTTP ${r.status}`);
}

const TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];
let failed = 0;
const browser = await chromium.launch();
for (const path of ["/compte", "/en/compte"]) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      baseURL: base,
    });
    const login = await context.request.post("/api/auth/sign-in/email", {
      headers: { origin: base, "content-type": "application/json" },
      data: { email, password },
    });
    if (!login.ok()) throw new Error("connexion refusée");
    const page = await context.newPage();
    await page.goto(path, { waitUntil: "networkidle" });
    const heading = page.getByRole("heading", {
      name: /Consommation des agents|Agent consumption/,
    });
    const rows = await page
      .locator("table", { hasText: `agent/${agent}` })
      .locator("tbody tr")
      .count();
    const { violations } = await new AxeBuilder({ page })
      .withTags(TAGS)
      .analyze();
    const ok =
      (await heading.isVisible()) && rows >= 1 && violations.length === 0;
    if (!ok) failed += 1;
    console.log(
      `${ok ? "OK   " : "ÉCHEC"} ${path} @${width} : tableau des agents visible (${rows} ligne(s)), ${violations.length} violation(s) axe`,
    );
    for (const v of violations)
      console.log(`       - [${v.impact}] ${v.id}: ${v.help}`);
    if (out) {
      await heading.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${out}/compte-agents-${path.replace(/^\//, "").replace("/", "-") || "fr"}-${width}.png`,
        fullPage: true,
      });
    }
    await context.close();
  }
}
await browser.close();
await handle.close();
process.exit(failed === 0 ? 0 : 1);
