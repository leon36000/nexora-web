import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/log", () => ({
  log: { debug() {}, info() {}, warn() {}, error() {} },
}));

import { createCmsClient } from "./client";
import { CmsUnavailableError } from "./errors";
import {
  fetchPageForPreview,
  fetchPublishedPage,
  fetchPublishedSlugs,
} from "./pages";
import { loadWithFallback } from "./resilient";
import { createSnapshotStore } from "./snapshots";
import {
  type FakeDirectus,
  type FakePage,
  startFakeDirectus,
} from "./test-directus";
import {
  EN,
  FR,
  faqBlock,
  heroBlock,
  pageJson,
  sectionBlock,
} from "./test-fixtures";

const READER = "jeton-lecteur-test";
const PUBLISHER = "jeton-publication-test";

let dx: FakeDirectus;
let dir: string;
const reader = () =>
  createCmsClient({ baseUrl: dx.url, token: READER, timeoutMs: 400 });
const publisher = () =>
  createCmsClient({ baseUrl: dx.url, token: PUBLISHER, timeoutMs: 400 });

const home = (over: Record<string, unknown> = {}) =>
  pageJson(
    "home",
    { fr: "", en: "" },
    [heroBlock(1, 1), sectionBlock(2, 2)],
    over,
  ) as FakePage;
const opsys = (over: Record<string, unknown> = {}) =>
  pageJson(
    "opsys",
    { fr: "opsys-ai", en: "opsys-ai" },
    [heroBlock(3, 1), faqBlock(4, 2)],
    over,
  ) as FakePage;

