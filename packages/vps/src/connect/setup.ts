import { randomUUID } from "node:crypto";
import {
  type Database,
  enqueue,
  eq,
  type IpPool,
  osTemplates,
  type ProxmoxCapacity,
  proxmoxServers,
  type Region,
  type ServerSetup,
  type SetupStep,
  sql,
  vpsInstances,
} from "@nexora/db";
import { type EngineDeps, sleepFor } from "../engine-core.ts";
import { safeError } from "../events.ts";
import { pickFreeIp } from "../ips.ts";
import { type ProxmoxClient, ProxmoxError } from "../proxmox/client.ts";
import { connectionOf } from "../servers.ts";
import {
  type Discovery,
  type DiscoveryProblem,
  discoverServer,
  explainProxmoxError,
} from "./discover.ts";
import {
  type CloudImage,
  imageByCode,
  publishedChecksum,
  storedFilename,
} from "./images.ts";
import { validateNetwork } from "./network.ts";

type Server = typeof proxmoxServers.$inferSelect;

export class SetupError extends Error {
  readonly code:
    | "not_found"
    | "prerequisites"
    | "invalid_network"
    | "invalid_request"
    | "unreachable";
  readonly details?: unknown;
  constructor(code: SetupError["code"], message: string, details?: unknown) {
    super(message);
    this.name = "SetupError";
    this.code = code;
    this.details = details;
  }
}

export interface SetupInput {
  name: string;
  node: string;
  region: Region;
  vmStorage: string;
  importStorage: string;
  pool: string | null;
  capacity: ProxmoxCapacity;
  network: IpPool;
  /** Codes des gabarits à préparer (`debian-12-ci`, `ubuntu-24-04-ci`). */
  templates: string[];
}

export const SETUP_JOB = "vps.server_setup";
/** Un branchement « en cours » plus vieux que cela est considéré comme abandonné. */
const ACTIVE_WINDOW_MS = 60 * 60_000;
/** Plage de numéros de VM réservée aux gabarits (loin sous celle des VPS clients). */
const TEMPLATE_VMID_SPAN = 50;

const isActive = (s: ServerSetup | null | undefined, now: number) =>
  Boolean(
    s &&
      (s.status === "pending" || s.status === "running") &&
      now - Date.parse(s.requestedAt) < ACTIVE_WINDOW_MS,
  );

export async function getSetup(
  db: Database,
  serverId: string,
): Promise<ServerSetup | null> {
  const [row] = await db
    .select({ setup: proxmoxServers.setup })
    .from(proxmoxServers)
    .where(eq(proxmoxServers.id, serverId));
  return row?.setup ?? null;
}

const stepLabels = (code: string) => {
  const image = imageByCode(code);
  return {
    image: `Image ${image.name} : téléchargement par le serveur et vérification de la somme publiée`,
    template: `Gabarit ${image.name} : fabrication (disque importé, agent invité, conversion)`,
  };
};

function plannedSteps(templates: string[], at: string): SetupStep[] {
  const mk = (id: string, label: string): SetupStep => ({
    id,
    label,
    status: "pending",
    updatedAt: at,
  });
  return [
    mk("connexion", "Connexion, version de Proxmox et droits du jeton"),
    ...templates.flatMap((code) => [
      mk(`image:${code}`, stepLabels(code).image),
      mk(`gabarit:${code}`, stepLabels(code).template),
    ]),
    mk("verification", "Vérification finale du serveur"),
  ];
}

// ─── Demande de branchement (appelée par l'administration) ──────────────────────────

/**
 * Valide les choix de l'opérateur contre l'état réel du serveur, les enregistre sur la fiche et
 * met le branchement en file pour le worker. Rien n'est enregistré si un prérequis manque ou si
 * le bloc d'adresses est incohérent. Rejouable : un branchement déjà en cours est renvoyé tel quel.
 */
