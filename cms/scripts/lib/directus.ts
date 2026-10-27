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

export class Directus {
  constructor(
    public url: string,
    public token: string,
  ) {}

  /** Connexion avec un jeton statique d'administrateur (DIRECTUS_ADMIN_TOKEN) ou le courriel et le mot de passe de l'env. */
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
    const res = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok)
      throw new Error(`Connexion administrateur refusée (${res.status})`);
    const json = (await res.json()) as { data: { access_token: string } };
    return new Directus(url, json.data.access_token);
  }

  async raw(
    method: string,
    path: string,
    body?: unknown,
    token = this.token,
  ): Promise<Response> {
    return fetch(`${this.url}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
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
  patch = async <T = unknown>(path: string, body: unknown): Promise<T> =>
    (await this.req<T>("PATCH", path, body)) as T;
  del = async <T = unknown>(path: string, body?: unknown): Promise<T> =>
    (await this.req<T>("DELETE", path, body)) as T;
}

export const log = (...parts: unknown[]) => console.log(...parts);
