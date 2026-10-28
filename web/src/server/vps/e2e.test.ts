/**
 * Preuve de bout en bout du jalon S6 (VPS), SANS paiement réel et SANS vrai Proxmox :
 *
 *   serveur Proxmox simulé branché (jeton collé dans le Coffre) et testé → plan et application publiés
 *   (versions approuvées) → « Publier vers Stripe » (stripe-mock) → inscription d'un client de test
 *   (courriel réel vers Mailpit) → Checkout d'abonnement → webhook SIGNÉ → vrai worker : clone,
 *   cloud-init, pare-feu, démarrage, installation → instance active avec IP → arrêt/démarrage →
 *   réinstallation (instantané préalable) → échec de paiement → délai de grâce → suspension →
 *   reprise → résiliation → rétention de 7 jours → suppression (horloge simulée).
 *
 * Exige la pile de développement (PostgreSQL, Mailpit, stripe-mock). `WRITE_CAPTURE=1` écrit le
 * compte rendu dans docs/captures/s6/e2e-vps.md.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  eq,
  jobs,
  members,
  proxmoxServers,
  subscriptions,
  users,
  vpsEvents,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { type Keyring, loadKeyring } from "@nexora/vault/crypto";
import { putSecret, readSecret } from "@nexora/vault/store";
import {
  type EngineDeps,
  proxmoxClientFactory,
  SEED_INSTALLABLE_APPS,
  sweep,
} from "@nexora/vps";
import { ProxmoxSimulator } from "@nexora/vps/simulator";
import {
  createSimRunner,
  engineDeps,
  SIM_POOL,
  SIM_TOKEN,
  WORKER_KEY,
} from "@nexora/vps/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HandlerRegistry } from "../../../../worker/src/registry";
import { registerVpsHandlers } from "../../../../worker/src/vps-handlers";
import { Worker } from "../../../../worker/src/worker";
import { resolveOrgContext } from "../auth/guards";
import { createAuth, createSmtpMailer, type NexoraAuth } from "../auth/index";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { createStripeClient } from "../stripe/client";
import {
  buildEvent,
  TEST_WEBHOOK_SECRET,
  webhookRequest,
} from "../stripe/testing";
import { handleStripeWebhook } from "../stripe/webhook-route";
import { handleVpsAdmin, type VpsAdminDeps } from "./admin-handlers";
import {
  handleVpsAction,
  handleVpsCheckout,
  type VpsCustomerDeps,
} from "./customer-handlers";

const SITE = "http://localhost:3500";
const MAILPIT_API = "http://127.0.0.1:8026";
const STRIPE_MOCK = "http://127.0.0.1:12111";
const PASSWORD = "un-mot-de-passe-solide-42";
const ADMIN = "e".repeat(40);
const DAY = 86_400_000;

async function reachable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return r.status < 500 || r.status === 401;
  } catch {
    return false;
  }
}
const stackUp =
  (await reachable(`${MAILPIT_API}/api/v1/info`)) &&
  (await reachable(`${STRIPE_MOCK}/v1/customers`));
if (!stackUp)
  console.warn(
    "e2e S6 ignoré : Mailpit (8026) ou stripe-mock (12111) injoignable. Démarrer la pile de développement.",
  );

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => Promise<boolean>, what: string, ms = 30_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error(`délai dépassé : ${what}`);
    await sleep(40);
  }
}

describe.skipIf(!stackUp)(
  "S6 de bout en bout (simulateur Proxmox, stripe-mock, Mailpit, webhooks signés, vrai worker)",
  () => {
    let t: TestDatabase;
    let sim: ProxmoxSimulator;
    let stopSim: () => Promise<void>;
    let simPort = 0;
    let auth: NexoraAuth;
    let keyring: Keyring;
    let worker: Worker;
    let vps: EngineDeps;
    const clock = { now: new Date() };
    const guest = (() => ({
      current: undefined as undefined | ReturnType<typeof createSimRunner>,
    }))();
    const log = { debug() {}, info() {}, warn() {}, error() {} } as never;
    const report: string[] = [];
    const note = (line: string) => report.push(line);

    const email = `e2e-vps-${randomBytes(4).toString("hex")}@example.com`;
    let cookie = "";
    let orgId = "";
    let stripeClient: ReturnType<typeof createStripeClient>;
    const stripeCalls: Array<{ kind: string; params: Record<string, any> }> =
      [];

    let serverId = "";
    let planCode = "";
    let appCode = "";
    let orderId = "";
    let subId = "";
    let instanceId = "";
    let customerId = "";

    const adminDeps = (over: Partial<VpsAdminDeps> = {}): VpsAdminDeps => ({
      db: () => t.db,
      adminToken: ADMIN,
      getSecret: (ref) => readSecret(t.db, keyring, ref),
      stripe: async () => stripeClient as never,
      log,
      now: () => clock.now,
      env: { NODE_ENV: "development" },
      ...over,
    });
    async function admin(method: string, path: string, body?: unknown) {
      const res = await handleVpsAdmin(
        new Request(`${SITE}/api/admin/vps/${path}`, {
          method,
          headers: {
            authorization: `Bearer ${ADMIN}`,
            "content-type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        path.split("/").filter(Boolean),
        adminDeps(),
      );
      return {
        status: res.status,
        body: (await res.json()) as Record<string, any>,
      };
    }
    const customerDeps = (): VpsCustomerDeps => ({
      db: () => t.db,
      siteUrl: SITE,
      getContext: async (headers) => {
        const s = await auth.api.getSession({ headers });
        if (!s) return null;
        const ctx = await resolveOrgContext(
          t.db,
          s.user.id,
          (s.session as { activeOrganizationId?: string | null })
            .activeOrganizationId ?? null,
        );
        return ctx
          ? {
              userId: s.user.id,
              email: s.user.email,
              organizationId: ctx.organizationId,
              role: ctx.role,
            }
          : null;
      },
      stripe: async () => stripeClient as never,
      config: DEFAULT_BILLING_CONFIG,
      log,
      now: () => clock.now,
      maxPerOrganization: 5,
    });
    const customerPost = (path: string, body: unknown) =>
      new Request(`${SITE}${path}`, {
        method: "POST",
        headers: {
          origin: SITE,
          cookie,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const webhook = async (type: string, object: object, created: number) => {
      const res = await handleStripeWebhook(
        webhookRequest(buildEvent(type, object, { created })),
        {
          webhookSecret: async () => TEST_WEBHOOK_SECRET,
          process: {
            db: t.db,
            plans: {
              listPublished: async () => [],
              getByCode: async () => null,
              getByPriceId: async () => null,
            },
            config: DEFAULT_BILLING_CONFIG,
            log,
          },
          log,
        },
      );
      expect(res.status).toBe(200);
      return (await res.json()) as { status: string };
    };
    const instance = async () =>
      (
        await t.db
          .select()
          .from(vpsInstances)
          .where(eq(vpsInstances.id, instanceId))
      )[0];
    const meta = () => ({
      kind: "vps",
      organization_id: orgId,
      vps_order_id: orderId,
    });
    const nowSec = () => Math.floor(clock.now.getTime() / 1000);
    const invoiceObj = (reason: string) => ({
      id: `in_${randomBytes(4).toString("hex")}`,
      customer: customerId,
      billing_reason: reason,
      parent: {
        subscription_details: { subscription: subId, metadata: meta() },
      },
      lines: {
        data: [
          {
            period: { start: nowSec(), end: nowSec() + 30 * 86_400 },
            pricing: { price_details: { price: "price_mock" } },
          },
        ],
      },
    });
    const subObj = (status: string) => ({
      id: subId,
      customer: customerId,
      status,
      cancel_at_period_end: false,
      metadata: meta(),
      items: {
        data: [
          {
            current_period_start: nowSec(),
            current_period_end: nowSec() + 30 * 86_400,
            price: { id: "price_mock" },
          },
        ],
      },
    });

    async function mailTextFor(to: string): Promise<string> {
      for (let i = 0; i < 25; i++) {
        const search = (await (
          await fetch(
            `${MAILPIT_API}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
          )
        ).json()) as { messages?: Array<{ ID: string }> };
        const id = search.messages?.[0]?.ID;
        if (id)
          return (
            (await (
              await fetch(`${MAILPIT_API}/api/v1/message/${id}`)
            ).json()) as { Text: string }
          ).Text;
        await sleep(200);
      }
      throw new Error("courriel non reçu par Mailpit");
    }

    beforeAll(async () => {
      t = await createTestDatabase();
      keyring = loadKeyring({
        NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
      });
      sim = new ProxmoxSimulator({
        token: SIM_TOKEN,
        taskPolls: 2,
        agentPolls: 2,
      });
      const s = await sim.start();
      stopSim = s.close;
      simPort = s.port;
      auth = createAuth({
        db: t.db,
        secret: randomBytes(32).toString("hex"),
        baseURL: SITE,
        mailer: createSmtpMailer({
          url: "smtp://127.0.0.1:1026",
          from: "Nexora <no-reply@nexora.test>",
        }),
        rateLimit: { enabled: false },
      });
      stripeClient = createStripeClient({
        secretKey: "sk_test_e2e",
        mockUrl: STRIPE_MOCK,
      });
      // Enregistre les paramètres envoyés à Stripe : stripe-mock les valide contre le schéma OpenAPI officiel.
      const sessions = stripeClient.checkout.sessions;
      const createSession = sessions.create.bind(sessions);
      (sessions as { create: unknown }).create = (
        params: Record<string, any>,
        options?: object,
      ) => {
        stripeCalls.push({ kind: "sessions.create", params });
        return (createSession as (p: unknown, o?: object) => unknown)(
          params,
          options,
        );
      };
      const subs = stripeClient.subscriptions;
      const updateSub = subs.update.bind(subs);
      (subs as { update: unknown }).update = (
        id: string,
        params: Record<string, any>,
      ) => {
        stripeCalls.push({ kind: "subscriptions.update", params });
        return (updateSub as (i: string, p: unknown) => unknown)(id, params);
      };
      guest.current = createSimRunner(sim);
      vps = engineDeps(t.db, guest.current.runner, {
        now: () => clock.now,
        settings: { agentRetryMs: 20, workerSshPublicKey: WORKER_KEY },
        // Le jeton est lu du Coffre (chiffré), exactement comme en production.
        proxmox: proxmoxClientFactory({
          getSecret: (ref) => readSecret(t.db, keyring, ref),
          checkHost: () => null,
        }),
      });
      const registry = registerVpsHandlers(new HandlerRegistry(), vps);
      worker = new Worker({
        db: t.db,
        registry,
        logger: createLogger({ name: "e2e", sink: () => {} }),
        concurrency: 3,
        pollIntervalMs: 20,
      });
      worker.start();
    });
    afterAll(async () => {
      await worker?.stop(5_000);
      await stopSim?.();
      await t?.drop();
      if (process.env.WRITE_CAPTURE === "1") {
        mkdirSync(new URL("../../../../docs/captures/s6", import.meta.url), {
          recursive: true,
        });
        writeFileSync(
          new URL("../../../../docs/captures/s6/e2e-vps.md", import.meta.url),
          `# Preuve de bout en bout — VPS (S6)\n\nGénéré par \`WRITE_CAPTURE=1 bun run --cwd web vitest run src/server/vps/e2e.test.ts\` le ${new Date().toISOString().slice(0, 10)}.\nSimulateur Proxmox (dérivé de l'apidoc officiel), stripe-mock, Mailpit, webhooks signés, vrai worker, horloge simulée pour les délais. Aucun paiement réel, aucun vrai serveur Proxmox.\n\n${report.join("\n")}\n`,
        );
      }
    });

    it("1. le jeton Proxmox est collé dans le Coffre ; la fiche serveur n'en garde que la référence ; « Tester la connexion » la passe à « prêt »", async () => {
      await putSecret(t.db, keyring, {
        ref: "proxmox.e2e",
        value: SIM_TOKEN,
        kind: "proxmox",
      });
      const created = await admin("POST", "servers", {
        code: "mtl-sim",
        name: "Montréal (simulé)",
        host: "http://127.0.0.1",
        port: simPort,
        node: "pve1",
        capacity: { vcpu: 16, ramMb: 65536, diskGb: 1000 },
        ipPool: SIM_POOL,
        tokenRef: "proxmox.e2e",
      });
      expect(created.status).toBe(201);
      expect(created.body.state).toBe("draft");
      expect(JSON.stringify(created.body)).not.toContain(SIM_TOKEN);
      serverId = created.body.id;
      const tpl = await admin("POST", `servers/${serverId}/templates`, {
        code: "debian-12-ci",
        name: "Debian 12 cloud-init",
        os: "debian",
        osVersion: "12",
        vmid: 9000,
        ciUser: "debian",
      });
      expect(tpl.status).toBe(201);
      const test = await admin("POST", `servers/${serverId}/test`);
      expect(test.body).toMatchObject({ ok: true, server: { state: "ready" } });
      note(
        `1. Serveur simulé branché et testé : ${test.body.detail} (jeton lu du Coffre, jamais dans la fiche).`,
      );
    });

    it("2. plan et application créés, publiés par version approuvée, puis « Publier vers Stripe » (stripe-mock)", async () => {
      planCode = "e2e-kvm-2";
      const plan = await admin("POST", "plans", {
        code: planCode,
        name: "[E2E] KVM 2",
        vcpu: 2,
        ramMb: 4096,
        diskGb: 40,
        bandwidthGb: 4000,
        templateCode: "debian-12-ci",
        priceMonthlyCents: 1500,
        priceYearlyCents: 15000,
        isDevSample: true,
      });
      expect(plan.status).toBe(201);
      for (const status of ["approved", "published"])
        expect(
          (await admin("PATCH", `plans/${plan.body.id}`, { status })).status,
        ).toBe(200);
      const seed = SEED_INSTALLABLE_APPS.find(
        (a) => a.code === "ollama-anythingllm",
      );
      appCode = seed?.code ?? "";
      const app = await admin("POST", "apps", { ...seed, ports: seed?.ports });
      expect(app.status).toBe(201);
      for (const status of ["approved", "published"])
        expect(
          (await admin("PATCH", `apps/${app.body.id}`, { status })).status,
        ).toBe(200);
      const draft = await admin("POST", "versions");
      expect(draft.body.issues).toEqual([]);
      expect(
        (await admin("POST", `versions/${draft.body.version.id}/approve`))
          .status,
      ).toBe(200);
      expect(
        (await admin("POST", `versions/${draft.body.version.id}/publish`))
          .status,
      ).toBe(200);
      const sync = await admin("POST", "stripe/publish");
      expect(sync.status).toBe(200);
      expect(sync.body.plans[planCode].monthly).toMatch(/^price_/);
      note(
        `2. Version de catalogue ${draft.body.version.short} publiée (garde : prix présents, licence MIT, somme SHA-256 du script) puis envoyée vers Stripe (prix mensuel et annuel, hors taxes).`,
      );
    });

    it("3. inscription d'un client de test (courriel réel vers Mailpit), vérification, connexion", async () => {
      const call = (path: string, body?: unknown) =>
        auth.handler(
          new Request(`${SITE}/api/auth${path}`, {
            method: body ? "POST" : "GET",
            headers: { "content-type": "application/json", origin: SITE },
            body: body ? JSON.stringify(body) : undefined,
          }),
        );
      expect(
        (
          await call("/sign-up/email", {
            email,
            password: PASSWORD,
            name: "Camille Tremblay",
            company: "Tremblay et fils",
            locale: "fr",
            callbackURL: "/compte/verification",
          })
        ).status,
      ).toBe(200);
      const link = /https?:\/\/\S+verify-email\S*/.exec(
        await mailTextFor(email),
      )?.[0] as string;
      const url = new URL(link);
      expect([200, 302]).toContain(
        (await auth.handler(new Request(`${SITE}${url.pathname}${url.search}`)))
          .status,
      );
      const login = await call("/sign-in/email", { email, password: PASSWORD });
      expect(login.status).toBe(200);
      cookie = login.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const [user] = await t.db
        .select()
        .from(users)
        .where(eq(users.email, email));
      const [member] = await t.db
        .select()
        .from(members)
        .where(eq(members.userId, user?.id as string));
      orgId = member?.organizationId as string;
      expect(orgId).toBeTruthy();
      note(
        "3. Client de test inscrit, courriel vérifié (Mailpit), connecté ; une organisation créée.",
      );
    });

    it("4. Checkout d'abonnement : session acceptée par stripe-mock, prix de la version publiée, commande dans les métadonnées", async () => {
      const res = await handleVpsCheckout(
        customerPost("/api/vps/checkout", {
          plan: planCode,
          app: appCode,
          term: "month",
          sshKey:
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
          requestId: "e2e-request-0001",
          lang: "fr",
        }),
        customerDeps(),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { url: string; orderId: string };
      expect(json.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      orderId = json.orderId;
      const sent = stripeCalls.find((c) => c.kind === "sessions.create")
        ?.params as Record<string, any>;
      expect(sent).toMatchObject({
        mode: "subscription",
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        metadata: { kind: "vps", vps_order_id: orderId },
      });
      // Un double envoi du formulaire ne crée pas une seconde commande.
      const again = await handleVpsCheckout(
        customerPost("/api/vps/checkout", {
          plan: planCode,
          app: appCode,
          term: "month",
          sshKey:
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
          requestId: "e2e-request-0001",
          lang: "fr",
        }),
        customerDeps(),
      );
      expect(((await again.json()) as { orderId: string }).orderId).toBe(
        orderId,
      );
      expect(
        await t.db
          .select()
          .from(vpsOrders)
          .where(eq(vpsOrders.organizationId, orgId)),
      ).toHaveLength(1);
      note(
        `4. Checkout (mode abonnement, Stripe Tax, adresse requise) créé chez stripe-mock pour la commande ${orderId.slice(0, 8)} ; formulaire renvoyé = même commande.`,
      );
    });

    it("5. webhooks SIGNÉS : le provisionnement ne démarre qu'à la facture payée ; les rejeux ne doublent rien ; le vrai worker livre le VPS", async () => {
      subId = `sub_${randomBytes(5).toString("hex")}`;
      customerId = `cus_${randomBytes(5).toString("hex")}`;
      await t.db
        .insert((await import("@nexora/db")).billingCustomers)
        .values({ organizationId: orgId, stripeCustomerId: customerId })
        .onConflictDoNothing();
      await webhook(
        "checkout.session.completed",
        {
          id: "cs_e2e_1",
          object: "checkout.session",
          mode: "subscription",
          payment_status: "paid",
          client_reference_id: orgId,
          customer: customerId,
          subscription: subId,
          metadata: meta(),
        },
        nowSec(),
      );
      expect(
        (
          await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, orderId))
        )[0]?.status,
      ).toBe("awaiting_payment");
      expect(
        await t.db
          .select()
          .from(vpsInstances)
          .where(eq(vpsInstances.orderId, orderId)),
      ).toHaveLength(0);

      const paid = buildEvent(
        "invoice.paid",
        invoiceObj("subscription_create"),
        { created: nowSec() + 1 },
      );
      const post = () =>
        handleStripeWebhook(webhookRequest(paid), {
          webhookSecret: async () => TEST_WEBHOOK_SECRET,
          process: {
            db: t.db,
            plans: {
              listPublished: async () => [],
              getByCode: async () => null,
              getByPriceId: async () => null,
            },
            config: DEFAULT_BILLING_CONFIG,
            log,
          },
          log,
        });
      expect(((await (await post()).json()) as { status: string }).status).toBe(
        "processed",
      );
      expect(((await (await post()).json()) as { status: string }).status).toBe(
        "duplicate",
      );

      await until(
        async () =>
          (
            await t.db
              .select()
              .from(vpsInstances)
              .where(eq(vpsInstances.orderId, orderId))
          )[0]?.status === "active",
        "instance active",
      );
      const inst = await instance_();
      expect(inst).toMatchObject({
        status: "active",
        power: "running",
        ipv4: "10.20.0.10",
      });
      const vm = sim.vms.get(inst?.vmid as number);
      expect(vm).toMatchObject({ status: "running" });
      expect(vm?.firewall.options).toMatchObject({
        enable: 1,
        policy_in: "DROP",
      });
      expect(
        vm?.firewall.rules.some(
          (r) => r.type === "out" && r.dport === "25" && r.action === "DROP",
        ),
      ).toBe(true);
      expect(decodeURIComponent(String(vm?.config.sshkeys))).not.toContain(
        "nexora-worker",
      );
      expect(sim.cloneRequests).toBe(1);
      expect(guest.current?.installs).toHaveLength(1);
      expect(
        (
          await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, orderId))
        )[0]?.status,
      ).toBe("fulfilled");
      note(
        `5. Webhook signé → tâche unique → worker : VM ${inst?.vmid} clonée, cloud-init (clé SSH du client, IP ${inst?.ipv4}), pare-feu (SSH seulement, port 25 sortant fermé), démarrée, application installée (script vérifié) → ACTIVE. Rejeu du même événement : « duplicate ».`,
      );
    });

    async function instance_() {
      const row = (
        await t.db
          .select()
          .from(vpsInstances)
          .where(eq(vpsInstances.orderId, orderId))
      )[0];
      instanceId = row?.id ?? "";
      return row;
    }
    const action = (body: Record<string, unknown>) =>
      handleVpsAction(
        customerPost(`/api/account/vps/${instanceId}/action`, {
          requestId: `r-${randomBytes(5).toString("hex")}`,
          ...body,
        }),
        instanceId,
        customerDeps(),
      );

    it("6. arrêt puis démarrage depuis l'espace client", async () => {
      expect((await action({ action: "stop" })).status).toBe(202);
      await until(async () => (await instance())?.power === "stopped", "arrêt");
      expect(sim.vms.get((await instance())?.vmid as number)?.status).toBe(
        "stopped",
      );
      expect((await action({ action: "start" })).status).toBe(202);
      await until(
        async () => (await instance())?.power === "running",
        "démarrage",
      );
      note(
        "6. Arrêt propre puis démarrage : VM `stopped` puis `running` côté Proxmox, état de l'instance suivi.",
      );
    });

    it("7. réinstallation avec confirmation : instantané préalable, ancienne VM gardée 7 jours, VM neuve avec la même adresse", async () => {
      const before = await instance();
      expect((await action({ action: "reinstall" })).status).toBe(422);
      expect(
        (await action({ action: "reinstall", confirm: true })).status,
      ).toBe(202);
      await until(async () => {
        const i = await instance();
        return i?.status === "active" && i.previousVmid !== null;
      }, "réinstallation");
      const after = await instance();
      expect(after?.vmid).not.toBe(before?.vmid);
      expect(after?.ipv4).toBe(before?.ipv4);
      const old = sim.vms.get(before?.vmid as number);
      expect(old?.snapshots.map((s) => s.name)).toContain(
        after?.lastSnapshotName,
      );
      expect(old?.status).toBe("stopped");
      expect(guest.current?.installs).toHaveLength(2);
      note(
        `7. Réinstallation : instantané « ${after?.lastSnapshotName} » pris sur l'ancienne VM ${before?.vmid} (arrêtée, retirée du réseau, gardée 7 jours) ; nouvelle VM ${after?.vmid}, même IP, application réinstallée.`,
      );
    });

    it("8. échec de paiement : le service tourne pendant la grâce (7 jours), puis le balayage le suspend", async () => {
      await webhook(
        "invoice.payment_failed",
        invoiceObj("subscription_cycle"),
        nowSec() + 2,
      );
      const [sub] = await t.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, subId));
      expect(sub?.status).toBe("past_due");
      expect(sub?.graceEndsAt).not.toBeNull();
      await sweep(vps);
      expect((await instance())?.status).toBe("active");
      // La grâce est écoulée (horloge simulée) : le balayage met la suspension en file ; le worker l'exécute.
      clock.now = new Date(clock.now.getTime() + 8 * DAY);
      const swept = await sweep(vps);
      expect(swept.lifecycle).toBe(1);
      await until(
        async () => (await instance())?.status === "suspended",
        "suspension",
      );
      expect(sim.vms.get((await instance())?.vmid as number)?.status).toBe(
        "stopped",
      );
      note(
        "8. `invoice.payment_failed` → past_due avec délai de grâce de 7 jours (machine à états S4) ; service intact pendant la grâce ; grâce écoulée (horloge simulée) → balayage → VM arrêtée, instance SUSPENDUE, données gardées.",
      );
    });

    it("9. paiement reçu : le service reprend", async () => {
      await webhook(
        "invoice.paid",
        invoiceObj("subscription_cycle"),
        nowSec() + 3,
      );
      await until(
        async () => (await instance())?.status === "active",
        "reprise",
      );
      expect(sim.vms.get((await instance())?.vmid as number)?.status).toBe(
        "running",
      );
      note(
        "9. `invoice.paid` → abonnement actif → tâche de reprise → VM redémarrée, instance ACTIVE.",
      );
    });

    it("10. résiliation : demande à Stripe (fin de période), puis abonnement supprimé → VM arrêtée, rétention de 7 jours, suppression (horloge simulée)", async () => {
      expect((await action({ action: "cancel" })).status).toBe(422); // confirmation exigée
      expect((await action({ action: "cancel", confirm: true })).status).toBe(
        202,
      );
      expect(
        stripeCalls.some(
          (c) =>
            c.kind === "subscriptions.update" &&
            c.params.cancel_at_period_end === true,
        ),
      ).toBe(true);
      await webhook(
        "customer.subscription.deleted",
        subObj("canceled"),
        nowSec() + 4,
      );
      await until(
        async () => (await instance())?.status === "canceled",
        "résiliation",
      );
      const canceled = await instance();
      expect(canceled?.retentionEndsAt?.getTime()).toBe(
        clock.now.getTime() + 7 * DAY,
      );
      expect(sim.vms.has(canceled?.vmid as number)).toBe(true);
      // Avant la fin de la rétention : rien n'est supprimé.
      clock.now = new Date(clock.now.getTime() + 6 * DAY);
      await sweep(vps);
      await sleep(300);
      expect(sim.vms.has(canceled?.vmid as number)).toBe(true);
      // Après : la VM (et l'ancienne VM de la réinstallation, échue plus tôt) sont supprimées.
      clock.now = new Date(clock.now.getTime() + 2 * DAY);
      await sweep(vps);
      await until(
        async () => (await instance())?.status === "deleted",
        "suppression",
      );
      expect(sim.guests()).toHaveLength(0);
      note(
        "10. Résiliation confirmée → Stripe (cancel_at_period_end) → `customer.subscription.deleted` → VM arrêtée, rétention jusqu'au " +
          canceled?.retentionEndsAt?.toISOString().slice(0, 10) +
          " (7 jours) → rien supprimé avant l'échéance → après : VM supprimée, ancienne VM de la réinstallation supprimée, instance `deleted`.",
      );
    });

    it("11. journal : toutes les étapes sont tracées sans secret, et aucune tâche n'est restée en échec", async () => {
      const events = await t.db
        .select()
        .from(vpsEvents)
        .where(eq(vpsEvents.instanceId, instanceId));
      const kinds = events.map((e) => e.kind);
      expect(kinds).toEqual(
        expect.arrayContaining([
          "provision_started",
          "placed",
          "clone_started",
          "vm_started",
          "app_installed",
          "active",
          "power_stop",
          "power_start",
          "reinstall_started",
          "old_vm_retained",
          "reinstall_done",
          "suspended",
          "resumed",
          "cancel_requested",
          "canceled",
          "old_vm_deleted",
          "deleted",
        ]),
      );
      expect(JSON.stringify(events)).not.toMatch(
        /PVEAPIToken|nexora@pve!|sk_test|-----BEGIN/,
      );
      const all = await t.db.select().from(jobs);
      expect(all.filter((j) => j.status === "dead")).toHaveLength(0);
      expect(sim.cloneRequests).toBe(2); // une fois à la livraison, une fois à la réinstallation
      expect(
        (
          await t.db
            .select()
            .from(proxmoxServers)
            .where(eq(proxmoxServers.id, serverId))
        )[0]?.state,
      ).toBe("ready");
      note(
        `11. Journal (${events.length} événements) sans secret ; ${all.length} tâches, aucune « dead » ; ${sim.cloneRequests} clonages au total (livraison + réinstallation), jamais de doublon.`,
      );
    });
  },
);
