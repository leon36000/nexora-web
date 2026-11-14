import {
  and,
  apiKeys,
  count,
  creditAccounts,
  type Database,
  type DeviceGrantProduct,
  type DeviceGrantScopes,
  desc,
  eq,
  gatewayDeviceGrants,
  inArray,
  isNull,
  or,
  sql,
  users,
  WEBPILOT_OPERATIONS,
  type WebpilotOperation,
} from "@nexora/db";
import { isActiveStaff } from "../auth/guards";
import {
  ApiKeyInputError,
  ApiKeyLimitError,
  type ApiKeySummary,
  type CreateApiKeyInput,
  createApiKey,
  MAX_ACTIVE_KEYS_PER_ORGANIZATION,
} from "./keys";

export const DEFAULT_GRANT_TTL_DAYS = 90;
export const MAX_GRANT_TTL_DAYS = 365;
export const DEFAULT_ROTATE_AFTER_DAYS = 30;
export const ROTATION_GRACE_MS = 5 * 60 * 1000;
export const MAX_ACTIVE_DEVICE_GRANTS_PER_ORG = 25;
const DAY_MS = 86_400_000;

export function normalizeDeviceGrantProduct(
  raw?: string | null,
): DeviceGrantProduct | null {
  switch (raw?.trim()) {
    case null:
    case undefined:
    case "":
    case "lifecode":
    case "lifecode-desktop":
    case "lifecode-cli":
    case "nexora-lifecode-cli":
    case "lifecode-mobile":
    case "lifecode-web":
      return "lifecode";
    case "creative-studio":
    case "creative-studio-desktop":
      return "creative-studio";
    case "workstudio":
    case "workstudio-desktop":
      return "workstudio";
    case "webpilot":
      return "webpilot";
    default:
      return null;
  }
}

export type DeviceGrantErrorStatus =
  | 400
  | 401
  | 402
  | 403
  | 404
  | 409
  | 422
  | 429;

export class DeviceGrantError extends Error {
  constructor(
    public readonly status: DeviceGrantErrorStatus,
    public readonly code: string,
    public readonly messageFr: string,
    public readonly messageEn: string,
  ) {
    super(messageFr);
    this.name = "DeviceGrantError";
  }
}

const ERRORS = {
  invalid_request: [
    400,
    "Requête invalide. Vérifiez les champs de l'appareil.",
    "Invalid request. Check the device parameters.",
  ],
  api_key_revoked: [
    401,
    "Cet accès d'appareil a été révoqué.",
    "This device grant has been revoked.",
  ],
  api_key_expired: [
    401,
    "Cet accès d'appareil a expiré.",
    "This device grant has expired.",
  ],
  account_blocked: [
    402,
    "Le compte de facturation est bloqué (solde débiteur). Rechargez votre compte pour continuer.",
    "The billing account is blocked (negative balance). Add funds to continue.",
  ],
  credits_required: [
    402,
    "Votre solde de crédits est vide. Ajoutez des crédits dans votre espace client.",
    "Your credit balance is empty. Add credits in your customer portal.",
  ],
  email_unverified: [
    403,
    "Votre adresse courriel doit être vérifiée avant de connecter un appareil.",
    "Your email address must be verified before connecting a device.",
  ],
  two_factor_required: [
    403,
    "La double authentification est obligatoire pour les comptes du personnel.",
    "Two-factor authentication is mandatory for staff accounts.",
  ],
  product_not_allowed: [
    403,
    "Ce produit n'est pas autorisé à demander un accès d'appareil.",
    "This product is not allowed to request a device grant.",
  ],
  cross_device_forbidden: [
    403,
    "Cette clé d'appareil ne peut pas modifier un autre appareil.",
    "This device key cannot modify another device.",
  ],
  grant_not_found: [
    404,
    "Accès d'appareil introuvable.",
    "Device grant not found.",
  ],
  key_limit: [
    409,
    "La limite de clés API actives de l'organisation est atteinte.",
    "The organization's active API key limit has been reached.",
  ],
  too_many_devices: [
    429,
    "Nombre maximal d'appareils actifs atteint pour cette organisation.",
    "Maximum number of active devices reached for this organization.",
  ],
} as const satisfies Record<
  string,
  readonly [DeviceGrantErrorStatus, string, string]
>;

export type DeviceGrantErrorCode = keyof typeof ERRORS;

