import {
  and,
  asc,
  configVersions,
  type Database,
  desc,
  type Executor,
  eq,
  type Region,
  sql,
  VPS_ITEM_STATUSES,
  type VpsAppKind,
  type VpsAppPort,
  type VpsItemStatus,
  vpsApps,
  vpsPlans,
} from "@nexora/db";
import { canonicalJson, sha256Hex } from "./canonical.ts";

/**
 * Catalogue VPS versionné (D3, D14) : plans et applications. Les tables de travail se modifient
 * librement ; SEULE une version publiée (config_versions, collection `vps_catalog`) sert aux
 * commandes, aux pages publiques et à « Publier vers Stripe ». Une version : brouillon → approuvée →
 * publiée → remplacée ; son contenu et son hash sont figés par déclencheur SQL.
 */
export const VPS_CATALOG_COLLECTION = "vps_catalog";
export const VPS_CATALOG_ITEM = "main";

/** Licences permissives acceptées pour une application installée par le worker (D8). */
export const PERMISSIVE_LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
] as const;

/**
 * Applications qui ne sont JAMAIS installées par le worker (D8) : licence qui interdit la revente
 * ou l'hébergement pour des tiers (n8n), clause de marque (Open WebUI), multi-locataire (Dify).
 * Elles n'existent que comme fiche « guide d'installation par le client ».
 */
export const EXCLUDED_FROM_INSTALL = ["n8n", "open-webui", "dify"] as const;

export type VpsCatalogErrorCode =
  | "not_found"
  | "conflict"
  | "invalid_request"
  | "invalid_transition"
  | "publication_refused"
  | "stale_version";

export class VpsCatalogError extends Error {
  readonly code: VpsCatalogErrorCode;
  readonly details?: unknown;
  constructor(code: VpsCatalogErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "VpsCatalogError";
    this.code = code;
    this.details = details;
  }
}

type Plan = typeof vpsPlans.$inferSelect;
type App = typeof vpsApps.$inferSelect;
type Version = typeof configVersions.$inferSelect;

const dbCode = (e: unknown): string | undefined => {
  if (typeof e !== "object" || e === null) return undefined;
  const c = e as { code?: unknown; cause?: { code?: unknown } };
  return String(c.code ?? c.cause?.code ?? "") || undefined;
};
function rethrow(e: unknown, message: string): never {
  const code = dbCode(e);
  if (code === "23505") throw new VpsCatalogError("conflict", message);
  if (code === "23514")
    throw new VpsCatalogError("invalid_request", "valeur refusée par la base");
  throw e;
}

// ─── Instantané ─────────────────────────────────────────────────────────────────

export interface SnapshotPlan {
  id: string;
  code: string;
  name: string;
  descriptionFr: string;
  descriptionEn: string;
  vcpu: number;
  ramMb: number;
  diskGb: number;
  bandwidthGb: number;
  region: Region;
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  highlighted: boolean;
  templateCode: string;
  sort: number;
  isDevSample: boolean;
}
export interface SnapshotApp {
  id: string;
  code: string;
  name: string;
  kind: VpsAppKind;
  taglineFr: string;
  taglineEn: string;
  descriptionFr: string;
  descriptionEn: string;
  version: string;
  upstreamUrl: string;
  license: string;
  licenseUrl: string;
  licenseWarningFr: string;
  licenseWarningEn: string;
  guideFr: string;
  guideEn: string;
  installScriptVersion: number;
  installScript: string | null;
  installScriptSha256: string | null;
  ports: VpsAppPort[];
  minRamMb: number;
  sort: number;
}
export interface VpsCatalogSnapshot {
  schema: 1;
  plans: SnapshotPlan[];
  apps: SnapshotApp[];
}
export const EMPTY_SNAPSHOT: VpsCatalogSnapshot = {
  schema: 1,
  plans: [],
  apps: [],
};

