# SEO technique, audits, agents et indexation (S8)

Conception : `docs/superpowers/specs/2026-10-26-nexora-site-design.md` §13, D9, D14 ; recherches `docs/recherche/01` §4.9–§7, `02` §6–§8. Cette page commence par le SEO technique natif (fork B) ; les sections audits, agents du site et indexation s'y ajoutent.

## 1. SEO technique natif

Preuve sur serveur en marche : `docs/captures/s8/seo-controle.md` (production 0 erreur, préproduction vérifiée). Commande : `BASE_URL=… bun web/scripts/check-seo.ts` (`EXPECT_ENV=staging` pour la préproduction).

### Environnement et indexation

`SITE_ENV=production` est **la seule** valeur qui rend le site indexable (`web/src/lib/seo/site-env.ts`). Toute autre valeur, ou l'absence de la variable, donne : `robots.txt` = `Disallow: /` pour tous, aucun sitemap annoncé, et `X-Robots-Tag: noindex, nofollow` sur toute page (`web/src/proxy.ts`). Défaut sûr : l'oublier en production se voit tout de suite ; l'oublier en préproduction ne livre jamais la préproduction aux moteurs. L'aperçu Draft Mode garde son propre `noindex, nofollow, noarchive`.

### `sitemap.xml` (`web/src/app/sitemap.ts`, logique pure `lib/seo/sitemap.ts`)

- Pages Directus **publiées** seulement (`getSeoPages`, filtre `status = published` côté serveur, revérifié par ligne), jamais `noindex` ; une traduction dont le canonical saisi pointe ailleurs n'est pas listée.
- Routes de l'application : `/contact`, `/modeles` et chaque fiche de modèle du catalogue public, `/docs/api`, `/vps` **seulement si la page existe** (manifeste `.next/server/app-paths-manifest.json`, sinon `src/app/[lang]/vps/page.tsx` ; le site se lance depuis `web/`).
- `alternates.languages` : seulement les langues dont la traduction existe ; `x-default` vers le français quand il existe (même règle que les balises de la page).
- `lastmod` réel ou omis, jamais « maintenant » : page = `date_updated` de Directus ; modèles et `/modeles` = date de publication de la version du catalogue ; `/contact` et `/docs/api` = omis (pas de date connue).
- **Essai réel** (`web/scripts/essai-lastmod.ts`, page jetable supprimée) : `date_updated` de la page **change bien** quand une promotion ne modifie que le texte d'un bloc M2A (04:31:35 -> 04:31:37). Aucune solution de contournement nécessaire.
- Rendu à la demande (`connection()`) à partir de lectures en cache revalidées par l'étiquette `slugs` : une publication apparaît à la requête suivante.

### `robots.txt` (`lib/seo/robots-policy.ts`)

Politique par type de robot, décision d'affaires à valider par le fondateur (revue trimestrielle) :

| Type | Robots | Règle |
|---|---|---|
| Recherche | Googlebot, Bingbot, DuckDuckBot, OAI-SearchBot, PerplexityBot, Claude-SearchBot | autorisés (sauf chemins privés) |
| Entraînement | GPTBot, ClaudeBot, anthropic-ai, Google-Extended, CCBot, Applebot-Extended, Meta-ExternalAgent, Bytespider | **refusés par défaut** ; `ROBOTS_AI_TRAINING=allow` les autorise |
| Action d'un utilisateur | ChatGPT-User, Perplexity-User, Claude-User | aucune règle : selon leurs opérateurs, robots.txt ne les contrôle pas |

