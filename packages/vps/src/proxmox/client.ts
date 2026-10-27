import {
  defaultTransport,
  isLoopback,
  type TlsPolicy,
  type Transport,
  TransportError,
} from "./transport.ts";

export type ProxmoxErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_request"
  | "server_error"
  | "network"
  | "timeout"
  | "tls"
  | "task_failed"
  | "task_timeout";

/** Erreur du client Proxmox. Le message ne contient jamais le jeton ni le corps de la requête. */
export class ProxmoxError extends Error {
  readonly code: ProxmoxErrorCode;
  readonly status?: number;
  constructor(code: ProxmoxErrorCode, message: string, status?: number) {
    super(message);
    this.name = "ProxmoxError";
    this.code = code;
    this.status = status;
  }
}

export interface ProxmoxClientConfig {
  host: string;
  port?: number;
  /** `USER@REALM!TOKENID=UUID`, lu du coffre. Jamais journalisé. */
  token: string;
  tls: TlsPolicy;
  /** `http` seulement vers la boucle locale (simulateur). */
  protocol?: "https" | "http";
  timeoutMs?: number;
  transport?: Transport;
  /** Pause entre deux consultations de tâche (remplaçable dans les tests). */
  sleep?: (ms: number) => Promise<void>;
}

export interface VmSummary {
  vmid: number;
  name?: string;
  status?: string;
  template?: number;
  tags?: string;
}

export interface TaskStatus {
  status: "running" | "stopped";
  exitstatus?: string;
  type?: string;
  id?: string;
}

export type VmConfig = Record<string, string | number | boolean>;

export interface FirewallRule {
  pos: number;
  type: string;
  action: string;
  enable?: number;
  proto?: string;
  dport?: string;
  comment?: string;
  iface?: string;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const q = encodeURIComponent;

/** Extrait le nœud d'un UPID (`UPID:<nœud>:<pid>:…`). */
export function nodeOfUpid(upid: string): string {
  const parts = upid.split(":");
  const node = parts[1];
  if (parts[0] !== "UPID" || !node) throw new Error("UPID mal formé");
  return node;
}

export class ProxmoxClient {
  private readonly cfg: Required<
    Pick<ProxmoxClientConfig, "host" | "port" | "protocol" | "timeoutMs">
  > &
    ProxmoxClientConfig;
  private readonly transport: Transport;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: ProxmoxClientConfig) {
    const protocol = config.protocol ?? "https";
    if (protocol === "http" && !isLoopback(config.host))
      throw new ProxmoxError(
        "tls",
        "HTTP en clair refusé : seule la boucle locale l'autorise",
      );
    if (!/^[^\s@!]+@[^\s@!]+![^\s=]+=[0-9a-fA-F-]{8,}$/.test(config.token))
      throw new ProxmoxError(
        "unauthorized",
        "jeton Proxmox mal formé (USER@REALM!TOKENID=UUID attendu)",
      );
    this.cfg = {
      ...config,
      port: config.port ?? 8006,
      protocol,
      timeoutMs: config.timeoutMs ?? 30_000,
    };
    this.transport = config.transport ?? defaultTransport;
    this.sleep = config.sleep ?? defaultSleep;
  }

  // ─── Requête de base ──────────────────────────────────────────────────────────

  private async call<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<T> {
    let url = `/api2/json${path}`;
    let body: string | undefined;
    const headers: Record<string, string> = {
      authorization: `PVEAPIToken=${this.cfg.token}`,
      accept: "application/json",
    };
    if (params && Object.keys(params).length > 0) {
      if (method === "GET" || method === "DELETE") {
        const qs = Object.entries(params)
          .map(([k, v]) => `${q(k)}=${q(String(v))}`)
          .join("&");
        url += `?${qs}`;
      } else {
        headers["content-type"] = "application/json";
        body = JSON.stringify(params);
      }
    }
    let res: Awaited<ReturnType<Transport>>;
    try {
      res = await this.transport({
        method,
        host: this.cfg.host,
        port: this.cfg.port,
        protocol: this.cfg.protocol,
        path: url,
        headers,
        body,
        timeoutMs: this.cfg.timeoutMs,
        tls: this.cfg.tls,
      });
    } catch (e) {
      if (e instanceof TransportError)
        throw new ProxmoxError(
          e.kind === "timeout"
            ? "timeout"
            : e.kind === "tls"
              ? "tls"
              : "network",
          e.message,
        );
      throw new ProxmoxError("network", "erreur réseau");
    }
    return this.parse<T>(method, path, res.status, res.body);
  }

