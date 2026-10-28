import {
  and,
  desc,
  enqueue,
  eq,
  isNotNull,
  isNull,
  lt,
  ne,
  subscriptions,
  vpsEvents,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import {
  type EngineDeps,
  type Instance,
  loadInstance,
  loadServer,
  PermanentError,
  setInstance,
  withLease,
} from "./engine-core.ts";
import { recordVpsEvent } from "./events.ts";
import {
  decideLifecycle,
  type LifecycleDecision,
  retentionEnd,
} from "./lifecycle.ts";
import { retryLatePayments } from "./orders.ts";
import type { ProxmoxClient } from "./proxmox/client.ts";

/**
 * Exploitation d'un VPS actif : démarrer, arrêter, redémarrer, suspendre, reprendre, résilier,
 * supprimer, réinstaller. Chaque opération prend le bail de l'instance, revérifie l'état courant
 * (un message en retard ne doit rien casser) et est rejouable.
 */
export type PowerAction = "start" | "stop" | "reboot";
export type LifecycleAction =
  | "suspend"
  | "resume"
  | "terminate"
  | "delete"
  | "purge_old";

export class BusyError extends Error {
  constructor() {
    super("instance occupée : réessai ultérieur");
    this.name = "BusyError";
  }
}

async function clientOf(
  deps: EngineDeps,
  inst: Instance,
): Promise<{ client: ProxmoxClient; node: string; vmid: number }> {
  if (!inst.serverId || !inst.vmid)
    throw new PermanentError("instance sans VM");
  const server = await loadServer(deps, inst.serverId);
  return {
    client: await deps.proxmox(server),
    node: server.node,
    vmid: inst.vmid,
  };
}

async function task(deps: EngineDeps, client: ProxmoxClient, upid: string) {
  await client.waitTask(upid, {
    timeoutMs: deps.settings.taskTimeoutMs,
    pollMs: deps.settings.taskPollMs,
  });
}

async function shutdown(deps: EngineDeps, inst: Instance) {
  const { client, node, vmid } = await clientOf(deps, inst);
  const st = await client.vmStatus(node, vmid);
  if (st.status === "running")
    await task(
      deps,
      client,
      await client.shutdownVm(node, vmid, {
        timeout: deps.settings.shutdownTimeoutSec,
        forceStop: true,
      }),
    );
}

// ─── Actions du client ──────────────────────────────────────────────────────────

/** Démarrer, arrêter ou redémarrer (instance active seulement). Rejouable. */
export async function runPowerAction(
  deps: EngineDeps,
  instanceId: string,
  action: PowerAction,
  actor: "customer" | "operator" = "customer",
) {
  const res = await withLease(deps, instanceId, async (held) => {
    const inst = await loadInstance(deps, held.id);
    if (inst.status !== "active") return { skipped: `instance ${inst.status}` };
    const { client, node, vmid } = await clientOf(deps, inst);
    const st = await client.vmStatus(node, vmid);
    if (action === "start") {
      if (st.status !== "running")
        await task(deps, client, await client.startVm(node, vmid));
    } else if (action === "stop") {
      if (st.status === "running")
        await task(
          deps,
          client,
          await client.shutdownVm(node, vmid, {
            timeout: deps.settings.shutdownTimeoutSec,
            forceStop: true,
          }),
        );
    } else if (st.status === "running") {
      await task(deps, client, await client.rebootVm(node, vmid));
    } else {
      throw new PermanentError("redémarrage impossible : la VM est arrêtée");
    }
    const power = action === "stop" ? "stopped" : "running";
    await setInstance(deps, inst.id, { power, pendingAction: null });
    await recordVpsEvent(deps.db, {
      organizationId: inst.organizationId,
      orderId: inst.orderId,
      instanceId: inst.id,
      actor,
      kind: `power_${action}`,
      message: {
        start: "VPS démarré",
        stop: "VPS arrêté",
        reboot: "VPS redémarré",
      }[action],
    });
    return { done: true };
  });
  if (res.busy) throw new BusyError();
  return res.value;
}

/** Délai minimal entre deux demandes de réinstallation d'une même instance. */
export const MIN_REINSTALL_INTERVAL_MS = 24 * 3_600_000;

export type ReinstallRefusal =
  /** L'instance n'est pas « active ». */
  | "not_active"
  /** Une ancienne VM est encore conservée : la prochaine réinstallation attend sa purge (sinon elle serait orpheline). */
  | "reinstall_pending_purge"
  /** Moins de 24 h depuis la dernière demande. */
  | "reinstall_too_soon";

/**
 * Demande de réinstallation : l'instance passe en « reinstalling » et la tâche de provisionnement est mise en file.
 * Refusée (`accepted: false` + `code`) tant qu'une ancienne VM est conservée et moins de 24 h après la précédente
 * demande : des réinstallations en chaîne laisseraient des VM orphelines et saturerait le stockage.
 */
export async function requestReinstall(
  deps: Pick<EngineDeps, "db"> & Partial<Pick<EngineDeps, "now">>,
  instanceId: string,
  requestId: string,
  actor: "customer" | "operator" = "customer",
): Promise<
  | { accepted: true }
  | { accepted: false; reason: string; code: ReinstallRefusal }
> {
  return deps.db.transaction(async (tx) => {
    const [inst] = await tx
      .select()
      .from(vpsInstances)
      .where(eq(vpsInstances.id, instanceId))
      .for("update");
    if (!inst) throw new PermanentError("instance introuvable");
    if (inst.status !== "active")
      return {
        accepted: false as const,
        reason: `instance ${inst.status}`,
        code: "not_active" as const,
      };
    if (inst.previousVmid !== null)
      return {
        accepted: false as const,
        reason:
          "une ancienne VM est encore conservée : attendez sa suppression avant de réinstaller",
        code: "reinstall_pending_purge" as const,
      };
    const [last] = await tx
      .select({ at: vpsEvents.createdAt })
      .from(vpsEvents)
      .where(
        and(
          eq(vpsEvents.instanceId, instanceId),
          eq(vpsEvents.kind, "reinstall_started"),
        ),
      )
      .orderBy(desc(vpsEvents.createdAt))
      .limit(1);
    const now = (deps.now ?? (() => new Date()))();
    if (last && now.getTime() - last.at.getTime() < MIN_REINSTALL_INTERVAL_MS)
      return {
        accepted: false as const,
        reason: "une réinstallation a déjà été demandée il y a moins de 24 h",
        code: "reinstall_too_soon" as const,
      };
    await tx
      .update(vpsInstances)
      .set({
        status: "reinstalling",
        step: "snapshot",
        lastSnapshotName: null,
        lastError: null,
        pendingAction: "reinstall",
        updatedAt: new Date(),
      })
      .where(eq(vpsInstances.id, instanceId));
    await recordVpsEvent(tx, {
      organizationId: inst.organizationId,
      orderId: inst.orderId,
      instanceId,
      actor,
      kind: "reinstall_started",
      message: "réinstallation demandée (instantané préalable)",
    });
    await enqueue(tx, {
      type: "vps.provision",
      payload: { orderId: inst.orderId },
      idempotencyKey: `vps-reinstall:${instanceId}:${requestId}`,
      maxAttempts: 6,
    });
    return { accepted: true as const };
  });
}

// ─── Cycle de vie (abonnement) ──────────────────────────────────────────────────

export async function currentDecision(
  deps: EngineDeps,
  inst: Instance,
): Promise<LifecycleDecision> {
  const [row] = await deps.db
    .select({
      status: subscriptions.status,
      graceEndsAt: subscriptions.graceEndsAt,
    })
    .from(vpsOrders)
    .leftJoin(
      subscriptions,
      eq(subscriptions.stripeSubscriptionId, vpsOrders.stripeSubscriptionId),
    )
    .where(eq(vpsOrders.id, inst.orderId));
  return decideLifecycle({
    instance: { status: inst.status, retentionEndsAt: inst.retentionEndsAt },
    subscription: row?.status
      ? { status: row.status, graceEndsAt: row.graceEndsAt ?? null }
      : null,
    now: deps.now(),
  });
}

/** Exécute une décision de cycle de vie si elle est toujours d'actualité au moment de l'exécution. */
export async function runLifecycle(
  deps: EngineDeps,
  instanceId: string,
  action: LifecycleAction,
): Promise<{ done: boolean; reason?: string }> {
  const res = await withLease(deps, instanceId, async (held) => {
    const inst = await loadInstance(deps, held.id);
    if (action === "purge_old") return purgeOld(deps, inst);
    const decision = await currentDecision(deps, inst);
    if (decision.kind !== action)
      return { done: false, reason: `décision actuelle : ${decision.kind}` };
    const ev = (
      kind: string,
      message: string,
      actor: "system" | "stripe" = "system",
    ) =>
      recordVpsEvent(deps.db, {
        organizationId: inst.organizationId,
        orderId: inst.orderId,
        instanceId: inst.id,
        actor,
        kind,
        message,
      });

    if (action === "suspend") {
      await shutdown(deps, inst);
      await setInstance(deps, inst.id, {
        status: "suspended",
        power: "stopped",
        suspendedAt: deps.now(),
      });
      await ev(
        "suspended",
        "VPS suspendu : paiement non reçu à la fin du délai de grâce",
        "stripe",
      );
    } else if (action === "resume") {
      const { client, node, vmid } = await clientOf(deps, inst);
      const st = await client.vmStatus(node, vmid);
      if (st.status !== "running")
        await task(deps, client, await client.startVm(node, vmid));
      await setInstance(deps, inst.id, {
        status: "active",
        power: "running",
        suspendedAt: null,
      });
      await ev("resumed", "VPS repris : paiement reçu", "stripe");
    } else if (action === "terminate") {
      if (inst.serverId && inst.vmid) await shutdown(deps, inst);
      const at = deps.now();
      await deps.db.transaction(async (tx) => {
        await tx
          .update(vpsInstances)
          .set({
            status: "canceled",
            power: "stopped",
            canceledAt: at,
            retentionEndsAt: retentionEnd(at, deps.settings.retentionDays),
            updatedAt: new Date(),
            pendingAction: null,
          })
          .where(eq(vpsInstances.id, inst.id));
        await tx
          .update(vpsOrders)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(eq(vpsOrders.id, inst.orderId));
        await recordVpsEvent(tx, {
          organizationId: inst.organizationId,
          orderId: inst.orderId,
          instanceId: inst.id,
          actor: "stripe",
          kind: "canceled",
          message: `abonnement résilié : VM arrêtée, suppression dans ${deps.settings.retentionDays} jours`,
          detail: { retentionDays: deps.settings.retentionDays },
        });
      });
    } else {
      await deleteVm(deps, inst);
      // État et événement dans une même transaction : l'un ne se voit jamais sans l'autre.
      await deps.db.transaction(async (tx) => {
        await tx
          .update(vpsInstances)
          .set({
            status: "deleted",
            deletedAt: deps.now(),
            power: "stopped",
            updatedAt: new Date(),
          })
          .where(eq(vpsInstances.id, inst.id));
        await recordVpsEvent(tx, {
          organizationId: inst.organizationId,
          orderId: inst.orderId,
          instanceId: inst.id,
          actor: "system",
          kind: "deleted",
          message: "VM supprimée à la fin de la rétention",
        });
      });
    }
    return { done: true };
  });
  if (res.busy) throw new BusyError();
  return res.value;
}

async function deleteVm(deps: EngineDeps, inst: Instance) {
  if (inst.serverId && inst.vmid) {
    const { client, node, vmid } = await clientOf(deps, inst);
    const cfg = await client.findConfig(node, vmid);
    // Même garde que compensate et purgeOld : seule la VM portant le nom de cette instance est supprimée
    // (le numéro a pu être réattribué, la VM renommée) ; jamais une VM étrangère.
    if (cfg && cfg.name === inst.vmName) {
      const st = await client.vmStatus(node, vmid);
      if (st.status === "running")
        await task(deps, client, await client.stopVm(node, vmid));
      await task(
        deps,
        client,
        await client.deleteVm(node, vmid, { skiplock: true }),
      );
    } else if (cfg) {
      deps.log.error(
        "vps : suppression ignorée, la VM ne porte pas le nom attendu",
        {
          instanceId: inst.id,
        },
      );
      await recordVpsEvent(deps.db, {
        organizationId: inst.organizationId,
        orderId: inst.orderId,
        instanceId: inst.id,
        actor: "system",
        kind: "delete_skipped_foreign_vm",
        message:
          "VM non supprimée : son nom ne correspond pas à l'instance (vérification manuelle requise)",
      });
    }
  }
  await purgeOld(deps, inst, true);
}

/** Supprime l'ancienne VM gardée après une réinstallation, une fois la rétention écoulée. */
async function purgeOld(
  deps: EngineDeps,
  inst: Instance,
  force = false,
): Promise<{ done: boolean; reason?: string }> {
  if (!inst.serverId || !inst.previousVmid)
    return { done: false, reason: "rien à supprimer" };
  if (
    !force &&
    (!inst.previousDeleteAfter || inst.previousDeleteAfter > deps.now())
  )
    return { done: false, reason: "rétention en cours" };
  const server = await loadServer(deps, inst.serverId);
  const client = await deps.proxmox(server);
  const cfg = await client.findConfig(server.node, inst.previousVmid);
  // Garde-fou : seule une VM portant le nom « …-old » de cette instance est supprimée.
  if (cfg && cfg.name === `${inst.vmName}-old`) {
    const st = await client.vmStatus(server.node, inst.previousVmid);
    if (st.status === "running")
      await task(
        deps,
        client,
        await client.stopVm(server.node, inst.previousVmid),
      );
    await task(
      deps,
      client,
      await client.deleteVm(server.node, inst.previousVmid, { skiplock: true }),
    );
  }
  await deps.db
    .update(vpsInstances)
    .set({
      previousVmid: null,
      previousDeleteAfter: null,
      updatedAt: new Date(),
    })
    .where(eq(vpsInstances.id, inst.id));
  await recordVpsEvent(deps.db, {
    organizationId: inst.organizationId,
    orderId: inst.orderId,
    instanceId: inst.id,
    actor: "system",
    kind: "old_vm_deleted",
    message: "ancienne VM supprimée (rétention écoulée)",
  });
  return { done: true };
}

// ─── Balayage périodique ────────────────────────────────────────────────────────

const bucket = (now: Date, ms: number) => Math.floor(now.getTime() / ms);

/**
 * Balayage : rien dans Stripe ne signale la fin d'un délai de grâce ni d'une rétention. Ce travail
 * périodique relit l'état de chaque instance, met en file les suspensions et suppressions dues,
 * reprend les provisionnements abandonnés par un worker mort et expire les commandes impayées.
 */
export async function sweep(deps: EngineDeps): Promise<{
  lifecycle: number;
  resumed: number;
  purged: number;
  expired: number;
  lateResumed: number;
}> {
  const now = deps.now();
  const live = await deps.db
    .select()
    .from(vpsInstances)
    .where(
      and(
        ne(vpsInstances.status, "deleted"),
        ne(vpsInstances.status, "failed"),
      ),
    );
  let lifecycle = 0;
  let resumed = 0;
  for (const inst of live) {
    const decision = await currentDecision(deps, inst);
    if (decision.kind !== "noop") {
      await enqueue(deps.db, {
        type: "vps.lifecycle",
        payload: { instanceId: inst.id, action: decision.kind },
        idempotencyKey: `vps-lifecycle:${inst.id}:${decision.kind}:sweep:${bucket(now, 600_000)}`,
        maxAttempts: 8,
      });
      lifecycle++;
    }
    const abandoned =
      (inst.status === "provisioning" || inst.status === "reinstalling") &&
      (!inst.leaseUntil || inst.leaseUntil < new Date()) &&
      Date.now() - inst.updatedAt.getTime() > 600_000;
    if (abandoned) {
      await enqueue(deps.db, {
        type: "vps.provision",
        payload: { orderId: inst.orderId },
        idempotencyKey: `vps-provision:${inst.orderId}:resume:${bucket(now, 600_000)}`,
        maxAttempts: 6,
      });
      resumed++;
    }
  }
  const dueOld = await deps.db
    .select({ id: vpsInstances.id })
    .from(vpsInstances)
    .where(
      and(
        isNotNull(vpsInstances.previousVmid),
        lt(vpsInstances.previousDeleteAfter, now),
      ),
    );
  for (const { id } of dueOld)
    await enqueue(deps.db, {
      type: "vps.lifecycle",
      payload: { instanceId: id, action: "purge_old" },
      idempotencyKey: `vps-lifecycle:${id}:purge_old:sweep:${bucket(now, 600_000)}`,
      maxAttempts: 8,
    });
  // Filet seulement : Stripe fait expirer la commande (`checkout.session.expired`). Une commande dont
  // l'abonnement est déjà relié (Checkout terminé, prélèvement en cours de confirmation) relève de
  // Stripe : elle n'expire que par ses événements, jamais par ce balayage.
  const expired = await deps.db
    .update(vpsOrders)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(vpsOrders.status, "awaiting_payment"),
        isNull(vpsOrders.stripeSubscriptionId),
        lt(vpsOrders.createdAt, new Date(now.getTime() - 24 * 3_600_000)),
      ),
    )
    .returning({ id: vpsOrders.id });
  const late = await retryLatePayments(deps.db, now);
  return {
    lifecycle,
    resumed,
    purged: dueOld.length,
    expired: expired.length,
    lateResumed: late.resumed,
  };
}
