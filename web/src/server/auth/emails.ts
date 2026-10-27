import type { Lang } from "@/i18n/config";
import type { Mail } from "./mailer";

/**
 * Courriels transactionnels (vérification, réinitialisation). Ces textes sont les seuls hors des
 * dictionnaires d'interface : ils n'existent que côté serveur, en fr-CA et en-CA. Aucune
 * promesse de conformité ni de délai de livraison, aucun suivi d'ouverture.
 */
export function normalizeLocale(value: unknown): Lang {
  return value === "en" ? "en" : "fr";
}

const SIGN = { fr: "L’équipe Nexora AI", en: "The Nexora AI team" } as const;

export function verificationEmail(input: {
  to: string;
  name: string;
  url: string;
  lang: Lang;
}): Mail {
  const { to, name, url, lang } = input;
  if (lang === "en") {
    return {
      to,
      subject: "Confirm your email — Nexora AI",
      text: `Hello ${name},\n\nConfirm your email address to activate your Nexora AI account:\n${url}\n\nThis link is valid for one hour. If you did not create an account, you can ignore this message.\n\n${SIGN.en}`,
    };
  }
  return {
    to,
    subject: "Confirmez votre courriel — Nexora AI",
    text: `Bonjour ${name},\n\nConfirmez votre adresse courriel pour activer votre compte Nexora AI :\n${url}\n\nCe lien est valable une heure. Si vous n’avez pas créé de compte, ignorez ce message.\n\n${SIGN.fr}`,
  };
}

export function resetPasswordEmail(input: {
  to: string;
  name: string;
  url: string;
  lang: Lang;
}): Mail {
  const { to, name, url, lang } = input;
  if (lang === "en") {
    return {
      to,
      subject: "Reset your password — Nexora AI",
      text: `Hello ${name},\n\nWe received a request to reset your Nexora AI password:\n${url}\n\nThis link is valid for one hour and works once. If you did not make this request, ignore this message: your password has not changed.\n\n${SIGN.en}`,
    };
  }
  return {
    to,
    subject: "Réinitialisez votre mot de passe — Nexora AI",
    text: `Bonjour ${name},\n\nNous avons reçu une demande de réinitialisation de votre mot de passe Nexora AI :\n${url}\n\nCe lien est valable une heure et ne sert qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe n’a pas changé.\n\n${SIGN.fr}`,
  };
}
