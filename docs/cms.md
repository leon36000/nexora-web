# Directus (CMS) — schéma, rôles, extensions et essai de la garde

Jalon S1–S2 · Directus 12.5.1 · zone `cms/` · conception : `docs/superpowers/specs/2026-10-26-nexora-site-design.md` (§4, §8, §13, décisions D2, D4, D5, D6, D9).

## 1. Appliquer le schéma (et pourquoi pas l'« Environment Sync »)

**Choix.** Le schéma, les rôles, les politiques, les permissions et les comptes de service sont déclarés en TypeScript (`cms/scripts/lib/schema.ts`, `cms/scripts/lib/access.ts`) et poussés par l'API REST de Directus par `cms/scripts/apply.ts`, en comparant avant d'écrire : une deuxième exécution ne change rien (vérifié : `0 créés, 0 modifiés, 642 inchangés`).

**Pourquoi.** Vérifié le 26/10/2026 : l'« Environment Sync » de Directus n'est encore qu'une proposition (RFC du 29/06/2026 : « Nothing here is built yet »). Seuls `/schema/diff` et `/schema/apply` existent ; ils ne couvrent ni les rôles, ni les politiques, ni les permissions. Un instantané YAML ne serait donc qu'une moitié de la configuration, sans lecture en revue facile. Le jour où l'Environment Sync sortira, il suffira de remplacer `apply.ts`.

```bash
# Directus partagé de pc6 (projet compose « nexorasite »)
export NEXORA_ENV_FILE=/home/pc6/Desktop/NexoraSite/deploy/.env
DIRECTUS_URL=http://localhost:8456 bun run cms/scripts/apply.ts     # schéma + rôles + comptes de service
DIRECTUS_URL=http://localhost:8456 bun run cms/scripts/seed.ts      # contenu initial (jamais d'écrasement)
bash cms/scripts/stage-extensions.sh                                # construit et copie l'extension dans cms/extensions/
```

- Connexion : `DIRECTUS_ADMIN_TOKEN` s'il existe (à préférer : requis dès que le compte administrateur a la 2FA, §11), sinon `DIRECTUS_ADMIN_EMAIL` + `DIRECTUS_ADMIN_PASSWORD` (+ `DIRECTUS_ADMIN_OTP` avec la 2FA), lus dans le fichier `.env`, jamais affichés. `CMS_ENFORCE_TFA=0` désactive l'exigence de 2FA en développement.
- Barre des modules : un module d'extension n'apparaît dans Directus que s'il est déclaré dans `module_bar` ; `apply.ts` ajoute « Coffre » (cadenas) avant Réglages sans toucher au reste d'une barre déjà personnalisée.
- Jetons statiques : `apply.ts` crée les comptes `site-lecteur@nexora.dev` (rôle « Lecteur site ») et `publication@nexora.dev` (rôle « Publication ») et ajoute `DIRECTUS_READER_TOKEN` et `DIRECTUS_PUBLISHER_TOKEN` au `.env` **seulement s'ils n'y sont pas** (valeurs de 256 bits, non affichées). Si la variable existe, le script vérifie qu'elle ouvre bien le bon compte et la réaffecte sinon.
- Les sources de l'extension sont dans `cms/extensions-src/nexora-cms/` ; `cms/extensions/` (monté par `deploy/compose.yml`) ne reçoit que le build (`package.json` + `dist/`), ignoré par git. Cela évite d'avoir `node_modules` sous un dossier que Directus surveille et les conflits de fusion.

### Instance jetable pour les essais

`cms/scripts/test-instance.sh up|down|reset|destroy` lance un second Directus (même image épinglée, base `directus_cmstest` dans le PostgreSQL du projet, port 8466) sans toucher au Directus partagé. `cms/scripts/stub-app.ts` est un bouchon du service de l'app (coffre et revalidation) qui respecte le contrat ; il écoute sur 3599 (ou sur 3500 pour tester le Directus partagé, dont `NEXORA_APP_INTERNAL_URL` pointe vers `host.docker.internal:3500`).

```bash
bash cms/scripts/test-instance.sh reset                 # base neuve + Directus sur :8466
(bun run cms/scripts/stub-app.ts &)                     # bouchon de l'app sur :3599
NEXORA_ENV_FILE=… DIRECTUS_URL=http://localhost:8466 bun run cms/scripts/apply.ts
NEXORA_ENV_FILE=… DIRECTUS_URL=http://localhost:8466 bun run cms/scripts/seed.ts
NEXORA_ENV_FILE=… DIRECTUS_URL=http://localhost:8466 bun run cms/scripts/essai-garde.ts   # 58 vérifications
```

## 2. Licence : ce qui change sans la clé Open Innovation Grant

Le Directus de pc6 tourne **sans clé de licence**, donc au palier Core (`GET /license` : 3 sièges, 25 collections, 5 flows, `custom_permission_rules_enabled: false`). Constat décisif, vérifié sur l'instance : Directus **refuse** (`403 RESOURCE_RESTRICTED`) toute permission qui contient une règle personnalisée : **liste de champs, filtre d'éléments, validation ou valeurs prédéfinies**. Seules les permissions « collection entière, tous les champs » sont acceptées.

Conséquences, appliquées automatiquement par `apply.ts` (il lit `/license`) :

