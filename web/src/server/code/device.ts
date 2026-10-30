import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  and,
  apiKeys,
  codeDeviceCodes,
  count,
  type Database,
  eq,
  gt,
  isNull,
  lt,
  organizations,
  sql,
  users,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { isSameOriginRequest } from "../auth/origin";
import { consumeRateLimit } from "../billing/rate-limit";
import {
  ApiKeyLimitError,
  createApiKey,
  MAX_ACTIVE_KEYS_PER_ORGANIZATION,
} from "../gateway/keys";
import {
  addressKey,
  errorJson,
  json,
  methodNotAllowed,
  readJsonObject,
} from "./http";

/**
 * Connexion de l'agent de code par le compte Nexora : flux « code d'appareil » (contrat : `docs/nexora-code.md`,
 * écrit du côté du CLI dans `NEXORA.md` § 3). Trois routes publiques ou de session :
 *
 * - `start`   : sans authentification, limité par adresse ; rend le code d'appareil (secret du CLI), le code
 *               d'utilisateur (saisi par la personne) et l'adresse de la page `/code/device` ;
 * - `poll`    : sans authentification ; ne rend la clé `nxk_` qu'UNE fois (création à la remise : aucun clair au repos) ;
 * - `approve` : session du site, courriel vérifié, 2FA du personnel, contrôle d'origine (CSRF).
 *
 * Aucun code, aucune clé ne va au journal. Les codes ne sont conservés que par empreinte. Aucune écriture ne dépend
 * du solde ni du quota : la clé existe même avec 0 crédit (la passerelle refuse les appels sans crédit).
 */

export const DEVICE_TTL_SECONDS = 600;
export const DEVICE_INTERVAL_SECONDS = 5;
/** Un sondage plus rapide que ceci (ms) reçoit `slow_down` (tolérance de la gigue réseau sous l'intervalle de 5 s). */
const MIN_POLL_GAP_MS = 3500;
/** Alphabet du code d'utilisateur : ni voyelles ni 0, 1, L (aucun mot, aucune confusion de lecture). 28 symboles. */
export const USER_CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXYZ23456789";
const USER_CODE_LENGTH = 8;
const USER_CODE_PREFIX = "NXC";

export interface DeviceSession {
  userId: string;
  organizationId: string;
  emailVerified: boolean;
  /** Compte du personnel actif : la double authentification est alors obligatoire. */
  isStaff: boolean;
  twoFactorEnabled: boolean;
}

type Limit = { limit: number; windowSeconds: number };

export interface DeviceLimits {
  startPerAddress: Limit;
  startPerAddressHour: Limit;
  pollPerDevice: Limit;
  pollPerAddress: Limit;
  /** Essais de code (approbation et lecture de la page) par personne et par adresse. */
  attemptPerUser: Limit;
  attemptPerAddress: Limit;
}

export const DEFAULT_DEVICE_LIMITS: DeviceLimits = {
  startPerAddress: { limit: 10, windowSeconds: 60 },
  startPerAddressHour: { limit: 60, windowSeconds: 3600 },
  pollPerDevice: { limit: 20, windowSeconds: 60 },
  pollPerAddress: { limit: 300, windowSeconds: 60 },
  attemptPerUser: { limit: 20, windowSeconds: 60 },
  attemptPerAddress: { limit: 120, windowSeconds: 60 },
};

export interface DeviceDeps {
  db: () => Database;
  siteUrl: string;
  now: () => Date;
  log: Logger;
  /** Modèle par défaut rendu au CLI (identifiant public du catalogue). */
  defaultModel: () => string;
  /** Session du site (organisation de travail comprise) ; `null` sans session valide. */
  getContext: (headers: Headers) => Promise<DeviceSession | null>;
  limits?: Partial<DeviceLimits>;
}

const limitsOf = (deps: DeviceDeps): DeviceLimits => ({
  ...DEFAULT_DEVICE_LIMITS,
  ...deps.limits,
});

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const deviceCodeHash = (code: string) => sha256(`nxc-device:${code}`);
const userCodeHash = (normalized: string) => sha256(`nxc-user:${normalized}`);

