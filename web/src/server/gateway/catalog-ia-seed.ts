import {
  type Database,
  eq,
  type ModelCapabilities,
  modelProviders,
  models,
} from "@nexora/db";
import {
  addPrice,
  CatalogError,
  createModel,
  createProvider,
  currentFx,
  type ModelInput,
  type ProviderInput,
  updateModel,
} from "./catalog";

/**
 * Les cinq modèles demandés par le fondateur (28/10/2026), chargés en BROUILLON : fiches lues sur
 * les pages officielles, prix du fournisseur d'origine comme référence de coût, marge de 10 %.
 * Rien n'est publié : le fondateur saisit lui-même la clé de chaque fournisseur dans le coffre.
 */

/** Marge visée et plancher, en points de base (décision du fondateur : 10 %). */
export const MARGIN_BPS = 1000;

const READ_AT = "2026-10-28";

const direct = (
  code: string,
  name: string,
  baseUrl: string,
  priority: number,
  fr: string,
  en: string,
): ProviderInput => ({
  code,
  name,
  type: "openai_compatible",
  baseUrl,
  secretRef: `llm.${code}`,
  region: "autre",
  priority,
  dataPolicyFr: fr,
  dataPolicyEn: en,
});

/**
 * Fournisseurs d'origine, chacun avec la clé du fondateur (saisie par lui dans le coffre, référence
 * `llm.<code>`), et OpenRouter en route de secours, désactivé tant que le fondateur n'y met pas de clé.
 */
export const PROVIDERS: ProviderInput[] = [
  direct(
    "deepseek",
    "DeepSeek",
    "https://api.deepseek.com/v1",
    10,
    "Requêtes envoyées directement à DeepSeek.",
    "Requests sent directly to DeepSeek.",
  ),
  direct(
    "zai",
    "Z.ai",
    "https://api.z.ai/api/paas/v4",
    10,
    "Requêtes envoyées directement à Z.ai.",
    "Requests sent directly to Z.ai.",
  ),
  direct(
    "minimax",
    "MiniMax",
    "https://api.minimax.io/v1",
    10,
    "Requêtes envoyées directement à MiniMax.",
    "Requests sent directly to MiniMax.",
  ),
  direct(
    "moonshot",
    "Moonshot AI (Kimi)",
    "https://api.moonshot.ai/v1",
    10,
    "Requêtes envoyées directement à Moonshot AI.",
    "Requests sent directly to Moonshot AI.",
  ),
  {
    code: "openrouter",
    name: "OpenRouter",
    type: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    secretRef: "llm.openrouter",
    region: "autre",
    priority: 50,
    enabled: false,
    dataPolicyFr:
      "Route de secours : les requêtes passent par OpenRouter, qui les transmet à un hébergeur tiers. Nos consignes de routage refusent les hébergeurs qui conservent ou réutilisent les données.",
    dataPolicyEn:
      "Fallback route: requests go through OpenRouter, which forwards them to a third-party host. Our routing rules exclude hosts that keep or reuse data.",
  },
];

export interface AiModelDraft {
  /** Code du fournisseur d'origine (route principale). */
  providerCode: string;
  /** Identifiant du même modèle chez OpenRouter (route de secours, G6). */
  openrouterId: string;
  model: Omit<ModelInput, "providerId">;
  /** Prix du fournisseur d'origine, en micro-USD par million de jetons. */
  reference: { input: bigint; output: bigint; cache: bigint | null };
  priceNote: string;
}

const routingFor = (input: bigint, output: bigint) => ({
  dataCollection: "deny" as const,
  allowFallbacks: true,
  maxPriceUsdMicro: { input: input.toString(), output: output.toString() },
});

const base: ModelCapabilities = {
  streaming: true,
  tools: true,
  reasoning: true,
  json_mode: true,
};

