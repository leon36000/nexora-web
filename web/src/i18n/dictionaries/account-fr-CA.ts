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
    intro: {
      text: "Un compte donne accès à Mes outils : vos crédits, votre espace et vos produits, avec l’état réel de chacun. La souscription et la recharge ne sont pas encore ouvertes : un compte neuf n’a pas de crédits.",
      linksLabel: "À lire avant de créer votre compte",
      pricing: "Tarifs",
      terms: "Conditions d’utilisation",
      privacy: "Confidentialité",
    },
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
        gift_code_exhausted:
          "Ce code a atteint son nombre maximal d’utilisations.",
        gift_code_expired: "Ce code est expiré.",
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
      noExpiryNote:
        "Les crédits de recharge n’expirent pas. Les crédits d’abonnement expirent à la fin de leur période et servent en premier.",
    },
    buy: {
      title: "Ajouter des fonds",
      productName: "Crédits Nexora AI",
      lead: "Paiement unique, sans abonnement. Vous recevez en crédits le montant avant taxes, utilisables sur tous les modèles.",
      amount: "Autre montant en dollars canadiens",
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
        included: "{credits} crédits inclus à chaque période",
        subscribe: "Souscrire",
        ownerOnly: "Seul le propriétaire peut souscrire.",
        unavailable: "Les offres ne peuvent pas être affichées pour le moment.",
        notReady: "Bientôt disponible",
        current: "Votre offre actuelle",
      },
    },
    portal: {
      title: "Reçus et factures",
      lead: "Chaque paiement donne lieu à un reçu et à une facture de Stripe. Retrouvez-les, avec vos moyens de paiement et la résiliation, dans le portail sécurisé.",
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
      account_restricted:
        "Ce code ne peut pas être appliqué à votre compte pour le moment. Contactez-nous.",
    },
    gifted: {
      subscription: "Abonnement offert : accès complet, sans paiement.",
      vps: "VPS offert : il sera installé dès qu’un serveur est prêt.",
      credits: "Crédits offerts : ils sont ajoutés à votre solde.",
      capReached: "Le plafond mensuel de crédits offerts est atteint.",
    },
  },
  /** Panneau client (`/compte/…`) : navigation latérale, aperçu, modèles et clés, activité, WorkStudio, cloud. */
  panel: {
    meta: {
      overview: "Mes outils | Nexora AI",
      models: "Modèles et clés | Nexora AI",
      activity: "Activité | Nexora AI",
      privacy: "Confidentialité | Nexora AI",
      workstudio: "WorkStudio et agents | Nexora AI",
      code: "Nexora Code, environnement hébergé | Nexora AI",
      rag: "Nexora RAG, vos bases de connaissances | Nexora AI",
      billing: "Portefeuille et facturation | Nexora AI",
    },
    nav: {
      label: "Espace client",
      soon: "Bientôt",
      items: {
        overview: "Mes outils",
        models: "Modèles et clés",
        activity: "Activité",
        privacy: "Confidentialité",
        workstudio: "WorkStudio et agents",
        code: "Nexora Code",
        rag: "Nexora RAG",
        cloud: "Cloud et VPS",
        apps: "Nexora Apps",
        billing: "Portefeuille",
        security: "Sécurité",
      },
    },
    overview: {
      title: "Mes outils.",
      lead: "Vos outils Nexora, vos crédits et votre espace disque, réunis au même endroit.",
      now: {
        title: "Où j’en suis",
        balance: "Solde disponible",
        addFunds: "Ajouter des fonds",
        month: "Consommation du mois",
        monthNote: "{requests} requêtes · {tokens} jetons",
        monthNoteEmpty: "Aucune requête ce mois-ci",
        keys: "Clés actives",
        keysManage: "Gérer les clés",
        workstudio: "WorkStudio",
        wsConnected: "Branché",
        wsNotYet: "Pas encore ouvert",
        wsPending: "En préparation",
        wsNoSub: "Crédits requis",
        wsSuspended: "Abonnement suspendu",
        wsLink: "Voir WorkStudio",
      },
      wallet: {
        title: "Portefeuille",
        addFunds: "Ajouter des fonds",
        ownerOnly:
          "Seul le propriétaire de l’organisation peut ajouter des fonds.",
        freeTitle: "Accès administrateur gratuit",
        freeText:
          "Votre organisation fait partie de l’équipe de Nexora : vos requêtes ne débitent aucun crédit.",
        freeValue: "Valeur au prix public, 30 derniers jours : {amount}",
      },
      start: {
        title: "Pour démarrer",
        progress: "{done} étapes sur {total} faites",
        done: "Fait",
        todo: "À faire",
        steps: {
          key: {
            title: "Créer une clé d’API",
            text: "Une clé relie vos applications à Nexora AI.",
          },
          model: {
            title: "Essayer un modèle",
            text: "Choisissez un modèle du catalogue, puis envoyez-lui une première requête.",
          },
          workstudio: {
            title: "Ouvrir WorkStudio",
            text: "Ouvrez votre espace de travail ; il vous faut des crédits pour utiliser les modèles.",
          },
          vps: {
            title: "Installer un VPS",
            text: "Un serveur privé virtuel avec l’application de votre choix.",
          },
        },
      },
      last30: {
        title: "30 derniers jours",
        empty:
          "Aucune requête depuis 30 jours. Créez une clé et essayez un modèle : l’activité apparaîtra ici.",
        seeAll: "Voir toute l’activité",
      },
    },
    tools: {
      summaryTitle: "Mon compte en bref",
      loading: "Chargement de vos outils…",
      unavailable: {
        title: "Vos crédits et votre espace sont momentanément illisibles.",
        text: "Une erreur est survenue en lisant votre compte. Vos outils ci-dessous restent accessibles ; rechargez la page dans un instant.",
      },
      credits: {
        title: "Crédits",
        available: "Disponibles",
        total: "{count} crédits",
        totalOne: "{count} crédit",
        subscription: "Crédits d’abonnement",
        refill: "Crédits de recharge",
        expires: "Expirent le {date}",
        refillNever: "N’expirent pas",
        rule: "Les outils sont gratuits ou inclus. Tout ce qui appelle un modèle consomme des crédits, ceux d’abonnement en premier.",
        empty:
          "Il ne vous reste plus de crédits. Rechargez votre compte ou choisissez une offre.",
        addFunds: "Ajouter des fonds",
        seeOffers: "Voir les offres",
        ownerOnly:
          "Seul le propriétaire de l’organisation peut ajouter des fonds.",
        freeTitle: "Accès administrateur gratuit",
        freeText:
          "Votre organisation fait partie de l’équipe de Nexora : vos requêtes ne débitent aucun crédit.",
      },
      storage: {
        title: "Espace disque",
        usage: "{used} utilisés sur {total}",
        meterLabel: "Espace utilisé",
        meterValue: "{percent} % de l’espace utilisé",
        breakdownTitle: "Répartition par outil",
        nothingStored: "Rien n’est encore enregistré chez Nexora.",
        none: "Aucun espace pour l’instant. L’espace disque est compris dans chaque abonnement : choisissez une offre.",
        warning:
          "Votre espace est presque plein : {percent} % utilisés. Libérez de l’espace ou choisissez une offre plus grande avant que les écritures soient refusées.",
        full: "Votre espace est plein. Les nouvelles écritures sont refusées tant que vous n’avez pas libéré de l’espace ou choisi une offre plus grande ; vous pouvez toujours lire et supprimer vos données.",
        house:
          "Votre organisation fait partie de l’équipe de Nexora : l’espace n’est pas limité. {used} utilisés.",
        seeOffers: "Voir les offres",
        products: {
          workstudio: "WorkStudio",
          code: "Nexora Code",
          rag: "Nexora RAG",
          creative: "Nexora Creative",
          bot: "Nexora Bot",
        },
      },
      plan: {
        title: "Mon offre",
        none: "Aucun abonnement : rechargez ou choisissez une offre.",
        seeOffers: "Voir les offres",
        names: {
          "nexora-base": "Nexora Base",
          "nexora-pro": "Nexora Pro",
          "nexora-equipe": "Nexora Équipe",
        },
        interval: {
          month: "Facturation mensuelle",
          year: "Facturation annuelle",
        },
        renews: "Renouvellement le {date}",
        ends: "Se termine le {date} (résiliation demandée)",
        pastDue:
          "Paiement en retard : votre accès est conservé jusqu’au {date}.",
        pastDueNoDate:
          "Paiement en retard : régularisez-le pour garder votre accès.",
        manage: "Gérer mon abonnement",
      },
      groups: {
        work: {
          title: "Vos outils",
          lead: "Les outils sont gratuits ou inclus. Tout ce qui appelle un modèle consomme des crédits ; ce qui est enregistré chez Nexora compte dans votre espace.",
        },
        around: {
          title: "Autour de vos modèles",
          lead: "Le Web, la protection de vos données et les serveurs.",
        },
      },
      states: {
        label: "État",
        disponible: "Disponible",
        bientot: "Bientôt",
        plus_tard: "Plus tard",
      },
      consumes: {
        title: "Ce que cela consomme",
        credits: "Crédits",
        space: "Espace",
      },
      hints: {
        needsCredits:
          "Il vous faut des crédits pour utiliser les modèles : rechargez ou choisissez une offre.",
        needsStorage:
          "Il vous faut de l’espace : choisissez une offre ou libérez de l’espace.",
      },
      actions: {
        openWorkstudio: "Ouvrir WorkStudio",
        openCode: "Ouvrir Nexora Code",
        createRag: "Créer mon RAG",
        waitlist: "Me prévenir",
        waitlistLabel: "Me prévenir de la sortie de {name}",
        openApp: "Voir la fiche",
        openAppLabel: "Voir la fiche de {name}",
      },
      products: {
        workstudio: {
          name: "WorkStudio",
          text: "Votre espace de travail pour concevoir des agents et des flux de travaux, avec vos documents.",
          soon: "Votre instance WorkStudio est en préparation : le bouton d’ouverture apparaîtra dès qu’elle sera prête.",
          credits:
            "Les modèles que vos agents appellent consomment des crédits. L’outil lui-même est inclus.",
          space:
            "Vos fichiers et vos bases de connaissances comptent dans votre espace.",
          pageAction: "Voir WorkStudio",
        },
        code: {
          name: "Nexora Code",
          text: "Un agent de code dans un environnement de travail hébergé sur nos serveurs : rien à installer sur votre poste.",
          soon: "Un agent de code qui s’ouvrira dans un environnement de travail hébergé sur nos serveurs, sans rien installer sur votre poste. Il n’est pas encore livré.",
          credits:
            "Tout ce que l’agent fait appeler à un modèle consomme des crédits.",
          space:
            "Ce qui est enregistré dans votre environnement compte dans votre espace.",
          pageAction: "Voir Nexora Code",
        },
        rag: {
          name: "Nexora RAG",
          text: "Vos documents deviennent une base que l’IA interroge, sources à l’appui. Créez-la en un clic, puis branchez-la à vos outils avec une clé d’API.",
          soon: "Vos documents deviendront une base que l’IA interroge, sources à l’appui, créée en un clic et accessible avec une clé d’API. Elle n’est pas encore livrée.",
          credits:
            "Vous payez les jetons d’embedding et de rerank, en crédits.",
          space: "Vos documents et leurs vecteurs comptent dans votre espace.",
          pageAction: "Voir mon RAG",
        },
        bot: {
          name: "Nexora Bot",
          text: "Un bot qui se connecte à votre compte Nexora et fonctionne avec votre abonnement ou vos recharges.",
          soon: "Un bot qui se connectera à votre compte Nexora et fonctionnera avec votre abonnement ou vos recharges. Il n’est pas encore livré.",
          credits:
            "Tout ce que le bot fait appeler à un modèle consomme des crédits.",
          space: "Ce que le bot enregistre compte dans votre espace.",
          pageAction: "Voir la fiche",
        },
        creative: {
          name: "Nexora Creative",
          text: "Des outils d’image, de son et de vidéo pour le marketing.",
          soon: "Des outils d’image, de son et de vidéo pour le marketing, à une étape ultérieure. Rien n’est livré.",
          credits: "Le mode d’accès n’est pas encore arrêté.",
          space: "Ce qui est enregistré compte dans votre espace.",
          pageAction: "Voir la fiche",
        },
        webpilot: {
          name: "Nexora WebPilot",
          text: "Une API pour chercher, lire et explorer le Web.",
          soon: "Une API pour chercher, lire et explorer le Web, prévue à l’usage depuis votre solde de crédits. Elle n’est pas encore livrée.",
          credits:
            "Facturé à l’usage, depuis le même solde de crédits que les modèles.",
          space: "N’enregistre rien dans votre espace.",
          pageAction: "Voir la fiche",
        },
        "privacy-router": {
          name: "Nexora Privacy Router",
          text: "Contrôle ce qui sort de votre organisation vers un fournisseur d’IA, selon votre politique.",
          soon: "Déjà en place dans la passerelle d’API, qui n’est pas encore ouverte à la vente. Vous réglez dès maintenant la politique de votre organisation.",
          credits: "Aucun : incluse par défaut, jamais payante.",
          space: "N’occupe aucun espace.",
          pageAction: "Régler ma politique",
        },
        vps: {
          name: "VPS",
          text: "Des serveurs privés virtuels au Québec : état, accès SSH et opérations courantes.",
          soon: "Des serveurs privés virtuels au Québec : état, accès SSH et opérations courantes.",
          credits: "Abonnement propre à chaque serveur, à part de vos crédits.",
          space:
            "Le disque d’un serveur est hors du quota d’espace de votre offre.",
          pageAction: "Voir mes VPS",
        },
      },
    },
    rag: {
      title: "Nexora RAG.",
      defaultName: "Mon RAG",
      lead: "Vos documents deviennent une base que l’IA interroge, sources à l’appui. Créez-la en un clic et branchez-la à Nexora Code, à un bot ou à n’importe quel outil avec une clé d’API.",
      soon: {
        title: "Bientôt.",
        text: "Nexora RAG n’est pas encore livré. Aucune date n’est annoncée.",
        comingTitle: "Ce qui est prévu",
        coming: [
          "Une base créée en un clic, avec sa clé d’API.",
          "Vos documents indexés et interrogés, avec leurs sources.",
          "Un branchement à Nexora Code, à un bot ou à tout outil compatible MCP.",
          "L’espace occupé compté dans votre offre, et les jetons d’embedding et de rerank payés avec vos crédits.",
        ],
        waitlist: "Me prévenir",
        card: "Fiche de Nexora RAG",
      },
      unavailable: {
        title: "Le service n’est pas disponible pour le moment.",
        text: "Nexora RAG est activé, mais le service ne répond pas encore. Réessayez dans un instant.",
      },
      error: {
        title: "Impossible de lire vos bases.",
        text: "Une erreur est survenue. Réessayez dans un instant ; vos données ne sont pas touchées.",
        retry: "Réessayer",
      },
      cost: {
        title: "Ce que cela consomme",
        text: "Vous payez l’espace occupé par vos documents et leurs vecteurs, compté dans votre espace, et les jetons d’embedding et de rerank, payés avec vos crédits.",
        space: "Espace occupé par vos bases : {amount}",
        manage: "Voir mes crédits et mon espace",
      },
      bases: {
        title: "Mes bases",
        caption: "Mes bases RAG",
        empty: {
          title: "Aucune base pour l’instant.",
          text: "Créez votre RAG en un clic : nous créons la base et sa clé d’API, puis vous y ajoutez vos documents.",
        },
        columns: {
          name: "Base",
          documents: "Documents",
          space: "Espace",
          created: "Créée le",
        },
        documents: "{count} documents",
        documentsOne: "{count} document",
        pending: "{count} en attente d’indexation",
        failed: "{count} en échec",
      },
      create: {
        title: "Créer mon RAG",
        nameLabel: "Nom de la base",
        optional: "facultatif",
        nameHint: "Sans nom, nous proposons « {name} ».",
        button: "Créer mon RAG",
        working: "Création en cours…",
        ownerOnly:
          "Seul le propriétaire de l’organisation peut créer un RAG, car cela crée une clé d’API.",
        errors: {
          quota_exceeded:
            "Votre espace est épuisé ou absent. Choisissez une offre ou libérez de l’espace, puis réessayez.",
          no_credits:
            "Il vous faut des crédits pour créer un RAG. Rechargez votre compte ou choisissez une offre.",
          base_exists: "Une base porte déjà ce nom. Choisissez-en un autre.",
          model_unavailable:
            "Le modèle d’embedding n’est pas encore en service. Réessayez plus tard.",
          base_limit:
            "Vous avez atteint le nombre maximal de bases. Supprimez une base inutilisée ou écrivez-nous.",
          key_limit:
            "Vous avez atteint le nombre maximal de clés actives. Révoquez une clé inutilisée dans Modèles et clés.",
          unavailable:
            "Le service n’est pas disponible pour le moment. Réessayez dans un instant.",
          rate_limited:
            "Trop de tentatives. Patientez une minute, puis réessayez.",
          forbidden:
            "Seul le propriétaire de l’organisation peut créer un RAG.",
          unauthenticated: "Votre session a expiré. Reconnectez-vous.",
          generic: "La création a échoué. Réessayez dans un instant.",
        },
      },
      created: {
        title: "Votre RAG est prêt.",
        keyTitle: "Votre clé d’API",
        keyWarn:
          "Copiez-la maintenant : elle n’est affichée qu’une seule fois. Nexora n’en conserve que l’empreinte.",
        copy: "Copier la clé",
        copied: "Clé copiée",
        copyLabel: "Copier la clé d’API",
        next: "Ajoutez maintenant vos documents avec l’API ou le serveur MCP, puis interrogez la base.",
        dismiss: "J’ai copié ma clé",
      },
      connect: {
        title: "Se connecter",
        lead: "Utilisez votre RAG depuis Nexora Code, un bot ou n’importe quel outil. La clé d’API est créée avec la base et se gère dans Modèles et clés.",
        manageKeys: "Gérer mes clés",
        apiUrl: "Adresse de l’API",
        mcpUrl: "Adresse du serveur MCP",
        keyHint:
          "La clé se passe dans l’en-tête Authorization: Bearer. Elle n’est jamais affichée de nouveau : gardez-la dans un gestionnaire de secrets.",
        baseIdPlaceholder: "ID_DE_LA_BASE",
        snippets: {
          code: "Nexora Code (MCP)",
          mcp: "Autre outil compatible MCP",
          http: "Appel HTTP (curl)",
          env: "Variables d’environnement (bot, script)",
        },
        copy: "Copier",
        copied: "Copié",
        copyLabel: "Copier : {label}",
      },
    },
    code: {
      title: "Nexora Code.",
      lead: "Un agent de code dans un environnement de travail hébergé sur nos serveurs. Rien à installer sur votre poste : tout s’ouvre depuis votre compte Nexora.",
      soon: {
        title: "Bientôt.",
        text: "Nexora Code n’est pas encore livré. Aucune date n’est annoncée.",
        comingTitle: "Ce qui est prévu",
        coming: [
          "Un environnement de travail hébergé sur nos serveurs, un par personne, ouvert depuis votre compte.",
          "Un volume dont l’espace compte dans votre offre.",
          "Un agent de code branché sur les modèles de Nexora AI, avec vos crédits.",
          "Un branchement à votre RAG, et la compatibilité avec les plugins de Claude Code et de Codex.",
        ],
        waitlist: "Me prévenir",
        card: "Fiche de Nexora Code",
      },
      unavailable: {
        title: "Le service n’est pas disponible pour le moment.",
        text: "Nexora Code est activé, mais l’environnement hébergé ne répond pas encore. Réessayez dans un instant.",
      },
      error: {
        title: "Impossible de lire l’état de votre environnement.",
        text: "Une erreur est survenue. Réessayez dans un instant ; vos fichiers ne sont pas touchés.",
        retry: "Réessayer",
      },
      workspace: {
        title: "Mon environnement",
        statusLabel: "État",
        status: {
          stopped: "Arrêté",
          starting: "En démarrage",
          ready: "Prêt",
          error: "En erreur",
        },
        stoppedText:
          "Votre environnement est arrêté. Démarrez-le pour commencer à travailler.",
        startingText:
          "Votre environnement démarre. Cela peut prendre un moment ; cette page se met à jour toute seule.",
        readyText: "Votre environnement est prêt.",
        errorText:
          "Le démarrage a échoué. Réessayez ; si le problème continue, écrivez-nous.",
        open: "Ouvrir Nexora Code",
        start: "Démarrer mon environnement",
        working: "Démarrage…",
        volumeTitle: "Espace du volume",
        volume: "{used} utilisés dans votre environnement",
        volumeNote:
          "Ce volume compte dans votre espace disque, avec vos autres outils.",
        seeSpace: "Voir mon espace",
        errors: {
          quota_exceeded:
            "Votre espace est épuisé ou absent. Choisissez une offre ou libérez de l’espace, puis réessayez.",
          unavailable:
            "Le service n’est pas disponible pour le moment. Réessayez dans un instant.",
          rate_limited:
            "Trop de tentatives. Patientez une minute, puis réessayez.",
          unauthenticated: "Votre session a expiré. Reconnectez-vous.",
          generic: "Le démarrage a échoué. Réessayez dans un instant.",
        },
      },
      cli: {
        title: "Sur votre poste (facultatif)",
        lead: "Vous pouvez aussi utiliser Nexora Code dans votre terminal, relié à votre compte Nexora.",
        install: "Installer le CLI",
        installSoon: "La commande d’installation sera publiée ici à la sortie.",
        login: "Se connecter à votre compte",
        loginHint:
          "La commande vous renvoie vers votre compte Nexora pour confirmer la connexion.",
        copy: "Copier",
        copied: "Copié",
        copyLabel: "Copier : {label}",
      },
      plugins: {
        title: "Plugins compatibles",
        lead: "La compatibilité avec les plugins de Claude Code et de Codex est prévue, en plus des plugins propres à Nexora Code.",
        items: {
          claude: {
            name: "Plugins de Claude Code",
            text: "Commandes, agents, compétences (skills), hooks et serveurs MCP décrits dans le dossier du plugin.",
          },
          codex: {
            name: "Plugins Codex (Agent Plugins)",
            text: "Compétences et serveurs MCP décrits par le fichier plugin.json du plugin.",
          },
        },
        note: "Ce qui ne pourra pas être traduit sera signalé, jamais ignoré en silence.",
      },
    },
    models: {
      title: "Modèles et clés.",
      lead: "Créez vos clés d’API et repérez l’identifiant du modèle à appeler.",
      catalog: {
        title: "Modèles disponibles",
        lead: "Copiez l’identifiant à placer dans le champ « model » de vos requêtes.",
        copy: "Copier l’identifiant",
        copied: "Identifiant copié",
        copyLabel: "Copier l’identifiant {id}",
        sheet: "Fiche du modèle",
        sheetLabel: "Voir la fiche de {name}",
        all: "Voir tout le catalogue",
        empty: "Le catalogue n’est pas disponible pour le moment.",
        input: "Entrée : {price}",
        output: "Sortie : {price}",
        perMillion: "par million de jetons",
        identifier: "Identifiant",
      },
    },
    activity: {
      title: "Activité.",
      lead: "Vos requêtes à l’API : modèle, jetons, coût et délai. Le contenu de vos requêtes n’est jamais conservé ici.",
      invalid:
        "Certains critères de l’adresse n’étaient pas valides : ils ont été ignorés.",
      detail: {
        title: "Détail d’une requête.",
        lead: "Ce que Nexora a mesuré pour cette requête. Le contenu de ce qui a été envoyé ou reçu n’est jamais conservé.",
        back: "Retour à l’activité",
        notFound: "Cette requête est introuvable dans votre organisation.",
        general: "Requête",
        requestId: "Identifiant de la requête",
        time: "Date et heure",
        model: "Modèle",
        endpoint: "Opération",
        key: "Clé",
        status: "Statut",
        mode: "Réponse",
        streamYes: "Flux continu",
        streamNo: "Réponse complète",
        latency: "Latence",
        privacy: "Confidentialité",
        privacyDecisions: {
          allow: "Autorisée telle quelle",
          mask: "Renseignements évidents masqués",
        },
        host: "Site visité",
        tokens: "Jetons",
        prompt: "Entrée",
        cached: "dont en cache",
        cacheWrite: "dont écrits en cache",
        completion: "Sortie",
        reasoning: "dont raisonnement",
        cost: "Coût",
        price: "Prix appliqués (par million de jetons)",
        priceInput: "Entrée",
        priceOutput: "Sortie",
        priceCache: "Entrée en cache",
        priceCacheWrite: "Écriture du cache",
        priceWindow: "Plage horaire : {label}",
        total: "Coût facturé",
        totalOffered: "Valeur au prix public (offerte)",
        copy: "Copier l’identifiant",
        copied: "Identifiant copié",
        seeDetail: "Détail",
        seeDetailLabel: "Voir le détail de la requête du {time}",
      },
      filters: {
        label: "Filtrer l’activité",
        period: "Période",
        periods: {
          "24h": "24 heures",
          "7d": "7 jours",
          "30d": "30 jours",
          "90d": "90 jours",
        },
        model: "Modèle ou agent",
        allModels: "Tous",
        key: "Clé d’API",
        allKeys: "Toutes",
        status: "Statut",
        allStatuses: "Tous",
        statuses: {
          ok: "Réussie",
          error: "Échec",
          aborted: "Interrompue",
        },
        fromDay: "Du",
        toDay: "Au (inclus)",
        daysHint:
          "Jours à l’heure de Montréal. Si les deux dates sont remplies, elles remplacent la période ; videz-les pour revenir à la période.",
        apply: "Appliquer",
        reset: "Réinitialiser",
        range: "Du {from} au {to}",
      },
      summary: {
        title: "Synthèse",
        spend: "Dépense",
        spendFree: "Valeur offerte (prix public)",
        requests: "Requêtes",
        failures: "dont {count} en échec",
        noFailures: "Aucun échec",
        promptTokens: "Jetons d’entrée",
        completionTokens: "Jetons de sortie",
        cachedTokens: "Jetons en cache",
        cachedNote: "Compris dans les jetons d’entrée",
        latency: "Latence moyenne",
        none: "—",
      },
      breakdown: {
        title: "Répartition",
        empty: "Aucune donnée pour cette période.",
        byDay: "Par jour",
        byModel: "Par modèle",
        byAgent: "Par agent",
        byKey: "Par clé",
        chartLabel: "Dépense par jour, du plus ancien au plus récent",
        columns: {
          day: "Jour",
          model: "Modèle",
          agent: "Agent",
          key: "Clé",
          requests: "Requêtes",
          input: "Entrée",
          output: "Sortie",
          cached: "En cache",
          cost: "Dépense",
        },
        captionDay: "Dépense et jetons par jour",
        captionModel: "Dépense et jetons par modèle",
        captionAgent: "Dépense et jetons par agent",
        captionKey: "Dépense et jetons par clé d’API",
        keyRevoked: "Clé supprimée",
      },
      log: {
        title: "Journal des requêtes",
        caption:
          "Requêtes de la période, de la plus récente à la plus ancienne",
        empty: "Aucune requête ne correspond à ces critères.",
        columns: {
          time: "Date et heure",
          model: "Modèle",
          key: "Clé",
          status: "Statut",
          tokens: "Jetons (entrée / sortie)",
          cost: "Coût",
          latency: "Latence",
        },
        shown: "{count} requêtes affichées",
        next: "Requêtes plus anciennes",
        first: "Revenir aux plus récentes",
        stream: "flux continu",
        offered: "offert",
      },
      webpilot: {
        title: "WebPilot",
        lead: "Recherche, lecture, exploration et extraction du Web par l’API. Seules des métadonnées sont gardées : l’hôte visité (jamais l’adresse complète), le nombre de pages et le coût.",
        pagesStatic: "Pages lues",
        pagesBrowser: "Pages rendues par navigateur",
        minutes: "Minutes de navigateur",
        spend: "Coût",
        spendFree: "Valeur offerte (prix public)",
        requests: "Requêtes",
        failures: "dont {count} en échec",
        columns: {
          operation: "Opération",
          requests: "Requêtes",
          pages: "Pages",
          minutes: "Minutes",
          cost: "Coût",
        },
        caption: "WebPilot : requêtes, pages et coût par opération",
        operations: {
          search: "Recherche",
          scrape: "Lecture d’une page",
          crawl: "Exploration d’un site",
          extract: "Extraction de données",
          session: "Session de navigateur",
        },
      },
      export: {
        button: "Exporter en CSV",
        note: "Fichier CSV avec les mêmes critères : 100 000 lignes au plus, sans aucun contenu de requête.",
      },
    },
    privacy: {
      title: "Confidentialité.",
      lead: "Ce qui peut quitter votre organisation vers un fournisseur d’IA, et ce qui est masqué en route. Incluse pour tous, sans supplément.",
      readOnly:
        "Seul le propriétaire de l’organisation peut modifier la politique. Vous la voyez en lecture seule.",
      current: {
        title: "Politique en vigueur",
        version: "Version {version}, enregistrée dans l’historique",
        isDefault:
          "Politique par défaut de Nexora (niveau Standard) : aucune version enregistrée pour votre organisation.",
        invalid:
          "La politique enregistrée est illisible : par précaution, toutes les requêtes sont refusées tant qu’elle n’est pas corrigée et enregistrée de nouveau.",
      },
      level: {
        legend: "Niveau",
        standard: {
          name: "Standard",
          text: "Par défaut. Les renseignements personnels évidents sont masqués avant l’envoi à un fournisseur d’IA, la collecte de données chez le fournisseur amont est refusée et chaque sortie est journalisée sans contenu.",
        },
        renforce: {
          name: "Renforcé",
          text: "En plus : seuls les modèles et les destinations de vos listes sont permis (une liste vide ne limite rien), et les pièces jointes sont bloquées.",
        },
        souverain: {
          name: "Souverain strict",
          text: "Rien ne sort sauf ce que vous permettez nommément. Sans modèle permis, toute requête est refusée (échec fermé).",
        },
      },
      categories: {
        legend: "Renseignements reconnus",
        lead: "Chaque genre reconnu est remplacé par un jeton (par exemple [COURRIEL]) avant l’envoi. Cochez « Refuser » pour rejeter la requête au lieu de la masquer.",
        mask: "Masquer",
        deny: "Refuser",
        always: "Toujours masqué",
        items: {
          email: "Courriel",
          phone: "Téléphone (nord-américain et international)",
          credit_card: "Carte de crédit (contrôle de Luhn)",
          sin: "Numéro d’assurance sociale (NAS)",
          iban: "IBAN",
          secret: "Clés et secrets (nxk_, sk-, Bearer…)",
        },
      },
      lists: {
        legend: "Listes",
        lead: "Une entrée par ligne. Les listes de permissions s’appliquent aux niveaux Renforcé et Souverain ; les destinations interdites s’appliquent à tous les niveaux.",
        allowedModels: "Modèles permis",
        allowedModelsHint:
          "Identifiant exact ou préfixe terminé par * (par exemple mistral-*).",
        allowedHosts: "Destinations permises",
        allowedHostsHint:
          "Nom d’hôte sans https:// ni chemin : exemple.ca, ou *.exemple.ca pour les sous-domaines.",
        blockedHosts: "Destinations interdites",
        blockedHostsHint: "Même format que les destinations permises.",
      },
      attachments: {
        label: "Bloquer les pièces jointes (images, audio, fichiers)",
        hint: "Bloquées par défaut aux niveaux Renforcé et Souverain.",
      },
      save: "Enregistrer la politique",
      saving: "Enregistrement…",
      saved:
        "Politique enregistrée : version {version}. Elle s’applique en quelques secondes.",
      unchanged: "Aucun changement : la politique est déjà celle-ci.",
      errors: {
        generic: "L’enregistrement a échoué. Réessayez dans un instant.",
        unauthenticated: "Votre session a expiré. Reconnectez-vous.",
        forbidden:
          "Seul le propriétaire de l’organisation peut modifier la politique.",
        invalid_origin: "Requête refusée : origine inattendue.",
        invalid_request:
          "Vérifiez vos listes : un hôte s’écrit sans https:// ni chemin (exemple.ca ou *.exemple.ca), un modèle sans espace.",
        invalid_json: "La requête était illisible. Rechargez la page.",
        rate_limited: "Trop de tentatives. Réessayez dans une minute.",
      },
      recent: {
        title: "Décisions des {days} derniers jours",
        lead: "Nombre de requêtes selon la décision. Le contenu n’est jamais conservé.",
        allow: "Laissées passer",
        mask: "Masquées",
        deny: "Refusées",
      },
      report: {
        title: "Rapport mensuel",
        lead: "Décisions du mois par jour, opération, destination et règle, en CSV, sans aucun contenu.",
        download: "Télécharger {month} (CSV)",
      },
      history: {
        title: "Historique des versions",
        empty: "Aucune version enregistrée pour l’instant.",
        caption: "Versions de la politique",
        columns: {
          version: "Version",
          level: "Niveau",
          date: "Enregistrée le",
        },
        current: "en vigueur",
      },
      limits: {
        title: "Ce que cela ne fait pas",
        text: "La détection repère les renseignements évidents (courriel, téléphone, cartes, NAS, IBAN, clés). Elle ne reconnaît ni les noms de personnes ni les adresses postales, et une valeur déguisée peut lui échapper. Elle ne prouve pas où les données sont traitées et ne remplace ni un avis juridique ni un engagement de conformité.",
      },
    },
    workstudio: {
      title: "WorkStudio et agents.",
      lead: "Votre espace de travail pour concevoir des agents, et les agents que votre organisation appelle.",
      link: {
        title: "Branché sur un modèle",
        connected: "Branché : WorkStudio utilise votre portefeuille.",
        notYet: "Pas encore branché.",
        notYetText:
          "La clé se crée toute seule la première fois que vous ouvrez WorkStudio : vous n’avez rien à régler.",
        model: "Modèle par défaut : {model}",
        key: "Clé automatique : {prefix}…",
        keyUsed: "Dernier usage : {date}",
        keyNever: "Pas encore utilisée.",
        billing:
          "Les jetons sont facturés à votre portefeuille, au prix du catalogue.",
        billingFree:
          "Accès administrateur gratuit : aucun jeton n’est facturé.",
        balance: "Solde disponible : {amount}",
        addFunds: "Ajouter des fonds",
        seeActivity: "Voir la consommation de WorkStudio",
      },
      subscription: {
        title: "Crédits et abonnement",
        none: "Il ne vous reste plus de crédits. WorkStudio est inclus, mais les modèles qu’il appelle consomment des crédits : rechargez votre compte ou choisissez une offre.",
        seeOffers: "Voir les offres",
        manage: "Gérer l’abonnement",
        suspended:
          "Votre abonnement est suspendu : régularisez le paiement pour retrouver l’accès.",
      },
      instance: {
        title: "Votre instance",
        open: "Ouvrir WorkStudio",
        pending: "Votre instance est en préparation.",
        pendingText:
          "Le bouton d’ouverture apparaîtra ici dès que son adresse sera connue.",
        locked: "L’instance s’ouvre dès qu’il vous reste des crédits.",
      },
      agents: {
        title: "Agents appelés par votre organisation",
        lead: "Les agents hébergés que vos clés ont appelés au cours des 90 derniers jours.",
        empty: "Aucun agent appelé pour l’instant.",
        catalog: "Parcourir les agents",
        caption: "Agents appelés depuis 90 jours",
        columns: {
          agent: "Agent",
          requests: "Requêtes",
          last: "Dernier appel",
          cost: "Dépense",
        },
        removed: "Retiré du catalogue",
      },
    },
    cloud: {
      soon: "Autres services cloud : bientôt.",
    },
    billing: {
      title: "Portefeuille et facturation.",
      lead: "Votre solde, vos crédits inclus, vos recharges, vos reçus et l’historique de votre organisation.",
      free: {
        title: "Accès administrateur gratuit",
        text: "Votre organisation fait partie de l’équipe de Nexora : vos requêtes ne débitent aucun portefeuille. Les crédits, les recharges et les alertes de solde ne s’appliquent pas à elle.",
      },
      included: {
        title: "Crédits d’abonnement de la période",
        meter: "{used} de {total} crédits d’abonnement utilisés",
        meterLabel: "Part des crédits d’abonnement utilisés",
        remaining:
          "Il reste {amount} crédits d’abonnement, valables jusqu’au {date}.",
        remainingNoDate: "Il reste {amount} crédits d’abonnement.",
        note: "Un crédit vaut 1 ¢ de jetons au prix du catalogue. Les crédits d’abonnement expirent à la fin de leur période : ils servent en premier. Ensuite viennent vos crédits de recharge, qui n’expirent pas.",
        none: "Aucun crédit d’abonnement pour l’instant. Un abonnement en verse à chaque période.",
        seeOffers: "Voir les offres",
      },
      lots: {
        title: "D’où viennent vos crédits",
        lead: "Chaque lot expire à sa date ; celui qui expire en premier sert en premier.",
        caption: "Lots de crédits qui n’ont pas expiré",
        source: "Origine",
        amount: "Reçu",
        remaining: "Restant",
        expires: "Expire le",
        never: "Sans échéance",
        empty: "Aucun lot de crédits en cours.",
      },
      autoTopUp: {
        title: "Recharge automatique",
        badge: "Bientôt",
        text: "Cette option n’est pas encore disponible : aucun prélèvement ne se fera sans votre geste. Pour éviter une interruption, activez l’alerte de solde bas ci-dessous : nous vous écrivons quand le solde passe sous votre seuil.",
      },
      alert: {
        title: "Alerte de solde bas",
        lead: "Nous écrivons aux propriétaires de l’organisation quand le solde disponible passe sous ce seuil. Un seul courriel par passage sous le seuil.",
        enabled: "Activer l’alerte par courriel",
        threshold: "Seuil (CAD)",
        thresholdHint: "Par exemple 10 ou 12,50.",
        save: "Enregistrer l’alerte",
        saving: "Enregistrement…",
        saved: "Alerte enregistrée.",
        statusOn: "Alerte active : seuil de {amount}.",
        statusOff: "Aucune alerte active.",
        ownerOnly:
          "Seul le propriétaire de l’organisation peut régler l’alerte.",
        errors: {
          invalid_threshold:
            "Seuil invalide : entrez un montant en dollars, par exemple 10 ou 12,50.",
          forbidden:
            "Seul le propriétaire de l’organisation peut régler l’alerte.",
          rate_limited: "Trop de demandes. Patientez une minute.",
          generic: "L’enregistrement a échoué. Réessayez dans un moment.",
        },
      },
      history: {
        more: "Afficher plus d’écritures",
        less: "Revenir aux dernières écritures",
        shown: "{count} écritures affichées",
      },
    },
  },
};

export type AccountDictionary = typeof accountFrCA;
