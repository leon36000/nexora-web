/**
 * Offres Nexora WorkStudio préparées en BROUILLON (vague 2, D5) avec les prix SUGGÉRÉS par l'étude de marché
 * (docs/recherche/10-prix-et-engagements-donnees.md, partie A.1). Rien n'est publié : `price_cents` reste vide,
 * seul `suggested_price_cents` (non lu par le site ni par le public) porte la suggestion ; le fondateur adopte
 * le prix (module Paiements, « Adopter le prix suggéré »), puis publie. Les limites des offres sont celles
 * PROPOSÉES par l'étude : à valider avec le produit avant de publier.
 *
 * Une ligne mensuelle et une ligne annuelle par offre (même `family`). Ligne annuelle : le prix est le total de
 * l'année (12 mois au tarif annuel par mois) et les crédits inclus sont ceux de douze mois, accordés à la
 * facture annuelle et valables jusqu'à la fin de la période.
 */
export interface DraftPlan {
  code: string;
  family: string;
  kind: "workstudio";
  status: "draft";
  interval: "month" | "year";
  suggested_price_cents: number;
  included_credits_cents: number;
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

interface Offer {
  family: string;
  monthly: number;
  yearlyPerMonth: number;
  credits: number;
  fr: { name: string; description: string; features: string[] };
  en: { name: string; description: string; features: string[] };
}

const OFFERS: Offer[] = [
  {
    family: "workstudio-demarrage",
    monthly: 39,
    yearlyPerMonth: 33,
    credits: 10,
    fr: {
      name: "WorkStudio Démarrage",
      description: "Pour lancer vos premiers agents et automatisations.",
      features: [
        "1 espace de travail",
        "3 utilisateurs",
        "5 agents actifs",
        "5 000 exécutions par mois",
        "Connecteurs de base",
      ],
    },
    en: {
      name: "WorkStudio Starter",
      description: "To launch your first agents and automations.",
      features: [
        "1 workspace",
        "3 users",
        "5 active agents",
        "5,000 runs per month",
        "Basic connectors",
      ],
    },
  },
  {
    family: "workstudio-equipe",
    monthly: 129,
    yearlyPerMonth: 109,
    credits: 40,
    fr: {
      name: "WorkStudio Équipe",
      description: "Pour une équipe qui automatise au quotidien.",
      features: [
        "3 espaces de travail",
        "15 utilisateurs",
        "25 agents actifs",
        "50 000 exécutions par mois",
        "Connecteurs premium",
        "Journal d’activité de 30 jours",
        "Soutien par courriel, réponse en un jour ouvrable",
      ],
    },
    en: {
      name: "WorkStudio Team",
      description: "For a team that automates every day.",
      features: [
        "3 workspaces",
        "15 users",
        "25 active agents",
        "50,000 runs per month",
        "Premium connectors",
        "30-day activity log",
        "Email support, reply within one business day",
      ],
    },
  },
  {
    family: "workstudio-affaires",
    monthly: 349,
    yearlyPerMonth: 299,
    credits: 150,
    fr: {
      name: "WorkStudio Affaires",
      description: "Pour les organisations qui exigent contrôle, audit et soutien rapproché.",
      features: [
        "50 utilisateurs",
        "Agents actifs illimités (usage raisonnable)",
        "250 000 exécutions par mois",
        "Authentification unique (SAML)",
        "Journal d’audit de 12 mois",
        "Contrat de traitement des données (DPA)",
        "Hébergement chez Nexora ou sur votre serveur",
        "Soutien en 4 heures ouvrables",
        "Formation de 2 heures",
      ],
    },
    en: {
      name: "WorkStudio Business",
      description: "For organizations that need control, audit and close support.",
      features: [
        "50 users",
        "Unlimited active agents (fair use)",
        "250,000 runs per month",
        "Single sign-on (SAML)",
        "12-month audit log",
        "Data processing agreement (DPA)",
        "Hosting at Nexora or on your own server",
        "Support within 4 business hours",
        "2-hour training session",
      ],
    },
  },
];

export const DRAFT_PLANS: DraftPlan[] = OFFERS.flatMap((o, i) => [
  {
    code: o.family,
    family: o.family,
    kind: "workstudio" as const,
    status: "draft" as const,
    interval: "month" as const,
    suggested_price_cents: o.monthly * 100,
    included_credits_cents: o.credits * 100,
    trial_days: 14,
    trial_card: "default" as const,
    sort: (i + 1) * 10,
    translations: [
      { languages_code: "fr-CA" as const, ...o.fr },
      { languages_code: "en-CA" as const, ...o.en },
    ],
  },
  {
    code: `${o.family}-annuel`,
    family: o.family,
    kind: "workstudio" as const,
    status: "draft" as const,
    interval: "year" as const,
    suggested_price_cents: o.yearlyPerMonth * 12 * 100,
    included_credits_cents: o.credits * 12 * 100,
    trial_days: 14,
    trial_card: "default" as const,
    sort: (i + 1) * 10 + 1,
    translations: [
      { languages_code: "fr-CA" as const, ...o.fr },
      { languages_code: "en-CA" as const, ...o.en },
    ],
  },
]);
