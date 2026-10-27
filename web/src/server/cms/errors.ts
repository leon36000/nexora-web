/** Directus injoignable, lent, ou réponse HTTP en erreur : on retombe sur la dernière version connue. */
export class CmsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsUnavailableError";
  }
}

/** Réponse reçue mais inexploitable (forme inattendue, aucun bloc affichable). Traitée comme une panne. */
export class CmsContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsContentError";
  }
}

export function isCmsError(
  e: unknown,
): e is CmsUnavailableError | CmsContentError {
  return e instanceof CmsUnavailableError || e instanceof CmsContentError;
}
