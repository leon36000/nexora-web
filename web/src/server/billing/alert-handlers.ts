import { setBalanceAlert } from "@nexora/db";
import { z } from "zod";
import { isSameOriginRequest } from "../auth/origin";
import type { AccountKeysDeps } from "../gateway/account-handlers";
import { parseCadToCents } from "../ledger/money";
import { consumeRateLimit } from "./rate-limit";

/**
 * `PUT /api/account/balance-alert { enabled, thresholdCad }` : alerte de solde bas de l'organisation de la session
 * (seuil en dollars canadiens). Seul le propriétaire la règle (comme les clés et les achats) ; contrôle d'origine
 * (CSRF) ; 20 appels par minute et par utilisateur. Le courriel part du worker (`billing.balance-alerts`).
 */

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

/** Plafond du seuil : un million de dollars (au-delà, c'est une faute de frappe). */
const MAX_THRESHOLD_CENTS = 100_000_000;

const schema = z
  .object({
    enabled: z.boolean(),
    thresholdCad: z.string().trim().min(1).max(14),
  })
  .strict();

export async function handleSetBalanceAlert(
  request: Request,
  deps: AccountKeysDeps,
): Promise<Response> {
  try {
    if (!isSameOriginRequest(request, deps.siteUrl))
      return json({ error: "invalid_origin" }, 403);
    const ctx = await deps.getContext(request.headers);
    if (!ctx) return json({ error: "unauthenticated" }, 401);
    if (ctx.role !== "owner") return json({ error: "forbidden" }, 403);
    const limit = await consumeRateLimit(
      deps.db(),
      `acct-balance-alert:${ctx.userId}`,
      { limit: 20, windowSeconds: 60, now: deps.now() },
    );
    if (!limit.allowed)
      return Response.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            "retry-after": String(limit.retryAfterSeconds),
          },
        },
      );
    let parsed: z.infer<typeof schema>;
    try {
      const result = schema.safeParse(await request.json());
      if (!result.success) return json({ error: "invalid_request" }, 422);
      parsed = result.data;
    } catch {
      return json({ error: "invalid_json" }, 422);
    }
    const cents = parseCadToCents(parsed.thresholdCad);
    if (cents === null || cents <= 0 || cents > MAX_THRESHOLD_CENTS)
      return json({ error: "invalid_threshold" }, 422);
    await setBalanceAlert(deps.db(), ctx.organizationId, {
      enabled: parsed.enabled,
      thresholdMicro: BigInt(cents) * 10_000n,
      updatedBy: ctx.userId,
    });
    deps.log.info("alerte de solde réglée", {
      organizationId: ctx.organizationId,
      enabled: parsed.enabled,
    });
    return json({
      enabled: parsed.enabled,
      thresholdMicro: String(BigInt(cents) * 10_000n),
    });
  } catch (error) {
    deps.log.error("alerte de solde : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}
