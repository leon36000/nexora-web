import { createHash } from "node:crypto";
import { type Database, eq, users } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { consumeRateLimit } from "../billing/rate-limit";
import { ensureModelAccess } from "../gateway/provision";
import type { Keyring } from "../vault/crypto";
import { isActiveStaff } from "./guards";
import { ensureUserOrganization } from "./organization";
import {
  type TokenIntrospection,
  WORKSTUDIO_MODEL_SCOPE,
} from "./workstudio-oidc";

/**
 * `GET /api/oauth/workstudio-access` : accès modèle PAR UTILISATEUR de WorkStudio intégré (côté tiré).
 *
 * WorkStudio présente le jeton d'accès OpenID Connect de l'utilisateur (portée `workstudio:model`, délivré au
 * client WorkStudio seulement) ; le site retrouve l'organisation de cet utilisateur, crée ou relit SA clé de la
 * passerelle (`ensureModelAccess`) et rend les trois réglages que WorkStudio lit déjà :
 * `{ url, model, key }` = `NEXORA_UPSTREAM_URL`, `NEXORA_UPSTREAM_MODEL`, `NEXORA_UPSTREAM_KEY`. Les jetons
 * consommés sont donc facturés à son portefeuille ; l'organisation « maison » est gratuite (mode de facturation
 * de l'organisation, inchangé). Réponses : jamais mises en cache ; ni la clé ni le jeton ne vont au journal.
 */

export interface WorkstudioAccessDeps {
  db: () => Database;
  keyring: () => Keyring;
  /** Introspection du jeton au nom du client WorkStudio ; `null` : fournisseur inactif. */
  introspect: ((token: string) => Promise<TokenIntrospection>) | null;
  /** Identifiant du client WorkStudio ; `null` : fournisseur inactif. */
  clientId: string | null;
  /** Passerelle (`WORKSTUDIO_GATEWAY_URL`, terminée par /v1) et modèle par défaut ; `null` : non configurée. */
  gateway: () => { url: string; model: string } | null;
  /** Développement seulement : admet une passerelle en http sur la boucle locale. */
  allowLoopback: boolean;
  /**
   * WorkStudio est un produit par abonnement : sans abonnement (ni accès « maison »), aucune clé de modèle n'est
   * rendue (403 `subscription_required`). `WORKSTUDIO_REQUIRE_SUBSCRIPTION=false` coupe l'exigence (essais).
   */
  requireSubscription: boolean;
  entitled: (
    db: Database,
    organizationId: string,
    now: Date,
  ) => Promise<boolean>;
  log: Logger;
  now: () => Date;
}

/** Une valeur d'essai de WorkStudio : au plus ceci par minute et par adresse (le serveur WorkStudio est une seule adresse). */
const IP_LIMIT = { limit: 600, windowSeconds: 60 };
/** … et par utilisateur : une lecture par connexion, pas une boucle. */
const USER_LIMIT = { limit: 30, windowSeconds: 60 };

const TOKEN_FORMAT = /^[A-Za-z0-9._~+/=-]{8,512}$/;

const BASE_HEADERS = { "cache-control": "no-store", pragma: "no-cache" };

function reply(
  body: Record<string, unknown>,
  status: number,
  extra: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...BASE_HEADERS, ...extra },
  });
}

const challenge = (parts = "") =>
  `Bearer realm="nexora"${parts ? `, ${parts}` : ""}`;

