import type { Database, ProviderType } from "@nexora/db";
import { envSecretHostCheck, type SecretHostCheck } from "@nexora/vault/scope";
import {
  type CatalogVersion,
  getPublishedCatalog,
  markApplied,
} from "./catalog";
import type { SnapshotModel, SnapshotProvider } from "./snapshot";

/**
 * Client et synchronisation LiteLLM (D1/D3). LiteLLM n'est qu'un moteur d'appel interne : ses
 * modèles et ses crédentials sont entièrement dérivés du catalogue PUBLIÉ. Les objets que Nexora
 * gère portent un préfixe (`nxm-` pour les modèles, `nexora-prov-` pour les crédentials) ; ceux
 * déclarés ailleurs (fichier de configuration) ne sont jamais touchés.
 */

export const MODEL_ID_PREFIX = "nxm-";
export const CREDENTIAL_PREFIX = "nexora-prov-";

export class LitellmError extends Error {
  readonly status: number;
  readonly operation: string;
  /** Jamais le corps de la réponse : il peut contenir des valeurs de crédentials. */
  constructor(operation: string, status: number) {
    super(`LiteLLM : ${operation} a échoué (${status || "réseau"})`);
    this.name = "LitellmError";
    this.status = status;
    this.operation = operation;
  }
}

