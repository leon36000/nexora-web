import { SafeFetchError, type TrustedHttpClient } from "./http.ts";
import type { Renderer } from "./reader.ts";

/**
 * Client du service de navigateur (`WEBPILOT_BROWSER_URL`), isolé du réseau de l'application : rendu d'une page après
 * exécution de son JavaScript (`render: "browser"`). Protocole du service (services/webpilot-browser) :
 *   POST {url}/render  { "url", "wait_ms", "approve_hosts" }  ->  200 { "html", "status", "url" }
 *     422 redirect_blocked { host, url } : la page redirige vers un hôte non approuvé (le site l'évalue, puis relance)
 *     504 render_timeout, 502 render_failed, 400 url_not_allowed, 401 secret refusé
 * L'adresse est confiée au service seulement après la garde SSRF du site (voir `readPage`) ; le service refait sa
 * propre garde (il ne fait confiance à personne) et ne joint jamais le réseau interne. Le secret de service à service
 * ne sort que vers cet hôte approuvé.
 */
export function createHttpRenderer(
  client: Pick<TrustedHttpClient, "request">,
  baseUrl: string,
  secret: string,
): Renderer {
  return {
    async render(url, options) {
      const res = await client.request(
        "POST",
        new URL("/render", baseUrl).toString(),
        {
          json: {
            url,
            wait_ms: options.waitMs,
            approve_hosts: options.approveHosts,
          },
          headers: { authorization: `Bearer ${secret}` },
          maxBytes: 10_000_000,
        },
      );
      let json: {
        html?: unknown;
        status?: unknown;
        url?: unknown;
        error?: { code?: unknown; host?: unknown; url?: unknown };
      };
      try {
        json = JSON.parse(new TextDecoder().decode(res.body));
      } catch {
        throw new RenderError("réponse illisible du service de rendu");
      }
      if (res.status === 200) {
        if (typeof json.html !== "string" || typeof json.status !== "number")
          throw new RenderError("réponse inattendue du service de rendu");
        return {
          html: json.html,
          status: json.status,
          url: typeof json.url === "string" ? json.url : url,
        };
      }
      const code = json.error?.code;
      if (
        res.status === 422 &&
        code === "redirect_blocked" &&
        typeof json.error?.host === "string" &&
        typeof json.error?.url === "string"
      )
        throw new RenderBlockedHostError(json.error.host, json.error.url);
      if (res.status === 504)
        throw new SafeFetchError("target_timeout", "délai dépassé");
      if (res.status === 400 && code === "url_not_allowed")
        throw new SafeFetchError("url_not_allowed", "adresse refusée");
      // Jamais le corps de la réponse dans le message : le service ne doit rien divulguer.
      throw new RenderError("le rendu a échoué");
    },
  };
}

export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderError";
  }
}

/** Le rendu a été arrêté devant une redirection vers un hôte que l'appelant n'a pas encore évalué. */
export class RenderBlockedHostError extends Error {
  readonly host: string;
  readonly url: string;
  constructor(host: string, url: string) {
    super("redirection vers un hôte non approuvé");
    this.name = "RenderBlockedHostError";
    this.host = host;
    this.url = url;
  }
}
