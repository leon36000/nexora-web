/**
 * Offres Nexora préparées en BROUILLON (conception du 30/10/2026 : `docs/superpowers/specs/2026-10-30-credits-produits-design.md`
 * et `docs/credits-et-offres.md`). Un abonnement = des crédits mensuels + de l'espace disque ; tout ce qui appelle un
 * modèle consomme des crédits. Rien n'est publié : `price_cents` reste vide, seul `suggested_price_cents` (non lu par
 * le site ni par le public) porte la suggestion ; le fondateur adopte le prix (module Paiements, « Adopter le prix
 * suggéré »), puis publie.
 *
 * - **1 crédit = 1 ¢ CA** : `included_credits_cents` est donc le nombre de crédits mensuels (nom de champ hérité).
 * - Palier de base = les chiffres du fondateur (29,99 $ CA par mois, 1 Go, 1 000 crédits). Pro et Équipe sont des
 *   propositions, en brouillon comme le reste.
 * - Annuel : 12 mois au tarif de 10 % de moins ; crédits d'une année, versés un douzième par mois (tâche
 *   `ledger.grant-tranches`) ; même espace disque.
 * - Aucun essai gratuit (`trial_days` = 0, consigne du 29/10/2026) : l'accès gratuit est réservé à l'organisation « maison ».
 * - « Go supplémentaire » : offre complémentaire (suggestion 1 $ CA par Go et par mois).
 * - Forfaits de recharge : 10, 25, 50 et 100 $ (1 $ = 100 crédits), crédits sans expiration.
 *
 * Aucun chiffre n'est écrit en dur côté site : tout vit ici (puis dans Directus) et le site le lit.
 */
export interface DraftPlan {
  code: string;
  family: string;
  kind: "nexora" | "storage";
  status: "draft";
  interval: "month" | "year";
  suggested_price_cents: number;
  /** Crédits versés à chaque période payée (1 crédit = 1 ¢ CA). */
  included_credits_cents: number;
  /** Espace disque inclus, en Go (1 Go = 1 000 000 000 octets). */
  included_storage_gb: number;
  trial_days: number;
  trial_card: "default";
  sort: number;
  translations: {
    languages_code: "fr-CA" | "en-CA";
    name: string;
    description: string;
    features: string[];
  }[];
}

export interface DraftCreditPack {
  code: string;
  status: "draft";
  /** Prix suggéré en cents CA, avant taxes (non publié). */
  suggested_price_cents: number;
  /** Crédits accordés (1 $ = 100 crédits ; sans expiration). */
  credits: number;
  sort: number;
}

interface Tier {
  family: string;
  monthly: number;
  credits: number;
  storageGb: number;
  fr: { name: string; description: string; features: string[] };
  en: { name: string; description: string; features: string[] };
}

const TIERS: Tier[] = [
  {
    family: "nexora-base",
    monthly: 2999,
    credits: 1000,
    storageGb: 1,
    fr: {
      name: "Nexora Base",
      description: "Pour commencer : des crédits chaque mois et de l’espace.",
      features: [
        "Crédits mensuels pour tous les modèles du catalogue",
        "Espace disque inclus",
        "Recharge possible en tout temps",
        "Outils Nexora sans jetons inclus",
      ],
    },
    en: {
      name: "Nexora Base",
      description: "To get started: credits every month, plus storage.",
      features: [
        "Monthly credits for every model in the catalogue",
        "Storage included",
        "Top up at any time",
        "Nexora tools that use no tokens are included",
      ],
    },
  },
  {
    family: "nexora-pro",
    monthly: 7999,
    credits: 4000,
    storageGb: 10,
    fr: {
      name: "Nexora Pro",
      description: "Pour un usage régulier : plus de crédits et plus d’espace.",
      features: [
        "Plus de crédits mensuels que Nexora Base",
        "Plus d’espace disque que Nexora Base",
        "Recharge possible en tout temps",
        "Go supplémentaires possibles",
      ],
    },
    en: {
      name: "Nexora Pro",
      description: "For regular use: more credits and more storage.",
      features: [
        "More monthly credits than Nexora Base",
        "More storage than Nexora Base",
        "Top up at any time",
        "Extra gigabytes available",
      ],
    },
  },
  {
    family: "nexora-equipe",
    monthly: 19999,
    credits: 12000,
    storageGb: 50,
    fr: {
      name: "Nexora Équipe",
      description:
        "Pour une équipe qui travaille chaque jour avec les modèles.",
      features: [
        "Le plus de crédits mensuels",
        "Le plus d’espace disque",
        "Recharge possible en tout temps",
        "Go supplémentaires possibles",
      ],
    },
    en: {
      name: "Nexora Team",
      description: "For a team that works with the models every day.",
      features: [
        "The most monthly credits",
        "The most storage",
        "Top up at any time",
        "Extra gigabytes available",
      ],
    },
  },
];

