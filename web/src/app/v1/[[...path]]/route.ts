import { handleUnknownEndpoint } from "@/server/gateway/errors";

// Toute adresse /v1/* qui n'est pas une route de la passerelle : erreur JSON au format OpenAI (les routes
// explicites `models`, `chat/completions` et `embeddings` ont priorité sur ce filet).
const handler = (request: Request) => handleUnknownEndpoint(request);

export {
  handler as DELETE,
  handler as GET,
  handler as HEAD,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