export async function startSetup(
  db: Database,
  serverId: string,
  input: SetupInput,
  deps: {
    client: (server: Server) => Promise<ProxmoxClient>;
    now?: () => Date;
  },
): Promise<{
  server: Server;
  setup: ServerSetup;
  discovery: Discovery | null;
  warnings: string[];
}> {
  const now = (deps.now ?? (() => new Date()))();
  const [server] = await db
    .select()
    .from(proxmoxServers)
    .where(eq(proxmoxServers.id, serverId));
  if (!server) throw new SetupError("not_found", "serveur introuvable");
  if (server.setup && isActive(server.setup, now.getTime()))
    return { server, setup: server.setup, discovery: null, warnings: [] };

  if (input.templates.length === 0)
    throw new SetupError(
      "invalid_request",
      "Choisir au moins un système à préparer (Debian 12 ou Ubuntu 24.04).",
    );
  for (const code of input.templates) {
    try {
      imageByCode(code);
    } catch {
      throw new SetupError("invalid_request", `Système inconnu : ${code}.`);
    }
  }
  if (
    !(
      input.capacity.vcpu > 0 &&
      input.capacity.ramMb > 0 &&
      input.capacity.diskGb > 0
    )
  )
    throw new SetupError(
      "invalid_request",
      "Capacité : vCPU, RAM et disque doivent être positifs.",
    );

  let discovery: Discovery;
  try {
    const client = await deps.client(server);
    discovery = await discoverServer(client, {
      node: input.node,
      vmStorage: input.vmStorage,
      importStorage: input.importStorage,
      bridge: input.network.bridge,
      pool: input.pool,
    });
  } catch (e) {
    if (e instanceof ProxmoxError) {
      const x = explainProxmoxError(e);
      throw new SetupError("unreachable", x.cause, { action: x.action });
    }
    throw e;
  }
  const blocking = discovery.problems.filter((p) => p.severity === "blocking");
  if (blocking.length > 0)
    throw new SetupError(
      "prerequisites",
      "Des prérequis manquent sur le serveur Proxmox.",
      blocking satisfies DiscoveryProblem[],
    );
  if (input.capacity.ramMb > discovery.capacity.ramMb / 0.85)
    throw new SetupError(
      "invalid_request",
      "La mémoire déclarée dépasse celle du serveur.",
    );
  if (input.capacity.vcpu > discovery.capacity.vcpu * 8)
    throw new SetupError(
      "invalid_request",
      "Le nombre de vCPU déclaré dépasse de plus de 8 fois celui du serveur.",
    );

  const conn = connectionOf(server);
  const bridge = discovery.bridges.find((b) => b.name === input.network.bridge);
  const nodeAddresses = [
    ...(/^\d{1,3}(\.\d{1,3}){3}$/.test(conn.host) ? [conn.host] : []),
    ...discovery.bridges
      .map((b) => b.cidr?.split("/")[0])
      .filter((a): a is string => Boolean(a)),
  ];
  const net = validateNetwork(input.network, {
    nodeAddresses,
    bridgeCidr: bridge?.cidr ?? null,
  });
  if (net.errors.length > 0)
    throw new SetupError(
      "invalid_network",
      "Le bloc d'adresses est invalide.",
      net.errors,
    );

  const requestedAt = now.toISOString();
  const runId = randomUUID();
  const setup: ServerSetup = {
    runId,
    status: "pending",
    requestedAt,
    plan: {
      node: input.node,
      vmStorage: input.vmStorage,
      importStorage: input.importStorage,
      bridge: input.network.bridge,
      pool: input.pool,
      templates: input.templates,
    },
    steps: plannedSteps(input.templates, requestedAt),
  };

  return db.transaction(async (tx) => {
    // Verrou de ligne : deux demandes simultanées ne créent qu'un branchement.
    const [locked] = await tx
      .select()
      .from(proxmoxServers)
      .where(eq(proxmoxServers.id, serverId))
      .for("update");
    if (!locked) throw new SetupError("not_found", "serveur introuvable");
    if (locked.setup && isActive(locked.setup, now.getTime()))
      return {
        server: locked,
        setup: locked.setup,
        discovery,
        warnings: net.warnings,
      };
    const [updated] = await tx
      .update(proxmoxServers)
      .set({
        name: input.name.trim() || locked.name,
        node: input.node,
        region: input.region,
        capacity: input.capacity,
        ipPool: input.network,
        storage: input.vmStorage,
        pool: input.pool,
        setup,
        updatedAt: now,
      })
      .where(eq(proxmoxServers.id, serverId))
      .returning();
    await enqueue(tx, {
      type: SETUP_JOB,
      payload: { serverId, runId },
      idempotencyKey: `vps-setup:${runId}`,
      maxAttempts: 3,
    });
    return {
      server: updated ?? locked,
      setup,
      discovery,
      warnings: net.warnings,
    };
  });
}

