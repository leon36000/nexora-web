import { readFileSync } from "node:fs";
import {
  type Database,
  eq,
  LEAD_LABELS_FR,
  type Lead,
  leads,
  sql,
} from "@nexora/db";
import nodemailer from "nodemailer";
import type { JobHandler } from "./registry.ts";

/**
 * Tâche `contact.notify` : envoie à l'équipe, par SMTP, le courriel d'une demande de contact enregistrée par le site.
 *
 * - La demande est déjà en base (table `leads`) : un échec d'envoi la laisse intacte et la tâche est reprise
 *   (délais exponentiels de la file) ; `notified_at` n'est renseigné qu'après l'envoi.
 * - La charge de la tâche ne contient que l'identifiant de la demande : aucun renseignement personnel dans la file.
 * - Au moins une fois : si le worker meurt entre l'envoi et l'écriture de `notified_at`, un second courriel
 *   identique peut partir à la reprise (la demande ne change pas ; le doublon est sans conséquence).
 * - Un message d'erreur de transport ne contient jamais le mot de passe SMTP (le journal commun nettoie de toute façon).
 *
 * Variables : SMTP_HOST, SMTP_PORT (587 par défaut), SMTP_SECURE (« true » pour TLS implicite), SMTP_USER,
 * SMTP_PASSWORD ou SMTP_PASSWORD_FILE (secret Docker), SMTP_FROM, CONTACT_NOTIFY_TO (une ou plusieurs adresses,
 * séparées par des virgules). En développement : Mailpit sur 127.0.0.1:1026.
 */

export type Mail = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
};
export interface Mailer {
  send(mail: Mail): Promise<void>;
}
type Env = Record<string, string | undefined>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Transport SMTP (nodemailer) ; `null` si SMTP_HOST n'est pas défini. */
export function mailerFromEnv(env: Env = process.env): Mailer | null {
  const host = env.SMTP_HOST;
  if (!host) return null;
  const port = Number(env.SMTP_PORT ?? 587);
  const secure = env.SMTP_SECURE === "true";
  const password = env.SMTP_PASSWORD_FILE
    ? readFileSync(env.SMTP_PASSWORD_FILE, "utf8").trim()
    : env.SMTP_PASSWORD;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(env.SMTP_USER && password
      ? { auth: { user: env.SMTP_USER, pass: password } }
      : {}),
    // Mailpit n'a pas de TLS : on ne force le chiffrement que si l'opérateur le demande
    requireTLS: env.SMTP_REQUIRE_TLS === "true",
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    async send(mail) {
      await transport.sendMail({
        from: mail.from,
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
      });
    },
  };
}

/** Objet d'une ligne : sans saut de ligne, borné. */
const oneLine = (v: string, max: number) =>
  v.replace(/\s+/g, " ").trim().slice(0, max);

const labelOf = <K extends keyof typeof LEAD_LABELS_FR>(
  kind: K,
  key: string,
): string =>
  (LEAD_LABELS_FR[kind] as Record<string, string>)[key] ?? oneLine(key, 60);

export function composeNotification(lead: Lead, env: Env): Mail {
  const to = env.CONTACT_NOTIFY_TO?.trim();
  if (!to) throw new Error("CONTACT_NOTIFY_TO n'est pas configuré");
  const from = env.SMTP_FROM?.trim() || "site@nexora.dev";
  const need = labelOf("need", lead.need);
  const shortNeed = need.split(" (")[0] ?? need;
  const subject = oneLine(
    `Nouvelle demande : ${lead.company} (${shortNeed.replace(/^Un /, "")})`,
    120,
  );
  const lines = [
    `Une demande a été enregistrée sur le site (${lead.createdAt.toISOString()}).`,
    "",
    `Besoin : ${need}`,
    `Secteur : ${labelOf("sector", lead.sector)}`,
    `Mode de déploiement envisagé : ${labelOf("deployment", lead.deployment)}`,
    "",
    `Nom : ${lead.name}`,
    `Courriel : ${lead.email}`,
    `Entreprise : ${lead.company}`,
    "",
    "Message :",
    lead.message ?? "(aucun message)",
    "",
    `Langue du formulaire : ${lead.lang === "en" ? "anglais" : "français"}`,
    `Consentement marketing : ${lead.marketingConsent ? "oui" : "non"}`,
    `Référence : ${lead.id}`,
    "",
    "La demande est conservée dans la table « leads » ; répondre à ce courriel écrit à la personne.",
  ];
  return { from, to, replyTo: lead.email, subject, text: lines.join("\n") };
}

export function createNotifyHandler(deps: {
  db: Database;
  mailer: Mailer | null;
  env?: Env;
}): JobHandler {
  const env = deps.env ?? process.env;
  return async (job, ctx) => {
    const leadId = job.payload.leadId;
    if (typeof leadId !== "string" || !UUID.test(leadId)) {
      ctx.log.error("contact.notify : charge invalide, tâche ignorée");
      return;
    }
    const [lead] = await deps.db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId));
    if (!lead) {
      ctx.log.error("contact.notify : demande introuvable, tâche ignorée", {
        leadId,
      });
      return;
    }
    if (lead.notifiedAt) {
      ctx.log.info("contact.notify : déjà notifiée", { leadId });
      return;
    }
    if (!deps.mailer) throw new Error("SMTP_HOST n'est pas configuré");
    const mail = composeNotification(lead, env);
    await deps.mailer.send(mail);
    await deps.db
      .update(leads)
      .set({ notifiedAt: sql`now()` })
      .where(eq(leads.id, leadId));
    ctx.log.info("contact.notify : équipe avertie", {
      leadId,
      attempt: job.attempt,
    });
  };
}
