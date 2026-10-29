import {
  decodeBody,
  extractContent,
  extractLinks,
  type Format,
  isHtmlType,
  type PageContent,
  plainContent,
} from "./content.ts";
import type { SafeHttpClient } from "./http.ts";
import type { RobotsChecker } from "./robots.ts";

/**
 * Lecture d'UNE page, commune à `scrape`, `search` (avec contenu), `crawl` et `extract` : robots.txt (page refusée =
 * non lue = non facturée), client HTTP de sortie, statut de la cible, type de contenu, extraction du contenu lisible.
 * Ne facture rien et n'évalue aucune politique de confidentialité : l'appelant le fait avant (adresse de départ) et via
 * `beforeHop` (redirections vers d'autres hôtes).
 */

export type ReadErrorCode = "render_unavailable";
export class ReadError extends Error {
  readonly code: ReadErrorCode;
  constructor(code: ReadErrorCode, message: string) {
    super(message);
    this.name = "ReadError";
    this.code = code;
  }
}

/** Service de rendu par navigateur (isolé du réseau de l'application ; protocole à confirmer, décision O-7). */
export interface Renderer {
  render(
    url: string,
    options: { waitMs: number },
  ): Promise<{ html: string; status: number; url: string }>;
}

export interface ReaderDeps {
  client: SafeHttpClient;
  robots: RobotsChecker;
  /** Absent : `render: "browser"` est refusé (422 `render_unavailable`). */
  renderer?: Renderer | null;
}

export interface ReadRequest {
  url: string;
  formats: readonly Format[];
  onlyMainContent: boolean;
  render: "static" | "browser";
  /** En-têtes permis (liste fermée, validée par l'appelant). */
  headers?: Record<string, string>;
  waitMs?: number;
  beforeHop?: (url: URL) => Promise<void>;
  /** Renvoyer aussi les liens de la page (exploration). */
  followLinks?: boolean;
}

export type ReadResult =
  | {
      kind: "page";
      /** Adresse finale, après redirections. */
      url: string;
      status: number;
      content: PageContent;
      render: "static" | "browser";
      followLinks?: string[];
    }
  | { kind: "robots_blocked"; url: string }
  | { kind: "http_error"; url: string; status: number }
  | { kind: "unsupported"; url: string; contentType: string };

class RobotsBlocked extends Error {
  readonly blockedUrl: string;
  constructor(url: string) {
    super("robots");
    this.blockedUrl = url;
  }
}

function typeOf(headers: Record<string, string>): string | undefined {
  return headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
}

const TEXTUAL = (type: string) =>
  type.startsWith("text/") ||
  type === "application/json" ||
  type.endsWith("+json") ||
  type === "application/xml" ||
  type.endsWith("+xml");

export async function readPage(
  deps: ReaderDeps,
  request: ReadRequest,
): Promise<ReadResult> {
  if (request.render === "browser" && !deps.renderer)
    throw new ReadError(
      "render_unavailable",
      "Le rendu par navigateur n'est pas disponible.",
    );
  const guard = async (url: URL) => {
    if (!(await deps.robots.allowed(url)))
      throw new RobotsBlocked(url.toString());
    await request.beforeHop?.(url);
  };
  try {
    if (request.render === "browser" && deps.renderer) {
      // Le service de rendu navigue lui-même : l'adresse doit passer la garde SSRF AVANT de lui être confiée.
      const checked = await deps.client.check(request.url);
      await guard(checked);
      const out = await deps.renderer.render(checked.toString(), {
        waitMs: request.waitMs ?? 0,
      });
      const finalUrl = await deps.client.check(out.url);
      if (finalUrl.origin !== checked.origin) await guard(finalUrl);
      if (out.status < 200 || out.status >= 300)
        return { kind: "http_error", url: out.url, status: out.status };
      return {
        kind: "page",
        url: finalUrl.toString(),
        status: out.status,
        content: extractContent(out.html, finalUrl.toString(), request),
        render: "browser",
        ...(request.followLinks
          ? { followLinks: extractLinks(out.html, finalUrl.toString()) }
          : {}),
      };
    }
    const res = await deps.client.get(request.url, {
      ...(request.headers ? { headers: request.headers } : {}),
      beforeHop: guard,
    });
    if (res.status < 200 || res.status >= 300)
      return { kind: "http_error", url: res.url, status: res.status };
    const type = typeOf(res.headers);
    const contentType = res.headers["content-type"];
    if (type && !isHtmlType(contentType) && !TEXTUAL(type))
      return { kind: "unsupported", url: res.url, contentType: type };
    const text = decodeBody(res.body, contentType);
    const html = isHtmlType(contentType);
    return {
      kind: "page",
      url: res.url,
      status: res.status,
      content: html
        ? extractContent(text, res.url, request)
        : plainContent(text, request.formats),
      render: "static",
      ...(request.followLinks
        ? { followLinks: html ? extractLinks(text, res.url) : [] }
        : {}),
    };
  } catch (error) {
    if (error instanceof RobotsBlocked)
      return { kind: "robots_blocked", url: error.blockedUrl };
    throw error;
  }
}
