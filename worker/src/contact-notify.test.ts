import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, jobs, leads } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger, type Logger } from "@nexora/log";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  composeNotification,
  createNotifyHandler,
  type Mail,
  type Mailer,
  mailerFromEnv,
} from "./contact-notify.ts";
import { HandlerRegistry } from "./registry.ts";
import { Worker } from "./worker.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(jobs);
  await t.db.delete(leads);
});

const silent: Logger = createLogger({ name: "test", sink: () => {} });
const ctx = { log: silent, signal: new AbortController().signal };
const job = (leadId: unknown, attempt = 1) => ({
  id: "j",
  type: "contact.notify",
  payload: { leadId },
  attempt,
  maxAttempts: 8,
});
const env = {
  CONTACT_NOTIFY_TO: "equipe@nexora.dev",
  SMTP_FROM: "site@nexora.dev",
};

async function newLead(over: Partial<typeof leads.$inferInsert> = {}) {
  const [row] = await t.db
    .insert(leads)
    .values({
      fingerprint: Math.random().toString(16),
      lang: "fr",
      need: "opsys-ai",
      sector: "construction",
      deployment: "heberge",
      name: "Marc Gagnon",
      email: "marc@exemple.ca",
      company: "Gagnon et fils",
      message: "Bonjour,\nnous voulons une démonstration.",
      marketingConsent: false,
      ...over,
    })
    .returning();
  if (!row) throw new Error("fixture");
  return row;
}

function recorder(failures = 0) {
  const sent: Mail[] = [];
  let left = failures;
  const mailer: Mailer = {
    async send(mail) {
      if (left > 0) {
        left--;
        throw new Error("connexion SMTP refusée (ECONNREFUSED)");
      }
      sent.push(mail);
    },
  };
  return { mailer, sent };
}

