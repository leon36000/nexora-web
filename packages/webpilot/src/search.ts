import type { SafeHttpClient } from "./http.ts";

/**
 * Recherche sur le Web par un SearXNG auto-hébergé (réseau interne isolé, voir deploy/compose.yml). L'adresse du
 * service est celle de `WEBPILOT_SEARCH_URL` ; le client HTTP qui l'appelle ne l'admet qu'à ce titre (hôte approuvé).
 */

export interface SearchRequest {
  query: string;
  limit: number;
  language?: string;
  country?: string;
}
export interface SearchHit {
  rank: number;
  title: string;
  url: string;
  snippet: string;
}

export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchError";
  }
}

const MAX_BYTES = 2_000_000;

export async function searchWeb(
  client: Pick<SafeHttpClient, "get">,
  baseUrl: string,
  request: SearchRequest,
): Promise<SearchHit[]> {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", request.query);
  url.searchParams.set("format", "json");
  url.searchParams.set(
    "language",
    request.language && request.country
      ? `${request.language}-${request.country}`
      : (request.language ?? "all"),
  );
  url.searchParams.set("safesearch", "1");
  const res = await client.get(url.toString(), {
    headers: { accept: "application/json" },
    maxBytes: MAX_BYTES,
  });
  if (res.status !== 200)
    throw new SearchError("le service de recherche a échoué");
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(res.body));
  } catch {
    throw new SearchError("réponse illisible du service de recherche");
  }
  const list = (json as { results?: unknown })?.results;
  if (!Array.isArray(list))
    throw new SearchError("réponse inattendue du service de recherche");
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const { title, url: raw, content } = item as Record<string, unknown>;
    if (typeof raw !== "string") continue;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const clean = parsed.toString();
    if (seen.has(clean)) continue;
    seen.add(clean);
    hits.push({
      rank: hits.length + 1,
      title: typeof title === "string" ? title : "",
      url: clean,
      snippet: typeof content === "string" ? content : "",
    });
    if (hits.length >= request.limit) break;
  }
  return hits;
}
