import type { MetadataRoute } from "next";
import { isIndexableEnvironment } from "./site-env";

/**
 * Politique robots.txt PAR TYPE DE ROBOT.
 *
 * DÉCISION (fondateur, 29 octobre 2026) : le contenu public de nexora.ai est fait pour être lu, cité et appris, par les
 * moteurs de recherche comme par les moteurs génératifs. PAR DÉFAUT TOUT LE PUBLIC EST AUTORISÉ, pour tous les robots
 * ci-dessous, entraînement compris ; seuls les chemins privés (API, passerelle, espace client) sont fermés. Les
 * engagements « vos données n'entraînent jamais un modèle » (CL-07, CL-E03) concernent les données CONFIÉES par les
 * clients, jamais les pages publiques du site.
 *
 * Levier de repli : `ROBOTS_AI_TRAINING=disallow` refuse seulement les robots d'entraînement ; recherche et réponse
 * restent autorisées. Toute autre valeur (absente, `allow`, inconnue) garde la politique par défaut.
 *
 * - `search` : robots qui indexent pour des moteurs de recherche ou de réponses (ChatGPT Search, Perplexity, Claude…).
 * - `user-action` : robots déclenchés par une personne qui demande une page (ChatGPT-User, Claude-User…). Selon leurs
 *   opérateurs, certains ne lisent pas robots.txt : le groupe explicite exprime l'intention, il ne prétend pas contrôler.
 * - `training` : robots qui collectent pour entraîner des modèles.
 *
 * Sources : documentation des opérateurs (consultée les 26 et 27 octobre 2026), registre communautaire
 * ai-robots-txt/ai.robots.txt (consulté le 29 octobre 2026), docs/recherche/01 §4.9. Revue trimestrielle.
 */
export type BotKind = "search" | "training" | "user-action";

export interface BotEntry {
  /** Jeton `User-agent` exact. */
  name: string;
  operator: string;
  kind: BotKind;
  /** À quoi sert le robot (une phrase). */
  purpose: string;
  /** Lit-il robots.txt, selon son opérateur ? */
  honorsRobots: "oui" | "non" | "non confirmé";
  /** Page de l'opérateur qui décrit le robot. */
  docUrl: string;
}

export const AI_BOTS: readonly BotEntry[] = [
  // --- recherche et réponses (indexation)
  {
    name: "Googlebot",
    operator: "Google",
    kind: "search",
    purpose:
      "Indexation de Google Search, source des AI Overviews et du mode IA.",
    honorsRobots: "oui",
    docUrl:
      "https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers",
  },
  {
    name: "Bingbot",
    operator: "Microsoft",
    kind: "search",
    purpose: "Indexation de Bing, qui alimente aussi Copilot.",
    honorsRobots: "oui",
    docUrl:
      "https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0",
  },
  {
    name: "DuckDuckBot",
    operator: "DuckDuckGo",
    kind: "search",
    purpose: "Indexation de DuckDuckGo.",
    honorsRobots: "oui",
    docUrl: "https://duckduckgo.com/duckduckgo-help-pages/results/duckduckbot",
  },
  {
    name: "Applebot",
    operator: "Apple",
    kind: "search",
    purpose: "Recherche Siri et Spotlight.",
    honorsRobots: "oui",
    docUrl: "https://support.apple.com/en-us/119829",
  },
  {
    name: "OAI-SearchBot",
    operator: "OpenAI",
    kind: "search",
    purpose: "Indexation pour la recherche de ChatGPT.",
    honorsRobots: "oui",
    docUrl: "https://platform.openai.com/docs/bots",
  },
  {
    name: "PerplexityBot",
    operator: "Perplexity",
    kind: "search",
    purpose: "Indexation pour les réponses de Perplexity.",
    honorsRobots: "oui",
    docUrl: "https://docs.perplexity.ai/guides/bots",
  },
  {
    name: "Claude-SearchBot",
    operator: "Anthropic",
    kind: "search",
    purpose: "Indexation pour la qualité des résultats de recherche de Claude.",
    honorsRobots: "oui",
    docUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    name: "MistralAI-Index",
    operator: "Mistral AI",
    kind: "search",
    purpose:
      "Indexation pour la recherche du Chat de Mistral (pas d'entraînement).",
    honorsRobots: "oui",
    docUrl: "https://docs.mistral.ai/robots/",
  },
  {
    name: "Bravebot",
    operator: "Brave",
    kind: "search",
    purpose:
      "Indexation de Brave Search, qui alimente des réponses génératives.",
    honorsRobots: "oui",
    docUrl: "https://safe.search.brave.com/help/brave-search-crawler",
  },
  {
    name: "Amazonbot",
    operator: "Amazon",
    kind: "search",
    purpose: "Amélioration des services d'Amazon et réponses d'Alexa.",
    honorsRobots: "oui",
    docUrl: "https://developer.amazon.com/amazonbot",
  },
  // --- demandes déclenchées par une personne
  {
    name: "ChatGPT-User",
    operator: "OpenAI",
    kind: "user-action",
    purpose: "Ouvre une page quand une personne la demande dans ChatGPT.",
    honorsRobots: "non confirmé",
    docUrl: "https://platform.openai.com/docs/bots",
  },
  {
    name: "Perplexity-User",
    operator: "Perplexity",
    kind: "user-action",
    purpose: "Ouvre une page quand une personne la demande dans Perplexity.",
    honorsRobots: "non",
    docUrl: "https://docs.perplexity.ai/guides/bots",
  },
  {
    name: "Claude-User",
    operator: "Anthropic",
    kind: "user-action",
    purpose: "Ouvre une page quand une personne la demande à Claude.",
    honorsRobots: "oui",
    docUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    name: "MistralAI-User",
    operator: "Mistral AI",
    kind: "user-action",
    purpose: "Ouvre une page quand une personne la demande au Chat de Mistral.",
    honorsRobots: "oui",
    docUrl: "https://docs.mistral.ai/robots/",
  },
  {
    name: "DuckAssistBot",
    operator: "DuckDuckGo",
    kind: "user-action",
    purpose: "Réponses générées DuckAssist, à la demande d'une personne.",
    honorsRobots: "oui",
    docUrl:
      "https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot",
  },
  // --- entraînement de modèles
  {
    name: "GPTBot",
    operator: "OpenAI",
    kind: "training",
    purpose: "Collecte pour entraîner les modèles d'OpenAI.",
    honorsRobots: "oui",
    docUrl: "https://platform.openai.com/docs/bots",
  },
  {
    name: "ClaudeBot",
    operator: "Anthropic",
    kind: "training",
    purpose: "Collecte pour entraîner les modèles d'Anthropic.",
    honorsRobots: "oui",
    docUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    name: "anthropic-ai",
    operator: "Anthropic",
    kind: "training",
    purpose: "Ancien jeton de collecte d'Anthropic, conservé par prudence.",
    honorsRobots: "non confirmé",
    docUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    name: "Google-Extended",
    operator: "Google",
    kind: "training",
    purpose:
      "Jeton qui commande l'usage des pages pour Gemini ; Googlebot reste indépendant.",
    honorsRobots: "oui",
    docUrl:
      "https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers",
  },
  {
    name: "CCBot",
    operator: "Common Crawl",
    kind: "training",
    purpose:
      "Jeu de données ouvert, source de nombreux entraînements de modèles.",
    honorsRobots: "oui",
    docUrl: "https://commoncrawl.org/ccbot",
  },
  {
    name: "Applebot-Extended",
    operator: "Apple",
    kind: "training",
    purpose: "Jeton qui commande l'usage des pages pour Apple Intelligence.",
    honorsRobots: "oui",
    docUrl: "https://support.apple.com/en-us/119829",
  },
  {
    name: "Meta-ExternalAgent",
    operator: "Meta",
    kind: "training",
    purpose: "Collecte pour entraîner les modèles de Meta.",
    honorsRobots: "oui",
    docUrl:
      "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
  },
  {
    name: "MistralAI-Training",
    operator: "Mistral AI",
    kind: "training",
    purpose: "Collecte pour entraîner les modèles de Mistral AI.",
    honorsRobots: "oui",
    docUrl: "https://docs.mistral.ai/robots/",
  },
  {
    name: "Bytespider",
    operator: "ByteDance",
    kind: "training",
    purpose: "Collecte pour entraîner les modèles de ByteDance.",
    honorsRobots: "non",
    docUrl: "https://github.com/ai-robots-txt/ai.robots.txt",
  },
];