/** Code d'utilisateur : `NXC-XXXX-XXXX`, 8 symboles tirés sans biais (≈ 38 bits). */
export function generateUserCode(): string {
  let bare = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++)
    bare += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  return `${USER_CODE_PREFIX}-${bare.slice(0, 4)}-${bare.slice(4)}`;
}

/** Forme canonique (8 symboles) d'un code tapé par la personne, ou `null` s'il est mal formé. */
export function normalizeUserCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  let bare = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (bare.length === USER_CODE_LENGTH + USER_CODE_PREFIX.length)
    bare = bare.startsWith(USER_CODE_PREFIX)
      ? bare.slice(USER_CODE_PREFIX.length)
      : bare;
  if (bare.length !== USER_CODE_LENGTH) return null;
  for (const c of bare) if (!USER_CODE_ALPHABET.includes(c)) return null;
  return bare;
}

const DEVICE_CODE_FORMAT = /^[A-Za-z0-9_-]{32,128}$/;
const CLIENT_FORMAT = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const VERSION_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;
const DEVICE_NAME_MAX = 60;

/** Nom d'appareil affichable : sans caractère de contrôle, sans chevron ni guillemet, 60 caractères au plus. */
export function cleanDeviceName(raw: unknown): string {
  const text =
    typeof raw === "string"
      ? raw
          // biome-ignore lint/suspicious/noControlCharactersInRegex: on retire justement les caractères de contrôle
          .replace(/[\u0000-\u001f\u007f-\u009f<>"'`\\]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  return (
    Array.from(text).slice(0, DEVICE_NAME_MAX).join("").trim() ||
    "Appareil sans nom"
  );
}

export const keyNameFor = (deviceName: string) => `Nexora Code (${deviceName})`;

const tooMany = (retryAfter: number) =>
  errorJson(
    429,
    "rate_limited",
    "Trop de demandes. Réessayez dans un instant.",
    {
      "retry-after": String(retryAfter),
    },
  );

/* ------------------------------------------------------------------ start */

export async function handleDeviceStart(
  request: Request,
  deps: DeviceDeps,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  try {
    const body = await readJsonObject(request);
    if (!body.ok)
      return body.status === 413
        ? errorJson(413, "payload_too_large", "Requête trop volumineuse.")
        : errorJson(400, "invalid_request", "Requête illisible.");
    const db = deps.db();
    const now = deps.now();
    const limits = limitsOf(deps);
    const who = addressKey(request);
    for (const [name, limit] of [
      ["code-device-start", limits.startPerAddress],
      ["code-device-start-h", limits.startPerAddressHour],
    ] as const) {
      const r = await consumeRateLimit(db, `${name}:${who}`, { ...limit, now });
      if (!r.allowed) return tooMany(r.retryAfterSeconds);
    }

    const client =
      typeof body.value.client === "string" &&
      CLIENT_FORMAT.test(body.value.client)
        ? body.value.client
        : "nexora-code";
    const clientVersion =
      typeof body.value.client_version === "string" &&
      VERSION_FORMAT.test(body.value.client_version)
        ? body.value.client_version
        : null;
    const deviceName = cleanDeviceName(body.value.device_name);

    // Ménage : les demandes expirées depuis plus d'un jour disparaissent (pas de table qui grossit sans fin).
    await db
      .delete(codeDeviceCodes)
      .where(
        lt(codeDeviceCodes.expiresAt, new Date(now.getTime() - 86_400_000)),
      );

    const deviceCode = randomBytes(32).toString("base64url");
    let userCode = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      userCode = generateUserCode();
      const inserted = await db
        .insert(codeDeviceCodes)
        .values({
          deviceCodeHash: deviceCodeHash(deviceCode),
          userCodeHash: userCodeHash(normalizeUserCode(userCode) as string),
          deviceName,
          client,
          clientVersion,
          expiresAt: new Date(now.getTime() + DEVICE_TTL_SECONDS * 1000),
        })
        .onConflictDoNothing({ target: codeDeviceCodes.userCodeHash })
        .returning({ id: codeDeviceCodes.id });
      if (inserted.length > 0) break;
      userCode = "";
    }
    if (!userCode)
      return errorJson(503, "unavailable", "Service indisponible. Réessayez.", {
        "retry-after": "5",
      });

    const base = deps.siteUrl.replace(/\/+$/, "");
    deps.log.info("code d'appareil demandé", { client });
    return json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${base}/code/device`,
      verification_uri_complete: `${base}/code/device?user_code=${encodeURIComponent(userCode)}`,
      expires_in: DEVICE_TTL_SECONDS,
      interval: DEVICE_INTERVAL_SECONDS,
    });
  } catch (error) {
    deps.log.error("code d'appareil : erreur interne (start)", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return errorJson(500, "internal_error", "Erreur interne.");
  }
}

/* ------------------------------------------------------------------- poll */

type PollOutcome =
  | { kind: "status"; status: "pending" | "slow_down" | "denied" | "expired" }
  | { kind: "unknown" }
  | { kind: "key_limit" }
  | {
      kind: "approved";
      apiKey: string;
      keyPrefix: string;
      organizationName: string | null;
      userEmail: string | null;
    };

export async function handleDevicePoll(
  request: Request,
  deps: DeviceDeps,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  try {
    const body = await readJsonObject(request);
    if (!body.ok)
      return errorJson(400, "invalid_device_code", "Code d'appareil invalide.");
    const code = body.value.device_code;
    if (typeof code !== "string" || !DEVICE_CODE_FORMAT.test(code))
      return errorJson(400, "invalid_device_code", "Code d'appareil invalide.");
    const db = deps.db();
    const now = deps.now();
    const limits = limitsOf(deps);
    const hash = deviceCodeHash(code);

    // Trop de sondages : `slow_down` (statut 200), jamais un 429, que le CLI traiterait comme un échec définitif.
    const byDevice = await consumeRateLimit(
      db,
      `code-device-poll:${hash.slice(0, 32)}`,
      {
        ...limits.pollPerDevice,
        now,
      },
    );
    const byAddress = await consumeRateLimit(
      db,
      `code-device-poll-ip:${addressKey(request)}`,
      { ...limits.pollPerAddress, now },
    );
    if (!byDevice.allowed || !byAddress.allowed)
      return json({ status: "slow_down" });

    const outcome = await db.transaction(async (tx): Promise<PollOutcome> => {
      const d = tx as unknown as Database;
      const [row] = await d
        .select()
        .from(codeDeviceCodes)
        .where(eq(codeDeviceCodes.deviceCodeHash, hash))
        .for("update");
      if (!row) return { kind: "unknown" };
      if (row.status === "delivered" || row.expiresAt <= now)
        return { kind: "status", status: "expired" };
      if (row.status === "denied") return { kind: "status", status: "denied" };
      if (row.status === "pending") {
        const tooFast =
          row.lastPolledAt !== null &&
          now.getTime() - row.lastPolledAt.getTime() < MIN_POLL_GAP_MS;
        await d
          .update(codeDeviceCodes)
          .set({ lastPolledAt: now })
          .where(eq(codeDeviceCodes.id, row.id));
        return { kind: "status", status: tooFast ? "slow_down" : "pending" };
      }

      // approved : la clé est créée ICI, une seule fois, et marquée remise dans la même transaction.
      if (!row.approvedUserId || !row.approvedOrganizationId)
        return { kind: "status", status: "expired" };
      const name = keyNameFor(row.deviceName);
      await d
        .update(apiKeys)
        .set({ revokedAt: now })
        .where(
          and(
            eq(apiKeys.organizationId, row.approvedOrganizationId),
            eq(apiKeys.name, name),
            eq(apiKeys.createdBy, row.approvedUserId),
            isNull(apiKeys.revokedAt),
          ),
        );
      let created: Awaited<ReturnType<typeof createApiKey>>;
      try {
        created = await createApiKey(d, {
          organizationId: row.approvedOrganizationId,
          name,
          createdBy: row.approvedUserId,
          maxActiveKeys: MAX_ACTIVE_KEYS_PER_ORGANIZATION,
        });
      } catch (error) {
        if (error instanceof ApiKeyLimitError) return { kind: "key_limit" };
        throw error;
      }
      await d
        .update(codeDeviceCodes)
        .set({
          status: "delivered",
          deliveredAt: now,
          apiKeyId: created.record.id,
          lastPolledAt: now,
        })
        .where(eq(codeDeviceCodes.id, row.id));
      const [org] = await d
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, row.approvedOrganizationId));
      const [user] = await d
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, row.approvedUserId));
      deps.log.info("clé Nexora Code remise", {
        apiKeyId: created.record.id,
        organizationId: row.approvedOrganizationId,
        userId: row.approvedUserId,
      });
      return {
        kind: "approved",
        apiKey: created.key,
        keyPrefix: created.record.prefix,
        organizationName: org?.name ?? null,
        userEmail: user?.email ?? null,
      };
    });

    switch (outcome.kind) {
      case "unknown":
        return errorJson(
          400,
          "invalid_device_code",
          "Code d'appareil invalide.",
        );
      case "key_limit":
        return errorJson(
          409,
          "key_limit",
          `Trop de clés actives dans l'organisation (${MAX_ACTIVE_KEYS_PER_ORGANIZATION}). Révoquez-en une dans « Modèles et clés », puis relancez la connexion.`,
        );
      case "status":
        return json({ status: outcome.status });
      case "approved":
        return json({
          status: "approved",
          api_key: outcome.apiKey,
          key_prefix: outcome.keyPrefix,
          organization_name: outcome.organizationName ?? undefined,
          user_email: outcome.userEmail ?? undefined,
          default_model: deps.defaultModel(),
        });
    }
  } catch (error) {
    deps.log.error("code d'appareil : erreur interne (poll)", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return errorJson(500, "internal_error", "Erreur interne.");
  }
}

