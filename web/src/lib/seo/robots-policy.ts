import type { MetadataRoute } from "next";
import { isIndexableEnvironment } from "./site-env";

/**
 * Politique robots.txt PAR TYPE DE ROBOT (décision d'affaires à faire valider par le fondateur ; revue trimestrielle).
 *
 * - `search` : robots qui indexent pour des moteurs de recherche ou de réponses : AUTORISÉS (visibilité).
 * - `training` : robots qui collectent pour entraîner des modèles : configurables, REFUSÉS par défaut
 *   (`ROBOTS_AI_TRAINING=allow` pour les autoriser).
 * - `user-action` : robots déclenchés par une personne (ChatGPT-User, Perplexity-User…) : selon leurs opérateurs ils
 *   ne respectent pas robots.txt ; AUCUNE règle n'a d'effet sur eux, on ne prétend donc pas les contrôler.
 *
 * Sources : documentation des opérateurs (consultée les 26 et 27 octobre 2026), docs/recherche/01 §4.9.
 */
export const SEARCH_BOTS = [
  "Googlebot",
  "Bingbot",
  "DuckDuckBot",
  "OAI-SearchBot",
  "PerplexityBot",
  "Claude-SearchBot",
] as const;

export const TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Bytespider",
] as const;

export const USER_ACTION_BOTS = [
  "ChatGPT-User",
  "Perplexity-User",
  "Claude-User",
] as const;

/** Chemins jamais utiles aux moteurs : API, passerelle, espace client. (/og/ reste ouvert : les aperçus sociaux le lisent.) */
const PRIVATE_PATHS = ["/api/", "/v1/", "/compte", "/en/compte"] as const;

type TrainingPolicy = "allow" | "disallow";

function trainingPolicy(
  env: Record<string, string | undefined> = process.env,
): TrainingPolicy {
  return env.ROBOTS_AI_TRAINING === "allow" ? "allow" : "disallow";
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
  const training = trainingPolicy(env);
  return {
    rules: [
      // Les robots de recherche ont leur propre groupe : un groupe nommé remplace le groupe « * ».
      ...SEARCH_BOTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: privatePaths,
      })),
      ...TRAINING_BOTS.map((userAgent) =>
        training === "allow"
          ? { userAgent, allow: "/", disallow: privatePaths }
          : { userAgent, disallow: "/" },
      ),
      { userAgent: "*", allow: "/", disallow: privatePaths },
    ],
    sitemap: `${options.siteUrl}/sitemap.xml`,
  };
}
