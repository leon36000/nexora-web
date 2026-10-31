import "server-only";
import { envSecretHostCheck } from "@nexora/vault/scope";
import { getDb } from "../db";
import { listModels, listProviders, listRoutes } from "../gateway/catalog";
import { log } from "../log";
import { getSecretForScope } from "../vault";
import { listSecrets } from "../vault/store";
import type { CatalogModelOption, CreativeAdminDeps } from "./handlers";
import { pgCreativeStore } from "./store";

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|.*\.(internal|local|localhost)$|host\.docker\.internal$)/;

/** Un fournisseur est « local » s'il tourne sur nos machines (vLLM, Ollama, ou une adresse privée), sinon « cloud ». */
export function providerHosting(p: {
  type: string;
  baseUrl: string;
}): "local" | "cloud" {
  if (p.type === "vllm" || p.type === "ollama") return "local";
  try {
    return PRIVATE_HOST.test(new URL(p.baseUrl).hostname.toLowerCase())
      ? "local"
      : "cloud";
  } catch {
    return "cloud";
  }
}

/** Dépendances de production, lues à chaque requête. */
export function creativeAdminDeps(): CreativeAdminDeps {
  return {
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    serviceToken: process.env.NEXORA_CREATIVE_SERVICE_TOKEN,
    store: pgCreativeStore(getDb()),
    catalog: async (): Promise<CatalogModelOption[]> => {
      const db = getDb();
      const [models, providers] = await Promise.all([
        listModels(db),
        listProviders(db),
      ]);
      const hostingOf = new Map(
        providers.map((p) => [p.id, providerHosting(p)]),
      );
      const out: CatalogModelOption[] = [];
      for (const m of models) {
        if (
          m.kind !== "chat" ||
          (m.status !== "published" && m.status !== "approved")
        )
          continue;
        const routes = (await listRoutes(db, m.id)).filter((r) => r.enabled);
        const local = routes.some(
          (r) => hostingOf.get(r.providerId) === "local",
        );
        out.push({
          publicId: m.publicId,
          label: m.name,
          hosting: local ? "local" : "cloud",
        });
      }
      return out;
    },
    secrets: async () =>
      (await listSecrets(getDb()))
        .filter((s) => !s.revokedAt)
        .map((s) => ({ ref: s.ref, kind: s.kind })),
    resolveSecret: (ref) => getSecretForScope("creative-engine", ref),
    secretHosts: envSecretHostCheck,
    log,
  };
}
