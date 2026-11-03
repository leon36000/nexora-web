import {
  and,
  desc,
  enqueue,
  eq,
  inArray,
  isNull,
  osTemplates,
  sql,
  vpsEvents,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import { sha256Hex } from "./canonical.ts";
import {
  type EngineDeps,
  type Instance,
  loadInstance,
  loadOrder,
  loadPinned,
  loadServer,
  PermanentError,
  type Server,
  setInstance,
  sleepFor,
  withLease,
} from "./engine-core.ts";
import { recordVpsEvent, safeError } from "./events.ts";
import { buildFirewallPlan, diffFirewallRules } from "./firewall.ts";
import {
  CLIENT_VM_LIMITS,
  clientTags,
  net0Spec,
  throttleDiskSpec,
} from "./limits.ts";
import { findPlacement } from "./placement.ts";
import { ProxmoxError } from "./proxmox/client.ts";

/**
 * Provisionnement d'un VPS : machine à états idempotente, reprise à chaque étape.
 *
 *   placement → clone → configure → firewall → start → await_agent → install → verify → done
 *   (réinstallation : snapshot → clone → … → done ; `snapshot` met l'ancienne VM de côté)
 *
 * Chaque étape peut être rejouée sans effet de bord : l'état est dans `vps_instances` (étape,
 * serveur, adresse, vmid) et dans Proxmox (VM identifiée par son NOM, dérivé de la commande). Un
 * seul worker avance une instance à la fois (bail). Une exécution rend la main au bout de
 * `budgetMs` ou quand elle attend (agent, capacité) : la tâche de continuation reprend à l'étape.
 */
const ORDER = [
  "placement",
  "snapshot",
  "clone",
  "configure",
  "firewall",
  "start",
  "await_agent",
  "install",
  "verify",
] as const;
type Step = (typeof ORDER)[number];

type StepResult = "advance" | { wait: number };

/** Réinstallation refusée avant tout effet : l'instance redevient active, sans compensation. */
class ReinstallRefusedError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ReinstallRefusedError";
    this.code = code;
  }
}
interface Ctx {
  deps: EngineDeps;
  startedAt: number;
}

export function nextStep(current: Step, reinstall: boolean): Step | "done" {
  let i = ORDER.indexOf(current) + 1;
  while (i < ORDER.length) {
    const s = ORDER[i] as Step;
    // Placement seulement au premier provisionnement ; « snapshot » seulement en réinstallation.
    if ((s === "placement" && reinstall) || (s === "snapshot" && !reinstall)) {
      i++;
      continue;
    }
    return s;
  }
  return "done";
}

export type ProvisionOutcome =
  | { outcome: "done" }
  | { outcome: "wait"; delayMs: number; seq: number }
  | { outcome: "busy" }
  | { outcome: "skipped"; reason: string }
  | { outcome: "failed"; reason: string };

/** Crée la ligne d'instance d'une commande payée (idempotent : une instance par commande). */
export async function ensureInstance(
  deps: EngineDeps,
  orderId: string,
): Promise<Instance> {
  const order = await loadOrder(deps, orderId);
  const [existing] = await deps.db
    .select()
    .from(vpsInstances)
    .where(eq(vpsInstances.orderId, orderId));
  if (existing) return existing;
  const probe = {
    id: "",
    orderId,
    catalogVersionId: order.catalogVersionId,
    planCode: order.planCode,
    appCode: order.appCode,
  } as Instance;
  const { plan, app } = await loadPinned(deps, probe);
  await deps.db
    .insert(vpsInstances)
    .values({
      orderId,
      organizationId: order.organizationId,
      vcpu: plan.vcpu,
      ramMb: plan.ramMb,
      diskGb: plan.diskGb,
      planCode: plan.code,
      appCode: app.code,
      appVersion: app.version,
      catalogVersionId: order.catalogVersionId,
      vmName: `nx-${orderId.slice(0, 8)}`,
    })
    .onConflictDoNothing({ target: vpsInstances.orderId });
  const [row] = await deps.db
    .select()
    .from(vpsInstances)
    .where(eq(vpsInstances.orderId, orderId));
  if (!row) throw new Error("instance introuvable après création");
  return row;
}

/**
 * Point d'entrée du gestionnaire `vps.provision`. `attempt`/`maxAttempts` viennent de la file :
 * à la dernière tentative (ou sur échec définitif) l'engagement est compensé.
 */
