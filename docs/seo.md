# SEO technique, audits, agents et indexation (S8)

Conception : `docs/superpowers/specs/2026-10-26-nexora-site-design.md` §13, D9, D14 ; recherches `docs/recherche/01` §4.9–§7, `02` §6–§8. Cette page commence par le SEO technique natif (fork B) ; les sections audits, agents du site et indexation s'y ajoutent.

## 1. SEO technique natif

Preuve sur serveur en marche : `docs/preuves/s8/seo-controle.md` (production 0 erreur, préproduction vérifiée). Commande : `BASE_URL=… bun web/scripts/check-seo.ts` (`EXPECT_ENV=staging` pour la préproduction).

### Environnement et indexation

`SITE_ENV=production` est **la seule** valeur qui rend le site indexable (`web/src/lib/seo/site-env.ts`). Toute autre valeur, ou l'absence de la variable, donne : `robots.txt` = `Disallow: /` pour tous, aucun sitemap annoncé, et `X-Robots-Tag: noindex, nofollow` sur toute page (`web/src/proxy.ts`). Défaut sûr : l'oublier en production se voit tout de suite ; l'oublier en préproduction ne livre jamais la préproduction aux moteurs. L'aperçu Draft Mode garde son propre `noindex, nofollow, noarchive`.

### `sitemap.xml` (`web/src/app/sitemap.ts`, logique pure `lib/seo/sitemap.ts`)

- Pages Directus **publiées** seulement (`getSeoPages`, filtre `status = published` côté serveur, revérifié par ligne), jamais `noindex` ; une traduction dont le canonical saisi pointe ailleurs n'est pas listée.
- Routes de l'application : `/contact`, `/modeles` et chaque fiche de modèle du catalogue public, `/docs/api`, `/vps` **seulement si la page existe** (manifeste `.next/server/app-paths-manifest.json`, sinon `src/app/[lang]/vps/page.tsx` ; le site se lance depuis `web/`).
- `alternates.languages` : seulement les langues dont la traduction existe ; `x-default` vers le français quand il existe (même règle que les balises de la page).
- `lastmod` réel ou omis, jamais « maintenant » : page = `date_updated` de Directus ; modèles et `/modeles` = date de publication de la version du catalogue ; `/contact` et `/docs/api` = omis (pas de date connue).
- **Essai réel** (page jetable, supprimée ensuite) : `date_updated` de la page **change bien** quand une promotion ne modifie que le texte d'un bloc M2A (04:31:35 -> 04:31:37). Aucune solution de contournement nécessaire.
- Rendu à la demande (`connection()`) à partir de lectures en cache revalidées par l'étiquette `slugs` : une publication apparaît à la requête suivante.

### `robots.txt` (`lib/seo/robots-policy.ts`)

**Décision du fondateur (29 octobre 2026), revue trimestrielle :** tout le contenu public est fait pour être lu, cité et appris. Par défaut, **tous** les robots listés sont autorisés, entraînement compris ; seuls `/api/`, `/v1/`, `/compte` et `/en/compte` sont fermés. Les engagements « vos données n'entraînent jamais un modèle » (CL-07, CL-E03) visent les données CONFIÉES par les clients, jamais les pages publiques. Repli : `ROBOTS_AI_TRAINING=disallow` refuse seulement l'entraînement.

