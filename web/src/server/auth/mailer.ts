import nodemailer from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export interface MemoryMailer extends Mailer {
  outbox: Mail[];
  sentTo(email: string): Mail[];
  last(email: string, subject?: RegExp): Mail | undefined;
}

/** Messagerie en mémoire pour les tests : l'ajout à la boîte d'envoi est synchrone. */
export function createMemoryMailer(): MemoryMailer {
  const outbox: Mail[] = [];
  return {
    outbox,
    send(mail) {
      outbox.push(mail);
      return Promise.resolve();
    },
    sentTo: (email) => outbox.filter((m) => m.to === email),
    last: (email, subject) =>
      outbox
        .filter((m) => m.to === email && (!subject || subject.test(m.subject)))
        .at(-1),
  };
}

/** SMTP (Mailpit en développement : smtp://127.0.0.1:1026). */
export function createSmtpMailer(options: {
  url: string;
  from: string;
}): Mailer {
  const transport = nodemailer.createTransport(options.url);
  return {
    async send(mail) {
      await transport.sendMail({
        from: options.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    },
  };
}