const namesOf = (kind: BotKind) =>
  AI_BOTS.filter((b) => b.kind === kind).map((b) => b.name);

export const SEARCH_BOTS = namesOf("search");
export const TRAINING_BOTS = namesOf("training");
export const USER_ACTION_BOTS = namesOf("user-action");

/**
 * Chemins jamais utiles aux moteurs : API, passerelle, espace client, Nexora Code (fr et en).
 * `/og/` reste ouvert : les aperçus sociaux lisent l'image. `/<clé IndexNow>.txt` reste ouvert aussi.
 */
export const PRIVATE_PATHS = [
  "/api/",
  "/v1/",
  "/compte",
  "/en/compte",
  // Nexora Code : autorisation d'un appareil (/code/device) et mandataire de l'environnement hébergé (/code/ws).
  "/code/",
  "/en/code/",
] as const;

export type TrainingPolicy = "allow" | "disallow";

/** Politique des robots d'entraînement : autorisés, sauf `ROBOTS_AI_TRAINING=disallow` exactement. */
export function aiTrainingPolicy(
  env: Record<string, string | undefined> = process.env,
): TrainingPolicy {
  return env.ROBOTS_AI_TRAINING === "disallow" ? "disallow" : "allow";
}

export function buildRobots(options: {
  siteUrl: string;
  env?: Record<string, string | undefined>;
}): MetadataRoute.Robots {
  const env = options.env ?? process.env;
  if (!isIndexableEnvironment(env)) {
    // Préproduction : rien à indexer, aucun sitemap annoncé.
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const privatePaths = [...PRIVATE_PATHS];
  const open = (userAgent: string) => ({
    userAgent,
    allow: "/",
    disallow: [...privatePaths],
  });
  const training = aiTrainingPolicy(env);
  return {
    rules: [
      // Chaque robot a son groupe : un groupe nommé remplace le groupe « * », il répète donc les chemins privés.
      ...SEARCH_BOTS.map(open),
      ...USER_ACTION_BOTS.map(open),
      ...TRAINING_BOTS.map((userAgent) =>
        training === "allow" ? open(userAgent) : { userAgent, disallow: "/" },
      ),
      open("*"),
    ],
    sitemap: `${options.siteUrl}/sitemap.xml`,
  };
}
