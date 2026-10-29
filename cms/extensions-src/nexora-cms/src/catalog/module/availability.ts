// Disponibilité d'un modèle : « en service » (appelable) ou « aperçu » (visible au catalogue public avec sa fiche et ses
// prix, pas encore appelable). Logique pure de l'assistant « Ajouter un modèle » et de l'écran des modèles ; le serveur
// reste juge (garde de publication, passage en service).

export type Availability = "live" | "preview";

export const PREVIEW_LABEL =
  "Aperçu : visible au catalogue, pas encore appelable";

export const PREVIEW_HELP =
  "Le modèle est publié au catalogue public avec sa fiche et ses prix, mais il ne peut pas être appelé : un appel reçoit une réponse 404 « model_not_available », rien n’est réservé ni facturé, et il n’est pas listé dans /v1/models. La clé du fournisseur n’est pas exigée pour le publier. Quand la clé est dans le Coffre, utilisez « Passer en service » : les contrôles complets s’appliquent alors.";

/**
 * Phrase proposant de cocher l'aperçu quand le fournisseur choisi n'a pas (encore) sa clé dans le Coffre ; vide sinon.
 * `secretPresent` : true = clé active, false = absente ou révoquée, null = aucune clé (fournisseur sans clé).
 */
export function previewSuggestion(
  provider:
    | {
        type: string;
        secretRef: string | null;
        secretPresent?: boolean | null;
      }
    | undefined,
): string {
  if (!provider || provider.secretRef === null) return "";
  if (provider.secretPresent !== false) return "";
  return `La clé « ${provider.secretRef} » n’est pas encore dans le Coffre : sans elle, le modèle ne peut pas être publié en service. Cochez « Aperçu » pour l’afficher au catalogue en attendant.`;
}

/** « Passer en service » : un modèle publié, actuellement en aperçu. */
export function canPromote(model: {
  status: string;
  availability?: string;
}): boolean {
  return model.status === "published" && model.availability === "preview";
}
