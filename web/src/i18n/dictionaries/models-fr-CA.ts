/**
 * Dictionnaire des pages PUBLIQUES de modèles (fr-CA) : liste filtrable, fiche, comparateur et classements par
 * épreuve. Même règles que les autres dictionnaires : vouvoiement, aucun chiffre, prix, mesure ou promesse inventé
 * (tout chiffre affiché vient de la fiche publiée du modèle). Marqueurs `{nom}` remplacés par `fmt()`.
 */
export const modelsFrCA = {
  meta: {
    list: {
      title: "Modèles d’IA, prix et benchmarks | Nexora AI",
      description:
        "Catalogue public des modèles d’IA de Nexora AI : prix en dollars canadiens, contexte, spécifications, benchmarks sourcés, licence et hébergeur de chacun.",
    },
    benchmarks: {
      title: "Classements des modèles par épreuve | Nexora AI",
      description:
        "Classements par épreuve des modèles du catalogue Nexora AI : chaque résultat renvoie à l’éditeur qui l’a publié et à sa source, sans mesure inventée.",
    },
    compare: {
      title: "Comparer des modèles d’IA | Nexora AI",
      description:
        "Comparez de deux à quatre modèles du catalogue Nexora AI côte à côte : prix en dollars canadiens, contexte, spécifications et benchmarks communs.",
    },
    model: {
      /** Avec un prix et un contexte publiés. */
      full: "{name}{by} : {context} jetons de contexte, entrée à {input} et sortie à {output} par million de jetons (CAD). Spécifications, benchmarks sourcés et appel par API.",
      /** Embeddings : un seul prix. */
      embedding:
        "{name}{by} : {context} jetons de contexte, {input} par million de jetons (CAD). Spécifications, benchmarks sourcés et appel par API.",
      by: " ({author})",
    },
  },

  tags: {
    raisonnement: "Raisonnement",
    code: "Code",
    agents: "Agents",
    vision: "Vision",
    multilingue: "Multilingue",
    "contexte-long": "Contexte long",
    rapide: "Rapide",
    economique: "Économique",
    "poids-ouverts": "Poids ouverts",
    embeddings: "Embeddings",
  },
  modality: {
    text: "Texte",
    image: "Image",
    video: "Vidéo",
    audio: "Audio",
    embedding: "Vecteurs (embeddings)",
  },
  sorts: {
    recents: "Plus récents",
    "prix-entree": "Prix d’entrée croissant",
    "prix-entree-desc": "Prix d’entrée décroissant",
    "prix-sortie": "Prix de sortie croissant",
    "prix-sortie-desc": "Prix de sortie décroissant",
    contexte: "Contexte le plus grand",
    nom: "Nom (A à Z)",
  },
  availability: {
    live: "Disponible",
    preview: "Aperçu",
  },
  license: {
    open: "Poids ouverts",
    closed: "Poids non publiés",
    unread: "Texte de la licence non lu",
  },

  hero: {
    label: "Modèles et API",
    title: "Une clé. Tous les modèles du catalogue.",
    lead: "Un compte, une API au format d’OpenAI : vous changez de modèle en changeant une ligne. Chaque fiche donne le prix en dollars canadiens, le contexte, les mesures publiées et le lieu d’hébergement. Le catalogue est en aperçu ; l’appel par API n’est pas encore ouvert.",
    primary: "Parcourir le catalogue",
    secondary: "Documentation de l’API",
    points: [
      {
        title: "Format d’OpenAI",
        text: "Vos outils et vos bibliothèques actuels s’y branchent.",
      },
      {
        title: "Prix en dollars canadiens",
        text: "Par million de jetons, affiché sur chaque fiche.",
      },
      {
        title: "Hébergement affiché",
        text: "Vous voyez où tourne chaque modèle avant de l’appeler.",
      },
    ],
    request: "Exemple d’appel",
    response: "Réponse en continu",
    answer: "Bonjour ! Comment puis-je vous aider ?",
    caption:
      "Exemple d’appel avec une clé et un modèle fictifs ; la réponse est figurée.",
  },

  list: {
    label: "Modèles",
    title: "Les modèles, leurs prix et leurs benchmarks.",
    lead: "Filtrez par catégorie, capacité, licence ou prix. Chaque fiche donne les prix en dollars canadiens, les spécifications, les mesures publiées avec leur source et l’appel par API.",
    searchLabel: "Rechercher un modèle",
    searchHint: "Nom, éditeur, famille ou identifiant",
    sortLabel: "Trier par",
    viewLabel: "Affichage",
    views: { cartes: "Cartes", tableau: "Tableau" },
    apply: "Appliquer",
    reset: "Réinitialiser",
    filtersLabel: "Filtrer les modèles",
    filtersSummary: "Filtres",
    filtersActive: "Filtres ({count})",
    shortcutsLabel: "Catégories",
    shortcutsAll: "Tous",
    groups: {
      kind: "Type",
      inputs: "Entrées acceptées",
      tags: "Catégories",
      capabilities: "Capacités",
      author: "Éditeur",
      license: "Licence",
      availability: "Disponibilité",
      residency: "Hébergement",
      context: "Contexte minimal",
      priceIn: "Prix d’entrée maximal",
      priceOut: "Prix de sortie maximal",
    },
    any: "Peu importe",
    anyPrice: "Aucun plafond",
    anyContext: "Aucun minimum",
    kinds: {
      chat: "Conversation",
      embedding: "Embeddings",
      rerank: "Reclassement",
    },
    licenseOptions: { ouverte: "Poids ouverts", fermee: "Poids non publiés" },
    availabilityOptions: {
      disponible: "Disponibles",
      apercu: "En aperçu",
    },
    contextAtLeast: "{n} jetons ou plus",
    priceAtMost: "{price} ou moins",
    count: {
      one: "{count} modèle sur {total}",
      other: "{count} modèles sur {total}",
    },
    updated: "Catalogue au {date}.",
    priceNote: "Prix en dollars canadiens (CAD), avant taxes.",
    activeFilters: "Filtres actifs",
    removeFilter: "Retirer le filtre : {label}",
    chip: {
      q: "Recherche : {value}",
      minContext: "Contexte : {value} jetons ou plus",
      maxInput: "Entrée : {value} ou moins",
      maxOutput: "Sortie : {value} ou moins",
    },
    empty: {
      title: "Aucun modèle ne correspond à ces filtres.",
      text: "Retirez un filtre ci-dessous ou repartez du catalogue complet.",
      reset: "Voir tous les modèles",
    },
    previewBanner: {
      text: "Catalogue en aperçu : fiches et prix de développement publics ; l’appel par API n’est pas encore ouvert.",
      pricing: "Voir les tarifs",
      notify: "Me prévenir à l’ouverture",
    },
    emptyCatalog:
      "Le catalogue est en cours de préparation : aucun modèle n’est publié pour le moment.",
    card: {
      view: "Voir la fiche de {name}",
      input: "Entrée",
      output: "Sortie",
      context: "Contexte",
      unit: "par million de jetons",
      tokens: "jetons",
      previewBadge: "Aperçu",
      previewHint: "Pas encore appelable",
      devNote: "Prix de développement",
      noDescription: "",
    },
    table: {
      label: "Modèles du catalogue",
      model: "Modèle",
      author: "Éditeur",
      context: "Contexte",
      input: "Entrée",
      output: "Sortie",
      license: "Licence",
      status: "État",
      compare: "Comparer",
      sortBy: "Trier par {column}",
      unitNote: "Prix en CAD par million de jetons.",
      none: "—",
    },
    compare: {
      add: "Comparer",
      remove: "Retirer",
      addLabel: "Comparer {name}",
      removeLabel: "Retirer {name} de la comparaison",
      full: "Comparaison pleine (4 modèles)",
      trayLabel: "Modèles à comparer",
      selected: {
        one: "{count} modèle sélectionné",
        other: "{count} modèles sélectionnés",
      },
      go: "Comparer ces modèles",
      needTwo: "Choisissez au moins deux modèles.",
      clear: "Vider la sélection",
      max: "Quatre modèles au plus.",
    },
    benchmarksLink: "Voir les classements par épreuve",
  },

  detail: {
    breadcrumb: "Fil d’Ariane",
    home: "Accueil",
    models: "Modèles",
    sectionsLabel: "Sections de la fiche",
    sections: {
      overview: "Aperçu",
      pricing: "Tarifs",
      benchmarks: "Benchmarks",
      similar: "Similaires",
      api: "Utiliser l’API",
    },
    by: "Par {author}",
    family: "Famille {family}",
    previewBadge: "Aperçu",
    previewBanner:
      "Modèle en aperçu : la fiche et les prix sont publiés, l’appel par API n’est pas encore ouvert.",
    contextChip: "{n} jetons de contexte",
    inputChip: "Entrée {price}",
    outputChip: "Sortie {price}",
    perMillion: "par million de jetons",
    sunset: "Retrait prévu le {date}.",
    compareLink: "Comparer avec d’autres modèles",
    homepage: "Page de l’éditeur",
    overview: {
      title: "Aperçu",
      noDescription:
        "L’éditeur n’a pas encore fourni de description détaillée de ce modèle.",
      specs: "Spécifications",
      capabilities: "Capacités",
      noCapabilities: "Aucune capacité particulière déclarée.",
      tags: "Catégories",
    },
    specs: {
      author: "Éditeur",
      family: "Famille",
      context: "Contexte maximal",
      maxOutput: "Sortie maximale",
      parameters: "Paramètres",
      total: "{n} Md au total",
      active: "{n} Md actifs",
      quantization: "Quantification",
      inputs: "Entrées acceptées",
      outputs: "Sorties produites",
      released: "Date de sortie",
      cutoff: "Connaissances jusqu’en",
      license: "Licence",
      licenseLink: "Lire la licence",
      host: "Hébergeur",
      hostRegion: "Lieu d’hébergement",
      dataPolicy: "Politique de données de l’hébergeur",
      dataPolicyMissing:
        "L’hébergeur n’a pas encore déclaré de politique de données.",
      tokens: "jetons",
      unknown: "Non précisé",
    },
    nexoraNote:
      "La passerelle de Nexora AI ne garde que des métadonnées d’usage (modèle, jetons, coût, durée), jamais le contenu de vos requêtes.",
    pricing: {
      title: "Tarifs",
      lead: "Facturé au coût réel de chaque requête, selon les jetons d’entrée et de sortie.",
      note: "Prix en dollars canadiens (CAD), avant taxes, par million de jetons.",
      devNote: "Prix de développement, non définitif.",
      input: "Entrée",
      output: "Sortie",
      cachedInput: "Entrée en cache",
      cacheWrite: "Écriture en cache",
      embeddingOnly:
        "Un modèle d’embeddings ne facture que les jetons d’entrée.",
      tableLabel: "Tarifs par million de jetons",
      windows: "Plages horaires",
      windowsLead:
        "Le prix de base s’applique en dehors de ces plages ; les heures sont en UTC.",
      window: "Plage « {label} »",
      days: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
      windowCols: { window: "Plage", input: "Entrée", output: "Sortie" },
    },
    benchmarks: {
      title: "Benchmarks",
      lead: "Mesures publiées sur ce modèle, groupées par catégorie. Chaque résultat nomme celui qui l’a publié et renvoie à sa source.",
      warningTitle: "À lire avant de comparer",
      warning:
        "Ces chiffres sont publiés par des éditeurs différents, avec des méthodes différentes : ils ne sont pas strictement comparables entre eux, ni d’un modèle à l’autre.",
      none: "Aucune mesure chiffrée n’est publiée à ce jour pour ce modèle. Nous n’en affichons aucune plutôt que d’en inventer.",
      other: "Autres mesures",
      publishedBy: "Publié par {publisher}",
      source: "Source",
      measured: "mesuré le {date}",
      scoreLabel: "{name} : {score}",
      rankings: "Classements par épreuve",
      sources: "Sources consultées",
      readOn: "lue le {date}",
      notes: "Notes",
    },
    similar: {
      title: "Modèles similaires",
      lead: "Des modèles qui partagent au moins une catégorie avec celui-ci, du prix le plus proche au plus éloigné.",
    },
    api: {
      title: "Utiliser l’API",
      lead: "Remplacez la clé de l’exemple par la vôtre. Les exemples utilisent l’adresse de l’API : {url}.",
      embeddingLead:
        "Ce modèle produit des vecteurs : il s’appelle par /v1/embeddings.",
      rerankLead:
        "Ce modèle classe des documents selon leur pertinence pour une requête : il s’appelle par /v1/rerank.",
      idLabel: "Identifiant à passer dans le champ model",
      previewTitle: "Bientôt disponible",
      previewText:
        "Ce modèle est en aperçu : sa fiche et ses prix sont publiés, mais il n’est pas encore appelable. Un appel avec son identifiant échouera tant qu’il n’est pas ouvert, c’est pourquoi aucun exemple d’appel n’est proposé ici.",
      notify: "Me prévenir à l’ouverture",
      seeLive: "Voir les modèles déjà disponibles",
      docs: "Lire la documentation",
    },
    cta: {
      title: "Prêt à l’essayer ?",
      text: "Créez un compte, rechargez votre portefeuille et générez une clé API : un seul accès pour tout le catalogue.",
      signup: "Créer un compte",
      wallet: "Ouvrir mon portefeuille",
    },
  },

  compare: {
    label: "Comparateur",
    title: "Comparer des modèles.",
    lead: "Prix, contexte, spécifications et benchmarks communs, côte à côte. Choisissez de deux à quatre modèles depuis le catalogue.",
    breadcrumb: "Comparer",
    tableLabel: "Comparaison des modèles",
    property: "Critère",
    pickTitle: "Choisissez au moins deux modèles",
    pickText:
      "Dans le catalogue, utilisez le bouton « Comparer » de chaque modèle, puis ouvrez la comparaison.",
    pickCta: "Aller au catalogue",
    unknownIds:
      "Un identifiant de l’adresse ne correspond à aucun modèle du catalogue : il a été ignoré.",
    remove: "Retirer {name}",
    add: "Ajouter un modèle",
    sections: {
      pricing: "Tarifs (CAD par million de jetons)",
      specs: "Spécifications",
      benchmarks: "Benchmarks communs",
    },
    rows: {
      input: "Prix d’entrée",
      output: "Prix de sortie",
      cachedInput: "Entrée en cache",
      context: "Contexte maximal",
      maxOutput: "Sortie maximale",
      parameters: "Paramètres",
      quantization: "Quantification",
      inputs: "Entrées acceptées",
      released: "Date de sortie",
      license: "Licence",
      status: "État",
      host: "Hébergeur",
      capabilities: "Capacités",
    },
    best: "meilleur résultat",
    noBenchmarks:
      "Ces modèles n’ont aucune épreuve en commun dans les mesures publiées : rien à comparer sans inventer.",
    notComparable:
      "Éditeurs ou unités différents sur cette ligne : lecture à titre indicatif, sans désigner de meilleur résultat.",
    missing: "Non publié",
    benchmarkWarning:
      "Ces chiffres sont publiés par des éditeurs différents, avec des méthodes différentes : ils ne sont pas strictement comparables. Un meilleur résultat n’est signalé que si l’éditeur et l’unité sont les mêmes pour tous les modèles de la ligne.",
    viewSheet: "Voir la fiche",
  },

  rankings: {
    label: "Benchmarks",
    title: "Classements par épreuve.",
    lead: "Une table pour chaque épreuve publiée pour au moins trois modèles du catalogue, du résultat le plus élevé au plus bas. Aucune donnée d’usage : seulement des mesures sourcées.",
    breadcrumb: "Classements par épreuve",
    warningTitle: "À lire avant de comparer",
    warning:
      "Ces chiffres sont publiés par des éditeurs différents, avec des méthodes différentes : ils ne sont pas strictement comparables entre eux. Chaque ligne nomme l’éditeur de la mesure et renvoie à sa source.",
    count: { one: "{count} modèle", other: "{count} modèles" },
    mixedPublishers: "Plusieurs éditeurs de mesures : comparaison indicative.",
    samePublisher: "Mesures publiées par {publisher}.",
    unitLabel: "Unité : {unit}",
    jump: "Épreuves",
    cols: {
      rank: "Rang",
      model: "Modèle",
      score: "Résultat",
      publisher: "Mesure publiée par",
      source: "Source",
    },
    source: "Voir la source",
    empty:
      "Aucune épreuve n’est encore publiée pour trois modèles ou plus. Les classements apparaîtront ici dès que les mesures publiées le permettront.",
    back: "Retour au catalogue",
  },
};

export type ModelsDictionary = typeof modelsFrCA;
