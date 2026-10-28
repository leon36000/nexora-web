import type { PublicVpsApp, PublicVpsPlan } from "@nexora/vps";
import type { Lang } from "@/i18n/config";

/**
 * Règles pures des pages VPS : état du catalogue, prix, plans compatibles, sélection du configurateur,
 * validation de la clé SSH, correspondance des erreurs de l'API. Aucune dépendance au navigateur ni au
 * serveur (importé par le configurateur client et par les pages) : tout est testé sans rendu.
 * Seuls des types sont importés de `@nexora/vps` (effacés à la compilation).
 */

export type Term = "month" | "year";
export type CatalogState = "unavailable" | "empty" | "ready";

const locale = (lang: Lang) => (lang === "fr" ? "fr-CA" : "en-CA");

// ─── État du catalogue ──────────────────────────────────────────────────────────

/**
 * Quel message afficher : « indisponible » si la base ne répond pas (même si la liste est vide), « en
 * préparation » si aucun plan n'est publié (aucun prix n'est alors affiché), sinon les plans.
 */
export function catalogState(catalog: {
  available: boolean;
  plans: readonly unknown[];
}): CatalogState {
  if (!catalog.available) return "unavailable";
  return catalog.plans.length === 0 ? "empty" : "ready";
}

// ─── Formats ────────────────────────────────────────────────────────────────────

