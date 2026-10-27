import { randomUUID } from "node:crypto";
import { formatFlags, lintStrings } from "./content-lint.ts";
import { type AgentDirectus, DirectusRequestError } from "./directus-client.ts";
import {
  CreateDraftInput,
  type CreateDraftInputT,
  type DraftMode,
} from "./draft-schema.ts";
import { type PageSnapshot, readPage } from "./page-reader.ts";
import {
  buildEnglishBlocks,
  extractStrings,
  untranslatedBlocks,
  validateTranslated,
} from "./translator-keys.ts";

/**
 * `create_draft` : l'outil UNIQUE par lequel un agent écrit dans Directus (D9).
 *
 *  1. le schéma zod FERMÉ valide l'entrée (un champ inconnu, un lien externe, un statut → refus) ;
 *  2. la politique de l'agent (modes et langues permis) est appliquée par le code ;
 *  3. l'écriture ne va QUE dans une version de contenu (jamais sur l'élément publié) ; une nouvelle page
 *     commence par une coquille en brouillon ; une approbation est créée sur le hash de la version ;
 *  4. aucune suppression, aucune promotion : le client Directus restreint ne sait pas les faire.
 */

export class DraftRejected extends Error {
  readonly reason: "schema" | "policy" | "slug_taken" | "page" | "directus";
  constructor(reason: DraftRejected["reason"], message: string) {
    super(message);
    this.name = "DraftRejected";
    this.reason = reason;
  }
}

export interface DraftPolicy {
  agent: string;
  modes: readonly DraftMode[];
}

export const DRAFT_POLICIES = {
  redacteur: { agent: "redacteur", modes: ["new_page"] },
  traducteur: { agent: "traducteur", modes: ["update_translation"] },
  seo: { agent: "seo", modes: ["update_seo"] },
} as const satisfies Record<string, DraftPolicy>;

export interface DraftResult {
  mode: DraftMode;
  pageId: string;
  versionId: string;
  versionKey: string;
  approvalId: string;
  title: string;
  flags: number;
  notes: string[];
}

