// Client minimal de l'API Directus pour les scripts de schéma et de contenu.
// Règle : aucun secret dans les messages d'erreur ni dans les journaux (on n'affiche jamais le corps envoyé).

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Enveloppe JSON de l'API Directus : `data` en cas de succès, `errors` en cas d'échec. */
type Envelope = {
  data?: unknown;
  errors?: { message?: string; extensions?: { code?: string } }[];
} | null;

/** Entité Directus (collection, champ, relation, rôle, etc.) : les champs se lisent au cas par cas. */
export type Entity = {
  meta?: Record<string, unknown> | null;
  [field: string]: unknown;
};

export class DirectusError extends Error {
  constructor(
    public method: string,
    public path: string,
    public status: number,
    public code: string,
    detail: string,
  ) {
    super(
      `${method} ${path} -> ${status} ${code}${detail ? ` : ${detail}` : ""}`,
    );
  }
}

/** Lit un fichier .env sans l'exporter ni l'afficher. */
export function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2] ?? "";
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[m[1] as string] = v;
  }
  return out;
}

export function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

/** Fichier .env : NEXORA_ENV_FILE, sinon `deploy/.env` du dépôt courant. */
export function envFilePath(): string {
  const p = process.env.NEXORA_ENV_FILE ?? join(repoRoot(), "deploy", ".env");
  if (!existsSync(p))
    throw new Error(
      `Fichier d'environnement introuvable : ${p} (définir NEXORA_ENV_FILE)`,
    );
  return p;
}

export function appendEnvVar(path: string, name: string, value: string) {
  const current = readFileSync(path, "utf8");
  const prefix = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  appendFileSync(path, `${prefix}${name}=${value}\n`, { mode: 0o600 });
}

/** Message d'échec de connexion, sans secret ; distingue le cas « 2FA requise » (INVALID_OTP) du mot de passe refusé. */
export async function loginFailure(
  res: Response,
  otpGiven: boolean,
): Promise<string> {
  let code = "";
  try {
    const body = (await res.json()) as Envelope;
    code = body?.errors?.[0]?.extensions?.code ?? "";
  } catch {
    // corps absent ou illisible
  }
  if (code === "INVALID_OTP")
    return otpGiven
      ? `Connexion administrateur refusée (${res.status}) : code à usage unique (DIRECTUS_ADMIN_OTP) invalide ou expiré`
      : `Connexion administrateur refusée (${res.status}) : ce compte a activé la 2FA. Utilisez DIRECTUS_ADMIN_TOKEN (jeton statique, à préférer) ou fournissez DIRECTUS_ADMIN_OTP`;
  return `Connexion administrateur refusée (${res.status})`;
}

/**
 * Réessaie une requête refusée par la limitation de débit de Directus (429, RATE_LIMITER_*) : attend le délai
 * `Retry-After` (secondes) ou, à défaut, un délai court croissant, puis recommence. Rend le dernier 429 après
 * `maxRetries` nouvelles tentatives. Les autres réponses (succès comme erreurs) sont rendues telles quelles.
 */
export async function withRateLimitRetry(
  attempt: () => Promise<Response>,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
  maxRetries = 8,
): Promise<Response> {
  let res = await attempt();
  for (let n = 0; res.status === 429 && n < maxRetries; n++) {
    const header = Number(res.headers.get("retry-after"));
    await sleep(
      Number.isFinite(header) && header >= 0 && res.headers.has("retry-after")
        ? header * 1000
        : 250 * (n + 1),
    );
    res = await attempt();
  }
  return res;
}

export class Directus {
  constructor(
    public url: string,
    public token: string,
  ) {}

  /**
   * Connexion avec un jeton statique d'administrateur (DIRECTUS_ADMIN_TOKEN, À PRÉFÉRER : il ne dépend ni d'un mot de
   * passe ni d'un code à usage unique), sinon courriel et mot de passe de l'env. Un administrateur qui a activé la 2FA
   * (exigée par apply.ts, CMS_ENFORCE_TFA) doit aussi fournir DIRECTUS_ADMIN_OTP (code à 6 chiffres, valable ~30 s).
   */
  static async connect(
    url: string,
    env: Record<string, string>,
  ): Promise<Directus> {
    const staticToken =
      process.env.DIRECTUS_ADMIN_TOKEN ?? env.DIRECTUS_ADMIN_TOKEN;
    if (staticToken) return new Directus(url, staticToken);
    const email = env.DIRECTUS_ADMIN_EMAIL;
    const password = env.DIRECTUS_ADMIN_PASSWORD;
    if (!email || !password)
      throw new Error(
        "DIRECTUS_ADMIN_EMAIL et DIRECTUS_ADMIN_PASSWORD (ou DIRECTUS_ADMIN_TOKEN) sont requis",
      );
    const otp = process.env.DIRECTUS_ADMIN_OTP ?? env.DIRECTUS_ADMIN_OTP;
    const res = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, ...(otp ? { otp } : {}) }),
    });
    if (!res.ok) throw new Error(await loginFailure(res, Boolean(otp)));
    const json = (await res.json()) as { data: { access_token: string } };
    return new Directus(url, json.data.access_token);
  }

  async raw(
    method: string,
    path: string,
    body?: unknown,
    token = this.token,
  ): Promise<Response> {
    return withRateLimitRetry(() =>
      fetch(`${this.url}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    );
  }

  /** Requête ; renvoie `data` ou lève DirectusError. `allow` liste les statuts HTTP tolérés (renvoie alors null). */
  async req<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    allow: number[] = [],
  ): Promise<T | null> {
    const res = await this.raw(method, path, body);
    if (res.status === 204) return null as T;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const envelope = json as Envelope;
    if (!res.ok) {
      if (allow.includes(res.status)) return null;
      const e = envelope?.errors?.[0];
      throw new DirectusError(
        method,
        path,
        res.status,
        e?.extensions?.code ?? "ERREUR",
        e?.message ?? "",
      );
    }
    return (envelope?.data ?? json) as T;
  }

  get = <T = unknown>(path: string, allow: number[] = []) =>
    this.req<T>("GET", path, undefined, allow);
  // Écritures : Directus renvoie toujours la ressource (aucun statut toléré), d'où un résultat non nul.
  post = async <T = unknown>(path: string, body: unknown): Promise<T> =>
    (await this.req<T>("POST", path, body)) as T;
  /** Téléversement multipart (ex. POST /files) : le type de contenu de la requête est posé par fetch. */
  postFile = async <T = unknown>(path: string, form: FormData): Promise<T> => {
    const res = await fetch(`${this.url}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}` },
      body: form,
    });
    const text = await res.text();
    const json = (text ? safeJson(text) : null) as Envelope;
    if (!res.ok) {
      const e = json?.errors?.[0];
      throw new DirectusError(
        "POST",
        path,
        res.status,
        e?.extensions?.code ?? "ERREUR",
        e?.message ?? "",
      );
    }
    return (json?.data ?? json) as T;
  };
  patch = async <T = unknown>(path: string, body: unknown): Promise<T> =>
    (await this.req<T>("PATCH", path, body)) as T;
  del = async <T = unknown>(path: string, body?: unknown): Promise<T> =>
    (await this.req<T>("DELETE", path, body)) as T;
}

export const log = (...parts: unknown[]) => console.log(...parts);

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
