import type { VaultKind } from "@nexora/db";

/**
 * Portée d'un secret : où une clé du coffre peut être ENVOYÉE. Les clés partent en en-tête d'autorisation vers des
 * adresses saisies dans l'administration (fournisseurs, instances WorkStudio, serveurs Proxmox) ; sans portée, un
 * administrateur pourrait désigner « stripe.secret_key » comme clé d'un fournisseur et la faire parvenir à son
 * propre serveur par « Tester le fournisseur » (le coffre ne relit jamais une clé, mais il peut l'utiliser).
 */
export type SecretScope = "model-provider" | "workstudio-instance" | "proxmox";

const KINDS: Record<SecretScope, readonly VaultKind[]> = {
  "model-provider": ["llm_provider"],
  "workstudio-instance": ["llm_provider", "other"],
  proxmox: ["proxmox"],
};

/** Secrets de la plateforme (dont la clé SSH du worker, `vps.*`) : jamais envoyés vers une adresse saisie. */
const RESERVED_REF = /^(stripe|site-agent|seo|directus|vps)[._-]/;

/** null si l'usage est permis, sinon un motif (sans valeur de secret). `kind` null : secret pas encore déposé. */
export function secretScopeProblem(
  scope: SecretScope,
  ref: string,
  kind: VaultKind | null,
): string | null {
  if (RESERVED_REF.test(ref))
    return "référence réservée à la plateforme : elle ne peut pas servir d'identifiant vers une adresse saisie";
  if (kind !== null && !KINDS[scope].includes(kind))
    return `ce secret est de type « ${kind} » : usage refusé ici (types admis : ${KINDS[scope].join(", ")})`;
  return null;
}

/**
 * Hôtes autorisés par type de secret (R9). Même avec la bonne portée de type, un détenteur du jeton d'administration
 * pourrait déclarer un fournisseur dont l'adresse est SON serveur HTTPS public et lui associer la clé d'un autre
 * fournisseur : « Tester le fournisseur », la synchronisation LiteLLM ou l'instance WorkStudio y enverraient la clé.
 * La liste des destinations possibles d'une clé est donc fixée par l'OPÉRATEUR, dans l'environnement du serveur (jamais
 * dans l'administration, qu'un jeton volé modifie) :
 *
 *  - NEXORA_SECRET_HOSTS_MODEL_PROVIDER, NEXORA_SECRET_HOSTS_WORKSTUDIO, NEXORA_SECRET_HOSTS_PROXMOX : hôtes séparés par
 *    des virgules, exacts (`llm.interne.exemple`, `192.168.10.5`) ou `*.domaine` (sous-domaines, jamais le domaine
 *    lui-même). `-hôte` retire un hôte par défaut. Un joker seul ou une entrée illisible est ignoré (fermé).
 *  - Valeurs par défaut : fournisseurs de modèles connus (HTTPS seulement) ; rien pour WorkStudio ni Proxmox, qui sont
 *    des serveurs de l'opérateur et doivent être déclarés. Un hôte déclaré par l'opérateur peut être en HTTP
 *    (réseau interne : `host.docker.internal`…).
 *  - Hors production (NODE_ENV différent de « production »), la boucle locale est admise.
 *
 * La garde SSRF de @nexora/net (NEXORA_OUTBOUND_ALLOW) reste distincte : elle dit où le serveur peut ALLER, cette liste
 * dit où une CLÉ peut partir. Les deux doivent passer.
 */
const HOST_ENV: Record<SecretScope, string> = {
  "model-provider": "NEXORA_SECRET_HOSTS_MODEL_PROVIDER",
  "workstudio-instance": "NEXORA_SECRET_HOSTS_WORKSTUDIO",
  proxmox: "NEXORA_SECRET_HOSTS_PROXMOX",
};

const SCOPE_LABEL: Record<SecretScope, string> = {
  "model-provider": "fournisseur de modèles",
  "workstudio-instance": "instance WorkStudio",
  proxmox: "serveur Proxmox",
};

/** Fournisseurs de modèles connus : interfaces publiques des éditeurs, atteintes en HTTPS seulement. */
const DEFAULT_HOSTS: Record<SecretScope, readonly string[]> = {
  "model-provider": [
    "openrouter.ai",
    "api.openai.com",
    "api.anthropic.com",
    "api.mistral.ai",
    "generativelanguage.googleapis.com",
    "api.groq.com",
    "api.together.xyz",
    "api.deepseek.com",
    "api.z.ai",
    "api.minimax.io",
    "api.moonshot.ai",
    "api.cohere.com",
    "api.fireworks.ai",
    "api.x.ai",
    "api.perplexity.ai",
    "api.cerebras.ai",
    "api.deepinfra.com",
    "integrate.api.nvidia.com",
  ],
  "workstudio-instance": [],
  proxmox: [],
};

const HOST_ENTRY =
  /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Minuscules, sans crochets ni point final. */
function normalizeHost(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

const isIpLiteral = (host: string) => IPV4.test(host) || host.includes(":");

function isLoopbackHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

function hostMatches(host: string, entry: string): boolean {
  if (entry.startsWith("*.")) {
    if (isIpLiteral(host)) return false;
    return host.endsWith(entry.slice(1)) && host.length > entry.length - 1;
  }
  return host === entry;
}

/** Hôte et schéma d'une destination : une URL complète ou un nom d'hôte seul (Proxmox). */
function destinationOf(
  target: string,
): { host: string; secure: boolean | null } | null {
  if (target.includes("://")) {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return {
      host: normalizeHost(url.hostname),
      secure: url.protocol === "https:",
    };
  }
  const host = normalizeHost(target);
  return /^[^\s/@?#]+$/.test(host) ? { host, secure: null } : null;
}

/**
 * null si la clé de ce type peut partir vers `target` (URL ou nom d'hôte), sinon un motif en français (sans secret).
 * `env` : l'environnement du serveur (défaut : celui du processus, lu à chaque appel).
 */
export function secretHostProblem(
  scope: SecretScope,
  target: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const dest = destinationOf(target);
  if (!dest || !dest.host)
    return "adresse illisible : la clé ne peut pas y être envoyée";
  const operator = (env[HOST_ENV[scope]] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const removed = new Set(
    operator
      .filter((e) => e.startsWith("-"))
      .map((e) => normalizeHost(e.slice(1))),
  );
  const declared = operator
    .filter((e) => !e.startsWith("-"))
    .map(normalizeHost)
    .filter((e) => HOST_ENTRY.test(e) || isIpLiteral(e));
  if (
    env.NODE_ENV !== "production" &&
    isLoopbackHost(dest.host) &&
    !removed.has(dest.host)
  )
    return null;
  if (declared.some((e) => hostMatches(dest.host, e))) return null;
  const known = DEFAULT_HOSTS[scope].filter((e) => !removed.has(e));
  if (known.some((e) => hostMatches(dest.host, e)))
    return dest.secure === false
      ? `la clé d'un ${SCOPE_LABEL[scope]} ne part qu'en HTTPS vers « ${dest.host} »`
      : null;
  return `hôte « ${dest.host} » non autorisé pour la clé d'un ${SCOPE_LABEL[scope]} : l'opérateur doit le déclarer dans ${HOST_ENV[scope]} (environnement du serveur)`;
}

/** Contrôle d'hôte injectable (défaut : environnement du processus) : les tests y mettent un contrôle permissif. */
export type SecretHostCheck = (
  scope: SecretScope,
  target: string,
) => string | null;

export const envSecretHostCheck: SecretHostCheck = (scope, target) =>
  secretHostProblem(scope, target, process.env);
