// Contenu éditorial (S2) : lecture des fichiers JSON de pages, validation contre le schéma Directus réel,
// calcul du delta d'une version. Logique pure (aucun appel réseau) : testée dans content.test.ts.
//
// Format d'un fichier de page `cms/content/pages/<page>.<langue>.json` :
//   { page, locale, status, noindex, seo: {slug,title,seo_title,seo_description,canonical},
//     blocks: [{ collection, role, claims, fields, translation }] }
// `role` et `claims` sont des métadonnées éditoriales (jamais envoyées à Directus) ; `fields` porte les champs
// non traduits du bloc, `translation` les champs traduits de la langue du fichier.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCK_TYPES, buildSchema } from "./schema";

export type Locale = "fr-CA" | "en-CA";
export const LOCALES: readonly Locale[] = ["fr-CA", "en-CA"];

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };
export type Fields = Record<string, Json>;

export type BlockFile = {
  collection: string;
  role?: string;
  claims?: string[];
  fields?: Fields;
  translation: Fields;
};

export type PageFile = {
  page: string;
  locale: Locale;
  status: string;
  noindex?: boolean;
  seo: {
    slug: string;
    title: string;
    seo_title: string;
    seo_description: string;
    canonical?: string | null;
  };
  blocks: BlockFile[];
};

/** Page prête à charger : les deux langues fusionnées. */
export type DesiredBlock = {
  collection: string;
  fields: Fields;
  translations: Record<string, Fields>;
};
export type DesiredPage = {
  key: string;
  status: string;
  noindex: boolean;
  translations: Record<string, Fields>;
  blocks: DesiredBlock[];
};

export type ClaimFile = {
  id: string;
  kind: string;
  statement: string;
  scope: string;
  evidence: string;
  evidence_url?: string | null;
  source_version: string;
  approval_status: string;
  valid_from: string;
  valid_until?: string | null;
};

export type RetiredClaim = {
  id: string;
  formulation: string;
  raison: string;
  remplacement: string;
};

export type ClaimsFile = {
  version: number;
  date: string;
  note: string;
  claims: ClaimFile[];
  retirees: RetiredClaim[];
};

// ---------- champs gérés, tirés du schéma réel ----------

const NON_CONTENT = new Set([
  "id",
  "translations",
  "date_created",
  "date_updated",
  "user_created",
  "user_updated",
]);

/**
 * `defaults` : valeur par défaut du schéma de certains champs (ex. `visual` = « aucun »). Directus la pose à la création
 * d'un bloc dont le fichier n'a pas le champ ; sans cela, la relance verrait un écart et republierait pour rien.
 */
export type ManagedFields = Record<
  string,
  { base: string[]; tr: string[]; defaults?: Record<string, Json> }
>;

/** Champs de contenu de chaque type de bloc (hors clés techniques), d'après `buildSchema()`. */
export function managedFields(): ManagedFields {
  const { collections } = buildSchema();
  const out: ManagedFields = {};
  for (const b of BLOCK_TYPES) {
    const base = collections.find((c) => c.collection === b);
    const tr = collections.find((c) => c.collection === `${b}_translations`);
    if (!base || !tr) throw new Error(`schéma : bloc « ${b} » introuvable`);
    const defaults: Record<string, Json> = {};
    for (const f of [...base.fields, ...tr.fields]) {
      const d = f.schema?.default_value;
      if (d !== undefined && d !== null && !NON_CONTENT.has(f.field))
        defaults[f.field] = d as Json;
    }
    out[b] = {
      defaults,
      base: base.fields.map((f) => f.field).filter((f) => !NON_CONTENT.has(f)),
      tr: tr.fields
        .map((f) => f.field)
        .filter((f) => !NON_CONTENT.has(f) && f !== `${b}_id`)
        .filter((f) => f !== "languages_code"),
    };
  }
  return out;
}

export const PAGE_TR_FIELDS = [
  "slug",
  "title",
  "seo_title",
  "seo_description",
  "canonical",
] as const;

// ---------- lecture ----------

export function readPageFile(path: string): PageFile {
  return JSON.parse(readFileSync(path, "utf8")) as PageFile;
}