// ─── Exécution par le worker ──────────────────────────────────────────────────────

export interface SetupDeps extends EngineDeps {
  /** Lit un petit texte HTTPS public (fichier de sommes de l'éditeur), avec les gardes SSRF. */
  fetchText: (url: string) => Promise<string>;
}

/** Échec d'une étape : cause et action en français. */
class StepFailure extends Error {
  readonly cause_: string;
  readonly action: string;
  readonly detail?: string;
  constructor(cause: string, action: string, detail?: string) {
    super(cause);
    this.cause_ = cause;
    this.action = action;
    this.detail = detail;
  }
}
class Obsolete extends Error {}

class Run {
  private readonly deps: SetupDeps;
  private readonly serverId: string;
  readonly setup: ServerSetup;
  constructor(deps: SetupDeps, serverId: string, setup: ServerSetup) {
    this.deps = deps;
    this.serverId = serverId;
    this.setup = setup;
  }

  private find(id: string): SetupStep {
    const s = this.setup.steps.find((x) => x.id === id);
    if (!s) throw new Error(`étape inconnue : ${id}`);
    return s;
  }
  async save() {
    const rows = await this.deps.db
      .update(proxmoxServers)
      .set({ setup: this.setup, updatedAt: this.deps.now() })
      .where(
        sql`${proxmoxServers.id} = ${this.serverId} AND ${proxmoxServers.setup}->>'runId' = ${this.setup.runId}`,
      )
      .returning({ id: proxmoxServers.id });
    if (rows.length === 0) throw new Obsolete();
  }
  async mark(
    id: string,
    status: SetupStep["status"],
    extra: Partial<Pick<SetupStep, "detail" | "cause" | "action">> = {},
  ) {
    const step = this.find(id);
    step.status = status;
    step.updatedAt = this.deps.now().toISOString();
    step.detail = extra.detail;
    step.cause = extra.cause;
    step.action = extra.action;
    await this.save();
  }
  running(id: string, detail?: string) {
    return this.mark(id, "running", { detail });
  }
  ok(id: string, detail?: string) {
    return this.mark(id, "ok", { detail });
  }
  skipped(id: string, detail?: string) {
    return this.mark(id, "skipped", { detail });
  }
  failed(id: string, f: StepFailure) {
    return this.mark(id, "failed", {
      cause: f.cause_,
      action: f.action,
      detail: f.detail,
    });
  }
}

const hasTag = (tags: unknown) =>
  String(tags ?? "")
    .split(/[;,\s]+/)
    .includes("nexora-template");

function asFailure(e: unknown, fallback: { cause: string; action: string }) {
  if (e instanceof StepFailure) return e;
  if (e instanceof ProxmoxError) {
    const x = explainProxmoxError(e);
    return new StepFailure(x.cause, x.action, safeError(e));
  }
  return new StepFailure(fallback.cause, fallback.action, safeError(e));
}

