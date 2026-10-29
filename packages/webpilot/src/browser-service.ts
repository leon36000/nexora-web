import type { WebpilotSessionCloseReason } from "@nexora/db";
import type { TrustedHttpClient } from "./http.ts";

/**
 * Client du service de navigateur pour les SESSIONS (le rendu d'une page est dans `renderer.ts`). Le secret de service à
 * service n'est envoyé qu'à l'hôte approuvé du client sûr. Les erreurs du service deviennent des erreurs typées, sans
 * jamais reprendre leur message.
 */
export type CloseReason = WebpilotSessionCloseReason;

/** Actions du service : liste fermée du contrat (l'action `extract` est traitée par le site, elle devient un `read`). */
export type ServiceAction =
  | { type: "goto"; url: string; wait_until?: string }
  | { type: "click"; selector: string }
  | { type: "click"; text: string }
  | { type: "click"; x: number; y: number }
  | {
      type: "type";
      selector: string;
      text: string;
      clear?: boolean;
      expected_host?: string;
    }
  | { type: "press"; key: string }
  | { type: "select"; selector: string; value: string; expected_host?: string }
  | { type: "scroll"; direction: string; amount?: number }
  | { type: "wait"; for: "selector"; selector: string }
  | { type: "wait"; for: "idle" }
  | { type: "wait"; for: "ms"; ms: number }
  | { type: "read" }
  | { type: "screenshot" };

export interface ServiceActionResult {
  type: string;
  ok: boolean;
  error?: { code: string; message: string };
  [key: string]: unknown;
}

export interface ServiceSession {
  id: string;
  status: "open" | "closed";
  closeReason: CloseReason | null;
  expiresAt: Date;
  url: string | null;
}

export interface ServiceRun extends ServiceSession {
  title: string | null;
  results: ServiceActionResult[];
  completed: boolean;
}

export type BrowserServiceErrorCode =
  | "unavailable"
  | "unauthorized"
  | "not_found"
  | "session_closed"
  | "busy"
  | "capacity"
  | "invalid_request"
  | "browser_error";

export class BrowserServiceError extends Error {
  readonly code: BrowserServiceErrorCode;
  readonly closeReason: CloseReason | null;
  /** Position de l'action refusée, si le service la donne. */
  readonly index: number | null;
  constructor(
    code: BrowserServiceErrorCode,
    closeReason: CloseReason | null = null,
    index: number | null = null,
  ) {
    super(`service de navigateur : ${code}`);
    this.name = "BrowserServiceError";
    this.code = code;
    this.closeReason = closeReason;
    this.index = index;
  }
}

export interface BrowserService {
  open(input: {
    id: string;
    maxSeconds: number;
    idleSeconds: number;
    viewport?: { width: number; height: number };
    locale?: string;
    timezone?: string;
  }): Promise<ServiceSession>;
  run(
    id: string,
    actions: readonly ServiceAction[],
    options: { approveHosts: readonly string[] },
  ): Promise<ServiceRun>;
  get(id: string): Promise<ServiceSession>;
  close(id: string, reason: CloseReason): Promise<ServiceSession>;
}

const CODES: Record<string, BrowserServiceErrorCode> = {
  not_found: "not_found",
  session_closed: "session_closed",
  busy: "busy",
  capacity: "capacity",
  unauthorized: "unauthorized",
  browser_error: "browser_error",
  invalid_request: "invalid_request",
  session_exists: "invalid_request",
};

const REASONS: readonly string[] = [
  "closed_by_client",
  "max_minutes",
  "idle",
  "insufficient_quota",
  "privacy_policy",
  "browser_error",
];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function session(json: unknown): ServiceSession {
  if (
    !isRec(json) ||
    typeof json.id !== "string" ||
    (json.status !== "open" && json.status !== "closed") ||
    typeof json.expires_at !== "string"
  )
    throw new BrowserServiceError("unavailable");
  const expiresAt = new Date(json.expires_at);
  if (Number.isNaN(expiresAt.getTime()))
    throw new BrowserServiceError("unavailable");
  return {
    id: json.id,
    status: json.status,
    closeReason:
      typeof json.close_reason === "string" &&
      REASONS.includes(json.close_reason)
        ? (json.close_reason as CloseReason)
        : null,
    expiresAt,
    url: typeof json.url === "string" ? json.url : null,
  };
}

export function createBrowserService(
  client: Pick<TrustedHttpClient, "request">,
  baseUrl: string,
  secret: string,
): BrowserService {
  const headers = { authorization: `Bearer ${secret}` };
  async function call(
    method: "GET" | "POST" | "DELETE",
    path: string,
    json?: unknown,
  ): Promise<unknown> {
    let res: Awaited<ReturnType<typeof client.request>>;
    try {
      res = await client.request(method, new URL(path, baseUrl).toString(), {
        headers,
        maxBytes: 12_000_000,
        ...(json !== undefined ? { json } : {}),
      });
    } catch {
      throw new BrowserServiceError("unavailable");
    }
    let body: unknown = null;
    try {
      body = JSON.parse(new TextDecoder().decode(res.body));
    } catch {
      body = null;
    }
    if (res.status >= 200 && res.status < 300) return body;
    const error = isRec(body) && isRec(body.error) ? body.error : {};
    const code = typeof error.code === "string" ? CODES[error.code] : undefined;
    if (!code || res.status >= 500)
      throw new BrowserServiceError(
        code === "browser_error" ? "browser_error" : "unavailable",
      );
    throw new BrowserServiceError(
      code,
      typeof error.close_reason === "string" &&
        REASONS.includes(error.close_reason)
        ? (error.close_reason as CloseReason)
        : null,
      typeof error.index === "number" ? error.index : null,
    );
  }

  return {
    async open(input) {
      return session(
        await call("POST", "/sessions", {
          id: input.id,
          max_seconds: input.maxSeconds,
          idle_seconds: input.idleSeconds,
          ...(input.viewport ? { viewport: input.viewport } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
          ...(input.timezone ? { timezone: input.timezone } : {}),
        }),
      );
    },
    async run(id, actions, options) {
      const json = await call(
        "POST",
        `/sessions/${encodeURIComponent(id)}/actions`,
        { actions, approve_hosts: options.approveHosts },
      );
      const base = session(json);
      const rec = json as Rec;
      if (!Array.isArray(rec.results))
        throw new BrowserServiceError("unavailable");
      return {
        ...base,
        title: typeof rec.title === "string" ? rec.title : null,
        results: rec.results as ServiceActionResult[],
        completed: rec.completed === true,
      };
    },
    async get(id) {
      return session(await call("GET", `/sessions/${encodeURIComponent(id)}`));
    },
    async close(id, reason) {
      return session(
        await call("DELETE", `/sessions/${encodeURIComponent(id)}`, { reason }),
      );
    },
  };
}
