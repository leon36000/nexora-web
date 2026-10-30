/**
 * Modèles d'embedding pris en charge par le RAG (identifiants publics du catalogue). Les vecteurs sont stockés en 1024
 * dimensions : un modèle n'est accepté que si sa sortie s'y ramène (1024 natifs, plus court complété par des zéros,
 * ou plus long ET tronquable sans perte de sens — Matryoshka). Aucun paramètre `dimensions` n'est envoyé au
 * fournisseur : la troncature se fait ici, ce qui marche même si l'amont ignore le paramètre.
 */
export interface EmbeddingProfile {
  /** Sortie plus longue que 1024 tronquable puis renormalisée. */
  matryoshka: boolean;
  /** Préfixe de consigne ajouté devant une REQUÊTE (jamais devant un document). */
  queryPrefix: string;
}

const PROFILES: Record<string, EmbeddingProfile> = {
  "nexora/qwen3-embedding-8b": {
    matryoshka: true,
    queryPrefix:
      "Instruct: Given a search query, retrieve relevant passages that answer the query\nQuery: ",
  },
  "nexora/bge-m3-multi-8k": { matryoshka: false, queryPrefix: "" },
  // 768 dimensions natives : complétées par des zéros jusqu'à 1024.
  "nexora/embeddinggemma-2": { matryoshka: true, queryPrefix: "" },
};

export const SUPPORTED_EMBEDDING_MODELS: readonly string[] =
  Object.keys(PROFILES);

export function embeddingProfile(publicId: string): EmbeddingProfile | null {
  return Object.hasOwn(PROFILES, publicId)
    ? (PROFILES[publicId] as EmbeddingProfile)
    : null;
}