/**
 * Exécute un branchement demandé par `startSetup`. Chaque étape relit l'état réel de Proxmox et ne
 * refait que ce qui manque : relancer (ou reprendre après un plantage) ne crée ni doublon de
 * téléchargement, ni de VM, ni de ligne de gabarit. Le serveur ne devient « prêt » qu'à la fin des
 * vérifications.
 */
export async function runSetup(
  deps: SetupDeps,
  serverId: string,
  runId: string,
): Promise<ServerSetup> {
  const [server] = await deps.db
    .select()
    .from(proxmoxServers)
    .where(eq(proxmoxServers.id, serverId));
  if (!server) throw new SetupError("not_found", "serveur introuvable");
  const current = server.setup;
  // Tâche obsolète (un autre branchement a été lancé depuis) ou déjà terminée : rien à faire.
  if (!current || current.runId !== runId) return current as ServerSetup;
  if (current.status === "succeeded" || current.status === "failed")
    return current;

  const run = new Run(deps, serverId, current);
  try {
    current.status = "running";
    current.startedAt = deps.now().toISOString();
    await run.save();
    const client = await deps.proxmox(server);
    const plan = current.plan;

    await stepConnexion(deps, run, server, client);
    for (const code of plan.templates) {
      await stepImage(deps, run, client, plan, code);
      await stepTemplate(deps, run, server, client, plan, code);
    }
    await stepVerification(deps, run, server, client, plan);
    current.status = "succeeded";
    current.finishedAt = deps.now().toISOString();
    await run.save();
  } catch (e) {
    if (e instanceof Obsolete)
      return (await getSetup(deps.db, serverId)) ?? current;
    current.status = "failed";
    current.finishedAt = deps.now().toISOString();
    try {
      await run.save();
    } catch {
      /* obsolète : un autre branchement a pris la place */
    }
    if (!(e instanceof StepFailure))
      deps.log.error("vps : branchement interrompu", {
        serverId,
        errorName: e instanceof Error ? e.name : typeof e,
      });
  }
  return current;
}

/** Exécute une étape ; en cas d'échec, l'enregistre puis interrompt le branchement. */
async function guarded<T>(
  run: Run,
  id: string,
  fallback: { cause: string; action: string },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Obsolete) throw e;
    const f = asFailure(e, fallback);
    await run.failed(id, f);
    throw f;
  }
}

const UNEXPECTED = {
  cause: "Erreur inattendue pendant cette étape.",
  action:
    "Relancer le branchement ; si l'erreur persiste, consulter le journal du worker.",
};

async function stepConnexion(
  deps: SetupDeps,
  run: Run,
  server: Server,
  client: ProxmoxClient,
) {
  const plan = run.setup.plan;
  await run.running("connexion");
  await guarded(run, "connexion", UNEXPECTED, async () => {
    if (!deps.settings.workerSshPublicKey)
      throw new StepFailure(
        "La clé SSH publique du worker n'est pas configurée : elle est nécessaire pour préparer l'agent invité dans le gabarit.",
        "Générer la paire de clés du worker (guide opérateur, § 7), mettre la clé privée au Coffre (vps.worker_ssh_key) et la clé publique dans VPS_WORKER_SSH_PUBLIC_KEY, puis relancer.",
      );
    const d = await discoverServer(client, {
      node: plan.node,
      vmStorage: plan.vmStorage,
      importStorage: plan.importStorage,
      bridge: plan.bridge,
      pool: plan.pool,
    });
    const blocking = d.problems.find((p) => p.severity === "blocking");
    if (blocking) throw new StepFailure(blocking.message, blocking.action);
    if (!(await buildAddress(deps, server)))
      throw new StepFailure(
        "Aucune adresse du bloc n'est libre pour la VM de préparation.",
        "Agrandir le bloc d'adresses ou libérer une adresse, puis relancer.",
      );
    await run.ok(
      "connexion",
      `Proxmox VE ${d.version}, nœud ${plan.node}, droits du jeton vérifiés`,
    );
  });
}

