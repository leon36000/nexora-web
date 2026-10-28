import type { Logger } from "@nexora/log";
import type { z } from "zod";
import { checkAdminAuth } from "../auth";

/**
 * Outils HTTP communs des API d'administration de l'autogestion (`/api/admin/site-agents/*` et
 * `/api/admin/seo/*`). Même contrat d'erreur que le catalogue : `{ error: "code", message?, issues? }`.
 * Les montants (bigint) sont écrits en chaînes. Jamais de secret dans une réponse.
 */

const NO_STORE = { "cache-control": "no-store" };

export function json(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: { "content-type": "application/json", ...NO_STORE, ...extra },
    },
  );
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;
  constructor(
    status: number,
    code: string,
    extra: Record<string, unknown> = {},
  ) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  options: { optional?: boolean } = {},
): Promise<T> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new HttpError(400, "invalid_body");
  }
  if (raw.length > 65_536) throw new HttpError(413, "payload_too_large");
  let parsed: unknown = {};
  if (raw.trim() !== "" || !options.optional) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new HttpError(422, "invalid_json");
    }
  }
  const result = schema.safeParse(parsed);
  if (!result.success)
    throw new HttpError(422, "invalid_request", {
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
      })),
    });
  return result.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | undefined): v is string =>
  typeof v === "string" && UUID.test(v);
export function uuidParam(v: string | undefined): string {
  if (!isUuid(v)) throw new HttpError(404, "not_found");
  return v;
}

export function limitParam(url: URL, fallback: number, max: number): number {
  const n = Number(url.searchParams.get("limit"));
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

export interface AdminRouteDeps {
  adminToken: string | undefined;
  log: Logger;
}

/** Authentifie (401/503) puis exécute la route ; convertit `HttpError` et masque toute autre erreur (500). */
export async function runAdminRoute(
  request: Request,
  path: string[],
  deps: AdminRouteDeps,
  name: string,
  route: () => Promise<Response>,
  mapError?: (error: unknown) => Response | null,
): Promise<Response> {
  const auth = checkAdminAuth(request, deps.adminToken);
  if (auth === "not_configured")
    return json({ error: "admin_not_configured" }, 503);
  if (auth === "unauthorized")
    return json({ error: "unauthorized" }, 401, {
      "www-authenticate": 'Bearer realm="nexora-admin"',
    });
  try {
    return await route();
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.code, ...error.extra }, error.status);
    const mapped = mapError?.(error);
    if (mapped) return mapped;
    deps.log.error(`${name} : erreur interne`, {
      route: path.join("/"),
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}

export function allowMethods(request: Request, ...methods: string[]): string {
  const method = request.method.toUpperCase();
  if (!methods.includes(method)) throw new HttpError(405, "method_not_allowed");
  return method;
}
