/**
 * Dictionnaire des agents hébergés (fr-CA), jalon S7 : catalogue public, fiches, garde-fous, consommation de
 * l’espace client. Mêmes règles que les autres dictionnaires : vouvoiement, aucun chiffre, prix, client ou
 * certification inventé (les prix, les noms et les lieux d’hébergement viennent du catalogue publié). Marqueurs
 * `{nom}` remplacés par `fmt()`.
 */
export const agentsFrCA = {
  meta: {
    list: {
      title: "Agents hébergés | Nexora",
      description:
        "Des agents conçus dans Nexora WorkStudio, appelables par l’API de Nexora avec votre clé : un seul décompte de crédits, des prix en dollars canadiens et l’hébergement de l’instance indiqué.",
    },
    agent: {
      description:
        "Fiche de l’agent {name} : appel par API avec votre clé Nexora, prix, hébergement de l’instance, limites et exemples de code.",
    },
  },

  residency: {
    quebec: "Instance hébergée au Québec",
    canada: "Instance hébergée au Canada",
    etats_unis: "Instance hébergée aux États-Unis",
    europe: "Instance hébergée en Europe",
    autre: "Instance hébergée hors Canada",
  },
  categories: {
    general: "Général",
    support: "Soutien à la clientèle",
    documents: "Documents",
    ventes: "Ventes",
    finance: "Finances",
    ressources_humaines: "Ressources humaines",
    autre: "Autre",
  },

  catalog: {
    label: "Agents hébergés",
    title: "Des agents prêts à appeler.",
    lead: "Un agent est conçu et publié dans Nexora WorkStudio. Vous l’appelez par l’API de Nexora, avec votre clé et votre solde de crédits, comme vous appelez un modèle.",
    count: "{count} agent(s) publié(s)",
    empty:
      "Aucun agent n’est publié pour le moment. Le catalogue se remplit au fur et à mesure que Nexora publie ses agents.",
    unavailable:
      "Le catalogue est momentanément indisponible. Réessayez dans un instant.",
    trialNote:
      "Les prix affichés sont des valeurs d’essai de développement : ils ne constituent pas une offre.",
    priceNote: "Prix en dollars canadiens (CAD), avant taxes.",
    perRun: "Par exécution",
    input: "Entrée",
    output: "Sortie",
    perMillion: "par million de jetons",
    trialBadge: "Prix d’essai",
    viewAgent: "Voir la fiche de {name}",
    updated: "Catalogue au {date}",
    howTitle: "Comment ça marche",
    howSteps: [
      "Créez une clé API dans votre espace client et rechargez vos crédits.",
      "Appelez l’API de Nexora avec le modèle « agent/<identifiant> », exactement comme pour un modèle.",
      "Suivez la consommation de chaque agent dans votre espace client.",
    ],
  },

  detail: {
    back: "Tous les agents",
    category: "Catégorie",
    pricing: "Tarification",
    pricingLead:
      "Facturé au coût réel de chaque exécution : un montant par exécution et/ou les jetons consommés, selon le prix de l’agent.",
    trialLead:
      "Ces prix sont des valeurs d’essai de développement. Ils changeront avant toute offre commerciale.",
    limits: "Limites",
    runCap:
      "Plafond de {tokens} jetons (entrée et sortie) par exécution. Le montant réservé sur votre solde est calculé sur ce plafond, et vous n’êtes jamais débité au-delà.",
    textOnly:
      "L’agent reçoit du texte : les images, sons et fichiers ne sont pas pris en charge par l’API.",
    systemIgnored:
      "Les messages « system » et « developer » de votre requête sont ignorés : l’agent garde ses propres consignes. Envoyez des messages « user » et « assistant ».",
    noTuning:
      "Les réglages d’un modèle (température, outils, max_tokens…) ne s’appliquent pas à un agent publié et sont ignorés.",
    example: "Exemple d’appel",
    exampleLead:
      "Remplacez la clé de l’exemple par la vôtre. Les exemples utilisent l’adresse de l’API : {url}.",
    streamTitle: "Diffusion en continu",
    streamLead:
      "Ajoutez stream: true pour recevoir la réponse au fil de l’eau. Le coût est réglé à la fin de l’exécution, d’après l’usage réel.",
    createKey: "Créer une clé API",
    docs: "Lire la documentation de l’API",
  },

  guardrails: {
    title: "Garde-fous",
    lead: "Ce que fait la passerelle, et ce qu’elle ne fait pas.",
    hostingTitle: "Hébergement",
    hosting:
      "Votre requête est traitée par l’instance Nexora WorkStudio indiquée sur la fiche de l’agent (hébergement déclaré par Nexora), puis par le modèle de langage que cette instance utilise. La région du modèle se vérifie dans le catalogue des modèles ; l’hébergement de l’instance ne dit rien de plus que ce qui est déclaré.",
    retentionTitle: "Contenu de vos échanges",
    retention:
      "La passerelle de Nexora ne garde que des métadonnées d’usage (agent, jetons, coût, durée), jamais le contenu de vos requêtes.",
    billingTitle: "Facturation",
    billing:
      "Chaque appel réserve d’abord son coût maximal sur votre solde, puis est réglé au coût réel. Sans solde suffisant, l’API répond 402 avant d’appeler l’agent. Vous pouvez plafonner la dépense d’une clé.",
    keyTitle: "Votre clé",
    key: "Une clé API ne doit jamais se trouver dans une page web ou une application installée : appelez l’API depuis votre serveur. L’API n’envoie pas d’en-têtes CORS.",
    revokeTitle: "Révocation et retrait",
    revoke:
      "Une clé révoquée est refusée immédiatement (401). Un agent retiré du catalogue répond 404.",
  },

  cta: {
    title: "Appeler un agent",
    lead: "Créez une clé dans votre espace client, puis appelez l’agent de votre choix.",
    createKey: "Créer une clé dans l’espace client",
    docs: "Documentation de l’API",
    models: "Voir les modèles",
  },

  widget: {
    defaultLabel: "Discuter avec l’assistant",
  },

  account: {
    title: "Consommation des agents",
    lead: "Exécutions des 30 derniers jours, par jour et par agent.",
    modelsTitle: "Consommation des modèles",
    empty: "Aucune exécution d’agent dans les 30 derniers jours.",
    caption: "Usage des agents par jour et par agent",
    columns: {
      day: "Jour",
      agent: "Agent",
      requests: "Exécutions",
      input: "Jetons d’entrée",
      output: "Jetons de sortie",
      cost: "Coût",
    },
    total: "Total",
  },
};

export type AgentsDictionary = typeof agentsFrCA;
