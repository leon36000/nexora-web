// Relais générique des modules « Agents du site » et « SEO » (D14) vers l'API d'administration de l'app :
// ${NEXORA_APP_INTERNAL_URL}/api/admin/<site-agents|seo>/*. Comme le Coffre et les Modèles, cette extension ne
// conserve RIEN : elle relaie une liste fermée d'appels (méthode + chemin + paramètres de requête permis) avec le
// jeton d'administration de l'app (NEXORA_APP_ADMIN_TOKEN, variable du conteneur Directus) et rend la réponse telle quelle.

export const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

export type RelayConfig = {
  /** Préfixe des codes d'erreur renvoyés au module (ex. AGENTS). */
  codePrefix: string;
  /** Chemin de l'API de l'app, sans barre finale (ex. /api/admin/site-agents). */
  apiPath: string;
  allowed: ReadonlyArray<readonly [string, RegExp]>;
  /** Paramètres de requête transmis (tous les autres sont ignorés). */
  queryKeys: readonly string[];
};

export type Relayed = { status: number; body: unknown };

export function normalizePath(raw: string): string {
  return raw.replace(/^\/+|\/+$/g, "");
}

export function isAllowed(
  config: RelayConfig,
  method: string,
  path: string,
): boolean {
  const m = method.toUpperCase();
  return config.allowed.some(([am, re]) => am === m && re.test(path));
}

const QUERY_VALUE = /^[A-Za-z0-9_-]{1,40}$/;

export function buildQuery(
  config: RelayConfig,
  query: Record<string, unknown> | undefined,
): string {
  const params = new URLSearchParams();
  for (const key of config.queryKeys) {
    const v = query?.[key];
    if (typeof v === "string" && QUERY_VALUE.test(v)) params.set(key, v);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

const err = (status: number, code: string, message: string): Relayed => ({
  status,
  body: { errors: [{ message, extensions: { code } }] },
});

const MAX_BODY_CHARS = 65_536;

export async function relay(
  config: RelayConfig,
  input: {
    method: string;
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
  },
  deps: {
    env: Record<string, unknown>;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<Relayed> {
  const p = config.codePrefix;
  const path = normalizePath(input.path);
  if (!isAllowed(config, input.method, path))
    return err(404, `${p}_ROUTE_INCONNUE`, "Appel non pris en charge.");
  const base = String(deps.env.NEXORA_APP_INTERNAL_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const token = String(deps.env.NEXORA_APP_ADMIN_TOKEN ?? "");
  if (!base || !token)
    return err(
      503,
      `${p}_NON_CONFIGURE`,
      "Le service d’administration de l’app n’est pas configuré.",
    );
  let payload: string | undefined;
  if (input.method.toUpperCase() !== "GET" && input.body !== undefined) {
    payload = JSON.stringify(input.body);
    if (payload.length > MAX_BODY_CHARS)
      return err(413, `${p}_CORPS_TROP_GRAND`, "Corps trop volumineux.");
  }
  const query =
    input.method.toUpperCase() === "GET" ? buildQuery(config, input.query) : "";
  let res: Response;
  try {
    res = await (deps.fetchFn ?? fetch)(
      `${base}${config.apiPath}${path ? `/${path}` : ""}${query}`,
      {
        method: input.method.toUpperCase(),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: payload,
        signal: AbortSignal.timeout(deps.timeoutMs ?? 30_000),
      },
    );
  } catch {
    return err(
      502,
      `${p}_INDISPONIBLE`,
      "Le service d’administration de l’app est injoignable.",
    );
  }
  if (res.status === 401)
    return err(
      502,
      `${p}_NON_AUTORISE`,
      "L’app a refusé le jeton de service de Directus (NEXORA_APP_ADMIN_TOKEN).",
    );
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return err(
      502,
      `${p}_REPONSE_INVALIDE`,
      "Réponse invalide du service d’administration.",
    );
  }
  if (res.status >= 500 && res.status !== 503)
    return err(
      502,
      `${p}_ERREUR`,
      "Le service d’administration a répondu par une erreur.",
    );
  return { status: res.status, body: json };
}

type EndpointRequest = {
  accountability?: { user?: string | null; admin?: boolean } | null;
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
};
type EndpointResponse = {
  set: (field: string, value: string) => unknown;
  status: (code: number) => { json: (body: unknown) => unknown };
};

/** Gestionnaire d'endpoint Directus : administrateurs seulement, journal « méthode chemin : statut » seulement. */
export function createRelayHandler(
  id: string,
  config: RelayConfig,
  env: Record<string, unknown>,
  logger: { info: (message: string) => void },
) {
  const deny = (
    res: EndpointResponse,
    status: number,
    code: string,
    message: string,
  ) => res.status(status).json({ errors: [{ message, extensions: { code } }] });
  return async (req: EndpointRequest, res: EndpointResponse) => {
    res.set("Cache-Control", "no-store");
    const acct = req.accountability;
    if (!acct?.user)
      return deny(res, 401, "INVALID_CREDENTIALS", "Authentification requise.");
    if (acct.admin !== true)
      return deny(res, 403, "FORBIDDEN", "Réservé aux administrateurs.");
    const path = normalizePath(req.path);
    const relayed = await relay(
      config,
      { method: req.method, path, query: req.query, body: req.body },
      { env },
    );
    logger.info(`[${id}] ${req.method} /${path} : ${relayed.status}`);
    return res.status(relayed.status).json(relayed.body);
  };
}
