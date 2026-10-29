// Erreurs de l'API d'administration du catalogue, en français et sans jamais montrer le corps brut d'une réponse.
// Deux formes arrivent : celle de l'app ({ error, message?, issues? }) et celle du relais Directus
// ({ errors: [{ message, extensions: { code } }] }).

const CONFIG_HELP =
  "(variables NEXORA_APP_INTERNAL_URL et NEXORA_APP_ADMIN_TOKEN du conteneur Directus)";

const ERROR_TEXT: Record<string, string> = {
  CATALOGUE_NON_CONFIGURE: `Le service d’administration de l’app n’est pas configuré ${CONFIG_HELP}.`,
  CATALOGUE_INDISPONIBLE:
    "Le service d’administration de l’app est injoignable.",
  CATALOGUE_NON_AUTORISE: `L’app a refusé le jeton de service de Directus ${CONFIG_HELP}.`,
  CATALOGUE_ROUTE_INCONNUE: "Appel non pris en charge par le module.",
  CATALOGUE_REPONSE_INVALIDE: "Réponse invalide du service d’administration.",
  CATALOGUE_ERREUR: "Le service d’administration a répondu par une erreur.",
  CATALOGUE_CORPS_TROP_GRAND: "Les données envoyées sont trop volumineuses.",
  conflict: "Cet élément existe déjà (même code ou même identifiant public).",
  invalid_request: "Valeurs refusées.",
  invalid_transition: "Ce changement d’état n’est pas permis.",
  stale_version:
    "Le catalogue publié a changé depuis ce brouillon : créez-en un nouveau.",
  publication_refused: "Refusé par la garde de publication.",
  no_published_catalog: "Aucun catalogue publié à synchroniser.",
  litellm_unavailable: "LiteLLM a refusé ou n’a pas répondu.",
  litellm_not_configured: "LiteLLM n’est pas configuré dans l’app.",
  secret_unavailable: "Une clé de fournisseur est illisible dans le Coffre.",
  url_blocked: "Adresse refusée par la garde réseau.",
  secret_scope:
    "Cette référence du Coffre ne peut pas servir de clé de fournisseur.",
  secret_host:
    "La clé ne peut pas être envoyée à cet hôte. L’opérateur doit déclarer l’hôte dans NEXORA_SECRET_HOSTS_MODEL_PROVIDER (variable d’environnement du serveur, hors Directus).",
  fx_missing:
    "Aucun taux de change approuvé : approuvez un taux dans l’onglet « Taux de change ».",
  not_found: "Élément introuvable.",
  method_not_allowed: "Méthode non permise.",
  payload_too_large: "Les données envoyées sont trop volumineuses.",
  invalid_json: "Les données envoyées sont illisibles.",
  admin_not_configured: `L’administration de l’app n’est pas configurée ${CONFIG_HELP}.`,
  unauthorized: "L’app a refusé le jeton de service de Directus.",
  internal_error:
    "Erreur interne de l’app : réessayez, puis consultez les journaux.",
};

/** Codes dont le `message` du serveur est un texte français sûr, à joindre à la phrase. */
const WITH_SERVER_MESSAGE = new Set([
  "url_blocked",
  "secret_scope",
  "secret_host",
  "invalid_request",
  "invalid_transition",
  "fx_missing",
  "conflict",
]);

const FIELD_NAMES: [prefix: string, label: string][] = [
  ["code", "code"],
  ["name", "nom"],
  ["type", "type"],
  ["baseUrl", "adresse de base"],
  ["litellmBaseUrl", "adresse vue par LiteLLM"],
  ["secretRef", "référence du secret"],
  ["region", "région"],
  ["priority", "priorité"],
  ["publicId", "identifiant public"],
  ["providerId", "fournisseur"],
  ["upstreamId", "identifiant chez le fournisseur"],
  ["contextMax", "fenêtre de contexte"],
  ["maxOutputTokens", "sortie maximale"],
  ["sunsetAt", "date de retrait"],
  ["sheet.family", "famille"],
  ["sheet.releasedAt", "date de sortie"],
  ["sheet.knowledgeCutoff", "date de coupure des connaissances"],
  ["sheet.license", "licence"],
  ["sheet.parameters", "paramètres"],
  ["sheet.modalities", "modalités"],
  ["sheet", "fiche technique"],
  ["routing", "consignes de routage"],
  ["windows", "plages horaires"],
  ["upstreamInputUsdMicro", "coût amont d’entrée"],
  ["upstreamOutputUsdMicro", "coût amont de sortie"],
  ["sellInputCadMicro", "prix de vente d’entrée"],
  ["sellOutputCadMicro", "prix de vente de sortie"],
  ["usdToCadMicro", "taux de change"],
  ["order", "ordre des routes"],
];

export function fieldName(path: string): string {
  return (
    FIELD_NAMES.find(([p]) => path === p || path.startsWith(`${p}.`))?.[1] ??
    path
  );
}

export interface CatalogError {
  code: string;
  status: number | null;
  /** Phrase française complète, prête à afficher. */
  text: string;
  /** Problèmes de publication (garde), quand l'app en renvoie. */
  issues: Record<string, unknown>[];
}

type Body = {
  error?: unknown;
  message?: unknown;
  issues?: unknown;
  errors?: { message?: unknown; extensions?: { code?: unknown } }[];
};

export function parseApiError(e: unknown): CatalogError {
  const response = (e as { response?: { status?: number; data?: Body } } | null)
    ?.response;
  const data = response?.data;
  const code = String(data?.error ?? data?.errors?.[0]?.extensions?.code ?? "");
  const issuesRaw = Array.isArray(data?.issues)
    ? (data.issues as Record<string, unknown>[])
    : [];
  if (!code)
    return {
      code: "",
      status: response?.status ?? null,
      text: "Échec de l’opération.",
      issues: [],
    };
  const known = ERROR_TEXT[code];
  let text = known ?? `Échec de l’opération (${code}).`;
  const message = typeof data?.message === "string" ? data.message : "";
  if (message && WITH_SERVER_MESSAGE.has(code))
    text = `${text.replace(/\.$/, "")} : ${message}`.replace(/\.$/, ".");
  if (code === "secret_host" && message)
    text = `${message}. ${ERROR_TEXT.secret_host}`;
  if (code === "invalid_request" && !message && issuesRaw.length > 0) {
    const names = [
      ...new Set(issuesRaw.map((i) => fieldName(String(i.path ?? "")))),
    ].filter(Boolean);
    text = `Valeurs refusées : vérifiez ${names.join(", ")}.`;
  }
  return {
    code,
    status: response?.status ?? null,
    text,
    // Les problèmes de la garde ont un `code` ; ceux d'une validation de champs ont un `path`.
    issues: issuesRaw.filter(
      (i) => typeof i.code === "string" && i.path === undefined,
    ),
  };
}

export type CallResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: CatalogError };
export type Requester = (config: {
  method: string;
  url: string;
  data?: unknown;
}) => Promise<{ data: unknown }>;

/** Client du catalogue : tous les appels passent par le relais Directus `/nexora-catalog`. */
export function createCatalogClient(
  request: Requester,
  base = "/nexora-catalog",
) {
  async function call<T = any>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<CallResult<T>> {
    try {
      const res = await request({
        method,
        url: `${base}/${path}`,
        ...(body === undefined ? {} : { data: body }),
      });
      return { ok: true, data: res.data as T };
    } catch (e) {
      return { ok: false, error: parseApiError(e) };
    }
  }
  return { call };
}
export type CatalogCall = ReturnType<typeof createCatalogClient>["call"];
