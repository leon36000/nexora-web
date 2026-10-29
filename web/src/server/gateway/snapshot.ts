import type {
  ModelAvailability,
  ModelCapabilities,
  ModelKind,
  ModelRouting,
  ModelSheet,
  ModelVisibility,
  PriceWindowRow,
  ProviderType,
  Region,
} from "@nexora/db";
import { checkPrice, type PriceIssue, type PriceRow } from "./pricing";

/**
 * Instantané du catalogue publié (D3/D14). C'est CE contenu, figé et hashé, que la synchronisation
 * LiteLLM et la facturation consomment, jamais les tables de travail. Les montants (bigint) sont
 * écrits en chaînes décimales dans le JSON.
 */

export interface SnapshotProvider {
  id: string;
  code: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  litellmBaseUrl: string | null;
  secretRef: string | null;
  region: Region;
  dataPolicyFr: string;
  dataPolicyEn: string;
  priority: number;
  enabled: boolean;
}

interface SnapshotPrice {
  id: string;
  upstreamInputUsdMicro: string;
  upstreamOutputUsdMicro: string;
  upstreamCacheUsdMicro: string | null;
  sellInputCadMicro: string;
  sellOutputCadMicro: string;
  sellCacheCadMicro: string | null;
  /** Absents des versions publiées avant les plages horaires : lire avec une valeur par défaut. */
  upstreamCacheWriteUsdMicro?: string | null;
  sellCacheWriteCadMicro?: string | null;
  windows?: PriceWindowRow[];
  marginBps: number;
  marginFloorBps: number;
  effectiveAt: string;
  note: string;
}

/** Route de secours figée dans la version publiée ; `upstream` null = même coût que le modèle. */
export interface SnapshotRoute {
  id: string;
  providerId: string;
  upstreamId: string;
  position: number;
  upstream: { input: string; output: string; cache: string | null } | null;
}

export type { ModelAvailability };

export interface SnapshotModel {
  id: string;
  publicId: string;
  name: string;
  descriptionFr: string;
  descriptionEn: string;
  kind: ModelKind;
  providerId: string;
  upstreamId: string;
  contextMax: number;
  maxOutputTokens: number | null;
  capabilities: ModelCapabilities;
  residency: Region;
  visibility: ModelVisibility;
  /**
   * `preview` : visible au catalogue public (fiche, prix) mais pas encore appelable (clé du fournisseur non saisie).
   * Absent des versions publiées avant l'aperçu : lire « live ».
   */
  availability?: ModelAvailability;
  sunsetAt: string | null;
  /** Absents des versions publiées avant la tranche 1 : lire avec une valeur par défaut. */
  sheet?: ModelSheet;
  routing?: ModelRouting;
  /** Routes de secours actives, par position ; absentes des versions publiées avant les routes. */
  routes?: SnapshotRoute[];
  price: SnapshotPrice | null;
}

interface SnapshotFx {
  id: string;
  usdToCadMicro: string;
  effectiveAt: string;
}

export interface CatalogSnapshot {
  schema: 1;
  fx: SnapshotFx | null;
  providers: SnapshotProvider[];
  models: SnapshotModel[];
}

export const EMPTY_SNAPSHOT: CatalogSnapshot = {
  schema: 1,
  fx: null,
  providers: [],
  models: [],
};

function priceRowOf(price: SnapshotPrice): PriceRow {
  const opt = (v: string | null) => (v === null ? null : BigInt(v));
  return {
    upstreamInputUsdMicro: BigInt(price.upstreamInputUsdMicro),
    upstreamOutputUsdMicro: BigInt(price.upstreamOutputUsdMicro),
    upstreamCacheUsdMicro: opt(price.upstreamCacheUsdMicro),
    sellInputCadMicro: BigInt(price.sellInputCadMicro),
    sellOutputCadMicro: BigInt(price.sellOutputCadMicro),
    sellCacheCadMicro: opt(price.sellCacheCadMicro),
    upstreamCacheWriteUsdMicro: opt(price.upstreamCacheWriteUsdMicro ?? null),
    sellCacheWriteCadMicro: opt(price.sellCacheWriteCadMicro ?? null),
    marginFloorBps: price.marginFloorBps,
  };
}

