/**
 * Dictionnaire d'interface fr-CA (langue première).
 *
 * Règles (docs/recherche/06 §11) : vouvoiement, « nous » pour Nexora, titres de 3 à 7 mots
 * ponctués d'un point, lexique OQLF, aucun chiffre, client, certification ou prix inventé,
 * jamais « conforme à la Loi 25 ». Le contenu éditorial réel viendra de Directus au jalon S2 ;
 * ce dictionnaire porte l'interface et les intitulés du squelette.
 *
 * Typographie : espace insécable ( ) avant « : » et à l'intérieur des guillemets « ».
 */
export const frCA = {
  meta: {
    siteName: "Nexora",
    home: {
      title: "Nexora | IA souveraine pour votre entreprise, au Québec",
      description:
        "Nexora conçoit des systèmes d’IA pour votre entreprise, installés chez vous ou hébergés au Québec. Vous gardez la maîtrise de vos données et de vos accès.",
    },
    notFound: {
      title: "Page introuvable | Nexora",
    },
  },

  a11y: {
    skipToContent: "Aller au contenu",
    homeLink: "Nexora, retour à l’accueil",
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
          description: "Serveurs privés virtuels au Québec, avec l’application de votre choix.",
          href: "/vps",
        },
        {
          label: "Modèles et API",
          description: "Une passerelle unique vers des modèles, avec la résidence des données affichée.",
          href: "/modeles",
        },
        {
          label: "Agents",
          description: "Des agents hébergés, appelables par API avec votre clé.",
          href: "/agents",
        },
        {
          label: "WorkStudio",
          description: "Le studio pour concevoir des agents et des flux de travaux.",
          href: "/workstudio",
        },
        {
          label: "Suite logicielle",
          description: "Code, Corpus et les modèles Quanta et Helix.",
          href: "/suite",
        },
        {
          label: "OPSYS-AI",
          description: "Une équipe coordonnée pour la construction et les services terrain.",
          href: "/opsys-ai",
        },
      ],
    },
    pricing: { label: "Tarifs", href: "/tarifs" },
    resources: { label: "Ressources", href: "/ressources" },
    login: { label: "Connexion", href: "/compte" },
    cta: { label: "Planifier un diagnostic", href: "/contact" },
  },

  footer: {
    tagline: "L’IA qui travaille pour votre entreprise. Sous votre contrôle.",
    location: "Entreprise québécoise d’IA souveraine.",
    columns: [
      {
        title: "Produits",
        links: [
          { label: "VPS", href: "/vps" },
          { label: "Modèles et API", href: "/modeles" },
          { label: "Agents", href: "/agents" },
          { label: "WorkStudio", href: "/workstudio" },
          { label: "Suite logicielle", href: "/suite" },
          { label: "OPSYS-AI", href: "/opsys-ai" },
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
    copyright: "© Nexora. Tous droits réservés.",
  },

  notFound: {
    label: "Erreur 404",
    title: "Cette page n’existe pas.",
    text: "Le lien est peut-être erroné, ou la page n’est pas encore publiée.",
    cta: "Retour à l’accueil",
  },

  home: {
    hero: {
      label: "IA souveraine au Québec",
      title: "L’IA qui travaille pour votre entreprise. Sous votre contrôle.",
      subtitle:
        "De la réception de vos appels à l’automatisation de vos opérations, Nexora conçoit des systèmes IA adaptés à votre métier — installés chez vous ou hébergés dans notre infrastructure au Québec.",
      primary: "Planifier un diagnostic",
      secondary: "Voir les solutions",
    },

    problems: {
      label: "Par où commencer",
      title: "Partez d’un problème concret.",
      lead: "Chaque système Nexora commence par une tâche précise de votre quotidien, puis s’étend sans multiplier les outils déconnectés.",
      items: [
        {
          title: "Appels non traités",
          text: "Une demande manquée est une demande perdue. Un système peut répondre, qualifier et transférer avec le bon contexte.",
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
        title: "Installation souveraine",
        text: "Le système est installé sur votre propre infrastructure, selon vos règles d’accès.",
        diagram: "Schéma : un périmètre unique entoure vos données, les modèles et le calcul, dans vos locaux.",
      },
      hosted: {
        label: "Au Québec",
        title: "Hébergement chez Nexora",
        text: "Nous exploitons le système dans notre parc IA situé au Québec, avec les accès et les usages que vous autorisez.",
        diagram: "Schéma : vos données franchissent un point de passage contrôlé vers le périmètre de l’infrastructure Nexora au Québec.",
      },
      cta: "Comparer les deux modes",
    },

    products: {
      label: "La suite",
      title: "Un ensemble, pas des abonnements empilés.",
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
          label: "Agents",
          title: "Agents hébergés",
          text: "Des agents conçus dans WorkStudio, appelables par API avec votre clé.",
          href: "/agents",
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
      law: "Conçu pour faciliter votre conformité à la Loi 25.",
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
