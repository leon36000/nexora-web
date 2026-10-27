import { randomBytes } from "node:crypto";
import { organizations, vpsEvents, vpsInstances, vpsOrders } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { ProxmoxSimulator } from "@nexora/vps/simulator";
import { INSTALL_SCRIPT, SIM_POOL, SIM_TOKEN } from "@nexora/vps/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleVpsAdmin, type VpsAdminDeps } from "./admin-handlers";

let t: TestDatabase;
let sim: ProxmoxSimulator;
let simPort = 0;
let stop: () => Promise<void>;
const ADMIN = "a".repeat(40);
let secretToken = SIM_TOKEN;
const stripePrices: Record<string, number> = {};
const stripe = {
  products: {
    create: vi.fn(async (p: { name: string }) => ({
      id: `prod_${p.name.replace(/\W/g, "")}`,
    })),
    update: vi.fn(async (id: string) => ({ id })),
  },
  prices: {
    create: vi.fn(
      async (p: {
        unit_amount: number;
        recurring: { interval: string };
        product: string;
      }) => {
        const id = `price_${p.recurring.interval}_${p.unit_amount}`;
        stripePrices[id] = p.unit_amount;
        return { id };
      },
    ),
    retrieve: vi.fn(),
    update: vi.fn(),
  },
};
const silent = { debug() {}, info() {}, warn() {}, error() {} } as never;

