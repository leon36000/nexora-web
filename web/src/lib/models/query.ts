import {
  MODALITIES,
  MODEL_TAGS,
  type Modality,
  type ModelKind,
  type ModelTag,
  REGIONS,
  type Region,
} from "@nexora/db";
import type { PublicModel } from "@/server/gateway/public";

/**
 * Requête du catalogue public (/modeles) : tout l'état de la page vit dans l'adresse (paramètres français,
 * partageables, rendus côté serveur). Module pur, sans dépendance de rendu.
 *
 * Règles : une valeur inconnue est ignorée (jamais d'erreur) ; les filtres à valeurs multiples (modalités,
 * étiquettes, capacités) sont cumulatifs (le modèle doit avoir TOUTES les valeurs) ; un modèle dont la fiche ne dit
 * rien d'un critère n'est pas retenu par ce critère (on n'invente pas).
 */
export const SORTS = [
  "recents",
  "prix-entree",
  "prix-entree-desc",
  "prix-sortie",
  "prix-sortie-desc",
  "contexte",
  "nom",
] as const;
export type ModelSort = (typeof SORTS)[number];

export const VIEWS = ["cartes", "tableau"] as const;
export type CatalogView = (typeof VIEWS)[number];

export const KINDS = [
  "chat",
  "embedding",
  "rerank",
] as const satisfies readonly ModelKind[];
export const CAPABILITY_FILTERS = [
  "tools",
  "reasoning",
  "vision",
  "json_mode",
] as const;
export type CapabilityFilter = (typeof CAPABILITY_FILTERS)[number];
export const LICENSES = ["ouverte", "fermee"] as const;
export type LicenseFilter = (typeof LICENSES)[number];
export const AVAILABILITIES = ["disponible", "apercu"] as const;
export type AvailabilityFilter = (typeof AVAILABILITIES)[number];

/** Modalités d'ENTRÉE proposées en filtre : « embedding » n'existe qu'en sortie (vecteurs). */
export const INPUT_MODALITIES = MODALITIES.filter(
  (m): m is Exclude<Modality, "embedding"> => m !== "embedding",
);

/** Paliers de l'interface (CAD par million de jetons ; jetons). Une valeur hors palier n'est pas lue. */
export const PRICE_TIERS = [0.1, 0.5, 1, 2, 5, 10] as const;
export const CONTEXT_TIERS = [32_000, 128_000, 256_000, 1_000_000] as const;

/** Nombre maximal de modèles comparés côte à côte. */
export const MAX_COMPARE = 4;

/** Même forme que l'identifiant public d'une fiche (`/modeles/<id>`). */
export const MODEL_ID =
  /^[a-z0-9][a-z0-9._-]{0,40}\/[a-z0-9][a-z0-9._:-]{0,80}$/;

export interface CatalogQuery {
  q: string;
  kind: ModelKind | "";
  inputs: Modality[];
  tags: ModelTag[];
  capabilities: CapabilityFilter[];
  /** Éditeur sous forme de segment d'adresse (« editeur-a »). */
  author: string;
  license: LicenseFilter | "";
  availability: AvailabilityFilter | "";
  residency: Region | "";
  minContext: number | null;
  maxInput: number | null;
  maxOutput: number | null;
  sort: ModelSort;
  view: CatalogView;
  /** Modèles retenus pour la comparaison (2 à 4 une fois sur /modeles/comparer). */
  compare: string[];
}

export const DEFAULT_QUERY: CatalogQuery = {
  q: "",
  kind: "",
  inputs: [],
  tags: [],
  capabilities: [],
  author: "",
  license: "",
  availability: "",
  residency: "",
  minContext: null,
  maxInput: null,
  maxOutput: null,
  sort: "recents",
  view: "cartes",
  compare: [],
};

type Raw = Record<string, string | string[] | undefined>;

/** Minuscules sans accents : base de la recherche et des segments d'éditeur. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(s: string): string {
  return normalizeText(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const all = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const one = (v: string | string[] | undefined): string => all(v)[0] ?? "";
const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

function many<T extends string>(
  v: string | string[] | undefined,
  allowed: readonly T[],
): T[] {
  return unique(
    all(v).filter((x): x is T => (allowed as readonly string[]).includes(x)),
  );
}
function pick<T extends string>(
  v: string | string[] | undefined,
  allowed: readonly T[],
): T | "" {
  const x = one(v);
  return (allowed as readonly string[]).includes(x) ? (x as T) : "";
}
function tier(
  v: string | string[] | undefined,
  tiers: readonly number[],
): number | null {
  const n = Number(one(v));
  return one(v) !== "" && tiers.includes(n) ? n : null;
}

export function parseQuery(raw: Raw): CatalogQuery {
  return {
    q: one(raw.q).replace(/\s+/g, " ").trim().slice(0, 80),
    kind: pick(raw.type, KINDS),
    inputs: many(raw.entree, INPUT_MODALITIES),
    tags: many(raw.etiquette, MODEL_TAGS),
    // « capacite » accepte aussi l'ancienne forme à valeur unique des anciennes adresses.
    capabilities: many(raw.capacite, CAPABILITY_FILTERS),
    author: slugify(one(raw.editeur)).slice(0, 60),
    license: pick(raw.licence, LICENSES),
    availability: pick(raw.disponibilite, AVAILABILITIES),
    residency: pick(raw.hebergement, REGIONS),
    minContext: tier(raw.contexte, CONTEXT_TIERS),
    maxInput: tier(raw["prix-entree"], PRICE_TIERS),
    maxOutput: tier(raw["prix-sortie"], PRICE_TIERS),
    sort: pick(raw.tri, SORTS) || DEFAULT_QUERY.sort,
    view: pick(raw.vue, VIEWS) || DEFAULT_QUERY.view,
    compare: parseCompareIds(raw.m),
  };
}

/** Identifiants valides, sans doublon, au plus `MAX_COMPARE`. */
export function parseCompareIds(v: string | string[] | undefined): string[] {
  return unique(all(v).filter((id) => MODEL_ID.test(id))).slice(0, MAX_COMPARE);
}