/** Une plage horaire vue comme un prix complet, pour passer la même garde que le prix de base. */
function windowRowOf(w: PriceWindowRow, floor: number): PriceRow {
  const opt = (v: string | null) => (v === null ? null : BigInt(v));
  return {
    upstreamInputUsdMicro: BigInt(w.upstream.input),
    upstreamOutputUsdMicro: BigInt(w.upstream.output),
    upstreamCacheUsdMicro: opt(w.upstream.cache),
    sellInputCadMicro: BigInt(w.sell.input),
    sellOutputCadMicro: BigInt(w.sell.output),
    sellCacheCadMicro: opt(w.sell.cache),
    upstreamCacheWriteUsdMicro: opt(w.upstream.cacheWrite),
    sellCacheWriteCadMicro: opt(w.sell.cacheWrite),
    marginFloorBps: floor,
  };
}

export type CatalogIssue =
  | { code: "fx_missing" }
  | { code: "price_missing"; model: string }
  | ({ model: string; window?: string } & PriceIssue)
  | { code: "provider_missing" | "provider_disabled"; model: string }
  | { code: "secret_missing"; model: string; provider: string }
  | {
      code:
        | "route_provider_missing"
        | "route_provider_disabled"
        | "route_secret_missing";
      model: string;
      route: number;
    }
  | ({ model: string; route: number } & {
      code: "route_below_margin_floor";
      field: "input" | "output" | "cache";
    });

const KEY_REQUIRED: Record<ProviderType, boolean> = {
  openrouter: true,
  openai_compatible: true,
  litellm_upstream: true,
  vllm: false,
  ollama: false,
};

/**
 * Garde de publication : un prix absent, nul ou sous le plancher de marge, un taux de change non
 * approuvé, un fournisseur désactivé ou sans clé dans le coffre bloquent l'approbation et la
 * publication. Un modèle en « aperçu » (visible, pas encore appelable) est dispensé de la clé de son fournisseur et de
 * celles de ses routes : le reste de la garde s'applique. Renvoie la liste complète des problèmes (vide = publiable).
 */
export function guardSnapshot(
  snapshot: CatalogSnapshot,
  options: { secretExists: (ref: string) => boolean },
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  if (snapshot.models.length > 0 && !snapshot.fx)
    issues.push({ code: "fx_missing" });
  const providers = new Map(snapshot.providers.map((p) => [p.id, p]));
  for (const m of snapshot.models) {
    const provider = providers.get(m.providerId);
    const preview = m.availability === "preview";
    if (!provider) {
      issues.push({ code: "provider_missing", model: m.publicId });
    } else {
      if (!provider.enabled)
        issues.push({ code: "provider_disabled", model: m.publicId });
      const needsKey =
        KEY_REQUIRED[provider.type] || provider.secretRef !== null;
      // Un modèle en aperçu n'est pas appelable : sa clé n'existe peut-être pas encore (elle sera exigée au passage en service).
      if (
        !preview &&
        needsKey &&
        (!provider.secretRef || !options.secretExists(provider.secretRef))
      )
        issues.push({
          code: "secret_missing",
          model: m.publicId,
          provider: provider.code,
        });
    }
    for (const r of m.routes ?? []) {
      const rp = providers.get(r.providerId);
      if (!rp) {
        issues.push({
          code: "route_provider_missing",
          model: m.publicId,
          route: r.position,
        });
        continue;
      }
      if (!rp.enabled)
        issues.push({
          code: "route_provider_disabled",
          model: m.publicId,
          route: r.position,
        });
      if (
        !preview &&
        (KEY_REQUIRED[rp.type] || rp.secretRef !== null) &&
        (!rp.secretRef || !options.secretExists(rp.secretRef))
      )
        issues.push({
          code: "route_secret_missing",
          model: m.publicId,
          route: r.position,
        });
    }
    if (!m.price) {
      issues.push({ code: "price_missing", model: m.publicId });
      continue;
    }
    if (snapshot.fx) {
      for (const issue of checkPrice(
        priceRowOf(m.price),
        BigInt(snapshot.fx.usdToCadMicro),
        m.kind,
      ))
        issues.push({ model: m.publicId, ...issue });
      for (const w of m.price.windows ?? [])
        for (const issue of checkPrice(
          windowRowOf(w, m.price.marginFloorBps),
          BigInt(snapshot.fx.usdToCadMicro),
          m.kind,
        ))
          issues.push({ model: m.publicId, window: w.label, ...issue });
      // Chaque route qui a son propre coût doit tenir la marge garantie, au prix de base comme dans chaque plage.
      for (const r of m.routes ?? []) {
        if (!r.upstream) continue;
        const sells = [
          priceRowOf(m.price),
          ...(m.price.windows ?? []).map((w) =>
            windowRowOf(w, m.price?.marginFloorBps ?? 0),
          ),
        ];
        const bad = new Set<string>();
        for (const sell of sells)
          for (const issue of checkPrice(
            {
              ...sell,
              upstreamInputUsdMicro: BigInt(r.upstream.input),
              upstreamOutputUsdMicro: BigInt(r.upstream.output),
              upstreamCacheUsdMicro:
                r.upstream.cache === null ? null : BigInt(r.upstream.cache),
              upstreamCacheWriteUsdMicro: null,
              sellCacheWriteCadMicro: null,
            },
            BigInt(snapshot.fx.usdToCadMicro),
            m.kind,
          ))
            if (
              issue.code === "below_margin_floor" &&
              issue.field !== "cacheWrite" &&
              !bad.has(issue.field)
            ) {
              bad.add(issue.field);
              issues.push({
                code: "route_below_margin_floor",
                model: m.publicId,
                route: r.position,
                field: issue.field,
              });
            }
      }
    }
  }
  return issues;
}

