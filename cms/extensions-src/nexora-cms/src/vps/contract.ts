// Contrat du module « VPS » (D14) avec l'API d'administration de l'app : ${NEXORA_APP_INTERNAL_URL}/api/admin/vps/*.
// Cette extension ne conserve RIEN : elle relaie une liste fermée d'appels (méthode + chemin) avec le jeton
// d'administration de l'app (NEXORA_APP_ADMIN_TOKEN, variable du conteneur Directus), et rend la réponse telle quelle.
// Le jeton ne quitte jamais le serveur Directus : le navigateur n'appelle que l'endpoint /nexora-vps.

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_ONLY = new RegExp(`^${UUID}$`);

/**
 * Liste fermée des appels relayés. Tout le reste est refusé (404), y compris le coffre, les autres routes
 * d'administration et toute méthode non listée (DELETE, PUT…). Chaque expression est ancrée (`^…$`) et ne
 * connaît que `[a-z-]` et des UUID : ni `..`, ni `%`, ni `?`, ni `#`, ni `\`, ni `//` ne peuvent la satisfaire.
 */
const ALLOWED: ReadonlyArray<readonly [string, RegExp]> = [
  ["GET", /^$/],
  ["GET", /^(servers|plans|apps|versions|orders|instances|events)$/],
  ["POST", /^(servers|plans|apps|versions)$/],
  ["GET", new RegExp(`^(servers|plans|apps|versions)/${UUID}$`)],
  ["PATCH", new RegExp(`^(servers|plans|apps)/${UUID}$`)],
  ["POST", new RegExp(`^servers/${UUID}/test$`)],
  ["GET", new RegExp(`^servers/${UUID}/templates$`)],
  ["POST", new RegExp(`^servers/${UUID}/templates$`)],
  ["PATCH", new RegExp(`^templates/${UUID}$`)],
  ["POST", new RegExp(`^versions/${UUID}/(approve|publish)$`)],
  ["POST", /^stripe\/publish$/],
];

/** Paramètres de requête permis, par chemin (GET seulement). Tout autre paramètre est refusé. */
const ALLOWED_QUERY: Readonly<Record<string, readonly string[]>> = {
  events: ["instanceId"],
};

/** Retire UNE barre oblique au début et UNE à la fin : `//servers` reste invalide (jamais « réparé »). */
export function normalizePath(raw: string): string {
  return raw.replace(/^\//, "").replace(/\/$/, "");
}

export function isAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return ALLOWED.some(([am, re]) => am === m && re.test(path));
}

/**
 * Paramètres de requête valides pour ce chemin, ou `null` s'il y en a un d'inconnu, de répété ou de
 * mal formé. Une valeur vide est ignorée. `instanceId` doit être un UUID.
 */
export function sanitizeQuery(
  path: string,
  query: unknown,
): URLSearchParams | null {
  const out = new URLSearchParams();
  if (query === undefined || query === null) return out;
  if (typeof query !== "object" || Array.isArray(query)) return null;
  const allowed = ALLOWED_QUERY[path] ?? [];
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (!allowed.includes(key)) return null;
    if (value === "" || value === undefined) continue;
    if (typeof value !== "string" || !UUID_ONLY.test(value)) return null;
    out.set(key, value);
  }
  return out;
}

export type Relayed = { status: number; body: unknown };

const err = (status: number, code: string, message: string): Relayed => ({
  status,
  body: { errors: [{ message, extensions: { code } }] },
});

// L'app accepte jusqu'à 400 000 caractères (script d'installation de 200 000 + guides) : même plafond ici.
const MAX_BODY_CHARS = 400_000;

export async function relayToVps(
  input: { method: string; path: string; query?: unknown; body?: unknown },
  deps: {
    env: Record<string, unknown>;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<Relayed> {
  const method = input.method.toUpperCase();
  const path = normalizePath(input.path);
  if (!isAllowed(method, path))
    return err(404, "VPS_ROUTE_INCONNUE", "Appel non pris en charge.");
  const query = sanitizeQuery(path, input.query);
  if (!query)
    return err(400, "VPS_REQUETE_INVALIDE", "Paramètre de requête refusé.");
  const base = String(deps.env.NEXORA_APP_INTERNAL_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const token = String(deps.env.NEXORA_APP_ADMIN_TOKEN ?? "");
  if (!base || !token)
    return err(
      503,
      "VPS_NON_CONFIGURE",
      "Le service d’administration de l’app n’est pas configuré.",
    );
  let payload: string | undefined;
  if (method !== "GET" && input.body !== undefined) {
    payload = JSON.stringify(input.body);
    if (payload.length > MAX_BODY_CHARS)
      return err(413, "VPS_CORPS_TROP_GRAND", "Corps trop volumineux.");
  }
  const search = query.toString();
  let res: Response;
  try {
    res = await (deps.fetchFn ?? fetch)(
      `${base}/api/admin/vps${path ? `/${path}` : ""}${search ? `?${search}` : ""}`,
      {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: payload,
        // jamais de redirection : le jeton ne doit aller qu'à l'app
        redirect: "manual",
        // un test de connexion Proxmox ou « Publier vers Stripe » peut durer : délai généreux
        signal: AbortSignal.timeout(deps.timeoutMs ?? 60_000),
      },
    );
  } catch {
    return err(
      502,
      "VPS_INDISPONIBLE",
      "Le service d’administration de l’app est injoignable.",
    );
  }
  if (res.status === 401)
    return err(
      502,
      "VPS_NON_AUTORISE",
      "L’app a refusé le jeton de service de Directus (NEXORA_APP_ADMIN_TOKEN).",
    );
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return err(
      502,
      "VPS_REPONSE_INVALIDE",
      "Réponse invalide du service d’administration.",
    );
  }
  if (res.status >= 500 && res.status !== 503)
    return err(
      502,
      "VPS_ERREUR",
      "Le service d’administration a répondu par une erreur.",
    );
  return { status: res.status, body: json };
}
