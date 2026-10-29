import { FORMATS } from "@nexora/webpilot";
import { z } from "zod";

/** Corps des requêtes WebPilot. `strict()` : un champ inconnu est refusé (pas de paramètre silencieusement ignoré). */
const url = z.string().min(1).max(2048);
const formats = z.array(z.enum(FORMATS)).min(1).max(FORMATS.length);
const pathPatterns = z
  .array(z.string().min(1).max(200).startsWith("/"))
  .max(20);

export const searchSchema = z
  .object({
    query: z.string().trim().min(1).max(1000),
    limit: z.number().int().min(1).optional(),
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .optional(),
    language: z
      .string()
      .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/)
      .optional(),
    include_content: z.boolean().optional(),
  })
  .strict();

export const scrapeSchema = z
  .object({
    url,
    formats: formats.optional(),
    render: z.enum(["static", "browser"]).optional(),
    only_main_content: z.boolean().optional(),
    wait_ms: z.number().int().min(0).optional(),
    headers: z.record(z.string().max(60), z.string().max(500)).optional(),
  })
  .strict();

export const crawlSchema = z
  .object({
    url,
    limit: z.number().int().min(1),
    max_depth: z.number().int().min(0).optional(),
    include_paths: pathPatterns.optional(),
    exclude_paths: pathPatterns.optional(),
    same_origin_only: z.boolean().optional(),
    formats: formats.optional(),
    only_main_content: z.boolean().optional(),
  })
  .strict();

export const extractSchema = z
  .object({
    urls: z.array(url).min(1).optional(),
    crawl_id: z.string().max(80).optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    prompt: z.string().trim().min(1).max(4000).optional(),
    model: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.urls) !== Boolean(v.crawl_id), {
    message: "urls",
    path: ["urls"],
  })
  .refine((v) => Boolean(v.schema) || Boolean(v.prompt), {
    message: "schema",
    path: ["schema"],
  });

/** Champ en cause d'une erreur de validation (`param` de l'erreur OpenAI). */
export function paramOf(error: z.ZodError): string | null {
  const issue = error.issues[0];
  if (!issue) return null;
  if (issue.code === "unrecognized_keys") return issue.keys[0] ?? null;
  const head = issue.path[0];
  return typeof head === "string" ? head : null;
}

export function badFieldMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const param = paramOf(error);
  if (issue?.code === "unrecognized_keys") {
    return param === "webhook_url"
      ? "Le champ « webhook_url » n'est pas pris en charge : interrogez GET /v1/webpilot/crawl/{id} pour suivre l'exploration."
      : `Le champ « ${param} » n'est pas pris en charge.`;
  }
  if (param === "urls" && issue?.message === "urls")
    return "Indiquez soit « urls », soit « crawl_id » (un seul des deux).";
  if (param === "schema" && issue?.message === "schema")
    return "Indiquez « schema » (JSON Schema du résultat) et/ou « prompt » (consigne).";
  return param
    ? `Le champ « ${param} » est absent, mal formé ou hors limites.`
    : "Corps de requête invalide.";
}
