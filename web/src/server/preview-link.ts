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

/**
 * Session d'aperçu : cookie `nexora_preview` SIGNÉ de 30 minutes, posé par /api/preview en plus du cookie du Draft Mode.
 * Le cookie du Draft Mode (`__prerender_bypass`) est constant pour tout un build et sans expiration : sur un navigateur
 * partagé il donnerait l'accès aux brouillons jusqu'au prochain build. `proxy.ts` ne l'honore plus que si cette session,
 * dont la signature couvre l'échéance, est valide ; sinon il l'efface.
 */
export const PREVIEW_SESSION_COOKIE = "nexora_preview";
export const PREVIEW_SESSION_SECONDS = 30 * 60;

function sessionMac(secret: string, exp: number): string {
  return createHmac("sha256", secret)
    .update(`nexora-preview-session-v1\n${exp}`)
    .digest("base64url");
}

export function signPreviewSession(input: {
  secret: string | undefined;
  now?: number;
}): { value: string; maxAge: number } {
  if (!input.secret || input.secret.length < MIN_SECRET)
    throw new Error(
      "NEXORA_PREVIEW_SECRET absent ou trop court (32 caractères minimum)",
    );
  const exp = (input.now ?? Date.now()) + PREVIEW_SESSION_SECONDS * 1000;
  return {
    value: `${exp}.${sessionMac(input.secret, exp)}`,
    maxAge: PREVIEW_SESSION_SECONDS,
  };
}

export function verifyPreviewSession(input: {
  secret: string | undefined;
  value: string | undefined;
  now?: number;
}): boolean {
  if (!input.secret || input.secret.length < MIN_SECRET || !input.value)
    return false;
  const parts = input.value.split(".");
  if (parts.length !== 2) return false;
  const [rawExp, sig] = parts as [string, string];
  if (!/^\d{10,16}$/.test(rawExp)) return false;
  const exp = Number(rawExp);
  const expected = Buffer.from(sessionMac(input.secret, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return false;
  return (input.now ?? Date.now()) <= exp;
}
