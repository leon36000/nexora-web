import { CmsUnavailableError } from "./errors";

export type CmsClient = {
  /** GET sur l'API Directus ; renvoie le contenu de `data`. Lève `CmsUnavailableError` sur toute panne. */
  get(path: string, query?: Record<string, string>): Promise<unknown>;
};

export type CmsClientOptions = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Client Directus minimal, CÔTÉ SERVEUR seulement (le jeton ne quitte jamais le serveur).
 * Aucun cache HTTP ici : la mise en cache est faite par Next (`use cache`, étiquettes) en amont.
 * Les messages d'erreur ne contiennent ni le jeton, ni la requête, ni le corps de la réponse.
 */
export function createCmsClient(opts: CmsClientOptions): CmsClient {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 4_000;
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async get(path, query = {}) {
      if (!opts.token)
        throw new CmsUnavailableError(
          "jeton Directus absent de la configuration",
        );
      const url = new URL(base + path);
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
      let res: Response;
      try {
        res = await doFetch(url, {
          method: "GET",
          headers: {
            authorization: `Bearer ${opts.token}`,
            accept: "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const reason =
          e instanceof Error &&
          (e.name === "TimeoutError" || e.name === "AbortError")
            ? "délai dépassé"
            : "injoignable";
        throw new CmsUnavailableError(`Directus ${reason} (GET ${path})`);
      }
      if (!res.ok)
        throw new CmsUnavailableError(
          `Directus a répondu ${res.status} (GET ${path})`,
        );
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new CmsUnavailableError(
          `réponse Directus illisible (GET ${path})`,
        );
      }
      if (!json || typeof json !== "object" || !("data" in json))
        throw new CmsUnavailableError(
          `réponse Directus sans données (GET ${path})`,
        );
      return (json as { data: unknown }).data;
    },
  };
}
