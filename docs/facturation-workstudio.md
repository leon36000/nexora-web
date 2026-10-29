# WorkStudio : modèle branché d'office et facturation au jeton

**Règle** : une instance WorkStudio est branchée dès sa mise en service sur un modèle par défaut de la passerelle Nexora. Le compteur de jetons tourne, les jetons sont facturés au portefeuille du client ; l'organisation « maison » (administrateur) est gratuite.

## Comment c'est branché

1. À la mise en service, `ensureModelAccess` (`web/src/server/gateway/provision.ts`) crée la clé de la passerelle de l'organisation du client, la range chiffrée dans le coffre et rend `NEXORA_UPSTREAM_URL`, `NEXORA_UPSTREAM_MODEL`, `NEXORA_UPSTREAM_KEY` (réglages que WorkStudio lit déjà). Script : `bun run --cwd web workstudio:acces`.
2. **WorkStudio intégré au site** (une instance, plusieurs utilisateurs, connexion unique) : la clé n'est plus rendue par un script mais **à la demande, par utilisateur**, via `GET /api/oauth/workstudio-access` (jeton OIDC de l'utilisateur) : même `ensureModelAccess`, pour l'organisation de la personne connectée. Voir `docs/workstudio-integre.md`.
3. Chaque requête de WorkStudio passe par la passerelle : elle apparaît dans l'Activité du client (jetons entrée, sortie, cache, coût).

## Jetons inclus : 5 millions par mois (en vigueur dans la feuille de départ des offres)

- **5 millions de jetons par mois inclus avec l'abonnement**, puis facturation au jeton au prix du catalogue (coût amont + 10 %), à même le portefeuille.
- **Mise en œuvre sans toucher à la facturation** : le forfait est un **crédit mensuel** équivalant à la valeur de 5 M de jetons du modèle par défaut (champ `included_credits_cents` de l'offre dans Directus, versé à chaque période payée, expirant à la fin de la période ; offre annuelle : un douzième par mois). Raison : un compteur de jetons brut ne tient pas la marge quand le client choisit un modèle plus cher ; en crédits, un modèle plus cher consomme le forfait plus vite. L'espace client le dit honnêtement (« X de 5 M de jetons inclus utilisés, équivalent en valeur »).
- **Calcul** (`tokensValueMicro`, 70 % d'entrée, 30 % de sortie), modèle par défaut `nexora/deepseek-v4.1-flash-1017` :

| Étape | Entrée | Sortie |
|---|---|---|
| Coût amont, tarif de **pointe** (feuille de départ `catalog-ia-seed.ts`), $ US par million | 0,30 | 1,20 |
| × taux de référence 1,4025 (Banque du Canada, 26/10/2026) = $ CA | 0,420750 | 1,683000 |
| × 1,10 (marge de 10 %) = prix de vente $ CA par million | 0,462825 | 1,851300 |

5 M × (0,7 × 0,462825 + 0,3 × 1,8513) = **4,396838 $ CA**, arrondi au cent supérieur : **440 cents** (`INCLUDED_CREDITS_CENTS` dans `cms/scripts/lib/plans-seed.ts` ; offre annuelle : 5 280). Deux tests refont le calcul chacun de leur côté (`cms/scripts/lib/plans-seed.test.ts` et `web/src/server/billing/included-tokens.test.ts`, qui part des prix réels de la feuille de départ).
- **Honnêteté** : le taux de change approuvé en production fait foi pour la facturation ; le forfait est un montant fixe en dollars. Au tarif creux de DeepSeek (moitié du tarif de pointe) les 4,40 $ couvrent environ deux fois plus de jetons ; avec un modèle plus cher, moins. Le compteur de l'espace client convertit la part consommée du crédit inclus en « jetons équivalents » du modèle par défaut (`includedTokensUsed`).
- **Aucun essai gratuit** : `trial_days` = 0 sur toutes les offres préparées. L'accès gratuit est réservé à l'organisation « maison » (administrateur, mode `house`). Le mécanisme d'essai de Stripe reste dans le code (donnée par offre dans Directus), mais aucune offre n'en porte et la page Tarifs n'en promet plus.

### Décisions provisoires, modifiables par le fondateur

- Même forfait (5 M de jetons) pour les trois offres, mensuelles et annuelles : la taille par palier reste à décider.
- Valeur calculée au tarif de pointe du modèle par défaut (le plus cher des deux tarifs) et au taux de référence ci-dessus.
- Les prix d'abonnement restent des suggestions non publiées (`suggested_price_cents`).