/* ---------------------------------------------------------------- approve */

const INVALID_CODE = () =>
  errorJson(
    400,
    "invalid_code",
    "Ce code est invalide ou a expiré. Relancez « nexora-code login » pour en obtenir un nouveau.",
  );

/** Refus communs à l'approbation et à la lecture : courriel vérifié, 2FA du personnel. */
function sessionRefusal(session: DeviceSession): Response | null {
  if (!session.emailVerified)
    return errorJson(
      403,
      "email_not_verified",
      "Vérifiez votre courriel avant d'autoriser un appareil.",
    );
  if (session.isStaff && !session.twoFactorEnabled)
    return errorJson(
      403,
      "two_factor_required",
      "Activez la double authentification (page Sécurité) avant d'autoriser un appareil.",
    );
  return null;
}

async function attemptAllowed(
  deps: DeviceDeps,
  session: DeviceSession,
  address: string,
): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const limits = limitsOf(deps);
  const now = deps.now();
  const user = await consumeRateLimit(
    deps.db(),
    `code-device-attempt:${session.userId}`,
    { ...limits.attemptPerUser, now },
  );
  if (!user.allowed)
    return { allowed: false, retryAfter: user.retryAfterSeconds };
  const ip = await consumeRateLimit(
    deps.db(),
    `code-device-attempt-ip:${address}`,
    { ...limits.attemptPerAddress, now },
  );
  if (!ip.allowed) return { allowed: false, retryAfter: ip.retryAfterSeconds };
  return { allowed: true };
}