export async function provisionOrder(
  deps: EngineDeps,
  orderId: string,
  tries: { attempt: number; maxAttempts: number } = {
    attempt: 1,
    maxAttempts: 1,
  },
): Promise<ProvisionOutcome> {
  const order = await loadOrder(deps, orderId);
  if (order.status !== "paid" && order.status !== "provisioning") {
    // Une réinstallation passe par ici avec une commande déjà « fulfilled ».
    const [inst] = await deps.db
      .select()
      .from(vpsInstances)
      .where(eq(vpsInstances.orderId, orderId));
    if (!(order.status === "fulfilled" && inst?.status === "reinstalling"))
      return { outcome: "skipped", reason: `commande ${order.status}` };
  }
  const instance = await ensureInstance(deps, orderId);
  if (instance.status !== "provisioning" && instance.status !== "reinstalling")
    return { outcome: "skipped", reason: `instance ${instance.status}` };
  if (instance.status === "provisioning")
    await markProvisionStarted(deps, orderId);

  const run = await withLease(deps, instance.id, async (held) => {
    if (order.status === "paid")
      await deps.db
        .update(vpsOrders)
        .set({ status: "provisioning", updatedAt: new Date() })
        .where(and(eq(vpsOrders.id, orderId), eq(vpsOrders.status, "paid")));
    const ctx: Ctx = { deps, startedAt: Date.now() };
    try {
      return await advance(ctx, held.id);
    } catch (error) {
      if (error instanceof ReinstallRefusedError) {
        // La VM courante reste en service : l'instance redevient « active », rien n'est compensé.
        const cur = await loadInstance(deps, held.id);
        await setInstance(deps, held.id, {
          status: "active",
          step: "done",
          pendingAction: null,
          lastError: error.code,
        });
        await recordVpsEvent(deps.db, {
          organizationId: cur.organizationId,
          orderId,
          instanceId: held.id,
          actor: "worker",
          kind: "reinstall_refused",
          message: `réinstallation refusée : ${error.code}`,
          detail: { code: error.code },
        });
        return { outcome: "skipped" as const, reason: error.code };
      }
      const permanent = error instanceof PermanentError;
      const last = tries.attempt >= tries.maxAttempts;
      const cur = await loadInstance(deps, held.id);
      await setInstance(deps, held.id, { lastError: safeError(error) });
      await recordVpsEvent(deps.db, {
        organizationId: cur.organizationId,
        orderId,
        instanceId: held.id,
        actor: "worker",
        kind: "step_error",
        message: safeError(error),
        detail: { step: cur.step, attempt: tries.attempt, permanent },
      });
      if (!permanent && !last) throw error;
      return await compensate(deps, held.id, safeError(error));
    }
  });
  if (run.busy) return { outcome: "busy" };
  return run.value;
}

async function advance(
  ctx: Ctx,
  instanceId: string,
): Promise<ProvisionOutcome> {
  const { deps } = ctx;
  for (;;) {
    const inst = await loadInstance(deps, instanceId);
    if (inst.status !== "provisioning" && inst.status !== "reinstalling")
      return { outcome: "skipped", reason: `instance ${inst.status}` };
    if (inst.step === "done") return { outcome: "done" };
    if (Date.now() - ctx.startedAt > deps.settings.budgetMs)
      return await yieldRun(deps, inst, 0);
    const fn = STEPS[inst.step as Step];
    if (!fn) throw new PermanentError(`étape inconnue : ${inst.step}`);
    const result = await fn(ctx, inst);
    if (result !== "advance") return await yieldRun(deps, inst, result.wait);
    const reinstall = inst.status === "reinstalling";
    const next = nextStep(inst.step as Step, reinstall);
    await setInstance(deps, instanceId, { step: next, lastError: null });
    if (next === "done") return { outcome: "done" };
  }
}

async function yieldRun(
  deps: EngineDeps,
  inst: Instance,
  delayMs: number,
): Promise<ProvisionOutcome> {
  const [row] = await deps.db
    .update(vpsInstances)
    .set({ runSeq: sql`${vpsInstances.runSeq} + 1`, updatedAt: new Date() })
    .where(eq(vpsInstances.id, inst.id))
    .returning({ runSeq: vpsInstances.runSeq });
  return { outcome: "wait", delayMs, seq: row?.runSeq ?? inst.runSeq + 1 };
}

