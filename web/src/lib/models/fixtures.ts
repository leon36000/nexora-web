import type { ModelSheet } from "@nexora/db";
import type { PublicModel } from "@/server/gateway/public";

/**
 * Données de TEST des pages publiques de modèles. Tout est fictif (éditeurs « A », « B »…, identifiants
 * `nexora/exemple-…`) : aucun chiffre ni aucune mesure réels. Ce module n'est importé que par les tests.
 */
export function fixtureModel(
  over: Partial<Omit<PublicModel, "sheet">> & { sheet?: ModelSheet } = {},
): PublicModel {
  return {
    id: "nexora/exemple-base",
    name: "Exemple Base",
    descriptionFr: "Description française de l’exemple.",
    descriptionEn: "English description of the example.",
    kind: "chat",
    availability: "live",
    contextMax: 131_072,
    maxOutputTokens: null,
    capabilities: {},
    residency: "etats_unis",
    providerName: "Hébergeur Test",
    dataPolicyFr: "Politique de données de l’hébergeur (test).",
    dataPolicyEn: "Host data policy (test).",
    inputPerMillion: "0.5",
    outputPerMillion: "1.5",
    cachePerMillion: null,
    cacheWritePerMillion: null,
    priceWindows: [],
    sheet: {},
    note: "",
    sunsetAt: null,
    ...over,
  };
}

const SRC = "https://example.org/mesures";

export const CODE_70B = fixtureModel({
  id: "nexora/exemple-code-70b",
  name: "Exemple Code 70B",
  descriptionFr:
    "Modèle d’exemple pour le code et les agents, à poids ouverts.",
  descriptionEn: "Example model for code and agents, open weights.",
  contextMax: 131_072,
  maxOutputTokens: 16_384,
  capabilities: { tools: true, reasoning: true, json_mode: true },
  inputPerMillion: "0.3",
  outputPerMillion: "0.9",
  cachePerMillion: "0.03",
  sheet: {
    author: "Éditeur A",
    family: "Alpha",
    tags: ["code", "agents", "raisonnement", "poids-ouverts"],
    quantization: "fp8",
    homepageUrl: "https://example.org/alpha-70b",
    releasedAt: "2026-09-10",
    knowledgeCutoff: "2026-03",
    license: {
      name: "Licence Libre Test",
      openWeights: true,
      url: "https://example.org/licence",
    },
    parameters: { totalB: 70 },
    modalities: { input: ["text"], output: ["text"] },
    benchmarks: [
      {
        name: "SWE-test",
        score: 61.5,
        unit: "%",
        publisher: "Éditeur A",
        sourceUrl: `${SRC}/swe-a`,
        category: "Code",
        measuredAt: "2026-09-09",
      },
      {
        name: "GPQA-test",
        score: 70,
        unit: "%",
        publisher: "Éditeur A",
        sourceUrl: `${SRC}/gpqa-a`,
        category: "Raisonnement",
      },
      {
        name: "Arène-test",
        score: 1250,
        unit: "Elo",
        publisher: "Tiers T",
        sourceUrl: `${SRC}/arene-t`,
      },
    ],
    sources: [
      {
        label: "Éditeur A, fiche",
        url: `${SRC}/fiche-a`,
        readAt: "2026-10-20",
      },
    ],
  },
});

export const VISION_8B_PREVIEW = fixtureModel({
  id: "nexora/exemple-vision-8b",
  name: "Exemple Vision 8B",
  descriptionFr: "Petit modèle d’exemple qui lit les images.",
  descriptionEn: "Small example model that reads images.",
  availability: "preview",
  contextMax: 32_768,
  capabilities: { vision: true, json_mode: true },
  inputPerMillion: "0.05",
  outputPerMillion: "0.15",
  sheet: {
    author: "Éditeur B",
    family: "Beta",
    tags: ["vision", "rapide", "economique", "multilingue", "poids-ouverts"],
    releasedAt: "2026-06-01",
    license: { name: "Licence Libre Test", openWeights: true },
    parameters: { totalB: 8 },
    modalities: { input: ["text", "image"], output: ["text"] },
    benchmarks: [
      {
        name: "SWE-test",
        score: 21,
        unit: "%",
        publisher: "Éditeur B",
        sourceUrl: `${SRC}/swe-b`,
        category: "Code",
      },
    ],
  },
});

