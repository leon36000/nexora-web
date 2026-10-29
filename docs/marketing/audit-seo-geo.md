# Audit SEO technique et GEO — Nexora AI

Date : 29 octobre 2026. Branche `feat/seo-geo` (base : `main`, commit `b9e99b1`). Auteur : agent de marketing SEO/GEO.
Plan d'action associé : `plan-seo-geo.md`. Documentation du code : `docs/seo.md`.

Légende : **✓** conforme et prouvé ; **✗** écart ; **◐** partiel (le détail dit pourquoi). « Avant » = `main` ; « Après » = cette branche. Chaque ligne renvoie à sa preuve ; les écarts qui sortent de mon périmètre ou qui attendent le fondateur sont repris en section 5.

## 0. Méthode, et ce que cet audit ne dit pas

**Ce qui a été fait.**

1. Lecture du code de `web/src/lib/seo/`, `web/src/app/{robots,sitemap}.ts`, `llms.txt`, des dictionnaires, des modèles de page et des tests.
2. Un serveur de développement jetable (`next dev`, port 3591, `SITE_ENV=production`, `SITE_URL=http://localhost:3591`, Directus et PostgreSQL de développement) et le contrôle maison `BASE_URL=http://localhost:3591 bun web/scripts/check-seo.ts` : robots.txt, sitemap.xml, llms.txt, puis **100 pages** du plan du site (50 en fr-CA, 50 en en-CA, Nexora Apps comprise après la fusion de `main` du 29 octobre) : titres, descriptions, canonical, hreflang réciproques, `x-default`, noindex, un seul h1, JSON-LD lisible **et conforme au visible**, image Open Graph servie. Résultat sur cette branche : **0 erreur, 0 avertissement**.
3. Un parcours du maillage interne (100 pages, tous les liens internes, en-tête et pied compris), des en-têtes HTTP et des redirections (`curl`), le contrôle des contrastes (`bun run --cwd web check:contrast` : 29 rapports, tous « OK »).
4. Tests : `web/src/lib/seo/` (98 tests, dont `geo.test.ts`) ; suite complète `web` : 137 fichiers, 1 601 tests, `bun test cms/content` (524 tests), validation des données structurées contre un extrait du vocabulaire schema.org (`web/src/lib/seo/testing/`).

**Ce qui n'a PAS été mesuré, et qu'aucun test ne remplace.**

