import {
  and,
  asc,
  configVersions,
  type Database,
  desc,
  eq,
  fxRates,
  isNull,
  type ModelCapabilities,
  type ModelKind,
  type ModelRouting,
  type ModelSheet,
  type ModelStatus,
  type ModelVisibility,
  modelPrices,
  modelProviders,
  models,
  type PriceWindowRow,
  type ProviderType,
  type Region,
  sql,
  vaultSecrets,
} from "@nexora/db";
import { canonicalJson, sha256Hex } from "./canonical";
import { sellFromMargin, windowProblems } from "./pricing";
import {
  type CatalogIssue,
  type CatalogSnapshot,
  type DiffEntry,
  diffSnapshots,
  EMPTY_SNAPSHOT,
  guardSnapshot,
  type SnapshotModel,
  type SnapshotProvider,
} from "./snapshot";

const CATALOG_COLLECTION = "model_catalog";
const CATALOG_ITEM = "main";

export type CatalogErrorCode =
  | "not_found"
  | "conflict"
  | "invalid_request"
  | "invalid_transition"
  | "publication_refused"
  | "stale_version"
  | "fx_missing";

/** Erreur métier du catalogue ; `details` ne contient jamais de secret. */
export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  readonly details?: unknown;
  constructor(code: CatalogErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.details = details;
  }
}

type Provider = typeof modelProviders.$inferSelect;
type Model = typeof models.$inferSelect;
type Price = typeof modelPrices.$inferSelect;
type Fx = typeof fxRates.$inferSelect;
type Version = typeof configVersions.$inferSelect;

const dbCode = (e: unknown): string | undefined => {
  if (typeof e !== "object" || e === null) return undefined;
  const c = e as { code?: unknown; cause?: { code?: unknown } };
  return String(c.code ?? c.cause?.code ?? "") || undefined;
};
function rethrow(e: unknown, message: string): never {
  if (dbCode(e) === "23505") throw new CatalogError("conflict", message);
  throw e;
}

// ─── Fournisseurs ───────────────────────────────────────────────────────────────

export interface ProviderInput {
  code: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  litellmBaseUrl?: string | null;
  secretRef?: string | null;
  region: Region;
  dataPolicyFr?: string;
  dataPolicyEn?: string;
  priority?: number;
  enabled?: boolean;
}

export async function createProvider(db: Database, input: ProviderInput) {
  try {
    const [row] = await db.insert(modelProviders).values(input).returning();
    if (!row) throw new Error("fournisseur non créé");
    return row;
  } catch (e) {
    return rethrow(e, "un fournisseur porte déjà ce code");
  }
}

export async function updateProvider(
  db: Database,
  id: string,
  patch: Partial<Omit<ProviderInput, "code">>,
) {
  const [row] = await db
    .update(modelProviders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(modelProviders.id, id))
    .returning();
  if (!row) throw new CatalogError("not_found", "fournisseur introuvable");
  return row;
}

export async function listProviders(db: Database): Promise<Provider[]> {
  return db
    .select()
    .from(modelProviders)
    .orderBy(asc(modelProviders.priority), asc(modelProviders.code));
}

export async function getProvider(db: Database, id: string): Promise<Provider> {
  const [row] = await db
    .select()
    .from(modelProviders)
    .where(eq(modelProviders.id, id));
  if (!row) throw new CatalogError("not_found", "fournisseur introuvable");
  return row;
}

export async function recordProviderCheck(
  db: Database,
  id: string,
  result: { ok: boolean; detail: string },
  now: Date = new Date(),
) {
  const [row] = await db
    .update(modelProviders)
    .set({
      healthState: result.ok ? "ok" : "error",
      lastCheckedAt: now,
      lastCheckDetail: result.detail.slice(0, 300),
      updatedAt: now,
    })
    .where(eq(modelProviders.id, id))
    .returning();
  if (!row) throw new CatalogError("not_found", "fournisseur introuvable");
  return row;
}

// ─── Modèles ────────────────────────────────────────────────────────────────────

