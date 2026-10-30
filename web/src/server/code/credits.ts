import { type Database, eq, organizations } from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { OrgEntitlements } from "../billing/entitlements";
import { consumeRateLimit } from "../billing/rate-limit";
import { authenticateApiKey } from "../gateway/keys";
import { addressKey, errorJson, json, methodNotAllowed } from "./http";

/**
 * `GET /api/code/credits` : solde de crédits lu par le CLI (barre d'état, `nexora-code credits`). Authentification par
 * la clé `nxk_` elle-même (`Authorization: Bearer`). Le CLI interroge toutes les 60 secondes : la limite par clé est
 * large mais finie. Contrat : `docs/nexora-code.md` § 1.
 */

type Limit = { limit: number; windowSeconds: number };

export interface CreditsDeps {
  db: () => Database;
  now: () => Date;
  log: Logger;
  entitlements: (
    db: Database,
    organizationId: string,
    now: Date,
  ) => Promise<OrgEntitlements>;
  limits?: { perKey?: Limit; perAddress?: Limit };
}

export async function handleCodeCredits(
  request: Request,
  deps: CreditsDeps,
): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const db = deps.db();
  const now = deps.now();
  try {
    const byAddress = await consumeRateLimit(
      db,
      `code-credits-ip:${addressKey(request)}`,
      {
        ...(deps.limits?.perAddress ?? { limit: 300, windowSeconds: 60 }),
        now,
      },
    );
    if (!byAddress.allowed)
      return errorJson(429, "rate_limited", "Trop de demandes.", {
        "retry-after": String(byAddress.retryAfterSeconds),
      });

    const auth = await authenticateApiKey(
      db,
      request.headers.get("authorization"),
      now,
    );
    // Clé absente, inconnue, révoquée ou expirée : une seule réponse (pas de renseignement sur l'état d'une clé).
    if (!auth.ok)
      return errorJson(
        401,
        "invalid_api_key",
        "Clé API invalide ou révoquée.",
        {
          "www-authenticate": 'Bearer realm="nexora"',
        },
      );

    const byKey = await consumeRateLimit(
      db,
      `code-credits-key:${auth.key.id}`,
      {
        ...(deps.limits?.perKey ?? { limit: 120, windowSeconds: 60 }),
        now,
      },
    );
    if (!byKey.allowed)
      return errorJson(429, "rate_limited", "Trop de demandes.", {
        "retry-after": String(byKey.retryAfterSeconds),
      });

    const orgId = auth.key.organizationId;
    const [entitlements, [org]] = await Promise.all([
      deps.entitlements(db, orgId, now),
      db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId)),
    ]);
    return json({
      credits: entitlements.credits,
      can_use_models: entitlements.canUseModels,
      plan_code: entitlements.planCode,
      organization_name: org?.name ?? null,
    });
  } catch (error) {
    deps.log.error("crédits Nexora Code : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return errorJson(503, "unavailable", "Service indisponible. Réessayez.", {
      "retry-after": "5",
    });
  }
}
