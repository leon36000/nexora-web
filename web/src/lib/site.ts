/**
 * Adresse publique du site, pour les URL absolues des métadonnées.
 * `SITE_URL` est défini en déploiement ; le défaut sert au développement.
 */
export const SITE_URL: string = (
  process.env.SITE_URL ?? "http://localhost:3500"
).replace(/\/+$/, "");
