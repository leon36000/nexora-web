import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import {
  APIDOC_META,
  type Coerced,
  matchPath,
  validateParams,
} from "./apidoc.ts";

/**
 * Simulateur de Proxmox VE : serveur HTTP local, en mémoire, qui répond comme l'API REST officielle
 * (`/api2/json`, authentification par jeton, enveloppe `{ data }`, tâches asynchrones par UPID).
 *
 * SOURCE : les chemins, méthodes, paramètres (types, bornes, énumérations, propriétés obligatoires
 * ou interdites) et formes de réponse viennent du schéma officiel `apidoc.js` du visualiseur
 * https://pve.proxmox.com/pve-docs/api-viewer/ (sous-ensemble dans `apidoc-subset.json`, daté par
 * `APIDOC_META.lastModified`). Une requête qui s'écarte du schéma est refusée comme le fait
 * Proxmox (400 « Parameter verification failed »). Ce que le schéma ne dit pas — messages d'erreur
 * d'exécution, verrous, délai de démarrage de l'agent — est reproduit de mémoire et marqué
 * « comportement observé » : le test de contrat contre un vrai serveur (PROXMOX_CONTRACT_URL) est
 * ce qui le confirme.
 */

export interface SimOptions {
  node?: string;
  /** Jeton attendu : `USER@REALM!TOKENID=UUID`. */
  token: string;
  /** Gabarits présents (VM `template: 1`). */
  templates?: { vmid: number; name: string; disk?: string }[];
  /** Consultations de tâche avant qu'elle soit « stopped » (défaut 1). */
  taskPolls?: number;
  /** Appels à l'agent invité avant qu'il réponde après un démarrage (défaut 1). */
  agentPolls?: number;
  /** Nombre maximal de VM (hors gabarits) ; au-delà, le clonage échoue. */
  maxVms?: number;
  /** HTTPS (pour tester l'épinglage du certificat). */
  tls?: { key: string; cert: string };
}

export interface SimVm {
  vmid: number;
  name: string;
  template: boolean;
  status: "running" | "stopped";
  lock?: string;
  config: Record<string, string | number | boolean>;
  snapshots: {
    name: string;
    description: string;
    snaptime: number;
    config: Record<string, string | number | boolean>;
  }[];
  firewall: {
    options: Record<string, string | number | boolean>;
    rules: { pos: number; [k: string]: string | number | boolean }[];
    ipsets: Record<string, string[]>;
  };
  agentWait: number;
  /** Invité injoignable : l'agent ne répond jamais (test d'échec d'attente). */
  agentDead: boolean;
}

export interface SimCall {
  method: string;
  path: string;
  params: Record<string, unknown>;
}

interface SimTask {
  upid: string;
  type: string;
  id: string;
  polls: number;
  done: boolean;
  exitstatus: string;
  effect?: () => void;
  /** VM verrouillée pendant la tâche (clone, instantané) ; le verrou tombe à la fin. */
  lockVmid?: number;
  startedAt: number;
}

export interface FailureRule {
  method: string;
  /** Sous-chaîne du chemin ou RegExp. */
  path: string | RegExp;
  status: number;
  message: string;
  /** Nombre de fois (défaut : une seule). */
  times?: number;
}

class HttpFail extends Error {
  readonly status: number;
  readonly errors?: Record<string, string>;
  constructor(
    status: number,
    message: string,
    errors?: Record<string, string>,
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
const fail500 = (m: string) => new HttpFail(500, m);

type Params = Record<string, Coerced>;
type Handler = (c: Ctx) => unknown;
interface Ctx {
  node: string;
  path: Record<string, string>;
  p: Params;
  vm: () => SimVm;
}

const SSH_KEY =
  /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/=]+( .*)?$/;

export class ProxmoxSimulator {
  readonly node: string;
  readonly vms = new Map<number, SimVm>();
  readonly calls: SimCall[] = [];
  readonly tasks = new Map<string, SimTask>();
  /** Nombre total de clones demandés (preuve « jamais deux fois »). */
  cloneRequests = 0;
  private readonly opts: SimOptions;
  private server?: Server;
  private failures: (FailureRule & { left: number })[] = [];
  private taskFail = new Map<string, string>();
  private seq = 1;
  private clock = Date.now();
  private readonly handlers = new Map<string, Handler>();