function deps(over: Partial<VpsAdminDeps> = {}): VpsAdminDeps {
  return {
    db: () => t.db,
    adminToken: ADMIN,
    getSecret: async (ref) => {
      if (ref !== "proxmox.main") throw new Error("absent");
      return secretToken;
    },
    stripe: async () => stripe as never,
    log: silent,
    now: () => new Date(),
    env: { NODE_ENV: "development" },
    ...over,
  };
}
async function call(
  method: string,
  path: string,
  body?: unknown,
  over: Partial<VpsAdminDeps> = {},
  token: string | null = ADMIN,
) {
  const res = await handleVpsAdmin(
    new Request(`http://localhost/api/admin/vps/${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("/").filter(Boolean),
    deps(over),
  );
  return {
    status: res.status,
    body: (await res.json()) as Record<string, any>,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  sim = new ProxmoxSimulator({ token: SIM_TOKEN });
  const s = await sim.start();
  simPort = s.port;
  stop = s.close;
});
afterAll(async () => {
  await stop();
  await t.drop();
});

describe("authentification", () => {
  it("refuse sans jeton (401), avec un mauvais jeton (401) et répond 503 si le jeton d'administration n'est pas configuré", async () => {
    expect((await call("GET", "", undefined, {}, null)).status).toBe(401);
    expect((await call("GET", "", undefined, {}, "b".repeat(40))).status).toBe(
      401,
    );
    expect(
      (await call("GET", "", undefined, { adminToken: undefined })).status,
    ).toBe(503);
  });
});

let serverId = "";
describe("serveurs Proxmox", () => {
  it("crée une fiche en brouillon, sans jamais renvoyer de secret, et refuse le HTTP en clair hors boucle locale", async () => {
    const created = await call("POST", "servers", {
      code: "mtl-1",
      name: "Montréal 1",
      host: "http://127.0.0.1",
      port: simPort,
      node: "pve1",
      capacity: { vcpu: 32, ramMb: 131072, diskGb: 2000 },
      ipPool: SIM_POOL,
      tokenRef: "proxmox.main",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      state: "draft",
      tokenRef: "proxmox.main",
    });
    expect(JSON.stringify(created.body)).not.toContain(SIM_TOKEN);
    serverId = created.body.id;
    const bad = await call("POST", "servers", {
      code: "mtl-2",
      name: "x",
      host: "http://pve.exemple.ca",
      node: "pve1",
      capacity: { vcpu: 1, ramMb: 1, diskGb: 1 },
      ipPool: SIM_POOL,
    });
    expect(bad.status).toBe(422);
  });

  it("refuse un hôte Proxmox qui vise les métadonnées du nuage ou un lien local (SSRF), à la création comme à la modification", async () => {
    for (const host of ["169.254.169.254", "https://169.254.1.1", "0.0.0.0"]) {
      const bad = await call("POST", "servers", {
        code: "ssrf-1",
        name: "x",
        host,
        node: "pve1",
        capacity: { vcpu: 1, ramMb: 1, diskGb: 1 },
        ipPool: SIM_POOL,
      });
      expect(bad.status, host).toBe(422);
      expect(bad.body.error, host).toBe("url_blocked");
    }
    const patch = await call("PATCH", `servers/${serverId}`, {
      host: "169.254.169.254",
    });
    expect(patch.status).toBe(422);
    expect(patch.body.error).toBe("url_blocked");
  });

  it("refuse un jeton qui n'est pas de type « proxmox » ou une référence réservée", async () => {
    const r = await call("POST", "servers", {
      code: "ssrf-2",
      name: "x",
      host: "http://127.0.0.1",
      node: "pve1",
      capacity: { vcpu: 1, ramMb: 1, diskGb: 1 },
      ipPool: SIM_POOL,
      tokenRef: "stripe.secret_key",
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("secret_scope");
  });

  it("l'état « prêt » ne s'obtient pas par modification directe", async () => {
    const r = await call("PATCH", `servers/${serverId}`, { state: "ready" });
    expect(r.status).toBe(422);
  });

  it("« Tester la connexion » : jeton faux → reste en brouillon avec un message sans le jeton ; jeton bon → prêt, version et gabarits", async () => {
    secretToken = "nexora@pve!provision=99999999-2222-3333-4444-555555555555";
    const bad = await call("POST", `servers/${serverId}/test`);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.server.state).toBe("draft");
    expect(JSON.stringify(bad.body)).not.toContain("99999999");

    secretToken = SIM_TOKEN;
    const tpl = await call("POST", `servers/${serverId}/templates`, {
      code: "debian-12-ci",
      name: "Debian 12",
      os: "debian",
      osVersion: "12",
      vmid: 9000,
    });
    expect(tpl.status).toBe(201);
    const ok = await call("POST", `servers/${serverId}/test`);
    expect(ok.body).toMatchObject({
      ok: true,
      server: { state: "ready" },
      templates: [{ code: "debian-12-ci", ok: true }],
    });
    expect(ok.body.version).toMatch(/^\d/);
    const listed = await call("GET", `servers/${serverId}`);
    expect(listed.body.templates[0].state).toBe("ready");
  });

  it("un serveur injoignable passe hors ligne au test suivant", async () => {
    await stop();
    const down = await call("POST", `servers/${serverId}/test`);
    expect(down.body.ok).toBe(false);
    expect(down.body.server.state).toBe("offline");
    const s = await sim.start();
    // Le serveur simulé a un nouveau port : on le met à jour dans la fiche.
    stop = s.close;
    simPort = s.port;
    await call("PATCH", `servers/${serverId}`, { port: simPort });
    const up = await call("POST", `servers/${serverId}/test`);
    expect(up.body.server.state).toBe("ready");
  });
});

describe("plans, applications, versions, Stripe", () => {
  it("refuse de publier une version avec un plan sans prix, une licence non permissive ou un script altéré", async () => {
    const plan = await call("POST", "plans", {
      code: "kvm-1",
      name: "KVM 1",
      vcpu: 1,
      ramMb: 2048,
      diskGb: 20,
      bandwidthGb: 1000,
      templateCode: "debian-12-ci",
      isDevSample: true,
    });
    expect(plan.status).toBe(201);
    const noPrice = await call("PATCH", `plans/${plan.body.id}`, {
      status: "approved",
    });
    expect(noPrice.status).toBe(422);
    expect(noPrice.body.issues[0].issue).toBe("price_missing");
    await call("PATCH", `plans/${plan.body.id}`, {
      priceMonthlyCents: 1200,
      priceYearlyCents: 12000,
    });
    expect(
      (await call("PATCH", `plans/${plan.body.id}`, { status: "approved" }))
        .status,
    ).toBe(200);
    expect(
      (await call("PATCH", `plans/${plan.body.id}`, { status: "published" }))
        .status,
    ).toBe(200);

    const gpl = await call("POST", "apps", {
      code: "gplapp",
      name: "GPL",
      version: "1.0.0",
      upstreamUrl: "https://github.com/x/y",
      license: "GPL-3.0",
      licenseUrl: "https://github.com/x/y/blob/main/LICENSE",
      installScript: INSTALL_SCRIPT,
    });
    expect(
      (await call("PATCH", `apps/${gpl.body.id}`, { status: "approved" }))
        .status,
    ).toBe(422);
    // Le script n'est jamais renvoyé par les listes (il peut être long et n'a pas à circuler).
    const listed = await call("GET", "apps");
    expect(JSON.stringify(listed.body)).not.toContain("nexora-installed");
    expect(listed.body.apps[0].hasScript).toBe(true);

    const app = await call("POST", "apps", {
      code: "agentia",
      name: "Agent IA",
      version: "0.22.5",
      upstreamUrl: "https://github.com/NousResearch/hermes-agent",
      license: "MIT",
      licenseUrl:
        "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/LICENSE",
      installScript: INSTALL_SCRIPT,
      minRamMb: 2048,
    });
    expect(app.body.installScriptSha256).toMatch(/^[0-9a-f]{64}$/);
    await call("PATCH", `apps/${app.body.id}`, { status: "approved" });
    await call("PATCH", `apps/${app.body.id}`, { status: "published" });
  });

  it("un plan de développement n'est pas publiable en production", async () => {
    const draft = await call("POST", "versions");
    expect(draft.status).toBe(201);
    const prod = await call(
      "POST",
      `versions/${draft.body.version.id}/approve`,
      undefined,
      { env: { NODE_ENV: "production" } },
    );
    expect(prod.status).toBe(422);
    expect(prod.body.issues.map((i: { issue: string }) => i.issue)).toContain(
      "dev_sample",
    );
  });

  it("brouillon → approbation → publication ; « Publier vers Stripe » écrit les identifiants sur la version", async () => {
    const draft = await call("POST", "versions");
    expect(draft.body.diff.map((d: { code: string }) => d.code)).toEqual(
      expect.arrayContaining(["kvm-1", "agentia"]),
    );
    const id = draft.body.version.id;
    expect((await call("POST", `versions/${id}/publish`)).status).toBe(409); // pas approuvée
    expect((await call("POST", `versions/${id}/approve`)).status).toBe(200);
    const onPublished = vi.fn();
    const published = await call("POST", `versions/${id}/publish`, undefined, {
      onPublished,
    });
    expect(published.status).toBe(200);
    expect(onPublished).toHaveBeenCalledOnce();

    const sync = await call("POST", "stripe/publish");
    expect(sync.status).toBe(200);
    expect(sync.body.plans["kvm-1"]).toMatchObject({
      monthly: "price_month_1200",
      yearly: "price_year_12000",
    });
    // Prix hors taxes, en dollars canadiens, par durée.
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "cad",
        unit_amount: 1200,
        tax_behavior: "exclusive",
      }),
      expect.anything(),
    );
    const overview = await call("GET", "");
    expect(overview.body.published).toMatchObject({ appliedStatus: "applied" });
    expect(overview.body.devSamplesAllowed).toBe(true);
  });
});

describe("« Publier vers Stripe » : un Stripe absent ou en panne ne donne pas une 500 muette", () => {
  it("secret Stripe absent du Coffre : 503 stripe_not_configured, avec le motif lisible par l'opérateur", async () => {
    const res = await call("POST", "stripe/publish", undefined, {
      stripe: async () => {
        throw new Error(
          "Secret Stripe absent : coller « stripe.secret_key » dans le Coffre.",
        );
      },
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("stripe_not_configured");
    expect(res.body.message).toContain("stripe.secret_key");
  });

  it("clé refusée par la garde du mode test : 503 aussi, sans citer de clé", async () => {
    const res = await call("POST", "stripe/publish", undefined, {
      stripe: async () => {
        const e = new Error("La clé Stripe doit être une clé de test");
        e.name = "StripeModeError";
        throw e;
      },
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("stripe_not_configured");
  });
});

describe("vues en lecture seule : aucun renseignement personnel", () => {
  it("les commandes et instances ne contiennent ni clé SSH, ni courriel, ni empreinte de clé", async () => {
    const org = `org_${randomBytes(4).toString("hex")}`;
    await t.db
      .insert(organizations)
      .values({ id: org, name: "Acme Inc. — Jeanne Tremblay", slug: org });
    const [plan] = await t.db
      .select()
      .from((await import("@nexora/db")).vpsPlans);
    const [app] = await t.db
      .select()
      .from((await import("@nexora/db")).vpsApps);
    const [order] = await t.db
      .insert(vpsOrders)
      .values({
        organizationId: org,
        idempotencyKey: `k-${org}`,
        planId: plan?.id as string,
        planCode: "kvm-1",
        appId: app?.id as string,
        appCode: "agentia",
        term: "month",
        region: "quebec",
        priceCents: 1200,
        catalogVersionId: crypto.randomUUID(),
        catalogVersion: "vps_x",
        sshPublicKey:
          "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIsecretkeybodyxxxxxxxxxxxxxxxxxxxxxxxxxxxxx jeanne@acme.ca",
        sshKeyFingerprint: "SHA256:abcdef",
        hostname: "vps-acme",
      })
      .returning();
    const [inst] = await t.db
      .insert(vpsInstances)
      .values({
        orderId: order?.id as string,
        organizationId: org,
        vcpu: 1,
        ramMb: 2048,
        diskGb: 20,
        planCode: "kvm-1",
        appCode: "agentia",
        appVersion: "0.22.5",
        catalogVersionId: crypto.randomUUID(),
        vmName: "nx-x",
      })
      .returning();
    await t.db.insert(vpsEvents).values({
      organizationId: org,
      orderId: order?.id,
      instanceId: inst?.id,
      actor: "system",
      kind: "x",
      message: "test",
    });
    for (const path of ["orders", "instances", "events"]) {
      const r = await call("GET", path);
      expect(r.status).toBe(200);
      const text = JSON.stringify(r.body);
      expect(text).not.toMatch(
        /secretkeybody|jeanne|acme\.ca|SHA256:abcdef|Tremblay/i,
      );
    }
    expect((await call("GET", "orders")).body.orders[0]).toMatchObject({
      planCode: "kvm-1",
      status: "awaiting_payment",
    });
  });
});
