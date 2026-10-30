import type { Lang } from "@/i18n/config";

/**
 * Identité de l'entreprise telle que les machines la lisent : UNE source pour le logo et les profils publics de
 * l'Organization (JSON-LD) et pour les faits canoniques de llms.txt / llms-full.txt. Même nom, même description,
 * même adresse d'entité d'une page à l'autre (docs/marketing/audit-seo-geo.md, section « Cohérence d'entité »).
 */

/** Logo : l'icône carrée de la marque, servie par le site (web/public/icon-512.png, 512 × 512). */
export const LOGO_PATH = "/icon-512.png";
export const LOGO_SIZE = 512;

const MAX_SAME_AS = 12;

/**
 * Profils publics de l'entreprise (`SITE_SAME_AS`, adresses https séparées par une virgule, un espace ou un saut de
 * ligne). RIEN n'est inventé : sans la variable, aucun `sameAs` n'est émis. Sont écartés : tout ce qui n'est pas une
 * adresse https valide, les doublons, le site lui-même. Plafond de douze profils.
 */
export function parseSameAs(
  raw: string | undefined,
  siteUrl: string,
): string[] {
  if (!raw) return [];
  let siteHost: string | null = null;
  try {
    siteHost = new URL(siteUrl).host;
  } catch {
    siteHost = null;
  }
  const out: string[] = [];
  for (const token of raw.split(/[\s,]+/)) {
    if (!token) continue;
    let url: URL;
    try {
      url = new URL(token);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.host === siteHost) continue;
    const href = url.toString().replace(/\/+$/, "");
    if (!out.includes(href)) out.push(href);
    if (out.length >= MAX_SAME_AS) break;
  }
  return out;
}

export interface OrgProfile {
  logo: { url: string; width: number; height: number } | null;
  sameAs: string[];
  /** Région et pays seulement : l'adresse civique n'est pas publiée (CL-A02, à compléter par le fondateur). */
  address: { addressRegion: string; addressCountry: string } | null;
}

/**
 * Profil de l'Organization. La région « QC » découle de CL-130 (« une entreprise du Québec ») ; aucune rue, aucun
 * téléphone, aucun courriel n'est écrit tant que le fondateur ne les a pas fournis (CL-A02).
 */
