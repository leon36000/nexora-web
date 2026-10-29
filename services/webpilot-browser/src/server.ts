import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { parseActions } from "./actions.ts";
import { checkUrlSyntax } from "./address.ts";
import {
  RenderBlockedError,
  RenderFailedError,
  type RenderInput,
  type RenderOutput,
} from "./browser.ts";
import type { ServiceConfig } from "./config.ts";
import {
  CLOSE_REASONS,
  type CloseReason,
  SessionError,
  type SessionInfo,
  type SessionManager,
} from "./sessions.ts";

/**
 * API interne du service. Authentification de service à service : secret partagé (`Authorization: Bearer`),
 * comparé en temps constant ; jamais exposé à un client de l'API publique (seul le site et le worker le connaissent).
 * Aucune route n'est ouverte sans le secret, sauf `/healthz`. Corps JSON plafonné ; erreurs sans détail interne.
 */
export interface ServerDeps {
  config: ServiceConfig;
  manager: SessionManager;
  render: (input: RenderInput) => Promise<RenderOutput>;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

function authorized(header: string | undefined, secret: string): boolean {
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return false;
  return timingSafeEqual(digest(m[1] as string), digest(secret));
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;
  constructor(
    status: number,
    code: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

async function readJson(
  req: http.IncomingMessage,
  max: number,
): Promise<unknown> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > max)
    throw new HttpError(413, "request_too_large", "Corps trop volumineux.");
  const parts: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > max)
      throw new HttpError(413, "request_too_large", "Corps trop volumineux.");
    parts.push(chunk as Buffer);
  }
  if (total === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new HttpError(
      400,
      "invalid_request",
      "Le corps doit être un JSON valide.",
    );
  }
}

const HOST = /^[a-z0-9.-]{1,253}$/i;

function hostList(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 20)
    throw new HttpError(400, "invalid_request", "approve_hosts invalide.");
  return v.map((h) => {
    if (typeof h !== "string" || !HOST.test(h))
      throw new HttpError(400, "invalid_request", "approve_hosts invalide.");
    return h.toLowerCase();
  });
}

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function openInput(body: unknown) {
  const bad = (m: string) => new HttpError(400, "invalid_request", m);
  if (!isRec(body)) throw bad("Corps invalide.");
  const allowed = [
    "id",
    "max_seconds",
    "idle_seconds",
    "viewport",
    "locale",
    "timezone",
  ];
  if (Object.keys(body).some((k) => !allowed.includes(k)))
    throw bad("Champ inconnu.");
  if (typeof body.id !== "string") throw bad("id invalide.");
  if (typeof body.max_seconds !== "number") throw bad("max_seconds invalide.");
  if (typeof body.idle_seconds !== "number")
    throw bad("idle_seconds invalide.");
  let viewport: { width: number; height: number } | undefined;
  if (body.viewport !== undefined) {
    const v = body.viewport;
    if (
      !isRec(v) ||
      Object.keys(v).some((k) => k !== "width" && k !== "height") ||
      !Number.isInteger(v.width) ||
      !Number.isInteger(v.height) ||
      (v.width as number) < 320 ||
      (v.width as number) > 1920 ||
      (v.height as number) < 240 ||
      (v.height as number) > 1200
    )
      throw bad("viewport : de 320x240 à 1920x1200.");
    viewport = { width: v.width as number, height: v.height as number };
  }
  if (
    body.locale !== undefined &&
    !(
      typeof body.locale === "string" &&
      /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(body.locale)
    )
  )
    throw bad("locale invalide.");
  if (
    body.timezone !== undefined &&
    !(
      typeof body.timezone === "string" &&
      body.timezone.length <= 64 &&
      validTimezone(body.timezone)
    )
  )
    throw bad("timezone invalide.");
  return {
    id: body.id,
    maxSeconds: body.max_seconds,
    idleSeconds: body.idle_seconds,
    ...(viewport ? { viewport } : {}),
    ...(body.locale ? { locale: body.locale as string } : {}),
    ...(body.timezone ? { timezone: body.timezone as string } : {}),
  };
}

const present = (info: SessionInfo) => ({
  id: info.id,
  status: info.status,
  close_reason: info.closeReason,
  opened_at: new Date(info.openedAt).toISOString(),
  expires_at: new Date(info.expiresAt).toISOString(),
  last_activity_at: new Date(info.lastActivityAt).toISOString(),
  url: info.url,
});