| Type | Robots (registre `AI_BOTS`, avec opérateur, rôle et page de l'opérateur) | Règle |
|---|---|---|
| Recherche et réponses | Googlebot, Bingbot, DuckDuckBot, Applebot, OAI-SearchBot, PerplexityBot, Claude-SearchBot, MistralAI-Index, Bravebot, Amazonbot | autorisés (sauf chemins privés) |
| Demande d'une personne | ChatGPT-User, Perplexity-User, Claude-User, MistralAI-User, DuckAssistBot | groupe explicite autorisé ; selon leurs opérateurs certains ne lisent pas robots.txt |
| Entraînement | GPTBot, ClaudeBot, anthropic-ai, Google-Extended, CCBot, Applebot-Extended, Meta-ExternalAgent, MistralAI-Training, Bytespider | **autorisés par défaut** ; `ROBOTS_AI_TRAINING=disallow` les refuse |

Chaque robot a son groupe, qui répète les chemins privés (un groupe nommé remplace le groupe `*`). `/og/` reste ouvert (les aperçus sociaux lisent l'image). Ligne `Sitemap:` en production seulement. Contrôle en marche : `bun web/scripts/check-seo.ts` (`EXPECT_AI_TRAINING=disallow` si le repli est posé).

### Données structurées (`lib/seo/jsonld.ts`, schema-dts, `components/seo/json-ld.tsx`)

Générées **par code** depuis ce que la page affiche ; chaque constructeur refuse d'émettre une donnée vide.

| Type | Où | Source |
|---|---|---|
| Organization, WebSite, WebPage | accueil | Organization : nom, adresse du site, logo (`/icon-512.png`), région QC (CL-130), `sameAs` depuis `SITE_SAME_AS` (jamais inventé) ; WebSite sans `SearchAction` ; WebPage avec la date de modification réelle |
| BreadcrumbList | toutes les pages hors accueil, y compris `/modeles/…` | chemin de la page ; étape de section (Solutions, Services, Déploiement, Souveraineté) pour les sous-pages |
| WebPage, AboutPage | pages du CMS hors accueil et hors articles | nom et description affichés, langue, site, `dateModified` = `date_updated` (omise si inconnue) ; `AboutPage` pour la page Entreprise |
| Service | pages du registre `lib/seo/page-schema.ts` (`opsys-ai`, `passerelle-api-modeles`, sections `services`, `solutions`, `deploiement`) ; le fournisseur est l'Organization (`@id`) | nom = titre de la page s'il s'affiche, sinon titre du héros ; description = sous-titre du héros s'il s'affiche |
| SoftwareApplication | `workstudio` quand la page existe | `offers` **seulement** si un prix est affiché (aucun aujourd'hui) |
| Product | fiches `/modeles/<id>` | nom, description et SKU affichés ; une offre par prix affiché (Entrée, Sortie, Cache), CAD, par million de jetons ; **aucune offre pour un prix de développement** ni pour un prix nul |
| Article | slugs `guides/…`, `blog/…` et `articles/…` | `datePublished` = création Directus, `dateModified` = `date_updated` (aucune date de publication distincte n'existe dans le schéma) ; image = `/og/<langue>/<chemin>` ; auteur et éditeur = l'Organization (`@id`) |
| FAQPage | blocs FAQ qui l'autorisent | questions et réponses exactes (existant, conservé) |

Conformité au visible, vérifiée par `checkJsonLdConformity` (`@nexora/seo`) en test et sur le serveur en marche : noms, descriptions, questions et réponses doivent figurer dans le texte de la page ; tout prix annoncé doit être affiché ; une offre sans prix est une erreur. Exception documentée : `BreadcrumbList` (fil d'Ariane de structure, vérifié pour sa forme seulement).

### Images Open Graph (`web/src/app/og/[lang]/[[...slug]]/route.tsx`)

`/og/<fr|en>[/<chemin>]`, PNG 1200 × 630 (next/og, Satori), marque, titre de la page publiée et langue. Le texte vient **de la page**, jamais de l'adresse : page inconnue, non publiée ou chemin douteux = 404 (pas d'image-injection). Polices : instantanés WOFF locaux Geist 500 et Inter 400 (`src/fonts/og/`, Satori ne lit ni WOFF2 ni polices variables). Utilisée comme image par défaut de `buildCmsMetadata` et `buildPageMetadata` quand aucune `seo_image` n'est saisie ; `twitter:card` = `summary_large_image`. Fonctionne sur aarch64 avec Turbopack en `next dev` et `next build` (26 à 39 Ko par image).

### `llms.txt` et `llms-full.txt` (`lib/seo/{llms,llms-full,entity,page-markdown}.ts`)

Générés à la demande depuis les données réelles (jamais écrits à la main, donc jamais périmés) : pages Directus publiées et non `noindex`, routes de l'application qui ont un titre dans les dictionnaires, catalogue de modèles publié, applications VPS publiées.

- `/llms.txt` : titre, résumé (réglages publiés ou dictionnaire) dans les deux langues, **faits à retenir** (phrases courtes rattachées à leurs affirmations du registre, chacune suivie de l'adresse de la page ; `CANONICAL_FACTS` dans `entity.ts`, vérifié contre `cms/content/claims.json` par `geo.test.ts`), puis le plan du site par thème (Produits et API, Solutions, Services et déploiement, Souveraineté et données, Guides, Entreprise et aide, Optional) et par langue. Un fait dont la page n'est pas publiée dans la langue disparaît : aucune adresse orpheline.
- `/llms-full.txt` : le contenu des pages publiées converti en Markdown propre depuis le modèle de page (ce que la page affiche), avec le catalogue de modèles (**un prix de développement n'est jamais reproduit**) et les applications VPS. `?lang=fr` ou `?lang=en` pour une seule langue.
- Aucune promesse : Google a indiqué ne pas utiliser ces fichiers (docs/recherche/01 §4.9) ; ils servent aux outils qui les lisent.

### Clé IndexNow

32 caractères hexadécimaux, générée au premier besoin (`getOrCreateIndexNowKey(db)`, `web/src/lib/seo/indexnow-key.ts`) et stockée dans `seo_settings` (`indexnow_key`) ; publique par conception du protocole, donc hors Coffre. Servie à `/<clé>.txt` par une réécriture de `next.config.ts` (passe avant `[lang]` et le proxy) vers `/api/seo/indexnow-key/<clé>` qui ne répond que si la clé correspond (sinon 404). `bun web/scripts/indexnow-key.ts` la crée ou la relit. La génération pure (`generateIndexNowKey`, `isValidIndexNowKey`) est dans `@nexora/seo` pour le worker.

### `@nexora/seo` (paquet pur, sans entrée-sortie)

`extractPageSeo(html, url, { status, xRobotsTag })` → `PageSeo` ; `parseSitemapXml` ; `checkSite(pages, opts)` (titres/descriptions uniques **par langue** et de longueur correcte — 15–65 et 70–160 caractères, canonical, hreflang réciproques, `x-default`, noindex et sitemap, un seul h1, JSON-LD lisible et connu, conformité) ; `checkJsonLdConformity`. Le worker les consomme pour l'audit « structure » ; les règles (`rule`) sont des identifiants stables.

### Constats réels à traiter (hors de ce jalon)

- `/docs/api` : titre « API | Nexora » (12 caractères, sous le minimum de 15) : à allonger dans `gateway-*-CA.ts` (zone S5).
- `/modeles` : titre court aussi (15–16 caractères, limite).

### Diff Directus proposé (non appliqué)

`pages.schema_type` (liste : `service`, `software`, `article`, vide) pour remplacer le registre de slugs `lib/seo/page-schema.ts` ; `pages.published_at` (date) pour un `datePublished` exact des articles. Aucun des deux n'est nécessaire au fonctionnement actuel.

## 2. Audits planifiés (worker, file `jobs`)

Code : `worker/src/seo/` (`audit.ts`, `audit-structure.ts`, `audit-links.ts`, `audit-a11y.ts`, `audit-perf.ts`, `issues.ts`). Tables `seo_audits` et `seo_issues` (migration 0006). Visible dans le module Directus « SEO » (relais administrateur, patron « Modèles »).

- **Planification** : `worker/src/scheduler.ts` déclare ce qui est dû toutes les minutes, avec une clé d'idempotence par occurrence (plusieurs workers ou un redémarrage ne créent jamais deux fois la même). Heure d'America/Toronto : audit complet à 03 h ; filet de l'indexation et vérification des adaptateurs à 04 h ; santé des modèles chaque heure (si activée) ; veille le lundi 07 h (si activée et si une source est configurée). `WORKER_SCHEDULER=off` coupe le planificateur **en entier**, donc aussi les tâches du grand livre `ledger.release-stale` et `ledger.expire` (hors SEO) ; à réserver aux essais.
- **Quatre volets, indépendants** (un volet qui échoue n'efface pas les constats des autres, le résumé le dit) :
  1. *structure* : sitemap -> chaque page rendue -> contrôles de `@nexora/seo` (titres et descriptions uniques par langue et de bonne longueur, canonical, hreflang réciproques, noindex, un h1, JSON-LD lisible et conforme au visible) ;
  2. *liens* : lychee (`~/.local/bin/lychee`, variable `LYCHEE_BIN`) sur les pages du sitemap, liens externes compris (429 toléré) ;
  3. *accessibilité* : axe-core par Playwright (Chromium) à 390 et 1440 px, règles WCAG 2.0 à 2.2 AA ;
  4. *performance* : Lighthouse (API Node, profil mobile) sur les `SEO_AUDIT_PERF_MAX_PAGES` (6) pages les plus courtes. Sous 95 : avertissement ; sous 80 : erreur.
- **Adresse interrogée** : `SEO_AUDIT_BASE_URL`, sinon `NEXORA_APP_INTERNAL_URL`, sinon `SITE_URL`. Les pages sont jugées sous leur adresse publique (celle du sitemap).
- **Problèmes** (`seo_issues`) : dédoublonnés par empreinte (volet, règle, page, élément). Un problème qu'un audit complet ne retrouve plus passe à « résolu » ; un problème résolu qui revient est rouvert ; un problème « ignoré » par une personne ne l'est jamais par un audit. Les tâches longues renouvellent leur bail (`keepJobAlive`).
- Unlighthouse n'est pas utilisé : Lighthouse CI suffit pour le périmètre (un site, quelques dizaines de pages) ; à ajouter si le site dépasse cent pages.

## 3. Indexation et adaptateurs à état honnête

Code : `worker/src/seo/indexing.ts`, `adapters.ts`, `handlers.ts` ; web : `web/src/server/site-agents/after-publish.ts` (appelé par `/api/revalidate`).

- **Après une publication** (la garde de Directus appelle `/api/revalidate`), une tâche `seo.index` est mise en file 15 s plus tard (une par fenêtre de 2 minutes). Elle lit `sitemap.xml`, compare à la dernière photographie envoyée (`sitemap_snapshots`) et soumet les URL nouvelles ou dont le `lastmod` a changé. Filet quotidien à 04 h.
- **Rien n'est envoyé sans** : clé présente (Coffre) ET dernière vérification réussie ET autorisation d'écriture donnée par une personne (`seo_adapters.write_enabled`, module « SEO ») ET `SITE_ENV=production`. Sinon la soumission est journalisée « ignorée » avec sa raison (`indexing_submissions`). La photographie n'avance que si un moteur a accepté : ce qui n'a pas pu partir reste dans le prochain diff.
- **État affiché** (même règle côté web et worker) : *non connecté* (aucune clé, ou vérification jamais réussie) ; *connecté en lecture* (clé + vérification réussie par un appel en lecture seule) ; *autorisé en écriture* (en plus, autorisation humaine). Références du Coffre : `seo.bing.api_key`, `seo.searchconsole.credentials` (JSON du compte de service), `seo.dataforseo.credentials` (`login:motdepasse`), `seo.postiz.api_key` (+ `POSTIZ_URL`). IndexNow n'a pas de secret : sa clé (32 hex) est publique, servie à `/<clé>.txt`.
- **Sans clé du fondateur, aucun appel externe** (testé : zéro requête). Vérifications : Bing (quota de soumission), Search Console (jeton JWT en lecture seule, liste des propriétés), DataForSEO (`user_data`), Postiz (liste des canaux), IndexNow (le site sert bien le fichier de clé). Search Console, DataForSEO et Postiz n'ont pas d'écriture câblée dans ce jalon (pas d'agent Diffusion ni de veille payante) : leur état « écriture » ne débloque rien tant que le code correspondant n'existe pas.
- Plafonds respectés : IndexNow 10 000 URL par requête, Bing 500 par lot ici (10 000 par jour et par domaine).