export function readPagePair(dir: string, page: string) {
  return {
    "fr-CA": readPageFile(join(dir, `${page}.fr-CA.json`)),
    "en-CA": readPageFile(join(dir, `${page}.en-CA.json`)),
  } as Record<Locale, PageFile>;
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Valide un fichier de page contre le schéma ; renvoie la liste des erreurs (vide si tout va bien). */
export function validatePageFile(
  f: PageFile,
  managed: ManagedFields = managedFields(),
): string[] {
  const errs: string[] = [];
  const at = (m: string) => errs.push(`${f.page}.${f.locale} : ${m}`);
  if (!LOCALES.includes(f.locale)) at(`langue inconnue « ${f.locale} »`);
  for (const k of PAGE_TR_FIELDS)
    if (k !== "canonical" && typeof f.seo?.[k] !== "string")
      at(`seo.${k} manquant`);
  if (f.seo && typeof f.seo.slug === "string" && f.seo.slug.startsWith("/"))
    at("slug : sans barre oblique initiale");
  for (const [i, b] of f.blocks.entries()) {
    const where = `bloc ${i + 1} (${b.collection})`;
    const m = managed[b.collection];
    if (!m) {
      at(`${where} : type inconnu`);
      continue;
    }
    for (const k of Object.keys(b.fields ?? {}))
      if (!m.base.includes(k)) at(`${where} : champ « ${k} » absent du schéma`);
    for (const k of Object.keys(b.translation))
      if (!m.tr.includes(k))
        at(`${where} : champ traduit « ${k} » absent du schéma`);
  }
  return errs;
}

/** Fusionne les deux langues d'une page ; vérifie que structure et champs non traduits concordent. */
export function mergePage(pair: Record<Locale, PageFile>): DesiredPage {
  const fr = pair["fr-CA"];
  const en = pair["en-CA"];
  const errs: string[] = [];
  for (const f of [fr, en]) errs.push(...validatePageFile(f));
  if (fr.page !== en.page) errs.push("les deux fichiers n'ont pas le même nom");
  if (fr.status !== en.status) errs.push("statut différent entre les langues");
  if (Boolean(fr.noindex) !== Boolean(en.noindex))
    errs.push("noindex différent entre les langues");
  if (fr.blocks.length !== en.blocks.length)
    errs.push(
      `nombre de blocs différent (${fr.blocks.length} fr-CA, ${en.blocks.length} en-CA)`,
    );
  fr.blocks.forEach((b, i) => {
    const o = en.blocks[i];
    if (!o) return;
    if (b.collection !== o.collection)
      errs.push(
        `bloc ${i + 1} : type différent (${b.collection}/${o.collection})`,
      );
    if (!same(b.fields ?? {}, o.fields ?? {}))
      errs.push(
        `bloc ${i + 1} : champs non traduits différents entre les langues`,
      );
  });
  if (errs.length)
    throw new Error(`Contenu invalide :\n- ${errs.join("\n- ")}`);
  return {
    key: fr.page,
    status: fr.status,
    noindex: Boolean(fr.noindex),
    translations: {
      "fr-CA": pageTr(fr),
      "en-CA": pageTr(en),
    },
    blocks: fr.blocks.map((b, i) => ({
      collection: b.collection,
      fields: b.fields ?? {},
      translations: {
        "fr-CA": b.translation,
        "en-CA": (en.blocks[i] as BlockFile).translation,
      },
    })),
  };
}

function pageTr(f: PageFile): Fields {
  return {
    slug: f.seo.slug,
    title: f.seo.title,
    seo_title: f.seo.seo_title,
    seo_description: f.seo.seo_description,
    canonical: f.seo.canonical ?? null,
  };
}

// ---------- comparaison ----------

/** JSON canonique (clés triées) ; ignore les estampilles `_user` et `_date` comme la garde de publication. */
export function canonical(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(x as object).sort()) {
        if (k === "_user" || k === "_date") continue;
        o[k] = walk((x as Record<string, unknown>)[k]);
      }
      return o;
    }
    return x === undefined ? null : x;
  };
  return JSON.stringify(walk(v));
}

// ---------- état courant (lu dans Directus) ----------

export type CurrentTranslation = {
  id: number | string;
  languages_code: string;
} & Fields;
export type CurrentBlock = {
  id: number; // ligne de jonction pages_blocks
  sort: number | null;
  collection: string;
  item: ({ id: string; translations?: CurrentTranslation[] } & Fields) | null;
};
export type CurrentPage = {
  id: string;
  status: string;
  noindex?: boolean | null;
  translations: CurrentTranslation[];
  blocks: CurrentBlock[];
};

type Rel = { create: Fields[]; update: Fields[]; delete: (string | number)[] };
export type Delta = {
  status?: string;
  noindex?: boolean;
  translations?: Rel;
  blocks?: Rel;
};

const norm = (v: unknown): Json => (v === undefined ? null : (v as Json));
const diffFields = (
  cur: Record<string, unknown>,
  want: Fields,
  managed: string[],
  defaults: Record<string, Json> = {},
): Fields => {
  const out: Fields = {};
  for (const k of managed) {
    const w = norm(want[k]);
    if (!same(norm(cur[k]), w)) {
      // champ absent du fichier et resté à la valeur par défaut posée par Directus : rien à changer
      if (
        want[k] === undefined &&
        k in defaults &&
        same(norm(cur[k]), defaults[k])
      )
        continue;
      out[k] = w;
    }
  }
  return out;
};

