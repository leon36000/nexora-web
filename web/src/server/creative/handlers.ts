import type { VaultKind } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { type SecretHostCheck, secretScopeProblem } from "@nexora/vault/scope";
import { z } from "zod";
import { checkAdminAuth } from "../auth";
import {
  allowMethods,
  HttpError,
  json,
  readBody,
  runAdminRoute,
} from "../site-agents/http";
import {
  CREATIVE_RECIPES,
  type CreativeConfig,
  defaultCreativeConfig,
  LLM_ROLES,
  validateCreativeConfig,
} from "./config";

/**
 * Configuration des modèles de Nexora Creative.
 *
 *  - `/api/admin/creative/config` (GET, PUT) : jeton d'administration ; consommée par le module Directus « Nexora Creative ».
 *  - `/api/creative/config` (GET) : jeton du SERVICE Nexora Creative ; renvoie la configuration avec la clé des moteurs
 *    cloud résolue depuis le Coffre (portée « creative-engine »). L'administration ne voit jamais une valeur de secret.
 */

export interface CreativeStore {
  read(): Promise<{
    config: CreativeConfig;
    updatedAt: Date | null;
    updatedBy: string | null;
  }>;
  write(config: CreativeConfig, updatedBy: string): Promise<Date>;
}

export interface CatalogModelOption {
  publicId: string;
  label: string;
  /** Où le modèle tourne : un fournisseur local (LiteLLM, GPU Nexora) ou un fournisseur cloud. */
  hosting: "local" | "cloud";
}

export interface CreativeAdminDeps {
  adminToken: string | undefined;
  serviceToken: string | undefined;
  store: CreativeStore;
  /** Modèles « chat » du catalogue Nexora, publiés ou approuvés. */
  catalog: () => Promise<CatalogModelOption[]>;
  /** Secrets du coffre (référence et type, jamais la valeur). */
  secrets: () => Promise<{ ref: string; kind: VaultKind }[]>;
  resolveSecret: (ref: string) => Promise<string>;
  secretHosts: SecretHostCheck;
  log: Logger;
}

async function validationContext(deps: CreativeAdminDeps) {
  const [models, secrets] = await Promise.all([deps.catalog(), deps.secrets()]);
  const kinds = new Map(secrets.map((s) => [s.ref, s.kind]));
  return {
    models,
    secrets,
    context: {
      llmModels: new Set(models.map((m) => m.publicId)),
      secretCheck: (ref: string, url: string) => {
        const kind = kinds.get(ref);
        if (kind === undefined) return "unknown_secret" as const;
        if (secretScopeProblem("creative-engine", ref, kind))
          return "forbidden_secret" as const;
        if (deps.secretHosts("creative-engine", url))
          return "forbidden_host" as const;
        return null;
      },
    },
  };
}

export async function handleCreativeAdmin(
  request: Request,
  path: string[],
  deps: CreativeAdminDeps,
): Promise<Response> {
  return runAdminRoute(
    request,
    path,
    { adminToken: deps.adminToken, log: deps.log },
    "nexora creative",
    async () => {
      if (path.length !== 1 || path[0] !== "config")
        throw new HttpError(404, "not_found");
      const method = allowMethods(request, "GET", "PUT");
      const { models, secrets, context } = await validationContext(deps);
      if (method === "GET") {
        const stored = await deps.store.read();
        return json({
          config: stored.config,
          updatedAt: stored.updatedAt?.toISOString() ?? null,
          updatedBy: stored.updatedBy,
          options: {
            llmModels: models,
            roles: LLM_ROLES,
            recipes: CREATIVE_RECIPES,
            // Seules les clés éligibles (type « other », hors références de la plateforme) sont proposées.
            secretRefs: secrets
              .filter(
                (s) => !secretScopeProblem("creative-engine", s.ref, s.kind),
              )
              .map((s) => s.ref),
          },
        });
      }
      const input = await readBody(request, z.unknown());
      const result = validateCreativeConfig(input, context);
      if (!result.ok)
        throw new HttpError(422, "invalid_config", { issues: result.issues });
      const updatedAt = await deps.store.write(result.config, "admin");
      deps.log.info("nexora creative : configuration des modèles mise à jour", {
        engines: result.config.engines.length,
      });
      return json({
        config: result.config,
        updatedAt: updatedAt.toISOString(),
      });
    },
  );
}

/** Lecture par le service Nexora Creative (jeton dédié, distinct du jeton d'administration). */
export async function handleCreativeService(
  request: Request,
  deps: CreativeAdminDeps,
): Promise<Response> {
  const auth = checkAdminAuth(request, deps.serviceToken);
  if (auth === "not_configured")
    return json({ error: "service_not_configured" }, 503);
  if (auth === "unauthorized")
    return json({ error: "unauthorized" }, 401, {
      "www-authenticate": 'Bearer realm="nexora-creative"',
    });
  if (request.method.toUpperCase() !== "GET")
    return json({ error: "method_not_allowed" }, 405);
  try {
    const stored = await deps.store.read();
    if (stored.updatedAt === null) return json({ configured: false });
    const engines = await Promise.all(
      stored.config.engines.map(async (e) => {
        const { apiKeyRef, ...rest } = e;
        if (e.kind !== "cloud" || !apiKeyRef) return rest;
        try {
          return { ...rest, apiKey: await deps.resolveSecret(apiKeyRef) };
        } catch {
          deps.log.error("nexora creative : clé de moteur illisible", {
            engine: e.id,
          });
          return { ...rest, keyError: "secret_unavailable" };
        }
      }),
    );
    return json({
      configured: true,
      version: stored.config.version,
      updatedAt: stored.updatedAt.toISOString(),
      llm: stored.config.llm,
      engines,
    });
  } catch (error) {
    deps.log.error("nexora creative : lecture de la configuration", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}

export { defaultCreativeConfig };
