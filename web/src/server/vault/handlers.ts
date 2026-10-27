import { type Database, VAULT_KINDS } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { z } from "zod";
import { checkAdminAuth } from "../auth";
import { type Keyring, VaultError } from "./crypto";
import { listSecrets, putSecret, revokeSecret } from "./store";

/** Dépendances injectées : les tests fournissent une base jetable, les routes celles de l'environnement. */
export interface VaultDeps {
  db: () => Database;
  adminToken: string | undefined;
  keyring: () => Keyring;
  log: Logger;
}

export const REF_PATTERN = /^[a-z0-9._-]{3,64}$/;
const MAX_BODY_CHARS = 16_384;

const refSchema = z.string().regex(REF_PATTERN);
const postBodySchema = z
  .object({
    ref: refSchema,
    value: z.string().min(1).max(4096),
    kind: z.enum(VAULT_KINDS),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" };
const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...NO_STORE, ...extra } });

const unauthorized = () =>
  json({ error: "unauthorized" }, 401, {
    "www-authenticate": 'Bearer realm="nexora-admin"',
  });

/** Renvoie une réponse d'échec d'authentification, ou null si la requête est autorisée. */
function authenticate(request: Request, deps: VaultDeps): Response | null {
  const result = checkAdminAuth(request, deps.adminToken);
  if (result === "ok") return null;
  if (result === "not_configured")
    return json({ error: "admin_not_configured" }, 503);
  return unauthorized();
}

/** Traduit une erreur en réponse. Seuls le nom et le code sont journalisés : jamais message, valeur ni requête SQL. */
function failure(error: unknown, route: string, deps: VaultDeps): Response {
  if (error instanceof VaultError && error.code === "not_configured") {
    deps.log.error("vault : configuration invalide", {
      route,
      code: error.code,
    });
    return json({ error: "vault_unavailable" }, 503);
  }
  const pgCode =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
  deps.log.error("vault : erreur interne", {
    route,
    errorName: error instanceof Error ? error.name : typeof error,
    code: pgCode,
  });
  return json({ error: "internal_error" }, 500);
}

function invalid(
  issues: z.core.$ZodIssue[] | undefined,
  code = "invalid_request",
) {
  return json(
    {
      error: code,
      issues: (issues ?? []).map((i) => ({
        path: i.path.join("."),
        code: i.code,
      })),
    },
    422,
  );
}

/** POST /api/admin/vault : { ref, value, kind } → { ref, last4, kind, updatedAt }. */
export async function handlePost(
  request: Request,
  deps: VaultDeps,
): Promise<Response> {
  const denied = authenticate(request, deps);
  if (denied) return denied;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS)
      return json({ error: "payload_too_large" }, 413);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return invalid(undefined, "invalid_json");
    }
    const parsed = postBodySchema.safeParse(parsedJson);
    if (!parsed.success) return invalid(parsed.error.issues);

    const keyring = deps.keyring();
    const saved = await putSecret(deps.db(), keyring, parsed.data);
    deps.log.info("vault : secret enregistré", {
      ref: saved.ref,
      kind: saved.kind,
    });
    return json({
      ref: saved.ref,
      last4: saved.last4,
      kind: saved.kind,
      updatedAt: saved.updatedAt.toISOString(),
    });
  } catch (error) {
    return failure(error, "POST /api/admin/vault", deps);
  }
}

/** GET /api/admin/vault : liste sans valeur. */
export async function handleList(
  request: Request,
  deps: VaultDeps,
): Promise<Response> {
  const denied = authenticate(request, deps);
  if (denied) return denied;
  try {
    const rows = await listSecrets(deps.db());
    return json({
      secrets: rows.map((r) => ({
        ref: r.ref,
        kind: r.kind,
        last4: r.last4,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      })),
    });
  } catch (error) {
    return failure(error, "GET /api/admin/vault", deps);
  }
}

/** DELETE /api/admin/vault/[ref] : révocation (idempotente). */
export async function handleRevoke(
  request: Request,
  ref: string,
  deps: VaultDeps,
): Promise<Response> {
  const denied = authenticate(request, deps);
  if (denied) return denied;
  if (!refSchema.safeParse(ref).success)
    return invalid([
      { code: "invalid_format", path: ["ref"] } as z.core.$ZodIssue,
    ]);
  try {
    const revoked = await revokeSecret(deps.db(), ref);
    if (!revoked) return json({ error: "not_found" }, 404);
    deps.log.info("vault : secret révoqué", { ref });
    return json({
      ref: revoked.ref,
      revokedAt: revoked.revokedAt.toISOString(),
    });
  } catch (error) {
    return failure(error, "DELETE /api/admin/vault/[ref]", deps);
  }
}
