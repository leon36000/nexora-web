// Garde de publication (D6).
//
// 1. `items.promote` (filtre, toutes collections) : aucune promotion de version sans approbation « approuvée » qui porte
//    sur le hash exact de la version. Une approbation dont le hash ne correspond plus devient « périmée ».
// 2. Écriture directe sur un élément publié (pages, blocs, traductions) : refusée aux rôles non administrateurs, sauf
//    pendant une promotion acceptée, et seulement sur les pages promues (billet de promotion lié à l'élément).
// 3. Approbations : hash calculé par le serveur, états contrôlés (voir core.ts).
// 4. Après une promotion acceptée : revalidation de Next.js (échec non bloquant).
//
// La logique pure est dans core.ts (testée) ; ce fichier relie Directus à cette logique.

import { createError } from "@directus/errors";
import { defineHook } from "@directus/extensions-sdk";
import { BLOCK_TYPES, PAGE_TREE, SITE_REVALIDATE } from "./constants";
import {
  evaluatePromotion,
  type Failure,
  PromotionTickets,
  prepareApprovalCreate,
  prepareApprovalUpdate,
  STATUS,
  slugKey,
  type VersionRow,
  versionHash,
  writeVerdict,
} from "./core";
import { revalidate, revalidateConfigProblem } from "./revalidate";

/** Ligne ou charge utile d'une collection Directus : les champs sont lus au cas par cas. */
type Row = Record<string, unknown>;

/** Sous-ensemble du contexte d'événement utilisé ici (l'accountability peut être absente côté système). */
type EventCtx =
  | { accountability?: { user?: string | null; admin?: boolean } | null }
  | undefined;

/** Lit les champs d'une valeur quelconque ; une valeur qui n'est pas un objet donne un objet vide. */
const rowOf = (v: unknown): Row =>
  v !== null && typeof v === "object" ? (v as Row) : {};

const parse = (raw: unknown) => {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw ?? null;
};

