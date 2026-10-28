import type { Database } from "@nexora/db";
import { readVaultSecret } from "@nexora/vault";
import { keepJobAlive } from "../keepalive.ts";
import type { JobHandler } from "../registry.ts";
import { createAgentDirectus } from "./directus-client.ts";
import { createGatewayClient } from "./gateway-client.ts";
import { redacteur } from "./redacteur.ts";
import { executeRun, type RunnerDeps } from "./runner.ts";
import { createSanteAgent } from "./sante.ts";
import { seoOnPage } from "./seo-onpage.ts";
import { traducteur } from "./traducteur.ts";
import { veille } from "./veille.ts";

export type { RunnerDeps } from "./runner.ts";

type Env = Record<string, string | undefined>;

/** Dépendances de production, lues dans l'environnement du worker. */
export function productionRunnerDeps(
  db: Database,
  log: RunnerDeps["log"],
  env: Env = process.env,
): RunnerDeps {
  // Les repli de développement n'existent pas en production : une adresse oubliée y ferait appeler « localhost »
  // en silence. Le worker refuse alors de démarrer, avec le nom de la variable manquante.
  const production = env.NODE_ENV === "production";
  const required = (name: string, devDefault: string): string => {
    const value = env[name]?.trim();
    if (value) return value;
    if (production)
      throw new Error(
        `${name} est obligatoire en production (agents du site) : aucune adresse de développement par défaut`,
      );
    return devDefault;
  };
  const appUrl = required("NEXORA_APP_INTERNAL_URL", "http://127.0.0.1:3500");
  const directusUrl = required("DIRECTUS_URL", "http://localhost:8456");
  return {
    db,
    log,
    readSecret: (ref) => readVaultSecret(db, ref),
    gateway: (apiKey) => createGatewayClient({ baseUrl: appUrl, apiKey }),
    directus: (token) => createAgentDirectus({ baseUrl: directusUrl, token }),
    agents: {
      redacteur,
      traducteur,
      seo: seoOnPage,
      veille,
      sante: createSanteAgent({
        db,
        gatewayBaseUrl: appUrl,
        litellmBaseUrl: env.LITELLM_BASE_URL,
      }),
    },
    // La boucle locale n'est admise comme source qu'en développement.
    ingest: { allowLoopback: env.NODE_ENV !== "production" },
  };
}

/** Tâche `site-agent.run` : { runId }. Les erreurs de l'agent sont consignées dans l'exécution, pas relancées. */
export function createSiteAgentRunHandler(deps: RunnerDeps): JobHandler {
  return async (job, ctx) => {
    const runId = job.payload.runId;
    if (typeof runId !== "string") throw new Error("runId manquant");
    const stop = keepJobAlive(deps.db, job.id);
    try {
      const outcome = await executeRun(deps, runId, ctx.signal);
      ctx.log.info("site-agent.run", { runId, outcome });
    } finally {
      stop();
    }
  };
}
