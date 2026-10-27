// Revalidation de Next.js après une publication : POST ${NEXORA_APP_INTERNAL_URL}/api/revalidate.
// L'échec n'est jamais bloquant et ne journalise ni le jeton ni le corps de la réponse.

type Logger = { warn: (msg: string) => void; info: (msg: string) => void };

export type RevalidateBody = {
  collection: string;
  id: string;
  slugs: string[];
};

/**
 * Problème de configuration de la revalidation (null si tout est posé). Sert au démarrage de l'extension : sans
 * NEXORA_APP_INTERNAL_URL (aucun défaut ici : il dépend du réseau de l'hôte) ni jeton, aucune publication ne
 * rafraîchit le site, et on ne s'en apercevait qu'au premier clic sur « publier ». Ne cite jamais de valeur.
 */
export function revalidateConfigProblem(
  env: Record<string, unknown>,
): string | null {
  const missing: string[] = [];
  if (!String(env.NEXORA_APP_INTERNAL_URL ?? "").trim())
    missing.push("NEXORA_APP_INTERNAL_URL");
  if (!String(env.NEXORA_APP_ADMIN_TOKEN ?? "").trim())
    missing.push("NEXORA_APP_ADMIN_TOKEN");
  if (missing.length === 0) return null;
  return `${missing.join(" et ")} non défini(s) : une publication ne rafraîchira PAS le site (les pages publiées n'apparaîtront qu'à l'expiration du cache)`;
}

export async function revalidate(
  body: RevalidateBody,
  deps: {
    env: Record<string, unknown>;
    logger: Logger;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<boolean> {
  const base = String(deps.env.NEXORA_APP_INTERNAL_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const token = String(deps.env.NEXORA_APP_ADMIN_TOKEN ?? "");
  if (!base || !token) {
    deps.logger.warn(
      "[nexora-guard] revalidation ignorée : NEXORA_APP_INTERNAL_URL ou NEXORA_APP_ADMIN_TOKEN non défini",
    );
    return false;
  }
  const f = deps.fetchFn ?? fetch;
  try {
    const res = await f(`${base}/api/revalidate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        collection: body.collection,
        id: body.id,
        slugs: body.slugs,
      }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 5000),
    });
    if (!res.ok) {
      deps.logger.warn(
        `[nexora-guard] revalidation refusée (${res.status}) pour ${body.collection}/${body.id}`,
      );
      return false;
    }
    deps.logger.info(
      `[nexora-guard] revalidation envoyée pour ${body.collection}/${body.id} (${body.slugs.length} slug(s))`,
    );
    return true;
  } catch (e) {
    // le message d'erreur du réseau peut citer les en-têtes : on ne journalise que le nom de l'erreur
    deps.logger.warn(
      `[nexora-guard] revalidation en échec pour ${body.collection}/${body.id} (${e instanceof Error ? e.name : "erreur"})`,
    );
    return false;
  }
}
