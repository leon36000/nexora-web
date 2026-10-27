import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "../db";
import { getEmbedSettings, listCallableAgents } from "./catalog";
import {
  type PublicAgent,
  type PublicEmbedConfig,
  publicAgents,
  toPublicEmbed,
} from "./public";
import { AGENTS_TAG } from "./tag";

/**
 * Lecture du catalogue PUBLIÉ des agents pour les pages (Cache Components). Un changement d'agent, de prix ou de
 * réglage revalide l'étiquette `hosted-agents`. Si la base est indisponible, la page affiche un catalogue vide
 * plutôt qu'une erreur (durée de cache courte pour réessayer vite).
 */
export interface PublicAgents {
  agents: PublicAgent[];
  /** Dernière publication parmi les agents affichés (ISO), ou null. */
  publishedAt: string | null;
  available: boolean;
}

export async function getPublicAgents(): Promise<PublicAgents> {
  "use cache";
  cacheTag(AGENTS_TAG);
  try {
    const agents = publicAgents(await listCallableAgents(getDb(), new Date()));
    cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
    const dates = agents.map((a) => a.publishedAt).filter((d) => d !== null);
    return {
      agents,
      publishedAt: dates.length > 0 ? (dates.sort().at(-1) ?? null) : null,
      available: true,
    };
  } catch {
    cacheLife({ stale: 10, revalidate: 10, expire: 60 });
    return { agents: [], publishedAt: null, available: false };
  }
}

/** Réglage public de la bulle WorkStudio ; null si désactivée, incomplète ou illisible. */
export async function getPublicEmbed(): Promise<PublicEmbedConfig | null> {
  "use cache";
  cacheTag(AGENTS_TAG);
  try {
    const embed = toPublicEmbed(await getEmbedSettings(getDb()));
    cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
    return embed;
  } catch {
    cacheLife({ stale: 10, revalidate: 10, expire: 60 });
    return null;
  }
}
