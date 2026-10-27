import {
  and,
  asc,
  type Database,
  eq,
  type IpPool,
  osTemplates,
  type ProxmoxCapacity,
  type ProxmoxServerState,
  proxmoxServers,
  type Region,
  type TlsMode,
} from "@nexora/db";
import { validatePool } from "./ips.ts";
import { ProxmoxClient, ProxmoxError } from "./proxmox/client.ts";
import { isLoopback } from "./proxmox/transport.ts";

type Server = typeof proxmoxServers.$inferSelect;
export type ServerRow = Server;
type Template = typeof osTemplates.$inferSelect;
export type TemplateRow = Template;

export class ServerError extends Error {
  readonly code: "not_found" | "conflict" | "invalid_request";
  readonly details?: unknown;
  constructor(code: ServerError["code"], message: string, details?: unknown) {
    super(message);
    this.name = "ServerError";
    this.code = code;
    this.details = details;
  }
}

const dbCode = (e: unknown) => {
  const c = e as { code?: unknown; cause?: { code?: unknown } };
  return String(c?.code ?? c?.cause?.code ?? "");
};

export interface ServerInput {
  code: string;
  name: string;
  host: string;
  port?: number;
  node: string;
  region?: Region;
  capacity: ProxmoxCapacity;
  ipPool: IpPool;
  tokenRef?: string | null;
  tlsMode?: TlsMode;
  tlsFingerprint?: string | null;
  storage?: string;
  pool?: string | null;
  vmidMin?: number;
}

/** `http://127.0.0.1` n'est accepté que pour la boucle locale (simulateur) ; sinon HTTPS seulement. */
export function connectionOf(server: Pick<Server, "host" | "port">): {
  host: string;
  port: number;
  protocol: "https" | "http";
} {
  const m = /^(https?):\/\/(.+)$/.exec(server.host);
  const host = m ? (m[2] as string) : server.host;
  const protocol = m?.[1] === "http" ? "http" : "https";
  return { host, port: server.port, protocol };
}

function check(input: Partial<ServerInput>) {
  const issues: string[] = [];
  if (input.host !== undefined) {
    const c = connectionOf({ host: input.host, port: 8006 });
    if (!/^[A-Za-z0-9.-]+$/.test(c.host)) issues.push("hôte invalide");
    if (c.protocol === "http" && !isLoopback(c.host))
      issues.push("HTTP en clair refusé : seule la boucle locale l'autorise");
  }
  if (input.ipPool) issues.push(...validatePool(input.ipPool));
  if (
    input.capacity &&
    !(
      input.capacity.vcpu > 0 &&
      input.capacity.ramMb > 0 &&
      input.capacity.diskGb > 0
    )
  )
    issues.push("capacité : vCPU, RAM et disque positifs requis");
  if (
    input.tlsMode === "pinned" &&
    !/^([0-9a-fA-F]{2}:?){32}$/.test(input.tlsFingerprint ?? "")
  )
    issues.push(
      "empreinte SHA-256 du certificat attendue (64 caractères hexadécimaux)",
    );
  if (issues.length > 0)
    throw new ServerError("invalid_request", "serveur invalide", issues);
}

export async function createServer(db: Database, input: ServerInput) {
  check(input);
  try {
    const [row] = await db.insert(proxmoxServers).values(input).returning();
    if (!row) throw new Error("serveur non créé");
    return row;
  } catch (e) {
    if (dbCode(e) === "23505")
      throw new ServerError("conflict", "un serveur porte déjà ce code");
    throw e;
  }
}

export async function updateServer(
  db: Database,
  id: string,
  patch: Partial<Omit<ServerInput, "code">> & { state?: ProxmoxServerState },
) {
  check(patch);
  const [row] = await db
    .update(proxmoxServers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(proxmoxServers.id, id))
    .returning();
  if (!row) throw new ServerError("not_found", "serveur introuvable");
  return row;
}

export const listServers = (db: Database) =>
  db.select().from(proxmoxServers).orderBy(asc(proxmoxServers.code));

export async function getServer(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(proxmoxServers)
    .where(eq(proxmoxServers.id, id));
  if (!row) throw new ServerError("not_found", "serveur introuvable");
  return row;
}

export interface TemplateInput {
  serverId: string;
  code: string;
  name: string;
  os: string;
  osVersion: string;
  vmid: number;
  ciUser?: string;
  imageSha256?: string | null;
}

export async function createTemplate(db: Database, input: TemplateInput) {
  await getServer(db, input.serverId);
  try {
    const [row] = await db.insert(osTemplates).values(input).returning();
    if (!row) throw new Error("gabarit non créé");
    return row;
  } catch (e) {
    const c = dbCode(e);
    if (c === "23505")
      throw new ServerError(
        "conflict",
        "ce serveur a déjà un gabarit de ce code",
      );
    if (c === "23514")
      throw new ServerError(
        "invalid_request",
        "identifiant de VM hors de 100 à 999999999",
      );
    throw e;
  }
}

export async function updateTemplate(
  db: Database,
  id: string,
  patch: Partial<Omit<TemplateInput, "serverId" | "code">> & {
    state?: Template["state"];
  },
) {
  const [row] = await db
    .update(osTemplates)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(osTemplates.id, id))
    .returning();
  if (!row) throw new ServerError("not_found", "gabarit introuvable");
  return row;
}