/** Cents entiers -> dollars canadiens : « 15,00 $ » en fr-CA, « $15.00 » en en-CA. */
export function formatCents(lang: Lang, cents: number): string {
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

/** Même montant, en chaîne décimale à deux chiffres (« 15.00 ») pour les données structurées. */
export function decimalCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Équivalent mensuel d'un prix annuel (arrondi au cent le plus proche). */
export function monthlyEquivalentCents(yearlyCents: number): number {
  return Math.round(yearlyCents / 12);
}

export function formatInt(lang: Lang, n: number): string {
  return new Intl.NumberFormat(locale(lang)).format(n);
}

/** Mémoire en Go quand elle tombe juste (4096 -> « 4 Go »), sinon en Mo. */
export function formatMemory(
  lang: Lang,
  mb: number,
  units: { gb: string; mb: string },
): string {
  return mb % 1024 === 0
    ? `${formatInt(lang, mb / 1024)} ${units.gb}`
    : `${formatInt(lang, mb)} ${units.mb}`;
}

export function formatGb(lang: Lang, gb: number, unit: string): string {
  return `${formatInt(lang, gb)} ${unit}`;
}

// ─── Plans ──────────────────────────────────────────────────────────────────────

type PlanPrices = Pick<PublicVpsPlan, "priceMonthlyCents" | "priceYearlyCents">;

/** Prix d'une durée en cents, ou null quand la durée n'est pas offerte. */
export function termPriceCents(plan: PlanPrices, term: Term): number | null {
  const cents =
    term === "month" ? plan.priceMonthlyCents : plan.priceYearlyCents;
  return cents === null || cents <= 0 ? null : cents;
}

export function offeredTerms(plan: PlanPrices): Term[] {
  return (["month", "year"] as const).filter(
    (t) => termPriceCents(plan, t) !== null,
  );
}

/** Un plan peut être présenté avec un prix et décrit en données structurées : publié, réel et tarifé. */
export function isSellablePlan(
  plan: PlanPrices & Pick<PublicVpsPlan, "isDevSample">,
): boolean {
  return !plan.isDevSample && offeredTerms(plan).length > 0;
}

/** Ordre d'affichage : champ `sort`, puis mémoire, puis code (stable et reproductible). */
export function sortPlans<
  T extends Pick<PublicVpsPlan, "sort" | "ramMb" | "code">,
>(plans: readonly T[]): T[] {
  return [...plans].sort(
    (a, b) =>
      a.sort - b.sort || a.ramMb - b.ramMb || a.code.localeCompare(b.code),
  );
}

export function sortApps<T extends Pick<PublicVpsApp, "sort" | "code">>(
  apps: readonly T[],
): T[] {
  return [...apps].sort(
    (a, b) => a.sort - b.sort || a.code.localeCompare(b.code),
  );
}

export function planFitsApp(
  plan: Pick<PublicVpsPlan, "ramMb">,
  app: Pick<PublicVpsApp, "minRamMb">,
): boolean {
  return plan.ramMb >= app.minRamMb;
}

/** Plans dont la mémoire atteint le minimum de l'application, dans l'ordre d'affichage. */
export function compatiblePlans<
  T extends Pick<PublicVpsPlan, "sort" | "ramMb" | "code">,
>(plans: readonly T[], app: Pick<PublicVpsApp, "minRamMb">): T[] {
  return sortPlans(plans).filter((p) => planFitsApp(p, app));
}

// ─── Sélection du configurateur ─────────────────────────────────────────────────

export interface Selection {
  plan: string;
  app: string;
  term: Term;
}

type SelPlan = Pick<
  PublicVpsPlan,
  | "code"
  | "ramMb"
  | "sort"
  | "highlighted"
  | "priceMonthlyCents"
  | "priceYearlyCents"
>;
type SelApp = Pick<PublicVpsApp, "code" | "kind" | "minRamMb" | "sort">;

/**
 * Sélection valide à partir de valeurs brutes (adresse de la page ou changement de l'internaute).
 * - application : seules les `installable` se commandent (l'API l'exige) ; à défaut, la première qui
 *   convient au plan demandé, sinon la première ;
 * - plan : celui demandé s'il atteint la mémoire minimale de l'application, sinon le plan mis en avant
 *   compatible, sinon le premier compatible ;
 * - durée : celle demandée si le plan l'offre, sinon l'autre ; mensuelle par défaut.
 * Une valeur inconnue ou hors catalogue ne produit jamais d'état invalide : elle est remplacée.
 */
export function resolveSelection(
  input: { plan?: string; app?: string; term?: string },
  plans: readonly SelPlan[],
  apps: readonly SelApp[],
): Selection {
  const orderable = sortApps(apps.filter((a) => a.kind === "installable"));
  const sortedPlans = sortPlans(plans);
  const requestedPlan = sortedPlans.find((p) => p.code === input.plan);
  const app =
    orderable.find((a) => a.code === input.app) ??
    (requestedPlan
      ? orderable.find((a) => planFitsApp(requestedPlan, a))
      : undefined) ??
    orderable[0];
  const candidates = app
    ? sortedPlans.filter((p) => planFitsApp(p, app))
    : sortedPlans;
  const plan =
    (requestedPlan && candidates.includes(requestedPlan)
      ? requestedPlan
      : undefined) ??
    candidates.find((p) => p.highlighted) ??
    candidates[0];
  const wanted: Term = input.term === "year" ? "year" : "month";
  const offered = plan ? offeredTerms(plan) : [];
  const term = offered.includes(wanted) ? wanted : (offered[0] ?? wanted);
  return { plan: plan?.code ?? "", app: app?.code ?? "", term };
}

/** Paramètres d'adresse `plan`, `app`, `term` d'une sélection (valeurs vides omises). */
export function selectionQuery(sel: Selection): string {
  const q = new URLSearchParams();
  if (sel.plan) q.set("plan", sel.plan);
  if (sel.app) q.set("app", sel.app);
  q.set("term", sel.term);
  return q.toString();
}

// ─── Clé SSH et nom du serveur ──────────────────────────────────────────────────

export type KeyProblem = "empty" | "private_key" | "multiple_lines";

/**
 * Contrôle minimal avant l'envoi : une clé privée ne quitte JAMAIS le navigateur. Le serveur valide le
 * reste (type, longueur RSA, empreinte).
 */
export function checkSshKeyInput(raw: string): KeyProblem | null {
  const text = raw.trim();
  if (!text) return "empty";
  if (/PRIVATE KEY|PuTTY-User-Key-File|Private-Lines:/i.test(text))
    return "private_key";
  if (/[\r\n]/.test(text)) return "multiple_lines";
  return null;
}

/** Même règle que le serveur : minuscules, chiffres, tirets au milieu, 32 caractères au plus. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;
export function isValidHostname(value: string): boolean {
  return value === "" || HOSTNAME.test(value);
}

// ─── Commande ───────────────────────────────────────────────────────────────────

export interface CheckoutBody {
  plan: string;
  app: string;
  term: Term;
  sshKey: string;
  hostname?: string;
  promo?: string;
  requestId: string;
  lang: Lang;
}

export function buildCheckoutBody(input: {
  selection: Selection;
  sshKey: string;
  hostname: string;
  promo?: string;
  requestId: string;
  lang: Lang;
}): CheckoutBody {
  const hostname = input.hostname.trim();
  const promo = input.promo?.trim();
  return {
    plan: input.selection.plan,
    app: input.selection.app,
    term: input.selection.term,
    sshKey: input.sshKey.trim(),
    ...(hostname ? { hostname } : {}),
    ...(promo ? { promo } : {}),
    requestId: input.requestId,
    lang: input.lang,
  };
}

/** Motifs de refus d'un code promo (voir `PROMO_MESSAGE_KEYS` côté serveur). */
export const PROMO_ERROR_KEYS = [
  "promo_unknown",
  "promo_expired",
  "promo_exhausted",
  "promo_wrong_scope",
  "promo_staff_only",
  "promo_first_order_only",
  "promo_already_used",
  "promo_min_amount",
  "promo_not_ready",
  "promo_covers_all",
  "promo_account_restricted",
] as const;
export type PromoErrorKey = (typeof PROMO_ERROR_KEYS)[number];

export type OrderErrorKey =
  | "unauthenticated"
  | "forbidden"
  | "invalid_ssh_key"
  | "invalid_hostname"
  | "plan_too_small"
  | "term_unavailable"
  | "plan_not_synced"
  | "limit_reached"
  | "rate_limited"
  | "payment_unavailable"
  | "catalog_changed"
  | "already_processed"
  | PromoErrorKey
  | "network"
  | "generic";

const BY_CODE: Record<string, OrderErrorKey> = {
  unauthenticated: "unauthenticated",
  forbidden: "forbidden",
  invalid_ssh_key: "invalid_ssh_key",
  invalid_hostname: "invalid_hostname",
  plan_too_small: "plan_too_small",
  term_unavailable: "term_unavailable",
  plan_not_synced: "plan_not_synced",
  limit_reached: "limit_reached",
  rate_limited: "rate_limited",
  payment_unavailable: "payment_unavailable",
  already_processed: "already_processed",
  catalog_unavailable: "catalog_changed",
  plan_unavailable: "catalog_changed",
  app_unavailable: "catalog_changed",
  app_not_installable: "catalog_changed",
};

const BY_STATUS: Record<number, OrderErrorKey> = {
  401: "unauthenticated",
  429: "rate_limited",
  502: "payment_unavailable",
};

/**
 * Message à afficher pour une réponse d'erreur de `/api/vps/checkout`. Le code JSON prime ; sans code
 * (corps illisible), l'état HTTP décide pour les cas sans ambiguïté. Tout le reste -> message générique
 * (par exemple 403 `invalid_origin` n'est pas « seul le propriétaire commande »).
 */
export function orderErrorKey(
  status: number,
  code: string | undefined,
): OrderErrorKey {
  if (code === undefined) return BY_STATUS[status] ?? "generic";
  if ((PROMO_ERROR_KEYS as readonly string[]).includes(code))
    return code as PromoErrorKey;
  return Object.hasOwn(BY_CODE, code)
    ? (BY_CODE[code] as OrderErrorKey)
    : "generic";
}

/** Adresse de paiement acceptée pour la redirection : http(s) seulement, jamais un autre schéma. */
export function isRedirectableUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Un `requestId` valide pour l'API : 8 à 80 caractères de [A-Za-z0-9._:-]. */
export const REQUEST_ID = /^[A-Za-z0-9._:-]{8,80}$/;

// ─── Textes issus du catalogue ──────────────────────────────────────────────────

/**
 * Guide d'installation (texte brut) -> étapes. Une ligne = une étape ; la numérotation « 1. » écrite dans
 * le texte est retirée (la liste ordonnée numérote). Aucune balise n'est interprétée : le résultat est
 * rendu comme du texte.
 */
export function guideSteps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\s*[.)]\s+/, "").trim())
    .filter(Boolean);
}

/** Lien de licence ou de projet : http(s) seulement, sinon aucun lien. */
export function externalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
