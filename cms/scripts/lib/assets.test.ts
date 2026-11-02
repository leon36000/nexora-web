import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssetRow,
  type AssetStore,
  DRY_RUN_ID,
  mimeOf,
  resolveAsset,
  resolveAssetRefs,
  sha256Hex,
} from "./assets";
import type { DesiredPage } from "./content";

/** Faux magasin Directus : fichiers en mémoire, comptage des envois. */
function fakeStore(initial: { id: string; name: string; sha?: string }[] = []) {
  const rows: { id: string; name: string; description: string | null }[] = [];
  for (const r of initial)
    rows.push({
      id: r.id,
      name: r.name,
      description: r.sha ? `sha256:${r.sha}` : null,
    });
  const uploads: string[] = [];
  const store: AssetStore = {
    async find(name) {
      return rows
        .filter((r) => r.name === name)
        .reverse()
        .map((r): AssetRow => ({ id: r.id, description: r.description }));
    },
    async upload(name, _bytes, mime, sha) {
      const id = `up-${rows.length + 1}`;
      rows.push({ id, name, description: `sha256:${sha}` });
      uploads.push(`${name} ${mime}`);
      return id;
    },
  };
  return { store, rows, uploads };
}

let dir: string;
const setup = () => {
  dir = mkdtempSync(join(tmpdir(), "nexora-actifs-"));
  return dir;
};

describe("mimeOf", () => {
  test("vidéos et sous-titres connus ; le reste est refusé", () => {
    expect(mimeOf("video-opsys.mp4")).toBe("video/mp4");
    expect(mimeOf("demo.webm")).toBe("video/webm");
    expect(mimeOf("video-opsys.fr-CA.vtt")).toBe("text/vtt");
    for (const bad of ["page.html", "logo.svg", "doc.pdf", "run.exe"]) {
      expect(() => mimeOf(bad), bad).toThrow();
    }
  });
});

describe("noms d'actifs", () => {
  test("un chemin ou un nom hors motif est refusé avant toute lecture", async () => {
    const { store } = fakeStore();
    for (const bad of ["../secret.mp4", "sous/dossier.mp4", "", ".caché.vtt"]) {
      await expect(
        resolveAsset(bad, { store, dir: setup() }),
        bad,
      ).rejects.toThrow();
    }
  });
});