/** Adresse libre du bloc pour la VM de préparation (jamais celle d'un VPS client). */
async function buildAddress(deps: SetupDeps, server: Server) {
  const used = await deps.db
    .select({ ipv4: vpsInstances.ipv4 })
    .from(vpsInstances)
    .where(
      sql`${vpsInstances.serverId} = ${server.id} AND ${vpsInstances.deletedAt} IS NULL`,
    );
  return pickFreeIp(
    server.ipPool,
    new Set(used.map((r) => r.ipv4).filter((v): v is string => Boolean(v))),
  );
}

async function stepImage(
  deps: SetupDeps,
  run: Run,
  client: ProxmoxClient,
  plan: ServerSetup["plan"],
  code: string,
) {
  const id = `image:${code}`;
  const image = imageByCode(code);
  await run.running(id);
  await guarded(run, id, UNEXPECTED, async () => {
    let sum: string;
    try {
      sum = await publishedChecksum(image, deps.fetchText);
    } catch (e) {
      throw new StepFailure(
        "La somme de contrôle publiée par l'éditeur est introuvable ou illisible.",
        `Vérifier que le worker peut joindre ${new URL(image.checksumUrl).host} en HTTPS, puis relancer.`,
        safeError(e),
      );
    }
    const filename = storedFilename(image, sum);
    const volid = `${plan.importStorage}:import/${filename}`;
    const have = await client.storageContent(
      plan.node,
      plan.importStorage,
      "import",
    );
    if (have.some((v) => v.volid === volid)) {
      await run.skipped(id, `déjà présente (${filename})`);
      return;
    }
    const upid = await client.downloadUrl(plan.node, plan.importStorage, {
      url: image.imageUrl,
      content: "import",
      filename,
      checksum: sum,
      checksumAlgorithm: image.checksumAlgorithm,
      verifyCertificates: true,
    });
    try {
      await client.waitTask(upid, {
        timeoutMs: Math.max(deps.settings.taskTimeoutMs, 1_800_000),
        pollMs: deps.settings.taskPollMs,
      });
    } catch (e) {
      if (e instanceof ProxmoxError && /checksum/i.test(e.message))
        throw new StepFailure(
          "La somme de l'image téléchargée ne correspond pas à celle publiée par l'éditeur : Proxmox a refusé le fichier.",
          "Relancer (l'éditeur a peut-être publié une nouvelle version entre-temps). Si cela se répète, ne rien contourner : l'image n'est pas fiable.",
          safeError(e),
        );
      if (e instanceof ProxmoxError && e.code === "task_timeout")
        throw new StepFailure(
          "Le téléchargement de l'image est trop long.",
          "Vérifier l'accès à Internet du serveur Proxmox (DNS, passerelle, proxy), puis relancer.",
          safeError(e),
        );
      if (e instanceof ProxmoxError && e.code === "task_failed")
        throw new StepFailure(
          "Le serveur Proxmox n'a pas pu télécharger l'image.",
          "Vérifier que le serveur Proxmox accède à Internet en HTTPS (DNS et passerelle), puis relancer.",
          safeError(e),
        );
      throw e;
    }
    await run.ok(
      id,
      `${filename} (${image.checksumAlgorithm} ${sum.slice(0, 12)}…)`,
    );
  });
}

// ─── Fabrication du gabarit ───────────────────────────────────────────────────────

