import { createHash, randomBytes } from "node:crypto";
import {
  and,
  apiKeys as apiKeysTable,
  count,
  type Database,
  desc,
  eq,
  gt,
  isNull,
  or,
  sql,
} from "@nexora/db";

/**
 * Clés clientes de la passerelle (D1) : 256 bits aléatoires encodés en base64url, préfixées `nxk_`.
 * Seule l'empreinte SHA-256 est conservée ; la valeur n'est affichée qu'à la création. Une clé de
 * 256 bits aléatoires n'a pas besoin d'un hachage lent : l'empreinte n'est pas devinable.
 */

export const KEY_PREFIX = "nxk_";
const DISPLAY_PREFIX_LENGTH = 11;

export type ApiKeyRow = typeof apiKeysTable.$inferSelect;
/** Ce que la liste du compte voit d'une clé : jamais l'empreinte. */
export type ApiKeySummary = Omit<ApiKeyRow, "keyHash">;

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function generateApiKey(): {
  key: string;
  prefix: string;
  hash: string;
} {
  const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    key,
    prefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
    hash: hashApiKey(key),
  };
}

export class ApiKeyInputError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`clé API : ${field} invalide`);
    this.name = "ApiKeyInputError";
    this.field = field;
  }
}

/** Plafond de clés actives (non révoquées, non expirées) par organisation : les limites RPM/TPM étant par clé, sans plafond elles se contournent en multipliant les clés. */
export const MAX_ACTIVE_KEYS_PER_ORGANIZATION = 25;

export class ApiKeyLimitError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`clé API : plafond de ${limit} clés actives atteint`);
    this.name = "ApiKeyLimitError";
    this.limit = limit;
  }
}

export interface CreateApiKeyInput {
  organizationId: string;
  name: string;
  allowedModels?: string[] | null;
  spendCapMicro?: bigint | null;
  rpmLimit?: number | null;
  tpmLimit?: number | null;
  expiresAt?: Date | null;
  createdBy?: string | null;
  /** Refuse (ApiKeyLimitError) si l'organisation a déjà autant de clés actives ; décompte et insertion sous verrou. */
  maxActiveKeys?: number;
}

const positiveInt = (v: number | null | undefined) =>
  v === null || v === undefined || (Number.isSafeInteger(v) && v > 0);

/** Crée une clé. `key` (la valeur) n'est renvoyée qu'ici ; il n'existe aucun moyen de la relire. */
export async function createApiKey(
  db: Database,
  input: CreateApiKeyInput,
): Promise<{ key: string; record: ApiKeySummary }> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) throw new ApiKeyInputError("name");
  if (!positiveInt(input.rpmLimit)) throw new ApiKeyInputError("rpmLimit");
  if (!positiveInt(input.tpmLimit)) throw new ApiKeyInputError("tpmLimit");
  if (
    input.spendCapMicro !== null &&
    input.spendCapMicro !== undefined &&
    input.spendCapMicro <= 0n
  )
    throw new ApiKeyInputError("spendCapMicro");
  if (
    input.allowedModels &&
    (input.allowedModels.length > 200 ||
      input.allowedModels.some((m) => typeof m !== "string" || m.length > 120))
  )
    throw new ApiKeyInputError("allowedModels");

  const { key, prefix, hash } = generateApiKey();
  const insertRow = async (d: Database) => {
    const [inserted] = await d
      .insert(apiKeysTable)
      .values({
        organizationId: input.organizationId,
        name,
        prefix,
        keyHash: hash,
        allowedModels:
          input.allowedModels && input.allowedModels.length > 0
            ? input.allowedModels
            : null,
        spendCapMicro: input.spendCapMicro ?? null,
        rpmLimit: input.rpmLimit ?? null,
        tpmLimit: input.tpmLimit ?? null,
        expiresAt: input.expiresAt ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return inserted;
  };
  const max = input.maxActiveKeys;
  const row =
    max === undefined
      ? await insertRow(db)
      : await db.transaction(async (tx) => {
          const d = tx as unknown as Database;
          // Verrou par organisation : le décompte et l'insertion ne se chevauchent pas entre requêtes simultanées.
          await d.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`api-keys:${input.organizationId}`}))`,
          );
          const [active] = await d
            .select({ n: count() })
            .from(apiKeysTable)
            .where(
              and(
                eq(apiKeysTable.organizationId, input.organizationId),
                isNull(apiKeysTable.revokedAt),
                or(
                  isNull(apiKeysTable.expiresAt),
                  gt(apiKeysTable.expiresAt, new Date()),
                ),
              ),
            );
          if ((active?.n ?? 0) >= max) throw new ApiKeyLimitError(max);
          return insertRow(d);
        });
  if (!row) throw new Error("clé non créée");
  return { key, record: summarize(row) };
}

function summarize(row: ApiKeyRow): ApiKeySummary {
  const { keyHash: _hash, ...rest } = row;
  return rest;
}

export type AuthResult =
  | { ok: true; key: ApiKeyRow }
  | {
      ok: false;
      code: "invalid_api_key" | "api_key_revoked" | "api_key_expired";
    };

// Le schéma d'autorisation est insensible à la casse (RFC 7235) ; la clé elle-même reste sensible.
const BEARER = /^[Bb][Ee][Aa][Rr][Ee][Rr]\s+(nxk_[A-Za-z0-9_-]{43})\s*$/;

/**
 * Authentifie `Authorization: Bearer nxk_…` : empreinte, révocation, expiration. Met à jour le
 * dernier usage (au plus une fois par minute, pour ne pas écrire à chaque appel).
 */
export async function authenticateApiKey(
  db: Database,
  authorization: string | null,
  now: Date = new Date(),
): Promise<AuthResult> {
  const match = BEARER.exec(authorization ?? "");
  if (!match?.[1]) return { ok: false, code: "invalid_api_key" };
  const [row] = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.keyHash, hashApiKey(match[1])));
  if (!row) return { ok: false, code: "invalid_api_key" };
  if (row.revokedAt) return { ok: false, code: "api_key_revoked" };
  if (row.expiresAt && row.expiresAt <= now)
    return { ok: false, code: "api_key_expired" };
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
    await db
      .update(apiKeysTable)
      .set({ lastUsedAt: now })
      .where(eq(apiKeysTable.id, row.id));
  }
  return { ok: true, key: row };
}

/**
 * Révoque une clé de l'organisation (effet immédiat) et renvoie sa date de révocation : celle de la
 * première révocation si elle l'était déjà. `null` si elle n'appartient pas à l'organisation.
 */
export async function revokeApiKey(
  db: Database,
  organizationId: string,
  keyId: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const [row] = await db
    .select({ id: apiKeysTable.id })
    .from(apiKeysTable)
    .where(
      and(
        eq(apiKeysTable.id, keyId),
        eq(apiKeysTable.organizationId, organizationId),
      ),
    );
  if (!row) return null;
  await db
    .update(apiKeysTable)
    .set({ revokedAt: now })
    .where(and(eq(apiKeysTable.id, keyId), isNull(apiKeysTable.revokedAt)));
  const [after] = await db
    .select({ revokedAt: apiKeysTable.revokedAt })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.id, keyId));
  return after?.revokedAt ?? now;
}

export async function listApiKeys(
  db: Database,
  organizationId: string,
): Promise<ApiKeySummary[]> {
  const rows = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.organizationId, organizationId))
    .orderBy(desc(apiKeysTable.createdAt));
  return rows.map(summarize);
}
