import type { Lang } from "./config";

/**
 * Textes de la page d'autorisation d'un appareil Nexora Code (`/code/device`) : saisie ou confirmation du code,
 * résumé de ce que la clé permet, approuver ou refuser. Aucune promesse hors de ce que fait le service
 * (`docs/nexora-code.md`) : la clé donne l'accès aux modèles, rien d'autre.
 */
export interface CodeDeviceDictionary {
  meta: { title: string; description: string };
  title: string;
  enter: {
    lead: string;
    label: string;
    hint: string;
    submit: string;
  };
  confirm: {
    lead: string;
    question: string; // {device}
    requestedBy: string; // {client}
    account: string; // {email}
    organization: string; // {organization}
    allowsTitle: string;
    allows: string; // {organization}
    notAllows: string;
    revoke: string; // {device}
    revokeLink: string;
    approve: string;
    deny: string;
    working: string;
  };
  done: { approved: string; denied: string; back: string; panel: string };
  invalid: { title: string; text: string };
  rateLimited: string;
  login: { lead: string; link: string };
  emailNotVerified: { text: string; link: string };
  errors: {
    invalid_code: string;
    email_not_verified: string;
    two_factor_required: string;
    key_limit: string;
    rate_limited: string;
    invalid_origin: string;
    unauthenticated: string;
    generic: string;
  };
}

const fr: CodeDeviceDictionary = {
  meta: {
    title: "Autoriser un appareil",
    description:
      "Autorisez Nexora Code à utiliser votre compte Nexora depuis votre poste.",
  },
  title: "Autoriser Nexora Code",
  enter: {
    lead: "Entrez le code que « nexora-code login » affiche dans votre terminal.",
    label: "Code de l’appareil",
    hint: "Il ressemble à NXC-XXXX-XXXX et expire au bout de dix minutes.",
    submit: "Continuer",
  },
  confirm: {
    lead: "Vérifiez que c’est bien vous qui venez de lancer la connexion.",
    question: "Autoriser Nexora Code sur « {device} » ?",
    requestedBy: "Demandé par {client}",
    account: "Compte : {email}",
    organization: "Organisation : {organization}",
    allowsTitle: "Ce que cette autorisation permet",
    allows:
      "Utiliser les modèles Nexora depuis cet appareil, avec les crédits de {organization}.",
    notAllows:
      "Rien d’autre : la clé ne donne accès ni à WebPilot ni à vos bases RAG, et elle ne vous donne aucun droit d’administration.",
    revoke:
      "Vous pouvez la retirer à tout moment dans {link} (elle s’appelle « Nexora Code ({device}) »).",
    revokeLink: "Modèles et clés",
    approve: "Autoriser",
    deny: "Refuser",
    working: "Un instant…",
  },
  done: {
    approved:
      "Appareil autorisé. Retournez dans votre terminal : la connexion se termine toute seule.",
    denied: "Appareil refusé. Rien n’a été autorisé.",
    back: "Vous pouvez fermer cette page.",
    panel: "Aller à mes outils",
  },
  invalid: {
    title: "Code invalide ou expiré",
    text: "Ce code n’existe pas, a expiré ou a déjà servi. Relancez « nexora-code login » pour en obtenir un nouveau.",
  },
  rateLimited:
    "Trop d’essais en peu de temps. Patientez une minute, puis recommencez.",
  login: {
    lead: "Connectez-vous à votre compte Nexora pour autoriser cet appareil.",
    link: "Se connecter",
  },
  emailNotVerified: {
    text: "Vérifiez d’abord votre courriel : nous ne pouvons pas autoriser un appareil tant qu’il ne l’est pas.",
    link: "Vérifier mon courriel",
  },
  errors: {
    invalid_code:
      "Ce code est invalide ou a expiré. Relancez « nexora-code login » pour en obtenir un nouveau.",
    email_not_verified:
      "Vérifiez votre courriel avant d’autoriser un appareil.",
    two_factor_required:
      "Activez la double authentification (page Sécurité) avant d’autoriser un appareil.",
    key_limit:
      "Votre organisation a atteint son nombre maximal de clés. Révoquez-en une dans « Modèles et clés », puis recommencez.",
    rate_limited: "Trop d’essais en peu de temps. Patientez une minute.",
    invalid_origin:
      "Cette demande ne vient pas de notre site. Rechargez la page.",
    unauthenticated: "Votre session a expiré. Reconnectez-vous.",
    generic: "Une erreur est survenue. Réessayez dans un instant.",
  },
};

const en: CodeDeviceDictionary = {
  meta: {
    title: "Authorize a device",
    description:
      "Authorize Nexora Code to use your Nexora account from your computer.",
  },
  title: "Authorize Nexora Code",
  enter: {
    lead: "Enter the code that “nexora-code login” shows in your terminal.",
    label: "Device code",
    hint: "It looks like NXC-XXXX-XXXX and expires after ten minutes.",
    submit: "Continue",
  },
  confirm: {
    lead: "Check that you are the one who just started the sign-in.",
    question: "Authorize Nexora Code on “{device}”?",
    requestedBy: "Requested by {client}",
    account: "Account: {email}",
    organization: "Organization: {organization}",
    allowsTitle: "What this authorization allows",
    allows:
      "Use Nexora models from this device, with the credits of {organization}.",
    notAllows:
      "Nothing else: the key does not give access to WebPilot or to your RAG bases, and it grants no administration rights.",
    revoke:
      "You can remove it at any time in {link} (it is named “Nexora Code ({device})”).",
    revokeLink: "Models and keys",
    approve: "Authorize",
    deny: "Deny",
    working: "One moment…",
  },
  done: {
    approved:
      "Device authorized. Go back to your terminal: the sign-in finishes on its own.",
    denied: "Device denied. Nothing was authorized.",
    back: "You can close this page.",
    panel: "Go to my tools",
  },
  invalid: {
    title: "Invalid or expired code",
    text: "This code does not exist, has expired or was already used. Run “nexora-code login” again to get a new one.",
  },
  rateLimited:
    "Too many attempts in a short time. Wait a minute, then try again.",
  login: {
    lead: "Sign in to your Nexora account to authorize this device.",
    link: "Sign in",
  },
  emailNotVerified: {
    text: "Verify your email first: we cannot authorize a device until it is verified.",
    link: "Verify my email",
  },
  errors: {
    invalid_code:
      "This code is invalid or has expired. Run “nexora-code login” again to get a new one.",
    email_not_verified: "Verify your email before authorizing a device.",
    two_factor_required:
      "Turn on two-factor authentication (Security page) before authorizing a device.",
    key_limit:
      "Your organization has reached its maximum number of keys. Revoke one in “Models and keys”, then try again.",
    rate_limited: "Too many attempts in a short time. Wait a minute.",
    invalid_origin: "This request did not come from our site. Reload the page.",
    unauthenticated: "Your session has expired. Sign in again.",
    generic: "Something went wrong. Try again in a moment.",
  },
};

const DICTIONARIES: Record<Lang, CodeDeviceDictionary> = { fr, en };

export function getCodeDeviceDictionary(lang: Lang): CodeDeviceDictionary {
  return DICTIONARIES[lang];
}
