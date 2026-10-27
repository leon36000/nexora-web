import { randomBytes } from "node:crypto";
import {
  type Database,
  enqueue,
  eq,
  organizations,
  osTemplates,
  vpsOrders,
} from "@nexora/db";
import { createLogger } from "@nexora/log";
import {
  approveCatalogVersion,
  createApp,
  createDraftVersion,
  createPlan,
  markCatalogApplied,
  publishCatalogVersion,
  updateApp,
  updatePlan,
} from "./catalog.ts";
import {
  DEFAULT_SETTINGS,
  type EngineDeps,
  type EngineSettings,
} from "./engine-core.ts";
import type { InstallInput, InstallResult, InstallRunner } from "./install.ts";
import { createOrder } from "./orders.ts";
import type { ProxmoxSimulator } from "./proxmox/simulator.ts";
import {
  createServer,
  createTemplate,
  proxmoxClientFactory,
  updateServer,
  updateTemplate,
} from "./servers.ts";

/** Outils de test et de démonstration : serveur simulé, catalogue publié, commande payée. */
export const SIM_TOKEN =
  "nexora@pve!provision=11111111-2222-3333-4444-555555555555";
export const CUSTOMER_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
export const WORKER_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGWorkerWorkerWorkerWorkerWorkerWorkerWorker1";