/** Met en file la reprise d'un provisionnement (clé unique par continuation). */
export async function enqueueContinuation(
  deps: EngineDeps,
  orderId: string,
  result: { delayMs: number; seq: number },
) {
  await enqueue(deps.db, {
    type: "vps.provision",
    payload: { orderId },
    idempotencyKey: `vps-provision:${orderId}:c${result.seq}`,
    maxAttempts: 6,
    availableAt: new Date(Date.now() + result.delayMs),
  });
}

// ─── Étapes ─────────────────────────────────────────────────────────────────────

const STEPS: Record<Step, (ctx: Ctx, inst: Instance) => Promise<StepResult>> = {
  placement: stepPlacement,
  snapshot: stepRetireOld,
  clone: stepClone,
  configure: stepConfigure,
  firewall: stepFirewall,
  start: stepStart,
  await_agent: stepAwaitAgent,
  install: stepInstall,
  verify: stepVerify,
};

/** Choisit un serveur prêt de la région avec capacité, gabarit prêt et adresse libre. */
async function stepPlacement(ctx: Ctx, inst: Instance): Promise<StepResult> {
  const { deps } = ctx;
  if (inst.serverId && inst.ipv4) return "advance";
  const order = await loadOrder(deps, inst.orderId);
  const { plan } = await loadPinned(deps, inst);

  const placed = await deps.db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`vps-placement:${order.region}`}))`,
    );
    const best = await findPlacement(tx, {
      region: order.region,
      templateCode: plan.templateCode,
      vcpu: inst.vcpu,
      ramMb: inst.ramMb,
      diskGb: inst.diskGb,
    });
    if (!best) return null;
    await tx
      .update(vpsInstances)
      .set({ serverId: best.server.id, ipv4: best.ip, updatedAt: new Date() })
      .where(eq(vpsInstances.id, inst.id));
    return best;
  });

  if (!placed) {
    const waitedMs = order.paidAt
      ? deps.now().getTime() - order.paidAt.getTime()
      : 0;
    if (waitedMs > deps.settings.placementTimeoutMs)
      throw new PermanentError(
        "aucune capacité disponible dans le délai prévu",
      );
    const [seen] = await deps.db
      .select({ id: vpsEvents.id })
      .from(vpsEvents)
      .where(
        and(
          eq(vpsEvents.instanceId, inst.id),
          eq(vpsEvents.kind, "no_capacity"),
        ),
      )
      .limit(1);
    if (!seen) {
      await recordVpsEvent(deps.db, {
        organizationId: inst.organizationId,
        orderId: inst.orderId,
        instanceId: inst.id,
        actor: "worker",
        kind: "no_capacity",
        message:
          "aucun serveur prêt avec capacité, gabarit et adresse libres : commande en attente",
        detail: { region: order.region, plan: plan.code },
      });
      await enqueue(deps.db, {
        type: "vps.alert",
        payload: { orderId: inst.orderId, reason: "no_capacity" },
        idempotencyKey: `vps-alert:${inst.orderId}:no_capacity`,
      });
    }
    return { wait: 300_000 };
  }
  await recordVpsEvent(deps.db, {
    organizationId: inst.organizationId,
    orderId: inst.orderId,
    instanceId: inst.id,
    actor: "worker",
    kind: "placed",
    message: `serveur ${placed.server.code} retenu`,
    detail: { server: placed.server.code },
  });
  return "advance";
}

/** Première attribution d'un vmid libre sur le serveur (verrou par serveur + contrôle Proxmox). */
async function allocateVmid(
  deps: EngineDeps,
  inst: Instance,
  server: Server,
  client: Awaited<ReturnType<EngineDeps["proxmox"]>>,
): Promise<number> {
  let floor = server.vmidMin;
  for (let i = 0; i < 25; i++) {
    const candidate = await deps.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`vps-vmid:${server.id}`}))`,
      );
      const [row] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${vpsInstances.vmid}), 0)` })
        .from(vpsInstances)
        .where(eq(vpsInstances.serverId, server.id));
      const [prev] = await tx
        .select({
          max: sql<number>`COALESCE(MAX(${vpsInstances.previousVmid}), 0)`,
        })
        .from(vpsInstances)
        .where(eq(vpsInstances.serverId, server.id));
      return Math.max(floor, (row?.max ?? 0) + 1, (prev?.max ?? 0) + 1);
    });
    const existing = await client.findConfig(server.node, candidate);
    if (existing) {
      floor = candidate + 1; // identifiant pris par une VM que nous ne connaissons pas
      continue;
    }
    // Une VM hors du pool est invisible du jeton (403 = « introuvable ») : seul /cluster/nextid dit
    // vraiment si le numéro est libre (400 « already exists » sinon).
    try {
      await client.nextId(candidate);
    } catch (e) {
      if (e instanceof ProxmoxError && e.code === "invalid_request") {
        floor = candidate + 1;
        continue;
      }
      throw e;
    }
    try {
      await deps.db
        .update(vpsInstances)
        .set({ vmid: candidate, updatedAt: new Date() })
        .where(and(eq(vpsInstances.id, inst.id), isNull(vpsInstances.vmid)));
    } catch {
      floor = candidate + 1; // course sur l'index unique : on réessaie plus haut
      continue;
    }
    const [cur] = await deps.db
      .select({ vmid: vpsInstances.vmid })
      .from(vpsInstances)
      .where(eq(vpsInstances.id, inst.id));
    if (cur?.vmid) return cur.vmid;
    floor = candidate + 1;
  }
  throw new Error("aucun identifiant de VM libre trouvé");
}

async function templateFor(deps: EngineDeps, server: Server, code: string) {
  const [tpl] = await deps.db
    .select()
    .from(osTemplates)
    .where(
      and(eq(osTemplates.serverId, server.id), eq(osTemplates.code, code)),
    );
  if (tpl?.state !== "ready")
    throw new PermanentError("gabarit Proxmox indisponible sur ce serveur");
  return tpl;
}

async function waitUnlocked(
  deps: EngineDeps,
  client: Awaited<ReturnType<EngineDeps["proxmox"]>>,
  server: Server,
  vmid: number,
) {
  const started = Date.now();
  for (;;) {
    const st = await client.vmStatus(server.node, vmid);
    if (!st.lock) return;
    if (Date.now() - started > deps.settings.taskTimeoutMs)
      throw new Error(`la VM reste verrouillée (${st.lock})`);
    await sleepFor(deps, deps.settings.taskPollMs);
  }
}

async function stepClone(ctx: Ctx, inst: Instance): Promise<StepResult> {
  const { deps } = ctx;
  if (!inst.serverId) throw new PermanentError("clone sans serveur");
  const server = await loadServer(deps, inst.serverId);
  const client = await deps.proxmox(server);
  const { plan } = await loadPinned(deps, inst);
  const tpl = await templateFor(deps, server, plan.templateCode);

  const vmid = inst.vmid ?? (await allocateVmid(deps, inst, server, client));
  const existing = await client.findConfig(server.node, vmid);
  if (existing) {
    if (existing.name !== inst.vmName)
      throw new PermanentError("une VM étrangère occupe l'identifiant réservé");
    // Reprise : le clone existe déjà (ou est en cours). On attend la fin de la tâche de clonage.
    await waitUnlocked(deps, client, server, vmid);
    return "advance";
  }
  const upid = await client.cloneVm(server.node, tpl.vmid, {
    newid: vmid,
    name: inst.vmName,
    description: `nexora-order:${inst.orderId}`,
    storage: server.storage,
    pool: server.pool ?? undefined,
    full: true,
  });
  await recordVpsEvent(deps.db, {
    organizationId: inst.organizationId,
    orderId: inst.orderId,
    instanceId: inst.id,
    actor: "worker",
    kind: "clone_started",
    message: "clonage du gabarit lancé",
    detail: { vmid },
  });
  await client.waitTask(upid, {
    timeoutMs: deps.settings.taskTimeoutMs,
    pollMs: deps.settings.taskPollMs,
  });
  await waitUnlocked(deps, client, server, vmid);
  return "advance";
}

const DISK_KEY = /^(scsi|virtio|sata)\d+$/;

async function stepConfigure(ctx: Ctx, inst: Instance): Promise<StepResult> {
  const { deps } = ctx;
  if (!inst.serverId || !inst.vmid || !inst.ipv4)
    throw new PermanentError("configuration sans serveur, vmid ou adresse");
  const server = await loadServer(deps, inst.serverId);
  const client = await deps.proxmox(server);
  const order = await loadOrder(deps, inst.orderId);
  const { plan } = await loadPinned(deps, inst);
  const tpl = await templateFor(deps, server, plan.templateCode);
  const pool = server.ipPool;

  const keys = [order.sshPublicKey];
  if (deps.settings.workerSshPublicKey)
    keys.push(`${deps.settings.workerSshPublicKey} nexora-worker`);
  await client.setConfig(server.node, inst.vmid, {
    name: inst.vmName,
    ciuser: tpl.ciUser,
    // Jamais de mot de passe : clés SSH seulement (URL-encodées, comme l'exige l'API).
    sshkeys: encodeURIComponent(keys.join("\n")),
    ipconfig0: `ip=${inst.ipv4}/${pool.prefix},gw=${pool.gateway}`,
    nameserver: pool.dns.join(" "),
    cores: inst.vcpu,
    memory: inst.ramMb,
    net0: net0Spec(pool.bridge),
    agent: "enabled=1",
    onboot: 1,
    cpuunits: CLIENT_VM_LIMITS.cpuUnits,
    tags: clientTags(inst.organizationId),
    description: `nexora-order:${inst.orderId}`,
  });
  const cfg = await client.getConfig(server.node, inst.vmid);
  const diskKey = Object.keys(cfg).find(
    (k) => DISK_KEY.test(k) && /size=\d+[GM]/.test(String(cfg[k])),
  );
  if (diskKey) {
    // Plafonds d'entrées-sorties du disque (la taille est inchangée ici, elle est agrandie plus bas).
    await client.setConfig(server.node, inst.vmid, {
      [diskKey]: throttleDiskSpec(String(cfg[diskKey])),
    });
    const m = /size=(\d+)([GM])/.exec(String(cfg[diskKey]));
    const currentGb = Number(m?.[1] ?? 0) / (m?.[2] === "M" ? 1024 : 1);
    if (currentGb < inst.diskGb)
      await client.resizeDisk(
        server.node,
        inst.vmid,
        diskKey,
        `${inst.diskGb}G`,
      );
  }
  return "advance";
}

async function stepFirewall(ctx: Ctx, inst: Instance): Promise<StepResult> {
  const { deps } = ctx;
  if (!inst.serverId || !inst.vmid || !inst.ipv4)
    throw new PermanentError("pare-feu sans serveur, vmid ou adresse");
  const server = await loadServer(deps, inst.serverId);
  const client = await deps.proxmox(server);
  const { app } = await loadPinned(deps, inst);
  const plan = buildFirewallPlan(app.ports, {
    gateway: server.ipPool.gateway,
    dns: server.ipPool.dns,
  });

  // Anti-usurpation d'adresse : l'IP de la VM est la seule autorisée sur net0.
  const sets = await client.firewallIpsets(server.node, inst.vmid);
  if (!sets.some((s) => s.name === "ipfilter-net0"))
    await client.createIpset(server.node, inst.vmid, "ipfilter-net0");
  try {
    await client.addIpsetEntry(
      server.node,
      inst.vmid,
      "ipfilter-net0",
      inst.ipv4,
    );
  } catch (e) {
    if (!(e instanceof ProxmoxError) || e.code !== "server_error") throw e; // entrée déjà présente
  }
  const existing = await client.firewallRules(server.node, inst.vmid);
  const diff = diffFirewallRules(plan.rules, existing);
  for (const pos of diff.toRemove)
    await client.deleteFirewallRule(server.node, inst.vmid, pos);
  for (const rule of diff.toAdd) {
    const body: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(rule)) if (v !== undefined) body[k] = v;
    await client.addFirewallRule(server.node, inst.vmid, body);
  }
  // Le pare-feu s'active en dernier, une fois les règles en place.
  await client.setFirewallOptions(server.node, inst.vmid, plan.options);
  return "advance";
}

async function stepStart(ctx: Ctx, inst: Instance): Promise<StepResult> {
  const { deps } = ctx;
  if (!inst.serverId || !inst.vmid)
    throw new PermanentError("démarrage sans serveur ou vmid");
  const server = await loadServer(deps, inst.serverId);
  const client = await deps.proxmox(server);
  const st = await client.vmStatus(server.node, inst.vmid);
  if (st.status !== "running") {
    const upid = await client.startVm(server.node, inst.vmid);
    await client.waitTask(upid, {
      timeoutMs: deps.settings.taskTimeoutMs,
      pollMs: deps.settings.taskPollMs,
    });
    await recordVpsEvent(deps.db, {
      organizationId: inst.organizationId,
      orderId: inst.orderId,
      instanceId: inst.id,
      actor: "worker",
      kind: "vm_started",
      message: "VM démarrée",
    });
  }
  await setInstance(deps, inst.id, { power: "running" });
  return "advance";
}

async function stepAwaitAgent(ctx: Ctx, inst: Instance): Promise<StepResult> {
  const { deps } = ctx;
  if (!inst.serverId || !inst.vmid || !inst.ipv4)
    throw new PermanentError(
      "attente de l'agent sans serveur, vmid ou adresse",
    );
  const server = await loadServer(deps, inst.serverId);
  const client = await deps.proxmox(server);
  const [started] = await deps.db
    .select({ at: vpsEvents.createdAt })
    .from(vpsEvents)
    .where(
      and(
        eq(vpsEvents.instanceId, inst.id),
        inArray(vpsEvents.kind, ["provision_started", "reinstall_started"]),
      ),
    )
    .orderBy(desc(vpsEvents.createdAt))
    .limit(1);
  const since = started?.at.getTime() ?? Date.now();
  for (;;) {
    const ips = await client.guestIpv4(server.node, inst.vmid);
    if (ips.includes(inst.ipv4)) return "advance";
    if (Date.now() - since > deps.settings.agentTimeoutMs)
      throw new Error("l'agent invité ne répond pas dans le délai prévu");
    if (
      Date.now() - ctx.startedAt >
      deps.settings.budgetMs - deps.settings.agentPollMs
    )
      return { wait: deps.settings.agentRetryMs };
    await sleepFor(deps, deps.settings.agentPollMs);
  }
}

async function stepInstall(ctx: Ctx, inst: Instance): Promise<StepResult> {
  const { deps } = ctx;
  if (!inst.serverId || !inst.ipv4)
    throw new PermanentError("installation sans serveur ou adresse");
  const server = await loadServer(deps, inst.serverId);
  const { plan, app } = await loadPinned(deps, inst);
  if (
    app.kind !== "installable" ||
    !app.installScript ||
    !app.installScriptSha256
  )
    throw new PermanentError("application non installable par le worker");
  // Intégrité : le script exécuté est exactement celui de la version publiée.
  if (sha256Hex(app.installScript) !== app.installScriptSha256)
    throw new PermanentError(
      "somme SHA-256 du script d'installation incorrecte : exécution refusée",
    );
  const tpl = await templateFor(deps, server, plan.templateCode);
  const result = await deps.runner.run({
    host: inst.ipv4,
    user: tpl.ciUser,
    script: app.installScript,
    env: { NEXORA_APP_CODE: app.code, NEXORA_APP_VERSION: app.version },
    timeoutMs: deps.settings.installTimeoutMs,
  });
  if (!result.ok)
    throw new Error(
      `installation de ${app.code} en échec (code ${result.exitCode}) : ${result.tail.slice(-300)}`,
    );
  await setInstance(deps, inst.id, {
    installScriptSha256: app.installScriptSha256,
    appVersion: app.version,
    sshHostKeyFingerprint: result.hostKeyFingerprint ?? null,
  });
  await recordVpsEvent(deps.db, {
    organizationId: inst.organizationId,
    orderId: inst.orderId,
    instanceId: inst.id,
    actor: "worker",
    kind: "app_installed",
    message: `${app.name} ${app.version} installé`,
    detail: {
      app: app.code,
      version: app.version,
      scriptSha256: app.installScriptSha256.slice(0, 16),
    },
  });
  return "advance";
}

async function stepVerify(ctx: Ctx, inst: Instance): Promise<StepResult> {
  const { deps } = ctx;
  if (!inst.serverId || !inst.vmid || !inst.ipv4)
    throw new PermanentError("vérification sans serveur, vmid ou adresse");
  const server = await loadServer(deps, inst.serverId);
  const client = await deps.proxmox(server);
  const order = await loadOrder(deps, inst.orderId);
  const { plan } = await loadPinned(deps, inst);
  const tpl = await templateFor(deps, server, plan.templateCode);
  // La clé du worker quitte la VM (fichier authorized_keys) et la configuration cloud-init.
  if (deps.settings.workerSshPublicKey) {
    const cleaned = await deps.runner.cleanup({
      host: inst.ipv4,
      user: tpl.ciUser,
      timeoutMs: 60_000,
    });
    if (!cleaned.ok) {
      // La clé du worker reste dans authorized_keys : accès de l'opérateur à la VM du client. Jamais « actif » ainsi.
      await recordVpsEvent(deps.db, {
        organizationId: inst.organizationId,
        orderId: inst.orderId,
        instanceId: inst.id,
        actor: "worker",
        kind: "worker_key_cleanup_failed",
        message: "la clé SSH du worker n'a pas pu être retirée de la VM",
      });
      await enqueue(deps.db, {
        type: "vps.alert",
        payload: { orderId: inst.orderId, reason: "worker_key_not_removed" },
        idempotencyKey: `vps-alert:${inst.orderId}:worker_key_not_removed`,
      });
      throw new Error(
        "clé du worker non retirée de la VM (authorized_keys) : nouvelle tentative",
      );
    }
    await client.setConfig(server.node, inst.vmid, {
      sshkeys: encodeURIComponent(order.sshPublicKey),
    });
  }
  const st = await client.vmStatus(server.node, inst.vmid);
  if (st.status !== "running")
    throw new Error("la VM ne tourne pas à la fin du provisionnement");
  const reinstall = inst.status === "reinstalling";
  await deps.db.transaction(async (tx) => {
    await tx
      .update(vpsInstances)
      .set({
        status: "active",
        step: "done",
        power: "running",
        activatedAt: deps.now(),
        lastError: null,
        pendingAction: null,
        updatedAt: new Date(),
      })
      .where(eq(vpsInstances.id, inst.id));
    await tx
      .update(vpsOrders)
      .set({ status: "fulfilled", updatedAt: new Date() })
      .where(eq(vpsOrders.id, inst.orderId));
    await recordVpsEvent(tx, {
      organizationId: inst.organizationId,
      orderId: inst.orderId,
      instanceId: inst.id,
      actor: "worker",
      kind: reinstall ? "reinstall_done" : "active",
      message: reinstall ? "réinstallation terminée" : "VPS actif",
      detail: { ip: inst.ipv4 },
    });
  });
  return "advance";
}

/**
 * Réinstallation : l'ancienne VM est mise de côté, jamais détruite tout de suite (D8) :
 *  1. instantané `avant-reinstall-…` (point de reprise de ses données) ;
 *  2. arrêt, renommage `<nom>-old` et retrait de sa carte réseau (l'adresse passe à la nouvelle VM) ;
 *  3. elle est supprimée après `retentionDays` jours par le balayage.
 * Rejouable : le nom de l'instantané est enregistré avant sa création.
 */
async function stepRetireOld(ctx: Ctx, inst: Instance): Promise<StepResult> {
  const { deps } = ctx;
  if (!inst.serverId || !inst.vmid) {
    // Reprise après la mise de côté : l'ancienne VM est déjà détachée, on passe au clonage.
    if (inst.previousVmid) return "advance";
    throw new PermanentError("réinstallation sans VM à remplacer");
  }
  // Une ancienne VM est déjà conservée : l'écraser la rendrait orpheline (jamais supprimée, stockage perdu).
  // Refus SANS compensation : la VM courante est celle du client, elle ne doit pas être détruite.
  if (inst.previousVmid)
    throw new ReinstallRefusedError("reinstall_pending_purge");
  const server = await loadServer(deps, inst.serverId);
  const client = await deps.proxmox(server);
  const snapName =
    inst.lastSnapshotName ??
    `avant-reinstall-${deps.now().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
  if (!inst.lastSnapshotName)
    await setInstance(deps, inst.id, { lastSnapshotName: snapName });
  const existing = await client.findConfig(server.node, inst.vmid);
  if (existing) {
    const snaps = await client.listSnapshots(server.node, inst.vmid);
    if (!snaps.some((s) => s.name === snapName)) {
      const upid = await client.createSnapshot(
        server.node,
        inst.vmid,
        snapName,
        "instantané automatique avant réinstallation",
      );
      await client.waitTask(upid, {
        timeoutMs: deps.settings.taskTimeoutMs,
        pollMs: deps.settings.taskPollMs,
      });
    }
    const st = await client.vmStatus(server.node, inst.vmid);
    if (st.status === "running") {
      const upid = await client.shutdownVm(server.node, inst.vmid, {
        timeout: deps.settings.shutdownTimeoutSec,
        forceStop: true,
      });
      await client.waitTask(upid, {
        timeoutMs: deps.settings.taskTimeoutMs,
        pollMs: deps.settings.taskPollMs,
      });
    }
    await client.setConfig(server.node, inst.vmid, {
      name: `${inst.vmName}-old`,
      onboot: 0,
      delete: "net0,ipconfig0",
    });
  }
  await deps.db
    .update(vpsInstances)
    .set({
      previousVmid: inst.vmid,
      previousDeleteAfter: new Date(
        deps.now().getTime() + deps.settings.retentionDays * 86_400_000,
      ),
      vmid: null,
      power: "unknown",
      installScriptSha256: null,
      updatedAt: new Date(),
    })
    .where(eq(vpsInstances.id, inst.id));
  await recordVpsEvent(deps.db, {
    organizationId: inst.organizationId,
    orderId: inst.orderId,
    instanceId: inst.id,
    actor: "worker",
    kind: "old_vm_retained",
    message: `ancienne VM conservée ${deps.settings.retentionDays} jours avec l'instantané ${snapName}`,
    detail: { snapshot: snapName },
  });
  return "advance";
}

