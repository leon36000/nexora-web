import type { ProviderType } from "@nexora/db";
import { envSecretHostCheck, type SecretHostCheck } from "@nexora/vault/scope";

/**
 * « Tester le fournisseur » : un appel minimal (liste des modèles) avec la clé du coffre. Le résultat
 * ne contient qu'un résumé court : jamais le corps de la réponse ni la clé.
 */

export interface ProviderToTest {
  type: ProviderType;
  baseUrl: string;
  secretRef: string | null;
}

export interface ProviderCheck {
  ok: boolean;
  /** Résumé court, sans secret ni corps de réponse. */
  detail: string;
}

function listUrl(type: ProviderType, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (type === "ollama") return `${base.replace(/\/v1$/, "")}/api/tags`;
  return /\/v1$/.test(base) ? `${base}/models` : `${base}/v1/models`;
}

export async function testProvider(
  provider: ProviderToTest,
  deps: {
    getSecret: (ref: string) => Promise<string>;
    /** Hôtes où la clé peut partir (R9) ; défaut : NEXORA_SECRET_HOSTS_* de l'environnement. */
    secretHosts?: SecretHostCheck;
    fetch?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<ProviderCheck> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (provider.secretRef) {
    const forbidden = (deps.secretHosts ?? envSecretHostCheck)(
      "model-provider",
      provider.baseUrl,
    );
    if (forbidden)
      return { ok: false, detail: `clé non envoyée : ${forbidden}` };
    try {
      headers.authorization = `Bearer ${await deps.getSecret(provider.secretRef)}`;
    } catch {
      return {
        ok: false,
        detail: "clé introuvable ou révoquée dans le coffre",
      };
    }
  }
  const started = performance.now();
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(
      listUrl(provider.type, provider.baseUrl),
      {
        headers,
        // La garde d'adresse n'a vérifié que l'adresse d'origine : une redirection ne doit jamais être suivie
        // (la clé du coffre partirait vers une autre destination).
        redirect: "manual",
        signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      },
    );
  } catch {
    return {
      ok: false,
      detail: "fournisseur injoignable (réseau ou délai dépassé)",
    };
  }
  const ms = Math.round(performance.now() - started);
  if (res.status >= 300 && res.status < 400)
    return {
      ok: false,
      detail: `redirection HTTP ${res.status} non suivie : indiquez l'adresse finale du fournisseur`,
    };
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status} en ${ms} ms` };
  let count: number | null = null;
  try {
    const json = (await res.json()) as { data?: unknown[]; models?: unknown[] };
    const list = Array.isArray(json.data) ? json.data : json.models;
    count = Array.isArray(list) ? list.length : null;
  } catch {
    count = null;
  }
  return {
    ok: true,
    detail: `HTTP ${res.status} en ${ms} ms${count === null ? "" : `, ${count} modèle(s) listé(s)`}`,
  };
}
