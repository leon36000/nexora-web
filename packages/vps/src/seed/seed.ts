import {
  type Database,
  eq,
  proxmoxServers,
  vpsApps,
  vpsPlans,
} from "@nexora/db";
import {
  approveCatalogVersion,
  createApp,
  createDraftVersion,
  createPlan,
  publishCatalogVersion,
  updateApp,
  updatePlan,
} from "../catalog.ts";
import { guardOptions } from "../guard.ts";
import {
  createServer,
  createTemplate,
  updateServer,
  updateTemplate,
} from "../servers.ts";
import { SEED_GUIDE_APPS, SEED_INSTALLABLE_APPS } from "./apps.ts";

/**
 * Chargement idempotent des applications (en BROUILLON : le fondateur les approuve et les publie
 * depuis Directus). Ne touche jamais une application déjà présente.
 */
export async function seedApps(db: Database): Promise<{ created: string[] }> {
  const created: string[] = [];
  for (const app of [...SEED_INSTALLABLE_APPS, ...SEED_GUIDE_APPS]) {
    const [exists] = await db
      .select({ id: vpsApps.id })
      .from(vpsApps)
      .where(eq(vpsApps.code, app.code));
    if (exists) continue;
    await createApp(db, app);
    created.push(app.code);
  }
  return { created };
}

/**
 * Données de DÉVELOPPEMENT (base de dev seulement, refusé si NODE_ENV=production) : un serveur
 * « simulé » prêt, un gabarit, trois plans marqués `isDevSample` à des prix symboliques, et la
 * publication de tout le catalogue. Aucun de ces plans n'est publiable en production (garde).
 */
export async function seedDevCatalog(
  db: Database,
  env: Record<string, string | undefined> = process.env,
): Promise<{ published: string }> {
  if (env.NODE_ENV === "production")
    throw new Error("seedDevCatalog est refusé en production");
  await seedApps(db);

  let [server] = await db
    .select()
    .from(proxmoxServers)
    .where(eq(proxmoxServers.code, "dev-simule"));
  if (!server) {
    server = await createServer(db, {
      code: "dev-simule",
      name: "Serveur simulé (développement)",
      host: "http://127.0.0.1",
      port: 18006,
      node: "pve1",
      capacity: { vcpu: 32, ramMb: 131_072, diskGb: 4_000 },
      ipPool: {
        ranges: [{ from: "10.20.0.10", to: "10.20.0.40" }],
        prefix: 24,
        gateway: "10.20.0.1",
        dns: ["10.20.0.2"],
        bridge: "vmbr0",
      },
      tokenRef: "proxmox.dev",
    });
    const tpl = await createTemplate(db, {
      serverId: server.id,
      code: "debian-12-ci",
      name: "Debian 12 cloud-init",
      os: "debian",
      osVersion: "12",
      vmid: 9000,
      ciUser: "debian",
    });
    await updateTemplate(db, tpl.id, { state: "ready" });
    await updateServer(db, server.id, { state: "ready" });
  }

  const plans = [
    {
      code: "dev-essai-1",
      name: "[DEV] Essai 1",
      vcpu: 1,
      ramMb: 2048,
      diskGb: 40,
      bandwidthGb: 2_000,
      priceMonthlyCents: 100,
      priceYearlyCents: 1_000,
      sort: 10,
    },
    {
      code: "dev-essai-2",
      name: "[DEV] Essai 2",
      vcpu: 2,
      ramMb: 4096,
      diskGb: 80,
      bandwidthGb: 4_000,
      priceMonthlyCents: 200,
      priceYearlyCents: 2_000,
      sort: 20,
      highlighted: true,
    },
    {
      code: "dev-essai-4",
      name: "[DEV] Essai 4",
      vcpu: 4,
      ramMb: 8192,
      diskGb: 160,
      bandwidthGb: 8_000,
      priceMonthlyCents: 400,
      priceYearlyCents: 4_000,
      sort: 30,
    },
  ];
  for (const p of plans) {
    const [exists] = await db
      .select({ id: vpsPlans.id })
      .from(vpsPlans)
      .where(eq(vpsPlans.code, p.code));
    if (exists) continue;
    const row = await createPlan(db, {
      ...p,
      templateCode: "debian-12-ci",
      isDevSample: true,
      descriptionFr: "Plan de développement, non vendable.",
      descriptionEn: "Development plan, not for sale.",
    });
    await updatePlan(db, row.id, { status: "approved" });
    await updatePlan(db, row.id, { status: "published" });
  }
  for (const app of await db.select().from(vpsApps)) {
    if (app.status === "published") continue;
    await updateApp(db, app.id, { status: "approved" });
    await updateApp(db, app.id, { status: "published" });
  }
  const guard = await guardOptions(db, env);
  const draft = await createDraftVersion(db, guard);
  if (draft.unchanged) return { published: draft.version.short };
  await approveCatalogVersion(db, draft.version.id, guard);
  const v = await publishCatalogVersion(db, draft.version.id, guard);
  return { published: v.short };
}