describe("courriel de notification à l'équipe", () => {
  it("envoie un courriel complet (français) puis marque la demande comme notifiée", async () => {
    const lead = await newLead();
    const { mailer, sent } = recorder();
    await createNotifyHandler({ db: t.db, mailer, env })(job(lead.id), ctx);
    expect(sent).toHaveLength(1);
    const mail = sent[0] as Mail;
    expect(mail.to).toBe("equipe@nexora.dev");
    expect(mail.from).toBe("site@nexora.dev");
    expect(mail.replyTo).toBe("marc@exemple.ca");
    expect(mail.subject).toBe("Nouvelle demande : Gagnon et fils (OPSYS-AI)");
    for (const piece of [
      "Marc Gagnon",
      "marc@exemple.ca",
      "Gagnon et fils",
      "Construction et services terrain",
      "Hébergé au Québec par Nexora",
      "nous voulons une démonstration.",
      "Consentement marketing : non",
    ])
      expect(mail.text).toContain(piece);
    const row = (
      await t.db.select().from(leads).where(eq(leads.id, lead.id))
    )[0];
    expect(row?.notifiedAt).toBeInstanceOf(Date);
  });

  it("est idempotent : une demande déjà notifiée n'est pas renvoyée", async () => {
    const lead = await newLead({ notifiedAt: new Date() });
    const { mailer, sent } = recorder();
    await createNotifyHandler({ db: t.db, mailer, env })(job(lead.id), ctx);
    expect(sent).toHaveLength(0);
  });

  it("échec d'envoi : la tâche échoue (reprise), la demande reste conservée et non notifiée", async () => {
    const lead = await newLead();
    const { mailer } = recorder(1);
    const handler = createNotifyHandler({ db: t.db, mailer, env });
    await expect(handler(job(lead.id), ctx)).rejects.toThrow(/SMTP/);
    const row = (
      await t.db.select().from(leads).where(eq(leads.id, lead.id))
    )[0];
    expect(row).toBeDefined();
    expect(row?.notifiedAt).toBeNull();
    // la reprise réussit
    await handler(job(lead.id, 2), ctx);
    const after = (
      await t.db.select().from(leads).where(eq(leads.id, lead.id))
    )[0];
    expect(after?.notifiedAt).toBeInstanceOf(Date);
  });

  it("SMTP ou destinataire non configuré : échec explicite (la demande attend la configuration)", async () => {
    const lead = await newLead();
    const { mailer } = recorder();
    await expect(
      createNotifyHandler({ db: t.db, mailer, env: {} })(job(lead.id), ctx),
    ).rejects.toThrow(/CONTACT_NOTIFY_TO/);
    expect(
      (await t.db.select().from(leads).where(eq(leads.id, lead.id)))[0]
        ?.notifiedAt,
    ).toBeNull();
  });

  it("une demande introuvable ou une charge invalide ne relance pas indéfiniment", async () => {
    const { mailer, sent } = recorder();
    const handler = createNotifyHandler({ db: t.db, mailer, env });
    await handler(job("00000000-0000-4000-8000-000000000000"), ctx);
    await handler(job("pas-un-uuid"), ctx);
    await handler(job(undefined), ctx);
    expect(sent).toHaveLength(0);
  });

  it("de la file au courriel : le worker réessaie après un échec, un seul courriel part", async () => {
    const lead = await newLead();
    await t.db.insert(jobs).values({
      type: "contact.notify",
      payload: { leadId: lead.id },
      idempotencyKey: `lead-notify:${lead.id}`,
      maxAttempts: 8,
    });
    const { mailer, sent } = recorder(2);
    const registry = new HandlerRegistry().register(
      "contact.notify",
      createNotifyHandler({ db: t.db, mailer, env }),
    );
    const worker = new Worker({
      db: t.db,
      registry,
      logger: silent,
      backoff: { baseMs: 5, maxMs: 10 },
    });
    for (let i = 0; i < 40 && sent.length === 0; i++) {
      await worker.runOnce();
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(sent).toHaveLength(1);
    const j = (await t.db.select().from(jobs))[0];
    expect(j?.status).toBe("succeeded");
    expect(j?.attempts).toBe(3);
  });
});

describe("composition du message", () => {
  const base = {
    id: "i",
    fingerprint: "f",
    lang: "fr" as const,
    need: "diagnostic",
    sector: "autre",
    deployment: "indecis",
    name: "A",
    email: "a@b.ca",
    company: "C",
    message: null,
    marketingConsent: true,
    createdAt: new Date("2026-10-27T10:00:00Z"),
    notifiedAt: null,
  };

  it("l'objet ne contient jamais de saut de ligne ni de longueur excessive (défense en profondeur)", () => {
    const m = composeNotification(
      { ...base, company: `Evil\r\nBcc: x@y.z ${"x".repeat(500)}` },
      env,
    );
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject.length).toBeLessThanOrEqual(140);
  });

  it("indique la langue de la demande, l'absence de message et le consentement donné", () => {
    const m = composeNotification({ ...base, lang: "en" }, env);
    expect(m.text).toContain("Langue du formulaire : anglais");
    expect(m.text).toContain("(aucun message)");
    expect(m.text).toContain("Consentement marketing : oui");
  });
});

describe("transport SMTP depuis l'environnement", () => {
  it("n'est pas créé sans SMTP_HOST ; avec SMTP_HOST il est prêt (Mailpit en développement)", () => {
    expect(mailerFromEnv({})).toBeNull();
    expect(
      mailerFromEnv({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1026" }),
    ).not.toBeNull();
  });

  it("refuse un mot de passe SMTP en clair dans l'environnement (fichier de secret seulement)", () => {
    expect(() =>
      mailerFromEnv({
        SMTP_HOST: "smtp.exemple.test",
        SMTP_USER: "site",
        SMTP_PASSWORD: "valeur-en-clair",
      }),
    ).toThrow(/SMTP_PASSWORD_FILE/);
    try {
      mailerFromEnv({ SMTP_HOST: "h", SMTP_PASSWORD: "valeur-en-clair" });
    } catch (e) {
      // le message ne cite jamais la valeur
      expect(String((e as Error).message)).not.toContain("valeur-en-clair");
    }
  });

  it("lit le mot de passe SMTP dans le fichier de secret", () => {
    const dir = mkdtempSync(join(tmpdir(), "smtp-"));
    const file = join(dir, "pw");
    writeFileSync(file, "secret-de-fichier\n", { mode: 0o600 });
    try {
      expect(
        mailerFromEnv({
          SMTP_HOST: "smtp.exemple.test",
          SMTP_USER: "site",
          SMTP_PASSWORD_FILE: file,
        }),
      ).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
