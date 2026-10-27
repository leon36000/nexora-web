/** Les fichiers de Directus sont servis par la route /api/media/<id> du site (le jeton ne quitte jamais le serveur). */
export function mediaPath(id: string): string {
  return `/api/media/${id}`;
}