export interface ModelInput {
  publicId: string;
  name: string;
  descriptionFr?: string;
  descriptionEn?: string;
  kind?: ModelKind;
  providerId: string;
  upstreamId: string;
  contextMax: number;
  maxOutputTokens?: number | null;
  capabilities?: ModelCapabilities;
  residency?: Region;
  visibility?: ModelVisibility;
  sunsetAt?: Date | null;
  sheet?: ModelSheet;
  routing?: ModelRouting;
}

export async function createModel(db: Database, input: ModelInput) {
  const provider = await getProvider(db, input.providerId);
  try {
    const [row] = await db
      .insert(models)
      .values({ ...input, residency: input.residency ?? provider.region })
      .returning();
    if (!row) throw new Error("modèle non créé");
    return row;
  } catch (e) {
    return rethrow(e, "un modèle porte déjà cet identifiant public");
  }
}

export async function listModels(db: Database): Promise<Model[]> {
  return db.select().from(models).orderBy(asc(models.publicId));
}

export async function getModel(db: Database, id: string): Promise<Model> {
  const [row] = await db.select().from(models).where(eq(models.id, id));
  if (!row) throw new CatalogError("not_found", "modèle introuvable");
  return row;
}

const NEXT_STATUS: Record<ModelStatus, readonly ModelStatus[]> = {
  draft: ["draft", "approved", "retired"],
  approved: ["approved", "draft", "published", "retired"],
  published: ["published", "approved", "retired"],
  retired: ["retired", "draft"],
};

export async function updateModel(
  db: Database,
  id: string,
  patch: Partial<Omit<ModelInput, "publicId">> & { status?: ModelStatus },
  now: Date = new Date(),
) {
  const current = await getModel(db, id);
  if (patch.status && !NEXT_STATUS[current.status].includes(patch.status))
    throw new CatalogError(
      "invalid_transition",
      `passage de « ${current.status} » à « ${patch.status} » impossible`,
    );
  if (patch.providerId) await getProvider(db, patch.providerId);
  if (patch.status === "approved" || patch.status === "published") {
    // Approuver ou publier un modèle exige un prix valide (jamais 0 $, jamais sous le plancher).
    const issues = await modelIssues(db, id, now);
    if (issues.length > 0)
      throw new CatalogError(
        "publication_refused",
        "prix invalide ou absent",
        issues,
      );
  }
  const [row] = await db
    .update(models)
    .set({ ...patch, updatedAt: now })
    .where(eq(models.id, id))
    .returning();
  if (!row) throw new CatalogError("not_found", "modèle introuvable");
  return row;
}

async function modelIssues(
  db: Database,
  modelId: string,
  now: Date,
): Promise<CatalogIssue[]> {
  const model = await getModel(db, modelId);
  const fx = await currentFx(db, now);
  const price = await currentPrice(db, modelId, now);
  const provider = await getProvider(db, model.providerId);
  const snapshot: CatalogSnapshot = {
    schema: 1,
    fx: fx ? snapshotFx(fx) : null,
    providers: [snapshotProvider(provider)],
    models: [snapshotModel(model, price)],
  };
  // La clé du fournisseur est vérifiée à la publication de la version, pas à celle d'un modèle.
  return guardSnapshot(snapshot, { secretExists: () => true });
}

// ─── Prix ───────────────────────────────────────────────────────────────────────

/** Quatre tarifs par million de jetons ; `cache` et `cacheWrite` absents ou null : tarif d'entrée. */
export interface PriceSetInput {
  input: bigint;
  output: bigint;
  cache?: bigint | null;
  cacheWrite?: bigint | null;
}

export interface PriceWindowInput {
  label: string;
  days: number[];
  startMinute: number;
  endMinute: number;
  upstream: PriceSetInput;
  /** Absent : calculé avec la marge au taux approuvé. */
  sell?: PriceSetInput;
}