export default defineHook(
  ({ filter, action }, { database: db, services, getSchema, logger, env }) => {
    // Configuration vue au démarrage plutôt qu'à la première publication.
    const configProblem = revalidateConfigProblem(env);
    if (configProblem) logger.warn(`[nexora-guard] ${configProblem}`);

    const tickets = new PromotionTickets();
    const approvalForVersion = new Map<string, string>();
    const lastSent = new Map<string, number>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const fail = (f: Failure, status = 403) => {
      const E = createError(f.code, f.message, status);
      return new E();
    };

    const isAdmin = (ctx: EventCtx) =>
      !ctx?.accountability || ctx.accountability.admin === true;

    /** Écrit sur `approvals` sans repasser par les hooks, avec journal d'activité (utilisateur nul = système). */
    async function updateApprovals(ids: string[], data: Row) {
      if (ids.length === 0) return;
      const approvals = new services.ItemsService("approvals", {
        schema: await getSchema(),
        knex: db,
      });
      await approvals.updateMany(ids, data, { emitEvents: false });
    }

    async function readVersionRow(id: string): Promise<VersionRow | null> {
      const row = await db("directus_versions").where({ id }).first();
      return row
        ? {
            id: row.id,
            key: row.key,
            collection: row.collection,
            item: row.item ?? null,
            delta: parse(row.delta),
          }
        : null;
    }

    async function findVersion(p: Row): Promise<VersionRow | null> {
      if (p.version_id) return readVersionRow(String(p.version_id));
      if (p.collection && p.version_key) {
        const row = await db("directus_versions")
          .where({ collection: p.collection, key: p.version_key })
          .modify((q) =>
            p.item ? q.where("item", String(p.item)) : q.whereNull("item"),
          )
          .first();
        return row
          ? {
              id: row.id,
              key: row.key,
              collection: row.collection,
              item: row.item ?? null,
              delta: parse(row.delta),
            }
          : null;
      }
      return null;
    }

    // ---------- 1. promotion ----------

    filter("items.promote", async (payload, meta, ctx) => {
      const { collection, item, version } = meta;
      const hash = versionHash(collection, item, payload);
      const rows = await db("approvals")
        .where((q) =>
          q.where("version_id", String(version)).orWhere("version_hash", hash),
        )
        .select("id", "status", "version_hash", "applied_at");
      const decision = evaluatePromotion(hash, rows);
      if (!decision.allow) {
        // une approbation qui ne porte plus sur la version courante devient périmée, même si la promotion échoue
        await updateApprovals(decision.staleIds, {
          status: STATUS.stale,
        }).catch((e: unknown) =>
          logger.warn(
            `[nexora-guard] marquage « périmée » impossible : ${e instanceof Error ? e.name : "erreur"}`,
          ),
        );
        logger.warn(
          `[nexora-guard] promotion refusée (${decision.code}) pour ${collection}/${item ?? "nouveau"}`,
        );
        throw fail(decision);
      }
      approvalForVersion.set(String(version), decision.approvalId);
      const user = ctx?.accountability?.user;
      if (user)
        tickets.issue(user, collection, item === undefined ? null : item);
      return payload;
    });

    action("items.promote", async (meta, ctx) => {
      const { collection, item, version } = meta;
      const user = ctx?.accountability?.user;
      if (user) tickets.release(user, collection, null);
      if (user)
        tickets.release(
          user,
          collection,
          item === undefined || item === null ? null : String(item),
        );
      const approvalId = approvalForVersion.get(String(version));
      approvalForVersion.delete(String(version));
      if (approvalId) {
        await updateApprovals([approvalId], {
          applied_at: new Date().toISOString(),
          item: item === undefined || item === null ? null : String(item),
        }).catch((e: unknown) =>
          logger.warn(
            `[nexora-guard] approbation non marquée comme appliquée : ${e instanceof Error ? e.name : "erreur"}`,
          ),
        );
      }
      await sendRevalidation(collection, String(item));
    });

    // ---------- 2. écriture directe sur un élément publié ----------

    const baseOf = (c: string) => c.replace(/_translations$/, "");

    /** Pages racines touchées par une écriture sur la collection `c` (clés existantes ou données à créer). */
    async function rootPageIds(
      c: string,
      keys: (string | number)[],
    ): Promise<string[]> {
      if (keys.length === 0) return [];
      const k = keys.map(String);
      if (c === "pages") return k;
      if (c === "pages_translations" || c === "pages_blocks")
        return db(c).whereIn("id", k).pluck("pages_id");
      if ((BLOCK_TYPES as readonly string[]).includes(c))
        return db("pages_blocks")
          .where("collection", c)
          .whereIn("item", k)
          .pluck("pages_id");
      if (
        c.endsWith("_translations") &&
        (BLOCK_TYPES as readonly string[]).includes(baseOf(c))
      ) {
        const blockIds: string[] = await db(c)
          .whereIn("id", k)
          .pluck(`${baseOf(c)}_id`);
        return rootPageIds(baseOf(c), blockIds);
      }
      return [];
    }

    /** Vrai si l'écriture fixe `status = published` sur une page. */
    function setsPublishedStatus(
      c: string,
      action: "create" | "update" | "delete",
      payload: unknown,
    ): boolean {
      if (action === "delete" || c !== "pages") return false;
      const list: unknown[] = Array.isArray(payload) ? payload : [payload];
      return list.some((p) => rowOf(p).status === "published");
    }

    /** Pages racines (publiées ou non) qu'une écriture touche : elles désignent les billets de promotion qui la couvrent. */
    async function targetPages(
      c: string,
      action: "create" | "update" | "delete",
      payload: unknown,
      keys: (string | number)[],
    ): Promise<string[]> {
      const list: unknown[] =
        Array.isArray(payload) && action !== "delete" ? payload : [payload];
      let pageIds: string[] = [];
      if (action === "create") {
        for (const p of list) {
          if (c === "pages_translations" || c === "pages_blocks") {
            const pagesId = rowOf(p).pages_id;
            if (pagesId) pageIds.push(String(pagesId));
          } else if (c.endsWith("_translations")) {
            const parentKey = rowOf(p)[`${baseOf(c)}_id`];
            if (
              parentKey &&
              (typeof parentKey === "string" || typeof parentKey === "number")
            )
              pageIds.push(...(await rootPageIds(baseOf(c), [parentKey])));
          }
        }
      } else {
        pageIds = await rootPageIds(c, keys);
      }
      return [...new Set(pageIds.map(String))];
    }

    async function guardWrite(
      c: string,
      op: "create" | "update" | "delete",
      payload: unknown,
      keys: (string | number)[],
      ctx: EventCtx,
    ) {
      const acct = ctx?.accountability;
      const internal = !acct;
      const admin = acct?.admin === true;
      if (internal || admin) return;
      const targets = await targetPages(c, op, payload, keys);
      const touchesPublished =
        setsPublishedStatus(c, op, payload) ||
        (targets.length > 0 &&
          !!(await db("pages")
            .whereIn("id", targets)
            .where("status", "published")
            .first()));
      // Le billet de promotion est lié aux pages promues : il ne couvre jamais une autre page publiée.
      const ticket =
        !!acct?.user && tickets.covers(acct.user, "pages", targets);
      const verdict = writeVerdict({
        admin,
        internal,
        ticket,
        touchesPublished,
      });
      if (!verdict.allow) {
        logger.warn(`[nexora-guard] écriture directe refusée (${op} ${c})`);
        throw fail(verdict);
      }
    }

    for (const c of PAGE_TREE) {
      filter(`${c}.items.create`, async (payload, _meta, ctx) => {
        await guardWrite(c, "create", payload, [], ctx);
        return payload;
      });
      filter(`${c}.items.update`, async (payload, meta, ctx) => {
        await guardWrite(c, "update", payload, meta?.keys ?? [], ctx);
        return payload;
      });
      filter<(string | number)[] | string | number>(
        `${c}.items.delete`,
        async (keys, _meta, ctx) => {
          await guardWrite(
            c,
            "delete",
            null,
            Array.isArray(keys) ? keys : [keys],
            ctx,
          );
          return keys;
        },
      );
    }

    // ---------- 3. approbations ----------

    filter<Row | Row[]>(
      "approvals.items.create",
      async (payload, _meta, ctx) => {
        const one = async (p: Row) => {
          const r = prepareApprovalCreate(p, {
            admin: isAdmin(ctx),
            version: await findVersion(p),
          });
          if (r.error) throw fail(r.error, 422);
          return r.payload;
        };
        return Array.isArray(payload)
          ? Promise.all(payload.map(one))
          : one(payload);
      },
    );

    filter<Row>("approvals.items.update", async (payload, meta, ctx) => {
      let out = payload;
      for (const key of meta?.keys ?? []) {
        const existing = await db("approvals")
          .where({ id: String(key) })
          .first();
        if (!existing) continue;
        let currentHash: string | null = null;
        if (existing.version_id) {
          const v = await readVersionRow(existing.version_id);
          currentHash = v ? versionHash(v.collection, v.item, v.delta) : null;
        }
        const r = prepareApprovalUpdate(payload, existing, {
          admin: isAdmin(ctx),
          user: ctx?.accountability?.user ?? null,
          currentHash,
        });
        if (r.error) throw fail(r.error, 403);
        out = r.payload;
      }
      return out;
    });

    /** Une version qui change (enregistrement) ou disparaît rend périmées les approbations en cours qui la visaient. */
    async function markStale(versionIds: string[], deleted: boolean) {
      for (const id of versionIds) {
        const open = await db("approvals")
          .where("version_id", String(id))
          .whereNull("applied_at")
          .whereIn("status", [STATUS.pending, STATUS.approved])
          .select("id", "version_hash");
        if (open.length === 0) continue;
        let current: string | null = null;
        if (!deleted) {
          const v = await readVersionRow(String(id));
          current = v ? versionHash(v.collection, v.item, v.delta) : null;
        }
        const stale = open
          .filter((a) => deleted || a.version_hash !== current)
          .map((a) => a.id);
        await updateApprovals(stale, { status: STATUS.stale });
        if (stale.length)
          logger.info(
            `[nexora-guard] ${stale.length} approbation(s) devenue(s) périmée(s) (version ${id})`,
          );
      }
    }
    action("versions.update", async (meta) => {
      await markStale((meta?.keys ?? []).map(String), false).catch(
        (e: unknown) =>
          logger.warn(
            `[nexora-guard] péremption impossible : ${e instanceof Error ? e.name : "erreur"}`,
          ),
      );
    });
    action("versions.delete", async (meta) => {
      await markStale(
        (meta?.keys ?? meta?.payload ?? []).map(String),
        true,
      ).catch((e: unknown) =>
        logger.warn(
          `[nexora-guard] péremption impossible : ${e instanceof Error ? e.name : "erreur"}`,
        ),
      );
    });

    // ---------- slug unique par langue ----------

    async function withSlugKey(
      payload: Row,
      existing: {
        languages_code?: string;
        slug?: string | null;
        id?: unknown;
      } | null,
    ): Promise<Row> {
      const lang = payload.languages_code ?? existing?.languages_code;
      if (!lang) return payload;
      const slug = "slug" in payload ? payload.slug : existing?.slug;
      const key = slugKey(String(lang), slug as string | null | undefined);
      const dup = await db("pages_translations")
        .where("slug_key", key)
        .modify(
          (q) => existing?.id !== undefined && q.whereNot("id", existing.id),
        )
        .first();
      if (dup)
        throw fail(
          {
            code: "NEXORA_SLUG_DEJA_UTILISE",
            message: `Le slug « ${slug ?? ""} » est déjà utilisé en ${lang}.`,
          },
          422,
        );
      return { ...payload, slug_key: key };
    }
    filter<Row | Row[]>("pages_translations.items.create", async (payload) =>
      Array.isArray(payload)
        ? Promise.all(payload.map((p) => withSlugKey(p, null)))
        : withSlugKey(payload, null),
    );
    filter<Row>("pages_translations.items.update", async (payload, meta) => {
      if (!("slug" in payload) && !("languages_code" in payload))
        return payload;
      const keys = meta?.keys ?? [];
      if (keys.length !== 1)
        throw fail(
          {
            code: "NEXORA_SLUG_LOT",
            message:
              "Le slug ou la langue ne se modifie que sur une seule traduction à la fois.",
          },
          422,
        );
      const existing = await db("pages_translations")
        .where({ id: keys[0] })
        .first();
      return withSlugKey(payload, existing ?? null);
    });

    // ---------- 4. revalidation de Next.js ----------

    async function slugsOfPage(id: string): Promise<string[]> {
      const rows: { slug: string | null }[] = await db("pages_translations")
        .where("pages_id", id)
        .select("slug");
      return rows.map((r) => r.slug ?? "");
    }

    async function sendRevalidation(collection: string, id: string) {
      const key = `${collection}:${id}`;
      const slugs =
        collection === "pages" ? await slugsOfPage(id).catch(() => []) : [];
      await revalidate({ collection, id, slugs }, { env, logger });
      lastSent.set(key, Date.now());
    }

    /** Écritures directes (administrateur) : une seule revalidation par élément, groupée, sauf si une promotion vient de le faire. */
    function queueRevalidation(collection: string, id: string) {
      const key = `${collection}:${id}`;
      if (timers.has(key)) return;
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          if (Date.now() - (lastSent.get(key) ?? 0) < 3000) return;
          void sendRevalidation(collection, id);
        }, 300),
      );
    }

    async function targetsOf(
      c: string,
      keys: (string | number)[],
    ): Promise<{ collection: string; id: string }[]> {
      if ((PAGE_TREE as readonly string[]).includes(c)) {
        const ids = await rootPageIds(c, keys).catch(() => [] as string[]);
        return (c === "pages" ? keys.map(String) : ids).map((id) => ({
          collection: "pages",
          id,
        }));
      }
      for (const parent of SITE_REVALIDATE) {
        if (c === parent)
          return keys.map((id) => ({ collection: parent, id: String(id) }));
        if (c === `${parent}_translations`) {
          const ids: string[] = await db(c)
            .whereIn("id", keys.map(String))
            .pluck(`${parent}_id`)
            .catch(() => []);
          return ids.map((id) => ({ collection: parent, id: String(id) }));
        }
      }
      return [];
    }

    const watched = [
      ...PAGE_TREE,
      ...SITE_REVALIDATE,
      ...SITE_REVALIDATE.map((s) => `${s}_translations`),
    ];
    for (const c of watched) {
      action(`${c}.items.create`, async (meta) => {
        for (const t of await targetsOf(
          c,
          meta?.key !== undefined ? [meta.key] : [],
        ))
          queueRevalidation(t.collection, t.id);
      });
      action(`${c}.items.update`, async (meta) => {
        for (const t of await targetsOf(c, meta?.keys ?? []))
          queueRevalidation(t.collection, t.id);
      });
    }
  },
);
