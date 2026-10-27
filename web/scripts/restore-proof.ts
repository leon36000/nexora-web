#!/usr/bin/env bun
// Preuve « le site démarre sur la base RESTAURÉE » (S9) : deux temps, deux serveurs.
//
//   seed  : sur un site de production (BASE_URL, SITE_URL = BASE_URL) branché sur la base source (DATABASE_URL) :
//           inscrit un client de test (courriel vérifié par Mailpit), le crédite (crédit de TEST du grand livre),
//           lui crée une clé nxk_ et écrit l'état attendu dans PROOF_FILE (0600 : il contient un mot de passe et une
//           clé de TEST).
//   check : sur un site branché sur la base RESTAURÉE : connexion du même client, lecture du solde affiché dans
//           /compte, du catalogue de /modeles, et acceptation de sa clé par /v1/models ; comparaison avec PROOF_FILE.
//
//   BASE_URL=http://localhost:3746 PROOF_FILE=/chemin/proof.json bun web/scripts/restore-proof.ts seed|check
// DÉVELOPPEMENT SEULEMENT (crédit de test). Aucun secret affiché.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createDb, eq, getAccount, members, users } from "@nexora/db";
import { chromium } from "@playwright/test";
import { grantTestCredit } from "../src/server/gateway/dev-credit";
import { createApiKey } from "../src/server/gateway/keys";

const mode = process.argv[2];
const BASE = (process.env.BASE_URL ?? "http://localhost:3746").replace(
  /\/+$/,
  "",
);
const MAIL = process.env.MAILPIT_URL ?? "http://127.0.0.1:8026";
const FILE = process.env.PROOF_FILE;
if (!FILE || (mode !== "seed" && mode !== "check")) {
  console.error(
    "Usage : PROOF_FILE=… BASE_URL=… bun web/scripts/restore-proof.ts seed|check",
  );
  process.exit(2);
}

const post = (path: string, body: unknown) =>
  fetch(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(body),
  });
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(
    `${ok ? "OK   " : "ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures += 1;
};

if (mode === "seed") {
  const env = process.env;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL absent");
  const stamp = Date.now().toString(36);
  const email = `restauration-${stamp}@exemple.ca`;
  const password = `Essai-${stamp}-un-mot-de-passe-solide`;
  const up = await post("/sign-up/email", {
    email,
    password,
    name: "Client de restauration",
    company: `Restauration ${stamp}`,
    locale: "fr",
    callbackURL: "/compte/verification",
  });
  if (!up.ok) throw new Error(`inscription : ${up.status}`);
  let text = "";
  for (let i = 0; i < 40 && !text; i++) {
    const s = (await (
      await fetch(
        `${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      )
    ).json()) as { messages?: { ID: string }[] };
    if (s.messages?.[0])
      text = (
        (await (
          await fetch(`${MAIL}/api/v1/message/${s.messages[0].ID}`)
        ).json()) as { Text: string }
      ).Text;
    else await new Promise((r) => setTimeout(r, 250));
  }
  const link = /https?:\/\/\S+verify-email\S*/.exec(text)?.[0];
  if (!link) throw new Error("lien de vérification absent");
  const u = new URL(link);
  await fetch(`${BASE}${u.pathname}${u.search}`, { redirect: "manual" });
  check(
    (await post("/sign-in/email", { email, password })).ok,
    "client de test inscrit, vérifié et connecté",
  );
  const handle = createDb(env.DATABASE_URL, { max: 2 });
  const [user] = await handle.db
    .select()
    .from(users)
    .where(eq(users.email, email));
  const [member] = await handle.db
    .select()
    .from(members)
    .where(eq(members.userId, user?.id as string));
  const organizationId = member?.organizationId as string;
  await grantTestCredit(
    handle.db,
    { organizationId, amountMicro: 7_250_000n, label: `restauration-${stamp}` },
    { ...env, NODE_ENV: "development" },
  );
  const account = await getAccount(handle.db, organizationId);
  const created = await createApiKey(handle.db, {
    organizationId,
    name: "Clé de restauration",
    createdBy: user?.id as string,
    rpmLimit: 60,
    tpmLimit: 100_000,
    spendCapMicro: null,
  });
  await handle.close();
  const state = {
    email,
    password,
    organizationId,
    availableMicro: String(account.availableMicro),
    apiKey: created.key,
    keyPrefix: created.record.prefix,
  };
  writeFileSync(FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  check(
    true,
    "solde et clé créés",
    `solde ${account.availableMicro} µCAD, clé ${created.record.prefix}…`,
  );
} else {
  if (!existsSync(FILE)) throw new Error("PROOF_FILE absent");
  const s = JSON.parse(readFileSync(FILE, "utf8")) as {
    email: string;
    password: string;
    availableMicro: string;
    apiKey: string;
    keyPrefix: string;
  };
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    baseURL: BASE,
  });
  const login = await context.request.post("/api/auth/sign-in/email", {
    headers: { origin: BASE, "content-type": "application/json" },
    data: { email: s.email, password: s.password },
  });
  check(
    login.ok(),
    "le même client se connecte sur le site branché sur la base restaurée",
  );
  const page = await context.newPage();
  await page.goto("/compte", { waitUntil: "networkidle" });
  const shown = (await page.getByTestId("balance").first().innerText())
    .replace(/\s+/g, " ")
    .trim();
  const expected = Number(BigInt(s.availableMicro)) / 1_000_000;
  const digits = shown.replace(/[^\d,.]/g, "").replace(",", ".");
  check(
    Math.abs(Number.parseFloat(digits) - expected) < 0.005,
    "le solde affiché dans /compte est celui d'avant la sauvegarde",
    `affiché « ${shown} », attendu ${expected.toFixed(2)} $`,
  );
  check(
    (await page.getByText(`${s.keyPrefix}…`).count()) > 0,
    "la clé API du client est listée (préfixe)",
    s.keyPrefix,
  );
  const catalogue = await context.request.get("/modeles");
  const html = await catalogue.text();
  check(
    catalogue.ok() && html.includes("GLM 5.3"),
    "le catalogue /modeles affiche le modèle publié",
  );
  const models = await fetch(`${BASE}/v1/models`, {
    headers: { authorization: `Bearer ${s.apiKey}` },
  });
  check(
    models.status === 200,
    "la clé du client est acceptée par /v1/models (empreinte lue dans la base restaurée)",
    `HTTP ${models.status}`,
  );
  const bad = await fetch(`${BASE}/v1/models`, {
    headers: { authorization: `Bearer ${s.apiKey.slice(0, -2)}xx` },
  });
  check(
    bad.status === 401,
    "une clé altérée reste refusée",
    `HTTP ${bad.status}`,
  );
  await browser.close();
}
console.log(failures === 0 ? "\nTOUT EST VERT" : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
