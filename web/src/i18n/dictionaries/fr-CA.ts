/**
 * Dictionnaire d'interface fr-CA (langue première).
 *
 * Règles (docs/recherche/06 §11) : vouvoiement, « nous » pour Nexora AI, titres de 3 à 7 mots
 * ponctués d'un point, lexique OQLF, aucun chiffre, client, certification ou prix inventé,
 * jamais « conforme à la Loi 25 ». Le contenu éditorial réel viendra de Directus au jalon S2 ;
 * ce dictionnaire porte l'interface et les intitulés du squelette.
 *
 * Typographie : espace insécable ( ) avant « : » et à l'intérieur des guillemets « ».
 */
export const frCA = {
  meta: {
    siteName: "Nexora AI",
    home: {
      title: "Nexora AI | IA souveraine pour votre entreprise, au Québec",
      description:
        "Nexora AI conçoit des systèmes d’IA pour votre entreprise, installés chez vous ou hébergés au Québec. Vous gardez la maîtrise de vos données et de vos accès.",
    },
    notFound: {
      title: "Page introuvable | Nexora AI",
    },
  },

  a11y: {
    skipToContent: "Aller au contenu",
    homeLink: "Nexora AI, retour à l’accueil",
    mainNav: "Navigation principale",
    mobileNav: "Navigation mobile",
    footerNav: "Pied de page",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    menuTitle: "Menu",
    menuButton: "Menu",
    closeButton: "Fermer",
    languageNav: "Langue",
  },

  language: {
    label: "Langue",
    fr: { short: "FR", name: "Français (Canada)" },
    en: { short: "EN", name: "English (Canada)" },
  },

  nav: {
    sovereignty: { label: "IA souveraine", href: "/souverainete" },
    solutions: { label: "Solutions", href: "/solutions" },
    products: {
      label: "Produits",
      items: [
        {
          label: "VPS",
          description:
            "Serveurs privés virtuels au Québec, avec l’application de votre choix.",
          href: "/vps",
        },
        {
          label: "Modèles et API",
          description:
            "Une passerelle unique vers des modèles, avec la résidence des données affichée.",
          href: "/modeles",
        },
        {
          label: "WorkStudio",
          description:
            "Le studio pour concevoir des agents et des flux de travaux.",
          href: "/workstudio",
        },
        {
          label: "Nexora Apps",
          description:
            "Agent de code, Gitspace, RAG, WebPilot, Privacy Router et outils gratuits. L’état de chacun est indiqué.",
          href: "/apps",
        },
        {
          label: "Suite logicielle",
          description: "Code, Corpus et les modèles Quanta et Helix.",
          href: "/suite",
        },
        {
          label: "OPSYS-AI",
          description:
            "Une équipe coordonnée pour la construction et les services terrain.",
          href: "/opsys-ai",
        },
      ],
    },
    pricing: { label: "Tarifs", href: "/tarifs" },
    resources: { label: "Ressources", href: "/ressources" },
    login: { label: "Connexion", href: "/compte" },
    accountLabel: "Mon compte",
    cta: { label: "Planifier un diagnostic", href: "/contact" },
  },

  footer: {
    tagline: "L’IA qui travaille pour votre entreprise. Sous votre contrôle.",
    location: "Entreprise québécoise d’IA.",
    columns: [
      {
        title: "Produits",
        links: [
          { label: "VPS", href: "/vps" },
          { label: "Modèles et API", href: "/modeles" },
          { label: "WorkStudio", href: "/workstudio" },
          { label: "Nexora Apps", href: "/apps" },
          { label: "Suite logicielle", href: "/suite" },
          { label: "OPSYS-AI", href: "/opsys-ai" },
          { label: "Nexora Croissance", href: "/croissance" },
          { label: "Nexora Vision", href: "/vision" },
        ],
      },
      {
        title: "Solutions",
        links: [
          { label: "Toutes les solutions", href: "/solutions" },
          { label: "Courriels", href: "/solutions/courriels" },
          { label: "Factures", href: "/solutions/factures" },
          { label: "Service client", href: "/solutions/service-client" },
          { label: "Prise de rendez-vous", href: "/solutions/rendez-vous" },
          { label: "Comptabilité", href: "/solutions/comptabilite" },
          { label: "Documents", href: "/solutions/documents" },
        ],
      },
      {
        title: "Entreprise",
        links: [
          { label: "Services", href: "/services" },
          { label: "Modes de déploiement", href: "/deploiement" },
          { label: "Méthode", href: "/methode" },
          { label: "Entreprise", href: "/entreprise" },
          { label: "Tarifs", href: "/tarifs" },
          { label: "Contact", href: "/contact" },
        ],
      },
      {
        title: "Centre de confiance",
        links: [
          { label: "Souveraineté", href: "/souverainete" },
          { label: "Vos données", href: "/vos-donnees" },
          { label: "Loi 25", href: "/souverainete/loi-25" },
          { label: "Centre de confiance", href: "/centre-de-confiance" },
          { label: "Questions fréquentes", href: "/faq" },
          { label: "Ressources", href: "/ressources" },
        ],
      },
    ],
    legalTitle: "Légal",
    legal: [
      { label: "Mentions légales", href: "/mentions-legales" },
      { label: "Confidentialité", href: "/confidentialite" },
      { label: "Conditions d’utilisation", href: "/conditions" },
      { label: "Utilisation acceptable", href: "/utilisation-acceptable" },
    ],
    copyright: "© Nexora AI. Tous droits réservés.",
  },

  notFound: {
    label: "Erreur 404",
    title: "Cette page n’existe pas.",
    text: "Le lien est peut-être erroné, ou la page n’est pas encore publiée.",
    cta: "Retour à l’accueil",
  },

  cms: {
    priceOnRequest: "Sur demande",
    toc: { label: "Sur cette page" },
    byline: {
      by: "Par {name}",
      published: "Publié le",
      updated: "Mis à jour le",
    },
    status: {
      disponible: "Disponible",
      "acces-anticipe": "Accès anticipé",
      "qualifie-localement": "Qualifié localement",
      "en-developpement": "En développement",
      pilote: "En pilote",
      prevu: "Prévu",
      legend: "État",
    },
    modules: { detail: "Voir le détail" },
    // Textes alternatifs des schémas de section (`visual`) : le dessin décrit toujours ce que dit le texte voisin.
    visuals: {
      "perimetre-sur-place":
        "Schéma : un seul périmètre entoure vos données, le modèle et le calcul, dans vos locaux. Une demande y entre par un point de passage contrôlé et y reste.",
      "perimetre-heberge":
        "Schéma : vos données franchissent un point de passage contrôlé vers le périmètre de l’infrastructure Nexora AI, au Québec, où se trouvent le modèle et le stockage.",
      "flux-donnees":
        "Schéma : vos documents entrent par un point de passage contrôlé vers le modèle, à l’intérieur du périmètre. Ce que le système prépare ne sort qu’après l’approbation d’une personne.",
      "flux-workstudio":
        "Maquette de l’éditeur de flux de Nexora WorkStudio : un flux de facture fournisseur, de la réception du courriel à l’écriture en comptabilité, qui attend l’approbation d’une personne avant d’écrire.",
      "catalogue-modeles":
        "Maquette du catalogue de modèles : recherche, filtres par capacité et par lieu d’hébergement, quelques modèles et un exemple d’appel compatible avec OpenAI.",
      "console-vps":
        "Maquette de la console d’un serveur privé virtuel au Québec : état actif, région, accès par clé, pare-feu, terminal et courbes d’utilisation.",
      "tableau-de-bord":
        "Maquette du tableau de bord du compte : solde de crédits, plafond du mois, appels par jour et clés d’API masquées.",
      "vision-sur-place":
        "Schéma de principe : des caméras sont reliées à un serveur installé sur le site. Les images y restent ; seule une alerte écrite sort par le point de passage.",
      "croissance-canaux":
        "Schéma de principe : votre métier et votre région entrent dans Nexora Croissance, qui fait travailler ensemble site, référencement, annonces Google et Microsoft, réseaux sociaux et analyse de marché, pour produire des demandes de clients.",
      "engagements-donnees":
        "Les cinq engagements sur vos données : elles restent chez vous ou au Québec, ne servent jamais à entraîner un modèle, ne sont jamais vendues, et aucun modèle externe n’est utilisé sans votre accord écrit.",
    },
    preview: {
      banner: "Aperçu — non publié",
      version: "Version :",
      noVersion: "Aucune version en cours : contenu principal de la page",
      pageStatus: "statut",
      exit: "Quitter l’aperçu",
    },
    unavailable: {
      label: "Contenu indisponible",
      title: "Cette page est momentanément indisponible.",
      text: "Nous ne parvenons pas à lire le contenu pour l’instant. Réessayez dans quelques instants.",
      cta: "Retour à l’accueil",
    },
  },

  contact: {
    meta: {
      title: "Planifier un diagnostic | Nexora AI",
      description:
        "Décrivez votre besoin en quelques questions : Nexora AI enregistre votre demande et l'équipe vous écrit. Installation chez vous ou hébergement au Québec.",
    },
    label: "Diagnostic",
    title: "Parlons de votre besoin.",
    lead: "Quelques questions pour comprendre votre situation, puis vos coordonnées. Le message est facultatif.",
    next: {
      title: "Ce qui se passe ensuite",
      items: [
        "Votre demande est enregistrée dès l'envoi.",
        "L'équipe de Nexora AI en est avertie par courriel.",
        "Nous vous écrivons à l'adresse que vous indiquez.",
      ],
      note: "Nous n'annonçons pas de délai de réponse. Aucun engagement n'est pris par l'envoi de ce formulaire.",
    },
    noscript:
      "Ce formulaire exige JavaScript : la vérification anti-abus est calculée dans votre navigateur, sans service tiers.",
    form: {
      label: "Demande de diagnostic",
      step: "Étape {n} sur {total}",
      steps: ["Votre besoin", "Vos coordonnées"],
      required: "obligatoire",
      optional: "facultatif",
      next: "Continuer",
      back: "Retour",
      submit: "Envoyer ma demande",
      sending: "Envoi en cours…",
      errorsTitle: "Le formulaire contient des erreurs.",
      need: {
        label: "De quoi avez-vous besoin ?",
        options: {
          diagnostic: "Un diagnostic pour cerner mon besoin",
          installation: "L'installation d'un serveur d'IA",
          automatisation: "Une automatisation sur mesure",
          "opsys-ai": "OPSYS-AI (construction et services terrain)",
          workstudio: "Nexora WorkStudio",
          vision: "Nexora Vision (projet pilote sur invitation)",
          croissance: "Nexora Croissance (accès anticipé)",
          "vps-api": "Un serveur privé virtuel, des modèles ou l'API",
          autre: "Autre chose",
        },
      },
      sector: {
        label: "Votre secteur d'activité",
        placeholder: "Choisir un secteur",
        options: {
          construction: "Construction et services terrain",
          "services-professionnels": "Services professionnels",
          sante: "Santé et services sociaux",
          commerce: "Commerce et services aux clients",
          industrie: "Industrie et fabrication",
          technologie: "Technologie et développement",
          autre: "Autre secteur",
        },
      },
      deployment: {
        label: "Mode de déploiement envisagé",
        hint: "Rien n'est décidé par ce choix : il nous aide à préparer la conversation.",
        options: {
          "sur-place": "Chez vous, sur votre propre serveur",
          heberge: "Hébergé au Québec par Nexora AI",
          indecis: "Je ne sais pas encore",
        },
      },
      name: { label: "Votre nom", autocomplete: "name" },
      email: { label: "Votre courriel", autocomplete: "email" },
      company: { label: "Votre entreprise", autocomplete: "organization" },
      message: {
        label: "Votre message",
        hint: "Facultatif : le contexte, ce qui vous fait perdre du temps, vos outils actuels.",
        // Texte prérempli par les liens « liste d'attente » des fiches Nexora Apps (?sujet=apps-…), modifiable.
        prefill: {
          "apps-code": "Liste d’attente : Agent de code Nexora.",
          "apps-bot": "Liste d’attente : Nexora Bot.",
          "apps-wordpress": "Liste d’attente : Plugins WordPress Nexora.",
          "apps-gitspace": "Liste d’attente : Nexora Gitspace.",
          "apps-cloud": "Liste d’attente : Nexora Cloud.",
          "apps-rag": "Liste d’attente : Nexora RAG.",
          "apps-webpilot": "Liste d’attente : Nexora WebPilot.",
          "apps-privacy-router": "Question sur Nexora Privacy Router : ",
          "apps-creative": "Liste d’attente : Nexora Creative.",
          "apps-outils": "Liste d’attente : outils gratuits Nexora.",
        } as Record<string, string>,
      },
      consentMarketing: {
        label:
          "Je souhaite aussi recevoir des nouvelles de Nexora AI par courriel.",
        hint: "Facultatif et indépendant de votre demande : laissez cette case décochée pour seulement nous écrire.",
      },
      privacy: {
        before:
          "Les renseignements saisis servent à répondre à votre demande. Voir la ",
        link: "politique de confidentialité",
        after: ".",
      },
      honeypot: "Ne pas remplir ce champ",
      altchaLabel: "Vérification anti-abus",
      altchaPending:
        "Patientez : la vérification anti-abus se termine dans votre navigateur.",
    },
    errors: {
      required: "Ce champ est obligatoire.",
      invalid_email: "Ce courriel ne semble pas valide.",
      invalid_choice: "Choisissez une des options proposées.",
      too_long: "Ce texte est trop long.",
      invalid_chars: "Ce champ contient des caractères non permis.",
      altcha:
        "La vérification anti-abus n'a pas abouti. Réessayez dans un instant.",
      rate_limited:
        "Trop de demandes depuis votre connexion. Réessayez dans quelques minutes.",
      storage:
        "Votre demande n'a pas pu être enregistrée : rien n'a été conservé. Réessayez dans un moment.",
      network:
        "Le serveur ne répond pas. Vérifiez votre connexion et réessayez.",
      unavailable:
        "Le formulaire est momentanément fermé. Réessayez plus tard.",
    },
    success: {
      title: "Demande enregistrée.",
      text: "Votre demande est enregistrée et l'équipe de Nexora AI en est avertie. Nous vous écrirons à l'adresse indiquée. Nous n'annonçons pas de délai de réponse.",
      already:
        "Cette demande était déjà enregistrée : inutile de la renvoyer. L'équipe en a été avertie.",
      home: "Retour à l'accueil",
    },
  },

  home: {
    hero: {
      label: "IA souveraine au Québec",
      title: "L’IA qui travaille pour votre entreprise. Sous votre contrôle.",
      subtitle:
        "De la gestion de vos demandes à l’automatisation de vos opérations, Nexora AI conçoit des systèmes IA adaptés à votre métier.",
      primary: "Planifier un diagnostic",
      secondary: "Voir les solutions",
    },

    problems: {
      label: "Par où commencer",
      title: "Partez d’un problème concret.",
      lead: "Chaque système Nexora AI commence par une tâche précise de votre quotidien, puis s’étend sans multiplier les outils déconnectés.",
      items: [
        {
          title: "Demandes dispersées",
          text: "Courriels, formulaires et messages arrivent par des portes différentes. Il faut les rassembler avant d’y répondre.",
        },
        {
          title: "Ressaisie des mêmes données",
          text: "Relier vos logiciels évite de retaper la même information d’un outil à l’autre.",
        },
        {
          title: "Documents introuvables",
          text: "Retrouver une réponse dans vos documents, avec ses sources, plutôt que de fouiller des dossiers.",
        },
        {
          title: "Suivis oubliés",
          text: "Chaque demande garde sa prochaine action, son responsable et son échéance.",
        },
        {
          title: "Peu de visibilité",
          text: "Des indicateurs lisibles, sourcés et accompagnés de leur qualité, pour décider avec ce que vous avez.",
        },
      ],
      cta: "Voir les solutions",
    },

    deployment: {
      label: "Deux modes de déploiement",
      title: "Chez vous, ou au Québec.",
      lead: "Dans les deux cas, vous conservez la maîtrise de vos données, de vos accès et des usages autorisés.",
      onsite: {
        label: "Chez vous",
        title: "Installation chez vous",
        text: "Le système est installé sur votre propre infrastructure, selon vos règles d’accès.",
        diagram:
          "Schéma : un périmètre unique entoure vos données, les modèles et le calcul, dans vos locaux.",
      },
      hosted: {
        label: "Au Québec",
        title: "Hébergement chez Nexora AI",
        text: "Nous exploitons le système dans notre parc IA situé au Québec, avec les accès et les usages que vous autorisez.",
        diagram:
          "Schéma : vos données franchissent un point de passage contrôlé vers le périmètre de l’infrastructure Nexora AI au Québec.",
      },
      cta: "Comparer les deux modes",
    },

    products: {
      label: "La suite",
      title: "Des briques, un point d’entrée.",
      lead: "Des briques qui se complètent : vous choisissez le point d’entrée, le reste s’y rattache.",
      items: [
        {
          label: "VPS",
          title: "Serveurs privés virtuels",
          text: "Un serveur au Québec, avec l’application de votre choix déjà installée.",
          href: "/vps",
        },
        {
          label: "Modèles et API",
          title: "Une passerelle de modèles",
          text: "Un point d’accès unique à plusieurs modèles, hébergés au Québec ou infonuagiques, chacun avec sa résidence des données.",
          href: "/modeles",
        },
        {
          label: "WorkStudio",
          title: "Nexora WorkStudio",
          text: "Le studio pour concevoir des agents et des flux de travaux.",
          href: "/workstudio",
        },
        {
          label: "Suite",
          title: "Code, Corpus, Quanta et Helix",
          text: "Les autres composants de la suite, présentés avec leur état réel de disponibilité.",
          href: "/suite",
        },
      ],
      more: "Découvrir le produit",
    },

    opsys: {
      label: "Construction et services terrain",
      title: "Une équipe coordonnée pour votre entreprise de construction.",
      text: "OPSYS-AI réunit dix départements virtuels qui travaillent sur les mêmes dossiers, de la première demande au suivi du chantier. L’autonomie s’exerce dans des permissions précises ; les décisions engageantes gardent leurs validations.",
      departmentsLabel: "Les dix départements",
      departments: [
        { code: "M1", name: "Réception" },
        { code: "M2", name: "Relation client et ventes" },
        { code: "M3", name: "Estimation" },
        { code: "M4", name: "Terrain" },
        { code: "M5", name: "FinanceCore" },
        { code: "M6", name: "Matériel" },
        { code: "M7", name: "Marketing" },
        { code: "M8", name: "Analytique" },
        { code: "M9", name: "Stratégie" },
        { code: "M10", name: "Mémoire" },
      ],
      note: "Le niveau de disponibilité de chaque capacité est précisé sur la page OPSYS-AI.",
      cta: "Découvrir OPSYS-AI",
    },

    method: {
      label: "Notre méthode",
      title: "Cinq temps, du besoin à l’exploitation.",
      steps: [
        {
          title: "Comprendre",
          text: "Nous cartographions la tâche, les outils déjà utilisés et les règles à respecter.",
        },
        {
          title: "Intégrer",
          text: "Nous relions le système à vos logiciels pour éviter la ressaisie.",
        },
        {
          title: "Vérifier",
          text: "Nous éprouvons le système sur vos cas réels avant la mise en service.",
        },
        {
          title: "Former",
          text: "Votre équipe apprend à superviser le système et à le corriger.",
        },
        {
          title: "Exploiter et améliorer",
          text: "Nous mesurons, ajustons et maintenons dans la durée.",
        },
      ],
      cta: "Découvrir la méthode",
    },

    trust: {
      label: "Confiance",
      title: "Des engagements que l’on peut vérifier.",
      lead: "Nous n’affirmons que ce que la configuration permet de démontrer, mode de déploiement par mode de déploiement.",
      items: [
        {
          title: "Données",
          text: "Où elles sont stockées et qui y accède, documenté pour chaque mode de déploiement.",
        },
        {
          title: "Modèles",
          text: "Les modèles hébergés au Québec et les modèles infonuagiques externes sont identifiés comme tels. Aucune bascule silencieuse.",
        },
        {
          title: "Calcul",
          text: "Où tournent les traitements, sur votre infrastructure ou dans la nôtre.",
        },
        {
          title: "Exploitation",
          text: "Qui administre, ce qui est journalisé et comment revenir en arrière.",
        },
      ],
      law: "Des documents pour votre démarche Loi 25 sont en préparation.",
      cta: "Visiter le centre de confiance",
      secondary: "Lire notre approche de la souveraineté",
    },

    finalCta: {
      title: "Commençons par un cas concret.",
      text: "Un diagnostic pour cerner la tâche à automatiser et le mode de déploiement qui vous convient.",
      primary: "Planifier un diagnostic",
      secondary: "Voir les solutions",
    },
  },
};

export type Dictionary = typeof frCA;
