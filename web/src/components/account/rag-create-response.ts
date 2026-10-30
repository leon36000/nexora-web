/**
 * Lecture des réponses de `POST /api/account/rag` (chantier B, `docs/rag.md` §1) côté navigateur. Module pur, sans
 * dépendance serveur : le formulaire « Créer mon RAG » le charge. Le texte d'une erreur du serveur n'est jamais repris :
 * seul un code connu choisit un message du dictionnaire.
 */
export type RagErrorKey =
  | "quota_exceeded"
  | "no_credits"
  | "base_exists"
  | "base_limit"
  | "key_limit"
  | "model_unavailable"
  | "unavailable"
  | "rate_limited"
  | "forbidden"
  | "unauthenticated"
  | "generic";

const BY_CODE: Record<string, RagErrorKey> = {
  quota_exceeded: "quota_exceeded",
  insufficient_quota: "no_credits",
  base_exists: "base_exists",
  base_limit: "base_limit",
  key_limit: "key_limit",
  model_unavailable: "model_unavailable",
  rag_unavailable: "unavailable",
  unavailable: "unavailable",
  rate_limited: "rate_limited",
  forbidden: "forbidden",
  unauthenticated: "unauthenticated",
};

function codeOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export function ragErrorKey(status: number, body: unknown): RagErrorKey {
  const code = codeOf(body);
  if (code && Object.hasOwn(BY_CODE, code)) return BY_CODE[code] as RagErrorKey;
  if (status === 429) return "rate_limited";
  if (status === 401) return "unauthenticated";
  return "generic";
}

export interface RagCreated {
  baseId: string;
  baseName: string;
  /** Valeur de la clé : montrée une seule fois, jamais conservée. */
  keyValue: string;
}

export function parseRagCreated(body: unknown): RagCreated | null {
  if (!body || typeof body !== "object") return null;
  const { base, key } = body as {
    base?: { id?: unknown; name?: unknown };
    key?: { value?: unknown };
  };
  if (
    typeof base?.id !== "string" ||
    typeof base.name !== "string" ||
    typeof key?.value !== "string"
  )
    return null;
  return { baseId: base.id, baseName: base.name, keyValue: key.value };
}
