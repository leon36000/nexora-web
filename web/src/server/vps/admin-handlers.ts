import {
  type Database,
  desc,
  eq,
  PROXMOX_SERVER_STATES,
  proxmoxServers,
  REGIONS,
  sql,
  TLS_MODES,
  VPS_APP_KINDS,
  VPS_ITEM_STATUSES,
  vpsEvents,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { secretScopeProblem } from "@nexora/vault/scope";
import { secretKindOf } from "@nexora/vault/store";
import {
  approveCatalogVersion,
  CLOUD_IMAGES,
  ConnectError,
  connectionOf,
  connectServer,
  createApp,
  createDraftVersion,
  createPlan,
  createServer,
  createTemplate,
  diffCatalogVersion,
  discoverServer,
  explainProxmoxError,
  getApp,
  getPlan,
  getPublishedCatalog,
  getServer,
  guardOptions,
  listApps,
  listCatalogVersions,
  listPlans,
  listServers,
  listTemplates,
  ProxmoxError,
  parseServerAddress,
  probeTls,
  proxmoxClientFactory,
  publishCatalogVersion,
  ServerError,
  SetupError,
  startSetup,
  suggestServerCode,
  TlsProbeError,
  testServerConnection,
  updateApp,
  updatePlan,
  updateServer,
  updateTemplate,
  VpsCatalogError,
} from "@nexora/vps";
import type Stripe from "stripe";
import { z } from "zod";
import { checkAdminAuth } from "../auth";
import { lanOutboundGuard, type OutboundGuard } from "../security/outbound";
import { syncVpsCatalogToStripe, VpsSyncError } from "./stripe-sync";

/**
 * API d'administration `/api/admin/vps/*` (D14) : serveurs Proxmox et gabarits, plans et applications
 * (versionnés), versions (brouillon → approuvé → publié), « Publier vers Stripe », et vues en LECTURE
 * SEULE des commandes, instances et événements (sans renseignement personnel : identifiants
 * techniques seulement, jamais la clé SSH ni l'adresse de courriel). Jeton d'administration en temps
 * constant. Consommée par le module Directus « VPS ».
 */
export interface VpsAdminDeps {
  /** Garde des adresses saisies (SSRF) ; défaut : réseau de l'opérateur admis, jamais lien local ni métadonnées. */
  outbound?: OutboundGuard;
  db: () => Database;
  adminToken: string | undefined;
  getSecret: (ref: string) => Promise<string>;
  stripe: () => Promise<Pick<Stripe, "products" | "prices">>;
  log: Logger;
  now: () => Date;
  env?: Record<string, string | undefined>;
  /** Appelé après une publication ou une synchronisation (revalidation des pages publiques). */
  onPublished?: () => void;
  /** Lecture du certificat au premier contact (remplaçable dans les tests). */
  probe?: typeof probeTls;
}

/** Hôte Proxmox (SSRF) et portée du jeton : refus 422 avant toute écriture. */
async function assertServerTargets(
  db: Database,
  deps: VpsAdminDeps,
  input: { host?: string; port?: number; tokenRef?: string | null },
): Promise<void> {
  if (input.host !== undefined) {
    const c = connectionOf({ host: input.host, port: input.port ?? 8006 });
    const r = await (deps.outbound ?? lanOutboundGuard)(
      `${c.protocol}://${c.host}:${c.port}/`,
    );
    if (!r.ok)
      throw new HttpError(422, "url_blocked", {
        message: r.reason,
        field: "host",
      });
  }
  if (input.tokenRef) {
    const problem = secretScopeProblem(
      "proxmox",
      input.tokenRef,
      await secretKindOf(db, input.tokenRef),
    );
    if (problem) throw new HttpError(422, "secret_scope", { message: problem });
  }
}

const NO_STORE = { "cache-control": "no-store" };
const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  new Response(
    JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: { "content-type": "application/json", ...NO_STORE, ...extra },
    },
  );

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const REF = /^[a-z0-9._-]{3,64}$/;
const code = z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);
const text = (max: number) => z.string().max(max);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const cents = int(1, 100_000_00).nullable();

const ipPool = z
  .object({
    ranges: z
      .array(
        z.object({ from: z.string().max(15), to: z.string().max(15) }).strict(),
      )
      .min(1)
      .max(20),
    prefix: int(8, 30),
    gateway: z.string().max(15),
    dns: z.array(z.string().max(15)).min(1).max(4),
    bridge: z.string().max(20),
  })
  .strict();