| Besoin de la conception | Avec la clé (règles actives) | Sans clé (état actuel) |
|---|---|---|
| Public : lecture des seuls éléments publiés | filtre `status = published` (pages, navigation, traductions, jonction) | **aucune permission** pour le rôle public (un accès sans filtre exposerait aussi les brouillons de la table principale) |
| Lecteur du site (jeton) | même filtre que le public | lecture de toute la table principale : **le site doit filtrer `status = published`** lui-même |
| Agents : approbations « les leurs » seulement | filtre `proposed_by = $CURRENT_USER` | création seule, **aucune lecture** des approbations |
| Agents : versions « les leurs » seulement | filtre `user_created = $CURRENT_USER` | lecture et mise à jour de toutes les versions (brouillons seulement) |
| Relecteur : champs et états d'une approbation | liste de champs + validation | permission large ; **la garde (hook) impose** champs et états |
| Relecteur : approuver une affirmation (`claims`) | champs limités | non accordée (l'administrateur approuve) |

Ce qui n'est **pas** affecté : la garde de publication et les contrôles d'approbation sont du code de l'extension (logique de flux, pas des règles de permission). Les brouillons vivent dans `directus_versions`, que ni le public ni le jeton « lecteur site » ne peuvent lire.

> **Action du fondateur (§16 de la conception, point 1)** : demander la clé sur https://directus.com/oig (moins de 5 M$ de revenus et moins de 50 employés), puis la placer dans `LICENSE_KEY` de `deploy/compose.yml` (et `PUBLIC_URL` doit être l'adresse définitive). Ensuite, **relancer `apply.ts`** : il détecte les règles et applique les filtres du tableau. *Le mode « avec règles » n'a pas pu être essayé sur une instance réelle faute de clé ; les règles sont déclarées dans `access.ts` et couvertes par des tests de structure.*
>
> Le palier Core limite aussi à 3 sièges (administrateur + Éditeur + Relecteur ; les comptes API ne comptent pas) et à 25 collections. Le schéma en utilise **22** (3 de marge). Je n'ai pas contourné ces limites.

## 3. Schéma

Dossiers du panneau : `nexora_site`, `nexora_pages`, `nexora_validation`. **22 collections** :

| Groupe | Collections |
|---|---|
| Site | `languages` (code BCP 47 en clé : `fr-CA` par défaut, `en-CA`), `site_settings` (singleton) + `site_settings_translations`, `navigation` + `navigation_translations` |
| Pages | `pages` (versions de contenu activées) + `pages_translations`, `pages_blocks` (jonction M2A) |
| Six blocs (D5) | `block_hero`, `block_section`, `block_cards`, `block_pricing`, `block_faq`, `block_cta`, chacun avec sa table `*_translations` |
| Validation | `claims` (registre privé), `approvals` |

- **Pages.** `pages` : `status` (`draft`, `in_review`, `published`, `archived`), `publish_at`, `noindex`, `seo_image` (image Open Graph), `blocks` (M2A), `translations`. `pages_translations` : `slug` (vide pour l'accueil), `title`, `seo_title`, `seo_description`, `canonical`, et `slug_key` (calculé `langue:slug`, unique : un slug est unique **par langue**, vérifié par le hook avec le message `NEXORA_SLUG_DEJA_UTILISE`).
- **Blocs.** Texte riche contrôlé de `block_section.body` : éditeur HTML restreint (gras, italique, lien, listes, titres 2 et 3, citation) ; le site doit l'assainir une seconde fois au rendu. Les listes (cartes, offres, questions) sont des champs JSON de la table de traduction, pour économiser des collections. `block_pricing` : « Sur demande » tant que le fondateur n'a pas publié de prix (aucun prix n'est semé).
- **Requête type pour le site** (jeton `DIRECTUS_READER_TOKEN`) :

```
GET /items/pages?filter[status][_eq]=published&filter[translations][languages_code][_eq]=fr-CA&filter[translations][slug][_eq]=
  &fields=id,noindex,seo_image,translations.*,blocks.collection,blocks.sort,
          blocks.item:block_hero.*,blocks.item:block_hero.translations.*,
          blocks.item:block_section.*,blocks.item:block_section.translations.*, …(les six types)
  &deep[blocks][_sort]=sort
```

- **`approvals`.** `status` ∈ `en_attente`, `approuvée`, `refusée`, `à_corriger`, `périmée` (**valeurs avec accents, telles que dans la conception**), `kind` (`contenu`, `traduction`, `seo`, `prix`, `suggestion`), `collection`, `item`, `version_id`, `version_key`, `version_hash`, `summary`, `diff`, `proposed_by` (utilisateur créateur), `reviewer`, `comment`, `publish_at`, `applied_at`. Le serveur calcule `collection`, `item`, `version_key`, `version_hash` et `diff` à partir de `version_id` (ou de collection + élément + clé) : **un client ne peut pas fournir un hash**. `publish_at` est stocké mais **aucun planificateur ne publie encore à l'heure dite** (non livré).
- **`claims`.** Énoncé, périmètre, preuve (+ lien), source et version, propriétaire, validité (du / jusqu'au), approbation (`approval_status`, `approved_by`, `approved_at`). Aucune affirmation n'est semée.

## 4. Rôles et politiques

| Rôle | Siège | Peut | Ne peut pas |
|---|---|---|---|
| Administrateur | oui | tout (renommé en français) | — (mais la promotion exige une approbation, voir §5) |
| Éditeur | oui | lire le contenu ; créer et enregistrer des **versions** ; proposer des approbations ; téléverser des fichiers | écrire le contenu principal, approuver, publier |
| Relecteur | oui | tout lire ; approuver, refuser ou renvoyer une approbation ; promouvoir une version (la garde exige une approbation sur le hash exact) | écrire directement un élément publié, changer le hash |
| Publication | non (API) | promouvoir une version approuvée | gérer les approbations, écrire directement un élément publié |
| Lecteur site | non (API) | lire le contenu (publié, avec la clé) | brouillons, `claims`, `approvals` |
| Agents (×8) | non (API) | brouillons (versions) et propositions d'approbation | supprimer, lire `claims`, lire les approbations des autres |
| Public | — | lire le publié (avec la clé) ; rien sans la clé | tout le reste |

Les huit agents (D9, §13) : Rédacteur, Traducteur, SEO on-page, Audit technique, Indexation, Veille SEO, Diffusion, Santé des modèles. Seuls les trois premiers enregistrent des versions de contenu ; les autres proposent des approbations de type `suggestion`. Les **comptes** d'agents (un par agent, avec jeton) ne sont pas créés ici : ils relèvent de S8.

## 5. Extension `nexora-cms` (bundle)

Un seul bundle (`cms/extensions-src/nexora-cms`, `directus-extension build`, hôte `^12.5.1`) avec trois entrées.

### 5.1 Hook « garde de publication » (D6)

Événements vérifiés dans le code de Directus 12.5.1 (`services/versions.js`) : `promote()` émet le **filtre** `items.promote` (et `<collection>.items.promote`) avec le delta de la version avant d'écrire, puis l'**action** du même nom ; les écritures de la promotion repassent par `ItemsService` avec l'accountability de l'appelant (donc par les filtres `items.create|update|delete`). L'enregistrement d'une version déclenche `versions.update`. La logique pure est dans `src/guard/core.ts` (tests : `core.test.ts`).

- **Hash de version** : SHA-256 du JSON canonique (clés triées) de `{collection, item, delta}` où `delta` est le delta de la version **sans** les estampilles `_user` et `_date`. L'ordre des tableaux compte (l'ordre des blocs est du contenu).
- **Promotion** (`items.promote`, toutes collections, **tous les rôles, administrateur compris**) : refusée (`403`) sans approbation `approuvée`, non appliquée, dont `version_hash` est égal au hash du contenu **réellement appliqué**. Codes : `NEXORA_APPROBATION_ABSENTE`, `NEXORA_APPROBATION_PERIMEE`, `NEXORA_APPROBATION_DEJA_UTILISEE` (usage unique : `applied_at`). Une promotion partielle (`fields`) est refusée de fait, car le contenu appliqué n'est plus celui qui a été approuvé.
- **Péremption** : une approbation `en_attente` ou `approuvée` devient `périmée` (a) dès que la version est enregistrée à nouveau ou supprimée (action `versions.update` / `versions.delete`), (b) à la promotion si le hash diffère (chemin sans événement, par exemple modification en base). Une approbation périmée n'est plus modifiable par un non-administrateur.
- **Écriture directe** (filtres `items.create|update|delete` des 15 collections de pages, blocs et traductions) : refusée aux non-administrateurs (`NEXORA_ECRITURE_DIRECTE_REFUSEE`) si l'élément appartient à une page `published`, ou si l'écriture fixe `status = published`. Les blocs et traductions sont résolus jusqu'à leur page par la jonction M2A. Les écritures d'une promotion acceptée passent grâce à un **billet de promotion** (par utilisateur **et par page promue**, 15 s au plus, libéré par l'action `items.promote` : il ne couvre jamais une autre page publiée). Les appels internes sans accountability et l'administrateur ne sont pas bloqués.
- **Approbations** : à la création, le serveur impose `en_attente` (sauf administrateur), efface `reviewer`, `applied_at` et `comment`, et calcule le hash. À la modification par un non-administrateur : seuls `status`, `comment`, `reviewer`, `publish_at` ; états permis `approuvée`, `refusée`, `à_corriger` ; `reviewer` forcé à l'appelant. **Approuver exige que la version porte encore le hash de la proposition.** **Séparation des tâches** : un non-administrateur n'approuve pas l'approbation qu'il a lui-même proposée (`NEXORA_AUTO_APPROBATION_INTERDITE` ; `proposed_by` est posé par Directus à la création, champ « user-created », et retiré de toute charge utile non administrateur) ; il peut encore la refuser ou la renvoyer à corriger. Ces contrôles tiennent même sans licence (§2).
- **Revalidation** : après une promotion acceptée, `POST ${NEXORA_APP_INTERNAL_URL}/api/revalidate`, en-tête `Authorization: Bearer ${NEXORA_APP_ADMIN_TOKEN}`, corps exactement `{"collection","id","slugs"}`. Pour `pages`, `slugs` = les slugs de **toutes les langues** de la page, chaîne vide pour l'accueil ; pour les autres collections, `[]`. Échec non bloquant, journalisé sans secret (état HTTP ou nom de l'erreur seulement). Les écritures directes de l'administrateur sur `pages`, ses blocs, `site_settings` et `navigation` déclenchent aussi une revalidation (groupée 300 ms, sans doublon avec celle de la promotion). Les suppressions ne sont pas revalidées (la ligne n'existe plus, on ne sait plus quelle page).

### 5.2 Coffre (D2)

- **Module** « Coffre » (barre de modules, réservé aux administrateurs) : référence, type, valeur masquée (`type=password`, `autocomplete=new-password`). La valeur quitte l'état du composant dès l'envoi ; l'erreur brute (qui contient la requête) n'est jamais affichée.
- **Endpoint** `POST /nexora-vault/secrets` (et `POST /nexora-vault/`) : exige un utilisateur **administrateur** (`401` sinon connecté, `403` non administrateur). Valide le contrat (`ref` `^[a-z0-9._-]{3,64}$`, `value` 1 à 4096 caractères, `kind` ∈ `llm_provider`, `payment`, `proxmox`, `other`, aucune autre clé) : `422` sans jamais citer la valeur. Relaie à `POST ${NEXORA_APP_INTERNAL_URL}/api/admin/vault` avec `Authorization: Bearer ${NEXORA_APP_ADMIN_TOKEN}` et ne renvoie **que** `{ref,last4,kind,updatedAt}` (même si l'app renvoyait davantage). `422` de l'app devient `422` générique ; `401` de l'app devient `502 COFFRE_NON_AUTORISE` (jeton de service mal configuré) ; panne ou réponse invalide : `502` ; app non configurée : `503`. Réponses en `Cache-Control: no-store`.
- **Rien n'est persisté** : aucune collection, aucune activité, aucune révision ; la seule ligne de journal est `[nexora-vault] dépôt de <ref> (<type>) : <code>`.

## 6. Essai de la garde (D6) et du Coffre (D2)

Journal produit par `cms/scripts/essai-garde.ts` le 26/10/2026 sur une instance neuve (schéma appliqué depuis zéro, puis `apply.ts` rejoué, puis `seed.ts`), avec le bouchon de l'app. **58/58** vérifications ; la même commande donne **58/58** sur le Directus partagé (`:8456`). Les comptes et contenus d'essai sont supprimés à la fin (les lignes d'activité et de révision restent). Rôles utilisés : vrais rôles Éditeur et Relecteur (comptes d'essai), vrai compte de service « Publication » et « Lecteur site » (jetons du `.env`).

Commandes :

```bash
bash cms/scripts/test-instance.sh reset
(bun run cms/scripts/stub-app.ts &)
export NEXORA_ENV_FILE=… DIRECTUS_URL=http://localhost:8466
bun run cms/scripts/apply.ts && bun run cms/scripts/seed.ts
bun run cms/scripts/essai-garde.ts
# Directus partagé : DIRECTUS_URL=http://localhost:8456 ESSAI_DB=directus ESSAI_CONTAINER=nexorasite-directus-1
#   STUB_URL=http://localhost:3500 (bouchon sur :3500 avec STUB_ADMIN_TOKEN = NEXORA_APP_ADMIN_TOKEN)
```

Résultats :

Directus 12.5.1 sur http://localhost:8466 · base `directus_cmstest` · 2026-10-27T02:28:11.698Z

Contenu d'essai : page publiée `f5515399-2f3f-4843-9baf-6fa73068cb51` (slug `essai-garde-66aa1b`), un bloc héros. Comptes d'essai : Éditeur, Relecteur ; compte de service « Publication » (jeton DIRECTUS_PUBLISHER_TOKEN) ; « Lecteur site » (jeton DIRECTUS_READER_TOKEN).

### (a) Version par l’Éditeur, promotion impossible sans approbation
- OK **a1** Éditeur `POST /versions` -> 200 (attendu : 200)
- OK **a2** Éditeur `POST /versions/{v}/save` -> 200 (attendu : 200)
- OK **a3** Éditeur `POST /versions/{v}/promote` -> 403 FORBIDDEN (attendu : 403 (pas de droit de modification sur pages))
- OK **a4** Relecteur sans approbation `POST /versions/{v}/promote` -> 403 NEXORA_APPROBATION_ABSENTE (attendu : 403 NEXORA_APPROBATION_ABSENTE)
- OK **a5** Publication sans approbation `POST /versions/{v}/promote` -> 403 NEXORA_APPROBATION_ABSENTE (attendu : 403 NEXORA_APPROBATION_ABSENTE)
- OK **a5b** Administrateur sans approbation `POST /versions/{v}/promote` -> 403 NEXORA_APPROBATION_ABSENTE (attendu : 403 NEXORA_APPROBATION_ABSENTE (la promotion exige une approbation pour tous))
- OK **a6** le contenu publié n’a pas changé : « Titre initial »

### (b) Approbation sur le hash exact, puis promotion
- OK **b1** Éditeur `POST /items/approvals (état, relecteur et hash forgés)` -> 200 (attendu : 200, état ramené à en_attente, hash recalculé)
- OK **b2** le hash enregistré par le serveur (20f234ce2629…) est égal au SHA-256 recalculé indépendamment depuis directus_versions
- OK **b3** Éditeur `PATCH /items/approvals/{a} (s’auto-approuver)` -> 403 FORBIDDEN (attendu : 403)
- OK **b4** Publication, approbation encore en attente `POST /versions/{v}/promote` -> 403 NEXORA_APPROBATION_ABSENTE (attendu : 403 NEXORA_APPROBATION_ABSENTE)
- OK **b5** Relecteur `PATCH /items/approvals/{a} (toucher au hash)` -> 403 NEXORA_APPROBATION_CHAMP_PROTEGE (attendu : 403 NEXORA_APPROBATION_CHAMP_PROTEGE)
- OK **b6** Relecteur `PATCH /items/approvals/{a} (approuver)` -> 200 (attendu : 200)
- OK **b7** Publication, approbation approuvée sur le hash exact `POST /versions/{v}/promote` -> 200 (attendu : 200)
- OK **b8** le contenu publié est « Titre v1 »
- OK **b9** l’approbation est marquée appliquée (applied_at renseigné : true), à usage unique
- OK **b10** revalidation reçue par le bouchon de l’app, une seule fois : {"collection":"pages","id":"{page}","slugs":["essai-garde-66aa1b"]}
- OK **b11** Publication, rejeu de la même version `POST /versions/{v}/promote` -> 403 NEXORA_APPROBATION_DEJA_UTILISEE (attendu : 403 NEXORA_APPROBATION_DEJA_UTILISEE)

### (c) Modification de la version après approbation
- OK **c1** Relecteur `PATCH /items/approvals/{a2} (approuver v2)` -> 200 (attendu : 200)
- OK **c2** Éditeur `POST /versions/{v}/save (modifier après approbation)` -> 200 (attendu : 200)
- OK **c3** l’approbation est devenue « périmée »
- OK **c4** Publication `POST /versions/{v}/promote` -> 403 NEXORA_APPROBATION_ABSENTE (attendu : 403 (aucune approbation valide))
- OK **c5** Relecteur `PATCH /items/approvals/{a2} (ré-approuver une approbation périmée)` -> 403 NEXORA_APPROBATION_VERROUILLEE (attendu : 403 NEXORA_APPROBATION_VERROUILLEE)
- OK **c6** le contenu publié n’a pas changé : « Titre v1 »
- OK **c7** Publication, version altérée en base après approbation `POST /versions/{v}/promote` -> 403 NEXORA_APPROBATION_PERIMEE (attendu : 403 NEXORA_APPROBATION_PERIMEE)
- OK **c8** l’approbation correspondante est « périmée »

### (d) Écriture directe sur l’élément publié
- OK **d1** Relecteur `PATCH /items/pages/{p}` -> 403 NEXORA_ECRITURE_DIRECTE_REFUSEE (attendu : 403 NEXORA_ECRITURE_DIRECTE_REFUSEE)
- OK **d2** Publication `PATCH /items/pages_translations/{t}` -> 403 NEXORA_ECRITURE_DIRECTE_REFUSEE (attendu : 403 NEXORA_ECRITURE_DIRECTE_REFUSEE)
- OK **d3** Publication `PATCH /items/block_hero_translations/{t} (bloc d’une page publiée)` -> 403 NEXORA_ECRITURE_DIRECTE_REFUSEE (attendu : 403 NEXORA_ECRITURE_DIRECTE_REFUSEE)
- OK **d4** Publication `POST /items/pages_blocks (rattacher un bloc à la page publiée)` -> 403 NEXORA_ECRITURE_DIRECTE_REFUSEE (attendu : 403 NEXORA_ECRITURE_DIRECTE_REFUSEE)
- OK **d5** Publication `DELETE /items/pages/{p}` -> 403 NEXORA_ECRITURE_DIRECTE_REFUSEE (attendu : 403 NEXORA_ECRITURE_DIRECTE_REFUSEE)
- OK **d6** Éditeur `PATCH /items/pages/{p}` -> 403 NEXORA_ECRITURE_DIRECTE_REFUSEE (attendu : 403 (permissions))
- OK **d6b** Relecteur `PATCH /items/pages/{p} (status=published)` -> 403 NEXORA_ECRITURE_DIRECTE_REFUSEE (attendu : 403 NEXORA_ECRITURE_DIRECTE_REFUSEE)
- OK **d7** Publication `PATCH /items/pages/{brouillon} (page non publiée)` -> 200 (attendu : 200 (la garde ne vise que les éléments publiés))
- OK **d8** Administrateur `PATCH /items/pages/{p}` -> 200 (attendu : 200 (l’administrateur reste autorisé))

### (e) Les blocs M2A font-ils partie de la version de la page ?
- OK **e1** Éditeur `POST /versions/{v}/save (bloc héros modifié, bloc CTA créé)` -> 200 (attendu : 200)
- OK **e2** le delta de la version contient les blocs : create=1 (CTA + sa traduction), update=1 (héros + sa traduction)
- OK **e3** avant promotion, le contenu publié n’a qu’un bloc (1) au titre initial
- OK **e4** la lecture avec ?version=blocs montre 2 blocs (aperçu)
- OK **e5** Publication `POST /versions/{v}/promote (blocs)` -> 200 (attendu : 200)
- OK **e6** après promotion : 2 blocs publiés, le héros dit « Titre modifié dans la version. »
Constat : les blocs M2A (jonction `pages_blocks`, bloc et traductions du bloc) font partie du delta de la version de la page ; la promotion les applique avec la page, sous la même garde et le même hash. Une modification de bloc faite dans la version rend donc l’approbation périmée.

### Lecture : lecteur du site et rôle public
- OK **l1** Lecteur site `GET /items/pages` -> 200 (attendu : 200)
- OK **l2** Lecteur site `GET /items/directus_versions (brouillons)` -> 403 FORBIDDEN (attendu : 403)
- OK **l3** Lecteur site `GET /items/claims (registre privé)` -> 403 FORBIDDEN (attendu : 403)
- OK **l4** rôle public non authentifié : GET /items/pages -> 403

### (f) Coffre : la valeur envoyée est introuvable dans Directus
Valeur témoin factice : `TEMOIN-factice-ce0467e62573-ne-pas-utiliser`
- OK **f1** Administrateur `POST /nexora-vault/secrets` -> 200 (attendu : 200 {ref,last4,kind,updatedAt})
- OK **f2** réponse : {"ref":"essai.temoin","last4":"iser","kind":"other","updatedAt":"2026-10-27T02:28:14.750Z"} (aucune trace de la valeur : true)
- OK **f3** Éditeur `POST /nexora-vault/secrets` -> 403 FORBIDDEN (attendu : 403)
- OK **f4** Administrateur `POST /nexora-vault/secrets (référence invalide)` -> 422 INVALID_PAYLOAD (attendu : 422)
- OK **f5** corps JSON mal formé contenant la valeur -> 400, valeur absente de la réponse : true
- OK **f6** sans authentification -> 401
- OK **f7** directus_activity : 0 ligne(s) contenant la valeur
- OK **f8** directus_revisions : 0 ligne(s) contenant la valeur
- OK **f9** balayage des 55 tables de la base : 0 ligne(s) contenant la valeur
- OK **f10** journaux du conteneur nexora-cms-test : 0 occurrence(s) de la valeur
- OK **f12** témoin positif (valeur écrite dans une collection) : le balayage la trouve dans directus_revisions=1, claims=1 (directus_activity ne stocke jamais les données, seulement l’action)
- OK **f13** témoin positif (valeur dans une URL) : 1 occurrence(s) dans les journaux
Lignes de journal produites par le Coffre :
```
[02:27:22.908] INFO: [nexora-vault] dépôt de essai.temoin (other) : 200
[02:28:14.750] INFO: [nexora-vault] dépôt de essai.temoin (other) : 200
```
- OK **f11** côté app (bouchon), la valeur a bien été reçue : référence `essai.temoin` présente (true), 4 derniers caractères « iser »

### Bilan : 58/58 vérifications passées

**Lecture des résultats.**

- **(a)** L'Éditeur crée et enregistre une version mais ne peut pas la promouvoir : refusé par ses permissions (`FORBIDDEN`), et même un compte autorisé à promouvoir (Relecteur, Publication, administrateur) est arrêté par la garde tant qu'aucune approbation ne porte sur le hash exact.
- **(b)** Le hash est calculé par le serveur (un hash forgé par le client est ignoré) et égal au SHA-256 recalculé hors de Directus. Une fois approuvée par le Relecteur, la promotion par le compte « Publication » passe, le contenu publié change, l'approbation est marquée appliquée (usage unique), la revalidation part une seule fois avec `{collection, id, slugs}`.
- **(c)** Modifier la version après l'approbation rend l'approbation `périmée` (événement `versions.update`) ; la promotion est alors refusée ; une approbation périmée ne peut pas être ré-approuvée. Le chemin sans événement (version altérée en base) est attrapé à la promotion (`NEXORA_APPROBATION_PERIMEE`).
- **(d)** Écriture directe sur la page, une traduction, un bloc (ou sa traduction), l'ajout d'un bloc ou la suppression de la page publiée par Relecteur ou Publication : refusée. Une page non publiée reste modifiable par le compte autorisé (la garde ne vise que l'élément publié) ; l'administrateur reste libre d'écrire directement (voulu : accès de secours, journalisé).
- **(e)** **Constat sur les blocs M2A** : ils font **partie** de la version de la page. Le delta de la version contient `blocks.create|update|delete` avec le bloc, ses traductions et la jonction ; l'aperçu `?version=<clé>` les montre fusionnés ; la promotion applique le tout avec la page. Le contenu d'un bloc modifié dans une version n'existe donc nulle part en table principale avant la promotion, et toute modification de bloc périme l'approbation.
- **(f)** La valeur témoin n'apparaît ni dans `directus_activity`, ni dans `directus_revisions`, ni dans aucune des 55 tables de la base (balayage de chaque ligne), ni dans les journaux du conteneur, y compris pour un corps JSON mal formé qui la contient. Deux témoins positifs prouvent que ces balayages détectent bien une valeur qui passe par une collection (retrouvée dans la collection et ses révisions) ou par une URL (retrouvée dans les journaux). `directus_activity` ne stocke jamais les données, seulement l'action ; c'est `directus_revisions` qui les stocke.

**Essai par l'interface** (instance de test, navigateur) : le module « Coffre » apparaît dans la barre ; référence `ui.temoin`, type « Fournisseur de modèles », valeur factice saisie dans le champ masqué, envoi par Entrée : le message « Enregistré : ui.temoin · type llm_provider · se termine par 0042 » s'affiche, le champ de valeur est vidé, le bouchon de l'app a reçu l'enregistrement, et la valeur est absente des journaux et de toutes les tables (même balayage que (f)).

Autres constats de l'essai :

- Sans l'app (bouchon arrêté), une promotion acceptée réussit quand même : la revalidation échoue, un seul `WARN` sans secret est journalisé, et le Coffre répond `502 COFFRE_INDISPONIBLE`.
- Un utilisateur qui n'a que **lecture** sur `directus_versions` peut enregistrer (`/versions/:id/save`) dans une version existante : Directus ne contrôle pas la permission de modification du contenu cible à l'enregistrement. C'est sans danger pour la publication (la garde exige l'approbation du hash final) mais cela justifie de ne donner la lecture des versions qu'aux rôles de rédaction.

## 7. Limites connues et points à décider

1. **Licence** (§2) : sans la clé, pas de lecture « publiée seulement » pour le public, et le site doit filtrer `status = published`. Le seed crée la page d'accueil avec `status = draft` dans la table principale : le jeton « lecteur site » la voit tant que la clé n'est pas appliquée.
2. **Blocs lisibles hors de leur page** : Directus ne peut pas filtrer un bloc M2A par la page qui le référence. Les blocs ne sont lisibles que par le rôle de lecture, et leur contenu n'entre dans la table principale que par une promotion approuvée (ou par le seed, ou par l'administrateur). Une page archivée garde ses blocs lisibles.
3. **Billet de promotion** : Directus n'émet aucun événement quand une promotion échoue après le filtre `items.promote` ; le billet reste alors actif jusqu'à son expiration (15 s). Depuis le durcissement du 27/10/2026 il est **lié à la page promue** : pendant ce délai, le même utilisateur ne peut écrire directement que sur cette page-là (jamais sur une autre page publiée), ce qui exige déjà un compte autorisé à promouvoir cette page.
4. **Planification** : `publish_at` est stocké dans l'approbation et dans la page, mais rien ne publie à l'heure (flow CRON ou tâche du worker à écrire, avec le compte « Publication »).
5. **Suppressions et revalidation** : les suppressions ne déclenchent pas de revalidation.
6. **Assainissement** : le texte riche (`block_section.body`) est du HTML ; le site doit l'assainir au rendu.
7. **Vue publique des fichiers** : le rôle public et « lecteur site » lisent les métadonnées de tous les fichiers de la médiathèque. Pas de dossier public dédié pour l'instant.
8. **Invites de la première connexion** : à la première connexion d'un administrateur, Directus 12 propose de saisir une clé de licence puis de désigner le « propriétaire du projet » en acceptant la MSCL-1.0-GPL et un contrat de traitement des données. Je n'ai accepté aucune condition (« Ignorer », « Rappeler plus tard ») : c'est une décision du fondateur.
9. **Courriels des comptes de service** : en `@nexora.dev` (Directus refuse les domaines `.test`).

## 8. Retouches faites en dehors de `cms/`

Le Directus partagé n'avait **aucun utilisateur** : `deploy/init-env.sh` produit `DIRECTUS_ADMIN_EMAIL` en `…@nexora.test`, que Directus 12 refuse (« Value has to be a valid email address », `.test` n'est pas un domaine valide), donc l'amorçage avait créé le rôle administrateur mais pas l'utilisateur. Correctif appliqué sur pc6 : domaine du courriel changé en `nexora.dev` dans `deploy/.env` (non versionné), administrateur créé dans le Directus partagé (`directus users create`). **À reporter dans `deploy/init-env.sh`** (zone de l'orchestrateur) pour que les prochaines installations produisent un courriel valide.

## 9. Rendu côté site (S2) : lecture, aperçu, revalidation

Code : `web/src/server/cms/` (lecture), `web/src/components/blocks/` (six blocs), `web/src/app/[lang]/page.tsx` et `[...slug]/page.tsx`, `web/src/app/api/{revalidate,preview,media,admin/preview-link}`.

- **Lecture.** Jeton `DIRECTUS_READER_TOKEN` côté serveur seulement. Toute recherche de page filtre `pages_id.status = published` (le jeton voit aussi les brouillons sans licence) ; le statut est revérifié sur la page lue. L'accueil se cherche avec `slug _empty` (Directus refuse `_eq` avec une chaîne vide). Réponses validées par zod ; un bloc sans traduction dans la langue demandée n'est pas affiché (jamais de français sur `/en`).
- **Cache.** `use cache` avec étiquettes `page:pages:<id>`, `page-slug:<code>:<slug>`, `nav`, `site`. La revalidation (`POST /api/revalidate`, corps `{collection,id,slugs}`, Bearer `NEXORA_APP_ADMIN_TOKEN`) appelle `revalidateTag(étiquette, { expire: 0 })` et `revalidatePath` pour chaque slug dans les deux langues : la publication remplace l'ancienne version à la requête suivante.
- **Pages inconnues.** Une adresse inconnue lue en direct n'est gardée que 2 minutes (`cacheLife` court, `cms/cache-life.ts`) : inventer des adresses n'enfle plus le cache.
- **Panne de Directus.** Chaque lecture réussie écrit un instantané (mémoire + `CMS_SNAPSHOT_DIR`, défaut `web/.cache/cms`) ; en cas de panne, d'erreur HTTP ou de réponse inexploitable, la dernière version connue est servie (cache de 10 s pour réessayer vite). Une page dépubliée efface son instantané. Sans instantané : accueil → squelette des dictionnaires, autre page → message « contenu indisponible » (200, noindex).
- **Aperçu.** `POST /api/admin/preview-link` (Bearer d'administration, `{lang,path}`) renvoie un lien signé valable 10 minutes (`NEXORA_PREVIEW_SECRET`, 32 caractères au moins) ; `GET /api/preview` vérifie la signature, active le Draft Mode, pose la **session signée `nexora_preview` de 30 minutes** (HttpOnly, SameSite=Lax) et redirige vers un chemin du site ; `proxy.ts` n'honore le cookie du Draft Mode (constant, sans expiration) qu'avec cette session valide, sinon il l'efface par une redirection. En aperçu, `getPage` lit la version la plus récente de la page (`/versions` puis `?version=<clé>`, blocs M2A fusionnés) avec le jeton **Publication** (le jeton lecteur n'a pas accès aux versions), affiche le bandeau « Aperçu — non publié », et la réponse est `noindex` + `Cache-Control: private, no-store` (aussi `X-Robots-Tag` par `proxy.ts`). Sortie : bouton du bandeau (`POST /api/preview/exit`).
- **Images.** `/api/media/<uuid>` relaie `/assets/<uuid>` de Directus avec le jeton lecteur (raster seulement, SVG refusé) ; `next/image` n'utilise que ce chemin local.
- **404.** `partialPrefetching: false` dans `next.config.ts` : avec le prefetch partiel, la première visite d'une URL inconnue recevait l'enveloppe en 200 (soft 404). Désormais une page inconnue répond un vrai 404 dès la première requête.
- **Preuves** : `docs/preuves/s2/e2e-publication.md` (script `web/scripts/e2e-publication.ts`, 25/25 sur une page jetable et sur l'accueil).

Variables du site : `DIRECTUS_URL`, `DIRECTUS_READER_TOKEN`, `DIRECTUS_PUBLISHER_TOKEN`, `NEXORA_PREVIEW_SECRET`, `CMS_SNAPSHOT_DIR`, `CMS_TIMEOUT_MS` (`scripts/init-dev-env.sh` les écrit dans `web/.env.local`).

## 10. Composition des pages (S3) : tons, dispositions, schémas, ancres

Les six types de blocs restent les mêmes (D5) ; S3 ajoute des **champs de composition** (schéma : `cms/scripts/lib/schema.ts`, test : `schema.test.ts` ; appliqués au Directus partagé par `apply.ts`, idempotent : deuxième exécution `0 créés, 0 modifiés`).

| Champ | Blocs | Valeurs (défaut) | Rendu |
|---|---|---|---|
| `tone` | section, cartes, tarifs, FAQ ; CTA (déjà là) | `sombre`, `clair`, `sable` (`clair` ; CTA : `sombre`) | sombre = fond noir profond ; clair = papier ; sable = surface crème relevée. L'ancienne valeur « accent » du CTA se lit « sable ». |
| `variant` | héros | `sombre`, `clair`, `sable` (`sombre`) | idem |
| `layout` | cartes | `grille`, `liste`, `etapes`, `modules` (`grille`) | liste = rangées pleine largeur, libellé mono à gauche (champ de carte `label`, sinon 01, 02…) ; étapes = frise numérotée (horizontale en bureau, verticale en mobile) ; modules = grille compacte M1…, badge de statut facultatif par carte (champ de carte `status` : `disponible`, `acces-anticipe`, `qualifie-localement`, `en-developpement`, `pilote`, `prevu` ; texte + forme, jamais la couleur seule), premier paragraphe visible et détail déplié (`<details>`). |
| `visual` | section | `aucun`, `perimetre-sur-place`, `perimetre-heberge`, `flux-donnees` (`aucun`) | schéma SVG tiré de la grille de périmètre, dans une colonne (à droite, à gauche si `media_position = left`) ; `role="img"` avec texte alternatif traduit (`dict.cms.visuals`). Dans `flux-donnees`, rien d'orange ne sort du périmètre (l'approbation humaine est un carré creux). |
| `anchor_id` | les six | `^[a-z0-9-]{0,40}$` (validation Directus + contrôle côté site) | `id` de la section ; avec **au moins trois** ancres, sommaire collant sous l'en-tête (bureau) ou menu déroulant `<details>` (mobile), section courante marquée (`aria-current="location"`). Le libellé est le titre du bloc, sans point final. |
| carte `status`, `label` | cartes (JSON) | — | voir `layout`. Une valeur inconnue est ignorée (jamais d'état inventé). |

- **Bande continue.** Deux blocs de contenu voisins du même ton (hors héros et CTA) forment une seule bande : espacement resserré à la jonction.
- **Cartes orphelines.** Grille de 12 colonnes (`web/src/lib/card-layout.ts`, testé) : 5 cartes sur 3 colonnes = 3 + 2 (empans 4 et 6), 7 sur 3 = 3 + 2 + 2, 3 sur 2 colonnes = 3 ; jamais une carte seule sur sa rangée en bureau ; en tablette, la dernière carte d'un nombre impair occupe la rangée. S'applique aux grilles de cartes, de modules, de tarifs et aux listes d'une section.
- **Statuts d'OPSYS-AI.** Le badge porte le statut le plus **prudent** du département : `pilote` dès qu'une partie n'est qu'en pilote (M3, M7 et M10 mêlent « disponible » et « pilote » ; le détail le dit). Aucun département n'est 100 % « disponible » aujourd'hui (rapport 07). Test : `cms/content/content.test.ts`.
- **Anciens instantanés.** Un instantané enregistré avant S3 n'a pas ces champs : le rendu a des valeurs par défaut (aucune page ne casse pendant une panne).

### Navigation, pied de page et sélecteur de langue lus depuis Directus

- `navigation` (`placement` : `header`, `footer`, `legal` ; `style` : `link`, `button`, `utility` = lien d'utilité à droite, ex. Connexion ; parent sans lien = menu « Produits » ou colonne du pied de page ; `description` = phrase du menu Produits). Arbre du §6 : `cms/scripts/lib/navigation.ts` ; `seed.ts` crée les entrées absentes, `seed.ts --aligner-navigation` réaligne style, rang, statut et textes des entrées connues (les traductions sont envoyées en forme `{create, update}` : un simple tableau supprimerait les traductions omises).
- Lecture : `getNavigation(lang)` (étiquette `nav`, instantané en cas de panne) puis `buildChrome()` (`web/src/lib/chrome.ts`). **Repli sur les dictionnaires** quand la navigation est absente (Directus muet sans instantané, rien de publié) : en-tête, pied de page et légal sont alors ceux de S1.
- **Table des slugs** (`getAlternates()`, étiquette `slugs`, revalidée avec toute page) : pour chaque page publiée, son slug fr-CA et son slug en-CA. Le sélecteur de langue lie vers le slug TRADUIT de la page courante (`/souverainete` ↔ `/en/sovereignty`), vers l'accueil si la page n'existe que dans une langue, vers le même chemin pour une route de l'application (`/contact`, `/compte`). Les liens de navigation écrits avec le slug de l'autre langue sont corrigés au rendu (`/en/souverainete/` devient `/en/sovereignty`) : pas de 404 pour une simple différence de slug. Tests : `web/src/lib/alternates.test.ts`, `chrome.test.ts`.
- Deux repères de langue distincts (en-tête : « Langue » ; menu mobile : « Langue, navigation mobile » ; pied de page : « Langue, pied de page »).

## 11. Durcissement (recette de sécurité du 27/10/2026)

Procédures d'exploitation et variables de la pile : `docs/infra.md` § « Durcissement de la pile ». Ce qui touche `cms/` :

### Fichiers : plus de remplacement du fichier d'autrui

La permission `update` sur `directus_files` portait le filtre `uploaded_by = $CURRENT_USER`. Sans licence (§2), la règle était retirée et la permission devenait « tous les fichiers » : un Éditeur ou un Relecteur pouvait **remplacer le contenu** de n'importe quelle image publiée (servie par `/api/media`), hors de la garde. La permission est maintenant marquée `degrade: "drop"` : sans licence, **aucun rôle non administrateur ne modifie un fichier** (ils peuvent en téléverser et en lire) ; avec la clé, le filtre « les siens » s'applique. Un filtre dans la garde serait inopérant : le remplacement d'un fichier passe par `FilesService.uploadOne`, qui écrit avec `emitEvents: false` (aucun filtre `files.update` n'est émis). Après un `apply.ts`, la permission déjà accordée est retirée (le script supprime les permissions qu'il ne déclare plus).

### 2FA (`enforce_tfa`)

`apply.ts` imposait `enforce_tfa: false` à toutes les politiques. Il l'**exige** maintenant des politiques de personnes : Éditeur, Relecteur et la politique d'administration. Jamais des comptes de service à jeton statique (Publication, Lecteur site) ni des agents, qui n'ouvrent aucune session. `CMS_ENFORCE_TFA=0` (ou `false`, `non`, `off`) la désactive en développement ; la valeur par défaut est « activée ». La variable se lit dans l'environnement du processus ou dans le fichier `.env`.

Comment Directus 12.5.1 l'applique (lu dans `services/authentication.js`) : à la connexion, un utilisateur **sans secret 2FA** dont une politique l'exige reçoit un jeton portant `enforce_tfa: true` ; le **panneau** l'oblige alors à l'activer avant toute chose. L'API n'interdit rien à ce jeton : l'exigence est un contrôle du panneau, pas un blocage de l'API. Un utilisateur **avec** secret doit fournir `otp` à `/auth/login`.

**Conséquence pour les scripts** de `cms/scripts` (`apply.ts`, `seed.ts`, `essai-garde.ts`, `load-content.ts`) : ils se connectent par `Directus.connect` : `DIRECTUS_ADMIN_TOKEN` s'il existe (à préférer : un jeton statique ne dépend ni d'un mot de passe ni d'un code), sinon courriel et mot de passe. Un administrateur qui a activé la 2FA ne peut plus se connecter ainsi : le script s'arrête avec un message explicite (« ce compte a activé la 2FA : utilisez `DIRECTUS_ADMIN_TOKEN` … ») ; on peut fournir `DIRECTUS_ADMIN_OTP` (code à 6 chiffres, valable environ 30 s). Marche à suivre : après avoir activé la 2FA sur le compte administrateur, créer un **jeton statique** (Utilisateurs → compte administrateur → Jeton) et le poser dans `deploy/.env` (`DIRECTUS_ADMIN_TOKEN=…`). `load-content.ts` se connecte avec les comptes `editeur@nexora.dev` et `relecteur@nexora.dev` qu'il crée lui-même (mots de passe dans `.env`) : **n'activez pas la 2FA sur ces deux comptes de chargement** ; désactivez-les (statut « suspendu ») une fois les contenus chargés.

### Mots de passe

Directus 12.5.1 n'a **pas** de variable `AUTH_PASSWORD_POLICY` : la politique est le réglage `auth_password_policy` du projet (Réglages → Sécurité). `apply.ts` le pose : 12 caractères au moins, une minuscule, une majuscule, un chiffre (`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/`, `cms/scripts/lib/password.ts`). Elle s'applique à toute création ou modification de mot de passe par l'API ou le panneau, pas au mot de passe de démarrage `ADMIN_PASSWORD`. `auth_login_attempts` reste à sa valeur par défaut : au-delà du seuil Directus **suspend** le compte, ce qui permettrait à n'importe qui de verrouiller l'administrateur en échouant des connexions.

### Révisions (`directus_revisions`) : constat

Soupçon : les rôles Éditeur et Relecteur lisent `directus_revisions` ; les révisions de `directus_users` contiennent-elles les jetons statiques posés par `apply.ts` ? **Non.** Vérifié en lecture seule sur la base `directus` du Directus partagé (comptes seulement, aucune valeur lue) : 16 révisions de `directus_users`, 12 portent un champ `token`, **toutes les 12 valent `**********`** (Directus masque les champs « conceal » et les mots de passe avant d'écrire la révision) ; 0 valeur en clair pour `token`, `password` et `tfa_secret` ; dans les 8 révisions de `directus_settings`, aucune clé d'IA, de licence ni de carte n'est renseignée (et elles seraient masquées de même). Aucune permission retirée. Reste : ces révisions montrent les adresses courriel et la structure des rôles aux Éditeurs et Relecteurs, qui ne voient pas les courriels ailleurs (`USER_FIELDS`). Faute de filtre sans licence, la seule parade serait de retirer la lecture des révisions, ce qui supprimerait l'historique des éléments dans le panneau : non fait, à reconsidérer avec la clé (filtre `collection` hors `directus_*`).

### Politique de mot de passe, limitation de débit, CSP : voir `docs/infra.md`

Les réglages d'environnement de Directus (limitation de débit, durée des jetons, témoins, liste de refus des importations par URL, types de fichiers, introspection GraphQL, CSP, HSTS) sont dans `deploy/compose.yml` et décrits dans `docs/infra.md`. Les scripts de ce dossier réessaient seuls après un `429` (`withRateLimitRetry`). L'essai de la garde (§6) compte désormais **59** vérifications (étape `b3b` : un relecteur n'approuve pas sa propre proposition) ; `ESSAI_DB_CONTAINER` choisit le conteneur PostgreSQL qu'il lit et altère (défaut : `nexorasite-db-1`, le cluster partagé : **à changer pour viser un cluster jetable**).

