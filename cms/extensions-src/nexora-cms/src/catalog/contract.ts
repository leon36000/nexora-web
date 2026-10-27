// Contrat du module « Modèles » (D14) avec l'API d'administration de l'app : ${NEXORA_APP_INTERNAL_URL}/api/admin/catalog/*.
// Cette extension ne conserve RIEN : elle relaie une liste fermée d'appels (méthode + chemin) avec le jeton
// d'administration de l'app (NEXORA_APP_ADMIN_TOKEN, variable du conteneur Directus), et rend la réponse telle quelle.

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** Liste fermée des appels relayés. Tout le reste est refusé (404), y compris le coffre et les autres routes d'administration. */
const ALLOWED: ReadonlyArray<readonly [string, RegExp]> = [
  ["GET", /^$/],
  ["GET", /^(providers|models|fx-rates|versions)$/],
  ["POST", /^(providers|models|fx-rates|versions)$/],
  ["GET", new RegExp(`^(providers|models|versions)/${UUID}$`)],
  ["PATCH", new RegExp(`^(providers|models)/${UUID}$`)],
  ["POST", new RegExp(`^providers/${UUID}/test$`)],
  ["GET", new RegExp(`^models/${UUID}/prices$`)],
  ["POST", new RegExp(`^models/${UUID}/prices$`)],
  ["POST", new RegExp(`^fx-rates/${UUID}/approve$`)],
  ["POST", new RegExp(`^versions/${UUID}/(approve|publish)$`)],
  ["POST", /^sync-litellm$/],
];

export function normalizePath(raw: string): string {
  return raw.replace(/^\/+|\/+$/g, "");
}

export function isAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return ALLOWED.some(([am, re]) => am === m && re.test(path));
}

export type Relayed = { status: number; body: unknown };

const err = (status: number, code: string, message: string): Relayed => ({
  status,
  body: { errors: [{ message, extensions: { code } }] },
});

const MAX_BODY_CHARS = 65_536;

export async function relayToCatalog(
  input: { method: string; path: string; body?: unknown },
  deps: {
    env: Record<string, unknown>;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<Relayed> {
  const path = normalizePath(input.path);
  if (!isAllowed(input.method, path))
    return err(404, "CATALOGUE_ROUTE_INCONNUE", "Appel non pris en charge.");
  const base = String(deps.env.NEXORA_APP_INTERNAL_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const token = String(deps.env.NEXORA_APP_ADMIN_TOKEN ?? "");
  if (!base || !token)
    return err(
      503,
      "CATALOGUE_NON_CONFIGURE",
      "Le service d’administration de l’app n’est pas configuré.",
    );
  let payload: string | undefined;
  if (input.method !== "GET" && input.body !== undefined) {
    payload = JSON.stringify(input.body);
    if (payload.length > MAX_BODY_CHARS)
      return err(413, "CATALOGUE_CORPS_TROP_GRAND", "Corps trop volumineux.");
  }
  let res: Response;
  try {
    res = await (deps.fetchFn ?? fetch)(
      `${base}/api/admin/catalog${path ? `/${path}` : ""}`,
      {
        method: input.method.toUpperCase(),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: payload,
        // la synchronisation LiteLLM peut durer : délai généreux
        signal: AbortSignal.timeout(deps.timeoutMs ?? 60_000),
      },
    );
  } catch {
    return err(
      502,
      "CATALOGUE_INDISPONIBLE",
      "Le service d’administration de l’app est injoignable.",
    );
  }
  if (res.status === 401)
    return err(
      502,
      "CATALOGUE_NON_AUTORISE",
      "L’app a refusé le jeton de service de Directus (NEXORA_APP_ADMIN_TOKEN).",
    );
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return err(
      502,
      "CATALOGUE_REPONSE_INVALIDE",
      "Réponse invalide du service d’administration.",
    );
  }
  if (res.status >= 500 && res.status !== 503)
    return err(
      502,
      "CATALOGUE_ERREUR",
      "Le service d’administration a répondu par une erreur.",
    );
  return { status: res.status, body: json };
}