export function createServer(deps: ServerDeps): http.Server {
  const { config, manager } = deps;

  async function route(
    req: http.IncomingMessage,
  ): Promise<{ status: number; body: unknown }> {
    const url = new URL(req.url ?? "/", "http://service.local");
    const path = url.pathname;
    const method = req.method ?? "GET";
    if (path === "/healthz" && method === "GET")
      return { status: 200, body: { ok: true } };
    if (!authorized(req.headers.authorization, config.secret))
      throw new HttpError(401, "unauthorized", "Non autorisé.");

    if (path === "/render") {
      if (method !== "POST")
        throw new HttpError(405, "method_not_allowed", "Méthode non permise.");
      const body = await readJson(req, config.maxBodyBytes);
      if (
        !isRec(body) ||
        Object.keys(body).some(
          (k) => !["url", "wait_ms", "approve_hosts"].includes(k),
        )
      )
        throw new HttpError(400, "invalid_request", "Corps invalide.");
      if (typeof body.url !== "string")
        throw new HttpError(400, "invalid_request", "url invalide.");
      const syntax = checkUrlSyntax(body.url, config.policy);
      if (!syntax.ok)
        throw new HttpError(
          400,
          "url_not_allowed",
          "Adresse refusée par la politique de sortie.",
        );
      const wait = body.wait_ms ?? 0;
      if (
        typeof wait !== "number" ||
        !Number.isFinite(wait) ||
        wait < 0 ||
        wait > config.maxWaitMs
      )
        throw new HttpError(400, "invalid_request", "wait_ms invalide.");
      try {
        const out = await deps.render({
          url: syntax.url.toString(),
          waitMs: Math.round(wait),
          approveHosts: hostList(body.approve_hosts),
        });
        return { status: 200, body: out };
      } catch (error) {
        if (error instanceof RenderBlockedError)
          throw new HttpError(
            422,
            "redirect_blocked",
            "Redirection vers un hôte non approuvé.",
            {
              host: error.host,
              url: error.url,
            },
          );
        if (error instanceof RenderFailedError)
          throw error.code === "timeout"
            ? new HttpError(504, "render_timeout", "Délai dépassé.")
            : new HttpError(502, "render_failed", "Le rendu a échoué.");
        throw error;
      }
    }

    if (path === "/sessions") {
      if (method !== "POST")
        throw new HttpError(405, "method_not_allowed", "Méthode non permise.");
      const input = openInput(await readJson(req, config.maxBodyBytes));
      const info = await manager.open(input);
      return { status: 201, body: present(info) };
    }

    const m = /^\/sessions\/([A-Za-z0-9_-]{1,64})(\/actions)?$/.exec(path);
    if (m) {
      const id = m[1] as string;
      if (m[2]) {
        if (method !== "POST")
          throw new HttpError(
            405,
            "method_not_allowed",
            "Méthode non permise.",
          );
        const body = await readJson(req, config.maxBodyBytes);
        if (
          !isRec(body) ||
          Object.keys(body).some(
            (k) => k !== "actions" && k !== "approve_hosts",
          )
        )
          throw new HttpError(400, "invalid_request", "Corps invalide.");
        const parsed = parseActions(body.actions, {
          maxActions: config.maxActions,
          maxWaitMs: config.maxWaitMs,
          maxTextChars: config.maxTextChars,
          viewport: config.viewport,
        });
        if (!parsed.ok)
          throw new HttpError(400, "invalid_request", parsed.message, {
            index: parsed.index,
          });
        const out = await manager.run(id, parsed.actions, {
          approveHosts: hostList(body.approve_hosts),
        });
        return {
          status: 200,
          body: {
            ...present(out.info),
            title: out.title,
            results: out.results,
            completed:
              out.results.length === parsed.actions.length &&
              out.results.every((r) => r.ok),
          },
        };
      }
      if (method === "GET")
        return { status: 200, body: present(manager.get(id)) };
      if (method === "DELETE") {
        const body = await readJson(req, config.maxBodyBytes);
        let reason: CloseReason = "closed_by_client";
        if (body !== undefined) {
          if (!isRec(body) || Object.keys(body).some((k) => k !== "reason"))
            throw new HttpError(400, "invalid_request", "Corps invalide.");
          if (body.reason !== undefined) {
            if (!(CLOSE_REASONS as readonly unknown[]).includes(body.reason))
              throw new HttpError(400, "invalid_request", "Motif invalide.");
            reason = body.reason as CloseReason;
          }
        }
        return { status: 200, body: present(await manager.close(id, reason)) };
      }
      throw new HttpError(405, "method_not_allowed", "Méthode non permise.");
    }
    throw new HttpError(404, "not_found", "Route inconnue.");
  }

  return http.createServer((req, res) => {
    void route(req).then(
      ({ status, body }) => send(res, status, body),
      (error: unknown) => {
        if (error instanceof HttpError)
          return send(res, error.status, {
            error: { code: error.code, message: error.message, ...error.extra },
          });
        if (error instanceof SessionError)
          return send(res, error.status, {
            error: {
              code: error.code,
              message: error.message,
              ...(error.reason ? { close_reason: error.reason } : {}),
            },
          });
        return send(res, 500, {
          error: { code: "internal_error", message: "Erreur interne." },
        });
      },
    );
  });
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}