  constructor(opts: SimOptions) {
    this.opts = opts;
    this.node = opts.node ?? "pve1";
    for (const t of opts.templates ?? [
      { vmid: 9000, name: "debian-12-cloudinit" },
    ]) {
      this.vms.set(t.vmid, {
        vmid: t.vmid,
        name: t.name,
        template: true,
        status: "stopped",
        config: {
          name: t.name,
          template: 1,
          cores: 1,
          memory: 1024,
          scsi0: `${"local-lvm"}:base-${t.vmid}-disk-0,size=${t.disk ?? "10G"}`,
          net0: "virtio=BC:24:11:00:00:01,bridge=vmbr0",
          ide2: "local-lvm:vm-9000-cloudinit,media=cdrom",
          agent: "enabled=1",
        },
        snapshots: [],
        firewall: { options: {}, rules: [], ipsets: {} },
        agentWait: 0,
        agentDead: false,
      });
    }
    this.registerHandlers();
  }

  // ─── Pilotage par les tests ───────────────────────────────────────────────────

  /** Fait échouer les prochains appels qui correspondent (erreur HTTP avec message). */
  inject(rule: FailureRule) {
    this.failures.push({ ...rule, left: rule.times ?? 1 });
  }
  /** Une tâche de ce type (qmclone, qmstart…) se terminera en erreur avec ce message. */
  failTask(type: string, exitstatus: string) {
    this.taskFail.set(type, `ERROR: ${exitstatus}`);
  }
  clearFailures() {
    this.failures = [];
    this.taskFail.clear();
  }
  /** Termine toutes les tâches en cours (applique leurs effets). */
  settle() {
    for (const t of this.tasks.values()) this.complete(t);
  }
  /** Les VM de l'hôte (hors gabarits). */
  guests(): SimVm[] {
    return [...this.vms.values()].filter((v) => !v.template);
  }
  callsTo(method: string, pathPart: string | RegExp): SimCall[] {
    return this.calls.filter(
      (c) =>
        c.method === method &&
        (typeof pathPart === "string"
          ? c.path.includes(pathPart)
          : pathPart.test(c.path)),
    );
  }

  // ─── Serveur HTTP ─────────────────────────────────────────────────────────────

  async start(): Promise<{
    url: string;
    host: string;
    port: number;
    close(): Promise<void>;
  }> {
    const onRequest = (req: IncomingMessage, res: ServerResponse) => {
      void this.dispatch(req, res);
    };
    this.server = this.opts.tls
      ? createHttpsServer(
          { key: this.opts.tls.key, cert: this.opts.tls.cert },
          onRequest,
        )
      : createServer(onRequest);
    await new Promise<void>((resolve) =>
      this.server?.listen(0, "127.0.0.1", resolve),
    );
    const { port } = this.server.address() as AddressInfo;
    const server = this.server;
    return {
      url: `${this.opts.tls ? "https" : "http"}://127.0.0.1:${port}`,
      host: "127.0.0.1",
      port,
      close: () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    };
  }