type Json = Record<string, unknown>;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function createDraftTool(options: {
  policy: DraftPolicy;
  directus: AgentDirectus;
  runId: string;
}) {
  const { policy, directus, runId } = options;
  const versionKey = `agent-${policy.agent}-${runId.slice(0, 8)}`;
  const by = `Brouillon de l'agent « ${policy.agent} » (exécution ${runId.slice(0, 8)}). Rien n'est publié : relire, puis approuver ou refuser.`;

  async function execute(raw: unknown): Promise<DraftResult> {
    const parsed = CreateDraftInput.safeParse(raw);
    if (!parsed.success)
      throw new DraftRejected(
        "schema",
        // Chemins seulement : un message de zod peut recopier la valeur reçue.
        `entrée refusée par le schéma (${parsed.error.issues
          .slice(0, 6)
          .map((i) => i.path.join(".") || "racine")
          .join(", ")})`,
      );
    const input = parsed.data;
    if (!policy.modes.includes(input.mode))
      throw new DraftRejected(
        "policy",
        `l'agent « ${policy.agent} » n'a pas le droit du mode « ${input.mode} »`,
      );
    try {
      switch (input.mode) {
        case "new_page":
          return await newPage(input);
        case "update_translation":
          return await updateTranslation(input);
        case "update_seo":
          return await updateSeo(input);
      }
    } catch (e) {
      if (e instanceof DirectusRequestError)
        throw new DraftRejected("directus", e.message);
      throw e;
    }
  }

  async function finish(
    input: CreateDraftInputT,
    pageId: string,
    delta: Json,
    title: string,
    notes: string[],
    lintTarget: unknown,
  ): Promise<DraftResult> {
    const version = await directus.post<{ id: string }>("/versions", {
      key: versionKey,
      name: `${title} (${policy.agent})`.slice(0, 100),
      collection: "pages",
      item: pageId,
    });
    await directus.post(`/versions/${version.id}/save`, delta);
    const flags = lintStrings(lintTarget);
    // Les agents n'ont pas le droit de LIRE les approbations (même celle qu'ils viennent de créer : Directus répond
    // alors sans corps) : l'identifiant est donc fourni par nous, ce qui permet d'en garder la référence.
    const approvalId = randomUUID();
    await directus.post("/items/approvals", {
      id: approvalId,
      version_id: version.id,
      kind: input.approvalKind,
      summary:
        `${input.summary}\n\n${by}${notes.length ? `\n${notes.join("\n")}` : ""}${formatFlags(flags)}`.slice(
          0,
          4000,
        ),
    });
    return {
      mode: input.mode,
      pageId,
      versionId: version.id,
      versionKey,
      approvalId,
      title,
      flags: flags.length,
      notes,
    };
  }

  /* ---------------------------- nouvelle page ----------------------------- */

  async function newPage(
    input: Extract<CreateDraftInputT, { mode: "new_page" }>,
  ): Promise<DraftResult> {
    const taken = await directus.get<{ id: number }[]>(
      `/items/pages_translations?filter=${encodeURIComponent(
        JSON.stringify({
          _and: [
            { languages_code: { _eq: "fr-CA" } },
            { slug: { _eq: input.page.slug } },
          ],
        }),
      )}&fields=id&limit=1`,
    );
    if (taken?.length)
      throw new DraftRejected("slug_taken", "ce slug est déjà utilisé");

    // Coquille en brouillon : invisible du public (le site filtre status = published).
    const shell = await directus.post<{ id: string }>(
      "/items/pages?fields=id",
      {
        status: "draft",
        noindex: false,
        translations: [
          {
            languages_code: "fr-CA",
            slug: input.page.slug,
            title: input.page.title,
            seo_title: input.page.seo_title,
            seo_description: input.page.seo_description,
          },
        ],
      },
    );
    const blocks = input.blocks.map((b, i) => ({
      collection: b.collection,
      sort: i + 1,
      item: {
        ...blockFields(b),
        translations: {
          create: [{ languages_code: "fr-CA", ...blockTranslation(b) }],
          update: [],
          delete: [],
        },
      },
    }));
    // L'intention de publication est dans la version : seule la promotion (approbation sur ce hash) l'applique.
    const delta = {
      status: "published",
      blocks: { create: blocks, update: [], delete: [] },
    };
    return finish(input, shell.id, delta, input.page.title, [], {
      page: input.page,
      blocks: input.blocks,
    });
  }

  /* ---------------------------- traduction en-CA --------------------------- */

  async function updateTranslation(
    input: Extract<CreateDraftInputT, { mode: "update_translation" }>,
  ): Promise<DraftResult> {
    const page = await loadPage(input.pageId);
    const source = extractStrings(page);
    const { title, seo_title, seo_description } = input.page;
    const strings: Record<string, string> = {
      ...input.strings,
      "p.title": title,
      "p.seo_title": seo_title,
      "p.seo_description": seo_description,
    };
    try {
      validateTranslated(source, strings);
    } catch (e) {
      throw new DraftRejected(
        "schema",
        e instanceof Error ? e.message : "traduction invalide",
      );
    }
    const english = buildEnglishBlocks(page, strings);
    const existing = page.translations.find(
      (t) => t.languages_code === "en-CA",
    );
    if (!existing) {
      const taken = await directus.get<{ id: number }[]>(
        `/items/pages_translations?filter=${encodeURIComponent(
          JSON.stringify({
            _and: [
              { languages_code: { _eq: "en-CA" } },
              { slug: { _eq: input.page.slug } },
            ],
          }),
        )}&fields=id&limit=1`,
      );
      if (taken?.length)
        throw new DraftRejected("slug_taken", "ce slug en-CA est déjà utilisé");
    }
    const pageFields = {
      slug: input.page.slug,
      title,
      seo_title,
      seo_description,
    };
    const delta: Json = {
      translations: existing
        ? {
            create: [],
            update: [{ id: existing.id, ...pageFields }],
            delete: [],
          }
        : {
            create: [{ languages_code: "en-CA", ...pageFields }],
            update: [],
            delete: [],
          },
      blocks: {
        create: [],
        update: english.map((b) => ({
          id: b.junctionId,
          collection: b.collection,
          item: {
            id: b.itemId,
            translations: b.existingTranslationId
              ? {
                  create: [],
                  update: [{ id: b.existingTranslationId, ...b.translation }],
                  delete: [],
                }
              : {
                  create: [{ languages_code: "en-CA", ...b.translation }],
                  update: [],
                  delete: [],
                },
          },
        })),
        delete: [],
      },
    };
    const skipped = untranslatedBlocks(page);
    const notes = [
      `Traduction fr-CA vers en-CA de la page ${page.id} : ${english.length} bloc(s) traduit(s).`,
      ...(skipped.length
        ? [
            `Non traduits (décision humaine, jamais par un agent) : ${skipped.join(", ")}.`,
          ]
        : []),
      ...(page.status !== "published"
        ? ["Attention : la page française n'est pas encore publiée."]
        : []),
    ];
    return finish(input, page.id, delta, title, notes, strings);
  }

  /* ------------------------------- SEO on-page ----------------------------- */

  async function updateSeo(
    input: Extract<CreateDraftInputT, { mode: "update_seo" }>,
  ): Promise<DraftResult> {
    const page = await loadPage(input.pageId);
    const tr = page.translations.find(
      (t) => t.languages_code === input.language,
    );
    if (!tr)
      throw new DraftRejected("page", "cette langue n'existe pas pour la page");
    const update: Json = {
      id: tr.id,
      seo_title: input.seo_title,
      seo_description: input.seo_description,
    };
    const notes: string[] = [];
    if (input.slug && input.slug !== tr.slug) {
      if (page.status === "published")
        notes.push(
          `Slug proposé (NON appliqué : la page est publiée, un changement casserait les liens existants et exige une redirection décidée par un humain) : « ${input.slug} ».`,
        );
      else {
        const taken = await directus.get<{ id: number }[]>(
          `/items/pages_translations?filter=${encodeURIComponent(
            JSON.stringify({
              _and: [
                { languages_code: { _eq: input.language } },
                { slug: { _eq: input.slug } },
              ],
            }),
          )}&fields=id&limit=1`,
        );
        if (taken?.length)
          throw new DraftRejected("slug_taken", "ce slug est déjà utilisé");
        update.slug = input.slug;
      }
    }
    const delta = {
      translations: { create: [], update: [update], delete: [] },
    };
    return finish(input, page.id, delta, tr.title ?? input.seo_title, notes, {
      t: input.seo_title,
      d: input.seo_description,
    });
  }

  async function loadPage(pageId: string): Promise<PageSnapshot> {
    try {
      return await readPage(directus, pageId);
    } catch (e) {
      if (e instanceof DirectusRequestError) throw e;
      throw new DraftRejected("page", "page introuvable");
    }
  }

  return {
    name: "create_draft" as const,
    execute,
    versionKey,
  };
}

/* ---------------------- forme des blocs pour Directus --------------------- */

function blockFields(
  b: Extract<CreateDraftInputT, { mode: "new_page" }>["blocks"][number],
): Json {
  const f = { ...(b.fields ?? {}) } as Json;
  if (b.collection === "block_section") {
    f.media_position = "none";
    f.visual = "aucun";
  }
  if (b.collection === "block_cards" && f.columns === undefined)
    f.columns = "3";
  return f;
}

function blockTranslation(
  b: Extract<CreateDraftInputT, { mode: "new_page" }>["blocks"][number],
): Json {
  if (b.collection === "block_section") {
    const { body, ...rest } = b.translation;
    return {
      ...rest,
      ...(body
        ? { body: body.map((p) => `<p>${escapeHtml(p)}</p>`).join("") }
        : {}),
    };
  }
  return { ...b.translation };
}