/** Annuel : douze mois à 10 % de moins, arrondi au cent. */
const yearlyOf = (monthlyCents: number) =>
  Math.round((monthlyCents * 12 * 9) / 10);

const tierPlans = (t: Tier, i: number): DraftPlan[] => [
  {
    code: t.family,
    family: t.family,
    kind: "nexora",
    status: "draft",
    interval: "month",
    suggested_price_cents: t.monthly,
    included_credits_cents: t.credits,
    included_storage_gb: t.storageGb,
    trial_days: 0,
    trial_card: "default",
    sort: (i + 1) * 10,
    translations: [
      { languages_code: "fr-CA", ...t.fr },
      { languages_code: "en-CA", ...t.en },
    ],
  },
  {
    code: `${t.family}-annuel`,
    family: t.family,
    kind: "nexora",
    status: "draft",
    interval: "year",
    suggested_price_cents: yearlyOf(t.monthly),
    included_credits_cents: t.credits * 12,
    included_storage_gb: t.storageGb,
    trial_days: 0,
    trial_card: "default",
    sort: (i + 1) * 10 + 1,
    translations: [
      { languages_code: "fr-CA", ...t.fr },
      { languages_code: "en-CA", ...t.en },
    ],
  },
];

export const DRAFT_PLANS: DraftPlan[] = [
  ...TIERS.flatMap(tierPlans),
  {
    code: "nexora-go-supplementaire",
    family: "nexora-go-supplementaire",
    kind: "storage",
    status: "draft",
    interval: "month",
    suggested_price_cents: 100,
    included_credits_cents: 0,
    included_storage_gb: 1,
    trial_days: 0,
    trial_card: "default",
    sort: 100,
    translations: [
      {
        languages_code: "fr-CA",
        name: "Go supplémentaire",
        description: "Un gigaoctet d’espace de plus, ajouté à votre offre.",
        features: ["Ajouté à l’espace de votre offre", "Facturé par mois"],
      },
      {
        languages_code: "en-CA",
        name: "Extra gigabyte",
        description: "One more gigabyte of storage, added to your plan.",
        features: ["Added to your plan’s storage", "Billed monthly"],
      },
    ],
  },
];

/** Forfaits de recharge : 1 $ = 100 crédits (1 crédit = 1 ¢ CA). */
export const DRAFT_CREDIT_PACKS: DraftCreditPack[] = [
  1000, 2500, 5000, 10000,
].map((cents, i) => ({
  code: `recharge-${cents / 100}`,
  status: "draft" as const,
  suggested_price_cents: cents,
  credits: cents,
  sort: (i + 1) * 10,
}));

/**
 * Anciennes offres « workstudio-* » (vague 2) remplacées par la famille « nexora ». Le chargement initial les ARCHIVE si
 * elles existent encore en brouillon ; une offre approuvée ou publiée n'est jamais touchée.
 */
export const RETIRED_PLAN_CODES: string[] = [
  "workstudio-demarrage",
  "workstudio-demarrage-annuel",
  "workstudio-equipe",
  "workstudio-equipe-annuel",
  "workstudio-affaires",
  "workstudio-affaires-annuel",
];