function fail(code: DeviceGrantErrorCode): never {
  const [status, fr, en] = ERRORS[code];
  throw new DeviceGrantError(status, code, fr, en);
}

export interface DeviceGrantSummary {
  grant_id: string;
  organization_id: string;
  device_id: string;
  device_label: string;
  label: string;
  product: DeviceGrantProduct;
  key_prefix: string;
  scopes: { models: string[]; webpilot: string[] };
  spend_cap_cad: number | null;
  spend_cap_micro: number;
  issued_at: string;
  expires_at: string;
  rotate_after: string;
  grace_expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface DeviceGrantIssued extends DeviceGrantSummary {
  key: string;
}

type GrantRow = typeof gatewayDeviceGrants.$inferSelect;
type KeyPick = Pick<
  ApiKeySummary,
  | "name"
  | "prefix"
  | "allowedModels"
  | "webpilotOperations"
  | "spendCapMicro"
  | "lastUsedAt"
>;
type GrantWithKey = { grant: GrantRow; apiKey: typeof apiKeys.$inferSelect };

function summary(grant: GrantRow, key: KeyPick): DeviceGrantSummary {
  return {
    grant_id: grant.id,
    organization_id: grant.organizationId,
    device_id: grant.deviceId,
    device_label: grant.deviceLabel,
    label: grant.deviceLabel,
    product: grant.product,
    key_prefix: key.prefix,
    scopes: {
      models: key.allowedModels === null ? ["*"] : [...key.allowedModels],
      webpilot: key.webpilotOperations ? [...key.webpilotOperations] : [],
    },
    spend_cap_cad:
      key.spendCapMicro === null ? null : Number(key.spendCapMicro) / 1_000_000,
    spend_cap_micro:
      key.spendCapMicro === null ? 0 : Number(key.spendCapMicro),
    issued_at: grant.issuedAt.toISOString(),
    expires_at: grant.expiresAt.toISOString(),
    rotate_after: grant.rotateAfter.toISOString(),
    grace_expires_at: grant.graceExpiresAt?.toISOString() ?? null,
    last_used_at: key.lastUsedAt?.toISOString() ?? null,
    revoked_at: grant.revokedAt?.toISOString() ?? null,
    revoke_reason: grant.revokeReason,
  };
}

function checkedNow(now?: Date): Date {
  const date = now ?? new Date();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
    fail("invalid_request");
  return date;
}

function nextRotation(now: Date, expiresAt: Date): Date {
  const time = now.getTime();
  return new Date(
    Math.min(
      expiresAt.getTime(),
      time +
        Math.min(
          DEFAULT_ROTATE_AFTER_DAYS * DAY_MS,
          Math.floor((expiresAt.getTime() - time) / 2),
        ),
    ),
  );
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sérialise les mutations de tous les grants d'une organisation, y compris leur décompte. */
async function lockOrganization(
  db: Database,
  organizationId: string,
): Promise<void> {
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`device-grants:${organizationId}`}))`,
  );
}

async function checkAccount(
  db: Database,
  organizationId: string,
  requirePositiveBalance = false,
): Promise<void> {
  const [account] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.organizationId, organizationId))
    .for("update");
  const balance = account ? account.balanceMicro - account.heldMicro : 0n;
  if ((account?.balanceMicro ?? 0n) < 0n) fail("account_blocked");
  if (requirePositiveBalance && balance <= 0n) fail("credits_required");
}

async function issueKey(
  db: Database,
  input: CreateApiKeyInput,
  enforceLimit = true,
): Promise<{ key: string; record: ApiKeySummary }> {
  try {
    return await createApiKey(
      db,
      enforceLimit
        ? { ...input, maxActiveKeys: MAX_ACTIVE_KEYS_PER_ORGANIZATION }
        : input,
    );
  } catch (error) {
    if (error instanceof ApiKeyLimitError) fail("key_limit");
    if (error instanceof ApiKeyInputError) fail("invalid_request");
    throw error;
  }
}

async function revokeKeys(
  db: Database,
  organizationId: string,
  ids: (string | null)[],
  now: Date,
): Promise<void> {
  const present = [...new Set(ids.filter((id): id is string => id !== null))];
  if (present.length === 0) return;
  await db
    .update(apiKeys)
    .set({ revokedAt: now })
    .where(
      and(
        eq(apiKeys.organizationId, organizationId),
        inArray(apiKeys.id, present),
        isNull(apiKeys.revokedAt),
      ),
    );
}

async function readGrant(
  db: Database,
  organizationId: string,
  grantId: string,
): Promise<GrantWithKey | null> {
  if (!UUID_RE.test(grantId)) return null;
  const [row] = await db
    .select({ grant: gatewayDeviceGrants, apiKey: apiKeys })
    .from(gatewayDeviceGrants)
    .innerJoin(apiKeys, eq(apiKeys.id, gatewayDeviceGrants.apiKeyId))
    .where(
      and(
        eq(gatewayDeviceGrants.organizationId, organizationId),
        eq(gatewayDeviceGrants.id, grantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createDeviceGrant(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    deviceId: string;
    deviceLabel: string;
    product?: string | null;
    scopes?: {
      models?: string[];
      webpilot?: string[];
      daily_cap_micros?: number;
    };
    spendCapCad?: number | null;
    ttlDays?: number;
    requirePositiveBalance?: boolean;
    now?: Date;
  },
): Promise<DeviceGrantIssued> {
  const now = checkedNow(input.now);
  const product = normalizeDeviceGrantProduct(input.product);
  if (!product) fail("product_not_allowed");
  if (
    !nonempty(input.organizationId) ||
    !nonempty(input.userId) ||
    !nonempty(input.deviceId) ||
    !nonempty(input.deviceLabel)
  ) {
    fail("invalid_request");
  }
  const deviceId = input.deviceId.trim();
  const deviceLabel = input.deviceLabel.trim();
  if (deviceId.length > 255 || deviceLabel.length > 255)
    fail("invalid_request");

  const ttl = input.ttlDays ?? DEFAULT_GRANT_TTL_DAYS;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_GRANT_TTL_DAYS)
    fail("invalid_request");
  const expiresAt = new Date(now.getTime() + ttl * DAY_MS);
  if (!Number.isFinite(expiresAt.getTime())) fail("invalid_request");

  const models = input.scopes?.models;
  const webpilot = input.scopes?.webpilot;
  if (
    (models !== undefined &&
      (!Array.isArray(models) ||
        models.some(
          (m) => typeof m !== "string" || !m.trim() || m.length > 120,
        ))) ||
    (webpilot !== undefined &&
      (!Array.isArray(webpilot) ||
        webpilot.some((op) => typeof op !== "string")))
  ) {
    fail("invalid_request");
  }
  const allowedModels =
    models === undefined || models.includes("*")
      ? null
      : [...new Set(models.map((m) => m.trim()))];
  if (allowedModels && allowedModels.length > 200) fail("invalid_request");

  const operations = [
    ...new Set(
      (webpilot ?? []).filter((op): op is WebpilotOperation =>
        (WEBPILOT_OPERATIONS as readonly string[]).includes(op),
      ),
    ),
  ];

  let cap: bigint | null = null;
  if (input.spendCapCad != null) {
    if (
      typeof input.spendCapCad !== "number" ||
      !Number.isFinite(input.spendCapCad) ||
      input.spendCapCad < 0
    ) {
      fail("invalid_request");
    }
    if (input.spendCapCad > 0) {
      const micros = Math.round(input.spendCapCad * 1_000_000);
      if (!Number.isSafeInteger(micros) || micros <= 0) fail("invalid_request");
      cap = BigInt(micros);
    }
  } else if (input.scopes?.daily_cap_micros !== undefined) {
    const micros = input.scopes.daily_cap_micros;
    if (!Number.isSafeInteger(micros) || micros <= 0) fail("invalid_request");
    cap = BigInt(micros);
  }

  const scopes: DeviceGrantScopes & { webpilot: string[] } = {
    models: allowedModels ?? ["*"],
    webpilot: operations,
    ...(cap !== null ? { daily_cap_micros: Number(cap) } : {}),
  };

  return db.transaction(async (tx) => {
    const d = tx as unknown as Database;
    await lockOrganization(d, input.organizationId);
    const [user] = await d
      .select()
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!user) fail("invalid_request");
    if (user.emailVerified !== true) fail("email_unverified");
    if (
      (await isActiveStaff(d, input.userId)) &&
      user.twoFactorEnabled !== true
    )
      fail("two_factor_required");
    await checkAccount(d, input.organizationId, input.requirePositiveBalance);

    const replaced = await d
      .update(gatewayDeviceGrants)
      .set({
        revokedAt: now,
        revokeReason: "replaced_by_relogin",
        updatedAt: now,
      })
      .where(
        and(
          eq(gatewayDeviceGrants.organizationId, input.organizationId),
          eq(gatewayDeviceGrants.deviceId, deviceId),
          eq(gatewayDeviceGrants.product, product),
          isNull(gatewayDeviceGrants.revokedAt),
        ),
      )
      .returning();
    await revokeKeys(
      d,
      input.organizationId,
      replaced.flatMap((g) => [g.apiKeyId, g.previousApiKeyId]),
      now,
    );

    const [active] = await d
      .select({ n: count() })
      .from(gatewayDeviceGrants)
      .where(
        and(
          eq(gatewayDeviceGrants.organizationId, input.organizationId),
          isNull(gatewayDeviceGrants.revokedAt),
        ),
      );
    if ((active?.n ?? 0) >= MAX_ACTIVE_DEVICE_GRANTS_PER_ORG)
      fail("too_many_devices");

    const created = await issueKey(d, {
      organizationId: input.organizationId,
      name: `${product}:${deviceLabel}`.slice(0, 80),
      allowedModels,
      webpilotOperations: operations.length ? operations : null,
      spendCapMicro: cap,
      expiresAt,
      createdBy: input.userId,
      now,
    });
    const [grant] = await d
      .insert(gatewayDeviceGrants)
      .values({
        organizationId: input.organizationId,
        createdByUserId: input.userId,
        apiKeyId: created.record.id,
        deviceId,
        deviceLabel,
        product,
        scopes,
        issuedAt: now,
        expiresAt,
        rotateAfter: nextRotation(now, expiresAt),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!grant) throw new Error("Accès d'appareil non créé");
    return { ...summary(grant, created.record), key: created.key };
  });
}

export async function rotateDeviceGrant(
  db: Database,
  input: {
    organizationId: string;
    grantId: string;
    actingApiKeyId?: string | null;
    userId?: string | null;
    now?: Date;
  },
): Promise<DeviceGrantIssued> {
  const now = checkedNow(input.now);
  return db.transaction(async (tx) => {
    const d = tx as unknown as Database;
    await lockOrganization(d, input.organizationId);
    const row = await readGrant(d, input.organizationId, input.grantId);
    if (!row) fail("grant_not_found");
    const { grant, apiKey } = row;
    if (
      input.actingApiKeyId != null &&
      grant.apiKeyId !== input.actingApiKeyId
    ) {
      fail("cross_device_forbidden");
    }
    if (grant.revokedAt !== null) fail("api_key_revoked");
    if (grant.expiresAt <= now) fail("api_key_expired");
    if (now < grant.issuedAt) fail("invalid_request");
    await checkAccount(d, input.organizationId);

    await d.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`api-keys:${input.organizationId}`}))`,
    );
    await revokeKeys(d, input.organizationId, [grant.previousApiKeyId], now);
    const graceExpiresAt = new Date(
      Math.min(grant.expiresAt.getTime(), now.getTime() + ROTATION_GRACE_MS),
    );
    await d
      .update(apiKeys)
      .set({ expiresAt: graceExpiresAt })
      .where(
        and(
          eq(apiKeys.organizationId, input.organizationId),
          eq(apiKeys.id, grant.apiKeyId),
        ),
      );
    const created = await issueKey(
      d,
      {
        organizationId: input.organizationId,
        name: apiKey.name,
        allowedModels: apiKey.allowedModels,
        webpilotOperations: apiKey.webpilotOperations as
          | WebpilotOperation[]
          | null,
        ragAccess: apiKey.ragAccess,
        spendCapMicro: apiKey.spendCapMicro,
        rpmLimit: apiKey.rpmLimit,
        tpmLimit: apiKey.tpmLimit,
        expiresAt: grant.expiresAt,
        createdBy: input.userId ?? grant.createdByUserId,
        now,
      },
      false,
    );
    const [updated] = await d
      .update(gatewayDeviceGrants)
      .set({
        apiKeyId: created.record.id,
        previousApiKeyId: grant.apiKeyId,
        graceExpiresAt,
        rotateAfter: nextRotation(now, grant.expiresAt),
        updatedAt: now,
      })
      .where(eq(gatewayDeviceGrants.id, grant.id))
      .returning();
    if (!updated) throw new Error("Accès d'appareil non mis à jour");
    return { ...summary(updated, created.record), key: created.key };
  });
}

