// E2E du formulaire de contact (S3) : navigateur réel -> ligne en base -> tâche -> courriel dans Mailpit.
//
//   BASE_URL=http://localhost:3500 bun web/scripts/e2e-contact.ts
//
// Étapes : (1) soumission par le navigateur (ALTCHA résolu pour de vrai) ; (2) ligne dans `leads` et tâche
// `contact.notify` ; (3) échec d'envoi (worker avec un SMTP injoignable) : la demande est conservée et la tâche
// reprend ; (4) reprise avec le bon SMTP : UN courriel dans Mailpit ; (5) renvoi identique : « déjà enregistrée »,
// toujours une ligne et un courriel ; (6) abus : sans preuve et champ piège. Nettoie ses lignes et ses courriels.
// Aucun secret affiché. Le worker est lancé et arrêté par son PID.

import { type ChildProcess, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, eq, jobs, leads } from "@nexora/db";
import { loadRootEnv } from "@nexora/db/env";
import { chromium } from "@playwright/test";

loadRootEnv();
const base = process.env.BASE_URL ?? "http://localhost:3500";
const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:8026";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL absent");
const handle = createDb(url, { max: 2 });
const db = handle.db;

const stamp = Date.now().toString(36);
const company = `Essai S3 ${stamp}`;
const email = `essai-${stamp}@exemple.ca`;
let ok = 0;
let ko = 0;
const check = (name: string, pass: boolean, detail = "") => {
  if (pass) ok++;
  else ko++;
  console.log(
    `${pass ? "OK   " : "ÉCHEC"} ${name}${detail ? ` — ${detail}` : ""}`,
  );
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(
  fn: () => Promise<T | null | false>,
  timeoutMs: number,
  every = 300,
): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  return null;
}

type MailpitMessage = {
  ID: string;
  Subject: string;
  To: { Address: string }[];
};
async function mailsFor(needle: string): Promise<MailpitMessage[]> {
  const res = await fetch(`${mailpit}/api/v1/messages?limit=200`);
  const body = (await res.json()) as { messages: MailpitMessage[] };
  return body.messages.filter((m) => m.Subject.includes(needle));
}

let worker: ChildProcess | null = null;
function startWorker(extraEnv: Record<string, string>): ChildProcess {
  const child = spawn("node", ["src/main.ts"], {
    cwd: join(root, "worker"),
    env: { ...process.env, WORKER_POLL_MS: "300", ...extraEnv },
    stdio: "ignore",
  });
  worker = child;
  return child;
}
async function stopWorker() {
  if (!worker?.pid) return;
  const w = worker;
  worker = null;
  w.kill("SIGTERM");
  await new Promise((r) => w.once("exit", r));
}

const leadRows = () =>
  db.select().from(leads).where(eq(leads.company, company));