Chemins privés : `/api/`, `/v1/`, `/compte`, `/en/compte`. `/og/` reste ouvert (les aperçus sociaux lisent l'image). Ligne `Sitemap:` en production seulement.

### Données structurées (`lib/seo/jsonld.ts`, schema-dts, `components/seo/json-ld.tsx`)

Générées **par code** depuis ce que la page affiche ; chaque constructeur refuse d'émettre une donnée vide.

| Type | Où | Source |
|---|---|---|
| Organization, WebSite | accueil | nom du site ; WebSite sans `SearchAction` (pas de recherche) |
| BreadcrumbList | toutes les pages hors accueil, y compris `/modeles/…` | chemin de la page |
| Service | pages du registre `lib/seo/page-schema.ts` (aujourd'hui `opsys-ai`) | nom = titre de la page s'il s'affiche, sinon titre du héros ; description = sous-titre du héros s'il s'affiche |
| SoftwareApplication | `workstudio` quand la page existe | `offers` **seulement** si un prix est affiché (aucun aujourd'hui) |
| Product | fiches `/modeles/<id>` | nom, description et SKU affichés ; une offre par prix affiché (Entrée, Sortie, Cache), CAD, par million de jetons ; **aucune offre pour un prix de développement** ni pour un prix nul |
| Article | slugs `blog/…` et `articles/…` | `datePublished` = création Directus, `dateModified` = `date_updated` (aucune date de publication distincte n'existe dans le schéma) |
| FAQPage | blocs FAQ qui l'autorisent | questions et réponses exactes (existant, conservé) |

Conformité au visible, vérifiée par `checkJsonLdConformity` (`@nexora/seo`) en test et sur le serveur en marche : noms, descriptions, questions et réponses doivent figurer dans le texte de la page ; tout prix annoncé doit être affiché ; une offre sans prix est une erreur. Exception documentée : `BreadcrumbList` (fil d'Ariane de structure, vérifié pour sa forme seulement).

### Images Open Graph (`web/src/app/og/[lang]/[[...slug]]/route.tsx`)

`/og/<fr|en>[/<chemin>]`, PNG 1200 × 630 (next/og, Satori), marque, titre de la page publiée et langue. Le texte vient **de la page**, jamais de l'adresse : page inconnue, non publiée ou chemin douteux = 404 (pas d'image-injection). Polices : instantanés WOFF locaux Geist 500 et Inter 400 (`src/fonts/og/`, Satori ne lit ni WOFF2 ni polices variables). Utilisée comme image par défaut de `buildCmsMetadata` et `buildPageMetadata` quand aucune `seo_image` n'est saisie ; `twitter:card` = `summary_large_image`. Fonctionne sur aarch64 avec Turbopack en `next dev` et `next build` (26 à 39 Ko par image).

### `llms.txt` (`web/src/app/llms.txt/route.ts`)

Titre, résumé (réglages publiés ou dictionnaire), puis une liste de liens par langue pour chaque page publiée non `noindex` et chaque route de l'application. Aucune promesse : Google a indiqué ne pas utiliser ce fichier (docs/recherche/01 §4.9).

### Clé IndexNow

32 caractères hexadécimaux, générée au premier besoin (`getOrCreateIndexNowKey(db)`, `web/src/lib/seo/indexnow-key.ts`) et stockée dans `seo_settings` (`indexnow_key`) ; publique par conception du protocole, donc hors Coffre. Servie à `/<clé>.txt` par une réécriture de `next.config.ts` (passe avant `[lang]` et le proxy) vers `/api/seo/indexnow-key/<clé>` qui ne répond que si la clé correspond (sinon 404). `bun web/scripts/indexnow-key.ts` la crée ou la relit. La génération pure (`generateIndexNowKey`, `isValidIndexNowKey`) est dans `@nexora/seo` pour le worker.

### `@nexora/seo` (paquet pur, sans entrée-sortie)

`extractPageSeo(html, url, { status, xRobotsTag })` → `PageSeo` ; `parseSitemapXml` ; `checkSite(pages, opts)` (titres/descriptions uniques **par langue** et de longueur correcte — 15–65 et 70–160 caractères, canonical, hreflang réciproques, `x-default`, noindex et sitemap, un seul h1, JSON-LD lisible et connu, conformité) ; `checkJsonLdConformity`. Le worker les consomme pour l'audit « structure » ; les règles (`rule`) sont des identifiants stables.

### Constats réels à traiter (hors de ce jalon)

- `/docs/api` : titre « API | Nexora » (12 caractères, sous le minimum de 15) : à allonger dans `gateway-*-CA.ts` (zone S5).
- `/modeles` : titre court aussi (15–16 caractères, limite).

### Diff Directus proposé (non appliqué)

`pages.schema_type` (liste : `service`, `software`, `article`, vide) pour remplacer le registre de slugs `lib/seo/page-schema.ts` ; `pages.published_at` (date) pour un `datePublished` exact des articles. Aucun des deux n'est nécessaire au fonctionnement actuel.
