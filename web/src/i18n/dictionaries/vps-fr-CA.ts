/**
 * Dictionnaire des pages publiques VPS (fr-CA), jalon S6 : /vps, /vps/<application>, configurateur de
 * commande. Mêmes règles que les autres dictionnaires : vouvoiement, aucun chiffre, prix, certification,
 * garantie ou client inventé (les prix, les ressources et les applications viennent du catalogue publié).
 * Marqueurs `{nom}` remplacés par `fmt()`.
 */
export const vpsFrCA = {
  meta: {
    vps: {
      title: "VPS au Québec pour vos agents d’IA | Nexora AI",
      description:
        "VPS hébergés au Québec pour vos agents et outils d’IA : plans comparés, applications prêtes à installer, prix en dollars canadiens avant taxes.",
    },
    app: {
      title: "{name} sur un VPS au Québec | Nexora AI",
      description:
        "{tagline} Version {version}, licence {license}. VPS au Québec, prix en $ CA avant taxes.",
    },
    guide: {
      title: "Installer {name} sur votre VPS | Nexora AI",
      description:
        "{tagline} Guide d’installation : Nexora AI n’installe pas {name} et ne le revend pas.",
    },
  },

  nav: {
    breadcrumb: "Fil d’Ariane",
    home: "Accueil",
    vps: "VPS",
  },

  region: {
    quebec: "Québec",
    canada: "Canada",
    etats_unis: "États-Unis",
    europe: "Europe",
    autre: "Hors Canada",
  },
  units: { gb: "Go", mb: "Mo" },

  common: {
    priceNote: "Prix en dollars canadiens (CAD), avant taxes.",
    taxes: "TPS et TVQ calculées au paiement selon votre adresse.",
    renewal:
      "Renouvelé automatiquement au même tarif à chaque période, résiliable à tout moment (le service court jusqu’à la fin de la période payée).",
    beforeTaxes: "avant taxes",
    perMonth: "par mois",
    perYear: "par an",
    monthly: "Mensuel",
    yearly: "Annuel",
    yearEquivalent: "soit {price} par mois",
    notOffered: "Non offert",
    notSpecified: "Non précisé",
    devBadge: "Plan de développement — non vendable",
    suggested: "Plan suggéré",
    contactCta: "Nous écrire",
  },

  hero: {
    label: "Hébergé au Québec",
    title: "Un serveur à vous, au Québec, pour vos agents d’IA.",
    lead: "Un VPS (serveur privé virtuel) hébergé au Québec, avec accès SSH par clé, pour faire tourner vos agents et vos outils d’IA. Choisissez un plan et une application prête à installer, puis commandez.",
    primary: "Configurer mon VPS",
    secondary: "Comparer les plans",
  },

  states: {
    empty: {
      label: "Bientôt",
      title: "Nos offres VPS sont en préparation",
      text: "Aucun plan n’est publié pour le moment : c’est pourquoi aucun prix n’est affiché. Écrivez-nous pour en discuter ou pour demander une démonstration.",
      cta: "Parler à l’équipe",
    },
    unavailable: {
      label: "Indisponible",
      title: "Les offres VPS sont momentanément indisponibles",
      text: "Nous n’arrivons pas à afficher le catalogue pour l’instant. Rechargez la page dans quelques minutes ; si le problème persiste, écrivez-nous.",
      cta: "Nous écrire",
    },
  },

  plans: {
    label: "Plans",
    title: "Choisissez la taille de votre serveur",
    lead: "Chaque plan indique ses ressources telles que publiées : processeurs virtuels, mémoire, disque NVMe et bande passante. Le lieu d’hébergement est affiché pour chacun.",
    vcpu: "vCPU",
    ram: "Mémoire (RAM)",
    disk: "Disque NVMe",
    bandwidth: "Bande passante",
    location: "Lieu",
    choose: "Choisir ce plan",
    chooseLabel: "Choisir ce plan : {name}",
  },

  table: {
    title: "Comparer les plans",
    caption:
      "Comparaison des plans VPS : ressources, lieu et prix en dollars canadiens avant taxes",
    region: "Tableau de comparaison des plans, défilable horizontalement",
    plan: "Plan",
    monthly: "Prix mensuel",
    yearly: "Prix annuel",
  },

  configurator: {
    title: "Configurer et commander",
    lead: "Quatre choix, puis le paiement sécurisé\u00a0: plan, application, durée et clé SSH.",
    stepPlan: "1. Plan",
    stepApp: "2. Application",
    stepTerm: "3. Durée",
    stepKey: "4. Clé SSH publique",
    planHint: "Les plans trop petits pour l’application choisie sont grisés.",
    appHint:
      "Seules les applications installées par Nexora AI sont offertes à la commande.",
    tooSmall: "Trop petit : cette application demande au moins {ram}.",
    specLine: "{vcpu} vCPU · {ram} · {disk} NVMe",
    minRam: "Mémoire minimale : {ram}",
    termNotOffered: "Non offert pour ce plan",
    termMonthlyLead: "Facturé chaque mois.",
    termYearlyLead: "Facturé une fois par an.",
    termYearlyTotal: "{total} par an",
    noApps:
      "Aucune application prête à installer n’est publiée pour le moment : la commande en ligne n’est pas encore ouverte.",
    noCompatiblePlan:
      "Aucun plan publié n’a assez de mémoire pour cette application.",
    keyHint:
      "Collez votre clé PUBLIQUE sur une seule ligne : ed25519, ECDSA ou RSA de 2048 bits ou plus. Ne collez jamais votre clé privée.",
    keyPlaceholder: "ssh-ed25519 AAAA… vous@poste",
    keygenSummary: "Comment générer une clé ?",
    keygenIntro:
      "Dans un terminal sur votre poste, créez une paire de clés. La commande vous demande une phrase secrète facultative : elle protège votre clé privée sur votre poste et n’est jamais envoyée à Nexora AI.",
    keygenCommand: "ssh-keygen -t ed25519",
    keygenShow:
      "Affichez ensuite la clé publique (le fichier qui se termine par .pub) et collez son contenu ci-dessus :",
    keygenShowCommand: "cat ~/.ssh/id_ed25519.pub",
    keygenPrivate:
      "Le fichier sans extension .pub est votre clé privée : gardez-la sur votre poste.",
    hostnameLabel: "Nom du serveur",
    hostnameOptional: "facultatif",
    hostnameHint:
      "Lettres minuscules, chiffres et tirets (32 caractères au maximum).",
    promoLabel: "Code promo",
    promoOptional: "facultatif",
    promoHint:
      "Facultatif. Le rabais est vérifié au moment de la commande et apparaît sur la page de paiement.",
    promoPlaceholder: "Votre code",
    summaryTitle: "Votre commande",
    summaryPlan: "Plan",
    summaryApp: "Application",
    summaryTerm: "Durée",
    summaryTotal: "Total avant taxes",
    summaryLocation: "Lieu",
    summaryEmpty: "Complétez les choix pour voir le total.",
    devWarning:
      "Plan de développement : il n’est pas vendable. Ne le commandez qu’avec des paiements de test.",
    submit: "Commander",
    submitting: "Redirection vers le paiement…",
    stripeNote:
      "Le paiement se fait sur une page sécurisée. Vous ne saisissez aucune information de carte sur ce site.",
    loginLink: "Se connecter",
    signupLink: "Créer un compte",
    errors: {
      unauthenticated:
        "Connectez-vous (ou créez un compte) pour commander, puis revenez à cette page : votre choix de plan, d’application et de durée est conservé dans l’adresse.",
      forbidden:
        "Seul le propriétaire de l’organisation peut commander un VPS.",
      invalid_ssh_key:
        "Clé SSH refusée. Collez une clé PUBLIQUE (ed25519, ECDSA ou RSA de 2048 bits ou plus) sur une seule ligne, par exemple le contenu du fichier id_ed25519.pub. Ne collez jamais votre clé privée.",
      key_empty: "Collez votre clé SSH publique pour continuer.",
      key_private:
        "Ceci ressemble à une clé privée : elle n’a pas été envoyée. Ne la collez jamais ici ; collez la clé publique (le fichier qui se termine par .pub).",
      key_multiple: "La clé doit tenir sur une seule ligne.",
      invalid_hostname:
        "Nom de serveur invalide : lettres minuscules, chiffres et tirets seulement, 32 caractères au maximum, sans tiret au début ni à la fin.",
      plan_too_small: "Ce plan est trop petit pour cette application.",
      term_unavailable: "Cette durée n’est pas offerte pour ce plan.",
      plan_not_synced:
        "Ce plan n’est pas encore prêt à la vente (son prix se synchronise avec le service de paiement). Réessayez plus tard ou écrivez-nous.",
      limit_reached:
        "Vous avez atteint le nombre maximal de VPS pour votre organisation.",
      rate_limited: "Trop de tentatives. Patientez une minute, puis réessayez.",
      payment_unavailable:
        "Le service de paiement est momentanément indisponible. Aucun paiement n’a été effectué ; réessayez dans un moment.",
      catalog_changed:
        "Ce plan ou cette application n’est plus offert. Rechargez la page pour voir le catalogue à jour.",
      already_processed:
        "Cette commande a déjà été traitée. Consultez vos VPS dans votre espace client.",
      network: "Connexion impossible. Vérifiez votre réseau, puis réessayez.",
      generic: "La commande n’a pas pu être créée. Réessayez dans un moment.",
      promo_unknown: "Ce code promo n’existe pas ou n’est plus valide.",
      promo_expired: "Ce code promo est expiré.",
      promo_exhausted:
        "Ce code promo a atteint son nombre maximal d’utilisations.",
      promo_wrong_scope: "Ce code ne s’applique pas à ce type d’achat.",
      promo_staff_only: "Ce code est réservé à l’équipe de Nexora.",
      promo_first_order_only: "Ce code est réservé à une première commande.",
      promo_already_used: "Votre organisation a déjà utilisé ce code.",
      promo_min_amount: "Ce code exige un montant d’achat plus élevé.",
      promo_not_ready:
        "Ce code n’est pas encore activé. Réessayez plus tard ou contactez-nous.",
      promo_covers_all:
        "Ce code couvrirait la totalité de l’achat : choisissez une autre option.",
    },
  },

  apps: {
    label: "Applications",
    title: "Applications prêtes à installer",
    lead: "Choisissez une application à la commande : Nexora AI l’installe sur votre VPS dans la version indiquée. Chaque fiche donne la version, la licence et les ports.",
    empty: "Aucune application n’est publiée pour le moment.",
    kind: "Prête à installer",
    version: "Version {version}",
    license: "Licence {license}",
    minRam: "Mémoire minimale : {ram}",
    view: "Voir la fiche de {name}",
  },

  guides: {
    label: "Guides",
    title: "Des outils à installer vous-même",
    lead: "Certaines applications ne sont pas installées par Nexora AI : leur licence ne s’y prête pas (par exemple n8n, Open WebUI ou Dify). Vous les installez vous-même sur votre VPS, sous votre propre licence, en suivant le guide de leur fiche.",
    kind: "À installer vous-même sous votre licence",
    license: "Licence {license}",
    view: "Voir le guide de {name}",
  },

  faq: {
    title: "Questions fréquentes",
    items: {
      whatIs: {
        q: "Qu’est-ce qu’un VPS ?",
        a: "Un VPS (serveur privé virtuel) est un serveur virtuel que vous administrez : vous disposez de votre propre système, séparé de celui des autres clients, avec les ressources du plan choisi (processeurs, mémoire, disque). Vous y faites tourner vos agents et vos outils d’IA.",
      },
      data: {
        q: "Où sont mes données ?",
        a: "Le VPS est hébergé au Québec et ses données résident sur son disque. Les applications que vous y installez et les services externes que vous y raccordez (par exemple un fournisseur de modèles d’IA) peuvent toutefois envoyer des données ailleurs : à vous d’en vérifier l’emplacement.",
      },
      ssh: {
        q: "Comment accède-t-on au serveur ? Y a-t-il un mot de passe ?",
        a: "L’accès se fait en SSH, uniquement avec votre clé : vous fournissez votre clé PUBLIQUE à la commande. Aucun mot de passe SSH n’est créé ni demandé, et Nexora AI ne voit jamais votre clé privée.",
      },
      tunnel: {
        q: "Les applications sont-elles ouvertes sur Internet ?",
        a: "Par défaut, non : leurs interfaces écoutent seulement à l’intérieur du serveur (127.0.0.1). Vous y accédez par un tunnel SSH depuis votre poste, par exemple pour le port 3000 :",
        code: "ssh -N -L 3000:127.0.0.1:3000 utilisateur@adresse-de-votre-vps",
        after:
          "Ouvrez ensuite http://localhost:3000 dans votre navigateur. La fiche de chaque application indique ses ports et s’ils sont accessibles par tunnel ou ouverts.",
      },
      renewal: {
        q: "Comment fonctionne le renouvellement ?",
        a: "Le VPS est renouvelé automatiquement au même tarif à chaque période, mensuelle ou annuelle. Vous pouvez résilier à tout moment : le service court jusqu’à la fin de la période payée.",
      },
      unpaid: {
        q: "Que se passe-t-il en cas d’impayé ?",
        a: "Si un paiement échoue, un délai de grâce de 7 jours s’applique. Passé ce délai, le VPS est suspendu.",
      },
      cancel: {
        q: "Que se passe-t-il si je résilie ?",
        a: "Le service court jusqu’à la fin de la période payée. Ensuite, le VPS est arrêté, puis supprimé après 7 jours.",
      },
      reinstall: {
        q: "Que fait une réinstallation ?",
        a: "Elle efface les données du VPS pour repartir d’une installation neuve. Nexora AI garde toutefois un instantané du disque pendant 7 jours.",
      },
      port25: {
        q: "Puis-je envoyer des courriels depuis le VPS ?",
        a: "Le port 25 sortant (envoi direct de courriel) est fermé par défaut, pour limiter les abus. Pour envoyer des courriels, passez par un service d’envoi tiers.",
      },
      taxes: {
        q: "Les prix incluent-ils les taxes ?",
        a: "Non. Les prix sont en dollars canadiens, avant taxes. La TPS et la TVQ sont calculées au paiement selon votre adresse.",
      },
    },
  },

  appPage: {
    back: "Tous les VPS",
    kindApp: "Application prête à installer",
    kindGuide: "Guide d’installation",
    version: "Version épinglée",
    license: "Licence",
    licenseText: "Voir le texte de la licence",
    upstream: "Projet d’origine",
    minRam: "Mémoire minimale",
    licenseWarning: "Avertissement de licence",
    ports: "Ports",
    portsLead:
      "Ports de l’application sur votre VPS. Un port « tunnel » n’est pas ouvert sur Internet : vous l’atteignez par un tunnel SSH.",
    portTunnel: "Accès par tunnel SSH",
    portPublic: "Ouvert",
    portLine: "{port}/{proto}",
    tunnelExample: "Exemple de tunnel pour le port {port} :",
    tunnelCommand:
      "ssh -N -L {port}:127.0.0.1:{port} utilisateur@adresse-de-votre-vps",
    plansTitle: "Plans compatibles",
    plansLead:
      "Plans dont la mémoire atteint le minimum requis ({ram}). Prix en dollars canadiens, avant taxes.",
    noCompatible:
      "Aucun plan publié n’a assez de mémoire pour cette application pour le moment.",
    plansPending:
      "Nos offres VPS sont en préparation : aucun prix n’est affiché pour le moment.",
    plansUnavailable:
      "Les plans sont momentanément indisponibles. Rechargez la page dans quelques minutes.",
    order: "Commander avec cette application",
    guideTitle: "Guide d’installation",
    guideNotice: "Nexora AI n’installe pas {name} et ne le revend pas.",
    guideNoticeText:
      "{name} s’installe par vos soins, sous votre propre licence, sur un VPS. Les étapes ci-dessous sont un point de départ : suivez toujours la documentation officielle du projet.",
    guideOrderNote:
      "La commande en ligne propose pour l’instant un VPS livré avec une application prête à installer. Pour un VPS vierge, écrivez-nous.",
    guideSeeVps: "Voir les VPS",
    guideBlank: "Demander un VPS vierge",
    faqTitle: "Questions sur {name}",
    faq: {
      access: {
        q: "Comment accéder à {name} ?",
        a: "Les ports de {name} sont listés plus haut. Un port « tunnel » n’est pas ouvert sur Internet : vous l’atteignez par un tunnel SSH depuis votre poste. Un port « ouvert » est accessible depuis Internet.",
      },
      license: {
        q: "Sous quelle licence est {name} ?",
        a: "{name} est publié sous la licence {license}. Le texte complet est accessible depuis cette page ; vérifiez qu’il convient à votre usage.",
      },
      version: {
        q: "Quelle version est installée ?",
        a: "Nexora AI installe la version {version}. Pour les nouvelles versions et les avis de sécurité, suivez le projet d’origine.",
      },
      whoInstalls: {
        q: "Qui installe {name} ?",
        a: "Vous. Nexora AI ne l’installe pas et ne le revend pas : vous suivez le guide sur votre propre VPS, sous votre licence.",
      },
      ram: {
        q: "De quelle mémoire ai-je besoin ?",
        a: "La fiche indique un minimum de {ram} de mémoire. Les plans compatibles sont listés plus haut.",
      },
    },
  },
};

export type VpsDictionary = typeof vpsFrCA;
