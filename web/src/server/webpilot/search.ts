import {
  type Format,
  NO_UNITS,
  readPage,
  SafeFetchError,
  SearchError,
  type SearchHit,
  searchWeb,
  type Units,
} from "@nexora/webpilot";
import { W } from "./errors";
import {
  begin,
  type Ctx,
  checkPrivacy,
  pricesFor,
  runBilled,
} from "./pipeline";
import { readFailure, unreadPage } from "./read";
import { badFieldMessage, paramOf, searchSchema } from "./schemas";
import { hopPrivacy } from "./scrape";
import type { WebpilotDeps } from "./types";

/** Destination déclarée à Privacy Router pour une requête de recherche (les moteurs sont choisis par le service). */
export const SEARCH_DESTINATION = "web-search";
const CONTENT_CONCURRENCY = 4;
const CONTENT_FORMATS: Format[] = ["markdown"];

interface HitOut {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  content?: string | null;
  content_error?: string;
}

/** Contenu lisible d'un résultat : chaque lecture est une sortie (politique) et respecte robots.txt. */
async function readHit(
  ctx: Ctx,
  deps: WebpilotDeps,
  hit: SearchHit,
): Promise<{ content: string | null; error?: string; pages: number }> {
  let url: URL;
  try {
    url = await deps.reader.client.check(hit.url);
  } catch {
    return { content: null, error: "url_not_allowed", pages: 0 };
  }
  const privacy = await checkPrivacy(
    ctx,
    deps,
    {
      operation: "scrape",
      destination: { host: url.hostname, path: url.pathname },
      kinds: ["url"],
    },
    "search",
    url.hostname,
  );
  if (!privacy.ok)
    return {
      content: null,
      error:
        privacy.response.status === 503
          ? "privacy_router_unavailable"
          : "privacy_policy_denied",
      pages: 0,
    };
  try {
    const result = await readPage(deps.reader, {
      url: url.toString(),
      formats: CONTENT_FORMATS,
      onlyMainContent: true,
      render: "static",
      beforeHop: hopPrivacy(ctx, deps, "scrape", url.hostname),
    });
    if (result.kind === "page")
      return { content: result.content.markdown ?? "", pages: 1 };
    const failure = unreadPage(result);
    return {
      content: null,
      error: failure && !failure.ok ? failure.errorCode : "target_error",
      pages: 0,
    };
  } catch (error) {
    const failure = readFailure(error);
    return {
      content: null,
      error: failure.ok ? "target_error" : failure.errorCode,
      pages: 0,
    };
  }
}

async function pool<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await work(items[i] as T);
      }
    }),
  );
  return out;
}

export async function handleSearch(
  request: Request,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "search", { body: true });
    if (!begun.ok) return begun.response;
    const { ctx } = begun;
    const parsed = searchSchema.safeParse(begun.body);
    if (!parsed.success)
      return W.badRequest(
        badFieldMessage(parsed.error),
        "invalid_request",
        paramOf(parsed.error),
        ctx.headers,
      );
    const input = parsed.data;
    const limit = input.limit ?? 10;
    if (limit > deps.config.maxSearchResults)
      return W.badRequest(
        `« limit » ne peut pas dépasser ${deps.config.maxSearchResults}.`,
        "invalid_request",
        "limit",
        ctx.headers,
      );
    if (!deps.searchClient || !deps.config.searchUrl)
      return W.unavailable(
        "La recherche n'est pas configurée sur ce service.",
        ctx.headers,
      );
    const searchUrl = deps.config.searchUrl;
    const searchClient = deps.searchClient;
    const withContent = input.include_content === true;
    // Une page de résultats, plus une page par résultat lu quand le contenu est demandé.
    const reserve: Units = {
      ...NO_UNITS,
      pageStatic: 1 + (withContent ? limit : 0),
    };
    const priced = await pricesFor(ctx, deps, reserve);
    if (!priced.ok) return priced.response;
    const privacy = await checkPrivacy(
      ctx,
      deps,
      {
        operation: "search",
        destination: { host: SEARCH_DESTINATION },
        kinds: ["query"],
        content: input.query,
      },
      "search",
      null,
    );
    if (!privacy.ok) return privacy.response;
    const query = privacy.content ?? input.query;

    return await runBilled(ctx, deps, {
      operation: "search",
      reserve,
      prices: priced.prices,
      host: null,
      privacy: privacy.note,
      execute: async () => {
        let hits: SearchHit[];
        try {
          hits = await searchWeb(searchClient, searchUrl, {
            query,
            limit,
            ...(input.language ? { language: input.language } : {}),
            ...(input.country ? { country: input.country } : {}),
          });
        } catch (error) {
          if (error instanceof SearchError || error instanceof SafeFetchError) {
            return {
              ok: false,
              errorCode: "target_error",
              httpStatus: 502,
              response: (h) =>
                W.targetError("Le service de recherche n'a pas répondu.", h),
            };
          }
          throw error;
        }
        let pages = 1;
        const results: HitOut[] = hits.map((h) => ({ ...h }));
        if (withContent) {
          const reads = await pool(hits, CONTENT_CONCURRENCY, (h) =>
            readHit(ctx, deps, h),
          );
          reads.forEach((r, i) => {
            const out = results[i] as HitOut;
            out.content = r.content;
            if (r.error) out.content_error = r.error;
            pages += r.pages;
          });
        }
        return {
          ok: true,
          body: { results, usage: { pages } },
          units: { ...NO_UNITS, pageStatic: pages },
        };
      },
    });
  } catch (error) {
    deps.log.error("webpilot : search", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}