const snapPlan = (p: Plan): SnapshotPlan => ({
  id: p.id,
  code: p.code,
  name: p.name,
  descriptionFr: p.descriptionFr,
  descriptionEn: p.descriptionEn,
  vcpu: p.vcpu,
  ramMb: p.ramMb,
  diskGb: p.diskGb,
  bandwidthGb: p.bandwidthGb,
  region: p.region,
  priceMonthlyCents: p.priceMonthlyCents,
  priceYearlyCents: p.priceYearlyCents,
  highlighted: p.highlighted,
  templateCode: p.templateCode,
  sort: p.sort,
  isDevSample: p.isDevSample,
});
const snapApp = (a: App): SnapshotApp => ({
  id: a.id,
  code: a.code,
  name: a.name,
  kind: a.kind,
  taglineFr: a.taglineFr,
  taglineEn: a.taglineEn,
  descriptionFr: a.descriptionFr,
  descriptionEn: a.descriptionEn,
  version: a.version,
  upstreamUrl: a.upstreamUrl,
  license: a.license,
  licenseUrl: a.licenseUrl,
  licenseWarningFr: a.licenseWarningFr,
  licenseWarningEn: a.licenseWarningEn,
  guideFr: a.guideFr,
  guideEn: a.guideEn,
  installScriptVersion: a.installScriptVersion,
  installScript: a.installScript,
  installScriptSha256: a.installScriptSha256,
  ports: a.ports,
  minRamMb: a.minRamMb,
  sort: a.sort,
});

// ─── Garde de publication ───────────────────────────────────────────────────────

export interface CatalogIssue {
  entity: "plan" | "app" | "catalog";
  code: string;
  issue: string;
  message: string;
}

export interface GuardOptions {
  /** Les plans de développement ne sont publiables que dans la base de développement. */
  allowDevSamples: boolean;
  /** Vrai si un gabarit prêt porte ce code sur au moins un serveur prêt. */
  templateReady?: (code: string, region: Region) => boolean;
}

export function guardSnapshot(
  s: VpsCatalogSnapshot,
  options: GuardOptions,
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const add = (
    entity: CatalogIssue["entity"],
    code: string,
    issue: string,
    message: string,
  ) => issues.push({ entity, code, issue, message });
  for (const p of s.plans) {
    const monthly = p.priceMonthlyCents;
    const yearly = p.priceYearlyCents;
    if (monthly == null && yearly == null)
      add(
        "plan",
        p.code,
        "price_missing",
        "aucun prix : publication refusée (jamais 0 $)",
      );
    for (const [label, v] of [
      ["mensuel", monthly],
      ["annuel", yearly],
    ] as const)
      if (v != null && (!Number.isSafeInteger(v) || v <= 0))
        add("plan", p.code, "price_invalid", `prix ${label} invalide`);
    if (yearly != null && monthly != null && yearly >= monthly * 12)
      add(
        "plan",
        p.code,
        "yearly_not_cheaper",
        "le prix annuel doit être inférieur à 12 mois au tarif mensuel",
      );
    if (p.isDevSample && !options.allowDevSamples)
      add(
        "plan",
        p.code,
        "dev_sample",
        "plan de développement : non publiable hors de la base de développement",
      );
    if (
      options.templateReady &&
      !options.templateReady(p.templateCode, p.region)
    )
      add(
        "plan",
        p.code,
        "template_missing",
        `aucun gabarit prêt « ${p.templateCode} » sur un serveur prêt de la région`,
      );
  }
  for (const a of s.apps) {
    if (a.kind === "installable") {
      if ((EXCLUDED_FROM_INSTALL as readonly string[]).includes(a.code))
        add(
          "app",
          a.code,
          "excluded",
          "application exclue de l'installation par le worker (D8) : guide seulement",
        );
      if (!(PERMISSIVE_LICENSES as readonly string[]).includes(a.license))
        add(
          "app",
          a.code,
          "license_not_permissive",
          `licence « ${a.license} » non permissive : installation refusée (D8)`,
        );
      if (!a.installScript || !a.installScriptSha256)
        add("app", a.code, "script_missing", "script d'installation absent");
      else if (sha256Hex(a.installScript) !== a.installScriptSha256)
        add(
          "app",
          a.code,
          "script_hash_mismatch",
          "la somme SHA-256 ne correspond pas au script",
        );
      if (!/^[A-Za-z0-9._-]+$/.test(a.version))
        add("app", a.code, "version_unpinned", "version épinglée invalide");
      if (/^(latest|main|master|stable)$/i.test(a.version))
        add("app", a.code, "version_unpinned", "version non épinglée");
    } else if (
      !a.licenseWarningFr.trim() ||
      !a.licenseWarningEn.trim() ||
      !a.guideFr.trim()
    )
      add(
        "app",
        a.code,
        "guide_incomplete",
        "un guide exige l'avertissement de licence (fr, en) et le guide d'installation",
      );
    if (!a.licenseUrl.startsWith("https://"))
      add(
        "app",
        a.code,
        "license_url",
        "adresse de la licence : https attendu",
      );
  }
  const codes = new Set<string>();
  for (const p of s.plans) {
    if (codes.has(`p:${p.code}`))
      add("plan", p.code, "duplicate", "code en double");
    codes.add(`p:${p.code}`);
  }
  return issues;
}

