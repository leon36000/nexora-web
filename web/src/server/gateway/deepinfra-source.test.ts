import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSource,
  cacheReadUsdMicro,
  normalizeQuantization,
  readSourceFromDisk,
  slugOf,
} from "./deepinfra-source";
import { modelSheetSchema } from "./sheet";

/** Données INVENTÉES pour les essais seulement : aucun modèle ni aucun chiffre ne vient d'ici dans le dépôt. */
const selectionOf = (models: Record<string, unknown>[]) => ({
  readAt: "2026-10-29",
  source: "https://api.deepinfra.com/models/list",
  models,
});
const chatRow = {
  rank: 1,
  deepinfraId: "acme/Eclair-7B-Instruct",
  kind: "chat",
  contextMax: 131072,
  quantization: "fp8",
  upstreamInputUsdMicro: 200000,
  upstreamOutputUsdMicro: 600000,
  cacheReadRate: 0.22222222,
  deepinfraTags: ["tools"],
  deepinfraDescription: "ignoré",
};
const embedRow = {
  rank: 2,
  deepinfraId: "acme/Vecteur-Embed-1B",
  kind: "embedding",
  contextMax: 8192,
  quantization: null,
  upstreamInputUsdMicro: 20000,
  upstreamOutputUsdMicro: null,
  cacheReadRate: null,
};
const chatFiche = {
  deepinfraId: "acme/Eclair-7B-Instruct",
  slug: "eclair-7b-instruct",
  name: "Éclair 7B",
  descriptionFr: "Modèle d'essai.",
  descriptionEn: "Test model.",
  capabilities: { streaming: true, tools: true, reasoning: false },
  maxOutputTokens: 8192,
  sheet: {
    author: "Acme",
    tags: ["rapide"],
    license: { openWeights: true },
    sources: [
      {
        label: "Hugging Face",
        url: "https://huggingface.co/acme/Eclair-7B-Instruct",
        readAt: "2026-10-29",
      },
    ],
  },
  tagsWhy: { rapide: "essai" },
  gaps: ["rien"],
};
const embedFiche = {
  deepinfraId: "acme/Vecteur-Embed-1B",
  slug: "vecteur-embed-1b",
  name: "Vecteur Embed",
  descriptionFr: "Embeddings d'essai.",
  descriptionEn: "Test embeddings.",
  capabilities: { streaming: false, tools: false },
  sheet: { tags: ["embeddings"] },
};

const rerankRow = {
  rank: 3,
  deepinfraId: "acme/Classeur-Rerank-4B",
  kind: "rerank",
  contextMax: 32768,
  quantization: null,
  upstreamInputUsdMicro: 25000,
  upstreamOutputUsdMicro: null,
  cacheReadRate: null,
};
const rerankFiche = {
  deepinfraId: "acme/Classeur-Rerank-4B",
  slug: "classeur-rerank-4b",
  name: "Classeur Rerank",
  descriptionFr: "Reclassement d'essai.",
  descriptionEn: "Test reranker.",
  capabilities: { streaming: false, tools: false },
  sheet: { modalities: { input: ["text"], output: ["text"] } },
};

describe("identifiant public", () => {
  it("le slug est le dernier segment de l'identifiant DeepInfra, en minuscules", () => {
    expect(slugOf("zai-org/GLM-5.3")).toBe("glm-5.3");
    expect(slugOf("nvidia/NVIDIA-Nemotron-3-Super-120B-A12B")).toBe(
      "nvidia-nemotron-3-super-120b-a12b",
    );
  });
});

describe("quantification", () => {
  it("passe en minuscules et abrège bfloat16 en bf16 ; une valeur absente laisse le champ omis", () => {
    expect(normalizeQuantization("FP8")).toBe("fp8");
    expect(normalizeQuantization("bfloat16")).toBe("bf16");
    expect(normalizeQuantization("mxfp4")).toBe("mxfp4");
    const s = buildSource({
      selection: selectionOf([
        { ...chatRow, quantization: "bfloat16" },
        { ...embedRow, quantization: null },
      ]),
      fiches: [
        { file: "eclair-7b-instruct.json", raw: chatFiche },
        { file: "vecteur-embed-1b.json", raw: embedFiche },
      ],
    });
    expect(s.entries[0]?.sheet.quantization).toBe("bf16");
    expect(s.entries[1]?.sheet).not.toHaveProperty("quantization");
  });
  it("ne laisse jamais la quantification de la fiche contredire celle de DeepInfra", () => {
    const s = buildSource({
      selection: selectionOf([{ ...chatRow, quantization: "fp8" }]),
      fiches: [
        {
          file: "eclair-7b-instruct.json",
          raw: {
            ...chatFiche,
            sheet: { ...chatFiche.sheet, quantization: "fp16" },
          },
        },
      ],
    });
    expect(s.entries[0]?.sheet.quantization).toBe("fp8");
  });
});