async function fillAndSubmit(
  page: import("@playwright/test").Page,
  over: { website?: string } = {},
) {
  await page.goto(`${base}/contact`, { waitUntil: "load" });
  await page.getByLabel("Un diagnostic pour cerner mon besoin").waitFor();
  await page.getByLabel("Un diagnostic pour cerner mon besoin").check();
  await page
    .getByLabel("Votre secteur d'activité")
    .selectOption("construction");
  await page.getByLabel("Hébergé au Québec par Nexora").check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Votre nom").fill("Julie Essai");
  await page.getByLabel("Votre courriel").fill(email);
  await page.getByLabel("Votre entreprise").fill(company);
  await page
    .getByLabel("Votre message")
    .fill("Message d'essai.\nDeuxième ligne.");
  if (over.website !== undefined)
    await page.locator('input[name="website"]').evaluate((el, v) => {
      (el as HTMLInputElement).value = v;
    }, over.website);
  // la preuve de travail se calcule dans le navigateur : on attend la case vérifiée
  await page
    .locator("altcha-widget input[type=checkbox]")
    .first()
    .check({ timeout: 15_000 })
    .catch(() => {});
  await page.waitForFunction(
    () => {
      const el = document.querySelector("altcha-widget") as
        | (HTMLElement & { getState?: () => string })
        | null;
      return el?.getState?.() === "verified";
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
}

const browser = await chromium.launch();
try {
  // --- (1) soumission réelle ---
  const context = await browser.newContext();
  const page = await context.newPage();
  // la case du consentement marketing n'est pas cochée d'avance
  await page.goto(`${base}/contact`, { waitUntil: "load" });
  await page.getByLabel("Un diagnostic pour cerner mon besoin").waitFor();
  await page.getByLabel("Un diagnostic pour cerner mon besoin").check();
  await page
    .getByLabel("Votre secteur d'activité")
    .selectOption("construction");
  await page.getByLabel("Hébergé au Québec par Nexora").check();
  await page.getByRole("button", { name: "Continuer" }).click();
  const consent = page.getByLabel(
    "Je souhaite aussi recevoir des nouvelles de Nexora par courriel.",
  );
  check(
    "consentement marketing décoché par défaut",
    !(await consent.isChecked()),
  );
  await fillAndSubmit(page);
  await page.getByText("Demande enregistrée.").waitFor({ timeout: 20_000 });
  const confirmation = (
    await page.locator("[role=status]").innerText()
  ).replace(/\s+/g, " ");
  check(
    "page de confirmation honnête",
    /enregistrée/.test(confirmation) &&
      !/\d+\s*(h|heures|jours)/i.test(confirmation),
    confirmation.slice(0, 120),
  );

  // --- (2) ligne en base et tâche ---
  const rows = await leadRows();
  check("une seule ligne dans leads", rows.length === 1);
  const lead = rows[0];
  check(
    "contenu enregistré",
    lead?.email === email &&
      lead?.need === "diagnostic" &&
      lead?.deployment === "heberge" &&
      lead?.marketingConsent === false &&
      lead?.notifiedAt === null,
  );
  const job = lead
    ? (
        await db
          .select()
          .from(jobs)
          .where(eq(jobs.idempotencyKey, `lead-notify:${lead.id}`))
      )[0]
    : undefined;
  check(
    "tâche contact.notify en file, sans renseignement personnel",
    job?.type === "contact.notify" &&
      JSON.stringify(job.payload) === JSON.stringify({ leadId: lead?.id }),
  );

  // --- (3) échec d'envoi : SMTP injoignable ---
  await startWorker({ SMTP_PORT: "1" }); // port fermé
  const failed = await waitFor(async () => {
    const j = (
      await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, job?.id ?? ""))
    )[0];
    return j && j.attempts >= 1 && j.lastError ? j : null;
  }, 15_000);
  await stopWorker();
  check(
    "échec d'envoi : la tâche note l'erreur et sera reprise",
    Boolean(failed) && failed?.status !== "dead",
    failed ? `essai ${failed.attempts}, état ${failed.status}` : "aucun essai",
  );
  const afterFail = (await leadRows())[0];
  check(
    "échec d'envoi : la demande reste conservée, non notifiée",
    afterFail?.notifiedAt === null,
  );
  check(
    "échec d'envoi : aucun courriel",
    (await mailsFor(company)).length === 0,
  );

  // --- (4) reprise avec le bon SMTP ---
  await startWorker({});
  const mail = await waitFor(
    async () => (await mailsFor(company))[0] ?? null,
    30_000,
    500,
  );
  check("courriel visible dans Mailpit", Boolean(mail), mail?.Subject);
  if (mail) {
    const full = (await (
      await fetch(`${mailpit}/api/v1/message/${mail.ID}`)
    ).json()) as { Text: string; ReplyTo: { Address: string }[] };
    check(
      "courriel : contenu et adresse de réponse",
      full.Text.includes("Julie Essai") &&
        full.Text.includes("Message d'essai.") &&
        full.ReplyTo?.[0]?.Address === email,
    );
  }
  const notified = await waitFor(
    async () => ((await leadRows())[0]?.notifiedAt ? true : null),
    10_000,
  );
  check("notified_at renseigné après l'envoi", Boolean(notified));
  await sleep(1500);
  check(
    "un seul courriel malgré la reprise",
    (await mailsFor(company)).length === 1,
  );
  await stopWorker();

  // --- (5) renvoi identique ---
  await fillAndSubmit(page);
  await page.getByText("déjà enregistrée").waitFor({ timeout: 20_000 });
  check("renvoi identique : « déjà enregistrée »", true);
  check(
    "renvoi identique : toujours une ligne",
    (await leadRows()).length === 1,
  );
  const jobsForLead = lead
    ? await db
        .select()
        .from(jobs)
        .where(eq(jobs.idempotencyKey, `lead-notify:${lead.id}`))
    : [];
  check("renvoi identique : toujours une tâche", jobsForLead.length === 1);

  // --- (6) abus ---
  const noProof = await fetch(`${base}/api/contact`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      need: "diagnostic",
      sector: "autre",
      deployment: "indecis",
      name: "Robot",
      email: `robot-${stamp}@exemple.ca`,
      company,
      message: "",
      lang: "fr",
    }),
  });
  check("sans preuve Altcha : 403", noProof.status === 403);
  const page2 = await context.newPage();
  await fillAndSubmit(page2, { website: "https://spam.example" });
  await page2.getByText("Demande enregistrée.").waitFor({ timeout: 20_000 });
  check(
    "champ piège rempli : rien d'enregistré",
    (await leadRows()).length === 1,
  );
} finally {
  await stopWorker();
  // nettoyage : ses lignes, ses tâches et ses courriels
  const mine = await leadRows();
  for (const l of mine) {
    await db.delete(jobs).where(eq(jobs.idempotencyKey, `lead-notify:${l.id}`));
    await db.delete(leads).where(eq(leads.id, l.id));
  }
  const ids = (await mailsFor(company)).map((m) => m.ID);
  if (ids.length > 0)
    await fetch(`${mailpit}/api/v1/messages`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ IDs: ids }),
    });
  await browser.close();
  await handle.close();
}
console.log(`\n${ok} vérification(s) réussie(s), ${ko} échec(s)`);
process.exit(ko === 0 ? 0 : 1);