export async function listDeviceGrants(
  db: Database,
  input: {
    organizationId: string;
    includeRevoked?: boolean;
  },
): Promise<DeviceGrantSummary[]> {
  const condition = input.includeRevoked
    ? eq(gatewayDeviceGrants.organizationId, input.organizationId)
    : and(
        eq(gatewayDeviceGrants.organizationId, input.organizationId),
        isNull(gatewayDeviceGrants.revokedAt),
      );
  const rows = await db
    .select({ grant: gatewayDeviceGrants, apiKey: apiKeys })
    .from(gatewayDeviceGrants)
    .innerJoin(apiKeys, eq(apiKeys.id, gatewayDeviceGrants.apiKeyId))
    .where(condition)
    .orderBy(desc(gatewayDeviceGrants.createdAt));
  return rows.map(({ grant, apiKey }) => summary(grant, apiKey));
}

export async function getDeviceGrant(
  db: Database,
  input: {
    organizationId: string;
    grantId: string;
  },
): Promise<DeviceGrantSummary | null> {
  const row = await readGrant(db, input.organizationId, input.grantId);
  return row ? summary(row.grant, row.apiKey) : null;
}

export async function findGrantByApiKeyId(
  db: Database,
  apiKeyId: string,
): Promise<{
  id: string;
  organizationId: string;
  revokedAt: Date | null;
  expiresAt: Date;
} | null> {
  if (!UUID_RE.test(apiKeyId)) return null;
  const [row] = await db
    .select({
      id: gatewayDeviceGrants.id,
      organizationId: gatewayDeviceGrants.organizationId,
      revokedAt: gatewayDeviceGrants.revokedAt,
      expiresAt: gatewayDeviceGrants.expiresAt,
    })
    .from(gatewayDeviceGrants)
    .where(
      or(
        eq(gatewayDeviceGrants.apiKeyId, apiKeyId),
        eq(gatewayDeviceGrants.previousApiKeyId, apiKeyId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function revokeDeviceGrant(
  db: Database,
  input: {
    organizationId: string;
    grantId: string;
    actingApiKeyId?: string | null;
    reason?: string;
    now?: Date;
  },
): Promise<{ revoked: boolean; grantId: string }> {
  const now = checkedNow(input.now);
  return db.transaction(async (tx) => {
    const d = tx as unknown as Database;
    await lockOrganization(d, input.organizationId);
    const row = await readGrant(d, input.organizationId, input.grantId);
    if (!row) fail("grant_not_found");
    const { grant } = row;
    if (
      input.actingApiKeyId != null &&
      grant.apiKeyId !== input.actingApiKeyId &&
      grant.previousApiKeyId !== input.actingApiKeyId
    ) {
      fail("cross_device_forbidden");
    }
    if (grant.revokedAt === null) {
      await d
        .update(gatewayDeviceGrants)
        .set({
          revokedAt: now,
          revokeReason: input.reason ?? "revoked",
          updatedAt: now,
        })
        .where(eq(gatewayDeviceGrants.id, grant.id));
    }
    await revokeKeys(
      d,
      input.organizationId,
      [grant.apiKeyId, grant.previousApiKeyId],
      now,
    );
    return { revoked: true, grantId: grant.id };
  });
}

export async function revokeAllDeviceGrants(
  db: Database,
  input: {
    organizationId: string;
    reason?: string;
    now?: Date;
  },
): Promise<{ revokedCount: number }> {
  const now = checkedNow(input.now);
  return db.transaction(async (tx) => {
    const d = tx as unknown as Database;
    await lockOrganization(d, input.organizationId);
    const revoked = await d
      .update(gatewayDeviceGrants)
      .set({
        revokedAt: now,
        revokeReason: input.reason ?? "revoked_all",
        updatedAt: now,
      })
      .where(
        and(
          eq(gatewayDeviceGrants.organizationId, input.organizationId),
          isNull(gatewayDeviceGrants.revokedAt),
        ),
      )
      .returning();
    await revokeKeys(
      d,
      input.organizationId,
      revoked.flatMap((g) => [g.apiKeyId, g.previousApiKeyId]),
      now,
    );
    return { revokedCount: revoked.length };
  });
}