/**
 * Plans VPS préparés en BROUILLON avec les prix SUGGÉRÉS par l'étude de marché
 * (docs/recherche/10-prix-et-engagements-donnees.md, partie A.2). Le drapeau `priceSuggested` interdit
 * leur approbation tant que le fondateur n'a pas confirmé (ou changé) les prix : rien n'est jamais publié
 * sans lui. Idempotent : un plan déjà présent n'est jamais touché. Aucun plan de développement.
 * Coûts de base et marges : voir l'étude (sous réserve de confirmation du centre de données).
 */
export const SUGGESTED_PLANS = [
  {
    code: "essentiel",
    name: "Essentiel",
    vcpu: 2,
    ramMb: 4096,
    diskGb: 40,
    month: 1900,
    year: 19200,
    sort: 10,
  },
  {
    code: "croissance",
    name: "Croissance",
    vcpu: 4,
    ramMb: 8192,
    diskGb: 75,
    month: 3500,
    year: 34800,
    sort: 20,
  },
  {
    code: "pro",
    name: "Pro",
    vcpu: 6,
    ramMb: 12288,
    diskGb: 100,
    month: 5500,
    year: 54000,
    sort: 30,
  },
  {
    code: "scale",
    name: "Scale",
    vcpu: 8,
    ramMb: 24576,
    diskGb: 200,
    month: 9900,
    year: 106800,
    sort: 40,
  },
].map((p) => ({
  code: p.code,
  name: p.name,
  vcpu: p.vcpu,
  ramMb: p.ramMb,
  diskGb: p.diskGb,
  // Bande passante non précisée tant que le fournisseur n'est pas confirmé (0 = « non précisée »).
  bandwidthGb: 0,
  priceMonthlyCents: p.month,
  priceYearlyCents: p.year,
  sort: p.sort,
  descriptionFr: `${p.vcpu} vCPU, ${p.ramMb / 1024} Go de mémoire vive et ${p.diskGb} Go de disque NVMe. Serveur privé virtuel pour vos applications.`,
  descriptionEn: `${p.vcpu} vCPU, ${p.ramMb / 1024} GB of RAM and ${p.diskGb} GB of NVMe storage. A virtual private server for your applications.`,
}));

export async function seedDraftPlans(
  db: Database,
): Promise<{ created: string[] }> {
  const created: string[] = [];
  for (const p of SUGGESTED_PLANS) {
    const [exists] = await db
      .select({ id: vpsPlans.id })
      .from(vpsPlans)
      .where(eq(vpsPlans.code, p.code));
    if (exists) continue;
    await createPlan(db, {
      ...p,
      templateCode: "debian-12-ci",
      priceSuggested: true,
      isDevSample: false,
    });
    created.push(p.code);
  }
  return { created };
}
