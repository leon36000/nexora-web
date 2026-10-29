/**
 * Offres Nexora WorkStudio préparées en BROUILLON (vague 2, D5) avec les prix SUGGÉRÉS par l'étude de marché
 * (docs/recherche/10-prix-et-engagements-donnees.md, partie A.1). Rien n'est publié : `price_cents` reste vide,
 * seul `suggested_price_cents` (non lu par le site ni par le public) porte la suggestion ; le fondateur adopte
 * le prix (module Paiements, « Adopter le prix suggéré »), puis publie. Les limites des offres sont celles
 * PROPOSÉES par l'étude : à valider avec le produit avant de publier.
 *
 * Une ligne mensuelle et une ligne annuelle par offre (même `family`). Ligne annuelle : le prix est le total de
 * l'année (12 mois au tarif annuel par mois) et les crédits inclus sont ceux de douze mois, versés un douzième par
 * mois (chaque douzième expire à la fin de son mois).
 *
 * Aucun essai gratuit (`trial_days` = 0) : l'accès gratuit est réservé à l'organisation « maison » (l'administrateur).
 *
 * Crédits inclus : « 5 millions de jetons par mois » du modèle par défaut de WorkStudio, en crédits (voir
 * `INCLUDED_CREDITS_CENTS`). Même forfait pour les trois offres (décision provisoire, docs/facturation-workstudio.md).
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

/**
 * Valeur de 5 M de jetons (70 % d'entrée, 30 % de sortie) du modèle par défaut `nexora/deepseek-v4.1-flash-1017`,
 * en cents CAD, arrondie vers le haut :
 *  - tarif amont de pointe 0,30 $ US (entrée) et 1,20 $ US (sortie) par million (feuille de départ du catalogue) ;
 *  - taux de référence 1 USD = 1,4025 CAD (Banque du Canada, 26/10/2026) et marge de 10 % : vente à 0,462825 $
 *    (entrée) et 1,8513 $ (sortie) par million ;
 *  - 5 M × (0,7 × 0,462825 + 0,3 × 1,8513) = 4,396838 $, soit 440 cents.
 * Le taux approuvé en production fait foi pour la facturation ; ce montant est la valeur du crédit mensuel. Le test
 * de ce fichier et celui de `web/src/server/billing/included-tokens.test.ts` refont le calcul chacun de leur côté.
 */
export const INCLUDED_CREDITS_CENTS = 440;

const OFFERS: Offer[] = [
  {
    family: "workstudio-demarrage",
    monthly: 39,
    yearlyPerMonth: 33,
    credits: INCLUDED_CREDITS_CENTS,
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
    credits: INCLUDED_CREDITS_CENTS,
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
    credits: INCLUDED_CREDITS_CENTS,
    fr: {
      name: "WorkStudio Affaires",
      description:
        "Pour les organisations qui exigent contrôle, audit et soutien rapproché.",
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
      description:
        "For organizations that need control, audit and close support.",
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
    included_credits_cents: o.credits,
    trial_days: 0,
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
    included_credits_cents: o.credits * 12,
    trial_days: 0,
    trial_card: "default" as const,
    sort: (i + 1) * 10 + 1,
    translations: [
      { languages_code: "fr-CA" as const, ...o.fr },
      { languages_code: "en-CA" as const, ...o.en },
    ],
  },
]);
