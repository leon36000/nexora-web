import { type Challenge, createChallenge, randomInt } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { deriveHmacKeySecret, verify } from "altcha-lib/frameworks/shared";

/**
 * Anti-abus ALTCHA auto-hébergé : le serveur émet un défi signé par HMAC (aucun service tiers, aucun témoin),
 * le navigateur résout la preuve de travail (PBKDF2), le serveur vérifie la signature et la solution, puis
 * consigne le défi comme utilisé (voir `createAltchaStore`) : une preuve ne sert qu'une fois.
 */

export type ChallengeTuning = {
  cost?: number;
  counterMin?: number;
  counterMax?: number;
  expiresInSeconds?: number;
};

/** Coût par défaut : de l'ordre de la seconde sur un ordinateur ordinaire, utile contre l'envoi en masse. */
const DEFAULTS = {
  cost: 2_000,
  counterMin: 1_500,
  counterMax: 4_000,
  expiresInSeconds: 600,
} as const;

export async function issueChallenge(
  secret: string,
  tuning: ChallengeTuning = {},
): Promise<Challenge> {
  const o = { ...DEFAULTS, ...tuning };
  return createChallenge({
    algorithm: "PBKDF2/SHA-256",
    cost: o.cost,
    counter: randomInt(o.counterMax, o.counterMin),
    deriveKey,
    hmacSignatureSecret: secret,
    hmacKeySignatureSecret: await deriveHmacKeySecret(secret),
    expiresAt: new Date(Date.now() + o.expiresInSeconds * 1000),
  });
}

export type AltchaStore = {
  get: (key: string) => Promise<unknown> | unknown;
  set: (key: string, value: boolean) => Promise<unknown> | unknown;
  setIfAbsent: (key: string, value: boolean) => Promise<boolean> | boolean;
};

export type AltchaResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "replayed" };

/** Vérifie la charge envoyée par le widget (base64 du JSON `{ challenge, solution }`). Ne lève jamais. */
export async function verifyAltcha(
  payload: unknown,
  secret: string,
  store: AltchaStore,
): Promise<AltchaResult> {
  if (typeof payload !== "string" || payload.trim() === "")
    return { ok: false, reason: "missing" };
  if (payload.length > 8_192) return { ok: false, reason: "invalid" };
  try {
    const result = await verify(
      payload,
      deriveKey,
      secret,
      await deriveHmacKeySecret(secret),
      store,
    );
    if (result.error === null) return { ok: true };
    return {
      ok: false,
      reason: /already used/i.test(result.error) ? "replayed" : "invalid",
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
