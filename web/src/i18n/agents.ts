import type { Lang } from "./config";
import { agentsEnCA } from "./dictionaries/agents-en-CA";
import { type AgentsDictionary, agentsFrCA } from "./dictionaries/agents-fr-CA";

export type { AgentsDictionary };

const dictionaries: Record<Lang, AgentsDictionary> = {
  fr: agentsFrCA,
  en: agentsEnCA,
};

/** Dictionnaire des agents hébergés : catalogue, fiches, garde-fous, consommation de l'espace client. */
export function getAgentsDictionary(lang: Lang): AgentsDictionary {
  return dictionaries[lang];
}
