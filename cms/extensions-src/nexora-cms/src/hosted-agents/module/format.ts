// Aides pures du module « Agents hébergés » : libellés français des états et des erreurs de l'API.

export const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "L’app a refusé le jeton de service.",
  invalid_request: "Valeur refusée : vérifiez les champs.",
  invalid_json: "Corps de requête invalide.",
  not_found: "Élément introuvable.",
  conflict: "Cet identifiant (code, slug ou agent amont) est déjà utilisé.",
  invalid_transition: "Ce changement d’état n’est pas permis.",
  publication_refused: "Publication refusée : l’agent est incomplet.",
  method_not_allowed: "Méthode non permise.",
  payload_too_large: "Corps trop volumineux.",
  internal_error: "Erreur interne de l’app.",
  HOSTED_AGENTS_NON_CONFIGURE:
    "Le service d’administration de l’app n’est pas configuré (NEXORA_APP_INTERNAL_URL et NEXORA_APP_ADMIN_TOKEN).",
  HOSTED_AGENTS_INDISPONIBLE: "Le service d’administration de l’app est injoignable.",
  HOSTED_AGENTS_NON_AUTORISE: "L’app a refusé le jeton de service de Directus.",
  HOSTED_AGENTS_ROUTE_INCONNUE: "Appel non pris en charge.",
  HOSTED_AGENTS_ERREUR: "Le service d’administration a répondu par une erreur.",
  HOSTED_AGENTS_REPONSE_INVALIDE: "Réponse invalide du service d’administration.",
};

export const ISSUE_LABELS: Record<string, string> = {
  name_fr_missing: "nom français manquant",
  name_en_missing: "nom anglais manquant",
  description_fr_missing: "description française manquante",
  description_en_missing: "description anglaise manquante",
  price_missing: "aucun prix en vigueur",
  instance_unavailable: "instance désactivée ou sans clé dans le Coffre",
};

export const STATUS_LABELS: Record<string, { label: string; icon: string }> = {
  draft: { label: "Brouillon", icon: "edit_note" },
  published: { label: "Publié", icon: "check_circle" },
  retired: { label: "Retiré", icon: "block" },
};

export const HEALTH_LABELS: Record<string, { label: string; icon: string }> = {
  unknown: { label: "Non testée", icon: "help" },
  ok: { label: "Connexion réussie", icon: "check_circle" },
  error: { label: "Connexion en échec", icon: "error" },
};

export const CATEGORY_ITEMS = [
  { text: "Général", value: "general" },
  { text: "Soutien à la clientèle", value: "support" },
  { text: "Documents", value: "documents" },
  { text: "Ventes", value: "ventes" },
  { text: "Finances", value: "finance" },
  { text: "Ressources humaines", value: "ressources_humaines" },
  { text: "Autre", value: "autre" },
];
export const VISIBILITY_ITEMS = [
  { text: "Public (listé sur /agents)", value: "public" },
  { text: "Non listé (appelable, absent du catalogue)", value: "unlisted" },
  { text: "Privé (clé avec liste explicite)", value: "private" },
];
export const REGION_ITEMS = [
  { text: "Québec", value: "quebec" },
  { text: "Canada", value: "canada" },
  { text: "États-Unis", value: "etats_unis" },
  { text: "Europe", value: "europe" },
  { text: "Autre", value: "autre" },
];

/** Message d'erreur pour un code (relais Directus ou app), avec le détail des motifs de refus de publication. */
export function errorMessage(
  code: string,
  issues?: ReadonlyArray<{ code?: string; field?: string }>,
): string {
  const base = ERROR_MESSAGES[code] ?? "Échec de l’opération.";
  const detail = (issues ?? [])
    .map((i) => ISSUE_LABELS[i.code ?? ""] ?? i.field ?? i.code)
    .filter(Boolean)
    .join(", ");
  const unknown = code && !ERROR_MESSAGES[code] ? ` (${code})` : "";
  return `${base}${detail ? ` Manque : ${detail}.` : ""}${unknown}`;
}

/** Pages de la bulle, une par ligne, vers une liste (lignes vides ignorées). */
export const linesToList = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
