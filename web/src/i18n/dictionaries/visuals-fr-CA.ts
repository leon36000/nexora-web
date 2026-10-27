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
  notFound: { alt: "404" },
};

export type VisualsDictionary = typeof visualsFrCA;
