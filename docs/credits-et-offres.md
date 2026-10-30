# Crédits, offres, recharge et espace disque

Source de vérité du modèle économique de Nexora AI depuis le 30/10/2026 (conception : `docs/superpowers/specs/2026-10-30-credits-produits-design.md`). Remplace la partie « 5 millions de jetons inclus » de `docs/facturation-workstudio.md`.

**Un abonnement = des crédits mensuels + de l'espace disque ; sinon on recharge des crédits. Tout ce qui appelle un modèle d'IA consomme des crédits ; les outils qui n'en appellent aucun sont gratuits ou inclus.**

## Le crédit

- **1 crédit = 1 ¢ CA de jetons au prix du catalogue** (coût amont × taux de change approuvé + 10 %). Le grand livre garde ses micro-CAD (1 CAD = 1 000 000) ; `MICRO_PER_CREDIT` (`web/src/server/ledger/money.ts`) = 10 000. Une fraction de cent n'est pas un crédit (arrondi vers le bas).
- Deux sortes de crédits, jamais mélangées :
  - **d'abonnement** : versés à chaque période payée (écritures `credit` de source `subscription`), **expirent à la fin de la période** ; annuel : un douzième par mois (`ledger.grant-tranches`, chaque douzième expire à la fin de son mois) ;
  - **de recharge** : achats, gestes commerciaux (source `purchase`, `gift`, `staff_gift`…), **sans expiration** (`BILLING_CREDIT_EXPIRY_MONTHS` = 0 par défaut ; une valeur positive réactive l'expiration, au choix de l'opérateur).