export const AI_MODEL_DRAFTS: AiModelDraft[] = [
  {
    providerCode: "deepseek",
    openrouterId: "deepseek/deepseek-v4.1-flash-1017",
    model: {
      publicId: "nexora/deepseek-v4.1-flash-1017",
      name: "DeepSeek V4.1 Flash 1017",
      descriptionFr:
        "Version du 17 octobre 2026 de DeepSeek V4.1 Flash : modèle à experts rapide et très économique, lecture d'images, appels d'outils, raisonnement activable, contexte de 1 million de jetons.",
      descriptionEn:
        "October 17, 2026 snapshot of DeepSeek V4.1 Flash: a fast, very low-cost mixture-of-experts model with image input, tool calls, optional reasoning and a 1-million-token context.",
      upstreamId: "deepseek-flash",
      contextMax: 1_048_576,
      maxOutputTokens: 393_216,
      capabilities: { ...base, vision: true },
      residency: "autre",
      sheet: {
        family: "DeepSeek V4.1",
        releasedAt: "2026-10-17",
        license: { name: "MIT", openWeights: true },
        parameters: { totalB: 763 },
        modalities: { input: ["text", "image"], output: ["text"] },
        benchmarks: [
          ["DeepSWE v1.1", 77.0],
          ["Terminal-Bench 4.0", 42.3],
          ["NL2Repo", 68.2],
          ["Agents' Last Exam", 35.4],
          ["Automation-Bench 1.0.6", 60.5],
          ["HLE (sans outils)", 42.6],
        ].map(([name, score]) => ({
          name: name as string,
          score: score as number,
          unit: "%",
          publisher: "DeepSeek",
          sourceUrl:
            "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017",
        })),
        sources: [
          {
            label: "DeepSeek, tarifs",
            url: "https://api-docs.deepseek.com/quick_start/pricing",
            readAt: READ_AT,
          },
          {
            label: "DeepSeek, fiche du modèle",
            url: "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017",
            readAt: READ_AT,
          },
        ],
        notesFr:
          "Deux tarifs selon l'heure : pointe de 01 h à 04 h et de 06 h à 10 h UTC du lundi au vendredi (0,30 $ en entrée, 1,20 $ en sortie), creux le reste du temps (0,15 $ et 0,60 $). Le tarif de pointe est appliqué en attendant les plages horaires (G1).",
        notesEn:
          "Two prices by time of day: peak 01:00–04:00 and 06:00–10:00 UTC Monday to Friday ($0.30 in, $1.20 out), off-peak otherwise ($0.15 and $0.60). The peak price applies until time windows are supported (G1).",
      },
      routing: routingFor(300_000n, 1_200_000n),
    },
    reference: { input: 300_000n, output: 1_200_000n, cache: 6_000n },
    priceNote:
      "Tarif de pointe de DeepSeek (28/10/2026). Ne pas publier avant les plages horaires (G1) : le tarif creux est la moitié.",
  },
  {
    providerCode: "zai",
    openrouterId: "z-ai/glm-5.3",
    model: {
      publicId: "nexora/glm-5.3",
      name: "GLM 5.3",
      descriptionFr:
        "Modèle de raisonnement de Z.ai pour le génie logiciel complexe et les agents de longue durée : texte seulement, contexte de 1 million de jetons, poids ouverts.",
      descriptionEn:
        "Z.ai reasoning model for complex software engineering and long-horizon agents: text only, 1-million-token context, open weights.",
      upstreamId: "glm-5.3",
      contextMax: 1_048_576,
      maxOutputTokens: 131_072,
      capabilities: { ...base, vision: false },
      residency: "autre",
      sheet: {
        family: "GLM 5",
        releasedAt: "2026-08-18",
        license: { openWeights: true },
        parameters: { totalB: 753 },
        modalities: { input: ["text"], output: ["text"] },
        benchmarks: [
          ["DeepSWE v1.1", 66.9],
          ["NL2Repo", 58.0],
          ["Agents' Last Exam", 28.5],
          ["AutomationBench", 48.2],
          ["CyberGym", 84.5],
        ].map(([name, score]) => ({
          name: name as string,
          score: score as number,
          unit: "%",
          publisher: "Z.ai",
          sourceUrl: "https://docs.z.ai/guides/llm/glm-5.3.md",
        })),
        sources: [
          {
            label: "Z.ai, tarifs",
            url: "https://docs.z.ai/guides/overview/pricing",
            readAt: READ_AT,
          },
          {
            label: "Z.ai, GLM 5.3",
            url: "https://docs.z.ai/guides/llm/glm-5.3.md",
            readAt: READ_AT,
          },
        ],
        notesFr:
          "Poids ouverts annoncés ; le texte de la licence n'a pas été lu. Les mesures reprises d'un autre éditeur ne sont pas affichées.",
        notesEn:
          "Open weights announced; the licence text has not been read. Figures taken from another publisher are not shown.",
      },
      routing: routingFor(1_400_000n, 4_400_000n),
    },
    reference: { input: 1_400_000n, output: 4_400_000n, cache: 260_000n },
    priceNote: "Prix officiel Z.ai (28/10/2026).",
  },
  {
    providerCode: "zai",
    openrouterId: "z-ai/glm-5.3-flash",
    model: {
      publicId: "nexora/glm-5.3-flash",
      name: "GLM 5.3 Flash",
      descriptionFr:
        "Version rapide et multimodale de GLM 5.3 (images, vidéo, fichiers) pour le code et les agents, à très bas prix, poids ouverts sous licence MIT.",
      descriptionEn:
        "Fast multimodal version of GLM 5.3 (images, video, files) for coding and agents, at a very low price, open weights under the MIT licence.",
      upstreamId: "glm-5.3-flash",
      contextMax: 1_048_576,
      maxOutputTokens: 131_072,
      capabilities: { ...base, vision: true },
      residency: "autre",
      sheet: {
        family: "GLM 5",
        releasedAt: "2026-08-26",
        license: { name: "MIT", openWeights: true },
        parameters: { totalB: 320, activeB: 18 },
        modalities: { input: ["text", "image", "video"], output: ["text"] },
        benchmarks: [
          ["DeepSWE v1.1", 63.4],
          ["AutomationBench", 48.8],
        ].map(([name, score]) => ({
          name: name as string,
          score: score as number,
          unit: "%",
          publisher: "Z.ai",
          sourceUrl: "https://docs.z.ai/guides/vlm/glm-5.3-flash.md",
        })),
        sources: [
          {
            label: "Z.ai, tarifs",
            url: "https://docs.z.ai/guides/overview/pricing",
            readAt: READ_AT,
          },
          {
            label: "Z.ai, GLM 5.3 Flash",
            url: "https://docs.z.ai/guides/vlm/glm-5.3-flash.md",
            readAt: READ_AT,
          },
        ],
      },
      routing: routingFor(150_000n, 500_000n),
    },
    reference: { input: 150_000n, output: 500_000n, cache: 30_000n },
    priceNote: "Prix officiel Z.ai (28/10/2026).",
  },
  {
    providerCode: "minimax",
    openrouterId: "minimax/minimax-m3.1-flash",
    model: {
      publicId: "nexora/minimax-m3.1-flash",
      name: "MiniMax M3.1 Flash",
      descriptionFr:
        "Modèle multimodal de MiniMax, en progrès sur les tâches d'agents, le code et la cybersécurité par rapport à M3. Contexte de 1 million de jetons, poids ouverts.",
      descriptionEn:
        "MiniMax multimodal model, improved over M3 on agentic tasks, coding and cybersecurity. 1-million-token context, open weights.",
      upstreamId: "MiniMax-M3.1-Flash",
      contextMax: 1_048_576,
      maxOutputTokens: 524_288,
      capabilities: {
        streaming: true,
        tools: true,
        reasoning: true,
        vision: true,
      },
      residency: "autre",
      sheet: {
        family: "MiniMax M3",
        license: { name: "minimax-community", openWeights: true },
        modalities: { input: ["text", "image", "video"], output: ["text"] },
        benchmarks: [
          ["DeepSWE v1.1", 73.7],
          ["Terminal-Bench 4.0", 38.1],
          ["NL2Repo", 61.2],
          ["Agents' Last Exam", 29.6],
          ["Automation-Bench 1.0.6", 62.8],
          ["HLE (sans outils)", 43.4],
          ["CyberGym", 82.2],
        ].map(([name, score]) => ({
          name: name as string,
          score: score as number,
          unit: "%",
          publisher: "MiniMax",
          sourceUrl: "https://huggingface.co/MiniMaxAI/MiniMax-M3.1-Flash",
        })),
        sources: [
          {
            label: "MiniMax, tarifs",
            url: "https://platform.minimax.io/docs/guides/pricing",
            readAt: READ_AT,
          },
          {
            label: "MiniMax, fiche du modèle",
            url: "https://huggingface.co/MiniMaxAI/MiniMax-M3.1-Flash",
            readAt: READ_AT,
          },
          {
            label: "OpenRouter, catalogue (sortie maximale)",
            url: "https://openrouter.ai/api/v1/models/minimax/minimax-m3.1-flash/endpoints",
            readAt: READ_AT,
          },
        ],
        notesFr:
          "« MiniMax M3.1 » seul n'existe pas : le modèle est M3.1 Flash. Date de sortie, taille (environ 428 B dont 23 B actifs d'après la fiche ; l'en-tête indique 220 B) et sortie maximale non confirmées par l'éditeur : la sortie maximale vient d'OpenRouter. Texte de la licence non lu.",
        notesEn:
          "There is no plain “MiniMax M3.1”: the model is M3.1 Flash. Release date, size (about 428B with 23B active per the card; the header says 220B) and maximum output are not confirmed by the publisher: the maximum output comes from OpenRouter. Licence text not read.",
      },
      routing: routingFor(150_000n, 600_000n),
    },
    reference: { input: 150_000n, output: 600_000n, cache: 15_000n },
    priceNote: "Prix officiel MiniMax (28/10/2026).",
  },
  {
    providerCode: "moonshot",
    openrouterId: "moonshotai/kimi-k3.1-pro",
    model: {
      publicId: "nexora/kimi-k3.1-pro",
      name: "Kimi K3.1 Pro",
      descriptionFr:
        "Modèle phare de Moonshot AI : raisonnement multimodal, code de longue durée, appels d'outils, sortie JSON à schéma strict. Contexte de 1 million de jetons.",
      descriptionEn:
        "Moonshot AI's flagship: multimodal reasoning, long-horizon coding, tool calls, strict-schema JSON output. 1-million-token context.",
      upstreamId: "kimi-k3.1-pro",
      contextMax: 1_048_576,
      maxOutputTokens: 131_072,
      capabilities: { ...base, vision: true },
      residency: "autre",
      sheet: {
        family: "Kimi K3",
        license: { openWeights: false },
        modalities: { input: ["text", "image"], output: ["text"] },
        benchmarks: [],
        sources: [
          {
            label: "Kimi, tarifs",
            url: "https://platform.kimi.ai/docs/pricing/chat",
            readAt: READ_AT,
          },
          {
            label: "Kimi K3.1 Pro, guide",
            url: "https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart.md",
            readAt: READ_AT,
          },
        ],
        notesFr:
          "Aucun benchmark officiel chiffré n'est publié au 28/10/2026 (le guide contient des champs vides). Poids annoncés pour le 4 novembre 2026, licence inconnue. Sortie maximale : 131 072 par défaut, jusqu'à 1 048 576 chez l'éditeur. L'écriture du cache est facturée en plus par l'éditeur (2 $ pour 5 min, 4 $ pour 1 h) : non comptée tant que G2 n'est pas livré.",
        notesEn:
          "No official benchmark figures are published as of 2026-10-28 (the guide has empty fields). Weights announced for November 4, 2026, licence unknown. Maximum output: 131,072 by default, up to 1,048,576 at the publisher. Cache writes are billed extra by the publisher ($2 for 5 min, $4 for 1 h): not counted until G2 ships.",
      },
      routing: routingFor(2_000_000n, 10_000_000n),
    },
    reference: { input: 2_000_000n, output: 10_000_000n, cache: 200_000n },
    priceNote:
      "Prix officiel Moonshot (28/10/2026), sans l'écriture du cache (G2).",
  },
];

