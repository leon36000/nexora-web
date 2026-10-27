import { createHmac, timingSafeEqual } from "node:crypto";
import { isLang, type Lang } from "@/i18n/config";

/**
 * Lien d'aperçu signé : /api/preview?lang=fr&path=/opsys-ai&exp=<ms>&sig=<HMAC>.
 * Le secret reste côté serveur (NEXORA_PREVIEW_SECRET). La signature couvre la langue, le chemin et
 * l'échéance : modifier l'un d'eux invalide le lien. Le chemin est un chemin du site (jamais une adresse
 * externe), ce qui exclut toute redirection ouverte même avec un lien valide.
 */

const MIN_SECRET = 32;
const DEFAULT_TTL_SECONDS = 600;
/** `/` ou `/segment[/segment…]` en minuscules, chiffres et tirets. */
const SAFE_PATH =
  /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;

export function isSafePreviewPath(path: string): boolean {
  return SAFE_PATH.test(path);
}

function mac(secret: string, lang: string, path: string, exp: number): string {
  return createHmac("sha256", secret)
    .update(`nexora-preview-v1\n${lang}\n${path}\n${exp}`)
    .digest("base64url");
}

export type PreviewLink = {
  lang: Lang;
  path: string;
  exp: number;
  sig: string;
};

export function signPreviewLink(input: {
  secret: string | undefined;
  lang: Lang;
  path: string;
  now?: number;
  ttlSeconds?: number;
}): PreviewLink {
  if (!input.secret || input.secret.length < MIN_SECRET)
    throw new Error(
      "NEXORA_PREVIEW_SECRET absent ou trop court (32 caractères minimum)",
    );
  if (!isSafePreviewPath(input.path))
    throw new Error("chemin d'aperçu invalide");
  const exp =
    (input.now ?? Date.now()) +
    (input.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
  return {
    lang: input.lang,
    path: input.path,
    exp,
    sig: mac(input.secret, input.lang, input.path, exp),
  };
}

export type PreviewVerdict =
  | { ok: true; lang: Lang; path: string }
  | {
      ok: false;
      reason: "not_configured" | "bad_request" | "bad_signature" | "expired";
    };

export function verifyPreviewLink(input: {
  secret: string | undefined;
  lang: string;
  path: string;
  exp: number;
  sig: string;
  now?: number;
}): PreviewVerdict {
  if (!input.secret || input.secret.length < MIN_SECRET)
    return { ok: false, reason: "not_configured" };
  if (
    !isLang(input.lang) ||
    !isSafePreviewPath(input.path) ||
    !Number.isFinite(input.exp)
  )
    return { ok: false, reason: "bad_request" };
  const expected = Buffer.from(
    mac(input.secret, input.lang, input.path, input.exp),
  );
  const given = Buffer.from(input.sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return { ok: false, reason: "bad_signature" };
  if ((input.now ?? Date.now()) > input.exp)
    return { ok: false, reason: "expired" };
  return { ok: true, lang: input.lang, path: input.path };
}
