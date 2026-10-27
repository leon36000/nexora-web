import type { AgentCategory, EmbedPosition, Region } from "@nexora/db";
import { formatMicro } from "../gateway/pricing";
import type { CallableAgent, EmbedSettings } from "./catalog";

/**
 * Vue PUBLIQUE d'un agent publié : ce que `/agents` et ses fiches peuvent montrer. Ni l'adresse de l'instance, ni la
 * référence du coffre, ni l'identifiant amont n'en sortent.
 */
export interface PublicAgent {
  /** Identifiant public : `agent/<slug>`. */
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  category: AgentCategory;
  /** Hébergement de l'instance, tel que Nexora l'a déclaré. */
  region: Region;
  /** Décimaux exacts, CAD. */
  inputPerMillion: string;
  outputPerMillion: string;
  perRun: string;
  /** Vrai : valeurs d'essai de développement, jamais une offre. */
  trial: boolean;
  runTokenCap: number;
  publishedAt: string | null;
}

export function toPublicAgent(a: CallableAgent): PublicAgent {
  return {
    id: a.publicId,
    slug: a.slug,
    nameFr: a.nameFr,
    nameEn: a.nameEn,
    descriptionFr: a.descriptionFr,
    descriptionEn: a.descriptionEn,
    category: a.category,
    region: a.region,
    inputPerMillion: formatMicro(a.price.inputCadMicro),
    outputPerMillion: formatMicro(a.price.outputCadMicro),
    perRun: formatMicro(a.price.perRunCadMicro),
    trial: a.price.isTrial,
    runTokenCap: a.runTokenCap,
    publishedAt: a.publishedAt?.toISOString() ?? null,
  };
}

/** Agents à lister publiquement : publiés, visibilité « public » (les autres restent appelables, non listés). */
export function publicAgents(list: readonly CallableAgent[]): PublicAgent[] {
  return list.filter((a) => a.visibility === "public").map(toPublicAgent);
}

/** Réglage de la bulle tel que le navigateur le reçoit : seulement ce qui sert à l'afficher. */
export interface PublicEmbedConfig {
  origin: string;
  chatIdentifier: string;
  pages: string[];
  position: EmbedPosition;
  color: string | null;
  labelFr: string | null;
  labelEn: string | null;
}

/** null : bulle désactivée ou réglage incomplet. */
export function toPublicEmbed(s: EmbedSettings): PublicEmbedConfig | null {
  if (!s.enabled || !s.origin || !s.chatIdentifier || s.pages.length === 0)
    return null;
  return {
    origin: s.origin,
    chatIdentifier: s.chatIdentifier,
    pages: s.pages,
    position: s.position,
    color: s.color,
    labelFr: s.labelFr,
    labelEn: s.labelEn,
  };
}
