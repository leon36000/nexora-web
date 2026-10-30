import { createHash } from "node:crypto";

/** Réponses et lectures communes aux routes `/api/code/*` : JSON, jamais mis en cache, erreurs au format OpenAI. */

export const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE, ...headers },
  });
}

/** Erreur de la forme `{ error: { code, message } }` (messages en français pour la personne). */
export function errorJson(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return json({ error: { code, message } }, status, headers);
}

export const methodNotAllowed = (allow: string) =>
  errorJson(405, "method_not_allowed", "Méthode non permise.", { allow });

/** Empreinte courte de l'adresse du client : jamais l'adresse elle-même en base ni au journal. */
export function addressKey(request: Request): string {
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  return createHash("sha256").update(forwarded).digest("hex").slice(0, 16);
}

export type BodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 400 | 413 };

/** Corps JSON (objet) d'au plus `maxBytes` octets ; un corps vide vaut `{}`. */
export async function readJsonObject(
  request: Request,
  maxBytes = 4096,
): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes)
    return { ok: false, status: 413 };
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes)
    return { ok: false, status: 413 };
  if (text.trim() === "") return { ok: true, value: {} };
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return { ok: false, status: 400 };
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400 };
  }
}