export interface PriceInput {
  upstreamInputUsdMicro: bigint;
  upstreamOutputUsdMicro: bigint;
  upstreamCacheUsdMicro?: bigint | null;
  /** Écriture du cache facturée à part par l'éditeur (Kimi). */
  upstreamCacheWriteUsdMicro?: bigint | null;
  /** Absents : calculés avec `marginBps` au taux de change approuvé. */
  sellInputCadMicro?: bigint;
  sellOutputCadMicro?: bigint;
  sellCacheCadMicro?: bigint | null;
  sellCacheWriteCadMicro?: bigint | null;
  /** Plages horaires UTC où le prix baisse (DeepSeek : creux). */
  windows?: PriceWindowInput[];
  marginBps?: number;
  marginFloorBps?: number;
  effectiveAt?: Date;
  note?: string;
}

const str = (v: bigint | null | undefined) =>
  v === null || v === undefined ? null : v.toString();

/** Un prix « effectif » : l'absence de tarif de cache ou d'écriture signifie le tarif d'entrée. */
const effective = (s: PriceSetInput) =>
  [s.input, s.output, s.cache ?? s.input, s.cacheWrite ?? s.input] as const;

/** Ajoute une ligne de prix (les lignes existantes ne sont jamais modifiées : déclencheur SQL). */
export async function addPrice(
  db: Database,
  modelId: string,
  input: PriceInput,
  now: Date = new Date(),
) {
  await getModel(db, modelId);
  const margin = input.marginBps ?? 0;
  let fxRow: Fx | null | undefined;
  const fxOrThrow = async (): Promise<Fx> => {
    if (fxRow === undefined) fxRow = await currentFx(db, now);
    if (!fxRow)
      throw new CatalogError(
        "fx_missing",
        "aucun taux de change approuvé : impossible de calculer un prix à partir d'une marge",
      );
    return fxRow;
  };
  const sellOf = async (upstream: bigint) =>
    sellFromMargin(upstream, (await fxOrThrow()).usdToCadMicro, margin);

  let { sellInputCadMicro, sellOutputCadMicro, sellCacheCadMicro } = input;
  let { sellCacheWriteCadMicro } = input;
  if (sellInputCadMicro === undefined || sellOutputCadMicro === undefined) {
    sellInputCadMicro ??= await sellOf(input.upstreamInputUsdMicro);
    sellOutputCadMicro ??= await sellOf(input.upstreamOutputUsdMicro);
    if (sellCacheCadMicro === undefined && input.upstreamCacheUsdMicro != null)
      sellCacheCadMicro = await sellOf(input.upstreamCacheUsdMicro);
  }
  if (
    sellCacheWriteCadMicro === undefined &&
    input.upstreamCacheWriteUsdMicro != null
  )
    sellCacheWriteCadMicro = await sellOf(input.upstreamCacheWriteUsdMicro);

  const windows: PriceWindowRow[] = [];
  const given = input.windows ?? [];
  const problems = windowProblems(given);
  if (problems.length > 0)
    throw new CatalogError("invalid_request", problems.join(" ; "));
  const baseUp: PriceSetInput = {
    input: input.upstreamInputUsdMicro,
    output: input.upstreamOutputUsdMicro,
    cache: input.upstreamCacheUsdMicro,
    cacheWrite: input.upstreamCacheWriteUsdMicro,
  };
  const baseSell: PriceSetInput = {
    input: sellInputCadMicro,
    output: sellOutputCadMicro,
    cache: sellCacheCadMicro,
    cacheWrite: sellCacheWriteCadMicro,
  };
  for (const w of given) {
    const sell: PriceSetInput = w.sell ?? {
      input: await sellOf(w.upstream.input),
      output: await sellOf(w.upstream.output),
      cache: w.upstream.cache != null ? await sellOf(w.upstream.cache) : null,
      cacheWrite:
        w.upstream.cacheWrite != null
          ? await sellOf(w.upstream.cacheWrite)
          : null,
    };
    // Une plage ne peut que baisser le prix : la réservation se calcule toujours sur le prix de base.
    for (const [kind, a, b] of [
      ["coût amont", effective(w.upstream), effective(baseUp)],
      ["prix de vente", effective(sell), effective(baseSell)],
    ] as const)
      if (a.some((v, k) => v > (b[k] as bigint)))
        throw new CatalogError(
          "invalid_request",
          `plage « ${w.label} » : le ${kind} dépasse celui du prix de base`,
        );
    const set = (s: PriceSetInput) => ({
      input: s.input.toString(),
      output: s.output.toString(),
      cache: str(s.cache),
      cacheWrite: str(s.cacheWrite),
    });
    windows.push({
      label: w.label,
      days: w.days,
      startMinute: w.startMinute,
      endMinute: w.endMinute,
      upstream: set(w.upstream),
      sell: set(sell),
    });
  }
  const [row] = await db
    .insert(modelPrices)
    .values({
      modelId,
      upstreamInputUsdMicro: input.upstreamInputUsdMicro,
      upstreamOutputUsdMicro: input.upstreamOutputUsdMicro,
      upstreamCacheUsdMicro: input.upstreamCacheUsdMicro ?? null,
      upstreamCacheWriteUsdMicro: input.upstreamCacheWriteUsdMicro ?? null,
      sellInputCadMicro,
      sellOutputCadMicro,
      sellCacheCadMicro: sellCacheCadMicro ?? null,
      sellCacheWriteCadMicro: sellCacheWriteCadMicro ?? null,
      windows,
      marginBps: margin,
      marginFloorBps: input.marginFloorBps ?? 0,
      effectiveAt: input.effectiveAt ?? now,
      note: input.note ?? "",
    })
    .returning();
  if (!row) throw new Error("prix non créé");
  return row;
}

