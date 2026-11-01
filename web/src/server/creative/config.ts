import { z } from "zod";

/**
 * Configuration des modèles de Nexora Creative, éditée dans l'administration (module Directus « Nexora Creative »).
 * Les modèles actuels sont ceux des essais et des démonstrations techniques : cette configuration permet de choisir,
 * sans redéployer, les modèles de texte (catalogue Nexora : locaux ou cloud selon leur fournisseur) et les moteurs de
 * génération (ComfyUI sur un GPU de Nexora ou un service cloud). Aucun secret ici : un moteur cloud désigne sa clé par
 * une référence du Coffre (D2), résolue seulement pour le service Nexora Creative.
 */

/** Rôles LLM de l'application (voir app/server/nexora/llm.ts de Nexora Creative). */
export const LLM_ROLES = [
  "redaction",
  "realisation",
  "boost",
  "musique",
  "moderation",
  "publication",
  "idees",
  "juge",
] as const;
export type LlmRole = (typeof LLM_ROLES)[number];

/** Recettes de génération que l'application sait construire (vidéo H3, musique, images). */
export const CREATIVE_RECIPES = [
  "h3-fast",
  "h3-max",
  "music3",
  "qwen21",
  "qwen",
  "flux2",
] as const;
export type CreativeRecipe = (typeof CREATIVE_RECIPES)[number];

const SECRET_REF = /^[a-z0-9._-]{3,64}$/;
const MODEL_ID = /^[A-Za-z0-9._:/-]{1,120}$/;

/** Adresse http(s) sans identifiants ni fragment. */
const httpUrl = z
  .string()
  .max(300)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        (u.protocol === "http:" || u.protocol === "https:") &&
        u.username === "" &&
        u.password === "" &&
        u.hash === ""
      );
    } catch {
      return false;
    }
  }, "invalid_url");

export const engineSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{2,30}$/),
    label: z.string().trim().min(1).max(60),
    kind: z.enum(["local", "cloud"]),
    /** API ComfyUI v2 (comfy-api-proxy ou Comfy Cloud). */
    baseUrl: httpUrl,
    /** ComfyUI lui-même (état, historique). */
    comfyUrl: httpUrl,
    recipes: z
      .array(z.enum(CREATIVE_RECIPES))
      .min(1)
      .max(CREATIVE_RECIPES.length),
    /** Référence du Coffre portant la clé d'un moteur cloud. */
    apiKeyRef: z.string().regex(SECRET_REF).optional(),
  })
  .strict();

export const creativeConfigSchema = z
  .object({
    version: z.literal(1),
    llm: z
      .object({
        /** Modèle par défaut (identifiant public du catalogue) ; null : celui du poste. */
        default: z.string().regex(MODEL_ID).nullable(),
        roles: z
          .object(
            Object.fromEntries(
              LLM_ROLES.map((r) => [r, z.string().regex(MODEL_ID).optional()]),
            ) as Record<LlmRole, z.ZodOptional<z.ZodString>>,
          )
          .strict(),
      })
      .strict(),
    engines: z.array(engineSchema).max(12),
  })
  .strict();

export type CreativeConfig = z.infer<typeof creativeConfigSchema>;
export type CreativeEngine = z.infer<typeof engineSchema>;

/** Ne force rien : l'application garde son environnement tant que rien n'est configuré. */
export function defaultCreativeConfig(): CreativeConfig {
  return { version: 1, llm: { default: null, roles: {} }, engines: [] };
}

export interface ValidationContext {
  /** Identifiants publics des modèles « chat » du catalogue. */
  llmModels: ReadonlySet<string>;
  /**
   * Contrôle d'une clé de moteur cloud : existe-t-elle, a-t-elle le bon type (portée « creative-engine »), et l'hôte du
   * moteur est-il autorisé par l'opérateur pour cette clé (R9) ? null si tout va bien.
   */
  secretCheck: (
    ref: string,
    url: string,
  ) => "unknown_secret" | "forbidden_secret" | "forbidden_host" | null;
}

export type Validation =
  | { ok: true; config: CreativeConfig }
  | { ok: false; issues: { path: string; code: string }[] };

export function validateCreativeConfig(
  input: unknown,
  ctx: ValidationContext,
): Validation {
  const parsed = creativeConfigSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
      })),
    };
  const config = parsed.data;
  const issues: { path: string; code: string }[] = [];
  if (config.llm.default !== null && !ctx.llmModels.has(config.llm.default))
    issues.push({ path: "llm.default", code: "unknown_model" });
  for (const role of LLM_ROLES) {
    const m = config.llm.roles[role];
    if (m !== undefined && !ctx.llmModels.has(m))
      issues.push({ path: `llm.roles.${role}`, code: "unknown_model" });
  }
  const seen = new Set<string>();
  config.engines.forEach((e, i) => {
    if (seen.has(e.id))
      issues.push({ path: `engines.${i}.id`, code: "duplicate_engine" });
    seen.add(e.id);
    if (e.kind === "cloud") {
      if (
        !e.baseUrl.startsWith("https://") ||
        !e.comfyUrl.startsWith("https://")
      )
        issues.push({ path: `engines.${i}.baseUrl`, code: "https_required" });
      if (!e.apiKeyRef)
        issues.push({
          path: `engines.${i}.apiKeyRef`,
          code: "api_key_required",
        });
      else {
        const problem =
          ctx.secretCheck(e.apiKeyRef, e.baseUrl) ??
          ctx.secretCheck(e.apiKeyRef, e.comfyUrl);
        if (problem)
          issues.push({ path: `engines.${i}.apiKeyRef`, code: problem });
      }
    } else if (e.apiKeyRef) {
      issues.push({
        path: `engines.${i}.apiKeyRef`,
        code: "api_key_cloud_only",
      });
    }
  });
  return issues.length ? { ok: false, issues } : { ok: true, config };
}
