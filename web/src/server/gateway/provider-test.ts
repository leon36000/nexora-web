import type { ProviderType } from "@nexora/db";

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
    fetch?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<ProviderCheck> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (provider.secretRef) {
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
