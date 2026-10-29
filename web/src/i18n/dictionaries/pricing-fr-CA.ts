/** Textes de la page Tarifs (fr-CA). Aucun prix ici : les prix viennent des offres publiées dans Directus. */
export const pricingFrCA = {
  meta: {
    title: "Tarifs | Nexora AI",
    description:
      "Offres Nexora AI en dollars canadiens, avant taxes : prix mensuel et annuel, crédits inclus. Aussi : VPS et crédits d’API à l’usage.",
  },
  nav: { home: "Accueil", pricing: "Tarifs", breadcrumb: "Fil d’Ariane" },
  hero: {
    label: "Tarifs",
    title: "Des tarifs clairs, en dollars canadiens.",
    lead: "Choisissez une offre, puis payez en toute sécurité. Les prix s’affichent avant taxes ; la TPS et la TVQ sont calculées au moment du paiement.",
  },
  offers: {
    title: "Les offres d’abonnement",
    lead: "Chaque offre se résilie quand vous le voulez, depuis votre espace client.",
  },
  card: {
    perMonth: "par mois",
    perYear: "par an",
    monthlyBilling: "Facturation mensuelle",
    yearlyBilling: "Facturation annuelle",
    yearlyEquivalent: "soit {amount} par mois",
    saving: "{percent} % d’économie par rapport au mensuel",
    trial: "Essai gratuit de {days} jours",
    credits: "{amount} de crédits inclus à chaque période",
    choose: "Choisir cette offre",
    chooseYearly: "Choisir la facturation annuelle",
    notReady: "Bientôt disponible",
    notReadyHelp: "Cette offre n’est pas encore ouverte à la souscription.",
    contact: "Nous écrire",
    included: "Ce qui est inclus",
  },
  taxes:
    "Tous les prix sont en dollars canadiens, avant taxes. La TPS et la TVQ sont calculées par notre prestataire de paiement selon votre adresse de facturation et s’ajoutent au prix. Les crédits inclus sont accordés à chaque période payée.",
  includedNote:
    "Les crédits inclus équivalent à environ 5 millions de jetons par mois du modèle par défaut de WorkStudio. Un modèle plus cher les consomme plus vite ; une fois les crédits épuisés, les jetons sont facturés au prix du catalogue, à même votre portefeuille.",
  trialNote:
    "Pendant un essai, aucun montant n’est prélevé avant la fin de la période d’essai ; vous pouvez résilier avant sans frais.",
  states: {
    empty: {
      label: "Offres en préparation",
      title: "Nos offres arrivent bientôt.",
      text: "Nous finalisons nos tarifs. Dites-nous ce dont vous avez besoin : nous vous répondons avec une proposition claire, sans engagement.",
      cta: "Nous écrire",
    },
    unavailable: {
      label: "Momentanément indisponible",
      title: "Les tarifs ne peuvent pas s’afficher pour le moment.",
      text: "Le service qui publie nos offres ne répond pas. Réessayez dans un moment, ou écrivez-nous : nous répondons à toute demande.",
      cta: "Nous écrire",
    },
  },
  more: {
    title: "D’autres façons de commencer",
    lead: "Un abonnement n’est pas la seule voie : prenez un serveur ou payez à l’usage.",
    vps: {
      title: "Serveurs privés (VPS)",
      text: "Un serveur privé virtuel, au prix affiché sur sa page, avec l’application de votre choix déjà installée.",
      cta: "Voir les VPS",
    },
    credits: {
      title: "Crédits d’API",
      text: "Payez à l’usage : rechargez des crédits depuis votre espace client, sans abonnement. Le catalogue des modèles et leurs tarifs sont publics.",
      cta: "Voir les modèles",
      ctaSecondary: "Créer un compte",
    },
  },
  period: { month: "Mensuel", year: "Annuel" },
};

export type PricingDictionary = typeof pricingFrCA;