export function organizationProfile(
  siteUrl: string,
  env: Record<string, string | undefined> = process.env,
): OrgProfile {
  return {
    logo: {
      url: `${siteUrl}${LOGO_PATH}`,
      width: LOGO_SIZE,
      height: LOGO_SIZE,
    },
    sameAs: parseSameAs(env.SITE_SAME_AS, siteUrl),
    address: { addressRegion: "QC", addressCountry: "CA" },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Faits canoniques
// ---------------------------------------------------------------------------------------------------------------

export interface CanonicalFact {
  id: string;
  /** Affirmations du registre (cms/content/claims.json) qui fondent la phrase : au moins une, jamais « retirée ». */
  claims: readonly string[];
  /** Chemin neutre (français) de la page qui porte l'affirmation : page du CMS ou route de l'application. */
  path: string;
  /** Vrai : le texte français reprend MOT POUR MOT l'affirmation (un test le vérifie). */
  exact?: boolean;
  text: Record<Lang, string>;
}

/**
 * Phrases courtes et citables pour les moteurs génératifs, chacune rattachée à ses affirmations et à la page qui la
 * démontre. Une phrase n'est émise que si sa page est publiée dans la langue : aucune adresse orpheline. Les phrases
 * héritent de l'état des affirmations (« en revue » tant que le fondateur ne les a pas approuvées) : voir
 * docs/marketing/plan-seo-geo.md, section « À valider par le fondateur ». Aucun chiffre, prix, client, certification.
 */
export const CANONICAL_FACTS: readonly CanonicalFact[] = [
  {
    id: "identite",
    claims: ["CL-130"],
    path: "/entreprise",
    exact: true,
    text: {
      fr: "Nexora AI est une entreprise du Québec qui conçoit, installe et accompagne des systèmes d'IA.",
      en: "Nexora AI is a Quebec company that designs, installs and supports AI systems.",
    },
  },
  {
    id: "deploiement",
    claims: ["CL-02"],
    path: "/deploiement",
    text: {
      fr: "Nexora AI offre deux modes de déploiement : installé chez vous, ou hébergé dans l'infrastructure de Nexora AI, située au Québec.",
      en: "Nexora AI offers two deployment modes: installed on your own premises, or hosted in Nexora AI's infrastructure, located in Quebec.",
    },
  },
  {
    id: "passerelle",
    claims: ["CL-27"],
    path: "/passerelle-api-modeles",
    text: {
      fr: "L'API de Nexora AI est une passerelle de modèles au format OpenAI, avec des clés, des quotas et la mesure de la consommation.",
      en: "The Nexora AI API is a model gateway in the OpenAI format, with keys, quotas and usage metering.",
    },
  },
  {
    id: "catalogue",
    claims: ["CL-S01"],
    path: "/modeles",
    text: {
      fr: "Le catalogue public de modèles affiche, pour chaque modèle, son prix en dollars canadiens par million de jetons et son lieu d'hébergement.",
      en: "The public model catalogue shows, for each model, its price in Canadian dollars per million tokens and where it is hosted.",
    },
  },
  {
    id: "facturation-api",
    claims: ["CL-S03"],
    path: "/passerelle-api-modeles",
    text: {
      fr: "L'API se facture au jeton, en dollars canadiens : chaque requête est réglée au coût réel, d'après les jetons d'entrée et de sortie.",
      en: "The API is billed per token, in Canadian dollars: each request is settled at its actual cost, from the input and output tokens.",
    },
  },
  {
    id: "confidentialite-api",
    claims: ["CL-S02"],
    path: "/passerelle-api-modeles",
    text: {
      fr: "Les événements d'usage de la passerelle ne contiennent que des métadonnées (modèle, jetons, coût, durée), jamais le contenu des requêtes ni des réponses.",
      en: "The gateway's usage events contain only metadata (model, tokens, cost, duration), never the content of requests or responses.",
    },
  },
  {
    id: "libre-service",
    claims: ["CL-12"],
    path: "/modeles",
    text: {
      fr: "Les offres en libre-service (serveurs, catalogue de modèles à crédits, agents hébergés) ne sont pas encore ouvertes à la vente : les paiements ne fonctionnent qu'en mode test.",
      en: "Self-service offers (servers, the credit-based model catalogue, hosted agents) are not yet open for sale: payments only work in test mode.",
    },
  },
  {
    id: "workstudio",
    claims: ["CL-20", "CL-26"],
    path: "/workstudio",
    text: {
      fr: "Nexora WorkStudio réunit en un seul outil, en français, la conception, la connexion et le pilotage d'agents et de flux de travaux ; il s'installe en une commande sur un serveur Docker.",
      en: "Nexora WorkStudio brings the design, connection and running of agents and workflows into one tool, in French; it installs with one command on a Docker server.",
    },
  },
  {
    id: "validation-humaine",
    claims: ["CL-21"],
    path: "/workstudio",
    text: {
      fr: "Dans WorkStudio, un flux de travaux peut s'arrêter sur la validation d'une personne, qui approuve ou refuse avant que l'action ne parte.",
      en: "In WorkStudio, a workflow can stop for a person's approval, who approves or refuses before the action goes out.",
    },
  },
  {
    id: "opsys-ai",
    claims: ["CL-O01"],
    path: "/opsys-ai",
    text: {
      fr: "OPSYS-AI est un produit en développement : son état global est partiel et il n'existe aucun déploiement de production complet.",
      en: "OPSYS-AI is a product in development: its overall state is partial and no complete production deployment exists.",
    },
  },
  {
    id: "vps",
    claims: ["CL-13"],
    path: "/vps",
    text: {
      fr: "Nexora AI prépare des serveurs privés virtuels (VPS) hébergés au Québec, avec une application d'IA installée au choix.",
      en: "Nexora AI is preparing virtual private servers (VPS) hosted in Quebec, with an AI application installed of your choice.",
    },
  },
  {
    id: "donnees",
    claims: ["CL-07"],
    path: "/vos-donnees",
    text: {
      fr: "Nexora AI n'utilise jamais les données d'un client pour entraîner ou ajuster un modèle, ni pour un autre client.",
      en: "Nexora AI never uses a client's data to train or fine-tune a model, nor for another client.",
    },
  },
  {
    id: "souverainete",
    claims: ["CL-70"],
    path: "/souverainete",
    text: {
      fr: "Nexora AI définit la souveraineté de l'IA par quatre couches de contrôle (les données, les modèles, le calcul et l'exploitation) ; c'est une définition de travail, sans valeur légale.",
      en: "Nexora AI defines AI sovereignty through four layers of control (data, models, compute and operations); it is a working definition with no legal standing.",
    },
  },
  {
    id: "suite",
    claims: ["CL-28"],
    path: "/suite",
    exact: true,
    text: {
      fr: "Nexora Corpus et les modèles Quanta et Helix : aucune disponibilité ni date n'est annoncée à ce stade.",
      en: "Nexora Corpus and the Quanta and Helix models: no availability or date is announced at this stage.",
    },
  },
  {
    id: "credits",
    claims: ["CL-T01", "CL-T04"],
    path: "/tarifs",
    text: {
      fr: "Un abonnement Nexora AI donne des crédits chaque mois et de l'espace disque ; sans abonnement, on recharge des crédits. Tout ce qui appelle un modèle d'IA consomme des crédits.",
      en: "A Nexora AI plan gives you credits every month and storage space; without a plan, you top up credits. Anything that calls an AI model uses credits.",
    },
  },
];

export interface ResolvedFact {
  id: string;
  text: string;
  /** Adresse absolue de la page qui porte l'affirmation, dans la langue. */
  url: string;
}

/**
 * Faits disponibles dans une langue. `locate` renvoie l'adresse absolue de la page publiée (et indexable) pour un
 * chemin neutre français, ou `null` : le fait est alors omis.
 */
export function resolveFacts(
  lang: Lang,
  locate: (frPath: string, lang: Lang) => string | null,
): ResolvedFact[] {
  const out: ResolvedFact[] = [];
  for (const fact of CANONICAL_FACTS) {
    const url = locate(fact.path, lang);
    if (url) out.push({ id: fact.id, text: fact.text[lang], url });
  }
  return out;
}
