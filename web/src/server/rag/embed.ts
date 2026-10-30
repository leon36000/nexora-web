import { embeddingProfile, fitVector, VectorError } from "@nexora/rag";
import type { ApiKeyRow } from "../gateway/keys";
import { F, gatewayFailure } from "./failure";
import { bad, good, type Result } from "./result";
import type { RagDeps } from "./types";

export interface Embedded {
  vectors: number[][];
  tokens: number;
  costMicro: bigint;
}

/**
 * Embeddings par la passerelle de Nexora (`/v1/embeddings`, appelée en interne avec la clé facturée) : débit en crédits,
 * Privacy Router, limites de débit et ligne d'Activité sont ceux de tout appel de modèle. Les vecteurs sont ramenés à
 * 1024 dimensions et normalisés (voir `profiles.ts`). Aucun texte n'est journalisé.
 */
export async function embedTexts(
  deps: RagDeps,
  key: ApiKeyRow,
  model: string,
  texts: string[],
  options: { query?: boolean } = {},
): Promise<Result<Embedded>> {
  const profile = embeddingProfile(model);
  if (!profile)
    return bad({
      ...F.invalid("Modèle d'embedding non pris en charge.", "model"),
      code: "unsupported_embedding_model",
      status: 422,
    });
  const input = options.query
    ? texts.map((t) => profile.queryPrefix + t)
    : texts;
  const request = new Request("http://rag.internal/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input, encoding_format: "float" }),
  });
  let response: Response;
  try {
    response = await deps.gateway.embeddings(request, key);
  } catch {
    return bad(
      F.unavailable(
        "Le service d'embedding ne répond pas. Réessayez dans un instant.",
      ),
    );
  }
  if (!response.ok) return bad(await gatewayFailure(response));
  let json: {
    data?: { index?: number; embedding?: unknown }[];
    usage?: { prompt_tokens?: number };
  };
  try {
    json = await response.json();
  } catch {
    return bad(F.upstream("Réponse d'embedding illisible."));
  }
  const data = json.data;
  if (!Array.isArray(data) || data.length !== texts.length)
    return bad(F.upstream("Réponse d'embedding incohérente."));
  const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors: number[][] = [];
  try {
    for (const item of ordered) {
      if (!Array.isArray(item.embedding))
        return bad(F.upstream("Réponse d'embedding incohérente."));
      vectors.push(
        fitVector(item.embedding as number[], {
          matryoshka: profile.matryoshka,
        }),
      );
    }
  } catch (error) {
    if (error instanceof VectorError)
      return bad(F.upstream("Le modèle a renvoyé un vecteur inutilisable."));
    throw error;
  }
  const cost = response.headers.get("x-nexora-cost-micro");
  return good({
    vectors,
    tokens: Number(json.usage?.prompt_tokens ?? 0) || 0,
    costMicro: cost && /^\d+$/.test(cost) ? BigInt(cost) : 0n,
  });
}