function bearerOf(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** Empreinte courte de l'adresse du client : jamais l'adresse elle-même en base ni au journal. */
function addressKey(request: Request): string {
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  return createHash("sha256").update(forwarded).digest("hex").slice(0, 16);
}

export async function handleWorkstudioAccess(
  request: Request,
  deps: WorkstudioAccessDeps,
): Promise<Response> {
  if (request.method !== "GET")
    return reply({ error: "method_not_allowed" }, 405, { allow: "GET" });
  if (!deps.clientId || !deps.introspect)
    return reply({ error: "not_found" }, 404);

  const token = bearerOf(request);
  if (!token)
    return reply({ error: "invalid_token" }, 401, {
      "www-authenticate": challenge(),
    });
  const invalid = () =>
    reply({ error: "invalid_token" }, 401, {
      "www-authenticate": challenge('error="invalid_token"'),
    });
  if (!TOKEN_FORMAT.test(token)) return invalid();

  const db = deps.db();
  const now = deps.now();

  const byAddress = await consumeRateLimit(
    db,
    `ws-access-ip:${addressKey(request)}`,
    { ...IP_LIMIT, now },
  );
  if (!byAddress.allowed)
    return reply({ error: "rate_limited" }, 429, {
      "retry-after": String(byAddress.retryAfterSeconds),
    });

  let introspection: TokenIntrospection;
  try {
    introspection = await deps.introspect(token);
  } catch (error) {
    deps.log.error("workstudio-access : introspection impossible", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return reply({ error: "unavailable" }, 503, { "retry-after": "5" });
  }
  // Seul le jeton délivré au client WorkStudio ouvre cette route (le paquet le vérifie déjà ; on le revérifie).
  if (
    !introspection.active ||
    !introspection.userId ||
    introspection.clientId !== deps.clientId
  ) {
    deps.log.warn("workstudio-access : jeton refusé", { reason: "inactive" });
    return invalid();
  }
  if (!introspection.scopes.includes(WORKSTUDIO_MODEL_SCOPE)) {
    deps.log.warn("workstudio-access : portée manquante", {
      reason: "insufficient_scope",
    });
    return reply({ error: "insufficient_scope" }, 403, {
      "www-authenticate": challenge(
        `error="insufficient_scope", scope="${WORKSTUDIO_MODEL_SCOPE}"`,
      ),
    });
  }

  const userId = introspection.userId;
  const [user] = await db
    .select({
      id: users.id,
      emailVerified: users.emailVerified,
      twoFactor: users.twoFactorEnabled,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return invalid();
  if (!user.emailVerified) return reply({ error: "email_not_verified" }, 403);
  // Même règle que partout sur le site : un compte du personnel sans double authentification n'obtient rien.
  if ((await isActiveStaff(db, userId)) && !user.twoFactor) {
    deps.log.warn("workstudio-access : double authentification requise", {
      userId,
    });
    return reply({ error: "two_factor_required" }, 403);
  }

  const byUser = await consumeRateLimit(db, `ws-access-user:${userId}`, {
    ...USER_LIMIT,
    now,
  });
  if (!byUser.allowed)
    return reply({ error: "rate_limited" }, 429, {
      "retry-after": String(byUser.retryAfterSeconds),
    });

  const gateway = deps.gateway();
  if (!gateway) return reply({ error: "gateway_not_configured" }, 503);

  try {
    const organization = await ensureUserOrganization(db, userId);
    if (
      deps.requireSubscription &&
      !(await deps.entitled(db, organization.id, now))
    ) {
      deps.log.warn("workstudio-access : abonnement WorkStudio requis", {
        userId,
        organizationId: organization.id,
      });
      return reply({ error: "subscription_required" }, 403);
    }
    const access = await ensureModelAccess(db, deps.keyring(), {
      organizationId: organization.id,
      gatewayUrl: gateway.url,
      defaultModel: gateway.model,
      allowLoopback: deps.allowLoopback,
      now,
    });
    // Ni la clé ni le jeton : seulement qui, quelle organisation, et si la clé vient d'être créée.
    deps.log.info("workstudio-access : accès modèle rendu", {
      userId,
      organizationId: organization.id,
      created: access.created,
    });
    return reply(
      {
        url: access.env.NEXORA_UPSTREAM_URL,
        model: access.env.NEXORA_UPSTREAM_MODEL,
        key: access.env.NEXORA_UPSTREAM_KEY,
      },
      200,
    );
  } catch (error) {
    deps.log.error("workstudio-access : accès modèle impossible", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return reply({ error: "unavailable" }, 503, { "retry-after": "5" });
  }
}