// ─── Diff ───────────────────────────────────────────────────────────────────────

export interface DiffEntry {
  entity: "plan" | "app";
  code: string;
  change: "added" | "removed" | "changed";
  fields?: string[];
}

export function diffSnapshots(
  before: VpsCatalogSnapshot,
  after: VpsCatalogSnapshot,
): DiffEntry[] {
  const out: DiffEntry[] = [];
  const cmp = <T extends { code: string }>(
    entity: "plan" | "app",
    a: T[],
    b: T[],
  ) => {
    const am = new Map(a.map((x) => [x.code, x]));
    const bm = new Map(b.map((x) => [x.code, x]));
    for (const [code, x] of bm) {
      const old = am.get(code);
      if (!old) {
        out.push({ entity, code, change: "added" });
        continue;
      }
      const fields = Object.keys(x as object).filter(
        (k) =>
          k !== "id" &&
          canonicalJson((x as Record<string, unknown>)[k]) !==
            canonicalJson((old as Record<string, unknown>)[k]),
      );
      if (fields.length > 0)
        out.push({ entity, code, change: "changed", fields });
    }
    for (const code of am.keys())
      if (!bm.has(code)) out.push({ entity, code, change: "removed" });
  };
  cmp("plan", before.plans, after.plans);
  cmp("app", before.apps, after.apps);
  return out;
}

// ─── Plans ──────────────────────────────────────────────────────────────────────

export interface PlanInput {
  code: string;
  name: string;
  descriptionFr?: string;
  descriptionEn?: string;
  vcpu: number;
  ramMb: number;
  diskGb: number;
  bandwidthGb: number;
  region?: Region;
  priceMonthlyCents?: number | null;
  priceYearlyCents?: number | null;
  highlighted?: boolean;
  templateCode: string;
  sort?: number;
  isDevSample?: boolean;
}

export async function createPlan(db: Database, input: PlanInput) {
  try {
    const [row] = await db.insert(vpsPlans).values(input).returning();
    if (!row) throw new Error("plan non créé");
    return row;
  } catch (e) {
    return rethrow(e, "un plan porte déjà ce code");
  }
}

const NEXT: Record<VpsItemStatus, readonly VpsItemStatus[]> = {
  draft: ["draft", "approved", "retired"],
  approved: ["approved", "draft", "published", "retired"],
  published: ["published", "approved", "retired"],
  retired: ["retired", "draft"],
};

export async function updatePlan(
  db: Database,
  id: string,
  patch: Partial<Omit<PlanInput, "code">> & { status?: VpsItemStatus },
  now: Date = new Date(),
) {
  const current = await getPlan(db, id);
  if (patch.status && !NEXT[current.status].includes(patch.status))
    throw new VpsCatalogError(
      "invalid_transition",
      `passage de « ${current.status} » à « ${patch.status} » impossible`,
    );
  if (patch.status === "approved" || patch.status === "published") {
    const merged = snapPlan({ ...current, ...patch } as Plan);
    const issues = guardSnapshot(
      { ...EMPTY_SNAPSHOT, plans: [merged] },
      { allowDevSamples: true },
    ).filter((i) => i.issue !== "dev_sample");
    if (issues.length > 0)
      throw new VpsCatalogError("publication_refused", "plan invalide", issues);
  }
  try {
    const [row] = await db
      .update(vpsPlans)
      .set({ ...patch, updatedAt: now })
      .where(eq(vpsPlans.id, id))
      .returning();
    if (!row) throw new VpsCatalogError("not_found", "plan introuvable");
    return row;
  } catch (e) {
    return rethrow(e, "conflit sur le plan");
  }
}

export async function listPlans(db: Database): Promise<Plan[]> {
  return db
    .select()
    .from(vpsPlans)
    .orderBy(asc(vpsPlans.sort), asc(vpsPlans.code));
}

export async function getPlan(db: Database, id: string): Promise<Plan> {
  const [row] = await db.select().from(vpsPlans).where(eq(vpsPlans.id, id));
  if (!row) throw new VpsCatalogError("not_found", "plan introuvable");
  return row;
}