describe("prix du cache lu", () => {
  it("vaut le taux multiplié par le prix d'entrée, arrondi au micro-dollar", () => {
    expect(cacheReadUsdMicro(900_000n, 0.22222222)).toBe(200_000n);
    expect(cacheReadUsdMicro(200_000n, 0.03)).toBe(6_000n);
    expect(cacheReadUsdMicro(100_000n, 1)).toBe(100_000n);
    expect(cacheReadUsdMicro(430_000n, 0.00837209)).toBe(3_600n);
  });
});

describe("assemblage de la sélection et des fiches", () => {
  const build = (
    rows: Record<string, unknown>[],
    fiches: { file: string; raw: unknown }[],
  ) => buildSource({ selection: selectionOf(rows), fiches });

  it("accepte un modèle de reclassement comme un modèle d'embeddings : prix d'entrée seulement, ni sortie ni plafond de sortie", () => {
    const s = build(
      [rerankRow],
      [{ file: "classeur-rerank-4b.json", raw: rerankFiche }],
    );
    expect(s.problems).toEqual([]);
    expect(s.entries[0]).toMatchObject({
      kind: "rerank",
      publicId: "nexora/classeur-rerank-4b",
      maxOutputTokens: null,
      upstream: { input: 25_000n, output: 0n, cache: null },
    });
  });

  it("assemble prix amont, cache, contexte, quantification et fiche, sans écrire de champ qui n'est pas dans la fiche", () => {
    const s = build(
      [chatRow, embedRow],
      [
        { file: "eclair-7b-instruct.json", raw: chatFiche },
        { file: "vecteur-embed-1b.json", raw: embedFiche },
      ],
    );
    expect(s.problems).toEqual([]);
    const chat = s.entries.find(
      (e) => e.publicId === "nexora/eclair-7b-instruct",
    );
    expect(chat).toMatchObject({
      deepinfraId: "acme/Eclair-7B-Instruct",
      kind: "chat",
      name: "Éclair 7B",
      contextMax: 131072,
      maxOutputTokens: 8192,
      upstream: { input: 200_000n, output: 600_000n, cache: 44_444n },
    });
    expect(chat?.sheet.quantization).toBe("fp8");
    // la source du prix est ajoutée aux sources de la fiche, celles de la fiche sont gardées
    expect(chat?.sheet.sources?.map((x) => x.url)).toEqual([
      "https://huggingface.co/acme/Eclair-7B-Instruct",
      "https://api.deepinfra.com/models/list",
    ]);
    expect(() => modelSheetSchema.parse(chat?.sheet)).not.toThrow();
    const embed = s.entries.find((e) => e.kind === "embedding");
    expect(embed).toMatchObject({
      maxOutputTokens: null,
      upstream: { input: 20_000n, output: 0n, cache: null },
    });
    expect(embed?.sheet.quantization).toBeUndefined();
  });

  it("un répertoire de fiches vide est toléré : chaque modèle sans fiche est signalé et sauté", () => {
    const s = build([chatRow, embedRow], []);
    expect(s.entries).toEqual([]);
    expect(s.problems.map((p) => [p.subject, p.kind])).toEqual([
      ["nexora/eclair-7b-instruct", "fiche_absente"],
      ["nexora/vecteur-embed-1b", "fiche_absente"],
    ]);
  });

  it("une fiche invalide est signalée avec son motif et ne bloque pas les autres", () => {
    const s = build(
      [chatRow, embedRow],
      [
        {
          file: "eclair-7b-instruct.json",
          raw: {
            ...chatFiche,
            sheet: { tags: ["magique"], homepageUrl: "http://pas-https.test" },
          },
        },
        { file: "vecteur-embed-1b.json", raw: embedFiche },
      ],
    );
    expect(s.entries.map((e) => e.publicId)).toEqual([
      "nexora/vecteur-embed-1b",
    ]);
    const bad = s.problems.find(
      (p) => p.subject === "nexora/eclair-7b-instruct",
    );
    expect(bad?.kind).toBe("fiche_invalide");
    expect(bad?.message).toMatch(/sheet\.tags/);
    expect(bad?.message).toMatch(/sheet\.homepageUrl/);
  });

  it("refuse un champ inconnu dans une fiche, un slug ou un identifiant qui ne correspond pas", () => {
    const s = build(
      [chatRow],
      [{ file: "eclair-7b-instruct.json", raw: { ...chatFiche, prix: 3 } }],
    );
    expect(s.entries).toEqual([]);
    expect(s.problems[0]?.kind).toBe("fiche_invalide");

    const wrongSlug = build(
      [chatRow],
      [
        {
          file: "eclair-7b-instruct.json",
          raw: { ...chatFiche, slug: "autre" },
        },
      ],
    );
    expect(wrongSlug.entries).toEqual([]);
    expect(wrongSlug.problems.some((p) => /slug/.test(p.message))).toBe(true);

    const wrongId = build(
      [chatRow],
      [
        {
          file: "eclair-7b-instruct.json",
          raw: { ...chatFiche, deepinfraId: "acme/Autre-Modele" },
        },
      ],
    );
    expect(wrongId.entries).toEqual([]);
  });

  it("signale une fiche orpheline (aucun modèle de la sélection) et du JSON illisible", () => {
    const s = build(
      [chatRow],
      [
        { file: "eclair-7b-instruct.json", raw: chatFiche },
        {
          file: "fantome.json",
          raw: { ...chatFiche, deepinfraId: "acme/Fantome", slug: "fantome" },
        },
        { file: "casse.json", raw: undefined },
      ],
    );
    expect(s.entries).toHaveLength(1);
    expect(s.problems.map((p) => p.kind).sort()).toEqual([
      "fiche_invalide",
      "fiche_orpheline",
    ]);
  });

  it("refuse une ligne de sélection incohérente : prix de sortie absent pour un modèle de conversation, taux de cache hors de ]0 ; 1], doublon de slug", () => {
    const s = build(
      [
        { ...chatRow, upstreamOutputUsdMicro: null },
        { ...chatRow, deepinfraId: "acme/Autre-1", cacheReadRate: 1.5 },
        { ...chatRow, deepinfraId: "other/ECLAIR-7B-Instruct" },
      ],
      [],
    );
    expect(s.entries).toEqual([]);
    expect(s.problems).toHaveLength(3);
    expect(s.problems.every((p) => p.kind === "selection_invalide")).toBe(true);
  });

  it("refuse une sélection illisible en entier", () => {
    expect(() =>
      buildSource({ selection: { models: "non" }, fiches: [] }),
    ).toThrow(/sélection/);
  });
});