export interface LitellmConfig {
  baseUrl: string;
  masterKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export type LitellmModelParams = {
  modelName: string;
  id: string;
  model: string;
  credentialName: string;
  mode: "chat" | "embedding";
};

export function createLitellmClient(config: LitellmConfig) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const f = config.fetch ?? fetch;
  async function call(
    operation: string,
    method: string,
    path: string,
    body?: unknown,
    okStatuses: number[] = [],
  ): Promise<{ status: number; json: unknown }> {
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${config.masterKey}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs ?? 20_000),
      });
    } catch {
      throw new LitellmError(operation, 0);
    }
    if (!res.ok && !okStatuses.includes(res.status))
      throw new LitellmError(operation, res.status);
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }

  const modelBody = (m: LitellmModelParams) => ({
    model_name: m.modelName,
    litellm_params: {
      model: m.model,
      litellm_credential_name: m.credentialName,
    },
    model_info: { id: m.id, mode: m.mode },
  });

  return {
    async listManagedModelIds(): Promise<string[]> {
      const { json } = await call("model/info", "GET", "/model/info");
      const data =
        (json as { data?: { model_info?: { id?: string } }[] })?.data ?? [];
      return data
        .map((m) => m.model_info?.id)
        .filter(
          (id): id is string =>
            typeof id === "string" && id.startsWith(MODEL_ID_PREFIX),
        );
    },
    async listCredentialNames(): Promise<string[]> {
      const { json } = await call("credentials", "GET", "/credentials");
      const list =
        (json as { credentials?: { credential_name?: string }[] })
          ?.credentials ?? [];
      return list
        .map((c) => c.credential_name)
        .filter(
          (n): n is string =>
            typeof n === "string" && n.startsWith(CREDENTIAL_PREFIX),
        );
    },
    async upsertCredential(
      name: string,
      values: { api_key?: string; api_base?: string },
      exists: boolean,
    ) {
      const info = { managed_by: "nexora" };
      if (exists)
        await call(
          "credentials.update",
          "PATCH",
          `/credentials/${encodeURIComponent(name)}`,
          {
            credential_info: info,
            credential_values: values,
          },
        );
      else
        await call("credentials.create", "POST", "/credentials", {
          credential_name: name,
          credential_info: info,
          credential_values: values,
        });
    },
    async createModel(m: LitellmModelParams) {
      await call("model/new", "POST", "/model/new", modelBody(m));
    },
    async updateModel(m: LitellmModelParams) {
      await call("model/update", "POST", "/model/update", modelBody(m));
    },
    async deleteModel(id: string) {
      await call("model/delete", "POST", "/model/delete", { id }, [404]);
    },
    async deleteCredential(name: string) {
      await call(
        "credentials.delete",
        "DELETE",
        `/credentials/${encodeURIComponent(name)}`,
        undefined,
        [404],
      );
    },
    async healthy(): Promise<boolean> {
      try {
        const res = await f(`${base}/health/liveliness`, {
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
export type LitellmClient = ReturnType<typeof createLitellmClient>;

// ─── Correspondances Nexora → LiteLLM ───────────────────────────────────────────

export const credentialNameOf = (provider: Pick<SnapshotProvider, "code">) =>
  `${CREDENTIAL_PREFIX}${provider.code}`;

export const modelIdOf = (publicId: string) =>
  `${MODEL_ID_PREFIX}${publicId.replace(/[^a-z0-9._-]+/gi, "-")}`;

/** Nom de modèle LiteLLM selon le type de fournisseur. */
export function litellmModelString(
  type: ProviderType,
  upstreamId: string,
): string {
  if (type === "openrouter") return `openrouter/${upstreamId}`;
  if (type === "ollama") return `ollama_chat/${upstreamId}`;
  return `openai/${upstreamId}`;
}

/** Adresse de base attendue par LiteLLM : `/v1` ajouté pour les API compatibles OpenAI. */
export function apiBaseFor(
  type: ProviderType,
  url: string,
): string | undefined {
  const clean = url.replace(/\/+$/, "");
  if (type === "ollama") return clean.replace(/\/v1$/, "");
  if (type === "openrouter" && /openrouter\.ai/.test(clean)) return undefined;
  return /\/v1$/.test(clean) || /\/api\/v1$/.test(clean)
    ? clean
    : `${clean}/v1`;
}

export interface SyncSummary {
  version: string;
  models: { created: string[]; updated: string[]; deleted: string[] };
  credentials: { upserted: string[]; deleted: string[] };
}

export class SyncError extends Error {
  readonly code:
    | "no_published_catalog"
    | "litellm_unavailable"
    | "secret_unavailable"
    | "secret_host";
  constructor(code: SyncError["code"], message: string) {
    super(message);
    this.name = "SyncError";
    this.code = code;
  }
}

export interface SyncDeps {
  client: LitellmClient;
  /** Valeur du secret du coffre ; jamais journalisée ni renvoyée. */
  getSecret: (ref: string) => Promise<string>;
  /** Hôtes où une clé peut partir (R9) ; défaut : NEXORA_SECRET_HOSTS_* de l'environnement. */
  secretHosts?: SecretHostCheck;
  now?: () => Date;
}

/**
 * Pousse le catalogue PUBLIÉ dans LiteLLM (crédentials d'abord, puis modèles), supprime ce que
 * Nexora gère et qui n'est plus publié, et écrit en retour l'état « appliqué » avec sa date.
 * Rejouable : chaque appel réconcilie l'état complet.
 */
export async function syncLitellm(
  db: Database,
  deps: SyncDeps,
): Promise<{ version: CatalogVersion; summary: SyncSummary }> {
  const published = await getPublishedCatalog(db);
  if (!published)
    throw new SyncError("no_published_catalog", "aucun catalogue publié");
  const { client } = deps;
  const now = deps.now ?? (() => new Date());
  const summary: SyncSummary = {
    version: published.short,
    models: { created: [], updated: [], deleted: [] },
    credentials: { upserted: [], deleted: [] },
  };
  try {
    const providers = new Map(
      published.snapshot.providers.map((p) => [p.id, p]),
    );
    const nowMs = now().getTime();
    const wanted: { model: SnapshotModel; provider: SnapshotProvider }[] = [];
    for (const model of published.snapshot.models) {
      const provider = providers.get(model.providerId);
      if (!provider?.enabled) continue;
      if (model.sunsetAt && Date.parse(model.sunsetAt) <= nowMs) continue;
      wanted.push({ model, provider });
    }

    const existingCreds = new Set(await client.listCredentialNames());
    const usedProviders = new Map(
      wanted.map((w) => [w.provider.id, w.provider]),
    );
    for (const provider of usedProviders.values()) {
      const values: { api_key?: string; api_base?: string } = {};
      if (provider.secretRef) {
        // La clé part vers l'adresse que LiteLLM appellera : elle doit être autorisée par l'opérateur (R9).
        const forbidden = (deps.secretHosts ?? envSecretHostCheck)(
          "model-provider",
          provider.litellmBaseUrl ?? provider.baseUrl,
        );
        if (forbidden)
          throw new SyncError(
            "secret_host",
            `fournisseur « ${provider.code} » : ${forbidden}`,
          );
        try {
          values.api_key = await deps.getSecret(provider.secretRef);
        } catch {
          throw new SyncError(
            "secret_unavailable",
            `clé du fournisseur « ${provider.code} » illisible dans le coffre`,
          );
        }
      }
      const apiBase = apiBaseFor(
        provider.type,
        provider.litellmBaseUrl ?? provider.baseUrl,
      );
      if (apiBase) values.api_base = apiBase;
      const name = credentialNameOf(provider);
      await client.upsertCredential(name, values, existingCreds.has(name));
      summary.credentials.upserted.push(name);
    }

    const existingModels = new Set(await client.listManagedModelIds());
    const wantedIds = new Set<string>();
    for (const { model, provider } of wanted) {
      const params: LitellmModelParams = {
        id: modelIdOf(model.publicId),
        modelName: model.publicId,
        model: litellmModelString(provider.type, model.upstreamId),
        credentialName: credentialNameOf(provider),
        mode: model.kind,
      };
      wantedIds.add(params.id);
      if (existingModels.has(params.id)) {
        await client.updateModel(params);
        summary.models.updated.push(model.publicId);
      } else {
        await client.createModel(params);
        summary.models.created.push(model.publicId);
      }
    }
    for (const id of existingModels) {
      if (wantedIds.has(id)) continue;
      await client.deleteModel(id);
      summary.models.deleted.push(id);
    }
    const usedCreds = new Set(summary.credentials.upserted);
    for (const name of existingCreds) {
      if (usedCreds.has(name)) continue;
      await client.deleteCredential(name);
      summary.credentials.deleted.push(name);
    }
  } catch (error) {
    const code =
      error instanceof SyncError
        ? error.code
        : error instanceof LitellmError
          ? `litellm_${error.operation}_${error.status || "reseau"}`
          : "internal_error";
    await markApplied(
      db,
      published.id,
      { status: "failed", detail: { error: code } },
      now(),
    );
    if (error instanceof LitellmError)
      throw new SyncError("litellm_unavailable", error.message);
    throw error;
  }
  await markApplied(
    db,
    published.id,
    {
      status: "applied",
      detail: summary as unknown as Record<string, unknown>,
    },
    now(),
  );
  return {
    version: { ...published, appliedAt: now(), appliedStatus: "applied" },
    summary,
  };
}
