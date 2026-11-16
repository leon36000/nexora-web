import {
  type Database,
  LedgerError,
  type releaseReservation,
  type reserve,
  type settleReservation,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { safeEqual } from "../auth";
import type { RateLimitResult } from "../billing/rate-limit";
import { errorJson, json, methodNotAllowed } from "../code/http";
import type { AuthResult } from "../gateway/keys";

export type CreativeCreditsAction = "reserve" | "settle" | "release";

export interface CreativeCreditsDeps {
  db: () => Database;
  now: () => Date;
  configVersion: () => string;
  serviceToken: string | undefined;
  log: Logger;
  authenticate: (
    db: Database,
    authorization: string | null,
    now: Date,
  ) => Promise<AuthResult>;
  rateLimit: (
    db: Database,
    key: string,
    options: { limit: number; windowSeconds: number; now: Date },
  ) => Promise<RateLimitResult>;
  reserve: typeof reserve;
  settle: typeof settleReservation;
  release: typeof releaseReservation;
}

const MAX_BODY_BYTES = 4096;
// `micro` est un bigint signé PostgreSQL : crédits × 10 000 doit rester sous INT64_MAX.
const MAX_CREDITS = Number(9_223_372_036_854_775_807n / 10_000n);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: refuser les caractères de contrôle dans les identifiants.
const CONTROL = /[\u0000-\u001f\u007f]/;

type BodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 400 | 413 };

type AuthenticatedApiKey = Extract<AuthResult, { ok: true }>["key"];

type AuthLimitResult =
  | { ok: true; db: Database; key: AuthenticatedApiKey }
  | { ok: false; response: Response };

type JsonRequestResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response };

/** Lit au plus 4 Kio, y compris les requêtes sans Content-Length. */
async function readBoundedJson(request: Request): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    return { ok: false, status: 413 };

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, value: {} };
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.trim() === "") return { ok: true, value: {} };
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return { ok: false, status: 400 };
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400 };
  }
}

function isCredits(value: unknown, allowZero: boolean): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value <= MAX_CREDITS &&
    (allowZero ? value >= 0 : value > 0)
  );
}

function idempotencyKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    !CONTROL.test(value)
  );
}

function label(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 1 &&
    value.trim().length <= 120 &&
    !CONTROL.test(value)
  );
}

function ledgerErrorResponse(error: LedgerError): Response {
  switch (error.code) {
    case "invalid_amount":
      return errorJson(400, "invalid_amount", "Montant de crédits invalide.");
    case "idempotency_conflict":
      return errorJson(
        409,
        "idempotency_conflict",
        "Cette clé de demande a déjà été utilisée avec d'autres paramètres.",
      );
    case "not_found":
      return errorJson(
        404,
        "reservation_not_found",
        "Réservation introuvable.",
      );
    case "reservation_closed":
      return errorJson(
        409,
        "reservation_closed",
        "Cette réservation est déjà close.",
      );
    case "invalid_kind":
      return errorJson(400, "invalid_request", "Demande invalide.");
  }
}

async function authenticateAndRateLimit(
  request: Request,
  deps: CreativeCreditsDeps,
): Promise<AuthLimitResult> {
  const db = deps.db();
  const now = deps.now();
  const auth = await deps.authenticate(
    db,
    request.headers.get("authorization"),
    now,
  );
  // Ne pas révéler si une clé absente, inconnue, révoquée ou expirée diffère.
  if (!auth.ok)
    return {
      ok: false,
      response: errorJson(
        401,
        "invalid_api_key",
        "Clé API invalide ou révoquée.",
        { "www-authenticate": 'Bearer realm="nexora"' },
      ),
    };

  const limited = await deps.rateLimit(db, `creative-credits:${auth.key.id}`, {
    limit: 120,
    windowSeconds: 60,
    now,
  });
  if (!limited.allowed)
    return {
      ok: false,
      response: errorJson(429, "rate_limited", "Trop de demandes.", {
        "retry-after": String(limited.retryAfterSeconds),
      }),
    };

  return { ok: true, db, key: auth.key };
}