/** Paramètres d'adresse d'une requête : seulement ce qui s'écarte du défaut, dans un ordre stable. */
export function queryParams(query: CatalogQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  if (query.kind) p.set("type", query.kind);
  for (const v of query.inputs) p.append("entree", v);
  for (const v of query.tags) p.append("etiquette", v);
  for (const v of query.capabilities) p.append("capacite", v);
  if (query.author) p.set("editeur", query.author);
  if (query.license) p.set("licence", query.license);
  if (query.availability) p.set("disponibilite", query.availability);
  if (query.residency) p.set("hebergement", query.residency);
  if (query.minContext !== null) p.set("contexte", String(query.minContext));
  if (query.maxInput !== null) p.set("prix-entree", String(query.maxInput));
  if (query.maxOutput !== null) p.set("prix-sortie", String(query.maxOutput));
  if (query.sort !== DEFAULT_QUERY.sort) p.set("tri", query.sort);
  if (query.view !== DEFAULT_QUERY.view) p.set("vue", query.view);
  for (const id of query.compare) p.append("m", id);
  return p;
}

/** `base?…` (ou `base` seul), avec un correctif éventuel appliqué à une copie de la requête. */
export function queryHref(
  base: string,
  query: CatalogQuery,
  patch: Partial<CatalogQuery> = {},
): string {
  const s = queryParams({ ...query, ...patch }).toString();
  return s ? `${base}?${s}` : base;
}

/** Adresse du comparateur pour une sélection : `base?m=…&m=…` (seulement les modèles, aucun filtre). */
export function compareHref(base: string, ids: readonly string[]): string {
  return queryHref(base, { ...DEFAULT_QUERY, compare: [...ids] });
}

/** Nouvelle sélection à comparer : l'identifiant est retiré s'il y est, ajouté sinon (sans dépasser le maximum). */
export function toggleCompare(query: CatalogQuery, id: string): string[] {
  if (query.compare.includes(id)) return query.compare.filter((x) => x !== id);
  return query.compare.length >= MAX_COMPARE
    ? query.compare
    : [...query.compare, id];
}

// ---------------------------------------------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------------------------------------------
/** Ancre d'une carte ou d'une ligne : un lien « Comparer » y ramène la personne après le rechargement. */
export const modelAnchor = (id: string): string => `m-${slugify(id)}`;

export const authorSlug = (m: PublicModel): string =>
  m.sheet.author ? slugify(m.sheet.author) : "";

const haystack = (m: PublicModel) =>
  normalizeText(
    [m.name, m.sheet.author, m.sheet.family, m.id].filter(Boolean).join(" "),
  );

function matches(m: PublicModel, q: CatalogQuery): boolean {
  if (q.q) {
    const text = haystack(m);
    if (
      !normalizeText(q.q)
        .split(" ")
        .every((w) => text.includes(w))
    )
      return false;
  }
  if (q.kind && m.kind !== q.kind) return false;
  const inputs = m.sheet.modalities?.input ?? [];
  if (!q.inputs.every((x) => inputs.includes(x))) return false;
  const tags = m.sheet.tags ?? [];
  if (!q.tags.every((x) => tags.includes(x))) return false;
  if (!q.capabilities.every((c) => m.capabilities[c] === true)) return false;
  if (q.author && authorSlug(m) !== q.author) return false;
  if (q.license) {
    const open = m.sheet.license?.openWeights;
    if (open === undefined) return false;
    if ((q.license === "ouverte") !== open) return false;
  }
  if (
    q.availability &&
    (q.availability === "apercu") !== (m.availability === "preview")
  )
    return false;
  if (q.residency && m.residency !== q.residency) return false;
  if (q.minContext !== null && m.contextMax < q.minContext) return false;
  if (q.maxInput !== null && Number(m.inputPerMillion) > q.maxInput)
    return false;
  if (q.maxOutput !== null) {
    // Un modèle d'embeddings n'a pas de prix de sortie : un plafond de sortie ne le retient pas.
    if (m.kind !== "chat" || Number(m.outputPerMillion) > q.maxOutput)
      return false;
  }
  return true;
}