  private parse<T>(
    method: string,
    path: string,
    status: number,
    raw: string,
  ): T {
    let json: { data?: unknown; message?: string; errors?: unknown } | null =
      null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (status >= 200 && status < 300) return (json?.data ?? null) as T;
    // Message court de Proxmox (première ligne, borné) : jamais le corps de la requête.
    const detail = String(
      json?.message ??
        (typeof json?.errors === "object" ? "paramètres invalides" : ""),
    )
      .split("\n")[0]
      ?.slice(0, 200);
    const where = `${method} ${path.replace(/\/\d{3,9}(?=\/|$)/g, "/{vmid}")}`;
    const code: ProxmoxErrorCode =
      status === 401
        ? "unauthorized"
        : status === 403
          ? "forbidden"
          : status === 404
            ? "not_found"
            : status === 400
              ? "invalid_request"
              : status === 409
                ? "conflict"
                : "server_error";
    throw new ProxmoxError(
      code,
      `Proxmox ${status} sur ${where}${detail ? ` : ${detail}` : ""}`,
      status,
    );
  }

  // ─── Serveur ──────────────────────────────────────────────────────────────────

  version(): Promise<{ version: string; release?: string; repoid?: string }> {
    return this.call("GET", "/version");
  }
  nodes(): Promise<{ node: string; status?: string }[]> {
    return this.call("GET", "/nodes");
  }
  nodeStatus(node: string): Promise<{
    memory?: { total: number; used: number };
    cpuinfo?: { cpus: number };
    uptime?: number;
  }> {
    return this.call("GET", `/nodes/${q(node)}/status`);
  }
  nextId(): Promise<number> {
    return this.call<number | string>("GET", "/cluster/nextid").then(Number);
  }
  listVms(node: string): Promise<VmSummary[]> {
    return this.call("GET", `/nodes/${q(node)}/qemu`);
  }

  // ─── VM ───────────────────────────────────────────────────────────────────────

