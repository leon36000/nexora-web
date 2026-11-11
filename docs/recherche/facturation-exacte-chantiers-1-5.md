# Facturation exacte : chantiers 1 à 5 (audit de précision, F-01 à F-17)

État au 11/11/2026, branche `feat/facturation-exacte-20261112` (base `gitlab/developpement` e26bb8a). Rien n'est poussé, rien n'est déployé, aucune base de production ni aucun secret n'ont été touchés, aucun appel payant n'a été fait (amonts simulés, PostgreSQL 17 jetable en conteneur local).

Source : `DOC-FACT/RAPPORT-FACTURATION.md` (audit, non versionné), feuille de route (E) chantiers 1 à 5. Chaque chantier : le test qui échoue sur le code précédent, le correctif, la vérification qu'aucun test existant ne régresse. Un commit par chantier.

| # | Commit | Constats | Migration |
|---|---|---|---|
| (0) | `10d0557` | deux essais périmés (menu d'en-tête, horloge figée de WebPilot) qui échouaient avant tout changement | aucune |
| 1 | `f15afc4` | F-03, F-13 | 0031 `usage_source` |
| 2 | `7506a89` | F-02 | aucune |
| 3 | `c0feaaa` | F-06, F-07 | 0032 identifiants amont, nano-USD, change figé |
| 4 | `5fcd6d4` | F-01 | 0033 `usage_intents`, `reconciliation_findings` |
| 5 | `3676a57` | F-06, F-09 (mesurable), F-17 (mesurable) | 0034 `usage_reconciliations`, `reconciliation_runs` |

Le numéro 0030 de l'audit est déjà pris (`0030_creative_reglages`) : les migrations sont 0031 à 0034, chacune additive.

## Écarts avec la proposition de l'audit (à savoir avant de relire)

1. **`usage_events` est en ajout seulement** (déclencheur `usage_events_append_only`, migration 0005). La « ligne `pending` mise à jour au règlement (`ON CONFLICT DO UPDATE`) » de l'audit est donc impossible. Le journal d'intention est une table à part (`usage_intents`), et les résultats de réconciliation (jetons natifs, statut) vont dans `usage_reconciliations`. Les colonnes `native_*`, `reconciled_at`, `reconcile_status` de la proposition n'existent pas sur `usage_events`.
2. **L'identifiant d'appel LiteLLM est fixé AVANT l'appel**, pas lu dans la réponse : la passerelle génère un UUID, l'envoie dans `x-litellm-call-id` et l'écrit dans l'intention. Vérifié dans le code de l'image épinglée `ghcr.io/berriai/litellm:v1.106.2@sha256:7294b90f…` : `resolve_litellm_call_id(request.headers.get("x-litellm-call-id"))` (longueur maximale 256) alimente `data["litellm_call_id"]`, et la table `LiteLLM_SpendLogs` a la colonne indexée `litellm_call_id`. Même un arrêt avant la première réponse est donc rattachable à la dépense. **Non vérifié par un appel réel** (aucune clé, aucun appel payant).
3. **Aucune API par requête n'existe chez DeepInfra** d'après la documentation consultée (réponse de complétion avec `usage.estimated_cost`, pas de lecture par identifiant). DeepInfra est couvert par le journal LiteLLM (même identifiant d'appel) et par `estimated_cost` capturé à la requête ; la comparaison à la facture DeepInfra reste manuelle et agrégée.
4. Page d'administration : il n'y a pas de pages d'administration dans l'application Next.js (l'administration passe par des API à jeton et le module Directus). La page est donc `/compte/ecarts-facturation`, réservée au personnel (compte `isStaff` ; un client reçoit un 404), sans entrée dans le menu latéral.

## Chantier 1 : usage nul ou incomplet (F-03, F-13)

- **Constat.** Un bloc `usage` à zéro (ou sans sortie) avec une réponse livrée était accepté comme exact pour tout type de cible sauf les agents : facturé 0 µCAD (S5), statut `ok`. Un flux complet terminé par `[DONE]` sans bloc `usage` était enregistré `aborted / upstream_interrupted` (S4).
- **Correctif.** `checkUsage` (proxy.ts) : entrée à 0, ou sortie à 0 / indéterminée alors que du contenu est livré, remplacent la valeur douteuse par l'estimation de repli (l'entrée rapportée et le coût rapporté sont gardés quand ils sont fiables). Réponse vide : zéro légitime. Embeddings (vecteurs livrés) et reclassement couverts. Colonne `usage_events.usage_source` : `provider`, `estimated_missing`, `estimated_aborted`, `estimated_interrupted`, `settled_by_recovery`, `none` (échec). Flux terminé par `[DONE]` sans usage : `ok`, `estimated_missing`.
- **Tests.** `billing-usage-source.test.ts` (12, tous en échec avant). Un essai existant aligné avec justification : `proxy.test.ts` « facture les jetons en cache » fournissait 0 jeton de sortie avec du contenu livré (1000 → 1009 µCAD, l'intention de l'essai est inchangée).

## Chantier 2 : abandon d'une requête non diffusée (F-02)

- **Constat.** `abortedTokens` facturait `max_tokens` en entier : 480 081 µCAD contre 4 581 µCAD pour la même requête menée à terme (S1, ×105), alors que l'appel amont est coupé par le signal d'annulation.
- **Correctif.** Invite estimée seulement, 0 jeton de sortie, source `estimated_aborted`, que l'annulation survienne pendant l'appel ou pendant la lecture du corps. Le complément éventuel est signalé par la réconciliation (`token_mismatch` donne `complementCompletionTokens`), jamais supposé.
- **Tests.** `billing-aborted.test.ts` (3, 2 en échec avant). Essai aligné : `proxy.test.ts` « requête non diffusée : invite estimée + max_tokens demandé » figeait le comportement fautif sans mesure.

## Chantier 3 : de quoi rapprocher chaque requête de l'amont (F-06, F-07)

- **Constat.** Aucun identifiant d'appel ou de génération, coût amont arrondi au micro-USD (0,0000004 USD enregistré 0, lu « gratuit »), `estimated_cost` de DeepInfra ignoré, pas de taux de change par événement.
- **Correctif.** Migration 0032 : `litellm_call_id`, `litellm_response_cost_nano`, `upstream_generation_id`, `upstream_provider`, `reported_cost_usd_nano`, `upstream_cost_usd_nano`, `fx_usd_to_cad_micro`, trois index partiels (rien à indexer sur les anciennes lignes). `usdToNano` (nombre JSON, chaîne décimale, notation scientifique « 5.75e-05 » de LiteLLM) sans flottant ; absent = `null`, jamais 0. La colonne `reported_cost_usd_micro` reste écrite (arrondi) pour les lecteurs historiques et le retour arrière. Rien de l'amont n'est montré au client.
- **Tests.** `billing-capture.test.ts` (6, 5 en échec avant, dont S12), `upstream-money.test.ts` (6).

## Chantier 4 : journal d'intention durable et arrêt propre (F-01)

- **Constat.** Un arrêt du serveur entre la réservation et le règlement ne facturait rien et ne laissait aucune trace : réservation libérée à zéro par le worker 30 min plus tard (S3). Aussi : `docker stop` tue le site après 10 s au milieu d'un flux.
- **Correctif.**
  - Migration 0033 : `usage_intents` (ligne `pending` écrite DANS la transaction de la réservation, donc avant l'appel amont, avec l'identifiant d'appel, l'instantané de prix et le coût de l'invite estimée) et `reconciliation_findings`. Le règlement ferme l'intention dans sa transaction.
  - `releaseStaleReservations` : pour une réservation `gw:…`, intention connue avec identifiant d'appel, règle à l'estimé (invite seule, événement `settled_by_recovery`, `lost_in_flight`, daté de la requête), anomalie `recovered_in_flight` ; sinon (antérieure au journal, agent) libère et consigne `lost_reservation`. Organisations « maison » : reprises par leur intention seule. Les réservations hors passerelle (WebPilot, Creative) sont libérées comme avant. Ordre des verrous identique au règlement normal. Un règlement tardif après reprise ne double jamais la facturation (testé).
  - Arrêt propre : `inflight.ts` (registre global des requêtes en vol), `drain.ts` branché par `instrumentation.ts` sur SIGTERM/SIGINT ; après `GATEWAY_DRAIN_GRACE_MS` (20 s) les requêtes restantes sont réglées de force (appel amont coupé, `aborted / server_shutdown`, invite estimée + livré, fin de flux explicite, 503 hors flux). `deploy/compose.site.yml` : `stop_grace_period: 45s`.
- **Choix à valider.** La reprise FACTURE l'invite estimée d'une requête perdue. Risque : une requête perdue AVANT l'envoi (fenêtre de quelques millisecondes) est facturée à tort ; la réconciliation la verrait comme `billed_no_upstream`. Alternative : ne rien facturer et consigner seulement. J'ai retenu la facturation parce que la perte silencieuse est la haute gravité de l'audit.
- **Tests.** S3 adapté (`billing-intents.test.ts`), drain (5), **vrai SIGKILL d'un sous-processus Bun** entre réservation et règlement (`billing-crash.test.ts`), 10 tests d'intentions en base, 1 test du worker.

## Chantier 5 : `reconcile.daily` (F-06, F-09, F-17)

- **Correctif.** Migration 0034. `reconcile()` pur : `unbilled_upstream`, `billed_no_upstream`, `token_mismatch` (tolérance 25 % pour les jetons estimés, 5 % OpenRouter, exact LiteLLM), `cost_mismatch` (max(0,5 %, 2 000 nano-USD)), `negative_margin` (au change figé de l'événement), `aggregate_drift` (par source, jour, modèle : plus de **0,5 % OU 1 USD**, plancher de bruit de 0,0001 USD pour la règle relative). Invariants internes : règlement de la passerelle = coût de l'événement, solde et retenu en cache = somme des écritures. Une source illisible ne conclut rien. Job `reconcile.daily` : 03:00 America/Toronto pour le jour UTC précédent, clé d'idempotence par jour, reprise des deux jours précédents qui ont encore des événements sans résultat, rejouable (écarts idempotents par `dedupe_key`), alerte par courriel (comptes seulement), purge des intentions réglées de plus de 60 jours. Adaptateurs : journal LiteLLM (SQL lecture seule) et `GET /api/v1/generation` d'OpenRouter (clé lue dans le coffre, hôte vérifié, reprises sur 404). **Jamais de correction automatique du grand livre.**
- **Détection des dépenses sans ligne** (`unbilled_upstream`) : seulement si `RECONCILE_LITELLM_KEY_HASHES` est posée (sinon d'autres clients de LiteLLM feraient de faux positifs ; le résumé de l'exécution le dit).
- **Page** `/compte/ecarts-facturation` : dernière exécution, écarts filtrables, fr-CA et en-CA par le dictionnaire du panneau, tableau avec légende et en-têtes, région défilable au clavier, libellés liés aux champs.
- **Tests.** 13 purs, 7 en base (invariants, enregistrement idempotent, purge), 11 du worker (adaptateur LiteLLM sur SQL réel, OpenRouter en `fetch` simulé, planification à 03:00 Toronto, reprise), 8 de présentation.

## Résultats de vérification

`bun run test` (tous les paquets) : zéro échec en dernier passage (db 144, worker 223, web 2 613 réussis). `bun run --cwd web typecheck`, `worker`, `packages/db` : propres. Biome : propre sur tous les fichiers touchés (14 erreurs de format préexistantes ailleurs, non touchées). `check:contrast` : OK. Migrations 0031 à 0034 appliquées par-dessus l'état 0030 avec une ligne `usage_events` existante : la ligne est conservée, les quatre tables sont créées.

Constats de santé de la suite, préexistants : le typecheck de `cms` échoue déjà sans mes changements (`creative/contract.test.ts`) ; `auth-security.test.ts` (rejeu TOTP) a échoué une fois sur une dizaine de passages, dépendant de la fenêtre temporelle ; `activity-detail.test.ts` (« n'expose jamais… », recherche de la sous-chaîne « 4321 » dans des identifiants aléatoires) a échoué deux fois sur une vingtaine de passages. Non investigués plus loin.

## Ce qui reste ouvert (non fait)

- Chantiers 6 à 10 de la feuille de route (clé par appareil, estimation calibrée F-04, réservation prudente F-05, marge et change F-08, observabilité, finitions F-09 `num_retries`, F-10 arrondi, F-11, F-12, F-14, F-15).
- Aucune correction automatique : le complément d'un abandon, le remboursement d'une surfacturation (`billed_no_upstream`) et le règlement d'un `unbilled_upstream` restent des décisions humaines (écritures de crédit explicites). La phase 2 de l'audit (règlement tardif automatique via `LiteLLM_SpendLogs`) n'est pas implémentée.
- `reconciliationByModel` (route d'administration 30 jours) lit encore la colonne en micro-USD ; elle est supplantée par la réconciliation quotidienne.
- Les réservations déjà ouvertes au moment du déploiement n'ont pas d'intention : si elles sont perdues, elles seront libérées avec une anomalie `lost_reservation` (reason `no_intent`).

## Non prouvé

- Le format exact de la réponse `GET /api/v1/generation` d'OpenRouter (champs `total_cost`, `native_tokens_*`, `cancelled`, `provider_name`) vient de la documentation publique, pas d'un appel réel.
- Le comportement réel de `x-litellm-call-id` en entrée, de `x-litellm-response-cost` et de `usage.cost` / `estimated_cost` à travers la v1.106.2 : lu dans le code de l'image, jamais appelé.
- Le comportement de Next.js 16 au SIGTERM en production (le drain a été testé par appel direct de `drainGateway` et par SIGKILL d'un processus ; l'envoi d'un vrai SIGTERM à un conteneur n'a pas été essayé). Le serveur ferme déjà les connexions ; le drain règle ce qui reste.
- La charge : aucune mesure du coût de l'écriture de l'intention (un INSERT de plus dans la transaction de réservation) ni de la réconciliation sur un volume réel.
- Aucun volume de production : les pertes réelles de F-01 et F-09 restent inconnues tant que le journal ne tourne pas.

## Plan de déploiement

Prérequis : le fondateur décide (rien n'a été lancé). Les commandes sont à exécuter par lui ou avec son accord explicite.

1. **Sauvegarde avant la migration.** `vzdump` de la VM 201 (la pile du site : `site`, `worker`, PostgreSQL, LiteLLM) : `vzdump 201 --storage backup-nvme0 --mode snapshot --compress zstd` (stockage et mode de l'essai réussi sur la VM 203, `docs/deploiement-proxmox-workstudio.md` §7 ; le nom du stockage de 201 est à confirmer). Le `vzdump` est cohérent au niveau du système de fichiers, pas de PostgreSQL : ajouter la sauvegarde propre au produit, `deploy/backup.sh --chiffrer <fichier-clé>` (pg_dump de `app` et décompte des lignes). Vérifier la présence de l'archive avant de continuer. Les migrations sont additives et ne retirent rien, mais la création d'index sur `usage_events` verrouille les écritures le temps de leur construction (les index sont partiels, donc vides sur l'existant) : choisir une heure creuse.
2. **Lecture seule pour la réconciliation (facultatif, avant l'étape 5).** Sur la base `litellm`, créer un rôle en lecture seule limité à `"LiteLLM_SpendLogs"` (`CREATE ROLE reconcile_ro LOGIN PASSWORD '…'; GRANT CONNECT ON DATABASE litellm TO reconcile_ro; GRANT SELECT ON "LiteLLM_SpendLogs" TO reconcile_ro;`) et déposer l'adresse dans un secret : `LITELLM_SPEND_DATABASE_URL_FILE` du worker. Le mot de passe est saisi par le fondateur. Poser aussi `RECONCILE_LITELLM_KEY_HASHES` (colonne `api_key` des dépenses de la clé maîtresse de la passerelle) pour activer `unbilled_upstream`. Sans ces variables, le job tourne et déclare ses sources « indisponibles ».
3. **Ordre.** (a) Migrations `bun run db:migrate` (ou l'outil `tools` de `deploy/pile.sh`) : 0031, 0032, 0033, 0034, avant les nouveaux binaires. L'ancien code continue de fonctionner (colonnes additives, anciennes tables inchangées). (b) Construire et démarrer `site` avec `compose.site.yml` à jour (`stop_grace_period: 45s` ; sans la recréation du conteneur le nouveau délai n'est pas pris en compte). (c) Démarrer le `worker` (libération/reprise, `reconcile.daily` planifié à 03:00). (d) Vérifier : une requête `/v1/chat/completions` de test avec une clé d'essai crée une ligne `usage_intents` puis `settled`, l'événement porte `usage_source`, `litellm_call_id`, `fx_usd_to_cad_micro` ; `SELECT status, count(*) FROM usage_intents GROUP BY 1` ne montre pas de `pending` qui s'accumulent ; un `docker stop` du site pendant un flux produit un événement `server_shutdown` ; la page `/compte/ecarts-facturation` répond 200 au personnel et 404 à un client.
4. **Observation, 30 jours.** Lire chaque jour les écarts ouverts avant toute correction ; aucune correction automatique n'existe. Suivre `lost_reservation` (réservations antérieures au journal), `recovered_in_flight`, `billed_no_upstream` et les sources indisponibles du résumé.
5. **Retour arrière.** Le code se rétablit par l'image précédente (`NEXORA_IMAGE_TAG`) sans toucher aux données : toutes les colonnes et tables ajoutées sont ignorées par l'ancien code, `reported_cost_usd_micro` est toujours renseignée. Les tables `usage_intents`, `reconciliation_*`, `usage_reconciliations` peuvent rester ou être supprimées (suppression : commande à donner au fondateur, non exécutée ici). Une réservation de la passerelle ouverte pendant le retour arrière sans intention sera libérée par l'ancien worker comme avant. Restauration complète : `qmrestore` de l'archive `vzdump` de l'étape 1 (non éprouvée, `docs/deploiement-proxmox-workstudio.md` §7), puis `deploy/restore.sh` pour la base. Il ne faut PAS rétrograder LiteLLM : la version reste `v1.106.2`.
