import type { Database } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { type ChallengeTuning, issueChallenge, verifyAltcha } from "./altcha";
import { clientKey, type createRateLimiter } from "./rate-limit";
import { fingerprintOf, parseContact } from "./schema";
import { createAltchaStore, saveLead } from "./store";

/**
 * Formulaire de contact : POST /api/contact et GET /api/contact/challenge.
 * Ordre de POST : type de contenu, taille, JSON, limitation de débit, champ piège, validation (422, la preuve
 * reste utilisable), preuve Altcha (403, à usage unique), enregistrement unique (déduplication 24 h).
 */

export type ContactDeps = {
  db: () => Database;
  /** Secret HMAC des défis ; absent = anti-abus non configuré, le formulaire reste fermé (503). */
  altchaSecret: string | undefined;
  limiter: ReturnType<typeof createRateLimiter>;
  challengeLimiter?: ReturnType<typeof createRateLimiter>;
  challengeTuning?: ChallengeTuning;
  log: Logger;
};

const MAX_BODY_CHARS = 16_384;
const NO_STORE = { "cache-control": "no-store" };
const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...NO_STORE, ...extra } });

export async function handleChallenge(
  request: Request,
  deps: ContactDeps,
): Promise<Response> {
  if (!deps.altchaSecret) return json({ error: "not_configured" }, 503);
  if (deps.challengeLimiter) {
    const hit = deps.challengeLimiter.hit(clientKey(request));
    if (!hit.allowed)
      return json({ error: "rate_limited" }, 429, {
        "retry-after": String(hit.retryAfterSeconds),
      });
  }
  const challenge = await issueChallenge(
    deps.altchaSecret,
    deps.challengeTuning,
  );
  return json(challenge);
}

export async function handleContactSubmit(
  request: Request,
  deps: ContactDeps,
): Promise<Response> {
  // Type exact : « text/plain;application/json » est une requête CORS « simple » (sans prévol) qu'un site tiers peut faire envoyer.
  if (
    !/^application\/json\s*(?:;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    return json({ error: "unsupported_media_type" }, 415);
  // Corps annoncé trop gros : refusé sans le lire.
  const announced = Number(request.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > MAX_BODY_CHARS * 4)
    return json({ error: "payload_too_large" }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS)
    return json({ error: "payload_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return json({ error: "invalid_json" }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const hit = deps.limiter.hit(clientKey(request));
  if (!hit.allowed)
    return json({ error: "rate_limited" }, 429, {
      "retry-after": String(hit.retryAfterSeconds),
    });

  // champ piège : invisible pour une personne ; un robot le remplit. Même réponse, rien n'est enregistré.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    deps.log.warn("contact : champ piège rempli, demande écartée");
    return json({ status: "recorded" });
  }

  const parsed = parseContact(body);
  if (!parsed.ok)
    return json({ error: "validation", errors: parsed.errors }, 422);

  if (!deps.altchaSecret) return json({ error: "not_configured" }, 503);
  let db: Database;
  try {
    db = deps.db();
  } catch (error) {
    deps.log.error("contact : base indisponible", { error });
    return json({ error: "storage" }, 500);
  }
  const proof = await verifyAltcha(
    body.altcha,
    deps.altchaSecret,
    createAltchaStore(db),
  ).catch((error) => {
    deps.log.error("contact : vérification Altcha impossible", { error });
    return { ok: false, reason: "invalid" } as const;
  });
  if (!proof.ok) {
    deps.log.warn("contact : preuve Altcha refusée", { reason: proof.reason });
    return json({ error: "altcha", reason: proof.reason }, 403);
  }

  const lang = body.lang === "en" ? "en" : "fr";
  try {
    const saved = await saveLead(
      db,
      parsed.data,
      fingerprintOf(parsed.data),
      lang,
    );
    deps.log.info("contact : demande reçue", {
      id: saved.id,
      status: saved.status,
    });
    return json({
      status: saved.status === "created" ? "recorded" : "already_recorded",
    });
  } catch (error) {
    // aucun renseignement personnel dans le journal : l'erreur est nettoyée par le journal commun
    deps.log.error("contact : enregistrement impossible", { error });
    return json({ error: "storage" }, 500);
  }
}