describe("resolveAsset", () => {
  test("téléverse un fichier du dépôt absent de Directus, avec son empreinte SHA-256", async () => {
    const d = setup();
    writeFileSync(
      join(d, "video-opsys.fr-CA.vtt"),
      "WEBVTT\n\n00:00.000 --> 00:01.000\nBonjour\n",
    );
    const { store, rows, uploads } = fakeStore();
    const r = await resolveAsset("video-opsys.fr-CA.vtt", { store, dir: d });
    expect(r.action).toBe("televerse");
    expect(uploads).toEqual(["video-opsys.fr-CA.vtt text/vtt"]);
    const sha = sha256Hex(
      new TextEncoder().encode("WEBVTT\n\n00:00.000 --> 00:01.000\nBonjour\n"),
    );
    expect(rows[0]?.description).toBe(`sha256:${sha}`);
    expect(r.id).toBe(rows[0]?.id ?? "");
    rmSync(d, { recursive: true, force: true });
  });

  test("idempotent : un fichier identique déjà téléversé est réutilisé, sans nouvel envoi", async () => {
    const d = setup();
    writeFileSync(join(d, "video-opsys.en-CA.vtt"), "WEBVTT\n");
    const sha = sha256Hex(new TextEncoder().encode("WEBVTT\n"));
    const { store, uploads } = fakeStore([
      { id: "deja-la", name: "video-opsys.en-CA.vtt", sha },
    ]);
    const r = await resolveAsset("video-opsys.en-CA.vtt", { store, dir: d });
    expect(r).toEqual({ id: "deja-la", action: "reutilise" });
    expect(uploads).toHaveLength(0);
    rmSync(d, { recursive: true, force: true });
  });

  test("fichier modifié sous le même nom : un nouveau fichier est envoyé et retenu", async () => {
    const d = setup();
    writeFileSync(join(d, "video-opsys.fr-CA.vtt"), "WEBVTT\nnouveau\n");
    const oldSha = sha256Hex(new TextEncoder().encode("WEBVTT\nancien\n"));
    const { store, uploads } = fakeStore([
      { id: "ancien", name: "video-opsys.fr-CA.vtt", sha: oldSha },
    ]);
    const r = await resolveAsset("video-opsys.fr-CA.vtt", { store, dir: d });
    expect(r.action).toBe("televerse");
    expect(r.id).not.toBe("ancien");
    expect(uploads).toHaveLength(1);
    rmSync(d, { recursive: true, force: true });
  });

  test("gros fichier absent du dépôt : retrouvé par son nom dans Directus, sans envoi", async () => {
    const d = setup();
    const { store, uploads } = fakeStore([
      { id: "video-en-base", name: "video-opsys.mp4" },
    ]);
    const r = await resolveAsset("video-opsys.mp4", { store, dir: d });
    expect(r).toEqual({ id: "video-en-base", action: "existant" });
    expect(uploads).toHaveLength(0);
    rmSync(d, { recursive: true, force: true });
  });

  test("gros fichier introuvable dans Directus : erreur claire qui nomme le fichier", async () => {
    const { store } = fakeStore();
    const err = await resolveAsset("video-opsys.mp4", {
      store,
      dir: setup(),
    }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("video-opsys.mp4");
    expect((err as Error).message).toContain("absent du dépôt");
  });

  test("à blanc : aucun envoi ; l'identifiant est provisoire", async () => {
    const d = setup();
    writeFileSync(join(d, "video-opsys.fr-CA.vtt"), "WEBVTT\n");
    const { store, uploads } = fakeStore();
    const r = await resolveAsset("video-opsys.fr-CA.vtt", {
      store,
      dir: d,
      dryRun: true,
    });
    expect(r).toEqual({ id: DRY_RUN_ID, action: "a-televerser" });
    expect(uploads).toHaveLength(0);
    rmSync(d, { recursive: true, force: true });
  });
});

describe("resolveAssetRefs", () => {
  const want = (): DesiredPage => ({
    key: "opsys-ai",
    status: "published",
    noindex: false,
    translations: {
      "fr-CA": { slug: "opsys-ai" },
      "en-CA": { slug: "opsys-ai" },
    },
    blocks: [
      {
        collection: "block_section",
        fields: { media: { asset: "video-opsys.mp4" }, visual: "aucun" },
        translations: {
          "fr-CA": {
            title: "Présentation",
            media_captions: { asset: "video-opsys.fr-CA.vtt" },
            items: [{ title: "Un", text: "Deux" }],
          },
          "en-CA": {
            title: "Presentation",
            media_captions: { asset: "video-opsys.en-CA.vtt" },
            items: [],
          },
        },
      },
    ],
  });

  test("remplace media et media_captions par l'identifiant du fichier, laisse le reste intact", async () => {
    const out = await resolveAssetRefs(want(), async (name) => `id(${name})`);
    const b = out.blocks[0];
    expect(b?.fields).toEqual({
      media: "id(video-opsys.mp4)",
      visual: "aucun",
    });
    expect(b?.translations["fr-CA"]).toEqual({
      title: "Présentation",
      media_captions: "id(video-opsys.fr-CA.vtt)",
      items: [{ title: "Un", text: "Deux" }],
    });
    expect(b?.translations["en-CA"]?.media_captions).toBe(
      "id(video-opsys.en-CA.vtt)",
    );
    // la page d'origine n'est pas modifiée
    expect(want().blocks[0]?.fields.media).toEqual({
      asset: "video-opsys.mp4",
    });
  });

  test("un même fichier n'est résolu qu'une fois par exécution", async () => {
    const calls: string[] = [];
    const page: DesiredPage = {
      ...want(),
      blocks: [
        ...want().blocks,
        {
          collection: "block_section",
          fields: { media: { asset: "video-opsys.mp4" } },
          translations: { "fr-CA": {}, "en-CA": {} },
        },
      ],
    };
    await resolveAssetRefs(page, async (name) => {
      calls.push(name);
      return `id(${name})`;
    });
    expect(calls.filter((n) => n === "video-opsys.mp4")).toHaveLength(1);
  });

  test("une référence mal formée (clé en trop, nom non texte) est refusée", async () => {
    const bad = want();
    bad.blocks[0] = {
      collection: "block_section",
      fields: { media: { asset: "video-opsys.mp4", fichier: "x" } },
      translations: { "fr-CA": {}, "en-CA": {} },
    };
    await expect(resolveAssetRefs(bad, async () => "x")).rejects.toThrow(
      /référence/,
    );
  });
});

describe("médias du site (refonte « Signal ») : images, dossiers de médias, emplacements stables", () => {
  test("les images matricielles sont admises ; le SVG reste refusé", () => {
    expect(mimeOf("infra-dgx-spark.jpg")).toBe("image/jpeg");
    expect(mimeOf("hero-1.webp")).toBe("image/webp");
    expect(mimeOf("hero-1.avif")).toBe("image/avif");
    expect(mimeOf("hero-1.png")).toBe("image/png");
    expect(() => mimeOf("logo.svg")).toThrow();
  });

  test("un fichier absent du dépôt mais présent dans un dossier de médias est téléversé une fois", async () => {
    const repo = setup();
    const medias = mkdtempSync(join(tmpdir(), "nexora-medias-"));
    writeFileSync(join(medias, "hero-boucle.mp4"), "video");
    const { store, uploads } = fakeStore();
    const a = await resolveAsset("hero-boucle.mp4", {
      store,
      dir: repo,
      extraDirs: [medias],
    });
    expect(a.action).toBe("televerse");
    const b = await resolveAsset("hero-boucle.mp4", {
      store,
      dir: repo,
      extraDirs: [medias],
    });
    expect(b).toEqual({ id: a.id, action: "reutilise" });
    expect(uploads).toEqual(["hero-boucle.mp4 video/mp4"]);
    rmSync(medias, { recursive: true, force: true });
  });

  const page = (value: unknown): DesiredPage =>
    ({
      key: "accueil",
      status: "published",
      noindex: false,
      translations: { "fr-CA": { slug: "" }, "en-CA": { slug: "" } },
      blocks: [
        {
          collection: "block_cards",
          fields: { layout: "vitrine" },
          translations: {
            "fr-CA": { cards: [{ title: "Spark", image: value }] },
            "en-CA": { cards: [{ title: "Spark", image: value }] },
          },
        },
        {
          collection: "block_hero",
          fields: { video: value },
          translations: { "fr-CA": {}, "en-CA": {} },
        },
      ],
    }) as DesiredPage;

  const resolver = (known: string[]) => async (name: string) => {
    const { AssetMissingError } = await import("./assets");
    if (!known.includes(name)) throw new AssetMissingError(name);
    return `id(${name})`;
  };

  test("une référence à plusieurs noms prend le premier fichier qui existe, y compris dans une liste de cartes", async () => {
    const out = await resolveAssetRefs(
      page({ asset: ["hero-boucle.mp4", "hero-boucle-provisoire.mp4"] }),
      resolver(["hero-boucle-provisoire.mp4"]),
    );
    expect(out.blocks[1]?.fields.video).toBe("id(hero-boucle-provisoire.mp4)");
    expect(out.blocks[0]?.translations["fr-CA"]?.cards).toEqual([
      { title: "Spark", image: "id(hero-boucle-provisoire.mp4)" },
    ]);
  });

  test("facultative et introuvable : le champ reste vide (le site dessine une matière) ; obligatoire : le chargement échoue", async () => {
    const out = await resolveAssetRefs(
      page({ asset: "infra-dgx-spark.jpg", optional: true }),
      resolver([]),
    );
    expect(out.blocks[1]?.fields.video).toBeNull();
    await expect(
      resolveAssetRefs(page({ asset: "infra-dgx-spark.jpg" }), resolver([])),
    ).rejects.toThrow(/infra-dgx-spark/);
  });

  test("une autre erreur (Directus en panne) n'est jamais prise pour un fichier manquant", async () => {
    await expect(
      resolveAssetRefs(
        page({ asset: ["a.jpg", "b.jpg"], optional: true }),
        async () => {
          throw new Error("Directus injoignable");
        },
      ),
    ).rejects.toThrow(/injoignable/);
  });
});