const capacity = z
  .object({
    vcpu: int(1, 4096),
    ramMb: int(1, 16_000_000),
    diskGb: int(1, 10_000_000),
  })
  .strict();

const serverFields = {
  name: text(100).min(1),
  host: text(255).min(1),
  port: int(1, 65535),
  node: text(60).min(1),
  region: z.enum(REGIONS),
  capacity,
  ipPool,
  tokenRef: z.string().regex(REF).nullable(),
  tlsMode: z.enum(TLS_MODES),
  tlsFingerprint: text(100).nullable(),
  storage: text(60).min(1),
  pool: text(60).nullable(),
  vmidMin: int(100, 999_999_000),
  state: z.enum(PROXMOX_SERVER_STATES),
};
const serverCreate = z
  .object({
    code,
    name: serverFields.name,
    host: serverFields.host,
    node: serverFields.node,
    capacity,
    ipPool,
    port: serverFields.port.optional(),
    region: serverFields.region.optional(),
    tokenRef: serverFields.tokenRef.optional(),
    tlsMode: serverFields.tlsMode.optional(),
    tlsFingerprint: serverFields.tlsFingerprint.optional(),
    storage: serverFields.storage.optional(),
    pool: serverFields.pool.optional(),
    vmidMin: serverFields.vmidMin.optional(),
  })
  .strict();
// L'état « prêt » ne s'obtient que par un test de connexion réussi, jamais par un PATCH.
const serverPatch = z
  .object({
    ...serverFields,
    state: z.enum(["draft", "maintenance", "offline"]),
  })
  .partial()
  .strict();

const templateCreate = z
  .object({
    code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
    name: text(100).min(1),
    os: text(40).min(1),
    osVersion: text(40).min(1),
    vmid: int(100, 999_999_999),
    ciUser: z
      .string()
      .regex(/^[a-z_][a-z0-9_-]{0,31}$/)
      .optional(),
    imageSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable()
      .optional(),
  })
  .strict();
const templatePatch = z
  .object({
    name: text(100).min(1),
    os: text(40).min(1),
    osVersion: text(40).min(1),
    vmid: int(100, 999_999_999),
    ciUser: z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$/),
    imageSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    state: z.enum(["draft", "retired"]),
  })
  .partial()
  .strict();

const planFields = {
  name: text(100).min(1),
  descriptionFr: text(2000),
  descriptionEn: text(2000),
  vcpu: int(1, 256),
  ramMb: int(256, 4_000_000),
  diskGb: int(1, 100_000),
  bandwidthGb: int(0, 10_000_000),
  region: z.enum(REGIONS),
  priceMonthlyCents: cents,
  priceYearlyCents: cents,
  highlighted: z.boolean(),
  templateCode: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
  sort: int(0, 10_000),
  isDevSample: z.boolean(),
  status: z.enum(VPS_ITEM_STATUSES),
};
const planCreate = z
  .object({
    code,
    name: planFields.name,
    vcpu: planFields.vcpu,
    ramMb: planFields.ramMb,
    diskGb: planFields.diskGb,
    bandwidthGb: planFields.bandwidthGb,
    templateCode: planFields.templateCode,
    descriptionFr: planFields.descriptionFr.optional(),
    descriptionEn: planFields.descriptionEn.optional(),
    region: planFields.region.optional(),
    priceMonthlyCents: planFields.priceMonthlyCents.optional(),
    priceYearlyCents: planFields.priceYearlyCents.optional(),
    highlighted: planFields.highlighted.optional(),
    sort: planFields.sort.optional(),
    isDevSample: planFields.isDevSample.optional(),
  })
  .strict();
const planPatch = z.object(planFields).partial().strict();

const port = z
  .object({
    port: int(1, 65535),
    proto: z.enum(["tcp", "udp"]),
    exposure: z.enum(["tunnel", "public"]),
    labelFr: text(100),
    labelEn: text(100),
  })
  .strict();