interface Change {
  field: string;
  before: unknown;
  after: unknown;
}
export type DiffEntry =
  | { kind: "model_added" | "model_removed"; model: string }
  | { kind: "model_changed"; model: string; changes: Change[] }
  | { kind: "fx_changed"; before: string | null; after: string | null }
  | { kind: "provider_changed"; provider: string; changes: Change[] };

function changesBetween(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  ignore: readonly string[] = [],
): Change[] {
  const out: Change[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (ignore.includes(key)) continue;
    const before = a[key];
    const after = b[key];
    if (JSON.stringify(before) !== JSON.stringify(after))
      out.push({ field: key, before, after });
  }
  return out;
}

/** Aperçu des différences entre le catalogue publié (`before`) et un brouillon (`after`). */
export function diffSnapshots(
  before: CatalogSnapshot,
  after: CatalogSnapshot,
): DiffEntry[] {
  const out: DiffEntry[] = [];
  if ((before.fx?.usdToCadMicro ?? null) !== (after.fx?.usdToCadMicro ?? null))
    out.push({
      kind: "fx_changed",
      before: before.fx?.usdToCadMicro ?? null,
      after: after.fx?.usdToCadMicro ?? null,
    });
  const bm = new Map(before.models.map((m) => [m.publicId, m]));
  const am = new Map(after.models.map((m) => [m.publicId, m]));
  for (const [id, model] of am) {
    const old = bm.get(id);
    if (!old) {
      out.push({ kind: "model_added", model: id });
      continue;
    }
    const flat = (m: SnapshotModel) => ({
      ...m,
      price: undefined,
      ...(m.price
        ? Object.fromEntries(
            Object.entries(m.price)
              .filter(([k]) => k !== "id" && k !== "effectiveAt")
              .map(([k, v]) => [`price.${k}`, v]),
          )
        : { "price.sellInputCadMicro": null }),
    });
    const changes = changesBetween(flat(old), flat(model), [
      "id",
      "providerId",
    ]);
    if (old.providerId !== model.providerId)
      changes.push({
        field: "providerId",
        before: old.providerId,
        after: model.providerId,
      });
    if (changes.length > 0)
      out.push({ kind: "model_changed", model: id, changes });
  }
  for (const id of bm.keys())
    if (!am.has(id)) out.push({ kind: "model_removed", model: id });
  const bp = new Map(before.providers.map((p) => [p.id, p]));
  for (const p of after.providers) {
    const old = bp.get(p.id);
    if (!old) continue;
    const changes = changesBetween(
      old as unknown as Record<string, unknown>,
      p as unknown as Record<string, unknown>,
    );
    if (changes.length > 0)
      out.push({ kind: "provider_changed", provider: p.code, changes });
  }
  return out;
}
