import { type PerMillion, tokensValueMicro } from "../gateway/pricing";

/**
 * Forfait de jetons inclus avec une offre WorkStudio : « 5 millions de jetons par mois » du modèle par défaut.
 *
 * Le forfait est un CRÉDIT mensuel (champ `included_credits_cents` de l'offre), pas un compteur de jetons : il vaut
 * ce que coûtent 5 M de jetons (70 % d'entrée, 30 % de sortie) au prix de vente du modèle par défaut. Un modèle plus
 * cher consomme donc le forfait plus vite, et la marge de 10 % tient. L'espace client traduit la consommation du
 * forfait en « jetons équivalents » : voir `includedTokensUsed`. Calcul documenté dans `docs/facturation-workstudio.md`.
 */
export const INCLUDED_TOKENS = 5_000_000;
/** Part de sortie des 5 M de jetons, en points de base (sur 10 000). */
export const INCLUDED_OUTPUT_SHARE_BPS = 3000;

/** Crédits inclus (cents CAD, arrondis vers le haut) qui valent 5 M de jetons au prix de vente donné. */
export function includedCreditsCents(price: PerMillion): number {
  const micro = tokensValueMicro(
    INCLUDED_TOKENS,
    price,
    INCLUDED_OUTPUT_SHARE_BPS,
  );
  return Number((micro + 9_999n) / 10_000n);
}

/**
 * Jetons « équivalents » du forfait déjà utilisés : la part du crédit inclus consommée, ramenée à 5 M de jetons du
 * modèle par défaut. Plafonné à 5 M ; jamais négatif ; 0 sans forfait.
 */
export function includedTokensUsed(
  usedMicro: bigint,
  includedMicro: bigint,
): number {
  if (includedMicro <= 0n || usedMicro <= 0n) return 0;
  if (usedMicro >= includedMicro) return INCLUDED_TOKENS;
  return Number((usedMicro * BigInt(INCLUDED_TOKENS)) / includedMicro);
}