// ─── Compensation ───────────────────────────────────────────────────────────────

/**
 * Échec définitif : la VM partielle est supprimée, l'adresse et la capacité sont libérées, la
 * commande passe à « failed ». AUCUN remboursement automatique : l'opérateur est alerté et
 * décide (annulation de l'abonnement, remboursement) depuis Stripe.
 */
export async function compensate(
  deps: EngineDeps,
  instanceId: string,
  reason: string,
): Promise<ProvisionOutcome> {
  const inst = await loadInstance(deps, instanceId);
  const reinstall = inst.status === "reinstalling";
  if (inst.serverId && inst.vmid) {
    try {
      const server = await loadServer(deps, inst.serverId);
      const client = await deps.proxmox(server);
      const cfg = await client.findConfig(server.node, inst.vmid);
      // On ne supprime que la VM que nous avons créée (même nom), jamais une VM étrangère.
      if (cfg && cfg.name === inst.vmName) {
        const st = await client.vmStatus(server.node, inst.vmid);
        if (st.status === "running") {
          const upid = await client.stopVm(server.node, inst.vmid);
          await client.waitTask(upid, {
            timeoutMs: deps.settings.taskTimeoutMs,
            pollMs: deps.settings.taskPollMs,
          });
        }
        const upid = await client.deleteVm(server.node, inst.vmid);
        await client.waitTask(upid, {
          timeoutMs: deps.settings.taskTimeoutMs,
          pollMs: deps.settings.taskPollMs,
        });
      }
    } catch (error) {
      deps.log.error("vps : nettoyage de la VM partielle impossible", {
        instanceId,
        error: safeError(error),
      });
      await recordVpsEvent(deps.db, {
        organizationId: inst.organizationId,
        orderId: inst.orderId,
        instanceId,
        actor: "worker",
        kind: "cleanup_failed",
        message: safeError(error),
      });
    }
  }
  await deps.db.transaction(async (tx) => {
    await tx
      .update(vpsInstances)
      .set({
        status: "failed",
        lastError: reason,
        deletedAt: deps.now(),
        updatedAt: new Date(),
        pendingAction: null,
      })
      .where(eq(vpsInstances.id, instanceId));
    await tx
      .update(vpsOrders)
      .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
      .where(eq(vpsOrders.id, inst.orderId));
    await recordVpsEvent(tx, {
      organizationId: inst.organizationId,
      orderId: inst.orderId,
      instanceId,
      actor: "worker",
      kind: reinstall ? "reinstall_failed" : "provision_failed",
      message: reason,
      detail: { step: inst.step, refund: "manual_review" },
    });
    await enqueue(tx, {
      type: "vps.alert",
      payload: { orderId: inst.orderId, reason: "provision_failed" },
      idempotencyKey: `vps-alert:${inst.orderId}:provision_failed`,
    });
  });
  return { outcome: "failed", reason };
}

export async function markProvisionStarted(deps: EngineDeps, orderId: string) {
  const inst = await ensureInstance(deps, orderId);
  const [seen] = await deps.db
    .select({ id: vpsEvents.id })
    .from(vpsEvents)
    .where(
      and(
        eq(vpsEvents.instanceId, inst.id),
        eq(vpsEvents.kind, "provision_started"),
      ),
    )
    .limit(1);
  if (!seen)
    await recordVpsEvent(deps.db, {
      organizationId: inst.organizationId,
      orderId,
      instanceId: inst.id,
      actor: "worker",
      kind: "provision_started",
      message: "provisionnement démarré",
    });
  return inst;
}
