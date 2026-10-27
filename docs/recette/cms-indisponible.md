# Directus indisponible : le site sert son cache

Recette S9, daté du 27/10/2026. Objectif (conception §15, S9) : quand Directus est injoignable, les pages déjà vues répondent 200 depuis un instantané, une page inconnue répond 404, et rien ne plante.

## Méthode

Script reproductible `web/scripts/check-cms-down.ts` (`bun web/scripts/check-cms-down.ts`). Il lance **quatre serveurs de production successifs** (`next start -H localhost`, ports 3743 à 3746) à partir du même build, en **lecture seule** : il n'écrit rien dans Directus et n'y touche pas d'une autre façon que par des requêtes GET du site.

- **A** : Directus joignable ; le script visite les 56 adresses du `sitemap.xml` (cela remplit les instantanés, écrits sur disque en JSON dans `CMS_SNAPSHOT_DIR`).
- **B** : mêmes instantanés (copie du dossier), `DIRECTUS_URL=http://127.0.0.1:9` (port fermé : refus de connexion immédiat). Le serveur démarre à froid, comme après un redémarrage pendant une panne.
- **C** : Directus injoignable **et** dossier d'instantanés vide (premier démarrage pendant une panne).
- **D** : Directus qui accepte la connexion et ne répond jamais (`CMS_TIMEOUT_MS=2000`).

## Mesures

## A. Directus joignable : remplissage des instantanés
- OK le site démarre avec Directus joignable
- OK sitemap.xml liste 56 adresses
- OK toutes les pages du sitemap répondent 200 — 56 pages
- OK page inconnue avec Directus joignable : 404 — HTTP 404

## B. Directus injoignable (port fermé), mêmes instantanés
- OK le site démarre alors que Directus est injoignable
- OK toutes les pages déjà en instantané répondent 200 — 56/56
  - latence la plus haute : 90 ms (/modeles) ; médiane 6 ms
- OK page inconnue /page-inconnue-s9 : 404 — HTTP 404
- OK page inconnue /en/unknown-s9 : 404 — HTTP 404
- OK page inconnue /solutions/inconnue : 404 — HTTP 404
- OK page inconnue /mentions-legales : 404 — HTTP 404
- OK l'accueil servi depuis l'instantané contient son titre
- OK /api/health (indépendant de Directus ou instantané) — HTTP 200
- OK /robots.txt (indépendant de Directus ou instantané) — HTTP 200
- OK /sitemap.xml (indépendant de Directus ou instantané) — HTTP 200
- OK /compte/connexion (indépendant de Directus ou instantané) — HTTP 200
- OK /modeles (indépendant de Directus ou instantané) — HTTP 200
- OK le processus du site est toujours vivant après la rafale de requêtes
- OK aucune exception non gérée dans le journal du serveur
  - journal : 4 avertissement(s) « dernière version connue servie », 4 erreur(s) journalisée(s) (pages inconnues sans instantané : attendu)
  - le journal ne contient aucun jeton : vrai
- OK aucun jeton dans le journal

## C. Directus injoignable ET aucun instantané (premier démarrage pendant la panne)
- OK le site démarre sans instantané et sans Directus
  - / -> HTTP 200
  - /en -> HTTP 200
  - /souverainete -> HTTP 200
  - /faq -> HTTP 200
  - /page-inconnue-s9 -> HTTP 200 (message « momentanément indisponible »)
  - /modeles -> HTTP 200
  - /vps -> HTTP 200
  - /compte/connexion -> HTTP 200
- OK le site reste vivant sans instantané

