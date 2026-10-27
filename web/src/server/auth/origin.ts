/**
 * Contrôle d'origine (CSRF) des routes qui modifient l'état et qui s'appuient sur le témoin de
 * session (facturation). Better Auth fait le même contrôle pour ses propres routes.
 *
 * Règle : `Origin` doit être exactement l'origine du site ; à défaut `Referer` de cette origine ;
 * à défaut seulement `Sec-Fetch-Site: same-origin`. Sans aucun de ces indices : refusé.
 */
export function isSameOriginRequest(
  request: Request,
  siteUrl: string,
): boolean {
  const site = new URL(siteUrl).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === site;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === site;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}
