import type { SafeHttpClient } from "./http.ts";
import type { Renderer } from "./reader.ts";

/**
 * Client du service de rendu par navigateur (`WEBPILOT_RENDERER_URL`), isolé du réseau de l'application. Protocole
 * PROVISOIRE, à confirmer avec le service retenu (décision O-7) :
 *   POST {url}/render  { "url": "...", "wait_ms": 0 }  ->  200 { "html": "...", "status": 200, "url": "adresse finale" }
 * Le service navigue lui-même : l'adresse lui est confiée seulement après la garde SSRF (voir `readPage`), et il doit
 * tourner dans un réseau sans accès à l'intranet de Nexora AI.
 */
export function createHttpRenderer(
  client: Pick<SafeHttpClient, "post">,
  baseUrl: string,
): Renderer {
  return {
    async render(url, options) {
      const res = await client.post(
        new URL("/render", baseUrl).toString(),
        { url, wait_ms: options.waitMs },
        { maxBytes: 10_000_000 },
      );
      if (res.status !== 200) throw new RenderError("le rendu a échoué");
      let json: { html?: unknown; status?: unknown; url?: unknown };
      try {
        json = JSON.parse(new TextDecoder().decode(res.body));
      } catch {
        throw new RenderError("réponse illisible du service de rendu");
      }
      if (typeof json.html !== "string" || typeof json.status !== "number")
        throw new RenderError("réponse inattendue du service de rendu");
      return {
        html: json.html,
        status: json.status,
        url: typeof json.url === "string" ? json.url : url,
      };
    },
  };
}

export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderError";
  }
}