export async function handleDeviceApprove(
  request: Request,
  deps: DeviceDeps,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  try {
    if (!isSameOriginRequest(request, deps.siteUrl))
      return errorJson(403, "invalid_origin", "Origine refusée.");
    const session = await deps.getContext(request.headers);
    if (!session)
      return errorJson(
        401,
        "unauthenticated",
        "Connectez-vous pour continuer.",
      );
    const refusal = sessionRefusal(session);
    if (refusal) return refusal;
    const attempt = await attemptAllowed(deps, session, addressKey(request));
    if (!attempt.allowed) return tooMany(attempt.retryAfter);

    const body = await readJsonObject(request);
    if (!body.ok) return INVALID_CODE();
    const normalized = normalizeUserCode(body.value.user_code);
    if (!normalized) return INVALID_CODE();
    const deny = body.value.decision === "deny";

    const db = deps.db();
    const now = deps.now();
    const outcome = await db.transaction(async (tx) => {
      const d = tx as unknown as Database;
      const [row] = await d
        .select()
        .from(codeDeviceCodes)
        .where(
          and(
            eq(codeDeviceCodes.userCodeHash, userCodeHash(normalized)),
            eq(codeDeviceCodes.status, "pending"),
            gt(codeDeviceCodes.expiresAt, now),
          ),
        )
        .for("update");
      if (!row) return "invalid" as const;
      if (deny) {
        await d
          .update(codeDeviceCodes)
          .set({ status: "denied", approvedAt: now })
          .where(eq(codeDeviceCodes.id, row.id));
        return "denied" as const;
      }
      // Plafond de clés : refus clair tout de suite (les clés du même appareil seront renouvelées, donc non comptées).
      const [active] = await d
        .select({ n: count() })
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.organizationId, session.organizationId),
            isNull(apiKeys.revokedAt),
            sql`(${apiKeys.expiresAt} IS NULL OR ${apiKeys.expiresAt} > ${now.toISOString()}::timestamptz)`,
            sql`NOT (${apiKeys.name} = ${keyNameFor(row.deviceName)} AND ${apiKeys.createdBy} = ${session.userId})`,
          ),
        );
      if ((active?.n ?? 0) >= MAX_ACTIVE_KEYS_PER_ORGANIZATION)
        return "key_limit" as const;
      await d
        .update(codeDeviceCodes)
        .set({
          status: "approved",
          approvedUserId: session.userId,
          approvedOrganizationId: session.organizationId,
          approvedAt: now,
        })
        .where(eq(codeDeviceCodes.id, row.id));
      return "approved" as const;
    });

    if (outcome === "invalid") return INVALID_CODE();
    if (outcome === "key_limit")
      return errorJson(
        409,
        "key_limit",
        `Trop de clés actives dans l'organisation (${MAX_ACTIVE_KEYS_PER_ORGANIZATION}). Révoquez-en une dans « Modèles et clés », puis recommencez.`,
      );
    deps.log.info(
      outcome === "approved"
        ? "appareil Nexora Code autorisé"
        : "appareil Nexora Code refusé",
      { userId: session.userId, organizationId: session.organizationId },
    );
    return json({
      ok: true,
      decision: outcome === "approved" ? "approve" : "deny",
    });
  } catch (error) {
    deps.log.error("code d'appareil : erreur interne (approve)", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return errorJson(500, "internal_error", "Erreur interne.");
  }
}