// ─── Applications ───────────────────────────────────────────────────────────────

export interface AppInput {
  code: string;
  name: string;
  kind?: VpsAppKind;
  taglineFr?: string;
  taglineEn?: string;
  descriptionFr?: string;
  descriptionEn?: string;
  version: string;
  upstreamUrl: string;
  license: string;
  licenseUrl: string;
  licenseWarningFr?: string;
  licenseWarningEn?: string;
  guideFr?: string;
  guideEn?: string;
  /** Texte du script d'installation ; la somme SHA-256 est calculée ici, jamais saisie. */
  installScript?: string | null;
  ports?: VpsAppPort[];
  minRamMb?: number;
  sort?: number;
}

function scriptFields(kind: VpsAppKind, script: string | null | undefined) {
  if (kind === "guide")
    return { installScript: null, installScriptSha256: null };
  if (!script?.trim())
    throw new VpsCatalogError(
      "invalid_request",
      "script d'installation requis pour une application installable",
    );
  return { installScript: script, installScriptSha256: sha256Hex(script) };
}

export async function createApp(db: Database, input: AppInput) {
  const kind = input.kind ?? "installable";
  const { installScript: _s, ...rest } = input;
  try {
    const [row] = await db
      .insert(vpsApps)
      .values({ ...rest, kind, ...scriptFields(kind, input.installScript) })
      .returning();
    if (!row) throw new Error("application non créée");
    return row;
  } catch (e) {
    return rethrow(e, "une application porte déjà ce code");
  }
}

export async function updateApp(
  db: Database,
  id: string,
  patch: Partial<Omit<AppInput, "code">> & { status?: VpsItemStatus },
  now: Date = new Date(),
) {
  const current = await getApp(db, id);
  if (patch.status && !NEXT[current.status].includes(patch.status))
    throw new VpsCatalogError(
      "invalid_transition",
      `passage de « ${current.status} » à « ${patch.status} » impossible`,
    );
  const { installScript, ...rest } = patch;
  const kind = patch.kind ?? current.kind;
  const set: Record<string, unknown> = { ...rest, updatedAt: now };
  if (kind === "guide") {
    set.installScript = null;
    set.installScriptSha256 = null;
  } else if (installScript !== undefined) {
    const f = scriptFields(kind, installScript);
    set.installScript = f.installScript;
    set.installScriptSha256 = f.installScriptSha256;
    // Un script modifié est une nouvelle version du script.
    if (f.installScriptSha256 !== current.installScriptSha256)
      set.installScriptVersion = current.installScriptVersion + 1;
  } else if (patch.kind === "installable" && !current.installScript)
    throw new VpsCatalogError(
      "invalid_request",
      "script d'installation requis",
    );
  if (patch.status === "approved" || patch.status === "published") {
    const merged = snapApp({ ...current, ...set } as App);
    const issues = guardSnapshot(
      { ...EMPTY_SNAPSHOT, apps: [merged] },
      { allowDevSamples: true },
    );
    if (issues.length > 0)
      throw new VpsCatalogError(
        "publication_refused",
        "application invalide",
        issues,
      );
  }
  try {
    const [row] = await db
      .update(vpsApps)
      .set(set)
      .where(eq(vpsApps.id, id))
      .returning();
    if (!row) throw new VpsCatalogError("not_found", "application introuvable");
    return row;
  } catch (e) {
    return rethrow(e, "conflit sur l'application");
  }
}

export async function listApps(db: Database): Promise<App[]> {
  return db
    .select()
    .from(vpsApps)
    .orderBy(asc(vpsApps.sort), asc(vpsApps.code));
}

export async function getApp(db: Database, id: string): Promise<App> {
  const [row] = await db.select().from(vpsApps).where(eq(vpsApps.id, id));
  if (!row) throw new VpsCatalogError("not_found", "application introuvable");
  return row;
}

// ─── Versions ───────────────────────────────────────────────────────────────────

export async function buildSnapshot(db: Database): Promise<VpsCatalogSnapshot> {
  const plans = await db
    .select()
    .from(vpsPlans)
    .where(eq(vpsPlans.status, "published"))
    .orderBy(asc(vpsPlans.sort), asc(vpsPlans.code));
  const apps = await db
    .select()
    .from(vpsApps)
    .where(eq(vpsApps.status, "published"))
    .orderBy(asc(vpsApps.sort), asc(vpsApps.code));
  return { schema: 1, plans: plans.map(snapPlan), apps: apps.map(snapApp) };
}

