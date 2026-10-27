// Aides pures des modules « Agents du site » et « SEO » : montants (micro-CAD <-> dollars, sans nombre à virgule
// flottante), dates, libellés français des états.

const DECIMAL = /^(\d{1,12})(?:[.,](\d{1,6}))?$/;

/** « 0,5 » ou « 12.25 » -> "500000" (micro-CAD) ; null si invalide. */
export function dollarsToMicro(input: string): string | null {
  const m = DECIMAL.exec(input.trim());
  if (!m) return null;
  return (
    BigInt(m[1] as string) * 1_000_000n +
    BigInt((m[2] ?? "").padEnd(6, "0") || "0")
  ).toString();
}

/** "1234500" -> « 1,2345 $ » : au plus 4 décimales (arrondi à l'inférieur), zéros finaux retirés. */
export function microToCad(
  micro: string | number | bigint | null | undefined,
): string {
  if (micro === null || micro === undefined || micro === "") return "—";
  const v = BigInt(micro);
  const whole = v / 1_000_000n;
  const frac4 = ((v % 1_000_000n) / 100n).toString().padStart(4, "0");
  const frac = frac4.replace(/0+$/, "");
  return `${frac ? `${whole},${frac}` : whole} $`;
}

/** Champ de saisie (sans symbole) : "500000" -> « 0,5 ». */
export function microToInput(
  micro: string | number | bigint | null | undefined,
): string {
  if (micro === null || micro === undefined || micro === "") return "";
  return microToCad(micro).replace(/ \$$/, "");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
}

export type StateView = { label: string; icon: string };

export const AGENT_STATE: Record<string, StateView> = {
  idle: { label: "Prêt", icon: "check_circle" },
  running: { label: "En cours", icon: "sync" },
  error: { label: "En erreur", icon: "error" },
  budget_exceeded: { label: "Budget épuisé", icon: "savings" },
  disabled: { label: "Désactivé", icon: "block" },
};
export const RUN_STATUS: Record<string, StateView> = {
  queued: { label: "En attente", icon: "schedule" },
  running: { label: "En cours", icon: "sync" },
  succeeded: { label: "Réussie", icon: "check_circle" },
  failed: { label: "Échec", icon: "error" },
  stopped: { label: "Arrêtée", icon: "stop_circle" },
  budget_exceeded: { label: "Budget épuisé", icon: "savings" },
};
export const ADAPTER_STATE: Record<string, StateView> = {
  not_connected: { label: "Non connecté", icon: "link_off" },
  read: { label: "Connecté en lecture", icon: "visibility" },
  write: { label: "Autorisé en écriture", icon: "edit" },
};
export const SEVERITY: Record<string, StateView> = {
  error: { label: "Erreur", icon: "error" },
  warning: { label: "Avertissement", icon: "warning" },
  info: { label: "Information", icon: "info" },
};
export const AUDIT_KIND: Record<string, string> = {
  all: "Tous les volets",
  structure: "Structure SEO",
  links: "Liens",
  a11y: "Accessibilité",
  perf: "Performance",
};
export const AUDIT_STATUS: Record<string, StateView> = {
  queued: { label: "En attente", icon: "schedule" },
  running: { label: "En cours", icon: "sync" },
  succeeded: { label: "Terminé", icon: "check_circle" },
  failed: { label: "Échec", icon: "error" },
};
export const INDEXING_STATUS: Record<string, StateView> = {
  dry_run: { label: "Simulation", icon: "science" },
  submitted: { label: "Soumise", icon: "send" },
  failed: { label: "Échec", icon: "error" },
  skipped: { label: "Non envoyée", icon: "pause_circle" },
};

/** Messages français des codes d'erreur de l'app et du relais. */
export const ERROR_MESSAGES: Record<string, string> = {
  AGENTS_NON_CONFIGURE:
    "Le service d’administration de l’app n’est pas configuré (NEXORA_APP_INTERNAL_URL / NEXORA_APP_ADMIN_TOKEN).",
  SEO_NON_CONFIGURE:
    "Le service d’administration de l’app n’est pas configuré (NEXORA_APP_INTERNAL_URL / NEXORA_APP_ADMIN_TOKEN).",
  AGENTS_INDISPONIBLE: "Le service d’administration de l’app est injoignable.",
  SEO_INDISPONIBLE: "Le service d’administration de l’app est injoignable.",
  AGENTS_NON_AUTORISE: "L’app a refusé le jeton de service de Directus.",
  SEO_NON_AUTORISE: "L’app a refusé le jeton de service de Directus.",
  gateway_key_missing: "Générez d’abord la clé de la passerelle de cet agent.",
  budget_zero:
    "Fixez un budget mensuel supérieur à 0 $ avant d’activer cet agent.",
  directus_token_missing:
    "Le jeton Directus de l’agent est absent du Coffre : collez-le dans le module Coffre sous la référence indiquée.",
  model_missing: "Choisissez un modèle pour cet agent.",
  model_unknown: "Ce modèle n’est pas publié dans le catalogue.",
  agent_disabled: "L’agent est désactivé : activez-le avant de le lancer.",
  budget_exceeded: "Le budget mensuel de l’agent est dépensé.",
  agent_without_llm: "Cet agent n’utilise aucun modèle.",
  vault_not_configured:
    "Le Coffre n’est pas configuré dans l’app (clé maîtresse absente).",
  invalid_request: "Valeurs refusées : vérifiez les champs.",
  idempotency_conflict:
    "Cette clé d’allocation a déjà servi avec un autre montant.",
  adapter_not_ready:
    "L’écriture ne peut être autorisée qu’après une vérification réussie de la connexion (état « Connecté en lecture »).",
  invalid_transition: "Ce changement d’état n’est pas permis.",
  not_found: "Élément introuvable.",
};
