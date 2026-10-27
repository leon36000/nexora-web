import {
  type Database,
  MODEL_KINDS,
  MODEL_STATUSES,
  MODEL_VISIBILITIES,
  PROVIDER_TYPES,
  REGIONS,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { z } from "zod";
import { checkAdminAuth } from "../auth";
import {
  addFxRate,
  addPrice,
  approveFxRate,
  approveVersion,
  CatalogError,
  createDraftVersion,
  createModel,
  createProvider,
  currentFx,
  currentPrice,
  diffVersion,
  getModel,
  getProvider,
  getPublishedCatalog,
  listFxRates,
  listModels,
  listPrices,
  listProviders,
  listVersions,
  publishVersion,
  recordProviderCheck,
  updateModel,
  updateProvider,
} from "./catalog";
import { type LitellmClient, SyncError, syncLitellm } from "./litellm";
import { testProvider } from "./provider-test";

/**
 * API d'administration du catalogue : `/api/admin/catalog/*` (D14). Jeton d'administration en temps
 * constant, comme le coffre. Consommée par le module Directus « Modèles » (aucune donnée n'y est
 * persistée). Les montants sont des micro-unités entières, écrites en chaînes dans les réponses.
 */

export interface CatalogAdminDeps {
  db: () => Database;
  adminToken: string | undefined;
  /** null : LiteLLM non configuré (la synchronisation répond 503). */
  litellm: () => LitellmClient | null;
  getSecret: (ref: string) => Promise<string>;
  fetch: typeof fetch;
  log: Logger;
  now: () => Date;
  /** Appelé après une publication (revalidation du catalogue public). */
  onPublished?: () => void;
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

const micro = z
  .union([
    z.string().regex(/^\d{1,18}$/),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform((v) => BigInt(v));
const REF = /^[a-z0-9._-]{3,64}$/;
const url = z
  .string()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "URL http(s) attendue");

const providerFields = {
  name: z.string().min(1).max(100),
  type: z.enum(PROVIDER_TYPES),
  baseUrl: url,
  litellmBaseUrl: url.nullable(),
  secretRef: z.string().regex(REF).nullable(),
  region: z.enum(REGIONS),
  dataPolicyFr: z.string().max(2000),
  dataPolicyEn: z.string().max(2000),
  priority: z.number().int().min(0).max(10_000),
  enabled: z.boolean(),
};
const providerCreate = z
  .object({
    code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
    name: providerFields.name,
    type: providerFields.type,
    baseUrl: providerFields.baseUrl,
    region: providerFields.region,
    litellmBaseUrl: providerFields.litellmBaseUrl.optional(),
    secretRef: providerFields.secretRef.optional(),
    dataPolicyFr: providerFields.dataPolicyFr.optional(),
    dataPolicyEn: providerFields.dataPolicyEn.optional(),
    priority: providerFields.priority.optional(),
    enabled: providerFields.enabled.optional(),
  })
  .strict();
const providerPatch = z.object(providerFields).partial().strict();

const capabilities = z
  .object({
    streaming: z.boolean(),
    tools: z.boolean(),
    vision: z.boolean(),
    reasoning: z.boolean(),
    json_mode: z.boolean(),
  })
  .partial()
  .strict();
const modelFields = {
  name: z.string().min(1).max(120),
  descriptionFr: z.string().max(4000),
  descriptionEn: z.string().max(4000),
  kind: z.enum(MODEL_KINDS),
  providerId: z.uuid(),
  upstreamId: z.string().min(1).max(200),
  contextMax: z.number().int().min(1).max(10_000_000),
  maxOutputTokens: z.number().int().min(1).max(10_000_000).nullable(),
  capabilities,
  residency: z.enum(REGIONS),
  visibility: z.enum(MODEL_VISIBILITIES),
  sunsetAt: z.iso
    .datetime()
    .nullable()
    .transform((v) => (v ? new Date(v) : null)),
};
const modelCreate = z
  .object({
    publicId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{0,40}\/[a-z0-9][a-z0-9._:-]{0,80}$/),
    name: modelFields.name,
    providerId: modelFields.providerId,
    upstreamId: modelFields.upstreamId,
    contextMax: modelFields.contextMax,
    descriptionFr: modelFields.descriptionFr.optional(),
    descriptionEn: modelFields.descriptionEn.optional(),
    kind: modelFields.kind.optional(),
    maxOutputTokens: modelFields.maxOutputTokens.optional(),
    capabilities: modelFields.capabilities.optional(),
    residency: modelFields.residency.optional(),
    visibility: modelFields.visibility.optional(),
    sunsetAt: modelFields.sunsetAt.optional(),
  })
  .strict();
const modelPatch = z
  .object({ ...modelFields, status: z.enum(MODEL_STATUSES) })
  .partial()
  .strict();

const priceCreate = z
  .object({
    upstreamInputUsdMicro: micro,
    upstreamOutputUsdMicro: micro,
    upstreamCacheUsdMicro: micro.nullable().optional(),
    sellInputCadMicro: micro.optional(),
    sellOutputCadMicro: micro.optional(),
    sellCacheCadMicro: micro.nullable().optional(),
    marginBps: z.number().int().min(0).max(100_000).optional(),
    marginFloorBps: z.number().int().min(0).max(100_000).optional(),
    effectiveAt: z.iso
      .datetime()
      .transform((v) => new Date(v))
      .optional(),
    note: z.string().max(500).optional(),
  })
  .strict();
const fxCreate = z
  .object({
    usdToCadMicro: micro,
    effectiveAt: z.iso
      .datetime()
      .transform((v) => new Date(v))
      .optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const STATUS_OF: Record<string, number> = {
  not_found: 404,
  conflict: 409,
  invalid_request: 422,
  invalid_transition: 409,
  publication_refused: 422,
  stale_version: 409,
  fx_missing: 422,
};

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new HttpError(400, "invalid_body");
  }
  if (raw.length > 65_536) throw new HttpError(413, "payload_too_large");
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

export async function handleCatalogAdmin(
  request: Request,
  path: string[],
  deps: CatalogAdminDeps,
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
    if (error instanceof CatalogError)
      return json(
        {
          error: error.code,
          message: error.message,
          ...(error.details ? { issues: error.details } : {}),
        },
        STATUS_OF[error.code] ?? 400,
      );
    if (error instanceof SyncError)
      return json(
        { error: error.code, message: error.message },
        error.code === "no_published_catalog"
          ? 409
          : error.code === "secret_unavailable"
            ? 422
            : 502,
      );
    deps.log.error("catalogue : erreur interne", {
      route: path.join("/"),
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}

async function route(
  request: Request,
  path: string[],
  deps: CatalogAdminDeps,
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

  // GET /api/admin/catalog : vue d'ensemble
  if (!a) {
    allowed("GET");
    const [providers, models, fx, versions, published] = await Promise.all([
      listProviders(db),
      listModels(db),
      listFxRates(db),
      listVersions(db, 10),
      getPublishedCatalog(db),
    ]);
    const withPrice = await Promise.all(
      models.map(async (m) => ({
        ...m,
        currentPrice: await currentPrice(db, m.id, now),
      })),
    );
    return ok({
      providers,
      models: withPrice,
      fxRates: fx,
      currentFx: await currentFx(db, now),
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
      litellmConfigured: deps.litellm() !== null,
    });
  }

  if (a === "providers") {
    if (!b) {
      allowed("GET", "POST");
      if (method === "GET") return ok({ providers: await listProviders(db) });
      const input = await body(request, providerCreate);
      const created = await createProvider(db, input);
      deps.log.info("catalogue : fournisseur créé", {
        code: created.code,
        type: created.type,
      });
      return ok(created, 201);
    }
    const providerId = id(b);
    if (c === "test") {
      allowed("POST");
      const provider = await getProvider(db, providerId);
      const check = await testProvider(provider, {
        getSecret: deps.getSecret,
        fetch: deps.fetch,
      });
      const updated = await recordProviderCheck(db, providerId, check, now);
      deps.log.info("catalogue : fournisseur testé", {
        code: provider.code,
        ok: check.ok,
      });
      return ok({ ok: check.ok, detail: check.detail, provider: updated });
    }
    if (c) throw new HttpError(404, "not_found");
    allowed("GET", "PATCH");
    if (method === "GET") return ok(await getProvider(db, providerId));
    return ok(
      await updateProvider(db, providerId, await body(request, providerPatch)),
    );
  }

  if (a === "models") {
    if (!b) {
      allowed("GET", "POST");
      if (method === "GET") {
        const models = await listModels(db);
        return ok({
          models: await Promise.all(
            models.map(async (m) => ({
              ...m,
              currentPrice: await currentPrice(db, m.id, now),
            })),
          ),
        });
      }
      const created = await createModel(db, await body(request, modelCreate));
      deps.log.info("catalogue : modèle créé", { publicId: created.publicId });
      return ok(created, 201);
    }
    const modelId = id(b);
    if (c === "prices") {
      allowed("GET", "POST");
      if (method === "GET")
        return ok({ prices: await listPrices(db, modelId) });
      const price = await addPrice(
        db,
        modelId,
        await body(request, priceCreate),
        now,
      );
      deps.log.info("catalogue : prix ajouté", { modelId });
      return ok(price, 201);
    }
    if (c) throw new HttpError(404, "not_found");
    allowed("GET", "PATCH");
    if (method === "GET")
      return ok({
        ...(await getModel(db, modelId)),
        currentPrice: await currentPrice(db, modelId, now),
        prices: await listPrices(db, modelId),
      });
    const patch = await body(request, modelPatch);
    const updated = await updateModel(db, modelId, patch, now);
    if (patch.status)
      deps.log.info("catalogue : statut de modèle", {
        publicId: updated.publicId,
        status: updated.status,
      });
    return ok(updated);
  }

  if (a === "fx-rates") {
    if (!b) {
      allowed("GET", "POST");
      if (method === "GET")
        return ok({
          fxRates: await listFxRates(db),
          current: await currentFx(db, now),
        });
      return ok(await addFxRate(db, await body(request, fxCreate)), 201);
    }
    const fxId = id(b);
    if (c === "approve") {
      allowed("POST");
      const approved = await approveFxRate(db, fxId, "admin", now);
      deps.log.info("catalogue : taux de change approuvé", { id: fxId });
      return ok(approved);
    }
    throw new HttpError(404, "not_found");
  }

  if (a === "versions") {
    if (!b) {
      allowed("GET", "POST");
      if (method === "GET")
        return ok({
          versions: (await listVersions(db)).map(({ snapshot: _s, ...v }) => v),
        });
      const draft = await createDraftVersion(db, now);
      return ok(
        {
          version: stripSnapshot(draft.version),
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
      const d = await diffVersion(db, versionId);
      return ok({ version: d.version, diff: d.diff, issues: d.issues });
    }
    if (c === "approve") {
      allowed("POST");
      const v = await approveVersion(db, versionId, now);
      deps.log.info("catalogue : version approuvée", { version: v.short });
      return ok({ version: stripSnapshot(v) });
    }
    if (c === "publish") {
      allowed("POST");
      const v = await publishVersion(db, versionId, now);
      deps.log.info("catalogue : version publiée", { version: v.short });
      deps.onPublished?.();
      return ok({ version: stripSnapshot(v) });
    }
    throw new HttpError(404, "not_found");
  }

  if (a === "sync-litellm" && !b) {
    allowed("POST");
    const client = deps.litellm();
    if (!client) throw new HttpError(503, "litellm_not_configured");
    const { version, summary } = await syncLitellm(db, {
      client,
      getSecret: deps.getSecret,
      now: () => now,
    });
    deps.log.info("catalogue : synchronisation LiteLLM", {
      version: version.short,
      created: summary.models.created.length,
      updated: summary.models.updated.length,
      deleted: summary.models.deleted.length,
    });
    return ok({
      status: "applied",
      appliedAt: version.appliedAt,
      version: version.short,
      summary,
    });
  }

  throw new HttpError(404, "not_found");
}

function stripSnapshot<T extends { snapshot: unknown }>(
  v: T,
): Omit<T, "snapshot"> {
  const { snapshot: _snapshot, ...rest } = v;
  return rest;
}
