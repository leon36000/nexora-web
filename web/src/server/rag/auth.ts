import type { RagKeyMode } from "@nexora/db";
import { consumeRateLimit } from "../billing/rate-limit";
import { E } from "../gateway/errors";
import { type ApiKeyRow, authenticateApiKey } from "../gateway/keys";
import { F, failureResponse, type RagFailure } from "./failure";
import type { RagDeps } from "./types";

export interface RagContext {
  requestId: string;
  organizationId: string;
  key: ApiKeyRow;
  mode: RagKeyMode;
  /** Bases de la portée de la clé (de la même organisation : revérifié par chaque opération). */
  baseIds: string[];
  /** x-request-id et x-ratelimit-*. */
  headers: Record<string, string>;
}

export type Authenticated =
  | { ok: true; ctx: RagContext }
  | { ok: false; response: Response };

/** Clé `nxk_` → permission RAG → débit par clé. L'organisation est toujours celle de la clé. */
export async function authenticateRag(
  request: Request,
  deps: RagDeps,
): Promise<Authenticated> {
  const requestId = deps.requestId();
  const rid = { "x-request-id": requestId };
  const db = deps.db();
  const auth = await authenticateApiKey(
    db,
    request.headers.get("authorization"),
    deps.now(),
  );
  if (!auth.ok) return { ok: false, response: E.invalidKey(auth.code, rid) };
  const key = auth.key;
  if (!key.ragAccess || key.ragAccess.bases.length === 0)
    return { ok: false, response: failureResponse(F.notAllowed(), rid) };
  const rpm = key.rpmLimit ?? deps.config.defaultRpm;
  const rl = await consumeRateLimit(db, `rag:rpm:${key.id}`, {
    limit: rpm,
    windowSeconds: 60,
    now: deps.now(),
  });
  const headers = {
    ...rid,
    "x-ratelimit-limit-requests": String(rpm),
    "x-ratelimit-remaining-requests": String(Math.max(0, rpm - rl.count)),
    "x-ratelimit-reset-requests": `${rl.retryAfterSeconds}s`,
  };
  if (!rl.allowed)
    return {
      ok: false,
      response: E.rateLimited({
        ...headers,
        "retry-after": String(rl.retryAfterSeconds),
      }),
    };
  return {
    ok: true,
    ctx: {
      requestId,
      organizationId: key.organizationId,
      key,
      mode: key.ragAccess.mode,
      baseIds: key.ragAccess.bases,
      headers,
    },
  };
}

/** La base est-elle dans la portée de la clé ? Sinon `base_not_found`, comme si elle n'existait pas. */
export function scopeCheck(ctx: RagContext, baseId: string): RagFailure | null {
  return ctx.baseIds.includes(baseId) ? null : F.baseNotFound();
}

export function writeCheck(ctx: RagContext): RagFailure | null {
  return ctx.mode === "write" ? null : F.readOnly();
}
