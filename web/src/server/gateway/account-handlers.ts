import type { Database, OrgRole } from "@nexora/db";
import { WEBPILOT_OPERATIONS } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { z } from "zod";
import { isSameOriginRequest } from "../auth/origin";
import { consumeRateLimit } from "../billing/rate-limit";
import { parseCadToCents } from "../ledger/money";
import {
  ApiKeyInputError,
  ApiKeyLimitError,
  createApiKey,
  MAX_ACTIVE_KEYS_PER_ORGANIZATION,
  revokeApiKey,
} from "./keys";

/**
 * Clés API de l'espace client : `POST /api/account/api-keys` (création, valeur affichée UNE fois)
 * et `DELETE /api/account/api-keys/{id}` (révocation). L'organisation vient de la session confrontée
 * aux adhésions, jamais du corps de la requête ; seul le propriétaire crée ou révoque (une clé
 * dépense les crédits de l'organisation). Contrôle d'origine (CSRF) comme les routes de facturation.
 */

export interface AccountContext {
  userId: string;
  organizationId: string;
  role: OrgRole;
}

export interface AccountKeysDeps {
  db: () => Database;
  siteUrl: string;
  getContext: (headers: Headers) => Promise<AccountContext | null>;
  log: Logger;
  now: () => Date;
}

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    /** Plafond de dépense cumulée, en dollars canadiens (« 25 », « 25,50 »). */
    spendCapCad: z.string().trim().max(12).optional(),
    expiresInDays: z.number().int().min(1).max(3650).optional(),
    /** Permission WebPilot, à cocher (décision O-8) : absente = aucune opération. */
    webpilotOperations: z
      .array(z.enum(WEBPILOT_OPERATIONS))
      .max(WEBPILOT_OPERATIONS.length)
      .optional(),
  })
  .strict();

type Authorized = { response: Response } | { ctx: AccountContext };

async function authorize(
  request: Request,
  deps: AccountKeysDeps,
): Promise<Authorized> {
  if (!isSameOriginRequest(request, deps.siteUrl))
    return { response: json({ error: "invalid_origin" }, 403) };
  const ctx = await deps.getContext(request.headers);
  if (!ctx) return { response: json({ error: "unauthenticated" }, 401) };
  if (ctx.role !== "owner")
    return { response: json({ error: "forbidden" }, 403) };
  const limit = await consumeRateLimit(deps.db(), `acct-keys:${ctx.userId}`, {
    limit: 20,
    windowSeconds: 60,
    now: deps.now(),
  });
  if (!limit.allowed)
    return {
      response: Response.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            "retry-after": String(limit.retryAfterSeconds),
          },
        },
      ),
    };
  return { ctx };
}

export async function handleCreateKey(
  request: Request,
  deps: AccountKeysDeps,
): Promise<Response> {
  try {
    const auth = await authorize(request, deps);
    if ("response" in auth) return auth.response;
    let parsed: z.infer<typeof createSchema>;
    try {
      const result = createSchema.safeParse(await request.json());
      if (!result.success) return json({ error: "invalid_request" }, 422);
      parsed = result.data;
    } catch {
      return json({ error: "invalid_json" }, 422);
    }
    let spendCapMicro: bigint | null = null;
    if (parsed.spendCapCad) {
      const cents = parseCadToCents(parsed.spendCapCad);
      if (cents === null || cents <= 0)
        return json({ error: "invalid_spend_cap" }, 422);
      spendCapMicro = BigInt(cents) * 10_000n;
    }
    const now = deps.now();
    const created = await createApiKey(deps.db(), {
      organizationId: auth.ctx.organizationId,
      name: parsed.name,
      spendCapMicro,
      webpilotOperations: parsed.webpilotOperations ?? null,
      expiresAt: parsed.expiresInDays
        ? new Date(now.getTime() + parsed.expiresInDays * 86_400_000)
        : null,
      createdBy: auth.ctx.userId,
      maxActiveKeys: MAX_ACTIVE_KEYS_PER_ORGANIZATION,
    });
    deps.log.info("clé API créée", {
      apiKeyId: created.record.id,
      organizationId: auth.ctx.organizationId,
    });
    return json(
      {
        key: created.key, // seule occasion de voir la valeur
        id: created.record.id,
        name: created.record.name,
        prefix: created.record.prefix,
        createdAt: created.record.createdAt.toISOString(),
        expiresAt: created.record.expiresAt?.toISOString() ?? null,
      },
      201,
    );
  } catch (error) {
    if (error instanceof ApiKeyInputError)
      return json({ error: "invalid_request" }, 422);
    if (error instanceof ApiKeyLimitError)
      return json(
        { error: "key_limit", limit: MAX_ACTIVE_KEYS_PER_ORGANIZATION },
        409,
      );
    deps.log.error("clé API : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}

export async function handleRevokeKey(
  request: Request,
  keyId: string,
  deps: AccountKeysDeps,
): Promise<Response> {
  try {
    const auth = await authorize(request, deps);
    if ("response" in auth) return auth.response;
    if (!/^[0-9a-f-]{36}$/i.test(keyId))
      return json({ error: "not_found" }, 404);
    const now = deps.now();
    const revokedAt = await revokeApiKey(
      deps.db(),
      auth.ctx.organizationId,
      keyId,
      now,
    );
    if (!revokedAt) return json({ error: "not_found" }, 404);
    deps.log.info("clé API révoquée", {
      apiKeyId: keyId,
      organizationId: auth.ctx.organizationId,
    });
    return json({ id: keyId, revokedAt: revokedAt.toISOString() });
  } catch (error) {
    deps.log.error("clé API : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}
