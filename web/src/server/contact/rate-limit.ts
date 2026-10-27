import { createHash } from "node:crypto";

/**
 * Limitation de débit en mémoire (fenêtre glissante) : un site, un processus. Derrière plusieurs instances,
 * chaque instance compte pour elle-même (la limite effective est alors multipliée) ; la déduplication et
 * le défi Altcha à usage unique, eux, sont en base et valent pour toutes les instances.
 */
export type Hit = { allowed: boolean; retryAfterSeconds: number };

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  maxKeys?: number;
  now?: () => number;
}) {
  const { windowMs, max, maxKeys = 10_000 } = options;
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();

  const prune = (t: number) => {
    for (const [key, list] of hits) {
      const fresh = list.filter((x) => t - x < windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
    // toujours trop : on écarte les plus anciennes clés (ordre d'insertion)
    for (const key of hits.keys()) {
      if (hits.size < maxKeys) break;
      hits.delete(key);
    }
  };

  return {
    hit(key: string): Hit {
      const t = now();
      if (hits.size >= maxKeys) prune(t);
      const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (list.length >= max) {
        hits.set(key, list);
        const oldest = list[0] ?? t;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((oldest + windowMs - t) / 1000),
          ),
        };
      }
      list.push(t);
      hits.delete(key); // réinsère en fin de Map : les clés actives restent les plus récentes
      hits.set(key, list);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    size: () => hits.size,
  };
}

/** Clé de limitation : empreinte courte de l'adresse du client (jamais l'adresse elle-même, jamais journalisée). */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "inconnu";
  return createHash("sha256")
    .update(`contact|${ip}`)
    .digest("hex")
    .slice(0, 16);
}
