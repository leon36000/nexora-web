import type { Action } from "./actions.ts";

/**
 * Machine à états des sessions de navigateur. Une session = un navigateur lancé pour elle seule (aucun profil,
 * aucun cookie, aucun stockage partagé), détruit à la fermeture. États : `opening` -> `open` -> `closed` (motif
 * définitif). Le motif est le premier posé : une fermeture déjà faite n'est jamais réécrite.
 *
 * Le gestionnaire ne connaît pas Playwright : il pilote un `BrowserDriver` injecté (un faux dans les essais).
 */
export type CloseReason =
  | "closed_by_client"
  | "max_minutes"
  | "idle"
  | "insufficient_quota"
  | "privacy_policy"
  | "browser_error";

export const CLOSE_REASONS: readonly CloseReason[] = [
  "closed_by_client",
  "max_minutes",
  "idle",
  "insufficient_quota",
  "privacy_policy",
  "browser_error",
];

export type SessionErrorCode =
  | "invalid_request"
  | "session_exists"
  | "capacity"
  | "not_found"
  | "session_closed"
  | "busy"
  | "browser_error";

const STATUS: Record<SessionErrorCode, number> = {
  invalid_request: 400,
  session_exists: 409,
  capacity: 429,
  not_found: 404,
  session_closed: 409,
  busy: 409,
  browser_error: 502,
};

export class SessionError extends Error {
  readonly code: SessionErrorCode;
  readonly status: number;
  readonly reason: CloseReason | null;
  constructor(
    code: SessionErrorCode,
    message: string,
    reason: CloseReason | null = null,
  ) {
    super(message);
    this.name = "SessionError";
    this.code = code;
    this.status = STATUS[code];
    this.reason = reason;
  }
}

export interface ActionResult {
  type: string;
  ok: boolean;
  error?: { code: string; message: string };
  [key: string]: unknown;
}

export interface RunOutput {
  results: ActionResult[];
  url: string | null;
  title: string | null;
}

export interface LaunchOptions {
  id: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezone?: string;
}

export interface LivePage {
  run(
    actions: Action[],
    ctx: { approveHosts: string[]; signal: AbortSignal },
  ): Promise<RunOutput>;
  /** Appelé si le navigateur plante ou se déconnecte. */
  onCrash(callback: () => void): void;
  /** Détruit le navigateur et tout ce qu'il contenait. Idempotent. */
  close(): Promise<void>;
}

export interface BrowserDriver {
  launch(options: LaunchOptions): Promise<LivePage>;
}

export interface SessionInfo {
  id: string;
  status: "open" | "closed";
  closeReason: CloseReason | null;
  openedAt: number;
  expiresAt: number;
  lastActivityAt: number;
  url: string | null;
}

export interface ManagerOptions {
  driver: BrowserDriver;
  now: () => number;
  maxSessions: number;
  maxSeconds: number;
  maxIdleSeconds: number;
  /** Durée pendant laquelle le motif d'une session fermée reste lisible. */
  tombstoneMs: number;
}

interface Entry {
  info: SessionInfo;
  state: "opening" | "open" | "closed";
  idleMs: number;
  page: LivePage | null;
  running: AbortController | null;
  closedAt: number | null;
  closing: Promise<void> | null;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export class SessionManager {
  private readonly entries = new Map<string, Entry>();

  private readonly options: ManagerOptions;

  constructor(options: ManagerOptions) {
    this.options = options;
  }

  /** Sessions ouvertes ou en cours d'ouverture. */
  count(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.state !== "closed") n += 1;
    return n;
  }

