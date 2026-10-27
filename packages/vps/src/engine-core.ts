import {
  and,
  type Database,
  eq,
  isNull,
  or,
  type ProxmoxServerState,
  proxmoxServers,
  sql,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import {
  getCatalogVersionById,
  type SnapshotApp,
  type SnapshotPlan,
} from "./catalog.ts";
import type { InstallRunner } from "./install.ts";
import type { ProxmoxClient } from "./proxmox/client.ts";

export type Instance = typeof vpsInstances.$inferSelect;
export type Order = typeof vpsOrders.$inferSelect;
export type Server = typeof proxmoxServers.$inferSelect;

/** Échec définitif : inutile de réessayer (intégrité du script, application retirée…). */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

export interface EngineSettings {
  /** Bail d'exécution sur une instance (doit rester sous le bail de 5 min de la file). */
  leaseMs: number;
  /** Durée maximale d'une exécution avant de rendre la main (reprise par tâche de continuation). */
  budgetMs: number;
  taskTimeoutMs: number;
  taskPollMs: number;
  agentTimeoutMs: number;
  agentPollMs: number;
  installTimeoutMs: number;
  shutdownTimeoutSec: number;
  retentionDays: number;
  /** Sans capacité disponible, la commande attend ce temps avant d'être déclarée en échec. */
  placementTimeoutMs: number;
  /** Clé publique du worker (ajoutée à cloud-init le temps de l'installation). */
  workerSshPublicKey: string | null;
}

export const DEFAULT_SETTINGS: EngineSettings = {
  leaseMs: 240_000,
  budgetMs: 150_000,
  taskTimeoutMs: 300_000,
  taskPollMs: 1_500,
  agentTimeoutMs: 600_000,
  agentPollMs: 3_000,
  installTimeoutMs: 900_000,
  shutdownTimeoutSec: 60,
  retentionDays: 7,
  placementTimeoutMs: 24 * 3_600_000,
  workerSshPublicKey: null,
};

export function settingsFromEnv(
  env: Record<string, string | undefined> = process.env,
): EngineSettings {
  const int = (name: string, fallback: number) => {
    const n = Number(env[name]);
    return Number.isSafeInteger(n) && n >= 0 && env[name] !== "" ? n : fallback;
  };
  return {
    ...DEFAULT_SETTINGS,
    retentionDays: int("VPS_RETENTION_DAYS", DEFAULT_SETTINGS.retentionDays),
    agentTimeoutMs: int(
      "VPS_AGENT_TIMEOUT_MS",
      DEFAULT_SETTINGS.agentTimeoutMs,
    ),
    installTimeoutMs: int(
      "VPS_INSTALL_TIMEOUT_MS",
      DEFAULT_SETTINGS.installTimeoutMs,
    ),
    workerSshPublicKey: env.VPS_WORKER_SSH_PUBLIC_KEY?.trim() || null,
  };
}

export interface EngineDeps {
  db: Database;
  /** Client Proxmox du serveur (jeton lu du coffre à chaque appel). */
  proxmox: (server: Server) => Promise<ProxmoxClient>;
  runner: InstallRunner;
  log: Logger;
  /** Horloge (simulable dans la preuve de bout en bout). */
  now: () => Date;
  settings: EngineSettings;
  workerId: string;
  sleep?: (ms: number) => Promise<void>;
}

export const sleepFor = (deps: EngineDeps, ms: number) =>
  (deps.sleep ?? ((n: number) => new Promise<void>((r) => setTimeout(r, n))))(
    ms,
  );

/** Serveurs sur lesquels on accepte d'agir (les autres états n'empêchent pas de nettoyer). */
export const SERVER_ACTIVE: ProxmoxServerState[] = [
  "ready",
  "maintenance",
  "offline",
  "draft",
];

// ─── Bail d'exécution ───────────────────────────────────────────────────────────

/**
 * Prend le bail de l'instance (un seul worker avance une instance à la fois). Le bail est en
 * temps de la base de données : indépendant de l'horloge simulée des tests.
 */
export async function acquireLease(
  deps: EngineDeps,
  instanceId: string,
): Promise<Instance | null> {
  const [row] = await deps.db
    .update(vpsInstances)
    .set({
      leaseOwner: deps.workerId,
      leaseUntil: sql`now() + (${deps.settings.leaseMs} * interval '1 millisecond')`,
    })
    .where(
      and(
        eq(vpsInstances.id, instanceId),
        or(
          isNull(vpsInstances.leaseUntil),
          sql`${vpsInstances.leaseUntil} < now()`,
        ),
      ),
    )
    .returning();
  return row ?? null;
}

export async function releaseLease(deps: EngineDeps, instanceId: string) {
  await deps.db
    .update(vpsInstances)
    .set({ leaseOwner: null, leaseUntil: null })
    .where(
      and(
        eq(vpsInstances.id, instanceId),
        eq(vpsInstances.leaseOwner, deps.workerId),
      ),
    );
}

export async function withLease<T>(
  deps: EngineDeps,
  instanceId: string,
  fn: (inst: Instance) => Promise<T>,
): Promise<{ busy: true } | { busy: false; value: T }> {
  const inst = await acquireLease(deps, instanceId);
  if (!inst) return { busy: true };
  try {
    return { busy: false, value: await fn(inst) };
  } finally {
    await releaseLease(deps, instanceId);
  }
}

// ─── Lectures ───────────────────────────────────────────────────────────────────

export async function loadInstance(
  deps: EngineDeps,
  id: string,
): Promise<Instance> {
  const [row] = await deps.db
    .select()
    .from(vpsInstances)
    .where(eq(vpsInstances.id, id));
  if (!row) throw new PermanentError("instance introuvable");
  return row;
}
export async function loadOrder(deps: EngineDeps, id: string): Promise<Order> {
  const [row] = await deps.db
    .select()
    .from(vpsOrders)
    .where(eq(vpsOrders.id, id));
  if (!row) throw new PermanentError("commande introuvable");
  return row;
}
export async function loadServer(
  deps: EngineDeps,
  id: string,
): Promise<Server> {
  const [row] = await deps.db
    .select()
    .from(proxmoxServers)
    .where(eq(proxmoxServers.id, id));
  if (!row) throw new PermanentError("serveur Proxmox introuvable");
  return row;
}

/** Plan et application tels qu'ils étaient dans la version de catalogue de la commande. */
export async function loadPinned(
  deps: EngineDeps,
  inst: Instance,
): Promise<{ plan: SnapshotPlan; app: SnapshotApp }> {
  const version = await getCatalogVersionById(deps.db, inst.catalogVersionId);
  const plan = version.snapshot.plans.find((p) => p.code === inst.planCode);
  const app = version.snapshot.apps.find((a) => a.code === inst.appCode);
  if (!plan || !app)
    throw new PermanentError(
      "plan ou application absent de la version de catalogue",
    );
  return { plan, app };
}

export async function setInstance(
  deps: EngineDeps,
  id: string,
  patch: Partial<typeof vpsInstances.$inferInsert>,
) {
  await deps.db
    .update(vpsInstances)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(vpsInstances.id, id));
}