/* ----------------------------------------------------------------- lookup */

export type DeviceLookup =
  | { state: "invalid" }
  | { state: "rate_limited" }
  | {
      state: "found";
      deviceName: string;
      client: string;
      clientVersion: string | null;
      expiresAt: Date;
    };

/**
 * Lecture pour la page d'approbation : le nom de l'appareil d'une demande en attente et valide. Mêmes limites d'essais
 * que l'approbation ; un code inconnu, expiré, déjà utilisé ou mal formé donne la même réponse (`invalid`).
 */
export async function lookupDeviceRequest(
  deps: DeviceDeps,
  session: DeviceSession,
  userCode: string,
  address = "page",
): Promise<DeviceLookup> {
  const attempt = await attemptAllowed(deps, session, address);
  if (!attempt.allowed) return { state: "rate_limited" };
  const normalized = normalizeUserCode(userCode);
  if (!normalized) return { state: "invalid" };
  const [row] = await deps
    .db()
    .select()
    .from(codeDeviceCodes)
    .where(
      and(
        eq(codeDeviceCodes.userCodeHash, userCodeHash(normalized)),
        eq(codeDeviceCodes.status, "pending"),
        gt(codeDeviceCodes.expiresAt, deps.now()),
      ),
    );
  if (!row) return { state: "invalid" };
  return {
    state: "found",
    deviceName: row.deviceName,
    client: row.client,
    clientVersion: row.clientVersion,
    expiresAt: row.expiresAt,
  };
}