const appFields = {
  name: text(100).min(1),
  kind: z.enum(VPS_APP_KINDS),
  taglineFr: text(300),
  taglineEn: text(300),
  descriptionFr: text(6000),
  descriptionEn: text(6000),
  version: text(60).min(1),
  upstreamUrl: z.url().max(300),
  license: text(40).min(1),
  licenseUrl: z.url().max(300),
  licenseWarningFr: text(2000),
  licenseWarningEn: text(2000),
  guideFr: text(20_000),
  guideEn: text(20_000),
  installScript: text(200_000).nullable(),
  ports: z.array(port).max(20),
  minRamMb: int(256, 4_000_000),
  sort: int(0, 10_000),
  status: z.enum(VPS_ITEM_STATUSES),
};
const appCreate = z
  .object({
    code,
    name: appFields.name,
    version: appFields.version,
    upstreamUrl: appFields.upstreamUrl,
    license: appFields.license,
    licenseUrl: appFields.licenseUrl,
    kind: appFields.kind.optional(),
    taglineFr: appFields.taglineFr.optional(),
    taglineEn: appFields.taglineEn.optional(),
    descriptionFr: appFields.descriptionFr.optional(),
    descriptionEn: appFields.descriptionEn.optional(),
    licenseWarningFr: appFields.licenseWarningFr.optional(),
    licenseWarningEn: appFields.licenseWarningEn.optional(),
    guideFr: appFields.guideFr.optional(),
    guideEn: appFields.guideEn.optional(),
    installScript: appFields.installScript.optional(),
    ports: appFields.ports.optional(),
    minRamMb: appFields.minRamMb.optional(),
    sort: appFields.sort.optional(),
  })
  .strict();
const appPatch = z.object(appFields).partial().strict();

const addressField = text(300).min(1);
const connectBody = z
  .object({
    address: addressField,
    code: code.optional(),
    name: text(100).optional(),
    region: z.enum(REGIONS).optional(),
    tlsMode: z.enum(TLS_MODES),
    tlsFingerprint: text(100).nullable().optional(),
    tokenRef: z.string().regex(REF),
  })
  .strict();
const discoverBody = z
  .object({
    node: text(60),
    vmStorage: text(60),
    importStorage: text(60),
    bridge: text(20),
    pool: text(60).nullable(),
  })
  .partial()
  .strict();
const setupBody = z
  .object({
    name: text(100).min(1),
    node: text(60).min(1),
    region: z.enum(REGIONS),
    vmStorage: text(60).min(1),
    importStorage: text(60).min(1),
    pool: text(60).nullable(),
    capacity,
    network: ipPool,
    templates: z
      .array(z.enum(CLOUD_IMAGES.map((i) => i.code) as [string, ...string[]]))
      .min(1)
      .max(CLOUD_IMAGES.length),
  })
  .strict();

const STATUS_OF: Record<string, number> = {
  not_found: 404,
  conflict: 409,
  invalid_request: 422,
  invalid_transition: 409,
  publication_refused: 422,
  stale_version: 409,
};

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new HttpError(400, "invalid_body");
  }
  if (raw.length > 400_000) throw new HttpError(413, "payload_too_large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(422, "invalid_json");
  }
  const result = schema.safeParse(parsed);
  if (!result.success)
    throw new HttpError(422, "invalid_request", {
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
      })),
    });
  return result.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: string | undefined) => {
  if (!v || !UUID.test(v)) throw new HttpError(404, "not_found");
  return v;
};

/** Fiche serveur sans rien de secret : seule la RÉFÉRENCE du coffre est renvoyée. */
const publicServer = (s: typeof proxmoxServers.$inferSelect) => ({
  ...s,
  tokenRef: s.tokenRef,
});