/** Préparation à l'intérieur de la VM (exécutée en root par SSH). */
export const PREP_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# 1. Attendre la fin du premier démarrage de cloud-init.
cloud-init status --wait >/dev/null 2>&1 || true
# 2. Agent invité QEMU (aucune image cloud officielle ne l'embarque) : Proxmox s'en sert pour lire l'adresse de la VM.
apt-get update -qq
apt-get install -y -qq qemu-guest-agent
systemctl enable qemu-guest-agent >/dev/null 2>&1 || true
systemctl start qemu-guest-agent >/dev/null 2>&1 || true
# 3. Repartir propre : les clones ne doivent hériter ni de la clé du worker, ni de l'identité de cette VM.
rm -f "/home/\${NEXORA_CI_USER}/.ssh/authorized_keys" /root/.ssh/authorized_keys
cloud-init clean --logs >/dev/null 2>&1 || true
truncate -s 0 /etc/machine-id
rm -f /var/lib/dbus/machine-id /etc/ssh/ssh_host_*
apt-get clean
sync
`;

async function pickTemplateVmid(
  client: ProxmoxClient,
  vmidMin: number,
  taken: ReadonlySet<number>,
): Promise<number> {
  const base = Math.max(100, Math.min(9000, vmidMin - TEMPLATE_VMID_SPAN));
  for (let id = base; id < base + TEMPLATE_VMID_SPAN; id++) {
    if (taken.has(id)) continue;
    try {
      return await client.nextId(id);
    } catch (e) {
      if (!(e instanceof ProxmoxError && e.code === "server_error")) throw e;
    }
  }
  throw new StepFailure(
    "Aucun numéro de VM libre pour le gabarit.",
    "Libérer un numéro entre 9000 et 9049 sur Proxmox (ou régler le VMID minimal du serveur), puis relancer.",
  );
}

async function destroyOwn(
  deps: SetupDeps,
  client: ProxmoxClient,
  node: string,
  vmid: number,
) {
  const st = await client.vmStatus(node, vmid).catch(() => null);
  if (st?.status === "running")
    await client.waitTask(await client.stopVm(node, vmid), {
      timeoutMs: deps.settings.taskTimeoutMs,
      pollMs: deps.settings.taskPollMs,
    });
  await client.waitTask(await client.deleteVm(node, vmid), {
    timeoutMs: deps.settings.taskTimeoutMs,
    pollMs: deps.settings.taskPollMs,
  });
}

async function saveTemplateRow(
  deps: SetupDeps,
  server: Server,
  image: CloudImage,
  vmid: number,
  sum: string | null,
) {
  const values = {
    serverId: server.id,
    code: image.code,
    name: image.name,
    os: image.os,
    osVersion: image.osVersion,
    vmid,
    ciUser: image.ciUser,
    imageSha256: image.checksumAlgorithm === "sha256" && sum ? sum : null,
    state: "ready" as const,
  };
  await deps.db
    .insert(osTemplates)
    .values(values)
    .onConflictDoUpdate({
      target: [osTemplates.serverId, osTemplates.code],
      set: { ...values, updatedAt: deps.now() },
    });
}

function templateIsSound(cfg: Record<string, string | number | boolean>) {
  return (
    Number(cfg.template) === 1 &&
    /enabled=1|^1$/.test(String(cfg.agent ?? "")) &&
    String(cfg.ide2 ?? "").includes("cloudinit")
  );
}

async function stepTemplate(
  deps: SetupDeps,
  run: Run,
  server: Server,
  client: ProxmoxClient,
  plan: ServerSetup["plan"],
  code: string,
) {
  const id = `gabarit:${code}`;
  const image = imageByCode(code);
  const name = `nexora-tpl-${code}`;
  await run.running(id);
  let created: number | null = null;
  try {
    await guarded(run, id, UNEXPECTED, async () => {
      const vms = await client.listVms(plan.node);
      const same = vms.find((v) => v.name === name);
      if (same) {
        if (!hasTag(same.tags))
          throw new StepFailure(
            `Une VM (numéro ${same.vmid}) porte déjà le nom « ${name} » mais n'a pas été créée par Nexora.`,
            "La renommer ou la supprimer dans Proxmox si elle est inutile, puis relancer. Nexora ne touche jamais à une VM qu'il n'a pas créée.",
          );
        if (Number(same.template) === 1) {
          const cfg = await client.getConfig(plan.node, same.vmid);
          if (!templateIsSound(cfg))
            throw new StepFailure(
              `Le gabarit existant (numéro ${same.vmid}) n'a pas l'agent invité ou le lecteur cloud-init.`,
              "Le supprimer dans Proxmox (il a été créé par Nexora) puis relancer pour le refaire.",
            );
          await saveTemplateRow(deps, server, image, same.vmid, null);
          await run.skipped(id, `gabarit ${same.vmid} déjà présent`);
          return;
        }
        // Reste d'une fabrication interrompue, créé par Nexora : on le refait proprement.
        await destroyOwn(deps, client, plan.node, same.vmid);
      }
      const sum = await publishedChecksum(image, deps.fetchText);
      const filename = storedFilename(image, sum);
      const vmid = await pickTemplateVmid(
        client,
        server.vmidMin,
        new Set(vms.map((v) => v.vmid)),
      );
      const ip = await buildAddress(deps, server);
      if (!ip)
        throw new StepFailure(
          "Aucune adresse du bloc n'est libre pour la VM de préparation.",
          "Agrandir le bloc d'adresses ou libérer une adresse, puis relancer.",
        );
      const key = deps.settings.workerSshPublicKey as string;
      const pool = server.ipPool;

      const create = await client.createVm(plan.node, {
        vmid,
        name,
        memory: 2048,
        cores: 2,
        cpu: "host",
        agent: "enabled=1",
        ostype: "l26",
        scsihw: "virtio-scsi-pci",
        scsi0: `${plan.vmStorage}:0,import-from=${plan.importStorage}:import/${filename},discard=on`,
        ide2: `${plan.vmStorage}:cloudinit`,
        boot: "order=scsi0",
        net0: `virtio,bridge=${plan.bridge},firewall=1`,
        serial0: "socket",
        vga: "serial0",
        tags: "nexora-template",
        description: `nexora-template:${code} ${image.checksumAlgorithm}:${sum}`,
        ...(plan.pool ? { pool: plan.pool } : {}),
      });
      created = vmid;
      await client.waitTask(create, {
        timeoutMs: deps.settings.taskTimeoutMs,
        pollMs: deps.settings.taskPollMs,
      });
      await client.setConfig(plan.node, vmid, {
        ciuser: image.ciUser,
        sshkeys: encodeURIComponent(`${key} nexora-worker`),
        ipconfig0: `ip=${ip}/${pool.prefix},gw=${pool.gateway}`,
        nameserver: pool.dns.join(" "),
      });
      await client.waitTask(await client.startVm(plan.node, vmid), {
        timeoutMs: deps.settings.taskTimeoutMs,
        pollMs: deps.settings.taskPollMs,
      });

      // Préparation dans la VM : agent invité, identité propre.
      const started = Date.now();
      for (;;) {
        const r = await deps.runner.run({
          host: ip,
          user: image.ciUser,
          script: PREP_SCRIPT,
          env: { NEXORA_CI_USER: image.ciUser },
          timeoutMs: Math.min(deps.settings.installTimeoutMs, 900_000),
        });
        if (r.ok) break;
        if (r.exitCode !== 255)
          throw new StepFailure(
            "La préparation à l'intérieur de la VM a échoué (installation de l'agent invité).",
            "La VM de préparation a besoin d'un accès à Internet (dépôts du système) : vérifier la passerelle et le DNS du bloc, puis relancer.",
            safeError(r.tail),
          );
        if (Date.now() - started > deps.settings.installTimeoutMs)
          throw new StepFailure(
            `La VM de préparation (${ip}) n'est pas joignable en SSH depuis le worker.`,
            "Vérifier que le worker accède au réseau du bloc d'adresses (routage, pare-feu), que l'adresse est libre et que la passerelle est correcte, puis relancer.",
            safeError(r.tail),
          );
        await sleepFor(deps, deps.settings.agentPollMs);
      }

      // L'agent doit répondre à Proxmox : preuve que les VPS clients pourront être configurés.
      const agentStart = Date.now();
      for (;;) {
        try {
          await client.agentPing(plan.node, vmid);
          break;
        } catch (e) {
          if (!(e instanceof ProxmoxError && e.code === "server_error"))
            throw e;
          if (Date.now() - agentStart > deps.settings.agentTimeoutMs)
            throw new StepFailure(
              "L'agent invité de la VM de préparation ne répond pas à Proxmox.",
              "Vérifier que l'option « Agent QEMU » est autorisée et que le droit VM.GuestAgent.Audit est donné au jeton, puis relancer.",
              safeError(e),
            );
          await sleepFor(deps, deps.settings.agentPollMs);
        }
      }

      await client.waitTask(
        await client.shutdownVm(plan.node, vmid, {
          timeout: deps.settings.shutdownTimeoutSec,
          forceStop: true,
        }),
        {
          timeoutMs: deps.settings.taskTimeoutMs,
          pollMs: deps.settings.taskPollMs,
        },
      );
      // Rien de la préparation ne doit rester dans le gabarit (clé du worker, adresse de préparation).
      await client.setConfig(plan.node, vmid, {
        delete: "sshkeys,ipconfig0,nameserver,ciuser",
      });
      await client.waitTask(await client.convertToTemplate(plan.node, vmid), {
        timeoutMs: deps.settings.taskTimeoutMs,
        pollMs: deps.settings.taskPollMs,
      });
      const cfg = await client.getConfig(plan.node, vmid);
      if (!templateIsSound(cfg))
        throw new StepFailure(
          "Le gabarit fabriqué n'est pas conforme (agent ou lecteur cloud-init absent).",
          "Relancer ; si cela persiste, consulter la configuration de la VM dans Proxmox.",
        );
      created = null;
      await saveTemplateRow(deps, server, image, vmid, sum);
      await run.ok(
        id,
        `gabarit ${vmid} créé depuis ${storedFilename(image, sum)}`,
      );
    });
  } catch (e) {
    // Échec après création : la VM de préparation est la nôtre, on la retire pour libérer l'adresse.
    if (created !== null) {
      await destroyOwn(deps, client, plan.node, created).catch(() => {});
    }
    throw e;
  }
}

