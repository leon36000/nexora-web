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
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

/** Directives de la CSP des pages (sans `script-src`, qui dépend du mode). */
export const PAGE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
] as const;

export function pageCsp(options: { dev?: boolean } = {}): string {
  const script = `script-src 'self' 'unsafe-inline'${options.dev ? " 'unsafe-eval'" : ""}`;
  return [PAGE_CSP_DIRECTIVES[0], script, ...PAGE_CSP_DIRECTIVES.slice(1)].join(
    "; ",
  );
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