export async function handleVpsAdmin(
  request: Request,
  path: string[],
  deps: VpsAdminDeps,
): Promise<Response> {
  const auth = checkAdminAuth(request, deps.adminToken);
  if (auth === "not_configured")
    return json({ error: "admin_not_configured" }, 503);
  if (auth === "unauthorized")
    return json({ error: "unauthorized" }, 401, {
      "www-authenticate": 'Bearer realm="nexora-admin"',
    });
  try {
    return await route(request, path, deps);
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.code, ...error.extra }, error.status);
    if (error instanceof VpsCatalogError || error instanceof ServerError)
      return json(
        {
          error: error.code,
          message: error.message,
          ...(error.details ? { issues: error.details } : {}),
        },
        STATUS_OF[error.code] ?? 400,
      );
    if (error instanceof VpsSyncError)
      return json({ error: error.code, message: error.message }, 409);
    // Branchement d'un serveur : toujours une cause lisible et une action, jamais de détail brut.
    if (error instanceof ConnectError)
      return json(
        {
          error: "connect_failed",
          code: error.code,
          cause: error.cause_,
          action: error.action,
        },
        422,
      );
    if (error instanceof TlsProbeError)
      return json(
        {
          error: "probe_failed",
          kind: error.kind,
          cause: error.message,
          action:
            error.kind === "tls"
              ? "Vérifier l'adresse et le port : l'interface web de Proxmox répond en HTTPS sur le port 8006."
              : "Vérifier l'adresse, que le serveur est allumé et que le port 8006 est ouvert depuis le worker (pare-feu). Guide, § Réseau.",
        },
        422,
      );
    if (error instanceof SetupError) {
      const base = { error: error.code, message: error.message };
      if (error.code === "not_found") return json(base, 404);
      if (error.code === "prerequisites")
        return json({ ...base, problems: error.details }, 422);
      if (error.code === "invalid_network")
        return json({ ...base, details: error.details }, 422);
      if (error.code === "unreachable")
        return json(
          {
            error: "connect_failed",
            cause: error.message,
            action: (error.details as { action?: string } | undefined)?.action,
          },
          422,
        );
      return json({ ...base, details: error.details }, 422);
    }
    deps.log.error("vps : erreur d'administration", {
      route: path.join("/"),
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}

async function route(
  request: Request,
  path: string[],
  deps: VpsAdminDeps,
): Promise<Response> {
  const db = deps.db();
  const now = deps.now();
  const method = request.method.toUpperCase();
  const [a, b, c] = path;
  const ok = (data: unknown, status = 200) => json(data, status);
  const allowed = (...methods: string[]) => {
    if (!methods.includes(method))
      throw new HttpError(405, "method_not_allowed");
  };

  if (!a) {
    allowed("GET");
    const [servers, templates, plans, apps, versions, published] =
      await Promise.all([
        listServers(db),
        listTemplates(db),
        listPlans(db),
        listApps(db),
        listCatalogVersions(db, 10),
        getPublishedCatalog(db),
      ]);
    const counts = await db
      .select({ status: vpsInstances.status, n: sql<number>`count(*)::int` })
      .from(vpsInstances)
      .groupBy(vpsInstances.status);
    return ok({
      servers: servers.map(publicServer),
      templates,
      plans,
      apps: apps.map(({ installScript: _s, ...rest }) => ({
        ...rest,
        hasScript: Boolean(_s),
      })),
      versions: versions.map(({ snapshot: _s, ...v }) => v),
      published: published
        ? {
            id: published.id,
            short: published.short,
            publishedAt: published.publishedAt,
            appliedAt: published.appliedAt,
            appliedStatus: published.appliedStatus,
          }
        : null,
      instanceCounts: Object.fromEntries(counts.map((r) => [r.status, r.n])),
      devSamplesAllowed: (deps.env ?? process.env).NODE_ENV !== "production",
    });
  }

  if (a === "connect") {
    allowed("POST");
    if (b === "probe" && !c) {
      const { address } = await body(
        request,
        z.object({ address: addressField }).strict(),
      );
      const parsed = parseServerAddress(address);
      if (!parsed || parsed.host.startsWith("http://"))
        throw new HttpError(422, "invalid_address", {
          message:
            "Adresse invalide : saisir le nom ou l'adresse du serveur, avec le port si ce n'est pas 8006 (ex. pve.exemple.ca:8006).",
          field: "address",
        });
      await assertServerTargets(db, deps, parsed);
      const tls = await (deps.probe ?? probeTls)({
        host: parsed.host,
        port: parsed.port,
        timeoutMs: 10_000,
      });
      return ok({
        address: parsed,
        code: suggestServerCode(parsed.host),
        tls,
        recommendation:
          tls.trusted && tls.hostnameMatches ? "verify" : "pinned",
      });
    }
    if (!b) {
      const input = await body(request, connectBody);
      const parsed = parseServerAddress(input.address);
      if (!parsed)
        throw new HttpError(422, "invalid_address", {
          message: "Adresse invalide (hôte[:port]).",
          field: "address",
        });
      await assertServerTargets(db, deps, {
        host: parsed.host,
        port: parsed.port,
        tokenRef: input.tokenRef,
      });
      const r = await connectServer(
        db,
        { getSecret: deps.getSecret, now: () => now },
        {
          code: input.code ?? suggestServerCode(parsed.host),
          host: parsed.host,
          port: parsed.port,
          tokenRef: input.tokenRef,
          tlsMode: input.tlsMode,
          tlsFingerprint: input.tlsFingerprint ?? null,
          name: input.name,
          region: input.region,
        },
      );
      deps.log.info("vps : serveur connecté", {
        code: r.server.code,
        created: r.created,
      });
      return ok(
        {
          created: r.created,
          server: publicServer(r.server),
          discovery: r.discovery,
        },
        r.created ? 201 : 200,
      );
    }
    throw new HttpError(404, "not_found");
  }

  if (a === "servers") {
    if (!b) {
      allowed("GET", "POST");
      if (method === "GET")
        return ok({ servers: (await listServers(db)).map(publicServer) });
      const input = await body(request, serverCreate);
      await assertServerTargets(db, deps, input);
      const created = await createServer(db, input);
      deps.log.info("vps : serveur créé", { code: created.code });
      return ok(publicServer(created), 201);
    }
    const serverId = id(b);
    if (c === "test") {
      allowed("POST");
      const check = await testServerConnection(db, serverId, {
        client: proxmoxClientFactory({ getSecret: deps.getSecret }),
        now: () => now,
      });
      deps.log.info("vps : serveur testé", { serverId, ok: check.ok });
      return ok({
        ok: check.ok,
        detail: check.detail,
        version: check.version,
        templates: check.templates,
        server: publicServer(check.server),
      });
    }
    if (c === "discover") {
      allowed("POST");
      const options = await body(request, discoverBody);
      const server = await getServer(db, serverId);
      try {
        const client = await proxmoxClientFactory({
          getSecret: deps.getSecret,
        })(server);
        return ok({ discovery: await discoverServer(client, options) });
      } catch (e) {
        if (!(e instanceof ProxmoxError)) throw e;
        const x = explainProxmoxError(e);
        throw new HttpError(422, "connect_failed", {
          cause: x.cause,
          action: x.action,
        });
      }
    }
    if (c === "setup") {
      allowed("GET", "POST");
      if (method === "GET") {
        const server = await getServer(db, serverId);
        return ok({ setup: server.setup, server: publicServer(server) });
      }
      const input = await body(request, setupBody);
      const started = await startSetup(db, serverId, input, {
        client: proxmoxClientFactory({ getSecret: deps.getSecret }),
        now: () => now,
      });
      deps.log.info("vps : branchement demandé", {
        serverId,
        run: started.setup.runId.slice(0, 8),
      });
      return ok(
        {
          setup: started.setup,
          server: publicServer(started.server),
          warnings: started.warnings,
          discovery: started.discovery,
        },
        202,
      );
    }
    if (c === "templates") {
      allowed("GET", "POST");
      if (method === "GET")
        return ok({ templates: await listTemplates(db, serverId) });
      const created = await createTemplate(db, {
        serverId,
        ...(await body(request, templateCreate)),
      });
      return ok(created, 201);
    }
    if (c) throw new HttpError(404, "not_found");
    allowed("GET", "PATCH");
    if (method === "GET")
      return ok({
        ...publicServer(await getServer(db, serverId)),
        templates: await listTemplates(db, serverId),
      });
    const serverInput = await body(request, serverPatch);
    await assertServerTargets(db, deps, serverInput);
    return ok(publicServer(await updateServer(db, serverId, serverInput)));
  }

  if (a === "templates") {
    const templateId = id(b);
    allowed("PATCH");
    return ok(
      await updateTemplate(db, templateId, await body(request, templatePatch)),
    );
  }

  if (a === "plans") {
    if (!b) {
      allowed("GET", "POST");
      if (method === "GET") return ok({ plans: await listPlans(db) });
      return ok(await createPlan(db, await body(request, planCreate)), 201);
    }
    const planId = id(b);
    allowed("GET", "PATCH");
    if (method === "GET") return ok(await getPlan(db, planId));
    return ok(
      await updatePlan(db, planId, await body(request, planPatch), now),
    );
  }

  if (a === "apps") {
    if (!b) {
      allowed("GET", "POST");
      if (method === "GET")
        return ok({
          apps: (await listApps(db)).map(({ installScript, ...r }) => ({
            ...r,
            hasScript: Boolean(installScript),
          })),
        });
      return ok(await createApp(db, await body(request, appCreate)), 201);
    }
    const appId = id(b);
    allowed("GET", "PATCH");
    if (method === "GET") return ok(await getApp(db, appId));
    return ok(await updateApp(db, appId, await body(request, appPatch), now));
  }

  if (a === "versions") {
    const guard = await guardOptions(db, deps.env);
    const strip = <T extends { snapshot: unknown }>(v: T) => {
      const { snapshot: _s, ...rest } = v;
      return rest;
    };
    if (!b) {
      allowed("GET", "POST");
      if (method === "GET")
        return ok({ versions: (await listCatalogVersions(db)).map(strip) });
      const draft = await createDraftVersion(db, guard);
      return ok(
        {
          version: strip(draft.version),
          created: draft.created,
          unchanged: draft.unchanged,
          diff: draft.diff,
          issues: draft.issues,
        },
        draft.created ? 201 : 200,
      );
    }
    const versionId = id(b);
    if (!c) {
      allowed("GET");
      const r = await diffCatalogVersion(db, versionId, guard);
      return ok({ version: strip(r.version), diff: r.diff, issues: r.issues });
    }
    if (c === "approve") {
      allowed("POST");
      const v = await approveCatalogVersion(db, versionId, guard, now);
      deps.log.info("vps : version approuvée", { version: v.short });
      return ok({ version: strip(v) });
    }
    if (c === "publish") {
      allowed("POST");
      const v = await publishCatalogVersion(db, versionId, guard, now);
      deps.log.info("vps : version publiée", { version: v.short });
      deps.onPublished?.();
      return ok({ version: strip(v) });
    }
    throw new HttpError(404, "not_found");
  }

  if (a === "stripe" && b === "publish" && !c) {
    allowed("POST");
    // Stripe non configuré (secret absent du Coffre, clé refusée par la garde du mode test) : 503 lisible, pas une 500 muette.
    const stripe = await deps.stripe().catch((error: unknown) => {
      throw new HttpError(503, "stripe_not_configured", {
        message:
          error instanceof Error ? error.message : "Stripe n'est pas configuré",
      });
    });
    const { version, result } = await syncVpsCatalogToStripe(db, stripe, now);
    deps.log.info("vps : catalogue publié vers Stripe", {
      version: version.short,
      plans: Object.keys(result.plans).length,
    });
    deps.onPublished?.();
    return ok({ status: "applied", appliedAt: version.appliedAt, ...result });
  }

  // ─── Vues en lecture seule (aucun renseignement personnel inutile) ───────────────
  if (a === "orders" && !b) {
    allowed("GET");
    const rows = await db
      .select({
        id: vpsOrders.id,
        organizationId: vpsOrders.organizationId,
        planCode: vpsOrders.planCode,
        appCode: vpsOrders.appCode,
        term: vpsOrders.term,
        priceCents: vpsOrders.priceCents,
        catalogVersion: vpsOrders.catalogVersion,
        status: vpsOrders.status,
        failureReason: vpsOrders.failureReason,
        paidAt: vpsOrders.paidAt,
        createdAt: vpsOrders.createdAt,
      })
      .from(vpsOrders)
      .orderBy(desc(vpsOrders.createdAt))
      .limit(200);
    return ok({ orders: rows });
  }
  if (a === "instances" && !b) {
    allowed("GET");
    const rows = await db
      .select({
        id: vpsInstances.id,
        orderId: vpsInstances.orderId,
        organizationId: vpsInstances.organizationId,
        planCode: vpsInstances.planCode,
        appCode: vpsInstances.appCode,
        appVersion: vpsInstances.appVersion,
        server: proxmoxServers.code,
        vmid: vpsInstances.vmid,
        ipv4: vpsInstances.ipv4,
        status: vpsInstances.status,
        step: vpsInstances.step,
        power: vpsInstances.power,
        lastError: vpsInstances.lastError,
        activatedAt: vpsInstances.activatedAt,
        suspendedAt: vpsInstances.suspendedAt,
        retentionEndsAt: vpsInstances.retentionEndsAt,
        createdAt: vpsInstances.createdAt,
      })
      .from(vpsInstances)
      .leftJoin(proxmoxServers, eq(proxmoxServers.id, vpsInstances.serverId))
      .orderBy(desc(vpsInstances.createdAt))
      .limit(200);
    return ok({ instances: rows });
  }
  if (a === "events" && !b) {
    allowed("GET");
    const url = new URL(request.url);
    const instanceId = url.searchParams.get("instanceId");
    const rows = await db
      .select({
        id: vpsEvents.id,
        instanceId: vpsEvents.instanceId,
        orderId: vpsEvents.orderId,
        actor: vpsEvents.actor,
        kind: vpsEvents.kind,
        message: vpsEvents.message,
        createdAt: vpsEvents.createdAt,
      })
      .from(vpsEvents)
      .where(
        instanceId && UUID.test(instanceId)
          ? eq(vpsEvents.instanceId, instanceId)
          : undefined,
      )
      .orderBy(desc(vpsEvents.createdAt))
      .limit(100);
    return ok({ events: rows });
  }

  throw new HttpError(404, "not_found");
}
