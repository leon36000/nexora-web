/** Ancienne teinte de mosaïque (retirée par la refonte « Signal ») : gardée comme simple étiquette de famille. */
type MosaicPalette = string;

/** Teinte de la mosaïque d'un outil : une rampe par famille (code et infonuagique : ciel ; documents et protection : menthe ; bot et Web : or ; le reste : braise). */
export const APP_PALETTE: Record<string, MosaicPalette> = {
  code: "ciel",
  gitspace: "ciel",
  cloud: "ciel",
  rag: "menthe",
  "privacy-router": "menthe",
  bot: "or",
  webpilot: "or",
  creative: "or",
};

/** Graine déterministe d'une fiche : même mosaïque à chaque rendu, serveur et client. */
export const appSeed = (slug: string): number =>
  [...slug].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 11);
