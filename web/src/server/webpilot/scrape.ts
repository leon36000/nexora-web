import {
  type Format,
  NO_UNITS,
  readPage,
  SafeFetchError,
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
import { PrivacyStop, readFailure, unreadPage } from "./read";
import { badFieldMessage, paramOf, scrapeSchema } from "./schemas";
import type { WebpilotDeps } from "./types";

/** Contenu rendu d'une page : seulement les formats demandés, plus les métadonnées. */
export function pageBody(
  result: Extract<Awaited<ReturnType<typeof readPage>>, { kind: "page" }>,
  formats: readonly Format[],
  now: Date,
) {
  const c = result.content;
  const content: Record<string, unknown> = {};
  if (formats.includes("markdown")) content.markdown = c.markdown ?? "";
  if (formats.includes("text")) content.text = c.text ?? "";
  if (formats.includes("html")) content.html = c.html ?? "";
  if (formats.includes("links")) content.links = c.links ?? [];
  return {
    url: result.url,
    status: result.status,
    content,
    metadata: {
      title: c.metadata.title,
      language: c.metadata.language,
      description: c.metadata.description,
      canonical_url: c.metadata.canonicalUrl,
      read_at: now.toISOString(),
    },
  };
}

/** Crochet de saut : une redirection vers un AUTRE hôte est une nouvelle sortie, évaluée par Privacy Router. */
export function hopPrivacy(
  ctx: Ctx,
  deps: WebpilotDeps,
  operation: "scrape" | "crawl" | "extract",
  originHost: string,
): (hop: URL) => Promise<void> {
  return async (hop) => {
    if (hop.hostname === originHost) return;
    const check = await checkPrivacy(
      ctx,
      deps,
      {
        operation,
        destination: { host: hop.hostname, path: hop.pathname },
        kinds: ["url"],
      },
      operation === "extract" ? "extract" : operation,
      hop.hostname,
    );
    if (!check.ok)
      throw new PrivacyStop(
        check.response,
        check.response.status === 503
          ? "privacy_router_unavailable"
          : "privacy_policy_denied",
        check.response.status,
      );
  };
}

/** Vérifie l'adresse comme le fera la lecture (schéma, port, nom, résolution) avant toute réservation. */
export async function vetUrl(
  deps: WebpilotDeps,
  raw: string,
  headers: Record<string, string>,
): Promise<{ url: URL } | { response: Response }> {
  try {
    return { url: await deps.reader.client.check(raw) };
  } catch (error) {
    if (error instanceof SafeFetchError) {
      if (error.code === "url_not_allowed")
        return { response: W.urlNotAllowed(headers) };
      return {
        response: W.targetUnreachable(
          error.message === "hôte introuvable"
            ? "Le nom de l'hôte est introuvable."
            : "La cible n'a pas répondu.",
          headers,
        ),
      };
    }
    throw error;
  }
}

/** En-têtes transmis à la cible : liste fermée (`WEBPILOT_ALLOWED_HEADERS`). Null si l'un d'eux n'est pas permis. */
export function pickHeaders(
  deps: WebpilotDeps,
  given: Record<string, string> | undefined,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(given ?? {})) {
    const lower = name.toLowerCase();
    if (!deps.config.allowedHeaders.includes(lower)) return null;
    if (/[\r\n]/.test(value)) return null;
    out[lower] = value;
  }
  return out;
}

export async function handleScrape(
  request: Request,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "scrape", { body: true });
    if (!begun.ok) return begun.response;
    const { ctx } = begun;
    const parsed = scrapeSchema.safeParse(begun.body);
    if (!parsed.success)
      return W.badRequest(
        badFieldMessage(parsed.error),
        "invalid_request",
        paramOf(parsed.error),
        ctx.headers,
      );
    const input = parsed.data;
    const headers = pickHeaders(deps, input.headers);
    if (!headers)
      return W.badRequest(
        `En-têtes permis : ${deps.config.allowedHeaders.join(", ")}.`,
        "invalid_request",
        "headers",
        ctx.headers,
      );
    const render = input.render ?? "static";
    if (render === "browser" && !deps.reader.renderer)
      return W.renderUnavailable(ctx.headers);
    const waitMs = Math.min(input.wait_ms ?? 0, deps.config.maxWaitMs);
    const formats = input.formats ?? ["markdown"];

    const vetted = await vetUrl(deps, input.url, ctx.headers);
    if ("response" in vetted) return vetted.response;
    const { url } = vetted;

    const units: Units =
      render === "browser"
        ? { ...NO_UNITS, pageBrowser: 1 }
        : { ...NO_UNITS, pageStatic: 1 };
    const priced = await pricesFor(ctx, deps, units);
    if (!priced.ok) return priced.response;
    const privacy = await checkPrivacy(
      ctx,
      deps,
      {
        operation: "scrape",
        destination: { host: url.hostname, path: url.pathname },
        kinds: ["url"],
      },
      "scrape",
      url.hostname,
    );
    if (!privacy.ok) return privacy.response;

    return await runBilled(ctx, deps, {
      operation: "scrape",
      reserve: units,
      prices: priced.prices,
      host: url.hostname,
      privacy: privacy.note,
      execute: async () => {
        try {
          const result = await readPage(deps.reader, {
            url: url.toString(),
            formats,
            onlyMainContent: input.only_main_content ?? true,
            render,
            headers,
            waitMs,
            beforeHop: hopPrivacy(ctx, deps, "scrape", url.hostname),
          });
          const failure = unreadPage(result);
          if (failure) return failure;
          if (result.kind !== "page") return W_never();
          return {
            ok: true,
            body: {
              ...pageBody(result, formats, deps.now()),
              usage: { pages: 1 },
            },
            units,
          };
        } catch (error) {
          return readFailure(error);
        }
      },
    });
  } catch (error) {
    deps.log.error("webpilot : scrape", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}

function W_never(): never {
  throw new Error("page attendue");
}
