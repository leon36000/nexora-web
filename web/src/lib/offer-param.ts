/**
 * Offre choisie sur la page Tarifs, transportée dans l'adresse (`?offre=<code>`) pendant l'inscription, la
 * confirmation du courriel et la connexion, puis proposée à la souscription dans l'espace client. Ce n'est
 * qu'un code d'offre public : le serveur revérifie tout (offre publiée, droits, prix) au moment de payer.
 */
const OFFER = /^[a-z0-9][a-z0-9-]{0,99}$/;

export function parseOffer(value: string | null | undefined): string | null {
  return typeof value === "string" && OFFER.test(value) ? value : null;
}

export function withOffer(path: string, offer: string | null): string {
  if (!offer) return path;
  return `${path}${path.includes("?") ? "&" : "?"}offre=${encodeURIComponent(offer)}`;
}
