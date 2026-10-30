import type { AccessLevel, BillingMode } from "@nexora/db";
import { stripLangPrefix } from "@/i18n/config";

/**
 * Logique pure du panneau client (`/compte/…`) : navigation, liste « Pour démarrer », accès gratuit,
 * état de WorkStudio. Aucun accès à la base ni au réseau : les pages lui passent des données déjà lues.
 */

export const PANEL_SECTIONS = [
  "overview",
  "models",
  "activity",
  "privacy",
  "workstudio",
  "code",
  "rag",
  "cloud",
  "apps",
  "billing",
  "security",
] as const;
export type PanelSection = (typeof PANEL_SECTIONS)[number];

export interface PanelNavItem {
  id: PanelSection;
  /** Chemin NEUTRE (sans langue) ; `localizePath` produit l'adresse publique. */
  path: string;
}

/**
 * Entrées de la navigation, dans l'ordre d'affichage. Toutes mènent à une page du panneau (`/compte/…`), sauf
 * « Nexora Apps » qui renvoie à la page publique `/apps` (construite à part : le lien n'est actif que si elle existe).
 */
export const PANEL_NAV: readonly PanelNavItem[] = [
  { id: "overview", path: "/compte" },
  { id: "models", path: "/compte/modeles" },
  { id: "activity", path: "/compte/activite" },
  { id: "privacy", path: "/compte/confidentialite" },
  { id: "workstudio", path: "/compte/workstudio" },
  { id: "code", path: "/compte/code" },
  { id: "rag", path: "/compte/rag" },
  { id: "cloud", path: "/compte/vps" },
  { id: "apps", path: "/apps" },
  { id: "billing", path: "/compte/facturation" },
  { id: "security", path: "/compte/securite" },
];

/** Section du panneau à laquelle appartient une adresse (avec ou sans préfixe de langue) ; null hors panneau. */
export function sectionOfPath(pathname: string): PanelSection | null {
  const neutral = stripLangPrefix(pathname).replace(/\/+$/, "") || "/";
  if (neutral === "/compte") return "overview";
  for (const item of PANEL_NAV) {
    if (item.id === "overview" || item.id === "apps") continue;
    if (neutral === item.path || neutral.startsWith(`${item.path}/`))
      return item.id;
  }
  return null;
}

export type OnboardingStepId = "key" | "model" | "workstudio" | "vps";

export interface OnboardingInput {
  /** L'organisation a déjà créé au moins une clé d'API. */
  hasApiKey: boolean;
  /** Au moins une requête réussie vers un modèle (hors agents). */
  hasModelRequest: boolean;
  /** Un abonnement WorkStudio donne actuellement accès. */
  hasWorkstudio: boolean;
  /** Au moins un VPS en service. */
  hasVps: boolean;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
  /** Chemin NEUTRE de la page où l'on accomplit l'étape. */
  href: string;
}

/** Les quatre premiers pas, cochés d'après les données réelles (jamais d'après un clic ou une promesse). */
export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  return [
    { id: "key", done: input.hasApiKey, href: "/compte/modeles" },
    { id: "model", done: input.hasModelRequest, href: "/modeles" },
    { id: "workstudio", done: input.hasWorkstudio, href: "/compte/workstudio" },
    { id: "vps", done: input.hasVps, href: "/compte/vps" },
  ];
}

export function onboardingProgress(steps: readonly OnboardingStep[]): {
  done: number;
  total: number;
} {
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

const PRESET_AMOUNTS_CENTS = [
  1000, 2500, 5000, 10_000, 25_000, 50_000,
] as const;

/**
 * Montants proposés (cents) au bouton « Ajouter des fonds » : 10, 25, 50, 100, 250 et 500 $ (les forfaits de recharge de la conception du 30/10) dans les bornes de la
 * configuration ; le minimum de la configuration est toujours proposé en premier. Le champ libre reste disponible.
 */
export function presetAmountsCents(
  minCents: number,
  maxCents: number,
): number[] {
  if (minCents > maxCents) return [];
  const within = PRESET_AMOUNTS_CENTS.filter(
    (c) => c >= minCents && c <= maxCents,
  );
  return within.includes(minCents as never)
    ? [...within]
    : [minCents, ...within.filter((c) => c > minCents)];
}

/** Seule une organisation « maison » (équipe de Nexora) a un accès gratuit ; toute autre valeur : jamais. */
export function isFreeAccess(mode: BillingMode): boolean {
  return mode === "house";
}

/**
 * Adresse publique de l'instance WorkStudio, ramenée à son origine ; null si elle n'est pas sûre : seulement https
 * (ou http sur la machine locale, pour le développement), sans identifiants.
 */
export function safeInstanceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && local))
    return url.origin;
  return null;
}

/**
 * Adresse à laquelle le bouton « Ouvrir WorkStudio » mène. WorkStudio intégré : `WORKSTUDIO_PUBLIC_URL` (une seule
 * instance multi-utilisateurs, connexion unique) l'emporte quand elle est sûre ; sinon on garde l'adresse déclarée
 * en base (`workstudio_embed_settings`), comme avant ; sinon null (« en préparation »).
 */
export function workstudioInstanceOrigin(
  publicUrl: string | null | undefined,
  declaredOrigin: string | null,
): string | null {
  return safeInstanceUrl(publicUrl?.trim()) ?? safeInstanceUrl(declaredOrigin);
}

export type WorkstudioView =
  | { state: "no_subscription" }
  | { state: "suspended" }
  | { state: "pending" }
  | { state: "ready"; url: string };

/**
 * État de WorkStudio pour l'organisation. Un abonnement « WorkStudio » est un abonnement lié à une offre du
 * catalogue (`planCode`) ; ceux des VPS n'en portent pas. Le bouton d'ouverture n'existe que si l'accès est
 * actif (complet ou en délai de grâce) ET qu'une adresse sûre est connue ; sinon on le dit honnêtement.
 */
type OfferSubscription = { planCode: string | null; access: AccessLevel };

/** Un abonnement lié à une offre donne actuellement accès (complet, ou délai de grâce après un paiement raté). */
export function hasWorkstudioAccess(
  subscriptions: readonly OfferSubscription[],
  free = false,
  hasCredits = false,
): boolean {
  // L'organisation « maison » (accès gratuit) n'a pas besoin d'abonnement ; tout autre compte a le droit tant qu'il
  // lui reste des crédits (abonnement OU recharge : même règle que le serveur, `entitlements.ts`), ou un abonnement actif.
  return (
    free ||
    hasCredits ||
    subscriptions.some(
      (s) =>
        s.planCode !== null && (s.access === "full" || s.access === "grace"),
    )
  );
}

export function workstudioView(input: {
  subscriptions: readonly OfferSubscription[];
  instanceOrigin: string | null;
  /** Organisation « maison » : accès gratuit, donc ouverture possible sans abonnement. */
  free?: boolean;
  /** Il reste au moins un crédit (abonnement ou recharge). */
  hasCredits?: boolean;
}): WorkstudioView {
  const offers = input.subscriptions.filter((s) => s.planCode !== null);
  if (
    hasWorkstudioAccess(offers, input.free ?? false, input.hasCredits ?? false)
  ) {
    const url = safeInstanceUrl(input.instanceOrigin);
    return url ? { state: "ready", url } : { state: "pending" };
  }
  if (offers.some((s) => s.access === "suspended"))
    return { state: "suspended" };
  return { state: "no_subscription" };
}
