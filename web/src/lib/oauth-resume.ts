/**
 * Connexion unique : quand la page de connexion est ouverte par le fournisseur OpenID Connect du site (adresse
 * signée `?client_id=…&sig=…`), le serveur répond à la connexion réussie `{ redirect: true, url }` et le client de
 * Better Auth quitte la page tout seul pour reprendre l'autorisation. La page ne doit alors PAS aller vers
 * /compte en parallèle.
 */
export function resumesOAuth(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const reply = data as { redirect?: unknown; url?: unknown };
  return reply.redirect === true && typeof reply.url === "string";
}
