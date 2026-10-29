import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelCapabilities, ModelKind, ModelSheet } from "@nexora/db";
import { z } from "zod";
import { modelSheetSchema } from "./sheet";

/**
 * Données du catalogue DeepInfra de Nexora AI : `catalog-deepinfra/selection.json` (identifiant DeepInfra, prix
 * amont, contexte, quantification, taux du cache lu : lus dans l'API de DeepInfra), `catalog-deepinfra/fiches/<slug>.json`
 * (nom, descriptions, capacités, fiche sourcée) et `catalog-deepinfra/retraits.json`. Ce fichier assemble et VALIDE ces
 * données sans toucher à la base : une fiche invalide ou absente met seulement son modèle de côté, avec son motif.
 */

export const DEFAULT_DATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "catalog-deepinfra",
);

const SLUG = /^[a-z0-9][a-z0-9._-]{0,80}$/;

/** `zai-org/GLM-5.3` → `glm-5.3` : dernier segment de l'identifiant DeepInfra, en minuscules. */
export const slugOf = (deepinfraId: string): string =>
  (deepinfraId.split("/").pop() ?? "").toLowerCase();

/** Quantification de DeepInfra → expression de la fiche : minuscules, `bfloat16` devient `bf16` (`/^[a-z0-9._-]{2,16}$/`). */
export function normalizeQuantization(raw: string): string {
  const q = raw.trim().toLowerCase();
  return q === "bfloat16" ? "bf16" : q;
}

/** Prix du cache lu (micro-USD par million) : taux × prix d'entrée, arrondi au micro-dollar (arithmétique entière). */
export function cacheReadUsdMicro(input: bigint, rate: number): bigint {
  const scaled = BigInt(Math.round(rate * 1e8));
  return (input * scaled + 50_000_000n) / 100_000_000n;
}

const micro = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const selectionRow = z
  .object({
    deepinfraId: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/),
    kind: z.enum(["chat", "embedding"]),
    contextMax: z.number().int().min(1).max(10_000_000),
    quantization: z.string().min(1).nullable().optional(),
    upstreamInputUsdMicro: micro.refine((v) => v > 0, "prix d'entrée nul"),
    upstreamOutputUsdMicro: micro.nullable(),
    cacheReadRate: z.number().gt(0).max(1).nullable().optional(),
  })
  .loose();
const selectionFile = z.object({
  readAt: z.iso.date(),
  source: z.url().optional(),
  models: z.array(z.unknown()),
});

const capabilities = z
  .object({
    streaming: z.boolean(),
    tools: z.boolean(),
    vision: z.boolean(),
    reasoning: z.boolean(),
    json_mode: z.boolean(),
  })
  .partial()
  .strict();
const ficheFile = z
  .object({
    deepinfraId: z.string().min(1),
    slug: z.string().regex(SLUG),
    name: z.string().min(1).max(120),
    descriptionFr: z.string().max(4000),
    descriptionEn: z.string().max(4000),
    capabilities,
    maxOutputTokens: z.number().int().min(1).max(10_000_000).optional(),
    sheet: modelSheetSchema,
    // Documentation de la recherche (pourquoi cette étiquette, ce qui manque) : lue, jamais chargée.
    tagsWhy: z.record(z.string(), z.string()).optional(),
    gaps: z.array(z.string()).optional(),
  })
  .strict();

const retraitFile = z.object({
  retraits: z.array(
    z
      .object({
        publicId: z.string().regex(/^nexora\/[a-z0-9][a-z0-9._:-]{0,80}$/),
        noteFr: z.string().min(1).max(2000),
        noteEn: z.string().min(1).max(2000),
      })
      .strict(),
  ),
});

export interface SourceEntry {
  slug: string;
  publicId: string;
  deepinfraId: string;
  kind: ModelKind;
  name: string;
  descriptionFr: string;
  descriptionEn: string;
  capabilities: ModelCapabilities;
  maxOutputTokens: number | null;
  contextMax: number;
  sheet: ModelSheet;
  /** Prix amont, micro-USD par million de jetons ; sortie 0 pour un modèle d'embeddings ; cache null si non offert. */
  upstream: { input: bigint; output: bigint; cache: bigint | null };
}

export type ProblemKind =
  | "fiche_absente"
  | "fiche_invalide"
  | "fiche_orpheline"
  | "selection_invalide";

export interface SourceProblem {
  kind: ProblemKind;
  /** Identifiant public du modèle, ou nom du fichier. */
  subject: string;
  message: string;
}

export interface Retrait {
  publicId: string;
  noteFr: string;
  noteEn: string;
}

export interface Source {
  readAt: string;
  entries: SourceEntry[];
  problems: SourceProblem[];
  retraits: Retrait[];
}

