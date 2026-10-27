/**
 * Dictionnaire de l'espace client (fr-CA), jalon S4. Fichier distinct du dictionnaire du site pour
 * ne pas mêler les chantiers ; même règles : vouvoiement, aucun chiffre, prix ou promesse inventé.
 * Les marqueurs `{nom}` sont remplacés par `fmt()` (src/i18n/account.ts).
 * Typographie : espace insécable avant « : » et dans les guillemets « ».
 */
export const accountFrCA = {
  meta: {
    login: "Connexion | Nexora",
    signup: "Créer un compte | Nexora",
    forgot: "Mot de passe oublié | Nexora",
    reset: "Nouveau mot de passe | Nexora",
    verify: "Confirmation du courriel | Nexora",
    dashboard: "Mon compte | Nexora",
  },

  common: {
    email: "Courriel",
    password: "Mot de passe",
    required: "obligatoire",
    optional: "facultatif",
    working: "Un instant…",
    tryAgain: "Réessayez dans un moment.",
    errorPrefix: "Erreur",
    currency: "CAD",
  },

  login: {
    title: "Connexion.",
    lead: "Accédez à votre espace client : crédits, abonnements et facturation.",
    submit: "Se connecter",
    forgot: "Mot de passe oublié ?",
    noAccount: "Pas encore de compte ?",
    signupLink: "Créer un compte",
    resend: "Renvoyer le courriel de confirmation",
    resent:
      "Si un compte correspond à cette adresse, un nouveau courriel de confirmation vient d’être envoyé.",
    errors: {
      invalid: "Courriel ou mot de passe incorrect.",
      unverified:
        "Votre courriel n’est pas encore confirmé. Ouvrez le message que nous vous avons envoyé, ou demandez-en un nouveau.",
      rateLimited:
        "Trop de tentatives. Patientez une minute avant de réessayer.",
      generic: "La connexion a échoué. Réessayez dans un moment.",
    },
  },

  signup: {
    title: "Créer un compte.",
    lead: "Un compte, une organisation : c’est elle qui détient vos crédits et vos abonnements.",
    name: "Votre nom",
    company: "Nom de l’entreprise",
    companyHint:
      "Il nommera votre organisation. Sans entreprise, nous utiliserons votre nom.",
    passwordHint: "10 caractères au moins.",
    submit: "Créer mon compte",
    haveAccount: "Déjà un compte ?",
    loginLink: "Se connecter",
    errors: {
      nameRequired: "Indiquez votre nom.",
      weak: "Ce mot de passe est trop court : 10 caractères au moins.",
      invalidEmail: "Cette adresse courriel n’est pas valide.",
      rateLimited:
        "Trop de tentatives. Patientez une minute avant de réessayer.",
      generic: "La création du compte a échoué. Réessayez dans un moment.",
    },
    done: {
      title: "Vérifiez votre courriel.",
      text: "Nous venons d’envoyer un lien de confirmation à {email}. Ouvrez-le pour activer votre compte, puis connectez-vous.",
      note: "Rien reçu ? Regardez dans vos courriels indésirables, puis demandez un nouveau message depuis la page de connexion.",
    },
  },

  forgot: {
    title: "Mot de passe oublié.",
    lead: "Indiquez votre courriel : si un compte y correspond, nous vous enverrons un lien pour choisir un nouveau mot de passe.",
    submit: "Envoyer le lien",
    done: "Si un compte correspond à cette adresse, un lien de réinitialisation vient d’être envoyé. Il est valable une heure.",
    back: "Retour à la connexion",
    errors: {
      invalidEmail: "Cette adresse courriel n’est pas valide.",
      rateLimited: "Trop de demandes. Patientez une minute avant de réessayer.",
      generic: "La demande a échoué. Réessayez dans un moment.",
    },
  },

  reset: {
    title: "Nouveau mot de passe.",
    lead: "Choisissez un mot de passe d’au moins 10 caractères. Vos autres sessions seront fermées.",
    password: "Nouveau mot de passe",
    submit: "Enregistrer le mot de passe",
    done: "Votre mot de passe est changé. Vous pouvez vous connecter.",
    goLogin: "Aller à la connexion",
    errors: {
      invalidToken: "Ce lien est invalide ou expiré. Demandez-en un nouveau.",
      weak: "Ce mot de passe est trop court : 10 caractères au moins.",
      generic: "Le changement a échoué. Réessayez dans un moment.",
    },
    askAgain: "Demander un nouveau lien",
  },

  verify: {
    title: "Courriel confirmé.",
    text: "Votre compte est actif. Connectez-vous pour accéder à votre espace.",
    goLogin: "Se connecter",
    errorTitle: "Lien invalide.",
    errorText:
      "Ce lien de confirmation est invalide ou expiré. Connectez-vous pour en demander un nouveau.",
  },

  dashboard: {
    title: "Mon compte.",
    lead: "Votre organisation, vos crédits et vos abonnements.",
    organization: "Organisation",
    role: "Votre rôle",
    roles: { owner: "Propriétaire", member: "Membre" },
    signOut: "Se déconnecter",
    alerts: {
      purchaseOk:
        "Merci. Le paiement est confirmé : vos crédits sont ajoutés dès que Stripe nous en informe, en général en quelques secondes. Actualisez la page si le solde n’a pas changé.",
      purchaseCancelled: "L’achat a été annulé. Aucun montant n’a été prélevé.",
      subscriptionOk:
        "Merci. L’abonnement s’active dès que Stripe confirme le premier paiement. Actualisez la page dans un instant.",
      subscriptionCancelled:
        "L’abonnement a été annulé avant le paiement. Aucun montant n’a été prélevé.",
      errors: {
        invalid_amount: "Le montant doit être compris entre {min} et {max}.",
        forbidden:
          "Seul le propriétaire de l’organisation peut effectuer cette action.",
        no_organization: "Aucune organisation n’est associée à ce compte.",
        no_customer:
          "Vous n’avez pas encore effectué de paiement : le portail n’est pas disponible.",
        plan_not_found: "Cette offre n’est plus disponible.",
        already_subscribed: "Vous êtes déjà abonné à cette offre.",
        plan_not_synced: "Cette offre n’est pas encore prête à la vente.",
        rate_limited:
          "Trop de demandes. Patientez une minute avant de réessayer.",
        payment_unavailable:
          "Le service de paiement ne répond pas. Réessayez dans un moment.",
        internal_error: "Une erreur est survenue. Réessayez dans un moment.",
      },
    },
    balance: {
      title: "Solde de crédits",
      available: "Disponible",
      held: "Réservé pour des requêtes en cours : {amount}",
      blockedTitle: "Compte bloqué.",
      blockedText:
        "Votre solde est négatif à la suite d’un remboursement ou d’un litige. L’accès à l’API est suspendu jusqu’à ce que le solde redevienne positif. Rechargez des crédits ci-dessous ou contactez-nous.",
      expiryNote:
        "Les crédits achetés expirent {months} mois après l’achat ; les plus proches de leur échéance sont utilisés en premier.",
    },
    buy: {
      title: "Acheter des crédits",
      productName: "Crédits Nexora",
      lead: "Paiement unique, sans abonnement. Vous recevez en crédits le montant avant taxes.",
      amount: "Montant en dollars canadiens",
      choose: "Montants proposés",
      submit: "Payer avec Stripe",
      taxNote:
        "La TPS et la TVQ sont calculées par Stripe à l’étape suivante, selon votre adresse de facturation, et s’ajoutent au montant.",
      testNote:
        "Mode test : aucun paiement réel n’est possible pour le moment.",
      limits: "De {min} à {max}.",
      ownerOnly:
        "Seul le propriétaire de l’organisation peut acheter des crédits.",
    },
    history: {
      title: "Historique des crédits",
      empty: "Aucun mouvement pour l’instant.",
      caption: "Dernières écritures du grand livre de crédits",
      date: "Date",
      type: "Mouvement",
      amount: "Montant",
      balance: "Solde après",
      expires: "Expire le {date}",
      sources: {
        purchase: "Achat de crédits",
        subscription: "Crédits inclus (abonnement)",
        usage: "Utilisation",
        stripe_refund: "Remboursement",
        stripe_dispute: "Litige",
        dispute_reversal: "Litige gagné : crédits rendus",
        expiration: "Expiration",
      },
    },
    subscriptions: {
      title: "Abonnements",
      empty: "Aucun abonnement.",
      plan: "Offre",
      status: "État",
      renews: "Prochaine échéance : {date}",
      cancels: "Se termine le {date}",
      graceUntil: "Paiement à régulariser avant le {date}",
      statuses: {
        incomplete: "En attente du paiement",
        incomplete_expired: "Expiré",
        trialing: "Période d’essai",
        active: "Actif",
        past_due: "Paiement en retard",
        unpaid: "Impayé",
        paused: "En pause",
        canceled: "Résilié",
      },
      access: {
        full: "Accès complet",
        grace: "Accès maintenu pendant le délai de grâce",
        suspended: "Accès suspendu",
        none: "Aucun accès",
      },
      available: {
        title: "Offres disponibles",
        empty: "Aucune offre n’est publiée pour le moment.",
        perMonth: "{amount} par mois, avant taxes",
        perYear: "{amount} par an, avant taxes",
        included: "{amount} de crédits inclus à chaque période",
        subscribe: "Souscrire",
        ownerOnly: "Seul le propriétaire peut souscrire.",
        unavailable: "Les offres ne peuvent pas être affichées pour le moment.",
        notReady: "Bientôt disponible",
        current: "Votre offre actuelle",
      },
    },
    portal: {
      title: "Facturation",
      lead: "Factures, moyens de paiement et résiliation, dans le portail sécurisé de Stripe.",
      button: "Ouvrir le portail de facturation",
      none: "Le portail sera disponible après votre premier paiement.",
    },
    vps: {
      title: "Mes VPS",
      lead: "Vos serveurs privés virtuels : état, accès SSH et opérations courantes.",
      link: "Voir mes VPS",
    },
  },
};

export type AccountDictionary = typeof accountFrCA;
