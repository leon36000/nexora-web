/**
 * Client Directus RESTREINT des agents (D9). Il n'expose pas de méthode générique : chaque appel est comparé à une
 * liste fermée de (méthode, chemin, corps) AVANT d'être envoyé. Ce qui n'y figure pas est refusé par le code, quelle
 * que soit la permission du jeton :
 *
 *   lire     GET  /items/pages[/<uuid>], /items/pages_translations      (contenu des pages)
 *   écrire   POST /items/pages            seulement `status: "draft"` (coquille d'une nouvelle page)
 *            POST /versions               seulement collection `pages`
 *            POST /versions/<uuid>/save   le delta du brouillon
 *            POST /items/approvals        la demande d'approbation
 *
 * Jamais : DELETE, PATCH, PUT, `/versions/<uuid>/promote`, une autre collection, un autre utilisateur, `/users`,
 * `/permissions`, `/files`. Aucun agent ne publie, ne supprime ni ne modifie l'élément publié.
 */

export class ForbiddenDirectusRequest extends Error {
  constructor(method: string, path: string) {
    super(
      `requête Directus refusée par la garde des agents : ${method} ${path}`,
    );
    this.name = "ForbiddenDirectusRequest";
  }
}

export class DirectusRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "DirectusRequestError";
    this.status = status;
    this.code = code;
  }
}

const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const RE = {
  pagesList: /^\/items\/pages(?:_translations)?$/,
  pageOne: new RegExp(`^/items/pages/${UUID}$`, "i"),
  versions: /^\/versions$/,
  versionSave: new RegExp(`^/versions/${UUID}/save$`, "i"),
  approvals: /^\/items\/approvals$/,
};

type Body = Record<string, unknown> | undefined;

/** Vrai si (méthode, chemin, corps) figure dans la liste fermée. Exportée pour les tests. */
export function isAgentRequestAllowed(
  method: string,
  path: string,
  body?: Body,
): boolean {
  if (
    !path.startsWith("/") ||
    path.includes("..") ||
    path.toLowerCase().includes("%2f") ||
    path.includes("\\")
  )
    return false;
  const bare = path.split("?")[0] ?? "";
  if (method === "GET") return RE.pagesList.test(bare) || RE.pageOne.test(bare);
  if (method !== "POST") return false;
  // Coquille d'une NOUVELLE page, en brouillon uniquement.
  if (bare === "/items/pages") return body?.status === "draft";
  if (RE.pagesList.test(bare)) return false;
  if (RE.versions.test(bare)) return body?.collection === "pages";
  return RE.versionSave.test(bare) || RE.approvals.test(bare);
}

/** Lève ForbiddenDirectusRequest si la requête n'est pas dans la liste fermée. */
export function assertAgentRequestAllowed(
  method: string,
  path: string,
  body?: Body,
): void {
  if (!isAgentRequestAllowed(method, path, body))
    throw new ForbiddenDirectusRequest(method, path.split("?")[0] ?? path);
}

export interface AgentDirectus {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body: Record<string, unknown>): Promise<T>;
}

export function createAgentDirectus(options: {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): AgentDirectus {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  async function call<T>(method: "GET" | "POST", path: string, body?: Body) {
    assertAgentRequestAllowed(method, path, body);
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${options.token}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      });
    } catch {
      throw new DirectusRequestError(0, null, "Directus injoignable");
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non JSON */
    }
    if (!res.ok) {
      const first = (
        json as {
          errors?: { message?: string; extensions?: { code?: string } }[];
        } | null
      )?.errors?.[0];
      throw new DirectusRequestError(
        res.status,
        first?.extensions?.code ?? null,
        // Le message de Directus est repris (il ne contient pas le jeton) mais borné.
        `Directus ${res.status} ${first?.extensions?.code ?? ""} ${(first?.message ?? "").slice(0, 200)}`.trim(),
      );
    }
    return ((json as { data?: T } | null)?.data ?? (json as T)) as T;
  }
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
  };
}
