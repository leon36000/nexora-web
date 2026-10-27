# Recette des pages (S9) — 27/10/2026

Faite par l'orchestrateur après la fusion des pages vitrine (S3), sur un **build de production** de `main` (`next start -H localhost -p 3501`, `SITE_ENV=production`), avec l'audit du produit lui-même (`worker/src/seo/`), lancé sans passer par la file : `SEO_AUDIT_BASE_URL=http://localhost:3501 node worker/scripts/dev-run-audit.ts` (aucune autre tâche traitée, ni indexation ni agent).

## Résultats (audit `e0945cf6`, après correctif)

| Volet | Portée | Résultat |
|---|---|---|
| Structure SEO | 44 pages du sitemap | 0 problème (titres et descriptions uniques par langue, canonical, hreflang réciproques, `x-default`, un seul h1, JSON-LD conforme) |
| Liens (lychee) | 3 218 liens, externes compris | 0 lien cassé (les 313 liens cassés connus avant S3 sont résolus) |
| Accessibilité (axe, WCAG 2.0–2.2 AA) | 44 pages à 390 et 1440 px | 0 violation |
| Performance (Lighthouse mobile) | 6 pages | 94 à 97 en une mesure ; médianes de 7 et 3 mesures : `/en` 97, `/deploiement` 97, `/suite` 97 ; accessibilité, bonnes pratiques et SEO à 100 |

Les mesures à 94 coïncident avec une charge de 5 sur pc6 (machine partagée) : le LCP simulé bascule alors de 2,4 s à 3,0 s.

## Défauts trouvés et corrigés

1. **Contraste du badge « Disponible »** (12 erreurs axe : `/workstudio`, `/suite`, `/centre-de-confiance` et leurs versions anglaises) : texte vert `moss-700` sur les surfaces sable, sous 4,5:1. Le texte passe en `text-fg`, le vert reste sur le filet et le carré plein (élément graphique, 3:1 suffisant). Même correctif que le badge VPS de S6. Audit relancé : 0 violation.
2. **Liens de navigation vers des pages absentes** (Tarifs, Ressources, Loi 25, mentions légales) : masqués tant que la page n'est ni publiée ni une route de l'application (`targetExists`, test RED→GREEN). Ils réapparaissent à la publication.
3. **Lien `/en/models/`** de l'accueil anglais : corrigé en `/en/modeles/` et republié par la chaîne d'approbation.

4. **Routes de l'application absentes du sitemap** quand le serveur tourne depuis un autre répertoire (`next start web/` lancé ailleurs) : `appRouteExists` cherchait le manifeste et les sources sous `process.cwd()` et, faute de les trouver, retirait `/contact`, `/modeles`, `/docs/api`, `/agents` et `/vps` du sitemap, de `llms.txt` et de la navigation rendue à la demande. Sans manifeste ni sources, elle ne retire plus rien (test RED→GREEN).

## Constat de déploiement (non corrigeable dans le code)

Le serveur Next de production doit être lié à `localhost` ou à `0.0.0.0` (conteneur), **jamais à `127.0.0.1` ni à `::1`**. Avec `-H 127.0.0.1`, toutes les pages françaises bouclent en 308 (l'anglais répond 200). Cause, vérifiée dans Next 16.4.3 (`next/dist/server/web/adapter.js`) : l'adaptateur refabrique la réécriture de `proxy.ts` (`/x` → `/fr/x`) avec `NextURL`, qui renomme 127.0.0.1 en « localhost ». L'origine ne correspond plus à celle du serveur, Next proxifie la requête comme une réécriture externe, et la règle `/fr/…` → `/…` renvoie un 308. Un correctif dans `proxy.ts` a été essayé puis retiré : l'adaptateur renormalise après lui. Reprendre l'en-tête `Host` aurait ouvert une SSRF.

## Revue visuelle

Captures pleine page 1440 et 390 px de `/souverainete`, `/solutions/courriels`, `/en/trust-center` et `/deploiement/heberge-quebec`, relues : bandes sombre, clair et sable alternées, schémas de périmètre, sommaire collant, FAQ, aucun débordement horizontal ni bloc vide.