beforeEach(async () => {
  dx = await startFakeDirectus();
  dir = mkdtempSync(join(tmpdir(), "nexora-snap-"));
});
afterEach(async () => {
  await dx.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("fetchPublishedPage : seul le publié est servi", () => {
  it("renvoie la page publiée de l'accueil (slug vide) et d'une page par slug", async () => {
    dx.pages = [home(), opsys()];
    const h = await fetchPublishedPage(reader(), FR, "");
    expect(h?.id).toBe("home");
    const o = await fetchPublishedPage(reader(), FR, "opsys-ai");
    expect(o?.id).toBe("opsys");
    expect(o?.blocks.map((b) => b.type)).toEqual(["hero", "faq"]);
  });

  it("ne renvoie JAMAIS un brouillon, une page en relecture ou archivée", async () => {
    for (const status of ["draft", "in_review", "archived"]) {
      dx.pages = [opsys({ status }), home({ status })];
      expect(
        await fetchPublishedPage(reader(), FR, "opsys-ai"),
        status,
      ).toBeNull();
      expect(await fetchPublishedPage(reader(), FR, ""), status).toBeNull();
    }
  });

  it("envoie le filtre status = published dans chaque requête de contenu", async () => {
    dx.pages = [opsys()];
    await fetchPublishedPage(reader(), FR, "opsys-ai");
    const contentCalls = dx.seen.filter(
      (s) => s.path === "/items/pages_translations",
    );
    expect(contentCalls.length).toBeGreaterThan(0);
    for (const c of contentCalls) {
      const filter = c.query.get("filter") ?? "";
      expect(filter).toContain('"status":{"_eq":"published"}');
    }
    expect(dx.seen.every((s) => s.authorization === `Bearer ${READER}`)).toBe(
      true,
    );
  });

  it("revérifie le statut sur la page elle-même si le filtre était ignoré (défense en profondeur)", async () => {
    dx.ignoreFilters = true; // le faux serveur renvoie tout, brouillons compris
    dx.pages = [opsys({ status: "draft" })];
    expect(await fetchPublishedPage(reader(), FR, "opsys-ai")).toBeNull();
  });

  it("distingue les langues : un slug anglais n'ouvre pas la page française", async () => {
    dx.pages = [
      pageJson("p", { fr: "souverainete", en: "sovereignty" }, [
        heroBlock(1, 1),
      ]) as FakePage,
    ];
    expect(
      await fetchPublishedPage(reader(), FR, "souverainete"),
    ).not.toBeNull();
    expect(await fetchPublishedPage(reader(), EN, "souverainete")).toBeNull();
    expect(
      await fetchPublishedPage(reader(), EN, "sovereignty"),
    ).not.toBeNull();
  });

  it("renvoie null pour une page qui n'existe pas", async () => {
    dx.pages = [home()];
    expect(await fetchPublishedPage(reader(), FR, "inconnue")).toBeNull();
  });
});

describe("fetchPublishedSlugs", () => {
  it("liste les slugs publiés par langue, sans l'accueil ni les brouillons", async () => {
    dx.pages = [
      home(),
      opsys(),
      pageJson("b", { fr: "brouillon" }, [heroBlock(1, 1)], {
        status: "draft",
      }) as FakePage,
    ];
    const slugs = await fetchPublishedSlugs(reader());
    expect(slugs).toEqual(
      expect.arrayContaining([
        { code: FR, slug: "opsys-ai" },
        { code: EN, slug: "opsys-ai" },
      ]),
    );
    expect(slugs.find((s) => s.slug === "brouillon")).toBeUndefined();
    expect(slugs.find((s) => s.slug === "")).toBeUndefined();
  });
});

describe("résilience : Directus coupé", () => {
  const load = (
    store: ReturnType<typeof createSnapshotStore>,
    slug = "opsys-ai",
  ) =>
    loadWithFallback(store, `pages:${FR}:${slug}`, () =>
      fetchPublishedPage(reader(), FR, slug),
    );

  it("sert la dernière version connue quand Directus est arrêté, jamais une page vide", async () => {
    dx.pages = [opsys()];
    const store = createSnapshotStore({ dir });
    const first = await load(store);
    expect(first.source).toBe("fresh");
    expect(first.value?.blocks.length).toBeGreaterThan(0);

    await dx.close(); // on coupe Directus
    const second = await load(store);
    expect(second.source).toBe("stale");
    expect(second.value).toEqual(first.value);
    expect(second.value?.blocks.length).toBeGreaterThan(0);
  });

  it("tient aussi quand Directus répond 500, du texte illisible, ou ne répond pas", async () => {
    dx.pages = [opsys()];
    const store = createSnapshotStore({ dir });
    const first = await load(store);
    for (const mode of ["500", "garbage", "hang"] as const) {
      dx.mode = mode;
      const r = await load(store);
      expect(r.source, mode).toBe("stale");
      expect(r.value, mode).toEqual(first.value);
    }
  });

  it("survit à un redémarrage du site : l'instantané est relu depuis le disque", async () => {
    dx.pages = [opsys()];
    const first = await load(createSnapshotStore({ dir }));
    await dx.close();
    const afterRestart = createSnapshotStore({ dir }); // mémoire vide, même dossier
    const r = await load(afterRestart);
    expect(r.source).toBe("stale");
    expect(r.value).toEqual(first.value);
  });

  it("à froid et sans instantané, lève une erreur de panne (pas de page vide inventée)", async () => {
    await dx.close();
    await expect(load(createSnapshotStore({ dir }))).rejects.toBeInstanceOf(
      CmsUnavailableError,
    );
  });

  it("une page dépubliée volontairement ne ressuscite pas pendant une panne", async () => {
    dx.pages = [opsys()];
    const store = createSnapshotStore({ dir });
    await load(store);
    dx.pages = [opsys({ status: "archived" })];
    const unpublished = await load(store);
    expect(unpublished.value).toBeNull();
    expect(unpublished.source).toBe("fresh");
    await dx.close();
    await expect(load(store)).rejects.toBeInstanceOf(CmsUnavailableError);
  });

  it("une réponse de forme inattendue est traitée comme une panne et retombe sur l'instantané", async () => {
    dx.pages = [opsys()];
    const store = createSnapshotStore({ dir });
    const first = await load(store);
    dx.pages = [
      { ...opsys(), blocks: "n'importe quoi" } as unknown as FakePage,
    ];
    const r = await load(store);
    expect(r.source).toBe("stale");
    expect(r.value).toEqual(first.value);
  });

  it("une page sans aucun bloc affichable n'est pas servie : instantané ou erreur", async () => {
    dx.pages = [opsys()];
    const store = createSnapshotStore({ dir });
    const first = await load(store);
    dx.pages = [opsys({ blocks: [] })];
    const r = await load(store);
    expect(r.source).toBe("stale");
    expect(r.value).toEqual(first.value);
  });
});

describe("aperçu : la version en cours, avec le jeton de publication", () => {
  it("lit la dernière version de la page et signale laquelle", async () => {
    const main = opsys({ status: "published" });
    dx.pages = [main];
    const merged = opsys({ status: "published" });
    (merged.blocks as Record<string, unknown>[])[0] = heroBlock(3, 1, {
      translations: [
        { languages_code: FR, headline: "Titre MODIFIÉ en version." },
      ],
    });
    dx.versions = [
      {
        id: "v-old",
        key: "ancienne",
        name: "Ancienne",
        item: "opsys",
        date_updated: "2026-10-01T00:00:00Z",
        page: opsys(),
      },
      {
        id: "v-new",
        key: "redaction",
        name: "Rédaction",
        item: "opsys",
        date_updated: "2026-10-20T00:00:00Z",
        page: merged,
      },
    ];
    const r = await fetchPageForPreview(publisher(), FR, "opsys-ai");
    expect(r?.preview.versionKey).toBe("redaction");
    expect(r?.preview.versionName).toBe("Rédaction");
    const hero = r?.page.blocks[0];
    expect(hero?.type === "hero" && hero.headline).toBe(
      "Titre MODIFIÉ en version.",
    );
    // seul le jeton de publication touche aux versions
    const versionCalls = dx.seen.filter(
      (s) => s.path === "/versions" || s.query.has("version"),
    );
    expect(versionCalls.length).toBeGreaterThan(0);
    expect(
      versionCalls.every((s) => s.authorization === `Bearer ${PUBLISHER}`),
    ).toBe(true);
    // et l'aperçu ne demande pas le filtre « publié » pour trouver la page
    const resolve = dx.seen.find((s) => s.path === "/items/pages_translations");
    expect(resolve?.query.get("filter") ?? "").not.toContain("published");
  });

  it("montre l'élément principal (brouillon compris) quand la page n'a pas de version", async () => {
    dx.pages = [opsys({ status: "draft" })];
    const r = await fetchPageForPreview(publisher(), FR, "opsys-ai");
    expect(r?.preview.versionKey).toBeNull();
    expect(r?.preview.pageStatus).toBe("draft");
    expect(r?.page.id).toBe("opsys");
  });

  it("renvoie null si aucune page ne porte ce slug", async () => {
    dx.pages = [home()];
    expect(await fetchPageForPreview(publisher(), FR, "inconnue")).toBeNull();
  });
});