  getConfig(node: string, vmid: number): Promise<VmConfig> {
    return this.call("GET", `/nodes/${q(node)}/qemu/${vmid}/config`);
  }
  /** Existence d'une VM (config lisible) ; `null` si Proxmox répond que la VM n'existe pas. */
  async findConfig(node: string, vmid: number): Promise<VmConfig | null> {
    try {
      return await this.getConfig(node, vmid);
    } catch (e) {
      if (
        e instanceof ProxmoxError &&
        (e.code === "not_found" ||
          (e.code === "server_error" && /does not exist/i.test(e.message)))
      )
        return null;
      throw e;
    }
  }
  /** Clone complet d'un gabarit (`newid`). Renvoie l'UPID de la tâche. */
  cloneVm(
    node: string,
    templateVmid: number,
    params: {
      newid: number;
      name?: string;
      description?: string;
      storage?: string;
      pool?: string;
      full?: boolean;
    },
  ): Promise<string> {
    const body: Record<string, string | number | boolean> = {
      newid: params.newid,
      full: params.full ?? true,
    };
    if (params.name) body.name = params.name;
    if (params.description) body.description = params.description;
    if (params.storage) body.storage = params.storage;
    if (params.pool) body.pool = params.pool;
    return this.call(
      "POST",
      `/nodes/${q(node)}/qemu/${templateVmid}/clone`,
      body,
    );
  }
  /** Modifie la configuration (PUT : synchrone chez Proxmox, sans tâche). */
  setConfig(
    node: string,
    vmid: number,
    params: Record<string, string | number | boolean>,
  ): Promise<null> {
    return this.call("PUT", `/nodes/${q(node)}/qemu/${vmid}/config`, params);
  }
  resizeDisk(
    node: string,
    vmid: number,
    disk: string,
    size: string,
  ): Promise<null> {
    return this.call("PUT", `/nodes/${q(node)}/qemu/${vmid}/resize`, {
      disk,
      size,
    });
  }
  vmStatus(
    node: string,
    vmid: number,
  ): Promise<{ status: string; qmpstatus?: string; lock?: string }> {
    return this.call("GET", `/nodes/${q(node)}/qemu/${vmid}/status/current`);
  }
  startVm(node: string, vmid: number): Promise<string> {
    return this.call("POST", `/nodes/${q(node)}/qemu/${vmid}/status/start`);
  }
  /** Arrêt brutal. */
  stopVm(node: string, vmid: number): Promise<string> {
    return this.call("POST", `/nodes/${q(node)}/qemu/${vmid}/status/stop`);
  }
  /** Arrêt propre (ACPI) ; `forceStop` coupe si l'invité ne s'arrête pas dans le délai. */
  shutdownVm(
    node: string,
    vmid: number,
    opts: { timeout?: number; forceStop?: boolean } = {},
  ): Promise<string> {
    const body: Record<string, number | boolean> = {};
    if (opts.timeout !== undefined) body.timeout = opts.timeout;
    if (opts.forceStop !== undefined) body.forceStop = opts.forceStop;
    return this.call(
      "POST",
      `/nodes/${q(node)}/qemu/${vmid}/status/shutdown`,
      body,
    );
  }
  rebootVm(node: string, vmid: number): Promise<string> {
    return this.call("POST", `/nodes/${q(node)}/qemu/${vmid}/status/reboot`);
  }
  deleteVm(node: string, vmid: number): Promise<string> {
    return this.call("DELETE", `/nodes/${q(node)}/qemu/${vmid}`, {
      purge: true,
      "destroy-unreferenced-disks": true,
    });
  }

  // ─── Instantanés ──────────────────────────────────────────────────────────────

  listSnapshots(
    node: string,
    vmid: number,
  ): Promise<{ name: string; snaptime?: number }[]> {
    return this.call("GET", `/nodes/${q(node)}/qemu/${vmid}/snapshot`);
  }
  createSnapshot(
    node: string,
    vmid: number,
    snapname: string,
    description?: string,
  ): Promise<string> {
    return this.call("POST", `/nodes/${q(node)}/qemu/${vmid}/snapshot`, {
      snapname,
      ...(description ? { description } : {}),
    });
  }
  deleteSnapshot(
    node: string,
    vmid: number,
    snapname: string,
  ): Promise<string> {
    return this.call(
      "DELETE",
      `/nodes/${q(node)}/qemu/${vmid}/snapshot/${q(snapname)}`,
    );
  }
  rollbackSnapshot(
    node: string,
    vmid: number,
    snapname: string,
  ): Promise<string> {
    return this.call(
      "POST",
      `/nodes/${q(node)}/qemu/${vmid}/snapshot/${q(snapname)}/rollback`,
    );
  }

  // ─── Pare-feu ─────────────────────────────────────────────────────────────────

