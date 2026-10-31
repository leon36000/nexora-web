/**
 * Textes de la page Tarifs (fr-CA). Aucun prix ici : les prix, les crédits et l’espace des paliers viennent des offres
 * publiées dans Directus (jamais en dur). Les affirmations de la page renvoient au registre `cms/content/claims.json`
 * par leurs identifiants (`claims`) ; un test vérifie qu’ils existent et que chacun est utilisé.
 */
export const pricingFrCA = {
  meta: {
    title: "Tarifs | Nexora AI",
    description:
      "Crédits, abonnements, recharge et espace disque de Nexora AI : ce qui consomme des crédits, ce qui est inclus, et les prix publiés en dollars canadiens.",
  },
  nav: { home: "Accueil", pricing: "Tarifs", breadcrumb: "Fil d’Ariane" },
  hero: {
    label: "Tarifs",
    title: "Des crédits pour l’IA, de l’espace pour vos données.",
    lead: "Un abonnement vous donne des crédits chaque mois et de l’espace disque. Sans abonnement, vous rechargez des crédits. Tout ce qui appelle un modèle d’IA consomme des crédits ; le reste est inclus.",
    claims: ["CL-T01"],
  },
  offers: {
    title: "Les paliers d’abonnement",
    lead: "Chaque palier donne des crédits chaque mois et de l’espace disque ; les paliers plus élevés donnent plus des deux.",
    claims: ["CL-T01"],
  },
  card: {
    perMonth: "par mois",
    perYear: "par an",
    monthlyBilling: "Facturation mensuelle",
    yearlyBilling: "Facturation annuelle",
    yearlyEquivalent: "soit {amount} par mois",
    saving: "{percent} % d’économie par rapport au mensuel",
    trial: "Essai gratuit de {days} jours",
    credits: "{credits} crédits par mois",
    creditsYearly: "Facturation annuelle : crédits versés un douzième par mois",
    storage: "{gb} Go d’espace disque",
    choose: "Choisir cette offre",
    chooseYearly: "Choisir la facturation annuelle",
    notReady: "Bientôt disponible",
    notReadyHelp: "Cette offre n’est pas encore ouverte à la souscription.",
    contact: "Nous écrire",
    included: "Ce qui est inclus",
  },
  taxes:
    "Tous les prix sont en dollars canadiens, avant taxes. La TPS et la TVQ sont calculées par notre prestataire de paiement selon votre adresse de facturation et s’ajoutent au prix. Les crédits inclus sont accordés à chaque période payée.",
  trialNote:
    "Pendant un essai, aucun montant n’est prélevé avant la fin de la période d’essai ; vous pouvez résilier avant sans frais.",
  notify: {
    text: "La plateforme n’est pas encore ouverte à la vente. Laissez votre courriel : nous vous écrivons à l’ouverture, sans date annoncée.",
    cta: "Me prévenir à l’ouverture",
  },
  states: {
    empty: {
      label: "Prix à venir",
      title: "Les prix ne sont pas encore publiés.",
      text: "Nous vous montrons déjà comment tout fonctionne : ce qu’est un crédit, ce qui en consomme, comment se comptent la recharge et l’espace. Les paliers, leurs quantités et leurs prix s’afficheront ici dès leur publication ; nous n’avançons aucun prix en attendant. Pour un besoin précis, écrivez-nous.",
      cta: "Nous écrire",
      claims: ["CL-T06"],
    },
    unavailable: {
      label: "Momentanément indisponible",
      title: "Les prix ne peuvent pas s’afficher pour le moment.",
      text: "Le service qui publie nos offres ne répond pas. Réessayez dans un moment, ou écrivez-nous : nous répondons à toute demande. Le reste de la page reste valable.",
      cta: "Nous écrire",
    },
  },
  credit: {
    title: "Ce qu’est un crédit",
    lead: "Un crédit vaut un cent canadien (1 ¢) de jetons, au prix du catalogue de modèles. Un modèle économe donne plus de jetons pour un crédit ; un modèle puissant en donne moins.",
    points: [
      "Les prix du catalogue sont publics : chaque fiche de modèle indique son prix par million de jetons.",
      "Chaque requête est débitée au coût réel, calculé avec le prix de la fiche du modèle utilisé.",
      "Tout appel à un modèle d’IA consomme des crédits ; les outils Nexora qui n’appellent aucun modèle n’en consomment pas.",
    ],
    claims: ["CL-T02", "CL-T04"],
    equivalents: {
      title: "Ce que {credits} crédits achètent",
      lead: "Calculé depuis les prix publiés au catalogue, pour quelques modèles. Les jetons d’entrée sont ceux de votre demande ; les jetons de sortie sont ceux de la réponse.",
      caption:
        "Équivalent de {credits} crédits en jetons, selon les prix du catalogue",
      model: "Modèle",
      input: "Jetons d’entrée",
      output: "Jetons de sortie",
      note: "Les prix du catalogue peuvent changer, et l’équivalent change avec eux.",
      preview: {
        tag: "En aperçu",
        note: "Ces modèles sont en aperçu : prix de développement, non définitifs.",
      },
      unavailable:
        "Le catalogue de modèles n’est pas disponible pour le moment : l’équivalent en jetons s’affichera dès son retour. Rien n’est estimé en attendant.",
      cta: "Voir tous les modèles et leurs prix",
      claims: ["CL-T02"],
    },
  },
  refill: {
    title: "La recharge",
    lead: "Sans abonnement, ou en plus de lui, rechargez des crédits quand vous le voulez.",
    points: [
      "Les crédits d’abonnement expirent à la fin de leur période ; ils sont utilisés en premier.",
      "Les crédits de recharge n’expirent pas : ils servent une fois ceux de l’abonnement épuisés.",
      "Un solde de crédits supérieur à zéro suffit pour appeler les modèles, qu’il vienne d’un abonnement ou d’une recharge.",
    ],
    claims: ["CL-T01", "CL-T03"],
    packsTitle: "Forfaits de recharge",
    packCredits: "{credits} crédits",
    packsSoon:
      "Les forfaits de recharge s’afficheront ici dès la publication de leurs prix.",
    cta: "Recharger depuis mon compte",
  },
  storage: {
    title: "L’espace disque",
    lead: "Chaque abonnement inclut de l’espace disque. Il est compté par organisation, tous produits confondus.",
    points: [
      "Au-delà de votre espace, l’écriture est refusée avec un message clair, jusqu’à ce que vous libériez de l’espace ou ajoutiez des gigaoctets.",
      "Libérer de l’espace est toujours permis.",
      "Des gigaoctets supplémentaires peuvent s’ajouter à votre offre.",
    ],
    claims: ["CL-T05"],
    addonPrice: "{price} par Go et par mois",
    addonSoon:
      "L’offre « Go supplémentaire » s’affichera ici dès la publication de son prix.",
  },
  usage: {
    title: "Ce qui est inclus, ce qui consomme",
    lead: "Où vont vos crédits, et ce qui ne vous coûte rien de plus.",
    claims: ["CL-T04", "CL-T05", "CL-T07"],
    included: {
      title: "Gratuit ou inclus",
      items: [
        "Le catalogue des modèles et ses prix, consultables sans compte.",
        "Les outils Nexora qui n’appellent aucun modèle d’IA.",
      ],
    },
    credits: {
      title: "Consomme des crédits",
      items: [
        "Tout appel à un modèle d’IA : requêtes à l’API, agents, automatisations qui utilisent un modèle.",
        "Les jetons d’entrée et de sortie de chaque requête, au prix du catalogue.",
      ],
    },
    space: {
      title: "Consomme de l’espace",
      items: [
        "Les données que vous gardez chez Nexora, tous produits confondus.",
      ],
    },
  },
  faq: {
    title: "Questions fréquentes",
    lead: "Des réponses franches, y compris sur ce qui n’est pas encore décidé.",
    items: {
      noCredits: {
        q: "Que se passe-t-il quand il ne me reste plus de crédits ?",
        a: "Les appels aux modèles sont refusés, avec un message qui renvoie vers la recharge et vers les abonnements. Dès que votre solde dépasse zéro, vous pouvez recommencer.",
        claims: ["CL-T09"],
      },
      expiry: {
        q: "Mes crédits expirent-ils ?",
        a: "Les crédits d’abonnement expirent à la fin de la période pour laquelle ils ont été versés, et ils sont utilisés en premier. Les crédits de recharge n’expirent pas.",
        claims: ["CL-T03"],
      },
      annual: {
        q: "Comment les crédits d’une offre annuelle sont-ils versés ?",
        a: "Un douzième chaque mois, et non d’un seul coup. Chaque douzième expire à la fin de son mois.",
        claims: ["CL-T08"],
      },
      trial: {
        q: "Puis-je essayer avant de payer ?",
        a: "Il n’y a pas d’essai gratuit des offres. Le catalogue des modèles et leurs prix sont publics, et une recharge vous permet de n’acheter que ce que vous consommez.",
        claims: ["CL-T07"],
      },
      space: {
        q: "Que se passe-t-il si je dépasse mon espace disque ?",
        a: "L’écriture est refusée avec un message clair. Libérez de l’espace, ou ajoutez des gigaoctets à votre offre ; ce que vous avez déjà enregistré n’est pas supprimé par ce refus.",
        claims: ["CL-T05"],
      },
      cancel: {
        q: "Puis-je résilier un abonnement ?",
        a: "Oui, depuis votre espace client. La résiliation prend effet à la fin de la période payée.",
        claims: ["CL-T10"],
      },
      prices: {
        q: "Quand les prix seront-ils publiés ?",
        a: "Nous n’avons pas de date à annoncer. Les prix s’afficheront sur cette page dès leur publication ; d’ici là, aucun prix n’est valable.",
        claims: ["CL-T06"],
      },
    },
  },
  more: {
    title: "D’autres façons de commencer",
    lead: "Un abonnement n’est pas la seule voie : prenez un serveur, ou parlons de votre besoin.",
    vps: {
      title: "Serveurs privés (VPS)",
      text: "Un serveur privé virtuel avec l’application de votre choix déjà installée. Les plans seront publiés sur sa page.",
      cta: "Voir les VPS",
    },
    support: {
      title: "Accompagnement",
      text: "Un diagnostic de votre besoin, puis une estimation écrite.",
      cta: "Demander un diagnostic",
    },
    contact: {
      title: "Un besoin précis ?",
      text: "Dites-nous ce que vous voulez accomplir : nous répondons avec une proposition claire, sans engagement.",
      cta: "Nous écrire",
    },
  },
  period: { month: "Mensuel", year: "Annuel" },
};

export type PricingDictionary = typeof pricingFrCA;
