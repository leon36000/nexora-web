import { describe, expect, it } from "vitest";
import {
  createDraftTool,
  DRAFT_POLICIES,
  DraftRejected,
} from "./create-draft.ts";
import type { PageSnapshot } from "./page-reader.ts";
import { createFakeDirectus, validNewPage } from "./test-support.ts";

const deltaOf = <T>(v: { delta?: unknown } | undefined) =>
  (v?.delta ?? {}) as T;
const RUN = "11111111-2222-4333-8444-555555555555";
const PAGE_ID = "0b9a7f0e-6a54-4f53-9c63-5b7c0a1d2e3f";

const newPage = (extra: Record<string, unknown> = {}) => ({
  mode: "new_page",
  approvalKind: "contenu",
  ...validNewPage,
  ...extra,
});

function tool(
  policy: keyof typeof DRAFT_POLICIES,
  fake = createFakeDirectus(),
) {
  return {
    fake,
    t: createDraftTool({
      policy: DRAFT_POLICIES[policy],
      directus: fake.directus,
      runId: RUN,
    }),
  };
}

const frPage: PageSnapshot = {
  id: PAGE_ID,
  status: "published",
  noindex: false,
  translations: [
    {
      id: 7,
      languages_code: "fr-CA",
      slug: "essai",
      title: "Essai",
      seo_title: "Essai SEO",
      seo_description: "Description.",
    },
  ],
  blocks: [
    {
      id: 11,
      sort: 1,
      collection: "block_hero",
      item: {
        id: "h1",
        translations: [
          {
            id: 21,
            languages_code: "fr-CA",
            headline: "Bonjour le monde",
            subheadline: "Un sous-titre.",
            primary_label: "Contact",
            primary_href: "/contact/",
          },
        ],
      },
    },
    {
      id: 12,
      sort: 2,
      collection: "block_pricing",
      item: {
        id: "p1",
        translations: [{ id: 22, languages_code: "fr-CA", title: "Tarifs" }],
      },
    },
  ],
};

