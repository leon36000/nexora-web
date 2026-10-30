# WorkStudio : modèle branché d'office et facturation au jeton

**Règle** : une instance WorkStudio est branchée dès sa mise en service sur un modèle par défaut de la passerelle Nexora. Le compteur de jetons tourne, les jetons sont facturés au portefeuille du client ; l'organisation « maison » (administrateur) est gratuite.

## Comment c'est branché

1. À la mise en service, `ensureModelAccess` (`web/src/server/gateway/provision.ts`) crée la clé de la passerelle de l'organisation du client, la range chiffrée dans le coffre et rend `NEXORA_UPSTREAM_URL`, `NEXORA_UPSTREAM_MODEL`, `NEXORA_UPSTREAM_KEY` (réglages que WorkStudio lit déjà). Script : `bun run --cwd web workstudio:acces`.
2. **WorkStudio intégré au site** (une instance, plusieurs utilisateurs, connexion unique) : la clé n'est plus rendue par un script mais **à la demande, par utilisateur**, via `GET /api/oauth/workstudio-access` (jeton OIDC de l'utilisateur) : même `ensureModelAccess`, pour l'organisation de la personne connectée. Voir `docs/workstudio-integre.md`.
3. Chaque requête de WorkStudio passe par la passerelle : elle apparaît dans l'Activité du client (jetons entrée, sortie, cache, coût).

## Crédits et offres : voir `docs/credits-et-offres.md`

Depuis le 30/10/2026, les offres sont une famille unique « Nexora » (crédits mensuels + espace disque) ; le forfait « 5 millions de jetons par mois » et son calcul d'équivalence en valeur (`included-tokens.ts`) sont **retirés**. L'accès aux modèles dépend du **solde de crédits** (abonnement ou recharge), plus d'un abonnement : `WORKSTUDIO_REQUIRE_CREDITS` remplace `WORKSTUDIO_REQUIRE_SUBSCRIPTION`. Tout le reste de ce document (branchement d'office, clé par organisation, facturation au jeton au prix du catalogue) reste valable.