  private async dispatch(req: IncomingMessage, res: ServerResponse) {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json;charset=UTF-8",
      });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url ?? "/", "http://sim");
      const method = (req.method ?? "GET").toUpperCase();
      if (req.headers.authorization !== `PVEAPIToken=${this.opts.token}`)
        return send(401, { data: null, message: "no valid credentials" });
      if (!url.pathname.startsWith("/api2/json/"))
        return send(501, {
          data: null,
          message: `Method '${method} ${url.pathname}' not implemented`,
        });
      const path = url.pathname.slice("/api2/json".length);
      let raw: Record<string, unknown> = {};
      if (method === "GET" || method === "DELETE") {
        for (const [k, v] of url.searchParams) raw[k] = v;
      } else {
        const body = await readBody(req);
        const type = req.headers["content-type"] ?? "";
        if (body) {
          if (type.includes("application/json")) raw = JSON.parse(body);
          else raw = Object.fromEntries(new URLSearchParams(body));
        }
      }
      this.calls.push({ method, path, params: raw });

      const injected = this.failures.find(
        (f) =>
          f.left > 0 &&
          f.method === method &&
          (typeof f.path === "string"
            ? path.includes(f.path)
            : f.path.test(path)),
      );
      if (injected) {
        injected.left -= 1;
        return send(injected.status, { data: null, message: injected.message });
      }

      const matched = matchPath(path);
      const def = matched?.methods[method];
      if (!matched || !def)
        return send(501, {
          data: null,
          message: `Method '${method} ${path}' not implemented`,
        });
      const validation = validateParams(def, { ...raw, ...matched.pathParams });
      if (!validation.ok)
        return send(400, {
          data: null,
          message: "Parameter verification failed.",
          errors: Object.fromEntries(
            validation.issues.map((i) => [i.param, i.message]),
          ),
        });
      const handler = this.handlers.get(`${method} ${matched.template}`);
      if (!handler)
        return send(501, {
          data: null,
          message: `Method '${method} ${path}' not implemented`,
        });
      const node = String(matched.pathParams.node ?? this.node);
      if (matched.pathParams.node && node !== this.node)
        throw fail500(`Configuration file 'nodes/${node}' does not exist`);
      const data = handler({
        node,
        path: matched.pathParams,
        p: validation.values,
        vm: () => this.requireVm(Number(matched.pathParams.vmid)),
      });
      send(200, { data: data ?? null });
    } catch (e) {
      if (e instanceof HttpFail)
        return send(e.status, {
          data: null,
          message: e.message,
          ...(e.errors ? { errors: e.errors } : {}),
        });
      send(500, {
        data: null,
        message: e instanceof Error ? e.message : "erreur interne",
      });
    }
  }

  // ─── Tâches ───────────────────────────────────────────────────────────────────

  private newTask(
    type: string,
    id: string,
    effect?: () => void,
    lockVmid?: number,
  ): string {
    const n = this.seq++;
    const hex = (v: number, w: number) =>
      v.toString(16).toUpperCase().padStart(w, "0");
    const upid = `UPID:${this.node}:${hex(1000 + n, 8)}:${hex(n, 8)}:${hex(Math.floor(this.clock / 1000), 8)}:${type}:${id}:root@pam!nexora:`;
    this.tasks.set(upid, {
      upid,
      type,
      id,
      polls: 0,
      done: false,
      exitstatus: "OK",
      effect,
      lockVmid,
      startedAt: Math.floor(this.clock / 1000),
    });
    return upid;
  }

  private complete(t: SimTask) {
    if (t.done) return;
    t.done = true;
    const failure = this.taskFail.get(t.type);
    if (failure) t.exitstatus = failure;
    else t.effect?.();
    // Le verrou de VM tombe quand la tâche se termine (qu'elle réussisse ou non).
    const locked =
      t.lockVmid === undefined ? undefined : this.vms.get(t.lockVmid);
    if (locked) locked.lock = undefined;
  }

  // ─── Utilitaires de VM ────────────────────────────────────────────────────────

  private requireVm(vmid: number): SimVm {
    const vm = this.vms.get(vmid);
    if (!vm)
      throw fail500(
        `Configuration file 'nodes/${this.node}/qemu-server/${vmid}.conf' does not exist`,
      );
    return vm;
  }
  private mutable(vm: SimVm): SimVm {
    if (vm.lock) throw fail500(`VM is locked (${vm.lock})`);
    return vm;
  }
  private guest(vm: SimVm): SimVm {
    if (vm.template) throw fail500("unable to modify a template VM");
    return vm;
  }

  private registerHandlers() {
    const on = (key: string, h: Handler) => this.handlers.set(key, h);

    on("GET /version", () => ({
      version: "9.0.3",
      release: "9.0",
      repoid: "simulated",
    }));
    on("GET /cluster/nextid", ({ p }) => {
      if (p.vmid !== undefined) {
        const id = Number(p.vmid);
        if (this.vms.has(id)) throw fail500(`VM ${id} already exists`);
        return String(id);
      }
      let id = 100;
      while (this.vms.has(id)) id++;
      return String(id);
    });
    on("GET /nodes", () => [
      {
        node: this.node,
        status: "online",
        type: "node",
        maxcpu: 32,
        maxmem: 137_438_953_472,
        id: `node/${this.node}`,
      },
    ]);
    on("GET /nodes/{node}/status", () => ({
      uptime: 86_400,
      cpu: 0.03,
      loadavg: ["0.10", "0.08", "0.05"],
      "boot-info": { mode: "efi", secureboot: false },
      cpuinfo: { cpus: 32, cores: 16, model: "Simulated CPU", sockets: 1 },
      "current-kernel": {
        sysname: "Linux",
        release: "6.14.8-2-pve",
        version: "#1 SMP PREEMPT_DYNAMIC",
        machine: "x86_64",
      },
      memory: {
        total: 137_438_953_472,
        used: 8_589_934_592,
        free: 128_849_018_880,
        available: 128_849_018_880,
      },
      rootfs: {
        total: 100_000_000_000,
        used: 10_000_000_000,
        free: 90_000_000_000,
        avail: 90_000_000_000,
      },
      pveversion: "pve-manager/9.0.3/simulated",
    }));
    on("GET /nodes/{node}/storage", () => [
      {
        storage: "local-lvm",
        type: "lvmthin",
        content: "images,rootdir",
        active: 1,
        enabled: 1,
        total: 2_000_000_000_000,
        used: 100_000_000_000,
        avail: 1_900_000_000_000,
      },
    ]);
    on("GET /nodes/{node}/qemu", () =>
      [...this.vms.values()].map((v) => ({
        vmid: v.vmid,
        name: v.name,
        status: v.status,
        ...(v.template ? { template: 1 } : {}),
        ...(v.lock ? { lock: v.lock } : {}),
        ...(typeof v.config.tags === "string" ? { tags: v.config.tags } : {}),
      })),
    );

    on("POST /nodes/{node}/qemu/{vmid}/clone", ({ p, vm }) => {
      this.cloneRequests++;
      const src = vm();
      const newid = Number(p.newid);
      if (this.vms.has(newid))
        throw fail500(
          `unable to create VM ${newid} - VM ${newid} already exists on node '${this.node}'`,
        );
      if (
        this.opts.maxVms !== undefined &&
        this.guests().length >= this.opts.maxVms
      )
        throw fail500("unable to create VM - maximum number of VMs reached");
      if (src.lock) throw fail500(`VM is locked (${src.lock})`);
      const config = { ...src.config };
      delete config.template;
      if (p.name) config.name = String(p.name);
      if (p.description) config.description = String(p.description);
      const clone: SimVm = {
        vmid: newid,
        name: String(p.name ?? `Copy-of-VM-${src.name}`),
        template: false,
        status: "stopped",
        lock: "clone",
        config,
        snapshots: [],
        firewall: { options: {}, rules: [], ipsets: {} },
        agentWait: 0,
        agentDead: false,
      };
      this.vms.set(newid, clone);
      return this.newTask("qmclone", String(src.vmid), undefined, newid);
    });

    on("GET /nodes/{node}/qemu/{vmid}/config", ({ vm }) => {
      const v = vm();
      const out: Record<string, string | number | boolean> = {};
      for (const [k, val] of Object.entries(v.config))
        out[k] = k === "cipassword" ? "**********" : val;
      if (v.lock) out.lock = v.lock;
      out.digest = digestOf(v);
      return out;
    });

    on("PUT /nodes/{node}/qemu/{vmid}/config", ({ p, vm }) => {
      const v = this.guest(this.mutable(vm()));
      if (p.digest !== undefined && p.digest !== digestOf(v))
        throw fail500(
          "detected modified configuration - file changed by other user? Try again.",
        );
      const apply: Record<string, string | number | boolean> = {};
      for (const [k, val] of Object.entries(p)) {
        if (
          ["vmid", "node", "delete", "digest", "skiplock", "revert"].includes(k)
        )
          continue;
        if (k === "sshkeys") {
          let decoded: string;
          try {
            decoded = decodeURIComponent(String(val));
          } catch {
            throw new HttpFail(400, "Parameter verification failed.", {
              sshkeys: "invalid urlencoded string",
            });
          }
          for (const line of decoded
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean))
            if (!SSH_KEY.test(line))
              throw new HttpFail(400, "Parameter verification failed.", {
                sshkeys: "invalid SSH public key",
              });
        }
        if (
          /^ipconfig\d+$/.test(k) &&
          !/^(ip=(dhcp|manual|\d{1,3}(\.\d{1,3}){3}\/\d{1,2}))(,gw=\d{1,3}(\.\d{1,3}){3})?(,(ip6|gw6)=\S+)*$/.test(
            String(val),
          )
        )
          throw new HttpFail(400, "Parameter verification failed.", {
            [k]: "invalid format - format error",
          });
        apply[k] = val;
      }
      if (typeof p.delete === "string")
        for (const key of p.delete.split(",").map((s) => s.trim()))
          delete v.config[key];
      Object.assign(v.config, apply);
      if (typeof apply.name === "string") v.name = apply.name;
      return null;
    });

    on("PUT /nodes/{node}/qemu/{vmid}/resize", ({ p, vm }) => {
      const v = this.guest(this.mutable(vm()));
      const disk = String(p.disk);
      const cur = v.config[disk];
      if (typeof cur !== "string")
        throw fail500(`disk '${disk}' does not exist`);
      const m = /size=(\d+)([GM])/.exec(cur);
      if (!m) throw fail500(`unable to parse size of '${disk}'`);
      const curGb = Number(m[1]) / (m[2] === "M" ? 1024 : 1);
      const want = String(p.size);
      const sm = /^(\+)?(\d+)([GM])?$/.exec(want);
      if (!sm)
        throw new HttpFail(400, "Parameter verification failed.", {
          size: "invalid size",
        });
      const wantGb = Number(sm[2]) / (sm[3] === "M" ? 1024 : 1);
      const next = sm[1] ? curGb + wantGb : wantGb;
      if (next < curGb) throw fail500("shrinking disks is not supported");
      v.config[disk] = cur.replace(/size=\d+[GM]/, `size=${next}G`);
      return null;
    });

    on("GET /nodes/{node}/qemu/{vmid}/status/current", ({ vm }) => {
      const v = vm();
      return {
        status: v.status,
        qmpstatus: v.status,
        vmid: v.vmid,
        name: v.name,
        agent: 1,
        ...(v.lock ? { lock: v.lock } : {}),
        ...(v.template ? { template: true } : {}),
        uptime: v.status === "running" ? 60 : 0,
      };
    });

    const power =
      (action: "start" | "stop" | "shutdown" | "reboot"): Handler =>
      ({ vm }) => {
        const v = this.guest(this.mutable(vm()));
        const type = `qm${action}`;
        if (action === "start" && v.status === "running")
          throw fail500("VM is already running");
        if (action === "reboot" && v.status !== "running")
          throw fail500("VM is not running");
        return this.newTask(type, String(v.vmid), () => {
          if (action === "start") {
            v.status = "running";
            v.agentWait = this.opts.agentPolls ?? 1;
          } else if (action === "reboot") {
            v.agentWait = this.opts.agentPolls ?? 1;
          } else {
            v.status = "stopped";
          }
        });
      };
    for (const a of ["start", "stop", "shutdown", "reboot"] as const)
      on(`POST /nodes/{node}/qemu/{vmid}/status/${a}`, power(a));

    on("DELETE /nodes/{node}/qemu/{vmid}", ({ vm }) => {
      const v = vm();
      if (v.status === "running")
        throw fail500("VM is running - destroy failed");
      if (v.lock) throw fail500(`VM is locked (${v.lock})`);
      return this.newTask("qmdestroy", String(v.vmid), () => {
        this.vms.delete(v.vmid);
      });
    });

    on("GET /nodes/{node}/qemu/{vmid}/snapshot", ({ vm }) => [
      ...vm().snapshots.map((s) => ({
        name: s.name,
        description: s.description,
        snaptime: s.snaptime,
      })),
      { name: "current", description: "You are here!" },
    ]);
    on("POST /nodes/{node}/qemu/{vmid}/snapshot", ({ p, vm }) => {
      const v = this.guest(this.mutable(vm()));
      const name = String(p.snapname);
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name))
        throw new HttpFail(400, "Parameter verification failed.", {
          snapname: "invalid format - not a valid config id",
        });
      if (v.snapshots.some((s) => s.name === name))
        throw fail500(`snapshot name '${name}' already used`);
      v.lock = "snapshot";
      return this.newTask(
        "qmsnapshot",
        String(v.vmid),
        () => {
          v.snapshots.push({
            name,
            description: String(p.description ?? ""),
            snaptime: Math.floor(this.clock / 1000),
            config: { ...v.config },
          });
        },
        v.vmid,
      );
    });
    on(
      "DELETE /nodes/{node}/qemu/{vmid}/snapshot/{snapname}",
      ({ path, vm }) => {
        const v = this.mutable(vm());
        const name = path.snapname as string;
        if (!v.snapshots.some((s) => s.name === name))
          throw fail500(`snapshot '${name}' does not exist`);
        v.lock = "snapshot";
        return this.newTask(
          "qmdelsnapshot",
          String(v.vmid),
          () => {
            v.snapshots = v.snapshots.filter((s) => s.name !== name);
          },
          v.vmid,
        );
      },
    );
    on(
      "POST /nodes/{node}/qemu/{vmid}/snapshot/{snapname}/rollback",
      ({ path, vm }) => {
        const v = this.mutable(vm());
        const snap = v.snapshots.find((s) => s.name === path.snapname);
        if (!snap) throw fail500(`snapshot '${path.snapname}' does not exist`);
        v.lock = "rollback";
        return this.newTask(
          "qmrollback",
          String(v.vmid),
          () => {
            v.config = { ...snap.config };
            v.status = "stopped";
          },
          v.vmid,
        );
      },
    );

    on("GET /nodes/{node}/qemu/{vmid}/firewall/options", ({ vm }) => ({
      ...vm().firewall.options,
    }));
    on("PUT /nodes/{node}/qemu/{vmid}/firewall/options", ({ p, vm }) => {
      const v = this.guest(vm());
      for (const [k, val] of Object.entries(p)) {
        if (["vmid", "node", "digest"].includes(k)) continue;
        if (k === "delete") continue;
        v.firewall.options[k] = typeof val === "boolean" ? (val ? 1 : 0) : val;
      }
      return null;
    });
    on("GET /nodes/{node}/qemu/{vmid}/firewall/rules", ({ vm }) =>
      vm().firewall.rules.map((r) => ({ ...r })),
    );
    on("POST /nodes/{node}/qemu/{vmid}/firewall/rules", ({ p, vm }) => {
      const v = this.guest(vm());
      const rule: { pos: number; [k: string]: string | number | boolean } = {
        pos: v.firewall.rules.length,
      };
      for (const [k, val] of Object.entries(p))
        if (!["vmid", "node", "digest", "pos"].includes(k))
          rule[k] = typeof val === "boolean" ? (val ? 1 : 0) : val;
      const pos = p.pos === undefined ? v.firewall.rules.length : Number(p.pos);
      v.firewall.rules.splice(pos, 0, rule);
      v.firewall.rules.forEach((r, i) => {
        r.pos = i;
      });
      return null;
    });
    on(
      "DELETE /nodes/{node}/qemu/{vmid}/firewall/rules/{pos}",
      ({ path, vm }) => {
        const v = vm();
        const pos = Number(path.pos);
        if (!v.firewall.rules[pos]) throw fail500(`no rule at position ${pos}`);
        v.firewall.rules.splice(pos, 1);
        v.firewall.rules.forEach((r, i) => {
          r.pos = i;
        });
        return null;
      },
    );
    on("GET /nodes/{node}/qemu/{vmid}/firewall/ipset", ({ vm }) =>
      Object.keys(vm().firewall.ipsets).map((name) => ({ name })),
    );
    on("POST /nodes/{node}/qemu/{vmid}/firewall/ipset", ({ p, vm }) => {
      const v = this.guest(vm());
      const name = String(p.name);
      if (v.firewall.ipsets[name])
        throw fail500(`IPSet '${name}' already exists`);
      v.firewall.ipsets[name] = [];
      return null;
    });
    on(
      "GET /nodes/{node}/qemu/{vmid}/firewall/ipset/{name}",
      ({ path, vm }) => {
        const set = vm().firewall.ipsets[path.name as string];
        if (!set) throw fail500(`IPSet '${path.name}' does not exist`);
        return set.map((cidr) => ({ cidr }));
      },
    );
    on(
      "POST /nodes/{node}/qemu/{vmid}/firewall/ipset/{name}",
      ({ path, p, vm }) => {
        const set = vm().firewall.ipsets[path.name as string];
        if (!set) throw fail500(`IPSet '${path.name}' does not exist`);
        if (!set.includes(String(p.cidr))) set.push(String(p.cidr));
        return null;
      },
    );

    const agentReady = (v: SimVm) => {
      if (v.status !== "running") throw fail500("VM is not running");
      if (v.agentDead) throw fail500("QEMU guest agent is not running");
      if (v.agentWait > 0) {
        v.agentWait -= 1;
        throw fail500("QEMU guest agent is not running");
      }
    };
    on("POST /nodes/{node}/qemu/{vmid}/agent/ping", ({ vm }) => {
      agentReady(vm());
      return null;
    });
    on(
      "GET /nodes/{node}/qemu/{vmid}/agent/network-get-interfaces",
      ({ vm }) => {
        const v = vm();
        agentReady(v);
        const ipconfig = String(v.config.ipconfig0 ?? "");
        const m = /ip=(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})/.exec(ipconfig);
        return {
          result: [
            {
              name: "lo",
              "hardware-address": "00:00:00:00:00:00",
              "ip-addresses": [
                {
                  "ip-address": "127.0.0.1",
                  "ip-address-type": "ipv4",
                  prefix: 8,
                },
              ],
            },
            {
              name: "eth0",
              "hardware-address": "bc:24:11:00:00:02",
              "ip-addresses": m
                ? [
                    {
                      "ip-address": m[1],
                      "ip-address-type": "ipv4",
                      prefix: Number(m[2]),
                    },
                  ]
                : [],
            },
          ],
        };
      },
    );

    const taskOf = (upid: string): SimTask => {
      const t = this.tasks.get(upid);
      if (!t) throw fail500(`no such task '${upid}'`);
      return t;
    };
    on("GET /nodes/{node}/tasks/{upid}/status", ({ path }) => {
      const t = taskOf(path.upid as string);
      if (!t.done) {
        t.polls += 1;
        if (t.polls >= (this.opts.taskPolls ?? 1)) this.complete(t);
      }
      const parts = t.upid.split(":");
      return {
        upid: t.upid,
        node: this.node,
        pid: 1000 + Number.parseInt(parts[2] ?? "0", 16),
        pstart: 1,
        starttime: t.startedAt,
        type: t.type,
        id: t.id,
        user: "root@pam!nexora",
        status: t.done ? "stopped" : "running",
        ...(t.done ? { exitstatus: t.exitstatus } : {}),
      };
    });
    on("GET /nodes/{node}/tasks/{upid}/log", ({ path }) => {
      const t = taskOf(path.upid as string);
      return [{ n: 1, t: `TASK ${t.done ? t.exitstatus : "running"}` }];
    });
  }

  /** Source du schéma (pour les rapports de test). */
  static schemaSource() {
    return APIDOC_META;
  }
}

function digestOf(v: SimVm): string {
  return Buffer.from(JSON.stringify(v.config))
    .toString("hex")
    .slice(0, 40)
    .padEnd(40, "0");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