const byName = (locale: string) => (a: PublicModel, b: PublicModel) =>
  a.name.localeCompare(b.name, locale);

function comparator(sort: ModelSort, locale: string) {
  const name = byName(locale);
  const priced =
    (price: (m: PublicModel) => number | null, dir: 1 | -1) =>
    (a: PublicModel, b: PublicModel) => {
      const pa = price(a);
      const pb = price(b);
      if (pa === null || pb === null) {
        if (pa === pb) return name(a, b);
        return pa === null ? 1 : -1;
      }
      return (pa - pb) * dir || name(a, b);
    };
  const input = (m: PublicModel) => Number(m.inputPerMillion);
  const output = (m: PublicModel) =>
    m.kind === "chat" ? Number(m.outputPerMillion) : null;
  switch (sort) {
    case "prix-entree":
      return priced(input, 1);
    case "prix-entree-desc":
      return priced(input, -1);
    case "prix-sortie":
      return priced(output, 1);
    case "prix-sortie-desc":
      return priced(output, -1);
    case "contexte":
      return (a: PublicModel, b: PublicModel) =>
        b.contextMax - a.contextMax || name(a, b);
    case "nom":
      return name;
    default:
      return (a: PublicModel, b: PublicModel) => {
        const da = a.sheet.releasedAt ?? "";
        const db = b.sheet.releasedAt ?? "";
        if (da === db) return name(a, b);
        if (!da || !db) return da ? -1 : 1;
        return da < db ? 1 : -1;
      };
  }
}

/** Modèles retenus par la requête, triés (la liste d'origine n'est pas modifiée). */
export function applyQuery(
  models: readonly PublicModel[],
  query: CatalogQuery,
  locale = "fr-CA",
): PublicModel[] {
  return models
    .filter((m) => matches(m, query))
    .sort(comparator(query.sort, locale));
}

// ---------------------------------------------------------------------------------------------------------------
// Facettes (options proposées) et filtres actifs
// ---------------------------------------------------------------------------------------------------------------
export interface CatalogFacets {
  authors: { slug: string; label: string; count: number }[];
  tags: Record<ModelTag, number>;
  inputs: Record<Modality, number>;
  residencies: Region[];
  preview: number;
  live: number;
}

export function catalogFacets(
  models: readonly PublicModel[],
  locale = "fr-CA",
): CatalogFacets {
  const authors = new Map<
    string,
    { slug: string; label: string; count: number }
  >();
  const tags = Object.fromEntries(MODEL_TAGS.map((t) => [t, 0])) as Record<
    ModelTag,
    number
  >;
  const inputs = Object.fromEntries(MODALITIES.map((t) => [t, 0])) as Record<
    Modality,
    number
  >;
  const residencies = new Set<Region>();
  let preview = 0;
  for (const m of models) {
    const slug = authorSlug(m);
    if (slug && m.sheet.author) {
      const a = authors.get(slug) ?? { slug, label: m.sheet.author, count: 0 };
      a.count += 1;
      authors.set(slug, a);
    }
    for (const t of m.sheet.tags ?? []) tags[t] += 1;
    for (const i of m.sheet.modalities?.input ?? []) inputs[i] += 1;
    residencies.add(m.residency);
    if (m.availability === "preview") preview += 1;
  }
  return {
    authors: [...authors.values()].sort((a, b) =>
      a.label.localeCompare(b.label, locale),
    ),
    tags,
    inputs,
    residencies: REGIONS.filter((r) => residencies.has(r)),
    preview,
    live: models.length - preview,
  };
}

export interface ActiveFilter {
  /** Clé stable : champ, ou « champ:valeur » pour les filtres à valeurs multiples. */
  key: string;
  field: keyof CatalogQuery;
  value: string;
  /** Correctif à appliquer à la requête pour retirer ce filtre. */
  remove: Partial<CatalogQuery>;
}

export function activeFilters(query: CatalogQuery): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  const single = (field: keyof CatalogQuery, value: string, empty: unknown) =>
    out.push({ key: field, field, value, remove: { [field]: empty } });
  const multi = <T extends string>(
    field: "inputs" | "tags" | "capabilities",
    values: readonly T[],
  ) => {
    for (const v of values)
      out.push({
        key: `${field}:${v}`,
        field,
        value: v,
        remove: { [field]: values.filter((x) => x !== v) },
      });
  };
  if (query.q) single("q", query.q, "");
  if (query.kind) single("kind", query.kind, "");
  multi("inputs", query.inputs);
  multi("tags", query.tags);
  multi("capabilities", query.capabilities);
  if (query.author) single("author", query.author, "");
  if (query.license) single("license", query.license, "");
  if (query.availability) single("availability", query.availability, "");
  if (query.residency) single("residency", query.residency, "");
  if (query.minContext !== null)
    single("minContext", String(query.minContext), null);
  if (query.maxInput !== null) single("maxInput", String(query.maxInput), null);
  if (query.maxOutput !== null)
    single("maxOutput", String(query.maxOutput), null);
  return out;
}
