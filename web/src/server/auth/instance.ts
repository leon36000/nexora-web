import "server-only";
import { SITE_URL } from "@/lib/site";
import { getDb } from "../db";
import { log } from "../log";
import { createAuth, createSmtpMailer, type NexoraAuth } from "./index";
import { breachCheckEnabled, createBreachChecker } from "./password-policy";

const g = globalThis as unknown as { __nexoraAuth?: NexoraAuth };

/**
 * Instance Better Auth du processus (créée à la première requête, jamais au chargement du module :
 * `next build` n'a pas les secrets). Variables : BETTER_AUTH_SECRET (obligatoire), SITE_URL,
 * SMTP_URL (défaut : Mailpit smtp://127.0.0.1:1026), MAIL_FROM.
 */
export function getAuth(): NexoraAuth {
  if (!g.__nexoraAuth) {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("BETTER_AUTH_SECRET est absent");
    g.__nexoraAuth = createAuth({
      db: getDb(),
      secret,
      baseURL: SITE_URL,
      mailer: createSmtpMailer({
        url: process.env.SMTP_URL ?? "smtp://127.0.0.1:1026",
        from: process.env.MAIL_FROM ?? "Nexora AI <no-reply@nexora.test>",
      }),
      secureCookies: SITE_URL.startsWith("https://"),
      // k-anonymat HIBP : activé en production (NEXORA_PASSWORD_BREACH_CHECK=off pour le couper, hors ligne).
      breachCheck: breachCheckEnabled()
        ? createBreachChecker({ log: (message, fields) => log.warn(message, fields) })
        : undefined,
      log: (message, fields) => log.warn(message, fields),
    });
  }
  return g.__nexoraAuth;
}