export const listTemplates = (db: Database, serverId?: string) =>
  serverId
    ? db
        .select()
        .from(osTemplates)
        .where(eq(osTemplates.serverId, serverId))
        .orderBy(asc(osTemplates.code))
    : db.select().from(osTemplates).orderBy(asc(osTemplates.code));

/** Client Proxmox d'un serveur : le jeton est lu du coffre à chaque appel, jamais gardé. */
export function proxmoxClientFactory(deps: {
  getSecret: (ref: string) => Promise<string>;
}) {
  return async (server: Server): Promise<ProxmoxClient> => {
    if (!server.tokenRef)
      throw new ProxmoxError(
        "unauthorized",
        "aucun jeton enregistré pour ce serveur",
      );
    const token = await deps.getSecret(server.tokenRef).catch(() => {
      throw new ProxmoxError(
        "unauthorized",
        "jeton Proxmox introuvable ou révoqué dans le coffre",
      );
    });
    const c = connectionOf(server);
    return new ProxmoxClient({
      host: c.host,
      port: c.port,
      protocol: c.protocol,
      token,
      tls:
        server.tlsMode === "pinned" && server.tlsFingerprint
          ? { mode: "pinned", fingerprint: server.tlsFingerprint }
          : { mode: "verify" },
    });
  };
}

export interface ConnectionCheck {
  ok: boolean;
  detail: string;
  version: string | null;
  templates: { code: string; ok: boolean }[];
  server: Server;
}

/**
 * « Tester la connexion » : version de Proxmox, nœud, gabarits. Le serveur passe à « prêt » si le
 * test réussit (brouillon ou hors ligne) ; un échec met « hors ligne » un serveur qui était prêt.
 * Le résumé est court : jamais de corps de réponse ni de jeton.
 */
export async function testServerConnection(
  db: Database,
  serverId: string,
  deps: {
    client: (server: Server) => Promise<ProxmoxClient>;
    now?: () => Date;
  },
): Promise<ConnectionCheck> {
  const server = await getServer(db, serverId);
  const now = (deps.now ?? (() => new Date()))();
  const record = async (
    ok: boolean,
    detail: string,
    version: string | null,
    state: ProxmoxServerState,
  ) => {
    const [row] = await db
      .update(proxmoxServers)
      .set({
        lastCheckedAt: now,
        lastCheckOk: ok,
        lastCheckDetail: detail.slice(0, 300),
        pveVersion: version ?? server.pveVersion,
        state,
        updatedAt: now,
      })
      .where(eq(proxmoxServers.id, serverId))
      .returning();
    return row ?? server;
  };
  const failState: ProxmoxServerState =
    server.state === "ready" ? "offline" : server.state;
  try {
    const client = await deps.client(server);
    const v = await client.version();
    const nodes = await client.nodes();
    if (!nodes.some((n) => n.node === server.node))
      return {
        ok: false,
        detail: `nœud « ${server.node} » absent du serveur`,
        version: v.version,
        templates: [],
        server: await record(
          false,
          `nœud « ${server.node} » absent du serveur`,
          v.version,
          failState,
        ),
      };
    await client.nodeStatus(server.node);
    const tpls = await db
      .select()
      .from(osTemplates)
      .where(and(eq(osTemplates.serverId, serverId)));
    const results: { code: string; ok: boolean }[] = [];
    for (const t of tpls) {
      if (t.state === "retired") continue;
      const cfg = await client.findConfig(server.node, t.vmid);
      const ok = Boolean(cfg && Number(cfg.template) === 1);
      results.push({ code: t.code, ok });
      if (ok && t.state === "draft")
        await db
          .update(osTemplates)
          .set({ state: "ready", updatedAt: now })
          .where(eq(osTemplates.id, t.id));
      if (!ok && t.state === "ready")
        await db
          .update(osTemplates)
          .set({ state: "draft", updatedAt: now })
          .where(eq(osTemplates.id, t.id));
    }
    const readyCount = results.filter((r) => r.ok).length;
    const poolProblems = validatePool(server.ipPool);
    // « Prêt » ne se donne que si tout est vérifié : un gabarit prêt ET un bloc d'adresses valide.
    const blocker =
      readyCount === 0
        ? "aucun gabarit prêt : le serveur reste en brouillon"
        : poolProblems.length > 0
          ? "bloc d'adresses incomplet : le serveur reste en brouillon"
          : null;
    const detail = `Proxmox VE ${v.version}, nœud ${server.node}, ${readyCount}/${results.length} gabarit(s) prêt(s)${blocker ? ` — ${blocker}` : ""}`;
    const next: ProxmoxServerState =
      !blocker && (server.state === "draft" || server.state === "offline")
        ? "ready"
        : server.state;
    return {
      ok: true,
      detail,
      version: v.version,
      templates: results,
      server: await record(true, detail, v.version, next),
    };
  } catch (error) {
    const detail =
      error instanceof ProxmoxError ? error.message : "test impossible";
    return {
      ok: false,
      detail,
      version: null,
      templates: [],
      server: await record(false, detail, null, failState),
    };
  }
}