describe("create_draft : nouvelle page", () => {
  it("crée une coquille EN BROUILLON, une version, l'enregistre et demande l'approbation — rien d'autre", async () => {
    const { t, fake } = tool("redacteur");
    const r = await t.execute(newPage());
    expect(r.approvalId).toBeTruthy();
    expect(
      fake.calls.map(
        (c) =>
          `${c.method} ${c.path.split("?")[0]?.replace(/[0-9a-f-]{36}/, ":id")}`,
      ),
    ).toEqual([
      "GET /items/pages_translations",
      "POST /items/pages",
      "POST /versions",
      "POST /versions/:id/save",
      "POST /items/approvals",
    ]);
    expect(fake.shells[0]?.body.status).toBe("draft");
    // l'intention de publication est dans la version, pas dans l'élément principal
    expect(deltaOf<{ status: string }>(fake.versions[0]).status).toBe(
      "published",
    );
    expect(fake.approvals[0]?.body.kind).toBe("contenu");
    expect(String(fake.approvals[0]?.body.summary)).toContain(
      "Rien n'est publié",
    );
    expect(
      fake.calls.some((c) => ["DELETE", "PATCH", "PUT"].includes(c.method)),
    ).toBe(false);
    expect(fake.calls.some((c) => c.path.includes("promote"))).toBe(false);
  });

  it("met les paragraphes en <p> échappés (texte brut en entrée)", async () => {
    const { t, fake } = tool("redacteur");
    await t.execute(
      newPage({
        blocks: [
          { collection: "block_hero", translation: { headline: "Titre" } },
          { collection: "block_section", translation: { body: ["a & b"] } },
        ],
      }),
    );
    const delta = fake.versions[0]?.delta as {
      blocks: {
        create: { item: { translations: { create: { body?: string }[] } } }[];
      };
    };
    expect(delta.blocks.create[1]?.item.translations.create[0]?.body).toBe(
      "<p>a &amp; b</p>",
    );
  });

  it.each([
    ["un statut", { status: "published" }],
    ["un champ de suppression", { delete: true }],
    ["une publication immédiate", { publish_now: true }],
    ["un mode inconnu", { mode: "delete_page" }],
  ])("refuse %s dans l'entrée", async (_n, extra) => {
    const { t, fake } = tool("redacteur");
    await expect(t.execute(newPage(extra))).rejects.toBeInstanceOf(
      DraftRejected,
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("refuse un lien externe, du HTML, un bloc de tarifs, un slug réservé et une collection hors liste", async () => {
    const bad = [
      {
        collection: "block_cta",
        translation: {
          title: "x",
          primary_label: "y",
          primary_href: "https://evil.example/x",
        },
      },
      {
        collection: "block_cta",
        translation: { title: "<script>alert(1)</script>" },
      },
      { collection: "block_pricing", translation: { title: "Tarifs" } },
      { collection: "directus_users", translation: { title: "x" } },
    ];
    for (const block of bad) {
      const { t, fake } = tool("redacteur");
      await expect(
        t.execute(
          newPage({
            blocks: [
              { collection: "block_hero", translation: { headline: "H" } },
              block,
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(DraftRejected);
      expect(fake.calls).toHaveLength(0);
    }
    const { t } = tool("redacteur");
    await expect(
      t.execute(newPage({ page: { ...validNewPage.page, slug: "api" } })),
    ).rejects.toBeInstanceOf(DraftRejected);
    await expect(
      t.execute(
        newPage({
          page: { ...validNewPage.page, slug: "javascript:alert(1)" },
        }),
      ),
    ).rejects.toBeInstanceOf(DraftRejected);
  });

  it("le message de refus ne recopie pas la valeur reçue", async () => {
    const { t } = tool("redacteur");
    const err = await t
      .execute(
        newPage({
          page: {
            ...validNewPage.page,
            title: `${"x".repeat(500)}SECRET-VALEUR`,
          },
        }),
      )
      .catch((e) => e as Error);
    expect(String((err as Error).message)).not.toContain("SECRET-VALEUR");
  });

  it("refuse un slug déjà utilisé sans rien écrire", async () => {
    const fake = createFakeDirectus({ takenSlugs: ["essai-agent"] });
    const { t } = tool("redacteur", fake);
    await expect(t.execute(newPage())).rejects.toMatchObject({
      reason: "slug_taken",
    });
    expect(fake.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("signale les affirmations à prouver dans le résumé de l'approbation", async () => {
    const { t, fake } = tool("redacteur");
    await t.execute(
      newPage({
        blocks: [
          {
            collection: "block_hero",
            translation: {
              headline: "Conforme à la Loi 25 et certifié ISO 27001",
            },
          },
          {
            collection: "block_cta",
            translation: { title: "Dès 49 $ par mois" },
          },
        ],
      }),
    );
    const summary = String(fake.approvals[0]?.body.summary);
    expect(summary).toContain("À VÉRIFIER");
    expect(summary).toMatch(/Loi 25/);
    expect(summary).toMatch(/montant ou prix/);
  });
});

describe("politique par agent", () => {
  it("le Rédacteur ne peut ni traduire ni modifier le SEO", async () => {
    const { t, fake } = tool(
      "redacteur",
      createFakeDirectus({ pages: { [PAGE_ID]: frPage } }),
    );
    await expect(
      t.execute({
        mode: "update_seo",
        approvalKind: "seo",
        summary: "Résumé suffisant.",
        pageId: PAGE_ID,
        language: "fr-CA",
        seo_title: "T",
        seo_description: "D",
      }),
    ).rejects.toMatchObject({ reason: "policy" });
    expect(fake.calls).toHaveLength(0);
  });

  it("le Traducteur et le SEO ne peuvent pas créer de page", async () => {
    for (const p of ["traducteur", "seo"] as const) {
      const { t } = tool(p);
      await expect(t.execute(newPage())).rejects.toMatchObject({
        reason: "policy",
      });
    }
  });
});

describe("create_draft : SEO on-page sur une page publiée", () => {
  const seo = (extra: Record<string, unknown> = {}) => ({
    mode: "update_seo",
    approvalKind: "seo",
    summary: "Titre plus précis et description fidèle au contenu affiché.",
    pageId: PAGE_ID,
    language: "fr-CA",
    seo_title: "Un titre précis",
    seo_description: "Une description fidèle au contenu affiché de la page.",
    ...extra,
  });

  it("écrit dans une VERSION (jamais l'élément publié) et ne change pas le slug d'une page publiée", async () => {
    const fake = createFakeDirectus({ pages: { [PAGE_ID]: frPage } });
    const { t } = tool("seo", fake);
    const r = await t.execute(seo({ slug: "nouveau-slug" }));
    const delta = fake.versions[0]?.delta as {
      translations: { update: Record<string, unknown>[] };
    };
    expect(delta.translations.update[0]).toEqual({
      id: 7,
      seo_title: "Un titre précis",
      seo_description: "Une description fidèle au contenu affiché de la page.",
    });
    expect(r.notes.join(" ")).toContain("NON appliqué");
    expect(
      fake.calls.some(
        (c) => c.method === "POST" && c.path.startsWith("/items/pages"),
      ),
    ).toBe(false);
    expect(fake.approvals[0]?.body.kind).toBe("seo");
  });
});

describe("create_draft : traduction en-CA", () => {
  it("copie liens et statuts du français, ne traduit pas les tarifs, n'accepte que les clés demandées", async () => {
    const fake = createFakeDirectus({ pages: { [PAGE_ID]: frPage } });
    const { t } = tool("traducteur", fake);
    const input = {
      mode: "update_translation",
      approvalKind: "traduction",
      summary: "Traduction de la page en anglais canadien.",
      pageId: PAGE_ID,
      language: "en-CA",
      page: {
        slug: "test",
        title: "Test",
        seo_title: "Test SEO",
        seo_description: "Description.",
      },
      strings: {
        "b1.headline": "Hello world",
        "b1.subheadline": "A subtitle.",
        "b1.primary_label": "Contact us",
      },
    };
    const r = await t.execute(input);
    expect(r.notes.join(" ")).toContain("block_pricing");
    const delta = fake.versions[0]?.delta as {
      blocks: {
        update: {
          item: { translations: { create: Record<string, unknown>[] } };
        }[];
      };
    };
    const tr = delta.blocks.update[0]?.item.translations.create[0];
    expect(tr).toMatchObject({
      languages_code: "en-CA",
      headline: "Hello world",
      primary_href: "/contact/",
    });
    expect(delta.blocks.update).toHaveLength(1);

    const { t: t2, fake: f2 } = tool(
      "traducteur",
      createFakeDirectus({ pages: { [PAGE_ID]: frPage } }),
    );
    await expect(
      t2.execute({ ...input, strings: { ...input.strings, "b9.evil": "x" } }),
    ).rejects.toBeInstanceOf(DraftRejected);
    await expect(
      t2.execute({
        ...input,
        strings: {
          "b1.headline": "<img src=x onerror=alert(1)>",
          "b1.subheadline": "a",
          "b1.primary_label": "b",
        },
      }),
    ).rejects.toBeInstanceOf(DraftRejected);
    expect(f2.versions).toHaveLength(0);
  });
});