export const shortVersion = (hash: string) => `vps_${hash.slice(0, 16)}`;

export interface StripeApplied {
  plans: Record<
    string,
    { productId: string; monthly?: string; yearly?: string }
  >;
}

export interface VpsCatalogVersion {
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
  snapshot: VpsCatalogSnapshot;
}

function toVersion(row: Version): VpsCatalogVersion {
  return {
    id: row.id,
    hash: row.hash,
    short: shortVersion(row.hash),
    status: row.status,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    publishedAt: row.publishedAt,
    appliedAt: row.appliedAt,
    appliedStatus: row.appliedStatus,
    appliedDetail: row.appliedDetail,
    snapshot: row.content as unknown as VpsCatalogSnapshot,
  };
}

const inCatalog = and(
  eq(configVersions.collection, VPS_CATALOG_COLLECTION),
  eq(configVersions.itemId, VPS_CATALOG_ITEM),
);

export async function getPublishedCatalog(
  db: Database,
): Promise<VpsCatalogVersion | null> {
  const [row] = await db
    .select()
    .from(configVersions)
    .where(and(inCatalog, eq(configVersions.status, "published")))
    .orderBy(desc(configVersions.publishedAt))
    .limit(1);
  return row ? toVersion(row) : null;
}

export async function getCatalogVersionById(
  db: Executor,
  id: string,
): Promise<VpsCatalogVersion> {
  const [row] = await db
    .select()
    .from(configVersions)
    .where(and(inCatalog, eq(configVersions.id, id)));
  if (!row) throw new VpsCatalogError("not_found", "version introuvable");
  return toVersion(row);
}

export async function listCatalogVersions(
  db: Database,
  limit = 30,
): Promise<VpsCatalogVersion[]> {
  const rows = await db
    .select()
    .from(configVersions)
    .where(inCatalog)
    .orderBy(desc(configVersions.createdAt))
    .limit(limit);
  return rows.map(toVersion);
}

