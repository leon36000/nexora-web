/**
 * Dictionnaire de l'espace client (fr-CA), jalon S4. Fichier distinct du dictionnaire du site pour
 * ne pas mêler les chantiers ; même règles : vouvoiement, aucun chiffre, prix ou promesse inventé.
 * Les marqueurs `{nom}` sont remplacés par `fmt()` (src/i18n/account.ts).
 * Typographie : espace insécable avant « : » et dans les guillemets « ».
 */
export const accountFrCA = {
  meta: {
    login: "Connexion | Nexora AI",
    signup: "Créer un compte | Nexora AI",
    forgot: "Mot de passe oublié | Nexora AI",
    reset: "Nouveau mot de passe | Nexora AI",
    verify: "Confirmation du courriel | Nexora AI",
    dashboard: "Mon compte | Nexora AI",
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
      locked:
        "Trop d’échecs de connexion pour cette adresse : accès suspendu quelques minutes. Réessayez plus tard, ou réinitialisez votre mot de passe.",
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
    passwordHint: "12 caractères au moins.",
    submit: "Créer mon compte",
    haveAccount: "Déjà un compte ?",
    loginLink: "Se connecter",
    errors: {
      nameRequired: "Indiquez votre nom.",
      weak: "Ce mot de passe est trop court : 12 caractères au moins.",
      common:
        "Ce mot de passe est trop courant ou trop proche de vos informations. Choisissez une phrase de passe plus longue.",
      breached:
        "Ce mot de passe figure dans des fuites de données connues. Choisissez-en un autre.",
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
    lead: "Choisissez un mot de passe d’au moins 12 caractères. Vos autres sessions seront fermées.",
    password: "Nouveau mot de passe",
    submit: "Enregistrer le mot de passe",
    done: "Votre mot de passe est changé. Vous pouvez vous connecter.",
    goLogin: "Aller à la connexion",
    errors: {
      invalidToken: "Ce lien est invalide ou expiré. Demandez-en un nouveau.",
      weak: "Ce mot de passe est trop court : 12 caractères au moins.",
      common:
        "Ce mot de passe est trop courant. Choisissez une phrase de passe plus longue.",
      breached:
        "Ce mot de passe figure dans des fuites de données connues. Choisissez-en un autre.",
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
        gift_cap_reached: "Le plafond mensuel de crédits offerts est atteint.",
        gift_two_factor_required:
          "Activez la double authentification de votre compte (page Sécurité) pour offrir un service.",
        gift_already_gifted: "Ce don existe déjà.",
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
      productName: "Crédits Nexora AI",
      lead: "Paiement unique, sans abonnement. Vous recevez en crédits le montant avant taxes.",
      amount: "Montant en dollars canadiens",
      choose: "Montants proposés",
      submit: "Payer avec Stripe",
      taxNote:
        "La TPS et la TVQ sont calculées par Stripe à l’étape suivante, selon votre adresse de facturation, et s’ajoutent au montant.",
      testNote:
        "Mode test : aucun paiement réel n’est possible pour le moment.",
      feeNote:
        "Des frais de recharge de {percent} % (minimum {min}) sont déduits des crédits accordés.",
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
        staff_gift: "Crédits offerts par Nexora",
        staff_gift_revoked: "Crédits offerts : reprise",
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
      chosen:
        "Vous avez choisi l’offre {name}. Confirmez pour passer au paiement sécurisé.",
      statuses: {
        incomplete: "En attente du paiement",
        incomplete_expired: "Expiré",
        trialing: "Période d’essai",
        active: "Actif",
        past_due: "Paiement en retard",
        unpaid: "Impayé",
        paused: "En pause",
        canceled: "Résilié",
        gifted: "Offert par Nexora",
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
        trial: "Essai gratuit de {days} jours",
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
  promo: {
    label: "Code promo",
    placeholder: "Votre code",
    hint: "Facultatif. Le rabais est vérifié par le serveur et apparaît sur la page de paiement.",
    trialNote:
      "Essai gratuit de {days} jours : vous ne serez facturé qu’à la fin de l’essai.",
    errors: {
      unknown: "Ce code promo n’existe pas ou n’est plus valide.",
      expired: "Ce code promo est expiré.",
      exhausted: "Ce code promo a atteint son nombre maximal d’utilisations.",
      wrong_scope: "Ce code ne s’applique pas à ce type d’achat.",
      staff_only: "Ce code est réservé à l’équipe de Nexora.",
      two_factor_required:
        "Activez la double authentification de votre compte (page Sécurité) pour utiliser un code de l’équipe.",
      first_order_only: "Ce code est réservé à une première commande.",
      already_used: "Votre organisation a déjà utilisé ce code.",
      min_amount: "Ce code exige un montant d’achat plus élevé.",
      not_ready:
        "Ce code n’est pas encore activé. Réessayez plus tard ou contactez-nous.",
      covers_all:
        "Ce code couvrirait la totalité de l’achat de crédits : choisissez un montant plus élevé.",
    },
    gifted: {
      subscription: "Abonnement offert : accès complet, sans paiement.",
      vps: "VPS offert : il sera installé dès qu’un serveur est prêt.",
      credits: "Crédits offerts : ils sont ajoutés à votre solde.",
      capReached: "Le plafond mensuel de crédits offerts est atteint.",
    },
  },
};

export type AccountDictionary = typeof accountFrCA;
