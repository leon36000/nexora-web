import { safeEqual } from "./auth";

/**
 * Freinage des tentatives d'accès à l'API d'administration avec un mauvais jeton (ASVS 2.2 / 11.1) : au-delà de 10
 * échecs en 5 minutes pour une même adresse, les nouvelles tentatives FAUSSES reçoivent 429 sans atteindre le
 * gestionnaire. Un jeton VALIDE n'est jamais freiné : un attaquant qui partage l'adresse de Directus (proxy qui
 * n'indique pas le client) ne peut pas couper l'administration. Limiteur en mémoire, par processus (comme celui du
 * formulaire de contact) : le vrai rempart reste de ne pas publier `/api/admin/*` (guide opérateur §9).
 */
export interface FailureLimiter {
  fail(key: string): void;
  blocked(key: string): boolean;
  /** Secondes avant la fin du blocage de cette clé (0 : libre). */
  retryAfter(key: string): number;
  size(): number;
}

export function createFailureLimiter(
  options: {
    max?: number;
    windowMs?: number;
    maxKeys?: number;
    now?: () => number;
  } = {},
): FailureLimiter {
  const max = options.max ?? 10;
  const windowMs = options.windowMs ?? 300_000;
  const maxKeys = options.maxKeys ?? 10_000;
  const now = options.now ?? Date.now;
  const hits = new Map<string, { count: number; start: number }>();
  const live = (key: string) => {
    const entry = hits.get(key);
    if (!entry) return null;
    if (now() - entry.start >= windowMs) {
      hits.delete(key);
      return null;
    }
    return entry;
  };
  return {
    fail(key) {
      const entry = live(key);
      if (entry) entry.count += 1;
      else {
        if (hits.size >= maxKeys) {
          // Oublie la plus ancienne (Map conserve l'ordre d'insertion).
          const oldest = hits.keys().next().value;
          if (oldest !== undefined) hits.delete(oldest);
        }
        hits.set(key, { count: 1, start: now() });
      }
    },
    blocked(key) {
      return (live(key)?.count ?? 0) >= max;
    },
    retryAfter(key) {
      const entry = live(key);
      return entry && entry.count >= max
        ? Math.max(1, Math.ceil((entry.start + windowMs - now()) / 1000))
        : 0;
    },
    size: () => hits.size,
  };
}

/** Routes protégées par le jeton d'administration. */
export const ADMIN_PATH = /^\/api\/(?:admin|revalidate)(?:\/|$)/;

const limiter = createFailureLimiter();

/** Adresse du client : premier élément de X-Forwarded-For (le proxy frontal doit l'écraser, guide §9). */
export function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue"
  );
}

/**
 * Renvoie une réponse 429 si la requête présente un jeton faux (ou aucun) depuis une adresse déjà trop souvent
 * refusée ; sinon `null` (la requête continue). Enregistre l'échec quand le jeton ne correspond pas.
 */
export function throttleAdminFailures(
  request: Request,
  expectedToken: string | undefined,
): Response | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  if (match?.[1] && expectedToken && safeEqual(match[1], expectedToken))
    return null;
  const key = clientAddress(request);
  if (limiter.blocked(key))
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "retry-after": String(limiter.retryAfter(key)),
          "cache-control": "no-store",
        },
      },
    );
  limiter.fail(key);
  return null;
}
