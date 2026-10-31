/**
 * Sujet du formulaire de contact (`/contact?sujet=…`). Module sans dépendance : le formulaire est un composant
 * client, il ne doit tirer aucun dictionnaire.
 *
 * Chaque sujet présélectionne un besoin de `LEAD_NEEDS` (@nexora/db) ; les sujets des fiches Nexora Apps
 * (`apps-<identifiant>`) préremplissent aussi le message (`contact.form.message.prefill`), pour que l'équipe sache de
 * quel outil la liste d'attente parle.
 */
export const CONTACT_SUBJECTS: Readonly<Record<string, string>> = {
  demonstration: "opsys-ai",
  "etude-deploiement": "installation",
  diagnostic: "diagnostic",
  "pilote-vision": "vision",
  "acces-croissance": "croissance",
  "apps-code": "autre",
  "apps-bot": "autre",
  "apps-wordpress": "autre",
  "apps-gitspace": "autre",
  "apps-cloud": "autre",
  "apps-rag": "autre",
  "apps-webpilot": "vps-api",
  "apps-privacy-router": "vps-api",
  "apps-creative": "autre",
  "apps-outils": "autre",
  // Fiche d'un modèle en aperçu (/modeles/<id>) : « Me prévenir à l'ouverture ».
  "modele-apercu": "vps-api",
  // « Me prévenir à l'ouverture » de la plateforme à crédits (Tarifs, Modèles, Apps, inscription).
  "ouverture-plateforme": "autre",
};

/** Identifiant public d'un modèle (même forme que `/modeles/<id>`). */
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,40}\/[a-z0-9][a-z0-9._:-]{0,80}$/;

/** Besoin et message prérempli pour un sujet d'adresse ; rien pour un sujet absent, inconnu ou hostile. */
export function resolveContactSubject(
  subject: string | null,
  prefills: Readonly<Record<string, string>>,
  /** `?modele=` : n'est lu que pour « modele-apercu », et seulement s'il a la forme d'un identifiant de modèle. */
  model?: string | null,
): { need?: string; message?: string } {
  if (!subject || !Object.hasOwn(CONTACT_SUBJECTS, subject)) return {};
  const need = CONTACT_SUBJECTS[subject];
  let message = Object.hasOwn(prefills, subject)
    ? prefills[subject]
    : undefined;
  if (message && subject === "modele-apercu" && model && MODEL_ID.test(model))
    message += model;
  return {
    ...(need ? { need } : {}),
    ...(message ? { message } : {}),
  };
}
