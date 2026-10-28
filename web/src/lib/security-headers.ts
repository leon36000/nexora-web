/**
 * En-têtes de sécurité du site (S9). Une seule source : `next.config.ts` pose les en-têtes fixes sur toutes les
 * routes (y compris /api et /v1) ; `proxy.ts` pose la CSP des PAGES (elle varie avec la bulle WorkStudio et le mode).
 *
 * Aucune origine tierce : polices, scripts, images et connexions viennent du site lui-même (promesse de souveraineté,
 * conception §4). `'unsafe-inline'` reste nécessaire aux scripts de démarrage et aux styles en ligne de Next.js
 * (pages statiques : pas de nonce possible) ; `'unsafe-eval'` n'existe qu'en développement.
 */

export type HeaderPair = { key: string; value: string };

/** CSP des réponses de l'API et de la passerelle : aucune ressource, aucun cadre. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** En-têtes fixes, sur toutes les routes. HSTS sans includeSubDomains ni preload : engagement du domaine entier, à décider par l'opérateur. */
export const SECURITY_HEADERS: HeaderPair[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=(), accelerometer=(), gyroscope=(), magnetometer=(), display-capture=(), bluetooth=(), serial=(), hid=(), midi=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Isole le contexte de navigation : aucune fenêtre d'un autre site ne garde de référence vers la nôtre (Spectre, tabnabbing).
  // Les redirections vers Stripe sont des navigations de premier niveau : non touchées.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

/**
 * L'API et la passerelle ne sont jamais embarquées par un autre site (pas de CORS non plus) : leurs réponses ne se
 * chargent pas en `no-cors` depuis une autre origine. Pas sur `/api/media` : ce sont des images de pages publiques.
 */
export const API_CORP: HeaderPair = {
  key: "Cross-Origin-Resource-Policy",
  value: "same-origin",
};

/** Directives de la CSP des pages (sans `script-src`, qui dépend du mode). */
export const PAGE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
] as const;

/**
 * `script-src-attr 'none'` : aucun gestionnaire d'événement en ligne (`<img onerror=…>`, `onclick=…`) ne s'exécute,
 * même si `script-src` garde `'unsafe-inline'` (voir ci-dessus). `https: true` ajoute `upgrade-insecure-requests`
 * (le site est servi en HTTPS : toute sous-ressource en HTTP est montée en HTTPS).
 */
export function pageCsp(
  options: { dev?: boolean; https?: boolean } = {},
): string {
  const script = `script-src 'self' 'unsafe-inline'${options.dev ? " 'unsafe-eval'" : ""}`;
  return [
    PAGE_CSP_DIRECTIVES[0],
    script,
    "script-src-attr 'none'",
    ...PAGE_CSP_DIRECTIVES.slice(1),
    ...(options.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function parseCsp(csp: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out.set(name, sources);
  }
  return out;
}

/** Les directives de `override` remplacent celles de `base` de même nom ; les autres sont ajoutées. */
export function mergeCsp(base: string, override: string | null): string {
  if (!override) return base;
  const merged = parseCsp(base);
  for (const [name, sources] of parseCsp(override)) merged.set(name, sources);
  return [...merged].map(([n, s]) => [n, ...s].join(" ")).join("; ");
}

/**
 * Pages de l'espace client qui envoient un formulaire à `/api/billing/*` : l'API répond par une redirection (303)
 * vers la page de paiement ou de portail hébergée par Stripe. Chrome applique `form-action` aux redirections d'un
 * formulaire : sans ces deux origines, la navigation est bloquée. Elles ne sont ouvertes qu'en destination de
 * formulaire, jamais comme source de script, d'image ou de connexion, et seulement sur ces pages.
 */
export const STRIPE_FORM_ACTION =
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com";

const BILLING_FORM_PAGES = /^(\/en)?\/compte(\/vps)?\/?$/;

export function billingFormCsp(pathname: string): string | null {
  return BILLING_FORM_PAGES.test(pathname) ? STRIPE_FORM_ACTION : null;
}
