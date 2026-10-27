import { notFound } from "next/navigation";

/**
 * Attrape-tout : toute URL sans page déclenche le 404 de la langue, rendu DANS la mise en page
 * (en-tête, pied de page, langue) plutôt que par la page d'erreur nue de Next.js.
 * À retirer ou à restreindre quand les routes de la conception §6 existeront (jalon S2 et suivants).
 */
export default function CatchAll() {
  notFound();
}
