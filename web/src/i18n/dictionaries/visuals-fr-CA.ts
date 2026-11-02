/**
 * Textes des illustrations et maquettes d'interface (fr-CA). Tout ce qu'une maquette affiche vient d'ici :
 * jamais de texte écrit en dur dans un composant. Les maquettes montrent des données d'exemple et le disent
 * (légendes) ; aucun chiffre de performance, aucun client, aucune certification.
 */
export const visualsFrCA = {
  caption: {
    mock: "Maquette illustrative, avec des données d’exemple.",
    concept: "Schéma de principe, pas une capture d’écran.",
  },
  legend: {
    onsite: ["Vos données", "Modèle et calcul", "Demande qui entre"],
    hosted: [
      "Vos données",
      "Modèle et stockage, au Québec",
      "Point de passage",
    ],
    flow: ["Documents", "Modèle", "Approbation d’une personne"],
  },
  flow: {
    window: "Flux de travail",
    name: "Facture fournisseur",
    state: "Brouillon",
    kinds: {
      trigger: "Déclencheur",
      agent: "Agent",
      check: "Vérification",
      approval: "Approbation",
      action: "Action",
    },
    nodes: {
      trigger: { title: "Courriel reçu", sub: "Boîte des factures" },
      agent: { title: "Lire la facture", sub: "Modèle de votre choix" },
      check: {
        title: "Valider les champs",
        sub: "Montant, taxes, fournisseur",
      },
      approval: { title: "Une personne décide", sub: "Rien n’est écrit avant" },
      action: { title: "Écrire en comptabilité", sub: "Après approbation" },
    },
    inspector: {
      title: "Étape sélectionnée",
      fields: [
        ["Type", "Approbation"],
        ["Approbateur", "Responsable des comptes"],
        ["Si refusé", "Retour à la vérification"],
      ],
      logTitle: "Journal",
      log: [
        "Courriel reçu",
        "Facture lue",
        "Champs validés",
        "En attente d’une personne",
      ],
    },
  },
  catalog: {
    window: "Catalogue de modèles",
    search: "Rechercher un modèle",
    filters: ["Texte", "Vision", "Embeddings"],
    hostLabel: "Hébergement",
    hosts: ["Québec", "Canada"],
    rows: [
      {
        name: "Modèle de rédaction",
        tags: ["Texte", "Outils"],
        host: "Québec",
      },
      {
        name: "Modèle de lecture de documents",
        tags: ["Texte", "Vision"],
        host: "Canada",
      },
      { name: "Modèle de recherche", tags: ["Embeddings"], host: "Québec" },
    ],
    codeTitle: "Compatible OpenAI",
    codeComment: "# seules l’adresse et la clé changent",
  },
  vps: {
    window: "Mon serveur",
    state: "Actif",
    fields: [
      ["Région", "Québec"],
      ["Application", "Agent installé"],
      ["Accès", "Clé SSH"],
      ["Pare-feu", "Actif"],
    ],
    terminalTitle: "Terminal",
    banner: "Nexora AI : application installée",
    gauges: ["Processeur", "Mémoire", "Disque"],
  },
  dashboard: {
    window: "Utilisation",
    balance: "Solde de crédits",
    balanceValue: "25,00 $",
    cap: "Plafond du mois",
    chart: "Appels par jour",
    keysTitle: "Clés d’API",
    keys: [
      ["Clé de production", "…a91f"],
      ["Clé de test", "…c07d"],
    ],
    byModel: ["Modèle de rédaction", "Modèle de recherche"],
  },
  vision: {
    site: "Votre site",
    server: "Serveur sur place",
    alert: "Alerte",
    stays: "Les images restent sur place",
    leaves: "Seule l’alerte sort",
    event: "Zone de chargement : passage détecté",
    legend: ["Caméra", "Zone surveillée", "Seule l’alerte sort"],
  },
  growth: {
    from: "Votre métier et votre région",
    hub: "Nexora Croissance",
    channels: [
      "Site adapté à votre métier",
      "Référencement naturel",
      "Google Ads",
      "Microsoft Advertising",
      "Réseaux sociaux",
      "Analyse de marché",
    ],
    to: "Demandes de clients",
  },
  commitments: {
    items: [
      {
        title: "Chez vous",
        text: "Sur place : vos données restent sur votre serveur.",
      },
      {
        title: "Au Québec",
        text: "Hébergé : dans notre infrastructure, au Québec.",
      },
      {
        title: "Jamais pour entraîner",
        text: "Aucun modèle n’apprend de vos données.",
      },
      { title: "Jamais vendues", text: "Ni vendues, ni louées." },
      {
        title: "Accord écrit",
        text: "Aucun modèle externe sans votre accord.",
      },
    ],
  },
  hero: {
    label: "Exemple",
    received: "Demande reçue",
    prepared: "Réponse préparée",
    title: "À approuver",
    body: "Réponse à un client, préparée à partir de vos documents.",
    approve: "Approuver",
    edit: "Modifier",
    footer: "Rien ne part sans vous.",
  },
  signal: {
    motion: {
      pause: "Mettre les animations en pause",
      play: "Relancer les animations",
    },
    detection: ["ZONE 02", "MOUVEMENT", "CAM 04", "ALERTE"],
    reception: {
      window: "Réception virtuelle",
      live: "En ligne",
      call: {
        title: "Appel entrant",
        time: "14 h 02",
        caller: "Appelant",
        ai: "Réception",
        lines: [
          {
            who: "caller",
            text: "Bonjour, j’aimerais déplacer mon rendez-vous de jeudi.",
          },
          {
            who: "ai",
            text: "Bien sûr. Je peux vous proposer vendredi à 10 h ou à 14 h.",
          },
          { who: "caller", text: "Vendredi à 10 h, parfait." },
        ],
      },
      feed: {
        title: "Conversations traitées",
        items: [
          {
            channel: "call",
            who: "Appel · Mme Tremblay",
            summary: "Rendez-vous déplacé à vendredi",
            state: "Fait",
            done: true,
          },
          {
            channel: "email",
            who: "Courriel · Soumission",
            summary: "Demande qualifiée, transmise aux ventes",
            state: "Transféré",
            done: false,
          },
          {
            channel: "sms",
            who: "Texto · Livraison",
            summary: "Heure d’arrivée confirmée",
            state: "Fait",
            done: true,
          },
          {
            channel: "call",
            who: "Appel · Fournisseur",
            summary: "Résumé envoyé à la comptabilité",
            state: "Résumé",
            done: false,
          },
        ],
      },
    },
    surveillance: {
      window: "Surveillance IA",
      live: "En direct",
      camera: "CAM 04 · Entrepôt",
      timestamp: "02:14:37",
      boxes: ["Présence · zone fermée", "Rayonnage B"],
      timeline: "Activité de la nuit",
      range: "22 h – 6 h",
      alert: {
        label: "Alerte envoyée",
        title:
          "Présence détectée dans une zone fermée, après les heures d’ouverture.",
        channels: ["Texto", "Courriel", "Application", "Agent de sécurité"],
      },
      report: {
        label: "Rapport de l’événement",
        items: [
          { time: "02:14", text: "Entrée par la porte de quai 3" },
          { time: "02:15", text: "Passage dans l’allée B, extrait joint" },
          { time: "02:17", text: "Alerte transmise selon vos consignes" },
        ],
      },
    },
    infrastructure: {
      onsite: {
        label: "Chez vous",
        title: "Installée dans vos locaux",
        items: [
          "DGX Spark ou DGX Station",
          "Baie de serveurs",
          "Vos données restent sur place",
        ],
      },
      hosted: {
        label: "Chez nous",
        title: "Hébergée sur nos serveurs",
        items: [
          "Au Québec",
          "Supervisée par notre équipe",
          "Accès réservé à votre entreprise",
        ],
      },
      stack: ["Vos modèles", "Vos applications", "Sécurité", "Supervision"],
    },
  },
  notFound: { alt: "404" },
};

export type VisualsDictionary = typeof visualsFrCA;