  firewallOptions(
    node: string,
    vmid: number,
  ): Promise<Record<string, unknown>> {
    return this.call("GET", `/nodes/${q(node)}/qemu/${vmid}/firewall/options`);
  }
  setFirewallOptions(
    node: string,
    vmid: number,
    params: Record<string, string | number | boolean>,
  ): Promise<null> {
    return this.call(
      "PUT",
      `/nodes/${q(node)}/qemu/${vmid}/firewall/options`,
      params,
    );
  }
  firewallRules(node: string, vmid: number): Promise<FirewallRule[]> {
    return this.call("GET", `/nodes/${q(node)}/qemu/${vmid}/firewall/rules`);
  }
  addFirewallRule(
    node: string,
    vmid: number,
    rule: Record<string, string | number | boolean>,
  ): Promise<null> {
    return this.call(
      "POST",
      `/nodes/${q(node)}/qemu/${vmid}/firewall/rules`,
      rule,
    );
  }
  deleteFirewallRule(node: string, vmid: number, pos: number): Promise<null> {
    return this.call(
      "DELETE",
      `/nodes/${q(node)}/qemu/${vmid}/firewall/rules/${pos}`,
    );
  }
  firewallIpsets(node: string, vmid: number): Promise<{ name: string }[]> {
    return this.call("GET", `/nodes/${q(node)}/qemu/${vmid}/firewall/ipset`);
  }
  createIpset(node: string, vmid: number, name: string): Promise<null> {
    return this.call("POST", `/nodes/${q(node)}/qemu/${vmid}/firewall/ipset`, {
      name,
    });
  }
  addIpsetEntry(
    node: string,
    vmid: number,
    name: string,
    cidr: string,
  ): Promise<null> {
    return this.call(
      "POST",
      `/nodes/${q(node)}/qemu/${vmid}/firewall/ipset/${q(name)}`,
      { cidr },
    );
  }

  // ─── Agent invité ─────────────────────────────────────────────────────────────

  agentPing(node: string, vmid: number): Promise<null> {
    return this.call("POST", `/nodes/${q(node)}/qemu/${vmid}/agent/ping`);
  }
  /** Adresses IPv4 vues par l'agent invité (hors bouclage) ; liste vide si l'agent ne répond pas encore. */
  async guestIpv4(node: string, vmid: number): Promise<string[]> {
    try {
      const out = await this.call<{
        result?: {
          name?: string;
          "ip-addresses"?: {
            "ip-address"?: string;
            "ip-address-type"?: string;
          }[];
        }[];
      }>("GET", `/nodes/${q(node)}/qemu/${vmid}/agent/network-get-interfaces`);
      const ips: string[] = [];
      for (const nic of out?.result ?? []) {
        if (nic.name === "lo") continue;
        for (const a of nic["ip-addresses"] ?? [])
          if (a["ip-address-type"] === "ipv4" && a["ip-address"])
            ips.push(a["ip-address"]);
      }
      return ips;
    } catch (e) {
      // 500 « QEMU guest agent is not running » tant que la VM démarre : ce n'est pas une panne.
      if (e instanceof ProxmoxError && e.code === "server_error") return [];
      throw e;
    }
  }

  // ─── Tâches ───────────────────────────────────────────────────────────────────

  taskStatus(upid: string): Promise<TaskStatus> {
    return this.call(
      "GET",
      `/nodes/${q(nodeOfUpid(upid))}/tasks/${q(upid)}/status`,
    );
  }

  /**
   * Attend la fin d'une tâche (UPID). `exitstatus` autre que « OK » → `task_failed` (« WARNINGS: n »
   * est accepté, comme le fait l'interface de Proxmox).
   */
  async waitTask(
    upid: string,
    opts: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<TaskStatus> {
    const timeoutMs = opts.timeoutMs ?? 300_000;
    const pollMs = opts.pollMs ?? 1_000;
    let waited = 0;
    for (;;) {
      const st = await this.taskStatus(upid);
      if (st.status === "stopped") {
        const exit = st.exitstatus ?? "";
        if (exit === "OK" || exit.startsWith("WARNINGS")) return st;
        throw new ProxmoxError(
          "task_failed",
          `tâche Proxmox en échec (${st.type ?? "?"}) : ${exit.slice(0, 200) || "sans détail"}`,
        );
      }
      if (waited >= timeoutMs)
        throw new ProxmoxError(
          "task_timeout",
          `tâche Proxmox toujours en cours après ${Math.round(timeoutMs / 1000)} s`,
        );
      await this.sleep(pollMs);
      waited += pollMs;
    }
  }
}