/**
 * Delta (corps de `POST /versions/:id/save`) qui amène la page courante à l'état voulu.
 * Chaque bloc est comparé à celui de même rang et de même type ; sinon l'ancien est détaché et le nouveau créé.
 * `null` : rien à changer.
 */
export function buildDelta(
  cur: CurrentPage,
  want: DesiredPage,
  managed: ManagedFields = managedFields(),
): { delta: Delta | null; summary: string } {
  const delta: Delta = {};
  const stats = { tr: 0, created: 0, updated: 0, deleted: 0 };

  if (cur.status !== want.status) delta.status = want.status;
  if (Boolean(cur.noindex) !== want.noindex) delta.noindex = want.noindex;

  // traductions de la page
  const tr: Rel = { create: [], update: [], delete: [] };
  for (const [code, fields] of Object.entries(want.translations)) {
    const c = cur.translations.find((t) => t.languages_code === code);
    if (!c) {
      tr.create.push({ languages_code: code, ...fields });
      stats.tr++;
      continue;
    }
    const d = diffFields(c, fields, [...PAGE_TR_FIELDS]);
    if (Object.keys(d).length) {
      tr.update.push({ id: c.id as number, ...d });
      stats.tr++;
    }
  }
  if (tr.create.length || tr.update.length) delta.translations = tr;

  // blocs
  const blocks: Rel = { create: [], update: [], delete: [] };
  const curBlocks = [...cur.blocks].sort(
    (a, b) => (a.sort ?? 1e9) - (b.sort ?? 1e9) || a.id - b.id,
  );
  const n = Math.max(curBlocks.length, want.blocks.length);
  for (let i = 0; i < n; i++) {
    const c = curBlocks[i];
    const w = want.blocks[i];
    const sort = i + 1;
    if (!w) {
      if (c) {
        blocks.delete.push(c.id);
        stats.deleted++;
      }
      continue;
    }
    const m = managed[w.collection];
    if (!m) throw new Error(`type de bloc inconnu : ${w.collection}`);
    if (!c || c.collection !== w.collection || !c.item) {
      if (c) {
        blocks.delete.push(c.id);
        stats.deleted++;
      }
      blocks.create.push({
        collection: w.collection,
        sort,
        item: {
          ...w.fields,
          translations: {
            create: Object.entries(w.translations).map(([code, f]) => ({
              languages_code: code,
              ...f,
            })),
            update: [],
            delete: [],
          },
        },
      });
      stats.created++;
      continue;
    }
    const itemChanges = diffFields(c.item, w.fields, m.base, m.defaults);
    const trRel: Rel = { create: [], update: [], delete: [] };
    for (const [code, f] of Object.entries(w.translations)) {
      const ct = (c.item.translations ?? []).find(
        (t) => t.languages_code === code,
      );
      if (!ct) trRel.create.push({ languages_code: code, ...f });
      else {
        const d = diffFields(ct, f, m.tr, m.defaults);
        if (Object.keys(d).length)
          trRel.update.push({ id: ct.id as number, ...d });
      }
    }
    const sortChanged = c.sort !== sort;
    if (
      Object.keys(itemChanges).length ||
      trRel.create.length ||
      trRel.update.length ||
      sortChanged
    ) {
      blocks.update.push({
        id: c.id,
        collection: w.collection,
        ...(sortChanged ? { sort } : {}),
        item: {
          id: c.item.id,
          ...itemChanges,
          ...(trRel.create.length || trRel.update.length
            ? { translations: trRel }
            : {}),
        },
      });
      stats.updated++;
    }
  }
  if (blocks.create.length || blocks.update.length || blocks.delete.length)
    delta.blocks = blocks;

  const empty = Object.keys(delta).length === 0;
  return {
    delta: empty ? null : delta,
    summary: empty
      ? "aucun changement"
      : `${stats.tr} traduction(s) de page, blocs : ${stats.created} créé(s), ${stats.updated} modifié(s), ${stats.deleted} détaché(s)`,
  };
}

// ---------- registre des affirmations ----------

/** UUID déterministe (forme v5) tiré d'un code d'affirmation : permet de recharger sans doublon. */
export async function claimUuid(code: string): Promise<string> {
  const data = new TextEncoder().encode(`nexora-claim:${code}`);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-1", data)).slice(
    0,
    16,
  );
  h[6] = ((h[6] as number) & 0x0f) | 0x50;
  h[8] = ((h[8] as number) & 0x3f) | 0x80;
  const x = Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
