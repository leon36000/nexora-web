import { MODALITIES } from "@nexora/db";
import { z } from "zod";

/**
 * Validation de la fiche publique d'un modèle et de ses consignes de routage (G3). Les deux sont
 * stockées en JSON sur `models` : ce fichier est la seule porte d'entrée, côté administration.
 */

const httpsUrl = z
  .url()
  .max(500)
  .refine((u) => u.startsWith("https://"), "adresse https attendue");
const day = z.iso.date();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const text = (max: number) => z.string().min(1).max(max);

const benchmark = z
  .object({
    name: text(120),
    score: z.number().finite(),
    unit: text(16),
    publisher: text(80),
    sourceUrl: httpsUrl,
    measuredAt: day.optional(),
  })
  .strict();

const modalities = z.array(z.enum(MODALITIES)).max(MODALITIES.length);

export const modelSheetSchema = z
  .object({
    family: text(80).optional(),
    releasedAt: day.optional(),
    knowledgeCutoff: month.optional(),
    license: z
      .object({
        name: text(120).optional(),
        openWeights: z.boolean(),
        url: httpsUrl.optional(),
      })
      .strict()
      .optional(),
    parameters: z
      .object({
        totalB: z.number().positive().finite().optional(),
        activeB: z.number().positive().finite().optional(),
      })
      .strict()
      .refine(
        (p) =>
          p.totalB === undefined ||
          p.activeB === undefined ||
          p.activeB <= p.totalB,
        "les paramètres actifs ne peuvent pas dépasser le total",
      )
      .optional(),
    modalities: z
      .object({ input: modalities, output: modalities })
      .strict()
      .optional(),
    benchmarks: z.array(benchmark).max(60).optional(),
    sources: z
      .array(
        z.object({ label: text(120), url: httpsUrl, readAt: day }).strict(),
      )
      .max(30)
      .optional(),
    notesFr: z.string().max(2000).optional(),
    notesEn: z.string().max(2000).optional(),
  })
  .strict();

/** Code d'hébergeur chez OpenRouter (« deepinfra/fp8 », « z-ai ») : jamais d'espace ni de remontée de dossier. */
const providerCode = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{0,40}(\/[a-z0-9][a-z0-9._-]{0,40})?$/);
const codes = z.array(providerCode).max(40);
const microUsd = z.string().regex(/^\d{1,15}$/);

export const modelRoutingSchema = z
  .object({
    dataCollection: z.enum(["allow", "deny"]).optional(),
    zdr: z.boolean().optional(),
    allowFallbacks: z.boolean().optional(),
    order: codes.optional(),
    only: codes.optional(),
    ignore: codes.optional(),
    quantizations: z
      .array(z.string().regex(/^[a-z0-9]{2,12}$/))
      .max(10)
      .optional(),
    maxPriceUsdMicro: z
      .object({ input: microUsd, output: microUsd })
      .strict()
      .optional(),
  })
  .strict();
