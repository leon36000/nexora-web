# WorkStudio : modèle branché d'office et facturation au jeton

**Règle** : une instance WorkStudio est branchée dès sa mise en service sur un modèle par défaut de la passerelle Nexora. Le compteur de jetons tourne, les jetons sont facturés au portefeuille du client ; l'organisation « maison » (administrateur) est gratuite.

## Comment c'est branché

1. À la mise en service, `ensureModelAccess` (`web/src/server/gateway/provision.ts`) crée la clé de la passerelle de l'organisation du client, la range chiffrée dans le coffre et rend `NEXORA_UPSTREAM_URL`, `NEXORA_UPSTREAM_MODEL`, `NEXORA_UPSTREAM_KEY` (réglages que WorkStudio lit déjà). Script : `bun run --cwd web workstudio:acces`.
2. Chaque requête de WorkStudio passe par la passerelle : elle apparaît dans l'Activité du client (jetons entrée, sortie, cache, coût).

## Jetons inclus : proposition

- **5 millions de jetons par mois inclus avec l'abonnement**, puis facturation au jeton au prix du catalogue (coût amont + 10 %).
- **Mise en œuvre sans toucher à la facturation** : le forfait est un **crédit mensuel** équivalant à la valeur de 5 M de jetons du modèle par défaut (champ `included_credits_cents` de l'offre dans Directus). Le portefeuille, la recharge et l'expiration mensuelle existent déjà. Raison : un compteur de jetons brut ne tient pas la marge quand le client choisit un modèle plus cher ; en crédits, un modèle plus cher consomme le forfait plus vite.
- **Valeur de 5 M de jetons** (70 % d'entrée, 30 % de sortie ; fonction `tokensValueMicro`) :

| Modèle par défaut | Prix de vente (CA $/M entrée / sortie) | 5 M de jetons |
|---|---|---|
| GLM 5.3 Flash (recommandé) | 0,231 / 0,77 | **1,96 $ CA** → `included_credits_cents` = 196 |
| GLM 5.3 | 2,156 / 6,776 | 17,76 $ CA |

- Coût amont de 5 M de jetons Flash : environ 1,79 $ CA ; la marge de 10 % est conservée.
- À décider avec les paliers d'abonnement : modèle par défaut, taille du forfait par palier, jours de validité des crédits non utilisés.