export const EMBED_SMALL = fixtureModel({
  id: "nexora/exemple-embeddings",
  name: "Exemple Embeddings",
  descriptionFr: "Modèle d’exemple qui produit des vecteurs.",
  descriptionEn: "Example model that produces vectors.",
  kind: "embedding",
  contextMax: 8_192,
  inputPerMillion: "0.02",
  outputPerMillion: "0",
  sheet: {
    author: "Éditeur B",
    tags: ["embeddings", "multilingue", "economique"],
    releasedAt: "2026-02-15",
    license: { openWeights: true },
    modalities: { input: ["text"], output: ["embedding"] },
  },
});

export const LONG_CONTEXT = fixtureModel({
  id: "nexora/exemple-long",
  name: "Exemple Contexte Long",
  descriptionFr: "Modèle d’exemple à très grand contexte, poids fermés.",
  descriptionEn: "Example model with a very large context, closed weights.",
  contextMax: 1_048_576,
  maxOutputTokens: 65_536,
  capabilities: { tools: true, vision: true, json_mode: true },
  inputPerMillion: "2",
  outputPerMillion: "8",
  cachePerMillion: "0.2",
  cacheWritePerMillion: "2.5",
  priceWindows: [
    {
      label: "creux",
      days: [0, 6],
      startMinute: 0,
      endMinute: 1_440,
      inputPerMillion: "1",
      outputPerMillion: "4",
      cachePerMillion: null,
    },
  ],
  sheet: {
    author: "Éditeur C",
    family: "Gamma",
    tags: ["contexte-long", "vision", "agents"],
    license: { openWeights: false },
    modalities: { input: ["text", "image", "audio"], output: ["text"] },
    benchmarks: [
      {
        name: "SWE-test",
        score: 48,
        unit: "%",
        publisher: "Éditeur C",
        sourceUrl: `${SRC}/swe-c`,
        category: "Code",
      },
    ],
  },
});

export const NO_SHEET = fixtureModel({
  id: "nexora/exemple-sans-fiche",
  name: "Exemple Sans Fiche",
  descriptionFr: "",
  descriptionEn: "",
  inputPerMillion: "1",
  outputPerMillion: "3",
  sheet: {},
});

export const MOE_PREVIEW = fixtureModel({
  id: "nexora/exemple-moe",
  name: "Exemple MoE 400B",
  availability: "preview",
  contextMax: 262_144,
  maxOutputTokens: 32_768,
  capabilities: { tools: true, reasoning: true },
  inputPerMillion: "0.6",
  outputPerMillion: "2.4",
  sheet: {
    author: "Éditeur A",
    family: "Alpha",
    tags: ["code", "agents", "raisonnement", "contexte-long"],
    releasedAt: "2026-10-01",
    license: { name: "Licence Libre Test", openWeights: true },
    parameters: { totalB: 400, activeB: 32 },
    modalities: { input: ["text"], output: ["text"] },
    benchmarks: [
      {
        name: "SWE-test",
        score: 55,
        unit: "%",
        publisher: "Éditeur A",
        sourceUrl: `${SRC}/swe-a2`,
        category: "Code",
      },
      {
        name: "GPQA-test",
        score: 68,
        unit: "%",
        publisher: "Éditeur C",
        sourceUrl: `${SRC}/gpqa-c`,
        category: "Raisonnement",
      },
      {
        name: "Arène-test",
        score: 1210,
        unit: "Elo",
        publisher: "Tiers T",
        sourceUrl: `${SRC}/arene-t2`,
      },
    ],
  },
});

export const REASONING_XL = fixtureModel({
  id: "nexora/exemple-raisonnement-xl",
  name: "Exemple Raisonnement XL",
  contextMax: 200_000,
  capabilities: { tools: true, reasoning: true },
  inputPerMillion: "5",
  outputPerMillion: "20",
  sheet: {
    author: "Éditeur D",
    tags: ["raisonnement"],
    releasedAt: "2026-08-20",
    license: { name: "Licence propriétaire", openWeights: false },
    benchmarks: [
      {
        name: "SWE-test",
        score: 72,
        unit: "%",
        publisher: "Éditeur D",
        sourceUrl: `${SRC}/swe-d`,
        category: "Code",
      },
      {
        name: "Latence-test",
        score: 850,
        unit: "ms",
        publisher: "Éditeur D",
        sourceUrl: `${SRC}/lat-d`,
      },
    ],
  },
});

export const FIXTURES: PublicModel[] = [
  CODE_70B,
  VISION_8B_PREVIEW,
  EMBED_SMALL,
  LONG_CONTEXT,
  NO_SHEET,
  MOE_PREVIEW,
  REASONING_XL,
];