  async open(input: {
    id: string;
    maxSeconds: number;
    idleSeconds: number;
    viewport?: { width: number; height: number };
    locale?: string;
    timezone?: string;
  }): Promise<SessionInfo> {
    const { options } = this;
    if (!ID.test(input.id))
      throw new SessionError("invalid_request", "identifiant invalide");
    if (
      !Number.isInteger(input.maxSeconds) ||
      input.maxSeconds < 1 ||
      input.maxSeconds > options.maxSeconds
    )
      throw new SessionError(
        "invalid_request",
        `max_seconds : entre 1 et ${options.maxSeconds}`,
      );
    if (
      !Number.isInteger(input.idleSeconds) ||
      input.idleSeconds < 1 ||
      input.idleSeconds > options.maxIdleSeconds
    )
      throw new SessionError(
        "invalid_request",
        `idle_seconds : entre 1 et ${options.maxIdleSeconds}`,
      );
    if (this.entries.has(input.id))
      throw new SessionError("session_exists", "session déjà connue");
    if (this.count() >= options.maxSessions)
      throw new SessionError("capacity", "trop de sessions simultanées");

    const now = options.now();
    const entry: Entry = {
      info: {
        id: input.id,
        status: "open",
        closeReason: null,
        openedAt: now,
        expiresAt: now + input.maxSeconds * 1000,
        lastActivityAt: now,
        url: null,
      },
      state: "opening",
      idleMs: input.idleSeconds * 1000,
      page: null,
      running: null,
      closedAt: null,
      closing: null,
    };
    this.entries.set(input.id, entry);
    try {
      const page = await options.driver.launch({
        id: input.id,
        ...(input.viewport ? { viewport: input.viewport } : {}),
        ...(input.locale ? { locale: input.locale } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      });
      entry.page = page;
      page.onCrash(() => {
        void this.finish(entry, "browser_error");
      });
      if (entry.state === "closed") {
        await page.close().catch(() => undefined);
        throw new SessionError("browser_error", "session fermée à l'ouverture");
      }
      entry.state = "open";
      return { ...entry.info };
    } catch (error) {
      this.entries.delete(input.id);
      if (error instanceof SessionError) throw error;
      throw new SessionError("browser_error", "le navigateur n'a pas démarré");
    }
  }

  get(id: string): SessionInfo {
    const entry = this.entries.get(id);
    if (!entry) throw new SessionError("not_found", "session inconnue");
    return { ...entry.info };
  }

  async run(
    id: string,
    actions: Action[],
    options: { approveHosts: string[] },
  ): Promise<RunOutput & { info: SessionInfo }> {
    const entry = this.entries.get(id);
    if (!entry) throw new SessionError("not_found", "session inconnue");
    if (entry.state === "closed")
      throw new SessionError(
        "session_closed",
        "session fermée",
        entry.info.closeReason,
      );
    if (entry.state !== "open" || !entry.page)
      throw new SessionError("busy", "session en cours d'ouverture");
    if (entry.running) throw new SessionError("busy", "un lot est en cours");
    const abort = new AbortController();
    entry.running = abort;
    entry.info.lastActivityAt = this.options.now();
    try {
      const out = await entry.page.run(actions, {
        approveHosts: options.approveHosts,
        signal: abort.signal,
      });
      // Fermée pendant le lot (échéance, fermeture demandée) : le résultat n'est pas livré.
      if (this.isClosed(entry))
        throw new SessionError(
          "session_closed",
          "session fermée",
          entry.info.closeReason,
        );
      entry.info.lastActivityAt = this.options.now();
      entry.info.url = out.url;
      return { ...out, info: { ...entry.info } };
    } catch (error) {
      if (error instanceof SessionError) throw error;
      if (this.isClosed(entry))
        throw new SessionError(
          "session_closed",
          "session fermée",
          entry.info.closeReason,
        );
      await this.finish(entry, "browser_error");
      throw new SessionError("browser_error", "le navigateur a échoué");
    } finally {
      entry.running = null;
    }
  }

  async close(id: string, reason: CloseReason): Promise<SessionInfo> {
    const entry = this.entries.get(id);
    if (!entry) throw new SessionError("not_found", "session inconnue");
    await this.finish(entry, reason);
    return { ...entry.info };
  }

  /** Ferme les sessions échues et oublie les anciennes fermetures. À appeler souvent (chaque seconde). */
  async sweep(): Promise<void> {
    const now = this.options.now();
    const due: Array<[Entry, CloseReason]> = [];
    for (const [id, entry] of this.entries) {
      if (entry.state === "closed") {
        if (
          entry.closedAt !== null &&
          now - entry.closedAt >= this.options.tombstoneMs
        )
          this.entries.delete(id);
        continue;
      }
      if (now >= entry.info.expiresAt) due.push([entry, "max_minutes"]);
      else if (now - entry.info.lastActivityAt >= entry.idleMs)
        due.push([entry, "idle"]);
    }
    await Promise.all(due.map(([entry, reason]) => this.finish(entry, reason)));
  }

  /** Arrêt du service : tout est détruit, rien n'est conservé. */
  async closeAll(): Promise<void> {
    const all = [...this.entries.values()];
    await Promise.all(all.map((e) => this.finish(e, "closed_by_client")));
    this.entries.clear();
  }

  private isClosed(entry: Entry): boolean {
    return entry.state === "closed";
  }

  /** Pose le motif (le premier gagne), interrompt le lot en cours, détruit le navigateur. */
  private finish(entry: Entry, reason: CloseReason): Promise<void> {
    if (entry.closing) return entry.closing;
    entry.state = "closed";
    entry.info.status = "closed";
    entry.info.closeReason = reason;
    entry.closedAt = this.options.now();
    entry.running?.abort();
    entry.closing = (async () => {
      try {
        await entry.page?.close();
      } catch {
        // le navigateur est déjà parti : rien d'autre à détruire
      }
    })();
    return entry.closing;
  }
}
