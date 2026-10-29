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
};

/** Besoin et message prérempli pour un sujet d'adresse ; rien pour un sujet absent, inconnu ou hostile. */
export function resolveContactSubject(
  subject: string | null,
  prefills: Readonly<Record<string, string>>,
): { need?: string; message?: string } {
  if (!subject || !Object.hasOwn(CONTACT_SUBJECTS, subject)) return {};
  const need = CONTACT_SUBJECTS[subject];
  const message = Object.hasOwn(prefills, subject)
    ? prefills[subject]
    : undefined;
  return {
    ...(need ? { need } : {}),
    ...(message ? { message } : {}),
  };
}
