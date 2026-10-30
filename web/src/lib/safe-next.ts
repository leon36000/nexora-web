/**
 * Retour après connexion : seule la page d'autorisation d'un appareil Nexora Code (`/code/device`, avec ou sans
 * `user_code`, en français ou en anglais) peut être demandée dans `?next=`. Tout le reste est refusé (jamais de
 * redirection ouverte).
 */
const ALLOWED = /^(?:\/en)?\/code\/device(?:\?user_code=[A-Za-z0-9%-]{1,40})?$/;

export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length > 120) return null;
  return ALLOWED.test(value) ? value : null;
}