async function readJsonRequest(request: Request): Promise<JsonRequestResult> {
  if (
    !/^application\/json(?:\s*;|\s*$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    return {
      ok: false,
      response: errorJson(
        415,
        "unsupported_media_type",
        "Un corps JSON est requis.",
      ),
    };

  const parsed = await readBoundedJson(request);
  if (!parsed.ok)
    return {
      ok: false,
      response: errorJson(
        parsed.status,
        parsed.status === 413 ? "request_too_large" : "invalid_json",
        parsed.status === 413
          ? "Corps de requête trop volumineux."
          : "Corps JSON invalide.",
      ),
    };
  return { ok: true, value: parsed.value };
}

async function reserveCreativeCredits(
  db: Database,
  key: AuthenticatedApiKey,
  body: Record<string, unknown>,
  deps: CreativeCreditsDeps,
): Promise<Response> {
  if (
    !idempotencyKey(body.idempotencyKey) ||
    !isCredits(body.credits, false) ||
    !label(body.label)
  )
    return errorJson(
      400,
      "invalid_request",
      "Clé, crédits ou libellé invalide.",
    );

  const result = await deps.reserve(db, {
    organizationId: key.organizationId,
    apiKeyId: key.id,
    amountMicro: BigInt(body.credits) * 10_000n,
    idempotencyKey: `creative:${key.organizationId}:${body.idempotencyKey}`,
    configVersion: deps.configVersion(),
    metadata: { product: "creative", label: body.label.trim() },
  });
  if (result.status === "insufficient_funds" || result.status === "blocked")
    return errorJson(
      402,
      "insufficient_quota",
      "Il ne vous reste pas assez de crédits.",
    );
  if (result.status === "key_cap_exceeded")
    return errorJson(
      402,
      "key_spend_cap_exceeded",
      "Le plafond de dépenses de cette clé API est atteint.",
    );
  if (result.status === "replayed" && result.reservation.status !== "open")
    return errorJson(
      409,
      "reservation_closed",
      "Cette réservation est déjà close.",
    );
  return json({
    reservationId: result.reservation.id,
    credits: body.credits,
  });
}

async function settleCreativeCredits(
  db: Database,
  organizationId: string,
  reservationId: string,
  body: Record<string, unknown>,
  deps: CreativeCreditsDeps,
): Promise<Response> {
  if (!isCredits(body.credits, true))
    return errorJson(400, "invalid_request", "Montant de crédits invalide.");
  const actualMicro = BigInt(body.credits) * 10_000n;
  const result = await deps.settle(db, {
    organizationId,
    reservationId,
    actualMicro,
  });
  if (result.replayed && result.chargedMicro !== actualMicro)
    return errorJson(
      409,
      "settlement_conflict",
      "Cette réservation a déjà été réglée avec un autre montant.",
    );
  return json({ ok: true, replayed: result.replayed });
}

async function releaseCreativeCredits(
  db: Database,
  organizationId: string,
  reservationId: string,
  deps: CreativeCreditsDeps,
): Promise<Response> {
  const result = await deps.release(db, { organizationId, reservationId });
  return json({ ok: true, replayed: result.replayed });
}

async function handleCreativeCreditsAction(
  action: CreativeCreditsAction,
  db: Database,
  key: AuthenticatedApiKey,
  body: Record<string, unknown>,
  deps: CreativeCreditsDeps,
): Promise<Response> {
  if (action === "reserve") return reserveCreativeCredits(db, key, body, deps);

  if (typeof body.reservationId !== "string" || !UUID.test(body.reservationId))
    return errorJson(
      400,
      "invalid_request",
      "Identifiant de réservation invalide.",
    );

  if (action === "settle")
    return settleCreativeCredits(
      db,
      key.organizationId,
      body.reservationId,
      body,
      deps,
    );
  return releaseCreativeCredits(
    db,
    key.organizationId,
    body.reservationId,
    deps,
  );
}

function isCreativeCreditsAction(
  action: string,
): action is CreativeCreditsAction {
  return action === "reserve" || action === "settle" || action === "release";
}

export async function handleCreativeCredits(
  request: Request,
  action: string,
  deps: CreativeCreditsDeps,
): Promise<Response> {
  if (!isCreativeCreditsAction(action))
    return errorJson(404, "not_found", "Action de crédits introuvable.");
  if (request.method !== "POST") return methodNotAllowed("POST");

  // Une clé d'organisation est détenue par l'utilisateur; le service Creative doit aussi prouver
  // son identité. Fermé par défaut si le secret commun n'est pas configuré.
  if (!deps.serviceToken || deps.serviceToken.length < 32)
    return errorJson(
      503,
      "service_not_configured",
      "Service Creative non configuré.",
    );
  const presentedServiceToken =
    request.headers.get("x-nexora-creative-service-token") ?? "";
  if (!safeEqual(presentedServiceToken, deps.serviceToken))
    return errorJson(
      401,
      "invalid_service_token",
      "Authentification du service Creative invalide.",
    );

  try {
    const authorization = await authenticateAndRateLimit(request, deps);
    if (!authorization.ok) return authorization.response;

    const parsed = await readJsonRequest(request);
    if (!parsed.ok) return parsed.response;

    return await handleCreativeCreditsAction(
      action,
      authorization.db,
      authorization.key,
      parsed.value,
      deps,
    );
  } catch (error) {
    if (error instanceof LedgerError) return ledgerErrorResponse(error);
    deps.log.error("API crédits Creative indisponible", {
      action,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return errorJson(
      503,
      "unavailable",
      "Service de crédits indisponible. Réessayez.",
      {
        "retry-after": "5",
      },
    );
  }
}