const issuesText = (error: z.ZodError) =>
  error.issues
    .map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`)
    .join(" ; ");

export function buildSource(input: {
  selection: unknown;
  fiches: { file: string; raw: unknown }[];
  retraits?: unknown;
}): Source {
  const file = selectionFile.safeParse(input.selection);
  if (!file.success)
    throw new Error(`sélection illisible : ${issuesText(file.error)}`);
  const problems: SourceProblem[] = [];
  const retraits = input.retraits
    ? retraitFile.parse(input.retraits).retraits
    : [];

  // Fiches rangées par nom de fichier (`<slug>.json`) ; leur contenu est validé quand le modèle correspondant est traité,
  // pour que le motif soit rattaché au modèle.
  const fiches = new Map<string, unknown>();
  for (const f of input.fiches) {
    const stem = f.file.replace(/\.json$/, "");
    if (typeof f.raw !== "object" || f.raw === null || Array.isArray(f.raw)) {
      problems.push({
        kind: "fiche_invalide",
        subject: f.file,
        message: "le fichier doit contenir un objet JSON",
      });
      continue;
    }
    fiches.set(stem, f.raw);
  }

  const entries: SourceEntry[] = [];
  const seen = new Set<string>();
  const used = new Set<string>();
  for (const raw of file.data.models) {
    const row = selectionRow.safeParse(raw);
    if (!row.success) {
      const id = (raw as { deepinfraId?: unknown } | null)?.deepinfraId;
      problems.push({
        kind: "selection_invalide",
        subject: typeof id === "string" ? id : "(ligne sans identifiant)",
        message: issuesText(row.error),
      });
      continue;
    }
    const r = row.data;
    const slug = slugOf(r.deepinfraId);
    const publicId = `nexora/${slug}`;
    const bad = (message: string) =>
      problems.push({ kind: "selection_invalide", subject: publicId, message });
    if (!SLUG.test(slug)) {
      bad(`slug « ${slug} » invalide`);
      continue;
    }
    if (seen.has(slug)) {
      bad(`slug « ${slug} » en double dans la sélection`);
      continue;
    }
    seen.add(slug);
    if (
      r.kind === "chat" &&
      !(r.upstreamOutputUsdMicro && r.upstreamOutputUsdMicro > 0)
    ) {
      bad("modèle de conversation sans prix de sortie");
      continue;
    }
    const rawFiche = fiches.get(slug);
    if (rawFiche === undefined) {
      problems.push({
        kind: "fiche_absente",
        subject: publicId,
        message: `aucune fiche « fiches/${slug}.json »`,
      });
      continue;
    }
    used.add(slug);
    const parsedFiche = ficheFile.safeParse(rawFiche);
    if (!parsedFiche.success) {
      problems.push({
        kind: "fiche_invalide",
        subject: publicId,
        message: issuesText(parsedFiche.error),
      });
      continue;
    }
    const fiche = parsedFiche.data;
    if (fiche.deepinfraId !== r.deepinfraId) {
      problems.push({
        kind: "fiche_invalide",
        subject: publicId,
        message: `deepinfraId « ${fiche.deepinfraId} » différent de la sélection (« ${r.deepinfraId} »)`,
      });
      continue;
    }
    if (slug !== fiche.slug) {
      problems.push({
        kind: "fiche_invalide",
        subject: publicId,
        message: `slug « ${fiche.slug} » attendu « ${slug} »`,
      });
      continue;
    }
    // La quantification et la source du prix viennent de DeepInfra : elles complètent la fiche.
    const sheet: ModelSheet = { ...fiche.sheet };
    if (r.quantization)
      sheet.quantization = normalizeQuantization(r.quantization);
    if (file.data.source) {
      const sources = [...(sheet.sources ?? [])];
      if (!sources.some((s) => s.url === file.data.source))
        sources.push({
          label: "DeepInfra, liste des modèles et des prix",
          url: file.data.source,
          readAt: file.data.readAt,
        });
      sheet.sources = sources;
    }
    const finalSheet = modelSheetSchema.safeParse(sheet);
    if (!finalSheet.success) {
      problems.push({
        kind: "fiche_invalide",
        subject: publicId,
        message: issuesText(finalSheet.error),
      });
      continue;
    }
    const input$ = BigInt(r.upstreamInputUsdMicro);
    entries.push({
      slug,
      publicId,
      deepinfraId: r.deepinfraId,
      kind: r.kind,
      name: fiche.name,
      descriptionFr: fiche.descriptionFr,
      descriptionEn: fiche.descriptionEn,
      capabilities: fiche.capabilities,
      maxOutputTokens:
        r.kind === "chat" ? (fiche.maxOutputTokens ?? null) : null,
      contextMax: r.contextMax,
      sheet: finalSheet.data,
      upstream: {
        input: input$,
        output: BigInt(r.upstreamOutputUsdMicro ?? 0),
        cache:
          r.cacheReadRate == null
            ? null
            : cacheReadUsdMicro(input$, r.cacheReadRate),
      },
    });
  }
  for (const slug of fiches.keys())
    if (!used.has(slug) && !seen.has(slug))
      problems.push({
        kind: "fiche_orpheline",
        subject: `fiches/${slug}.json`,
        message: "aucun modèle de la sélection n'y correspond",
      });
  return { readAt: file.data.readAt, entries, problems, retraits };
}

/** Lit `selection.json`, `retraits.json` et `fiches/*.json` du dossier de données (défaut : celui du dépôt). */
export function readSourceFromDisk(dir: string = DEFAULT_DATA_DIR): Source {
  const readJson = (path: string): unknown =>
    JSON.parse(readFileSync(path, "utf8"));
  const fichesDir = join(dir, "fiches");
  const fiches: { file: string; raw: unknown }[] = [];
  const unreadable: SourceProblem[] = [];
  if (existsSync(fichesDir))
    for (const name of readdirSync(fichesDir).sort()) {
      if (!name.endsWith(".json")) continue;
      try {
        fiches.push({ file: name, raw: readJson(join(fichesDir, name)) });
      } catch {
        unreadable.push({
          kind: "fiche_invalide",
          subject: name,
          message: "JSON illisible",
        });
      }
    }
  const retraitsPath = join(dir, "retraits.json");
  const source = buildSource({
    selection: readJson(join(dir, "selection.json")),
    fiches,
    retraits: existsSync(retraitsPath) ? readJson(retraitsPath) : undefined,
  });
  return { ...source, problems: [...unreadable, ...source.problems] };
}
