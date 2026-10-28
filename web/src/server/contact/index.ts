import { createHmac } from "node:crypto";
import { getDb } from "@/server/db";
import { log } from "@/server/log";
import type { ContactDeps } from "./handler";
import { createRateLimiter } from "./rate-limit";

/**
 * Dépendances du formulaire de contact en production (un singleton par processus).
 * Secret des défis : `NEXORA_ALTCHA_SECRET` (32 caractères au moins) ; à défaut, dérivé du jeton d'administration
 * (HMAC avec une étiquette propre), ce qui évite un secret de plus en développement. Sans l'un ni l'autre,
 * le formulaire reste fermé (503).
 */
function altchaSecretFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const own = env.NEXORA_ALTCHA_SECRET;
  if (own && own.length >= 32) return own;
  const admin = env.NEXORA_APP_ADMIN_TOKEN;
  if (admin && admin.length >= 32)
    return createHmac("sha256", admin).update("altcha-v1").digest("hex");
  return undefined;
}

const g = globalThis as unknown as {
  __nexoraContact?: Pick<ContactDeps, "limiter" | "challengeLimiter">;
};

export function contactDeps(): ContactDeps {
  g.__nexoraContact ??= {
    // 5 demandes par client et par 10 minutes ; 30 défis par minute
    limiter: createRateLimiter({ windowMs: 10 * 60_000, max: 5 }),
    challengeLimiter: createRateLimiter({ windowMs: 60_000, max: 30 }),
  };
  return {
    db: getDb,
    altchaSecret: altchaSecretFromEnv(),
    limiter: g.__nexoraContact.limiter,
    challengeLimiter: g.__nexoraContact.challengeLimiter,
    log,
  };
}
