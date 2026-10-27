import { randomBytes } from "node:crypto";
import {
  type Database,
  enqueue,
  eq,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { loadKeyring } from "@nexora/vault/crypto";
import { readSecret } from "@nexora/vault/store";
import {
  createSshRunner,
  type EngineDeps,
  enqueueContinuation,
  type LifecycleAction,
  type PowerAction,
  provisionOrder,
  proxmoxClientFactory,
  runLifecycle,
  runPowerAction,
  safeError,
  settingsFromEnv,
  sweep,
} from "@nexora/vps";
import type { Mailer } from "./contact-notify.ts";
import type { HandlerRegistry, JobHandler } from "./registry.ts";

/**
 * Tâches du VPS (S6) : `vps.provision` (commande payée ou réinstallation), `vps.lifecycle`
 * (suspension, reprise, résiliation, suppression), `vps.action` (démarrer/arrêter/redémarrer),
 * `vps.sweep` (balayage périodique, se replanifie lui-même) et `vps.alert` (courriel à l'opérateur).
 * Chaque gestionnaire est idempotent : la file peut le rejouer (bail de 5 minutes, redémarrage).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !UUID.test(v))
    throw new Error(`charge invalide : ${key}`);
  return v;
}

export const SWEEP_EVERY_MS = 60_000;
const bucket = (ms: number, now = Date.now()) => Math.floor(now / ms);

export function registerVpsHandlers(
  registry: HandlerRegistry,
  deps: EngineDeps,
  options: {
    mailer?: Mailer | null;
    alertTo?: string;
    alertFrom?: string;
  } = {},
): HandlerRegistry {
  const provision: JobHandler = async (job) => {
    const orderId = uuid(job.payload, "orderId");
    const out = await provisionOrder(deps, orderId, {
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
    });
    if (out.outcome === "wait") await enqueueContinuation(deps, orderId, out);
  };

  const lifecycle: JobHandler = async (job) => {
    const instanceId = uuid(job.payload, "instanceId");
    const action = String(job.payload.action) as LifecycleAction;
    if (
      !["suspend", "resume", "terminate", "delete", "purge_old"].includes(
        action,
      )
    )
      throw new Error("action de cycle de vie inconnue");
    // Instance occupée (BusyError) : l'erreur remonte, la file réessaie plus tard.
    await runLifecycle(deps, instanceId, action);
  };

  const power: JobHandler = async (job) => {
    const instanceId = uuid(job.payload, "instanceId");
    const action = String(job.payload.action) as PowerAction;
    if (!["start", "stop", "reboot"].includes(action))
      throw new Error("action inconnue");
    await runPowerAction(deps, instanceId, action);
  };

  const sweeper: JobHandler = async (job, ctx) => {
    const result = await sweep(deps);
    ctx.log.info("vps : balayage", result);
    await enqueue(deps.db, {
      type: "vps.sweep",
      payload: {},
      idempotencyKey: `vps-sweep:${bucket(SWEEP_EVERY_MS) + 1}`,
      availableAt: new Date(Date.now() + SWEEP_EVERY_MS),
    });
    void job;
  };

  const alert: JobHandler = async (job, ctx) => {
    const orderId = uuid(job.payload, "orderId");
    const reason = String(job.payload.reason ?? "inconnu").slice(0, 40);
    const [order] = await deps.db
      .select()
      .from(vpsOrders)
      .where(eq(vpsOrders.id, orderId));
    const [inst] = await deps.db
      .select()
      .from(vpsInstances)
      .where(eq(vpsInstances.orderId, orderId));
    // Aucun renseignement personnel : identifiants techniques, plan, étape, raison nettoyée.
    const lines = [
      `Commande : ${orderId}`,
      `Plan / application : ${order?.planCode ?? "?"} / ${order?.appCode ?? "?"}`,
      `Étape : ${inst?.step ?? "?"} (état ${inst?.status ?? "?"})`,
      `Raison : ${reason}${inst?.lastError ? ` — ${safeError(inst.lastError)}` : ""}`,
      "",
      reason === "provision_failed"
        ? "Aucun remboursement automatique n'a été fait : décider depuis Stripe (annulation de l'abonnement, remboursement)."
        : "La commande attend de la capacité : brancher un serveur ou libérer de la place.",
    ];
    ctx.log.error("vps : intervention de l'opérateur requise", {
      orderId,
      reason,
    });
    if (!options.mailer || !options.alertTo) return;
    await options.mailer.send({
      from: options.alertFrom ?? "vps@localhost",
      to: options.alertTo,
      replyTo: options.alertFrom ?? "vps@localhost",
      subject: `[Nexora VPS] ${reason === "provision_failed" ? "Échec de provisionnement" : "Capacité insuffisante"} — ${orderId.slice(0, 8)}`,
      text: lines.join("\n"),
    });
  };

  return registry
    .register("vps.provision", provision)
    .register("vps.lifecycle", lifecycle)
    .register("vps.action", power)
    .register("vps.sweep", sweeper)
    .register("vps.alert", alert);
}

/** Dépendances de production du moteur VPS (coffre, SSH). `null` si la clé maîtresse du coffre est absente. */
export function vpsDepsFromEnv(
  db: Database,
  log: Logger,
  env = process.env,
): EngineDeps | null {
  if (!env.NEXORA_VAULT_MASTER_KEY) return null;
  const keyring = loadKeyring(env);
  const getSecret = (ref: string) => readSecret(db, keyring, ref);
  return {
    db,
    proxmox: proxmoxClientFactory({ getSecret }),
    runner: createSshRunner({
      privateKey: () => getSecret("vps.worker_ssh_key"),
    }),
    log,
    now: () => new Date(),
    settings: settingsFromEnv(env),
    workerId: `worker-${randomBytes(4).toString("hex")}`,
  };
}
