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

/** Avertissement de connexion depuis une adresse jamais vue sur ce compte (aucun lien : rien à cliquer). */
export function newSignInEmail(input: {
  to: string;
  name: string;
  ip: string;
  userAgent: string;
  at: Date;
  lang: Lang;
}): Mail {
  const { to, name, ip, userAgent, at, lang } = input;
  // Valeurs issues du réseau : une seule ligne, longueur bornée.
  const clean = (v: string) =>
    v
      .replace(/[\p{Cc}\u2028\u2029]+/gu, " ")
      .trim()
      .slice(0, 160);
  const when = at.toISOString().replace("T", " ").slice(0, 16);
  if (lang === "en") {
    return {
      to,
      subject: "New sign-in to your account — Nexora AI",
      text: `Hello ${name},\n\nYour Nexora AI account was just signed in from an address we had not seen before.\n\nWhen (UTC): ${when}\nAddress: ${clean(ip)}\nBrowser: ${clean(userAgent) || "unknown"}\n\nIf this was you, there is nothing to do. If not, change your password now from the “Forgot password” page, then turn on two-factor authentication in your account settings.\n\n${SIGN.en}`,
    };
  }
  return {
    to,
    subject: "Nouvelle connexion à votre compte — Nexora AI",
    text: `Bonjour ${name},\n\nVotre compte Nexora AI vient d’être utilisé depuis une adresse que nous n’avions pas encore vue.\n\nQuand (UTC) : ${when}\nAdresse : ${clean(ip)}\nNavigateur : ${clean(userAgent) || "inconnu"}\n\nSi c’était vous, il n’y a rien à faire. Sinon, changez votre mot de passe tout de suite depuis la page « Mot de passe oublié », puis activez la double authentification dans les paramètres de votre compte.\n\n${SIGN.fr}`,
  };
}
