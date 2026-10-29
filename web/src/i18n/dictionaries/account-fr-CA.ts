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
      overview: "Aperçu | Nexora AI",
      models: "Modèles et clés | Nexora AI",
      activity: "Activité | Nexora AI",
      privacy: "Confidentialité | Nexora AI",
      workstudio: "WorkStudio et agents | Nexora AI",
      billing: "Facturation | Nexora AI",
    },
    nav: {
      label: "Espace client",
      soon: "Bientôt",
      items: {
        overview: "Aperçu",
        models: "Modèles et clés",
        activity: "Activité",
        privacy: "Confidentialité",
        workstudio: "WorkStudio et agents",
        cloud: "Cloud et VPS",
        apps: "Nexora Apps",
        billing: "Facturation",
        security: "Sécurité",
      },
    },
    overview: {
      title: "Aperçu.",
      lead: "Votre portefeuille, vos premiers pas et vos 30 derniers jours.",
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
            text: "Choisissez une offre pour accéder à votre espace de travail.",
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
      subscription: {
        title: "Abonnement WorkStudio",
        none: "Aucun abonnement WorkStudio pour le moment.",
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
        locked: "L’instance s’ouvre avec un abonnement actif.",
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
      title: "Facturation.",
      lead: "Crédits, abonnements, factures et historique de votre organisation.",
    },
  },
};

export type AccountDictionary = typeof accountFrCA;