/**
 * Charge le fournisseur OpenRouter et les cinq modèles en brouillon, avec un prix de vente égal à la
 * référence × (1 + marge) au taux de change approuvé. Rejouable : les brouillons suivent la définition courante, le reste n'est pas touché.
 */
export async function seedAiModels(
  db: Database,
): Promise<{ created: string[]; updated: string[] }> {
  // Sans taux approuvé, un modèle serait créé sans prix : on refuse avant de rien écrire.
  if (!(await currentFx(db, new Date())))
    throw new CatalogError(
      "fx_missing",
      "aucun taux de change approuvé : approuver un taux USD→CAD avant de charger les modèles",
    );
  const byCode = new Map<string, string>();
  for (const spec of PROVIDERS) {
    let [row] = await db
      .select()
      .from(modelProviders)
      .where(eq(modelProviders.code, spec.code));
    if (!row) row = await createProvider(db, spec);
    byCode.set(spec.code, row.id);
  }

  const created: string[] = [];
  const updated: string[] = [];
  for (const draft of AI_MODEL_DRAFTS) {
    const [existing] = await db
      .select({ id: models.id, status: models.status })
      .from(models)
      .where(eq(models.publicId, draft.model.publicId));
    if (existing) {
      // Un brouillon suit la définition courante (route, fiche) ; un modèle approuvé ou publié n'est jamais touché.
      if (existing.status === "draft") {
        const { publicId: _id, ...fields } = draft.model;
        await updateModel(db, existing.id, {
          ...fields,
          providerId: byCode.get(draft.providerCode) as string,
        });
        updated.push(draft.model.publicId);
      }
      continue;
    }
    const model = await createModel(db, {
      ...draft.model,
      providerId: byCode.get(draft.providerCode) as string,
    });
    await addPrice(db, model.id, {
      upstreamInputUsdMicro: draft.reference.input,
      upstreamOutputUsdMicro: draft.reference.output,
      upstreamCacheUsdMicro: draft.reference.cache,
      marginBps: MARGIN_BPS,
      marginFloorBps: MARGIN_BPS,
      note: draft.priceNote,
    });
    created.push(draft.model.publicId);
  }
  return { created, updated };
}