export const INSTALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail
# Application d'essai : écrit un fichier témoin, n'installe rien.
echo "installé: $NEXORA_APP_CODE $NEXORA_APP_VERSION" > /var/lib/nexora-installed
`;

/** Invité simulé : exécute « l'installation » contre la VM du simulateur et garde une trace. */
export function createSimRunner(sim: ProxmoxSimulator) {
  const installs: {
    host: string;
    user: string;
    scriptSha256: string;
    env: Record<string, string>;
  }[] = [];
  const cleanups: string[] = [];
  const state = { failNext: 0, failMessage: "exit 1" };
  const runner: InstallRunner = {
    async run(input: InstallInput): Promise<InstallResult> {
      const vm = sim
        .guests()
        .find((v) =>
          String(v.config.ipconfig0 ?? "").includes(`ip=${input.host}/`),
        );
      if (vm?.status !== "running")
        return { ok: false, exitCode: 255, tail: "ssh : connexion refusée" };
      // Préparation d'un gabarit : l'agent invité s'installe dans l'image importée.
      if (input.script.includes("qemu-guest-agent")) vm.agentInstalled = true;
      if (state.failNext > 0) {
        state.failNext -= 1;
        return { ok: false, exitCode: 1, tail: state.failMessage };
      }
      const { createHash } = await import("node:crypto");
      installs.push({
        host: input.host,
        user: input.user,
        env: input.env,
        scriptSha256: createHash("sha256").update(input.script).digest("hex"),
      });
      return {
        ok: true,
        exitCode: 0,
        tail: "",
        hostKeyFingerprint: "SHA256:SIMULATED",
      };
    },
    async cleanup(input) {
      cleanups.push(input.host);
      return { ok: true };
    },
  };
  return { runner, installs, cleanups, state };
}

export interface Fixture {
  organizationId: string;
  serverId: string;
  templateId: string;
  planCode: string;
  appCode: string;
  catalogVersionId: string;
}

export const SIM_POOL = {
  ranges: [{ from: "10.20.0.10", to: "10.20.0.15" }],
  prefix: 24,
  gateway: "10.20.0.1",
  dns: ["10.20.0.2"],
  bridge: "vmbr0",
};

export async function newOrg(db: Database): Promise<string> {
  const id = `org_${randomBytes(6).toString("hex")}`;
  await db.insert(organizations).values({ id, name: id, slug: id });
  return id;
}

export interface SeedOptions {
  /** Port du simulateur déjà démarré. */
  simPort: number;
  node?: string;
  capacity?: { vcpu: number; ramMb: number; diskGb: number };
  plan?: {
    priceMonthlyCents?: number;
    priceYearlyCents?: number;
    ramMb?: number;
  };
  withPorts?: boolean;
  /** Serveur déjà branché (gabarit `debian-12-ci` prêt) : aucun serveur ni gabarit n'est créé. */
  serverId?: string;
}

/** Serveur prêt + gabarit + plan et application publiés (version « appliquée » côté Stripe). */
export async function seedFixture(
  db: Database,
  opts: SeedOptions,
): Promise<Fixture> {
  const organizationId = await newOrg(db);
  let server: { id: string };
  let tpl: { id: string };
  if (opts.serverId) {
    server = { id: opts.serverId };
    const [row] = await db
      .select()
      .from(osTemplates)
      .where(eq(osTemplates.serverId, opts.serverId));
    if (!row) throw new Error("le serveur n'a aucun gabarit");
    tpl = row;
  } else {
    const code = `srv-${randomBytes(3).toString("hex")}`;
    server = await createServer(db, {
      code,
      name: "Serveur d'essai",
      host: "http://127.0.0.1",
      port: opts.simPort,
      node: opts.node ?? "pve1",
      capacity: opts.capacity ?? { vcpu: 32, ramMb: 131_072, diskGb: 2_000 },
      ipPool: SIM_POOL,
      tokenRef: "proxmox.test",
    });
    await updateServer(db, server.id, { state: "ready" });
    tpl = await createTemplate(db, {
      serverId: server.id,
      code: "debian-12-ci",
      name: "Debian 12 cloud-init",
      os: "debian",
      osVersion: "12",
      vmid: 9000,
      ciUser: "debian",
    });
    await updateTemplate(db, tpl.id, { state: "ready" });
  }
  const planCode = `essai-${randomBytes(2).toString("hex")}`;
  const plan = await createPlan(db, {
    code: planCode,
    name: "Plan d'essai",
    vcpu: 2,
    ramMb: opts.plan?.ramMb ?? 4096,
    diskGb: 40,
    bandwidthGb: 4000,
    templateCode: "debian-12-ci",
    priceMonthlyCents: opts.plan?.priceMonthlyCents ?? 1500,
    priceYearlyCents: opts.plan?.priceYearlyCents ?? 15000,
    isDevSample: true,
  });
  await updatePlan(db, plan.id, { status: "approved" });
  await updatePlan(db, plan.id, { status: "published" });
  const appCode = `app-${randomBytes(2).toString("hex")}`;
  const app = await createApp(db, {
    code: appCode,
    name: "Application d'essai",
    version: "1.2.3",
    upstreamUrl: "https://github.com/exemple/exemple",
    license: "MIT",
    licenseUrl:
      "https://raw.githubusercontent.com/exemple/exemple/main/LICENSE",
    installScript: INSTALL_SCRIPT,
    minRamMb: 2048,
    ports: opts.withPorts
      ? [
          {
            port: 3001,
            proto: "tcp",
            exposure: "tunnel",
            labelFr: "Interface",
            labelEn: "Interface",
          },
          {
            port: 8443,
            proto: "tcp",
            exposure: "public",
            labelFr: "API",
            labelEn: "API",
          },
        ]
      : [],
  });
  await updateApp(db, app.id, { status: "approved" });
  await updateApp(db, app.id, { status: "published" });
  const guard = { allowDevSamples: true };
  const draft = await createDraftVersion(db, guard);
  await approveCatalogVersion(db, draft.version.id, guard);
  const published = await publishCatalogVersion(db, draft.version.id, guard);
  await markCatalogApplied(db, published.id, {
    status: "applied",
    detail: {
      stripe: {
        plans: {
          [planCode]: {
            productId: "prod_test",
            monthly: "price_test_month",
            yearly: "price_test_year",
          },
        },
      },
    },
  });
  return {
    organizationId,
    serverId: server.id,
    templateId: tpl.id,
    planCode,
    appCode,
    catalogVersionId: published.id,
  };
}

/** Commande payée (abonnement fictif relié) prête à être provisionnée. */
export async function paidOrder(
  db: Database,
  fx: Fixture,
  over: { term?: "month" | "year"; subscriptionId?: string } = {},
) {
  const { order } = await createOrder(db, {
    organizationId: fx.organizationId,
    idempotencyKey: `test-${randomBytes(6).toString("hex")}`,
    planCode: fx.planCode,
    appCode: fx.appCode,
    term: over.term ?? "month",
    sshPublicKey: CUSTOMER_KEY,
    maxPerOrganization: 50,
  });
  await db
    .update(vpsOrders)
    .set({
      status: "paid",
      paidAt: new Date(),
      stripeSubscriptionId:
        over.subscriptionId ?? `sub_${randomBytes(5).toString("hex")}`,
    })
    .where(eq(vpsOrders.id, order.id));
  return order.id;
}

export function engineDeps(
  db: Database,
  runner: InstallRunner,
  over: Omit<Partial<EngineDeps>, "settings"> & {
    settings?: Partial<EngineSettings>;
  } = {},
): EngineDeps {
  const { settings, ...rest } = over;
  return {
    db,
    proxmox: proxmoxClientFactory({ getSecret: async () => SIM_TOKEN }),
    runner,
    log: createLogger({ name: "vps-test", level: "error" }),
    now: () => new Date(),
    workerId: `w-${randomBytes(3).toString("hex")}`,
    sleep: async () => {},
    settings: {
      ...DEFAULT_SETTINGS,
      taskPollMs: 0,
      agentPollMs: 0,
      workerSshPublicKey: WORKER_KEY,
      ...settings,
    },
    ...rest,
  };
}

export { enqueue };
