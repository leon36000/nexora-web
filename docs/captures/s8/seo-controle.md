# Contrôle SEO sur serveur en marche (S8, 27/10/2026)

Commande : `BASE_URL=http://localhost:3531 bun web/scripts/check-seo.ts` (site lancé avec `SITE_URL=http://localhost:3531`).
Données réelles du Directus et de la base de développement : accueil et OPSYS-AI (fr/en), /contact, /modeles et la fiche
`nexora/glm-5-3`, /docs/api. Les rapports ci-dessous viennent du serveur de développement ; le même contrôle sur le build de production (`next build` puis `next start`) donne aussi 0 erreur et les mêmes 2 avertissements.

## Production (`SITE_ENV=production`)

```
# Contrôle SEO — http://localhost:3531 (environnement attendu : production)

## robots.txt (200)
16 groupe(s) ; lignes Sitemap : Sitemap: http://localhost:3531/sitemap.xml

## sitemap.xml (200) — 12 URL
- http://localhost:3531/  lastmod=2026-10-27T03:34:37.182Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en  lastmod=2026-10-27T03:34:37.182Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/opsys-ai  lastmod=2026-10-27T03:34:38.032Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/opsys-ai  lastmod=2026-10-27T03:34:38.032Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/contact  lastmod=(omis)  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/contact  lastmod=(omis)  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/modeles  lastmod=2026-10-27T04:02:37.786Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/modeles  lastmod=2026-10-27T04:02:37.786Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/modeles/nexora/glm-5-3  lastmod=2026-10-27T04:02:37.786Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/modeles/nexora/glm-5-3  lastmod=2026-10-27T04:02:37.786Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/docs/api  lastmod=(omis)  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/docs/api  lastmod=(omis)  alternates=fr-CA,en-CA,x-default

## llms.txt (200)
10 lien(s), tous présents au sitemap : true

## Pages
- http://localhost:3531/  [200] titre 36 car., description 150 car., h1=1, JSON-LD: Organization+WebSite+FAQPage
    og:image http://localhost:3531/og/fr -> 200 image/png 26899 o
- http://localhost:3531/en  [200] titre 44 car., description 150 car., h1=1, JSON-LD: Organization+WebSite+FAQPage
    og:image http://localhost:3531/og/en -> 200 image/png 25048 o
- http://localhost:3531/opsys-ai  [200] titre 54 car., description 152 car., h1=1, JSON-LD: BreadcrumbList+Service+FAQPage
    og:image http://localhost:3531/og/fr/opsys-ai -> 200 image/png 29049 o
- http://localhost:3531/en/opsys-ai  [200] titre 57 car., description 160 car., h1=1, JSON-LD: BreadcrumbList+Service+FAQPage
    og:image http://localhost:3531/og/en/opsys-ai -> 200 image/png 29329 o
- http://localhost:3531/contact  [200] titre 32 car., description 150 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/fr/contact -> 200 image/png 33688 o
- http://localhost:3531/en/contact  [200] titre 26 car., description 140 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/en/contact -> 200 image/png 33575 o
- http://localhost:3531/modeles  [200] titre 16 car., description 140 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/fr/modeles -> 200 image/png 28474 o
- http://localhost:3531/en/modeles  [200] titre 15 car., description 144 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/en/modeles -> 200 image/png 27642 o
- http://localhost:3531/modeles/nexora/glm-5-3  [200] titre 32 car., description 132 car., h1=1, JSON-LD: Product+BreadcrumbList
    og:image http://localhost:3531/og/fr/modeles/nexora/glm-5-3 -> 200 image/png 38690 o
- http://localhost:3531/en/modeles/nexora/glm-5-3  [200] titre 32 car., description 130 car., h1=1, JSON-LD: Product+BreadcrumbList
    og:image http://localhost:3531/og/en/modeles/nexora/glm-5-3 -> 200 image/png 38985 o
- http://localhost:3531/docs/api  [200] titre 12 car., description 118 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/fr/docs/api -> 200 image/png 23407 o
- http://localhost:3531/en/docs/api  [200] titre 12 car., description 105 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/en/docs/api -> 200 image/png 23731 o

## Constats : 0 erreur(s), 2 avertissement(s), 0 information(s)
- [warning] title.short — http://localhost:3531/docs/api — Titre trop court (12 caractères, minimum 15).
- [warning] title.short — http://localhost:3531/en/docs/api — Titre trop court (12 caractères, minimum 15).

RÉSULTAT : aucune erreur.
```

