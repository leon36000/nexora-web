// Visibilité des modules d'administration : réservés aux administrateurs Directus. Le serveur applique la même règle
// (createRelayHandler : 401 sans session, 403 hors administrateur), car masquer un module n'est pas une protection.

export const adminOnly = (user: { admin_access?: boolean } | null): boolean =>
  user?.admin_access === true;
