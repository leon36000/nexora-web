/** Textes de l'écran « Sécurité du compte » (double authentification) et de l'étape de connexion à deux facteurs. */
export const securityFrCA = {
  meta: { title: "Sécurité du compte" },
  title: "Sécurité du compte.",
  lead: "Protégez votre compte avec un second facteur : un code à six chiffres généré par une application d’authentification (Aegis, FreeOTP, 1Password, Google Authenticator…).",
  back: "Retour à mon compte",
  required: {
    title: "La double authentification est obligatoire pour votre compte.",
    text: "Votre compte est marqué « personnel » : tant que la double authentification n’est pas activée, les privilèges de l’équipe (codes de l’équipe, services offerts) sont suspendus.",
  },
  status: {
    on: "La double authentification est activée.",
    off: "La double authentification n’est pas activée.",
  },
  enable: {
    title: "Activer la double authentification",
    password: "Votre mot de passe",
    passwordHint: "Nous le demandons pour confirmer que c’est bien vous.",
    start: "Commencer",
    scan: "Scannez ce code avec votre application, ou saisissez la clé à la main :",
    qrLabel: "Code QR de configuration de la double authentification",
    secretLabel: "Clé de configuration",
    codes: {
      title: "Codes de secours",
      text: "Chaque code ne sert qu’une fois, si vous perdez votre téléphone. Notez-les maintenant dans un endroit sûr : ils ne seront plus affichés.",
    },
    confirmLabel: "Code à six chiffres affiché par l’application",
    confirm: "Activer",
    done: "C’est fait : la double authentification est activée. À la prochaine connexion, un code vous sera demandé.",
  },
  regenerate: {
    title: "Codes de secours",
    text: "Générez de nouveaux codes : les anciens cessent de fonctionner.",
    action: "Générer de nouveaux codes",
    done: "Nouveaux codes de secours (les anciens sont invalides) :",
  },
  disable: {
    title: "Désactiver la double authentification",
    text: "Votre compte ne sera protégé que par votre mot de passe.",
    action: "Désactiver",
    done: "La double authentification est désactivée.",
    staff:
      "Un compte du personnel ne peut pas désactiver la double authentification.",
  },
  challenge: {
    title: "Vérification en deux étapes.",
    lead: "Saisissez le code à six chiffres de votre application d’authentification.",
    code: "Code à six chiffres",
    submit: "Vérifier",
    useBackup: "Utiliser un code de secours",
    useApp: "Utiliser l’application d’authentification",
    backupCode: "Code de secours",
    errors: {
      invalid: "Ce code n’est pas valide. Réessayez.",
      locked:
        "Trop d’échecs : le compte est verrouillé quelques minutes. Réessayez plus tard.",
      expired:
        "La vérification a expiré. Recommencez la connexion avec votre mot de passe.",
      generic: "La vérification a échoué. Réessayez dans un moment.",
    },
  },
  errors: {
    password: "Mot de passe incorrect.",
    code: "Ce code n’est pas valide.",
    rateLimited: "Trop de tentatives. Patientez avant de réessayer.",
    staff:
      "Un compte du personnel ne peut pas désactiver la double authentification.",
    generic: "L’opération a échoué. Réessayez dans un moment.",
  },
  dashboard: {
    link: "Sécurité du compte",
    linkText: "Double authentification et codes de secours.",
  },
  common: { working: "En cours…", copy: "Copier" },
} as const;

type Widen<T> = T extends string
  ? string
  : { -readonly [K in keyof T]: Widen<T[K]> };
export type SecurityDictionary = Widen<typeof securityFrCA>;
