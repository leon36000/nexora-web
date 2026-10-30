"use client";
import { authClient } from "@/lib/auth-client";

/**
 * Libellé du lien d'accès au compte : « Connexion » pour un visiteur, « Mes outils » (le panneau du compte) pour une personne connectée.
 * Les pages publiques sont servies du cache : l'état de la session se lit dans le navigateur, après l'affichage.
 */
export function SessionLabel({
  label,
  signedInLabel,
}: {
  label: string;
  signedInLabel: string;
}) {
  const { data } = authClient.useSession();
  return <>{data?.user ? signedInLabel : label}</>;
}