- Aucune mesure Lighthouse, aucune donnée terrain (CrUX), aucun LCP/CLS/INP réel : seulement ce que le code permet de vérifier (section 4, K).
- Aucune indexation réelle (Search Console, Bing Webmaster non connectés) ; aucun résultat enrichi vérifié dans le test de résultats enrichis de Google ; aucune citation par un moteur génératif (ChatGPT, Perplexity, Gemini, Claude, Copilot, AI Overviews). Les propositions du plan sont des hypothèses de travail.
- Le serveur testé est un serveur de **développement** : en-têtes de cache (`no-store` en développement), compression, TLS, domaine et CDN ne sont pas ceux de la production.
- Les données locales contiennent un modèle de démonstration (« GLM 5.3 (développement) », prix fictifs) et des plans VPS « [DEV] » : à retirer avant la mise en ligne (`docs/guide-operateur.md`). Le site de production n'a pas été audité.
- Les trois nouvelles pages (passerelle d'API, deux guides) sont dans le dépôt mais **pas chargées dans Directus** (le chargement est une opération du fondateur) : leurs données structurées sont validées par les tests, pas en marche.

**« Triple A ».** Le code peut garantir l'accessibilité technique (A1), l'exactitude des données et de l'entité (A2) et l'extractibilité par les moteurs génératifs (A3). Il ne peut pas produire les signaux **externes** (mentions, liens entrants, avis, profils publics) qui font la notoriété : ils figurent au plan, avec des tâches pour le fondateur.

## 1. Résumé

| Domaine | Avant | Après | Reste |
|---|---|---|---|
| Balises, canoniques, hreflang, sitemap | ✓ | ✓ | URL anglaises non localisées (5.1) |
| Robots d'IA | ◐ entraînement refusé | ✓ politique explicite, tout le public autorisé | revue trimestrielle |
| `llms.txt` | ◐ liste plate de liens | ✓ faits canoniques tracés + plan thématique | approbation des affirmations |
| `llms-full.txt` | ✗ | ✓ | aucun |
| JSON-LD | ◐ Organization sans logo ni profils | ✓ logo, région, WebPage datée, fil d'Ariane de section, entité unique | `sameAs`, courriel : fondateur |
| Images Open Graph | ✓ | ✓ | `og:type` article (5.2) |
| IndexNow | ◐ prêt, inactif | ◐ prêt, inactif | autorisation du fondateur |
| Maillage interne | ✓ aucune page orpheline | ✓ + 3 pages liées | pages d'application minces (5.4) |
| Vitesse | non mesurée | non mesurée | Lighthouse et CrUX en production |
| Accessibilité de base | ✓ | ✓ | axe-core en production |
| Contenu GEO (réponse d'abord, FAQ, définitions) | ◐ | ✓ 3 pages piliers | 9 autres piliers (plan) |

## 2. Politique des robots d'IA (décision documentée)

**Décision du fondateur, 29 octobre 2026 : par défaut, tout le public est autorisé, pour tous les robots, entraînement compris. Jamais `/compte`, `/en/compte`, `/api/` ni `/v1/`.**

Raisons : (1) le contenu public est du marketing destiné à être lu et cité ; (2) la visibilité dans les moteurs génératifs passe à la fois par les robots de recherche (récupération au moment de la question) et par la connaissance apprise des modèles ; (3) l'engagement « vos données n'entraînent jamais un modèle » (CL-07, CL-E03) concerne les données **confiées** par les clients, pas les pages publiques : les deux ne se contredisent pas, mais la page de confiance doit continuer à le dire clairement ; (4) un repli simple existe : `ROBOTS_AI_TRAINING=disallow` refuse **seulement** les robots d'entraînement.

Registre (`AI_BOTS` dans `robots-policy.ts`, chaque entrée avec opérateur, rôle, lecture de robots.txt selon l'opérateur et page de l'opérateur ; sources consultées les 26 et 27 octobre 2026 et le 29 octobre 2026 pour le registre communautaire `ai-robots-txt/ai.robots.txt`) :

| Rôle | Robots | Lit robots.txt (selon l'opérateur) |
|---|---|---|
| Recherche et réponses (10) | Googlebot, Bingbot, DuckDuckBot, Applebot, OAI-SearchBot, PerplexityBot, Claude-SearchBot, MistralAI-Index, Bravebot, Amazonbot | oui |
| Demande d'une personne (5) | ChatGPT-User (non confirmé), Perplexity-User (non), Claude-User, MistralAI-User, DuckAssistBot | variable : le groupe explicite exprime l'intention |
| Entraînement (9) | GPTBot, ClaudeBot, anthropic-ai, Google-Extended, CCBot, Applebot-Extended, Meta-ExternalAgent, MistralAI-Training, Bytespider (non) | oui, sauf Bytespider |

À savoir : `Google-Extended` et `Applebot-Extended` sont des **jetons** de contrôle, pas des robots distincts ; refuser `Google-Extended` n'empêche pas Googlebot d'indexer. Un groupe nommé remplace le groupe `*` : chaque groupe répète donc les quatre chemins privés (contrôle automatique `robots.private-open`). Un robot qui ignore robots.txt (Bytespider, Perplexity-User selon leurs opérateurs) ne se gère pas par ce fichier : seul un pare-feu le ferait ; ce n'est pas décidé ici.

Revue trimestrielle : relire le registre communautaire, ajouter les robots nouveaux, revérifier chaque page d'opérateur. Prochaine revue : 29 janvier 2027.

## 3. Liste de contrôle

### A. Balises de page

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| A1 | `title` présent, unique par langue, 15 à 65 caractères avec la marque | ✓ | ✓ | check-seo : 100/100 ; longueurs 18 à 60 ; titres uniques par langue (règle `@nexora/seo`) |
| A2 | `meta description` unique par langue, 70 à 160 caractères | ✓ | ✓ | 100/100 ; longueurs 98 à 160 |
| A3 | Un seul `h1`, des `h2` | ✓ | ✓ | 100/100 `h1=1` ; 100/100 pages avec au moins un `h2` (parcours du maillage) |
| A4 | Marque dans le titre de l'accueil | ✗ « Automatisation IA pour PME au Québec » | ✓ « Nexora AI : automatisation IA pour PME au Québec » (48) ; en : « Nexora AI: AI for small business in Quebec » (42) | `cms/content/pages/accueil.*.json` |
| A5 | `lang` de `<html>` | ✓ | ✓ | `fr-CA` / `en-CA` (probe HTML) |
| A6 | Pages privées hors index | ✓ | ✓ | `/compte/connexion` : `<meta name="robots" content="noindex, nofollow">` ; `/compte` aussi |
| A7 | Pages publiques sans directive restrictive | ✓ | ✓ | `robots: index, follow` ou aucune balise |

### B. Canoniques et langues

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| B1 | Canonical absolu, auto-référent | ✓ | ✓ | check-seo : 0 erreur |
| B2 | Barre finale normalisée | ✓ | ✓ | `curl -I /solutions/` → `308 Permanent Redirect` vers `/solutions` ; idem `/fr/solutions` |
| B3 | hreflang `fr-CA`, `en-CA`, `x-default` réciproques | ✓ | ✓ | check-seo : 0 erreur ; `x-default` → fr-CA |
| B4 | hreflang seulement quand la traduction existe | ✓ | ✓ | tests `sitemap` (seo.test.ts) |
| B5 | URL anglaises localisées | ◐ | ◐ | seule `/tarifs` → `/en/pricing` l'est ; `/en/modeles`, `/en/docs/api`, `/en/vps`, `/en/agents`, `/en/contact` gardent un segment français ou neutre (5.1) |

### C. Plan du site

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| C1 | `sitemap.xml` déclaré dans robots.txt | ✓ | ✓ | 100 URL ; ligne `Sitemap:` en production seulement |
| C2 | `lastmod` réel ou omis | ✓ | ✓ | pages = `date_updated` Directus ; omis pour `/tarifs`, `/contact`, `/docs/api`, `/agents` (aucune date connue) |
| C3 | `alternates` et `x-default` | ✓ | ✓ | 100/100 |
| C4 | `noindex` et traductions à canonical étranger exclus | ✓ | ✓ | tests |
| C5 | Slugs hostiles refusés | ✓ | ✓ | test « slugs hostiles saisis dans Directus » |

### D. robots.txt et robots d'IA

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| D1 | Politique explicite par robot | ◐ 15 groupes, entraînement refusé | ✓ 25 groupes (24 robots + `*`) | `curl /robots.txt` ; tests `robots` |
| D2 | Recherche et réponses autorisées | ✓ | ✓ | idem |
| D3 | Entraînement : décision documentée | ◐ refusé par défaut | ✓ autorisé par défaut (décision du 29/10/2026), repli `ROBOTS_AI_TRAINING=disallow` | section 2 ; `docs/seo.md` ; `docs/guide-operateur.md` |
| D4 | Jamais `/compte`, `/en/compte`, `/api/`, `/v1/` | ✓ | ✓ répétés dans **chaque** groupe | contrôle `robots.private-open` de check-seo |
| D5 | Préproduction : `Disallow: /`, aucun sitemap, `X-Robots-Tag` | ✓ | ✓ | `site-env.ts`, `proxy.ts`, tests |
| D6 | Panneau d'administration cohérent avec robots.txt | ✗ (affichait « interdits » par défaut) | ✓ | `server/seo-admin/handlers.ts` + test |

### E. llms.txt et llms-full.txt

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| E1 | `llms.txt` selon llmstxt.org (H1, citation, sections H2 de liens) | ◐ liste plate par langue | ✓ thèmes : Produits et API, Solutions, Services et déploiement, Souveraineté et données, Guides, Entreprise et aide, Optional | `curl /llms.txt` (19 Ko) ; tests |
| E2 | Faits canoniques en phrases courtes avec adresse | ✗ | ✓ 14 faits, chacun rattaché à ses affirmations et à sa page | `CANONICAL_FACTS` ; test de traçabilité contre `claims.json` |
| E3 | Généré depuis les données réelles | ✓ | ✓ | pages Directus, dictionnaires, catalogue, VPS |
| E4 | `llms-full.txt` | ✗ | ✓ Markdown propre ; `?lang=fr` / `?lang=en` | `curl /llms-full.txt` : 409 Ko pour les deux langues |
| E5 | Aucune adresse orpheline | — | ✓ un fait dont la page n'est pas publiée disparaît | test `resolveFacts` |
| E6 | Prix de développement jamais reproduits | — | ✓ | test `llms-full` |

Rappel : Google a indiqué ne pas utiliser ces fichiers (docs/recherche/01 §4.9). Ils servent aux outils qui les lisent et à toute personne qui veut une version propre de nos faits ; ils ne remplacent pas le contenu des pages.

### F. Données structurées (JSON-LD)

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| F1 | Organization : nom, adresse du site, `@id` | ✓ | ✓ | accueil (2 pages) |
| F2 | Organization : logo | ✗ | ✓ `/icon-512.png` (fichier présent, 512 × 512) | test « le logo annoncé existe » |
| F3 | Organization : `sameAs` | ✗ | ✗ **mécanisme prêt** (`SITE_SAME_AS`), aucun profil vérifié | aucune adresse inventée ; voir 5.5 |
| F4 | Organization : région | ✗ | ✓ `QC`, `CA` (CL-130) ; aucune rue, aucun téléphone (CL-A02) | `organizationProfile` |
| F5 | Organization : description, courriel, téléphone | ✗ | ✗ | description non affichée sur la page (règle de conformité au visible) ; coordonnées à fournir (CL-A02) |
| F6 | WebSite sans `SearchAction` | ✓ | ✓ | accueil |
| F7 | WebPage avec `dateModified` réel | ✗ | ✓ 50 pages du CMS, accueil comprise (WebPage 48, AboutPage 2) | check-seo : types par page |
| F8 | AboutPage pour « Entreprise » | ✗ | ✓ | `/entreprise`, `/en/company` |
| F9 | Service (services, solutions, déploiement, OPSYS-AI) | ◐ OPSYS-AI seul | ✓ 28 pages | check-seo |
| F10 | SoftwareApplication (WorkStudio, applications VPS, fiches Nexora Apps) | ✓ | ✓ ; éditeur = l'entreprise (`@id`) pour WorkStudio ; les fiches Nexora Apps n'en déclarent pas encore (5.2 bis) | 30 pages |
| F11 | Product + Offer (modèles) | ✓ | ✓ **aucune offre pour un prix de développement** | `/modeles/nexora/glm-5-3` : Product sans `offers` |
| F12 | FAQPage | ✓ | ✓ 66 pages | check-seo |
| F13 | BreadcrumbList | ✓ 2 niveaux | ✓ 3 niveaux pour les sous-pages (Accueil > Solutions > Factures) | tests `fil d'Ariane` |
| F14 | Article (guides) avec image et dates réelles | ◐ sans image | ✓ code et tests ; pages à charger | `geo.test.ts` |
| F15 | Une seule entité : même `@id`, même nom partout | ✗ (fournisseur anonyme) | ✓ Service, SoftwareApplication, Article, WebSite renvoient à `…/#organization` | tests de cohérence d'entité |
| F16 | Valide au regard du vocabulaire schema.org | non testé | ✓ propriétés et types de valeurs contrôlés | `testing/schemaorg.ts` (extrait du vocabulaire lu le 29/10/2026) |
| F17 | Conforme au visible (règle de Google) | ✓ | ✓ | check-seo : 0 erreur sur 100 pages |
| F18 | Test de résultats enrichis de Google | ✗ | ✗ non exécuté (outil externe) | à faire en recette |

Répartition mesurée sur les 100 pages : BreadcrumbList 98, FAQPage 66, WebPage 48, SoftwareApplication 30, Service 28, Organization 2, WebSite 2, AboutPage 2, Product 2. L'accueil porte Organization + WebSite + WebPage ; les pages à `Article` n'émettent pas de WebPage.

### G. Open Graph et Twitter

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| G1 | `og:title`, `og:description`, `og:url`, `og:site_name`, `og:locale`, `og:locale:alternate`, `og:type` | ✓ | ✓ | probe HTML |
| G2 | Image `og:image` 1200 × 630, servie en PNG, avec `og:image:alt` | ✓ | ✓ | 100/100 → `200 image/png` (33 à 55 Ko) |
| G3 | `twitter:card = summary_large_image`, titre, description, image | ✓ | ✓ | probe HTML |
| G4 | `twitter:site` | ✗ | ✗ | aucun compte connu |
| G5 | `og:type = article` et `article:published_time` pour les guides | ✗ | ✗ | `lib/seo.ts` (hors périmètre, 5.2) |

### H. Soumission aux moteurs

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| H1 | Clé IndexNow servie à `/<clé>.txt` | ✓ | ✓ | `next.config.ts` (réécriture), `indexnow-key.test.ts` |
| H2 | Soumission après publication | ◐ gardée | ◐ gardée | exige clé, vérification et **autorisation d'écriture** du fondateur ; sinon « ignorée » avec raison |
| H3 | Bing Webmaster, Search Console | ✗ | ✗ | à connecter par le fondateur (jetons dans le Coffre) |

### I. Maillage

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| I1 | Pages orphelines | ✓ 0/100 | ✓ 0/100 | parcours du maillage (en-tête et pied compris) |
| I2 | Liens dans le contenu de chaque page | ◐ | ◐ | 8 pages sans lien dans `<main>` : `/tarifs`, `/en/pricing`, `/contact`, `/en/contact`, `/modeles`, `/en/modeles`, `/vps`, `/en/vps` |
| I3 | Pages minces (moins de 300 mots) | ◐ | ◐ | les 6 mêmes pages d'application (148 à 248 mots), hors contact |
| I4 | Nouvelles pages liées | — | ✓ passerelle ← WorkStudio ; guide agents ← WorkStudio ; guide PME ← Méthode, Solutions | test S3 « lien entrant » |

### J. Contenu GEO

| # | Contrôle | Avant | Après | Preuve |
|---|---|---|---|---|
| J1 | Réponse d'abord (bloc « La réponse en bref ») | ◐ | ✓ sur les 3 nouvelles pages ; à étendre | `cms/content/pages/` |
| J2 | FAQ en question/réponse complète, balisée | ✓ 66 pages | ✓ | check-seo |
| J3 | Termes définis à leur premier usage (agent, jeton, passerelle, flux de travaux) | ✓ | ✓ | tests S3 « jargon défini » |
| J4 | Chaque affirmation tracée au registre, avec source | ✓ | ✓ 164 affirmations (+ 6) | `claims.json`, tests |
| J5 | Aucune promesse chiffrée, aucun client cité, aucune mention de la Loi 25 sur les nouvelles pages | ✓ | ✓ | tests S3 |
| J6 | Fraîcheur visible aux machines | ✗ | ✓ `dateModified` réel dans WebPage et Article | tests |

### K. Vitesse (ce que le code permet de vérifier)

| # | Contrôle | État | Preuve |
|---|---|---|---|
| K1 | Polices locales, préchargées, `display: optional` (évite le saut de mise en page et le LCP en deux temps) | ✓ | `web/src/app/fonts.ts` ; en-tête `Link: rel=preload` sur `/workstudio` |
| K2 | Aucun script tiers, aucun suivi, aucune bibliothèque de publicité | ✓ | recherche de `next/script`, `gtag`, `googletagmanager` : aucun résultat |
| K3 | Images du contenu via `next/image` ; aucune image bitmap dans le contenu actuel (le plus grand élément du premier écran est du texte) | ✓ | 0 `<img>` sur les 10 pages sondées |
| K4 | Rendu côté serveur : le texte est dans le HTML | ✓ | `extractPageSeo` lit le texte visible sans exécuter de JavaScript |
| K5 | JavaScript client limité | ◐ | 21 composants `"use client"` ; poids réel des paquets non mesuré (serveur de développement) |
| K6 | Cache et compression de production | ✗ non vérifié | en-têtes de développement (`Cache-Control: no-store`) |
| K7 | LCP, CLS, INP réels | ✗ **non mesurés** | Lighthouse (audit du worker, 03 h) et CrUX à lancer en production ; seuils : LCP 2 500 ms, INP 200 ms, CLS 0,1 (docs/recherche/01 §4.6) |

### L. Accessibilité de base

| # | Contrôle | État | Preuve |
|---|---|---|---|
| L1 | Langue déclarée, lien d'évitement, repère `main` | ✓ | `app/[lang]/layout.tsx` |
| L2 | Contrastes de la charte | ✓ | `bun run --cwd web check:contrast` : tous les rapports « OK » |
| L3 | Textes alternatifs | ✓ | 0 image sans `alt` sur les pages sondées |
| L4 | axe-core (WCAG 2.2 AA) sur le site en marche | ✗ non exécuté ici | volet « accessibilité » de l'audit nocturne du worker (`worker/src/seo/audit-a11y.ts`) |

## 4. Cohérence d'entité

| Élément | Où | Valeur | État |
|---|---|---|---|
| Nom | dictionnaire, Organization, WebSite, `og:site_name`, fournisseur des Service, éditeur des SoftwareApplication et des Article | « Nexora AI » | ✓ une seule source (`SITE_NAME`, dictionnaire) |
| Identifiant | `…/#organization`, `…/#website` | identique sur toutes les pages | ✓ |
| Description courte | trois textes différents aujourd'hui : (1) réglages publiés `seoDescription` (« Nexora AI, entreprise québécoise d'IA : systèmes installés chez vous ou hébergés au Québec… »), (2) dictionnaire `meta.home.description` (« Nexora AI conçoit des systèmes d'IA pour votre entreprise… »), (3) description SEO de l'accueil (« Nexora AI met la pointe de l'IA à la portée des PME… ») | ✗ | **à trancher par le fondateur** : une phrase canonique est proposée dans le plan (section 7) |
| Faits | `llms.txt`, `llms-full.txt`, pages | mêmes phrases, mêmes affirmations | ✓ (tests de traçabilité) |
| Profils publics | `sameAs` | aucun | ✗ en attente (5.5) |

## 5. Écarts restants

### 5.1 Hors de mon périmètre : à traiter par les propriétaires de ces fichiers

1. **URL anglaises** (`i18n/config.ts`, `LOCALIZED_ROUTES`) : ajouter `/modeles → /models`, `/agents`, `/vps` si utile ; garder les anciennes adresses en redirection 308. Gain : mot-clé anglais dans l'adresse (« models »). Faible risque si les redirections sont faites.
2. **`/agents`** (`lib/seo/app-routes.ts`) : la dernière fusion retire « Agents » des menus (« les agents appartiennent à WorkStudio »), mais la route reste dans le plan du site et dans `llms.txt`. Décider : indexable ou non.
3. **`/tarifs`** (`i18n/dictionaries/pricing-*.ts`) : la description SEO annonce un « essai gratuit » alors que le registre dit « pas d'essai gratuit en libre-service » (CL-61) et « aucun prix publié » (CL-12). À corriger ou à justifier au registre avant la mise en ligne.
4. **Pages d'application minces et sans liens dans le contenu** (`/modeles`, `/vps`, `/tarifs`) : ajouter un paragraphe « réponse d'abord », une FAQ et des liens vers la passerelle, les guides et WorkStudio.
5. **Données de démonstration** (`/modeles/<id>`, `/vps/…`) : le modèle « GLM 5.3 (développement) » (prix fictifs) et les plans « [DEV] » sont indexables en développement ; ne pas les publier en production (`docs/guide-operateur.md`).

### 5.2 Hors de mon périmètre : `lib/seo.ts`, `lib/metadata.ts`, pages `app/[lang]/…`

- `og:type = article`, `article:published_time` et `article:modified_time` pour les pages `guides/…` (aujourd'hui `website`).
- `/docs/api` : un `TechArticle` daté (nom, description, `dateModified`) à côté du fil d'Ariane.
- Un `ItemList` pour `/modeles` et `/vps` **seulement** quand des prix seront publiés (CL-12).

### 5.2 bis. Nexora Apps (fusionnée après le début de l'audit)

`/apps` et ses fiches passent le contrôle en marche (0 erreur, 100 URL au plan du site, `llms.txt` à jour automatiquement). Écarts : `SoftwareApplication` sans `publisher` (rattacher à l'Organization) ; affirmations « gratuit », « code ouvert prévu », « inclus par défaut » dans le dictionnaire et non au registre `claims.json` (gouvernance du contenu) ; pas de « réponse d'abord » ni de FAQ balisée.

### 5.3 Nécessite une décision ou une information du fondateur

1. Confirmer la politique des robots d'IA (section 2) et la revue trimestrielle.
2. Fournir les profils publics (`SITE_SAME_AS`) ; ne pas en inventer.
3. Fournir l'adresse, le courriel et le téléphone publics (CL-A02) pour compléter l'Organization (`address`, `email`, `contactPoint`).
4. Choisir **la** description courte de l'entreprise (section 4).
5. Approuver les affirmations de `claims.json` (146 « en revue », 18 brouillons à compléter), dont CL-S01 à CL-S06 ; confirmer CL-S02 (journaux de la couche de routage amont).
6. Charger les trois nouvelles pages dans Directus (`load-content.ts`) ; connecter Bing Webmaster et la Search Console ; autoriser l'écriture IndexNow.

### 5.4 Pistes de mesure à installer

Aucune analytique n'est en place. Le plan propose une mesure sans témoins et auto-hébergée (section 8 du plan) : à décider.

### 5.5 Écarts volontaires

- Pas de `description` dans l'Organization : la règle « le balisage doit figurer dans le contenu visible » l'interdit tant que la description n'est pas affichée.
- Pas d'offre (`Offer`) tant que le libre-service n'est pas ouvert (CL-12), pas de `SearchAction` (pas de recherche), pas de `AggregateRating` (aucun avis).

## 6. Reproduire cet audit

```
SITE_ENV=production SITE_URL=http://localhost:3591 node web/node_modules/next/dist/bin/next dev web -p 3591
BASE_URL=http://localhost:3591 bun web/scripts/check-seo.ts          # EXPECT_AI_TRAINING=disallow si le repli est posé
bun run --cwd web check:contrast
cd web && npx --no-install vitest run src/lib/seo
bun test cms/content
```

Une fois en production : Lighthouse mobile sur les pages clés, CrUX, Search Console (rapport « Performances » type Web, qui inclut les fonctions d'IA de Google), Bing Webmaster, et un échantillon de requêtes dans les moteurs génératifs (plan, section 9).