describe("lecture sur disque", () => {
  it("lit selection.json, retraits.json et le dossier fiches (même vide, avec un .gitkeep)", () => {
    const dir = mkdtempSync(join(tmpdir(), "deepinfra-"));
    mkdirSync(join(dir, "fiches"));
    writeFileSync(join(dir, "fiches", ".gitkeep"), "");
    writeFileSync(
      join(dir, "selection.json"),
      JSON.stringify(selectionOf([chatRow])),
    );
    writeFileSync(
      join(dir, "retraits.json"),
      JSON.stringify({
        retraits: [
          { publicId: "nexora/vieux", noteFr: "Retiré.", noteEn: "Retired." },
        ],
      }),
    );
    const empty = readSourceFromDisk(dir);
    expect(empty.entries).toEqual([]);
    expect(empty.problems).toHaveLength(1);
    expect(empty.retraits).toEqual([
      { publicId: "nexora/vieux", noteFr: "Retiré.", noteEn: "Retired." },
    ]);
    writeFileSync(
      join(dir, "fiches", "eclair-7b-instruct.json"),
      JSON.stringify(chatFiche),
    );
    writeFileSync(join(dir, "fiches", "casse.json"), "{pas du json");
    const full = readSourceFromDisk(dir);
    expect(full.entries).toHaveLength(1);
    expect(full.problems.map((p) => p.kind)).toEqual(["fiche_invalide"]);
  });

  it("la sélection livrée avec le dépôt est lisible (33 modèles attendus, prix et contextes valides)", () => {
    const s = readSourceFromDisk();
    // Sans fiche, aucune entrée : chaque modèle de la sélection est signalé « fiche absente ».
    const total =
      s.entries.length +
      s.problems.filter((p) => p.kind !== "fiche_orpheline").length;
    expect(total).toBeGreaterThanOrEqual(33);
    expect(s.problems.filter((p) => p.kind === "selection_invalide")).toEqual(
      [],
    );
    expect(s.retraits.map((r) => r.publicId)).toEqual([
      "nexora/minimax-m3.1-flash",
      "nexora/kimi-k3.1-pro",
    ]);
  });
});