export async function createDraftVersion(
  db: Database,
  options: GuardOptions,
): Promise<{
  version: VpsCatalogVersion;
  created: boolean;
  unchanged: boolean;
  diff: DiffEntry[];
  issues: CatalogIssue[];
}> {
  const snapshot = await buildSnapshot(db);
  const published = await getPublishedCatalog(db);
  const parent = published?.hash ?? "none";
  const hash = sha256Hex(canonicalJson({ parent, snapshot }));
  const diff = diffSnapshots(published?.snapshot ?? EMPTY_SNAPSHOT, snapshot);
  const issues = guardSnapshot(snapshot, options);
  if (
    published &&
    canonicalJson(published.snapshot) === canonicalJson(snapshot)
  )
    return {
      version: published,
      created: false,
      unchanged: true,
      diff,
      issues,
    };
  const [inserted] = await db
    .insert(configVersions)
    .values({
      collection: VPS_CATALOG_COLLECTION,
      itemId: VPS_CATALOG_ITEM,
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
      unchanged: false,
      diff,
      issues,
    };
  const [existing] = await db
    .select()
    .from(configVersions)
    .where(and(inCatalog, eq(configVersions.hash, hash)));
  if (!existing) throw new Error("version introuvable après conflit");
  return {
    version: toVersion(existing),
    created: false,
    unchanged: false,
    diff,
    issues,
  };
}

export async function diffCatalogVersion(
  db: Database,
  id: string,
  options: GuardOptions,
) {
  const version = await getCatalogVersionById(db, id);
  const published = await getPublishedCatalog(db);
  return {
    version,
    diff: diffSnapshots(
      published?.snapshot ?? EMPTY_SNAPSHOT,
      version.snapshot,
    ),
    issues: guardSnapshot(version.snapshot, options),
  };
}

export async function approveCatalogVersion(
  db: Database,
  id: string,
  options: GuardOptions,
  now: Date = new Date(),
): Promise<VpsCatalogVersion> {
  const version = await getCatalogVersionById(db, id);
  if (version.status === "approved") return version;
  if (version.status !== "draft")
    throw new VpsCatalogError(
      "invalid_transition",
      `une version « ${version.status} » ne s'approuve pas`,
    );
  const issues = guardSnapshot(version.snapshot, options);
  if (issues.length > 0)
    throw new VpsCatalogError(
      "publication_refused",
      "approbation refusée",
      issues,
    );
  await db
    .update(configVersions)
    .set({ status: "approved", approvedAt: now })
    .where(and(eq(configVersions.id, id), eq(configVersions.status, "draft")));
  return getCatalogVersionById(db, id);
}

export async function publishCatalogVersion(
  db: Database,
  id: string,
  options: GuardOptions,
  now: Date = new Date(),
): Promise<VpsCatalogVersion> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('vps-catalog-publish'))`,
    );
    const [row] = await tx
      .select()
      .from(configVersions)
      .where(and(inCatalog, eq(configVersions.id, id)))
      .for("update");
    if (!row) throw new VpsCatalogError("not_found", "version introuvable");
    if (row.status === "published") return toVersion(row);
    if (row.status !== "approved")
      throw new VpsCatalogError(
        "invalid_transition",
        "seule une version approuvée se publie",
      );
    const [current] = await tx
      .select()
      .from(configVersions)
      .where(and(inCatalog, eq(configVersions.status, "published")))
      .orderBy(desc(configVersions.publishedAt))
      .limit(1);
    const parent = current?.hash ?? "none";
    if (
      sha256Hex(canonicalJson({ parent, snapshot: row.content })) !== row.hash
    )
      throw new VpsCatalogError(
        "stale_version",
        "le catalogue publié a changé depuis ce brouillon : le reconstruire",
      );
    const issues = guardSnapshot(
      row.content as unknown as VpsCatalogSnapshot,
      options,
    );
    if (issues.length > 0)
      throw new VpsCatalogError(
        "publication_refused",
        "publication refusée",
        issues,
      );
    if (current)
      await tx
        .update(configVersions)
        .set({ status: "superseded" })
        .where(eq(configVersions.id, current.id));
    const carried = carryStripe(
      current ? toVersion(current) : null,
      row.content as unknown as VpsCatalogSnapshot,
    );
    const [published] = await tx
      .update(configVersions)
      .set({
        status: "published",
        publishedAt: now,
        ...(carried
          ? {
              appliedAt: now,
              appliedStatus: "applied",
              appliedDetail: { stripe: carried, carriedFrom: current?.id },
            }
          : {}),
      })
      .where(eq(configVersions.id, id))
      .returning();
    if (!published)
      throw new VpsCatalogError("not_found", "version introuvable");
    return toVersion(published);
  });
}

/**
 * Une nouvelle version publiée garde les prix Stripe de la précédente tant que les prix des plans
 * n'ont pas changé : ajouter une application ne bloque pas les commandes. Si un seul prix change
 * (ou si un plan est nouveau), rien n'est repris et « Publier vers Stripe » est à relancer.
 */
export function carryStripe(
  previous: VpsCatalogVersion | null,
  next: VpsCatalogSnapshot,
): StripeApplied | null {
  const prev = (previous?.appliedDetail as { stripe?: StripeApplied } | null)
    ?.stripe;
  if (previous?.appliedStatus !== "applied" || !prev) return null;
  const plans: StripeApplied["plans"] = {};
  for (const p of next.plans) {
    const old = previous.snapshot.plans.find((o) => o.code === p.code);
    const ids = prev.plans[p.code];
    if (!old || !ids) return null;
    const entry: StripeApplied["plans"][string] = { productId: ids.productId };
    if (p.priceMonthlyCents != null) {
      if (old.priceMonthlyCents !== p.priceMonthlyCents || !ids.monthly)
        return null;
      entry.monthly = ids.monthly;
    }
    if (p.priceYearlyCents != null) {
      if (old.priceYearlyCents !== p.priceYearlyCents || !ids.yearly)
        return null;
      entry.yearly = ids.yearly;
    }
    plans[p.code] = entry;
  }
  return { plans };
}

/** Écrit en retour l'état « appliqué » d'une synchronisation (ici : Stripe). */
export async function markCatalogApplied(
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

/** Identifiant de prix Stripe d'un plan pour une durée, d'après la version publiée « appliquée ». */
export function stripePriceFor(
  version: VpsCatalogVersion,
  planCode: string,
  term: "month" | "year",
): string | null {
  if (version.appliedStatus !== "applied") return null;
  const stripe = (version.appliedDetail as { stripe?: StripeApplied } | null)
    ?.stripe;
  const entry = stripe?.plans?.[planCode];
  return (term === "month" ? entry?.monthly : entry?.yearly) ?? null;
}

export { VPS_ITEM_STATUSES };