## Préproduction (`SITE_ENV=staging`, `EXPECT_ENV=staging`)

`robots.txt` = `User-Agent: *` / `Disallow: /`, aucune ligne Sitemap ; `X-Robots-Tag: noindex, nofollow` sur chaque page.

```
# Contrôle SEO — http://localhost:3531 (environnement attendu : staging)

## robots.txt (200)
1 groupe(s) ; lignes Sitemap : aucune

## sitemap.xml (200) — 12 URL
- http://localhost:3531/  lastmod=2026-10-27T03:34:37.182Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en  lastmod=2026-10-27T03:34:37.182Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/opsys-ai  lastmod=2026-10-27T03:34:38.032Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/opsys-ai  lastmod=2026-10-27T03:34:38.032Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/contact  lastmod=(omis)  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/contact  lastmod=(omis)  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/modeles  lastmod=2026-10-27T04:02:37.786Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/modeles  lastmod=2026-10-27T04:02:37.786Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/modeles/nexora/glm-5-3  lastmod=2026-10-27T04:02:37.786Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/modeles/nexora/glm-5-3  lastmod=2026-10-27T04:02:37.786Z  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/docs/api  lastmod=(omis)  alternates=fr-CA,en-CA,x-default
- http://localhost:3531/en/docs/api  lastmod=(omis)  alternates=fr-CA,en-CA,x-default

## llms.txt (200)
10 lien(s), tous présents au sitemap : true

## Pages
- http://localhost:3531/  [200] titre 36 car., description 150 car., h1=1, JSON-LD: Organization+WebSite+FAQPage
    og:image http://localhost:3531/og/fr -> 200 image/png 26899 o
- http://localhost:3531/en  [200] titre 44 car., description 150 car., h1=1, JSON-LD: Organization+WebSite+FAQPage
    og:image http://localhost:3531/og/en -> 200 image/png 25048 o
- http://localhost:3531/opsys-ai  [200] titre 54 car., description 152 car., h1=1, JSON-LD: BreadcrumbList+Service+FAQPage
    og:image http://localhost:3531/og/fr/opsys-ai -> 200 image/png 29049 o
- http://localhost:3531/en/opsys-ai  [200] titre 57 car., description 160 car., h1=1, JSON-LD: BreadcrumbList+Service+FAQPage
    og:image http://localhost:3531/og/en/opsys-ai -> 200 image/png 29329 o
- http://localhost:3531/contact  [200] titre 32 car., description 150 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/fr/contact -> 200 image/png 33688 o
- http://localhost:3531/en/contact  [200] titre 26 car., description 140 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/en/contact -> 200 image/png 33575 o
- http://localhost:3531/modeles  [200] titre 16 car., description 140 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/fr/modeles -> 200 image/png 28474 o
- http://localhost:3531/en/modeles  [200] titre 15 car., description 144 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/en/modeles -> 200 image/png 27642 o
- http://localhost:3531/modeles/nexora/glm-5-3  [200] titre 32 car., description 132 car., h1=1, JSON-LD: Product+BreadcrumbList
    og:image http://localhost:3531/og/fr/modeles/nexora/glm-5-3 -> 200 image/png 38690 o
- http://localhost:3531/en/modeles/nexora/glm-5-3  [200] titre 32 car., description 130 car., h1=1, JSON-LD: Product+BreadcrumbList
    og:image http://localhost:3531/og/en/modeles/nexora/glm-5-3 -> 200 image/png 38985 o
- http://localhost:3531/docs/api  [200] titre 12 car., description 118 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/fr/docs/api -> 200 image/png 23407 o
- http://localhost:3531/en/docs/api  [200] titre 12 car., description 105 car., h1=1, JSON-LD: BreadcrumbList
    og:image http://localhost:3531/og/en/docs/api -> 200 image/png 23731 o

## Constats : 0 erreur(s), 0 avertissement(s), 0 information(s)

RÉSULTAT : aucune erreur.
```

## Clé IndexNow

`/<clé de 32 hex>.txt` répond 200 `text/plain` avec la clé ; toute autre clé ou tout autre `*.txt` répond 404.