- Le grand livre impute la consommation aux lots dans l'ordre d'échéance (le plus proche d'abord, sans échéance en dernier) : **les crédits d'abonnement servent donc avant ceux de recharge**, sans code propre à cette règle.
- L'équivalent d'un crédit en jetons se calcule depuis les prix publiés du catalogue (`web/src/lib/credit-equivalence.ts`) : 1 000 crédits = 10 $ de jetons ÷ prix par million. Jamais saisi à la main.

## Contrat `OrgEntitlements` (`web/src/server/billing/entitlements.ts`)

```ts
getOrgEntitlements(orgId): Promise<OrgEntitlements>
recordStorageUsage(orgId, product, deltaBytes): Promise<{ ok: true } | { ok: false; reason: "quota_exceeded" }>
```

Variantes testables avec la base en paramètre : `loadOrgEntitlements(db, orgId, now?)`, `recordStorageUsageIn(db, …)`, `orgCanUseModels(db, orgId)`, `setExtraStorage(db, orgId, octets)`.

- `credits.subscription` / `refill` / `total` : en crédits, **nets des montants réservés** par les requêtes en cours (la réservation sert d'abord l'abonnement) ; 0 si le solde est négatif (remboursement, litige). `total = subscription + refill`.
- `canUseModels` = **`total` ≥ 1, ou organisation « maison »** (accès gratuit). Les outils sans modèle n'en dépendent pas.
- `planCode`, `interval` : l'offre en vigueur (abonnement lié à une offre, actif, en essai, offert ou en délai de grâce). Plusieurs : la plus grande, puis la plus ancienne. Un abonnement de VPS (sans offre) ne compte pas.
- `storage.quotaBytes` : somme des `subscriptions.storage_quota_bytes` des abonnements en vigueur (**copiés de l'offre Directus** `included_storage_gb` à chaque facture appliquée par le webhook : le quota se lit dans la base `app` seule). `extraBytes` : Go supplémentaires (`organization_storage`). `usedBytes` et `byProduct` : `storage_usage`. **1 Go = 1 000 000 000 octets.**
- `recordStorageUsage` : écriture atomique (verrou de la ligne `organization_storage`, donc deux écritures simultanées ne dépassent jamais le quota). Refus `quota_exceeded` sans rien changer si `utilisé + delta > quota + Go supplémentaires`. **Libérer de l'espace est toujours permis**, même abonnement résilié, et l'usage ne descend jamais sous zéro. L'organisation « maison » n'est pas limitée (son usage est compté).
- Produits : `workstudio`, `code`, `rag`, `creative`, `bot`. Les appelants (RAG, Nexora Code, panneau) doivent appeler `recordStorageUsage` **avant** d'écrire (delta positif) et après suppression (delta négatif).

## Migration 0027

`subscriptions.billing_interval` (`month` | `year`), `subscriptions.storage_quota_bytes`, tables `storage_usage` (clé organisation + produit, `used_bytes` ≥ 0) et `organization_storage` (`extra_bytes` ≥ 0). Additive, aucune donnée à reprendre. Appliquer avec `bun packages/db/src/migrate-cli.ts`. Les abonnements existants gardent un quota de 0 jusqu'à leur prochaine facture appliquée (aucun client à ce jour).

## Règle d'accès aux modèles

Remplace « exige un abonnement » partout :

| Où | Comportement |
|---|---|
| Passerelle `/v1/*` | Réservation au grand livre (402 sinon). Message `insufficient_quota` : « Il ne vous reste plus de crédits. Rechargez votre compte (…) ou choisissez un abonnement (…) » (solde < 1 crédit) ou « … pas assez de crédits pour cette requête … ». Compte négatif : `account_blocked`. Les liens sont `/compte/facturation#ajouter-des-fonds` et `/tarifs` sur `SITE_URL` (`web/src/server/billing/credit-messages.ts`). |
| `GET /api/oauth/workstudio-access` | `403 credits_required` avec `message`, `recharge_url`, `plans_url`, sans créer de clé. `WORKSTUDIO_REQUIRE_CREDITS=false` coupe l'exigence (démonstrations) ; l'ancien nom `WORKSTUDIO_REQUIRE_SUBSCRIPTION=false` est encore lu. |
| Panneau du compte | Le bouton « Ouvrir WorkStudio » s'active dès qu'il reste au moins 1 crédit (`hasWorkstudioAccess(…, free, hasCredits)`). |

## Offres (Directus, jamais en dur côté site)

Seed : `cms/scripts/lib/plans-seed.ts` (`bun run seed`, rejouable, ne touche pas une fiche déjà approuvée ou publiée ; archive les anciennes offres `workstudio-*` encore en brouillon). **Tout est en brouillon, sans prix publié** : seul `suggested_price_cents` (non lu par le public) porte la suggestion.

| Offre | Code (mensuel / annuel) | Suggestion | Espace | Crédits par mois |
|---|---|---|---|---|
| Nexora Base | `nexora-base` / `nexora-base-annuel` | 29,99 $ CA par mois | 1 Go | 1 000 |
| Nexora Pro | `nexora-pro` / `-annuel` | 79,99 $ | 10 Go | 4 000 |
| Nexora Équipe | `nexora-equipe` / `-annuel` | 199,99 $ | 50 Go | 12 000 |
| Go supplémentaire | `nexora-go-supplementaire` (famille `storage`) | 1 $ par Go et par mois | +1 Go | 0 |

Annuel : 12 mois à 10 % de moins (arrondi au cent), crédits de l'année versés un douzième par mois, même espace. Aucun essai gratuit (`trial_days` = 0). Forfaits de recharge (collection `credit_packs`, **1 $ = 100 crédits**) : `recharge-10`, `-25`, `-50`, `-100`. Champs Directus ajoutés : `subscription_plans.included_storage_gb`, familles `nexora` et `storage`, collection `credit_packs` (code, statut, `credits`, `price_cents`, `suggested_price_cents`, `sort` ; lecture publique sans le prix suggéré). Le nom de champ `included_credits_cents` est hérité : il porte des **crédits** (1 crédit = 1 ¢).

Pour publier : « Adopter le prix suggéré » (module Paiements) puis « Publié », puis « Publier vers Stripe » pour les offres (guide de l'opérateur §6.2). Les forfaits de recharge se publient en passant leur statut à « Publié » avec un prix.

## Page `/tarifs` (fr-CA, en-CA)

Structure : crédit (avec tableau d'équivalence en jetons calculé du catalogue), paliers (cartes lues des offres publiées : crédits par mois, espace, prix), recharge (forfaits publiés), espace disque (règles + Go supplémentaire), ce qui est inclus / consomme, FAQ, autres voies. **Tant qu'aucune offre n'est publiée, l'état « Prix à venir » le dit franchement** (aucun palier, aucun prix) ; les explications restent. Textes : `web/src/i18n/dictionaries/pricing-*-CA.ts`, affirmations CL-T01 à CL-T10 de `cms/content/claims.json` (état « en_revue »). Les lectures sont mises en cache (étiquette `subscription-plans`, rafraîchissement sous la minute).

## Décisions (Ruling : décision — pourquoi — coût si faux)

- Ruling : les crédits d'abonnement et de recharge se distinguent par la **source du lot** (`subscription` ou autre), pas par un champ de plus — le grand livre fait déjà le bon ordre de consommation — coût si faux : un lot restitué après un litige gagné (`dispute_reversal`) compte comme recharge même s'il expire.
- Ruling : `canUseModels` = au moins **1 crédit entier** (une fraction de cent ne suffit pas) — éviter « total 0 mais accès » — coût si faux : un solde de 0,5 ¢ est refusé alors que le grand livre l'accepterait pour une très petite requête.
- Ruling : le quota est **copié de l'offre dans l'abonnement** à chaque facture (comme `config_version`) — le droit se lit sans appeler Directus (site, worker, RAG) — coût si faux : un changement de quota dans Directus ne touche les abonnés qu'à leur prochaine facture.
- Ruling : 1 Go = 10⁹ octets (gigaoctet décimal) — ce que dit « Go » en français — coût si faux : 7 % d'écart si le fondateur veut des gibioctets.
- Ruling : l'organisation « maison » n'est pas limitée en espace — elle est gratuite pour les modèles — coût si faux : une ligne dans `recordStorageUsageIn`.
- Ruling : le type `OrgEntitlements` reste **exactement** celui de la conception (pas de champ `house`) — les chantiers B et D le bouchonnent — coût si faux : le panneau ne peut pas afficher « illimité » pour la maison sans lecture du mode de facturation.
- Ruling : les crédits de recharge **n'expirent pas** : `BILLING_CREDIT_EXPIRY_MONTHS` passe de 12 à 0 (0 = jamais) — décision du fondateur — coût si faux : repasser la variable à 12 (seuls les achats futurs sont touchés).
- Ruling : collection Directus `credit_packs` plutôt qu'un type de ligne dans `subscription_plans` — un forfait n'a ni période ni produit Stripe récurrent — coût si faux : **la collection occupe la 25ᵉ et dernière place du palier Core** ; la prochaine collection exige la licence ou une fusion.
- Ruling : recharge minimale 20 $ → 10 $ (`BILLING_MIN_PURCHASE_CENTS` = 1 000) et montants proposés 10, 25, 50, 100, 250, 500 $ — pour que le forfait de 10 $ soit achetable (la valeur 1 000 figurait déjà dans `docs/infra.md`) — coût si faux : une variable.
- Ruling : nouveau code d'erreur `credits_required` (ancien : `subscription_required`) — la raison du refus a changé — coût si faux : si le client WorkStudio teste l'ancien code, il affiche une erreur générique (à vérifier côté WorkStudio).

## Pas encore fait

- **L'achat du Go supplémentaire** n'est pas branché au paiement (quantité Stripe) : `setExtraStorage` existe, aucun webhook ne l'appelle encore.
- Les forfaits de recharge de Directus ne pilotent pas encore le paiement : l'achat reste un montant libre (≥ 10 $) ; les forfaits servent à l'affichage de `/tarifs`.
- Rien ne **supprime** de données quand l'abonnement tombe : le quota passe à 0, les écritures sont refusées, les lectures restent. La politique de conservation reste à décider.
- ~~Le panneau « Mes outils »~~ : fait (chantier D, `docs/panneau-mes-outils.md`). Il lit `getOrgEntitlements`, affiche l'avertissement d'espace à 80 % et le message à 100 %, et le libellé « Abonnement requis » de WorkStudio est remplacé par « Crédits requis ».