async function stepVerification(
  deps: SetupDeps,
  run: Run,
  server: Server,
  client: ProxmoxClient,
  plan: ServerSetup["plan"],
) {
  await run.running("verification");
  await guarded(run, "verification", UNEXPECTED, async () => {
    const rows = await deps.db
      .select()
      .from(osTemplates)
      .where(eq(osTemplates.serverId, server.id));
    for (const code of plan.templates) {
      const row = rows.find((r) => r.code === code);
      const cfg = row ? await client.findConfig(plan.node, row.vmid) : null;
      if (row?.state !== "ready" || !cfg || !templateIsSound(cfg))
        throw new StepFailure(
          `Le gabarit ${code} n'est pas prêt sur le nœud.`,
          "Relancer le branchement.",
        );
    }
    const v = await client.version();
    const now = deps.now();
    await deps.db
      .update(proxmoxServers)
      .set({
        state:
          server.state === "draft" || server.state === "offline"
            ? "ready"
            : server.state,
        pveVersion: v.version,
        lastCheckedAt: now,
        lastCheckOk: true,
        lastCheckDetail: `Proxmox VE ${v.version}, nœud ${plan.node}, ${plan.templates.length} gabarit(s) prêt(s)`,
        updatedAt: now,
      })
      .where(eq(proxmoxServers.id, server.id));
    await run.ok(
      "verification",
      `${plan.templates.length} gabarit(s) prêt(s) ; serveur prêt à vendre`,
    );
  });
}
