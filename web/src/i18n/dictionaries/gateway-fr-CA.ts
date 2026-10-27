/**
 * Dictionnaire de la passerelle de modèles (fr-CA), jalon S5 : catalogue public, fiches, documentation
 * de l’API et section « Clés API » de l’espace client. Même règles que les autres dictionnaires :
 * vouvoiement, aucun chiffre, prix, certification ou promesse inventé (les prix et les lieux
 * d’hébergement viennent du catalogue publié). Marqueurs `{nom}` remplacés par `fmt()`.
 */
export const gatewayFrCA = {
  meta: {
    models: {
      title: "Modèles | Nexora AI",
      description:
        "Catalogue des modèles d’IA accessibles par l’API de Nexora AI : prix en dollars canadiens, contexte, capacités et lieu d’hébergement de chacun.",
    },
    model: {
      description:
        "Fiche du modèle {name} : prix par million de jetons en dollars canadiens, contexte, hébergement et exemple d’appel.",
    },
    docs: {
      title: "Documentation de l’API | Nexora AI",
      description:
        "Démarrage rapide de l’API de Nexora AI, compatible OpenAI : clé, premier appel, diffusion en continu, erreurs et limites.",
    },
  },

  residency: {
    quebec: "Hébergé au Québec",
    canada: "Hébergé au Canada",
    etats_unis: "Hébergé aux États-Unis",
    europe: "Hébergé en Europe",
    autre: "Hébergement hors Canada",
  },
  residencyFilter: {
    quebec: "Québec",
    canada: "Canada",
    etats_unis: "États-Unis",
    europe: "Europe",
    autre: "Autre",
  },
  capabilities: {
    tools: "Appel d’outils",
    vision: "Vision",
    reasoning: "Raisonnement",
    streaming: "Diffusion en continu",
    json_mode: "Mode JSON",
  },
  kinds: { chat: "Conversation", embedding: "Embeddings" },

  catalog: {
    label: "Modèles",
    title: "Les modèles, une seule API.",
    lead: "Une clé, une API compatible OpenAI, des prix en dollars canadiens et le lieu d’hébergement de chaque modèle affiché clairement.",
    filtersLabel: "Filtrer les modèles",
    residencyField: "Hébergement",
    capabilityField: "Capacité",
    kindField: "Type",
    all: "Tous",
    apply: "Appliquer",
    reset: "Réinitialiser",
    count: "{count} modèle(s)",
    empty: "Aucun modèle ne correspond à ces filtres.",
    emptyCatalog:
      "Le catalogue est en cours de préparation : aucun modèle n’est publié pour le moment.",
    unit: "par million de jetons",
    priceNote: "Prix en dollars canadiens (CAD), avant taxes.",
    input: "Entrée",
    output: "Sortie",
    cachedInput: "Entrée en cache",
    context: "Contexte",
    tokens: "jetons",
    viewModel: "Voir la fiche de {name}",
    devNote: "Prix de développement",
    updated: "Catalogue au {date}",
  },

  detail: {
    back: "Tous les modèles",
    pricing: "Tarification",
    pricingLead:
      "Facturé au coût réel de chaque requête, selon les jetons d’entrée et de sortie.",
    context: "Contexte maximal",
    maxOutput: "Sortie maximale",
    capabilities: "Capacités",
    noCapabilities: "Aucune capacité particulière déclarée.",
    hosting: "Hébergement et données",
    hostingProvider: "Fournisseur",
    hostingRegion: "Lieu d’hébergement",
    dataPolicy: "Politique de données déclarée par le fournisseur",
    dataPolicyMissing:
      "Le fournisseur n’a pas encore déclaré de politique de données.",
    nexoraNote:
      "La passerelle de Nexora AI ne garde que des métadonnées d’usage (modèle, jetons, coût, durée), jamais le contenu de vos requêtes.",
    sunset: "Retrait prévu le {date}.",
    example: "Exemple d’appel",
    exampleLead:
      "Remplacez la clé de l’exemple par la vôtre. Les exemples utilisent l’adresse de l’API : {url}.",
    exampleEmbeddingLead:
      "Ce modèle produit des vecteurs : il s’appelle par /v1/embeddings.",
    createKey: "Créer une clé API",
    docs: "Lire la documentation",
  },

  docs: {
    label: "API",
    title: "Démarrage rapide de l’API.",
    lead: "L’API de Nexora AI est compatible avec celle d’OpenAI : changez l’adresse de base et la clé, le reste de votre code ne bouge pas.",
    baseUrlTitle: "Adresse de base",
    baseUrlText:
      "Toutes les requêtes passent par {url}. L’authentification se fait par l’en-tête Authorization.",
    steps: {
      title: "En quatre étapes",
      items: [
        "Créez un compte et rechargez vos crédits depuis votre espace client.",
        "Créez une clé API (Compte, section Clés API) : sa valeur n’est affichée qu’une seule fois.",
        "Choisissez un modèle dans le catalogue et notez son identifiant, par exemple {model}.",
        "Faites votre premier appel avec l’un des exemples ci-dessous.",
      ],
    },
    code: "code",
    firstCall: "Premier appel",
    streaming: "Diffusion en continu",
    streamingText:
      "Ajoutez stream: true pour recevoir la réponse au fil de l’eau (SSE). Le coût est réglé à la fin du flux, d’après l’usage réel ; si vous fermez la connexion en cours de route, seuls les jetons déjà livrés sont facturés.",
    models: "Lister les modèles",
    modelsText:
      "GET /v1/models renvoie les modèles publiés, avec leurs prix (CAD par million de jetons), leur contexte et leur lieu d’hébergement. Le catalogue public n’exige pas de clé.",
    embeddings: "Embeddings",
    embeddingsText:
      "POST /v1/embeddings accepte un texte ou une liste de textes, pour les modèles de type Embeddings.",
    billing: {
      title: "Facturation",
      items: [
        "Chaque requête réserve d’abord son coût maximal (jetons d’entrée estimés et sortie bornée par max_tokens), puis est réglée au coût réel et le reste est libéré.",
        "Sans solde suffisant, l’API répond 402 avant tout appel au modèle.",
        "Vous pouvez plafonner la dépense d’une clé et en limiter le débit.",
        "Chaque réponse porte un en-tête x-request-id ; x-nexora-cost-micro donne le coût d’une réponse complète, en millionièmes de dollar canadien.",
      ],
    },
    errors: {
      title: "Erreurs",
      tableLabel: "tableau",
      lead: "Les erreurs suivent le format d’OpenAI : un objet error avec message, type et code.",
      columns: { status: "Statut", code: "Code", meaning: "Signification" },
      rows: [
        [
          "401",
          "invalid_api_key · api_key_revoked · api_key_expired",
          "Clé absente ou inconnue, clé révoquée, clé expirée.",
        ],
        [
          "402",
          "insufficient_quota · account_blocked · api_key_spend_cap_reached",
          "Solde insuffisant, compte bloqué (solde négatif) ou plafond de dépense de la clé atteint.",
        ],
        [
          "404",
          "model_not_found",
          "Modèle inexistant ou non autorisé pour cette clé.",
        ],
        [
          "400",
          "invalid_json · missing_model · invalid_messages · invalid_input · invalid_max_tokens · context_length_exceeded · model_not_supported · unsupported_parameter",
          "Requête invalide (JSON, modèle absent, messages, max_tokens, contexte dépassé, paramètre non pris en charge). Le champ param nomme le paramètre fautif.",
        ],
        ["413", "request_too_large", "Corps de requête trop volumineux."],
        [
          "429",
          "rate_limit_exceeded",
          "Limite de requêtes ou de jetons par minute atteinte (voir Retry-After).",
        ],
        [
          "502 / 503",
          "upstream_error · upstream_unavailable · upstream_overloaded · gateway_unavailable",
          "Le fournisseur du modèle est indisponible ou surchargé : réessayez (voir Retry-After). Rien n’est débité.",
        ],
      ],
    },
    privacy: {
      title: "Confidentialité",
      text: "La passerelle ne garde que des métadonnées d’usage (modèle, jetons, coût, durée), jamais le contenu de vos requêtes. La politique de données de chaque fournisseur est affichée sur la fiche du modèle.",
    },
    compat: {
      title: "Compatibilité",
      text: "Pris en charge : /v1/chat/completions (avec diffusion en continu, outils et formats de réponse), /v1/embeddings et /v1/models. Un seul choix par requête (n = 1). Les paramètres propres à un fournisseur sont ignorés.",
    },
    cta: "Voir les modèles",
  },

  account: {
    title: "Clés API",
    lead: "Les clés donnent accès à l’API de Nexora AI et dépensent les crédits de votre organisation.",
    ownerOnly:
      "Seul le propriétaire de l’organisation peut créer ou révoquer une clé.",
    createTitle: "Créer une clé",
    name: "Nom de la clé",
    nameHint: "Par exemple « Production » ou « Essais ».",
    spendCap: "Plafond de dépense",
    spendCapHint:
      "En dollars canadiens, par exemple 50 ou 12,50. Laissez vide pour n’en fixer aucun.",
    expires: "Expiration",
    expiresHint:
      "Nombre de jours avant l’expiration. Laissez vide pour une clé sans expiration.",
    optional: "facultatif",
    create: "Créer la clé",
    creating: "Création…",
    createdTitle: "Clé créée",
    createdWarn:
      "Copiez cette clé maintenant : elle ne sera plus jamais affichée. Nexora AI n’en conserve que l’empreinte.",
    copy: "Copier la clé",
    copied: "Clé copiée",
    close: "J’ai copié la clé",
    tableLabel: "tableau",
    list: "Vos clés",
    empty: "Aucune clé pour le moment.",
    columns: {
      name: "Nom",
      prefix: "Début",
      created: "Créée le",
      lastUsed: "Dernier usage",
      spent: "Dépensé",
      cap: "Plafond",
      status: "État",
    },
    never: "Jamais",
    noCap: "Aucun",
    status: { active: "Active", revoked: "Révoquée", expired: "Expirée" },
    revoke: "Révoquer",
    revokeLabel: "Révoquer la clé {name}",
    confirmRevoke:
      "Révoquer la clé « {name} » ? Les applications qui l’utilisent seront refusées immédiatement.",
    errors: {
      invalid_request: "Vérifiez le nom, le plafond et la durée.",
      invalid_spend_cap:
        "Plafond invalide : entrez un montant en dollars, par exemple 50 ou 12,50.",
      forbidden: "Seul le propriétaire de l’organisation peut gérer les clés.",
      key_limit:
        "Limite atteinte : 25 clés actives par organisation. Révoquez une clé inutilisée avant d’en créer une autre.",
      rate_limited: "Trop de demandes. Patientez une minute.",
      generic: "L’opération a échoué. Réessayez dans un moment.",
    },
    usageTitle: "Usage",
    usageLead: "Requêtes des 30 derniers jours, par jour et par modèle.",
    usageEmpty: "Aucune requête dans les 30 derniers jours.",
    usageCaption: "Usage de l’API par jour et par modèle",
    usageColumns: {
      day: "Jour",
      model: "Modèle",
      requests: "Requêtes",
      input: "Jetons d’entrée",
      output: "Jetons de sortie",
      cost: "Coût",
    },
    usageTotal: "Total",
  },
};

export type GatewayDictionary = typeof gatewayFrCA;