export async function listPrices(
  db: Database,
  modelId: string,
): Promise<Price[]> {
  return db
    .select()
    .from(modelPrices)
    .where(eq(modelPrices.modelId, modelId))
    .orderBy(desc(modelPrices.effectiveAt), desc(modelPrices.createdAt));
}

/** Prix en vigueur à `now` : la ligne la plus récente dont la date d'effet est atteinte. */
export async function currentPrice(
  db: Database,
  modelId: string,
  now: Date,
): Promise<Price | null> {
  const [row] = await db
    .select()
    .from(modelPrices)
    .where(
      and(
        eq(modelPrices.modelId, modelId),
        sql`${modelPrices.effectiveAt} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(desc(modelPrices.effectiveAt), desc(modelPrices.createdAt))
    .limit(1);
  return row ?? null;
}

// ─── Taux de change ─────────────────────────────────────────────────────────────

export async function addFxRate(
  db: Database,
  input: { usdToCadMicro: bigint; effectiveAt?: Date; note?: string },
) {
  if (input.usdToCadMicro <= 0n)
    throw new CatalogError(
      "invalid_request",
      "taux de change : valeur positive attendue",
    );
  const [row] = await db
    .insert(fxRates)
    .values({
      usdToCadMicro: input.usdToCadMicro,
      effectiveAt: input.effectiveAt ?? new Date(),
      note: input.note ?? "",
    })
    .returning();
  if (!row) throw new Error("taux non créé");
  return row;
}

export async function approveFxRate(
  db: Database,
  id: string,
  approvedBy: string,
  now: Date = new Date(),
) {
  const [current] = await db.select().from(fxRates).where(eq(fxRates.id, id));
  if (!current) throw new CatalogError("not_found", "taux introuvable");
  if (current.approvedAt) return current;
  const [row] = await db
    .update(fxRates)
    .set({ approvedAt: now, approvedBy })
    .where(and(eq(fxRates.id, id), isNull(fxRates.approvedAt)))
    .returning();
  if (row) return row;
  const [again] = await db.select().from(fxRates).where(eq(fxRates.id, id));
  if (!again) throw new CatalogError("not_found", "taux introuvable");
  return again;
}

export async function listFxRates(db: Database): Promise<Fx[]> {
  return db
    .select()
    .from(fxRates)
    .orderBy(desc(fxRates.effectiveAt), desc(fxRates.createdAt));
}

/** Taux approuvé le plus récent dont la date d'effet est atteinte. */
export async function currentFx(db: Database, now: Date): Promise<Fx | null> {
  const [row] = await db
    .select()
    .from(fxRates)
    .where(
      and(
        sql`${fxRates.approvedAt} IS NOT NULL`,
        sql`${fxRates.effectiveAt} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(desc(fxRates.effectiveAt), desc(fxRates.createdAt))
    .limit(1);
  return row ?? null;
}

// ─── Instantané et versions ─────────────────────────────────────────────────────

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function snapshotFx(fx: Fx) {
  return {
    id: fx.id,
    usdToCadMicro: fx.usdToCadMicro.toString(),
    effectiveAt: fx.effectiveAt.toISOString(),
  };
}
function snapshotProvider(p: Provider): SnapshotProvider {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    type: p.type,
    baseUrl: p.baseUrl,
    litellmBaseUrl: p.litellmBaseUrl,
    secretRef: p.secretRef,
    region: p.region,
    dataPolicyFr: p.dataPolicyFr,
    dataPolicyEn: p.dataPolicyEn,
    priority: p.priority,
    enabled: p.enabled,
  };
}
function snapshotModel(m: Model, price: Price | null): SnapshotModel {
  return {
    id: m.id,
    publicId: m.publicId,
    name: m.name,
    descriptionFr: m.descriptionFr,
    descriptionEn: m.descriptionEn,
    kind: m.kind,
    providerId: m.providerId,
    upstreamId: m.upstreamId,
    contextMax: m.contextMax,
    maxOutputTokens: m.maxOutputTokens,
    capabilities: m.capabilities,
    residency: m.residency,
    visibility: m.visibility,
    sunsetAt: iso(m.sunsetAt),
    sheet: m.sheet,
    routing: m.routing,
    price: price
      ? {
          id: price.id,
          upstreamInputUsdMicro: price.upstreamInputUsdMicro.toString(),
          upstreamOutputUsdMicro: price.upstreamOutputUsdMicro.toString(),
          upstreamCacheUsdMicro: str(price.upstreamCacheUsdMicro),
          sellInputCadMicro: price.sellInputCadMicro.toString(),
          sellOutputCadMicro: price.sellOutputCadMicro.toString(),
          sellCacheCadMicro: str(price.sellCacheCadMicro),
          upstreamCacheWriteUsdMicro: str(price.upstreamCacheWriteUsdMicro),
          sellCacheWriteCadMicro: str(price.sellCacheWriteCadMicro),
          windows: price.windows,
          marginBps: price.marginBps,
          marginFloorBps: price.marginFloorBps,
          effectiveAt: price.effectiveAt.toISOString(),
          note: price.note,
        }
      : null,
  };
}

/** Photographie des tables de travail : modèles au statut « publié », leur prix et le taux approuvés à `now`. */
async function buildSnapshot(
  db: Database,
  now: Date = new Date(),
): Promise<CatalogSnapshot> {
  const published = await db
    .select()
    .from(models)
    .where(eq(models.status, "published"))
    .orderBy(asc(models.publicId));
  if (published.length === 0)
    return { ...EMPTY_SNAPSHOT, fx: await fxOrNull(db, now) };
  const providers = await listProviders(db);
  const used = new Set(published.map((m) => m.providerId));
  const out: SnapshotModel[] = [];
  for (const m of published)
    out.push(snapshotModel(m, await currentPrice(db, m.id, now)));
  return {
    schema: 1,
    fx: await fxOrNull(db, now),
    providers: providers.filter((p) => used.has(p.id)).map(snapshotProvider),
    models: out,
  };
}
const fxOrNull = async (db: Database, now: Date) => {
  const fx = await currentFx(db, now);
  return fx ? snapshotFx(fx) : null;
};

const shortHash = (hash: string) => `cat_${hash.slice(0, 16)}`;

export interface CatalogVersion {
  id: string;
  hash: string;
  short: string;
  status: Version["status"];
  createdAt: Date;
  approvedAt: Date | null;
  publishedAt: Date | null;
  appliedAt: Date | null;
  appliedStatus: string | null;
  appliedDetail: Record<string, unknown> | null;
  snapshot: CatalogSnapshot;
}

function toVersion(row: Version): CatalogVersion {
  return {
    id: row.id,
    hash: row.hash,
    short: shortHash(row.hash),
    status: row.status,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    publishedAt: row.publishedAt,
    appliedAt: row.appliedAt,
    appliedStatus: row.appliedStatus,
    appliedDetail: row.appliedDetail,
    snapshot: row.content as unknown as CatalogSnapshot,
  };
}

const inCatalog = and(
  eq(configVersions.collection, CATALOG_COLLECTION),
  eq(configVersions.itemId, CATALOG_ITEM),
);

/** Version actuellement publiée, ou null (aucun catalogue publié). */
export async function getPublishedCatalog(
  db: Database,
): Promise<CatalogVersion | null> {
  const [row] = await db
    .select()
    .from(configVersions)
    .where(and(inCatalog, eq(configVersions.status, "published")))
    .orderBy(desc(configVersions.publishedAt))
    .limit(1);
  return row ? toVersion(row) : null;
}

export async function listVersions(
  db: Database,
  limit = 30,
): Promise<CatalogVersion[]> {
  const rows = await db
    .select()
    .from(configVersions)
    .where(inCatalog)
    .orderBy(desc(configVersions.createdAt))
    .limit(limit);
  return rows.map(toVersion);
}

async function getVersion(db: Database, id: string): Promise<CatalogVersion> {
  const [row] = await db
    .select()
    .from(configVersions)
    .where(and(inCatalog, eq(configVersions.id, id)));
  if (!row) throw new CatalogError("not_found", "version introuvable");
  return toVersion(row);
}

export interface VaultCheck {
  secretExists: (ref: string) => Promise<boolean>;
}

/** Existence d'un secret actif dans le coffre (sans jamais le déchiffrer). */
const vaultCheck = (db: Database): VaultCheck => ({
  secretExists: async (ref) => {
    const [row] = await db
      .select({ revokedAt: vaultSecrets.revokedAt })
      .from(vaultSecrets)
      .where(eq(vaultSecrets.ref, ref));
    return Boolean(row && !row.revokedAt);
  },
});

async function guard(
  snapshot: CatalogSnapshot,
  vault: VaultCheck,
): Promise<CatalogIssue[]> {
  const refs = new Set(
    snapshot.providers
      .map((p) => p.secretRef)
      .filter((r): r is string => Boolean(r)),
  );
  const existing = new Set<string>();
  for (const ref of refs) if (await vault.secretExists(ref)) existing.add(ref);
  return guardSnapshot(snapshot, { secretExists: (ref) => existing.has(ref) });
}

/**
 * Crée le brouillon de version depuis les tables de travail. Le hash couvre le contenu ET la version
 * parente : sans changement, on renvoie la version existante (idempotent).
 */
export async function createDraftVersion(
  db: Database,
  now: Date = new Date(),
): Promise<{
  version: CatalogVersion;
  created: boolean;
  diff: DiffEntry[];
  issues: CatalogIssue[];
  unchanged: boolean;
}> {
  const snapshot = await buildSnapshot(db, now);
  const published = await getPublishedCatalog(db);
  const parent = published?.hash ?? "none";
  const hash = sha256Hex(canonicalJson({ parent, snapshot }));
  const diff = diffSnapshots(published?.snapshot ?? EMPTY_SNAPSHOT, snapshot);
  const issues = await guard(snapshot, vaultCheck(db));
  if (
    published &&
    canonicalJson(published.snapshot) === canonicalJson(snapshot)
  )
    return {
      version: published,
      created: false,
      diff,
      issues,
      unchanged: true,
    };
  const [inserted] = await db
    .insert(configVersions)
    .values({
      collection: CATALOG_COLLECTION,
      itemId: CATALOG_ITEM,
      hash,
      content: snapshot as unknown as Record<string, unknown>,
      status: "draft",
      publishedAt: null,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted)
    return {
      version: toVersion(inserted),
      created: true,
      diff,
      issues,
      unchanged: false,
    };
  const [existing] = await db
    .select()
    .from(configVersions)
    .where(and(inCatalog, eq(configVersions.hash, hash)));
  if (!existing) throw new Error("version introuvable après conflit");
  return {
    version: toVersion(existing),
    created: false,
    diff,
    issues,
    unchanged: false,
  };
}

export async function diffVersion(db: Database, id: string) {
  const version = await getVersion(db, id);
  const published = await getPublishedCatalog(db);
  return {
    version,
    diff: diffSnapshots(
      published?.snapshot ?? EMPTY_SNAPSHOT,
      version.snapshot,
    ),
    issues: await guard(version.snapshot, vaultCheck(db)),
  };
}

export async function approveVersion(
  db: Database,
  id: string,
  now: Date = new Date(),
): Promise<CatalogVersion> {
  const version = await getVersion(db, id);
  if (version.status === "approved") return version;
  if (version.status !== "draft")
    throw new CatalogError(
      "invalid_transition",
      `une version « ${version.status} » ne s'approuve pas`,
    );
  const issues = await guard(version.snapshot, vaultCheck(db));
  if (issues.length > 0)
    throw new CatalogError(
      "publication_refused",
      "approbation refusée",
      issues,
    );
  await db
    .update(configVersions)
    .set({ status: "approved", approvedAt: now })
    .where(and(eq(configVersions.id, id), eq(configVersions.status, "draft")));
  return getVersion(db, id);
}

/** Publie une version approuvée ; la précédente devient « remplacée ». Garde rejouée au dernier moment. */
export async function publishVersion(
  db: Database,
  id: string,
  now: Date = new Date(),
): Promise<CatalogVersion> {
  const vault = vaultCheck(db);
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('catalog-publish'))`,
    );
    const [row] = await tx
      .select()
      .from(configVersions)
      .where(and(inCatalog, eq(configVersions.id, id)))
      .for("update");
    if (!row) throw new CatalogError("not_found", "version introuvable");
    if (row.status === "published") return toVersion(row);
    if (row.status !== "approved")
      throw new CatalogError(
        "invalid_transition",
        "seule une version approuvée se publie",
      );
    const [current] = await tx
      .select()
      .from(configVersions)
      .where(and(inCatalog, eq(configVersions.status, "published")))
      .orderBy(desc(configVersions.publishedAt))
      .limit(1);
    // Le brouillon a été construit sur une autre version publiée : il faut le reconstruire.
    const parent = current?.hash ?? "none";
    const expected = sha256Hex(
      canonicalJson({ parent, snapshot: row.content }),
    );
    if (expected !== row.hash)
      throw new CatalogError(
        "stale_version",
        "le catalogue publié a changé depuis ce brouillon : le reconstruire",
      );
    const issues = await guard(
      row.content as unknown as CatalogSnapshot,
      vault,
    );
    if (issues.length > 0)
      throw new CatalogError(
        "publication_refused",
        "publication refusée",
        issues,
      );
    if (current)
      await tx
        .update(configVersions)
        .set({ status: "superseded" })
        .where(eq(configVersions.id, current.id));
    const [published] = await tx
      .update(configVersions)
      .set({ status: "published", publishedAt: now })
      .where(eq(configVersions.id, id))
      .returning();
    if (!published) throw new CatalogError("not_found", "version introuvable");
    return toVersion(published);
  });
  return outcome;
}

/** Écrit en retour l'état « appliqué » d'une synchronisation (D3). */
export async function markApplied(
  db: Database,
  id: string,
  result: { status: "applied" | "failed"; detail: Record<string, unknown> },
  now: Date = new Date(),
) {
  await db
    .update(configVersions)
    .set({
      appliedAt: now,
      appliedStatus: result.status,
      appliedDetail: result.detail,
    })
    .where(eq(configVersions.id, id));
}