## D. Directus « trou noir » : accepte la connexion et ne répond jamais (délai CMS_TIMEOUT_MS)
- OK le site démarre alors que Directus ne répond pas
- OK /solutions/factures répond 200 depuis l'instantané — 33 ms (pages préfabriquées : la revalidation en arrière-plan attend le délai de 2 s, le visiteur n'attend pas)
- OK /en/solutions/invoices répond 200 depuis l'instantané — 7 ms (pages préfabriquées : la revalidation en arrière-plan attend le délai de 2 s, le visiteur n'attend pas)
- OK / répond 200 depuis l'instantané — 8 ms (pages préfabriquées : la revalidation en arrière-plan attend le délai de 2 s, le visiteur n'attend pas)
- OK /en répond 200 depuis l'instantané — 7 ms (pages préfabriquées : la revalidation en arrière-plan attend le délai de 2 s, le visiteur n'attend pas)
- OK /deploiement/heberge-quebec répond 200 depuis l'instantané — 6 ms (pages préfabriquées : la revalidation en arrière-plan attend le délai de 2 s, le visiteur n'attend pas)
- OK /en/deployment/hosted-quebec répond 200 depuis l'instantané — 7 ms (pages préfabriquées : la revalidation en arrière-plan attend le délai de 2 s, le visiteur n'attend pas)
  - même page revisitée : 5 ms
  - visite la plus lente : 33 ms (Directus muet n'allonge pas la réponse tant que la page est dans le cache du site ou l'instantané)

**Résultat : tout est conforme.**

## Défaut trouvé et corrigé

Avant S9, en B, `/page-inconnue-s9`, `/en/unknown-s9` et `/mentions-legales` (page qui n'existe pas) répondaient **HTTP 200** avec la page « momentanément indisponible » : un robot d'indexation voyait un 200 pour n'importe quelle adresse pendant la panne, et la réponse était mise en cache 10 s (`s-maxage=10`, `stale-while-revalidate=590`). Le test échouait avant le correctif (`known-slugs.test.ts` : module absent ; mesure initiale : 200 au lieu de 404).

Correctif (`web/src/server/cms/known-slugs.ts`, appelé par `getPage`) : si Directus est illisible et qu'aucun instantané de la page n'existe, le site consulte **la dernière liste connue des pages publiées** (instantané `slug-pairs`). Un slug absent de cette liste est une page inconnue : **404 localisé**. Sans liste connue (cas C), il ne peut rien affirmer et garde la page « indisponible ». Tests : `web/src/server/cms/known-slugs.test.ts` (4).

## Ce qui ne fonctionne pas pendant la panne (noté honnêtement)

| Cas | Comportement | Pourquoi |
|---|---|---|
| Premier démarrage pendant la panne, **sans** instantané (C), page absente du build | HTTP 200 avec le message « momentanément indisponible » (`noindex`, cache de 10 s) au lieu d'un 503 | Une page d'App Router ne peut pas choisir son code HTTP ; lever une erreur donnerait une page d'erreur générique. Les pages préfabriquées au build (accueil, souveraineté, FAQ…) sont servies normalement (200 avec leur contenu) |
| Une page publiée **après** le dernier instantané de la liste, pendant la panne | 404 (le site ne la connaît pas) | Il ne peut pas servir ce qu'il n'a jamais lu ; elle réapparaît dès que Directus revient (cache de 10 s) |
| Modifications, publications, aperçu, modules d'administration | Indisponibles (ils dépendent de Directus) | Voulu : la garde de publication vit dans Directus |
| Pages de l'application (`/modeles`, `/vps`, `/agents`, `/compte`, API `/v1`) | **Fonctionnent** : elles lisent la base `app`, pas Directus (D4/D14). `/compte/…` et la passerelle ne sont pas touchés | — |
| Plans d'abonnement (`subscription_plans`, qui vit dans Directus) | La page d'abonnements affiche « offres indisponibles » | Dépendance déclarée dans `billing/plans.ts` |
| Navigation et pied de page | Servis depuis l'instantané (`nav:fr-CA`, `nav:en-CA`) | — |
| Journal | Chaque lecture servie depuis l'instantané journalise un avertissement ; chaque page sans instantané, une erreur. Aucun jeton ni URL de Directus dans les messages | — |
| Disque des instantanés plein ou illisible | L'instantané mémoire reste ; une erreur d'écriture n'échoue jamais une requête | `snapshots.ts` |

Les instantanés sont dans `CMS_SNAPSHOT_DIR` (défaut `.cache/cms` sous le dossier de travail). **En production, ce dossier doit être un volume persistant** : sans lui, un redémarrage pendant une panne retombe dans le cas C (guide opérateur).
