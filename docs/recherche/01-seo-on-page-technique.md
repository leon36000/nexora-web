# Recherche SEO on-page et technique pour le site Nexora

- **Projet** : nouveau site Nexora (Next.js 16, App Router, React 19), Directus comme CMS et panneau d'administration, déploiement Docker.
- **Périmètre** : volet 1, SEO on-page et technique, automatisable par des agents IA.
- **Vérifications** : 26 et 27 octobre 2026 (dates absolues dans tout le document).
- **Contraintes respectées** : aucune installation, aucun clone de dépôt, aucune lecture de secret, aucun fichier modifié hors de ce rapport.

---

## 1. Synthèse

- **Le socle est natif.** Next.js 16.4.3 (npm, publié le 23 octobre 2026, licence MIT) couvre les métadonnées, les balises canonical et hreflang, le sitemap multilingue, le robots, les images Open Graph dynamiques, les polices et les images optimisées. En App Router, `next-seo` et `next-sitemap` deviennent redondants : je les écarte.
- **Données structurées.** La documentation officielle Next.js (guide JSON-LD) recommande `schema-dts` (Apache-2.0). `jsonld.js` (BSD-3-Clause) sert à valider le JSON-LD en intégration continue.
- **Multilingue fr/en.** Le guide i18n de Next.js ne parle pas de hreflang. Il faut le câbler soi-même, dans les métadonnées et dans le sitemap. Google accepte hreflang dans le sitemap XML. Pour le Québec, les codes `fr-CA` et `en-CA` avec `x-default` sont pertinents.
- **Audit continu.** Lighthouse CI (Apache-2.0) et Unlighthouse (MIT) pour l'ensemble du site, sitespeed.io (MIT) pour le suivi dans le temps, web-vitals (Apache-2.0) pour la mesure terrain, lychee (Apache-2.0) pour les liens cassés. Seuils Google au 75e percentile : LCP 2,5 s, INP 200 ms, CLS 0,1.
- **Crawl SEO auto-hébergé.** SEOnaut (MIT, Go) et LibreCrawl (MIT, Python) sont les options permissives les plus matures trouvées. Aucune n'est un équivalent complet de Screaming Frog.
- **Français.** Le moteur d'analyse de Yoast (`yoastseo`) gère en français la lisibilité (Flesch), la voix passive, les débuts de phrases, la longueur des phrases et les mots de liaison. Mais il est sous GPL-3.0 : à isoler dans un service séparé, ou à traiter comme une décision juridique. textstat (MIT) fournit la variante française de Flesch. LanguageTool (LGPL-2.1) couvre grammaire et style, à exécuter dans un conteneur séparé.
- **GEO et AEO.** Google indique depuis le 10 décembre 2025 que `llms.txt` n'est ni utilisé ni nécessaire pour ses fonctions IA. Le levier réel : contenu citable, données structurées conformes au contenu visible, et politique robots par bot IA. Les opérateurs distinguent les robots d'entraînement, de recherche et d'action utilisateur, et ne les traitent pas de la même façon dans robots.txt.
- **Indexation.** IndexNow accepte jusqu'à 10 000 URL par requête. Bing accepte jusqu'à 10 000 URL par domaine et par jour via son API. L'API Search Console permet 2 000 inspections d'URL par propriété et par jour. L'API Indexing de Google est réservée à JobPosting et BroadcastEvent : à écarter pour le contenu du site.
- **Directus.** La licence MSCL-1.0-GPL autorise l'usage interne et les services professionnels, y compris l'hébergement pour un client. Elle exclut un usage concurrent facturé. Un avis juridique est nécessaire avant toute offre commerciale fondée sur Directus.
- **Maillage interne.** Aucun outil open source mature trouvé. À construire : embeddings, règles, validation humaine.

---

## 2. Méthode, niveau de vérification et limites

**Sources consultées**
- Documentation officielle : nextjs.org (metadata, sitemap, robots, JSON-LD, i18n, images, polices, self-hosting, ISR, ImageResponse), developers.google.com (IA et recherche, hreflang, limites Search Console, Indexing API, billet de juin 2025 sur les résultats simplifiés), indexnow.org, developers.openai.com, docs.perplexity.ai, support.claude.com, web.dev, developer.chrome.com (CrUX), directus.com (self-hosting).
- Registres : npm (next, schema-dts, next-sitemap, next-seo, unlighthouse, fumadocs-core, yoastseo, jsonld, @vijayhardaha/next-indexnow, mcp-server-gsc), PyPI (stanza).
- Dépôts GitHub : métadonnées via l'API REST anonyme et via la capacité Alexandria `github-com/repositories/repo`. Licences lues dans le fichier LICENSE quand GitHub ne détecte pas de licence SPDX.

**Lecture des métriques GitHub**
- Étoiles : relevé le 26 ou 27 octobre 2026.
- « Dernier push » : champ `pushed_at` de l'API. C'est une approximation de la date du dernier commit sur la branche par défaut. La date du dernier commit exact n'a pas été extraite dépôt par dépôt.
- Quota REST anonyme (60 requêtes par heure) épuisé en cours de recherche. Les dernières métriques proviennent d'Alexandria. Aucun jeton d'accès n'a été lu ni affiché.

**Limites connues**
- Trois pages officielles ont renvoyé 404 au moment de la vérification : la page « quota policy » de l'API Search Console (remplacée par la page « limites »), la page Microsoft Learn sur l'URL submission API (remplacée par l'aide Bing Webmaster) et la page API de CrUX (remplacée par developer.chrome.com/docs/crux/api). Les informations correspondantes viennent de pages de remplacement ; les points à revalider sont signalés.
- La limite de lignes par requête de l'API Search Analytics n'a pas pu être confirmée sur la page officielle. Une extraction a donné 600, valeur incohérente avec les 25 000 lignes citées par plusieurs serveurs MCP tiers. Ce point est à vérifier avant tout développement.
- Certains chiffres proviennent d'une extraction automatisée de pages. Les chiffres structurants ont été recoupés avec la page source ou une deuxième source.

**Légende des verdicts**
- **Adopter** : utilisable en l'état, licence compatible, projet actif.
- **À évaluer** : intéressant, mais maturité, licence ou couverture à confirmer par un prototype.
- **Écarter** : redondant avec le natif, inactif, incompatible ou non adapté à Next.js + Directus.

**Légende des licences**
- Permissive : MIT, Apache-2.0, BSD.
- Faible copyleft : LGPL, MPL (obligations limitées aux fichiers modifiés ou à la bibliothèque elle-même).
- Copyleft fort : GPL, AGPL (obligations de contamination si le code est lié à un produit distribué).
- Source disponible : MSCL, licence restrictive qui n'est pas open source au sens de l'OSI.
- Non détectée : GitHub ne reconnaît pas de licence SPDX.

---

## 3. Socle natif Next.js (vérifié)

Next.js 16.4.3 a été publié sur npm le 23 octobre 2026 (licence MIT). Les fonctions ci-dessous sont documentées officiellement.

| Besoin SEO | Ce que la documentation confirme | Conséquence pour Nexora |
|---|---|---|
| Métadonnées | `generateMetadata` gère `alternates.canonical`, `alternates.languages` (hreflang), `openGraph`, `twitter`, `robots`, `icons`, `verification` et `metadataBase`. Les métadonnées sont dédupliquées et peuvent être diffusées en flux après l'interface initiale. | Une seule source de vérité par page, générée depuis Directus. |
| Sitemap | `app/sitemap.ts` accepte `alternates.languages` sur chaque entrée (xhtml:link). Limite de 50 000 URL par sitemap. `generateSitemaps` découpe en `/sitemap/[id].xml`. Fonction disponible depuis la version 14.2.0 selon la doc. | Sitemap fr-CA / en-CA généré depuis Directus, sans bibliothèque tierce. |
| Robots | `app/robots.ts` accepte `rules` (userAgent, allow, disallow, crawlDelay), `sitemap` et `host`. Génération possible à la compilation. | Politique par bot IA codée dans le dépôt, versionnée. |
| JSON-LD | Le guide officiel recommande `schema-dts` pour les types. Rendu par `<script type="application/ld+json">` avec `dangerouslySetInnerHTML`, en remplaçant `<` par `<`. Exemples : Product, Article, BlogPosting, Organization. | Échappement obligatoire du JSON-LD (protection XSS) : à imposer par un composant unique. |
| i18n App Router | Segment dynamique `[lang]`, détection et redirection de langue dans `proxy.ts` (fichier renommé depuis `middleware.ts` dans Next.js 16). `generateStaticParams` recommandé pour les locales. Le guide ne mentionne pas hreflang. | hreflang à implémenter dans les métadonnées et le sitemap, pas dans le routage. |
| Open Graph dynamique | `ImageResponse` (`next/og`) génère des PNG à partir de JSX via Satori. Taille par défaut 1200 x 630. Polices ttf, otf ou woff. Runtimes edge et Node.js. | Images OG générées par page, sans service externe. |
| Images | `next/image` : `sharp` requis pour l'optimisation auto-hébergée. Formats par défaut AVIF puis WebP. `minimumCacheTTL` par défaut de 14 400 s (4 h). `remotePatterns` obligatoire pour les images externes. | Installer `sharp` dans l'image Docker. Déclarer les domaines d'images. |
| Polices | `next/font` télécharge et auto-héberge Google Fonts au moment de la compilation : aucune requête vers Google côté navigateur. `display: swap` par défaut, `preload` activé, polices locales prises en charge. Recommandation : fallbacks ajustés pour limiter le CLS. | Pas de requête tierce, bon score de performance. |
| ISR et revalidation | Doc ISR actuelle : `revalidateTag('posts', 'max')` (signature à deux arguments), `revalidatePath`, `unstable_cache`. | Directus appelle un endpoint de revalidation ciblé par tag. |
| Self-hosting | Option `output: 'standalone'` pour une image Docker portable. Sharp recommandé. Cache multi-instances : un cache handler partagé (par exemple Redis) est nécessaire pour éviter des données périmées. | Image Docker standalone, Redis si plusieurs réplicas. |

**Conclusion pour Nexora** : `generateMetadata`, `app/sitemap.ts`, `app/robots.ts`, `opengraph-image.tsx`, `next/font` et `next/image` couvrent l'essentiel du SEO technique. Les bibliothèques tierces ne doivent intervenir que pour un besoin précis (validation JSON-LD, audit, IndexNow, GEO).

---

## 4. Analyse par domaine

### 4.1 Métadonnées, sitemaps, robots, hreflang et i18n

- **Natif Next.js** : voir section 3. Adopter.
- **next-seo** (MIT, 8 534 étoiles, dernier push le 29 juillet 2026, npm 7.3.0 du même jour) : API de composants pour le Pages Router et les anciens projets. En App Router, elle double la Metadata API. Son successeur maintenu est la Metadata API native, associée à un composant JSON-LD maison typé par schema-dts. **Écarter.**
- **next-sitemap** (MIT, 3 748 étoiles, dernier push le 13 mai 2026) : la dernière version publiée sur npm date du 6 septembre 2023 (4.2.3). Le dépôt reste actif, mais la dépendance publiée est ancienne. Il gère les `alternateRefs` (hreflang), comme le natif. **Écarter**, sauf besoin de plusieurs sources de sitemap très volumineuses (plan B).
- **next-intl** (MIT, 4 385 étoiles, dernier push le 2 octobre 2026) : traduction des messages d'interface, formatage des dates et des nombres, routage localisé. **À évaluer** : utile si l'interface est traduite en profondeur ; inutile si seul le contenu l'est (il vient de Directus).
- **next-i18next** (MIT, 6 167 étoiles, dernier push le 24 octobre 2026) : bibliothèque centrée sur le Pages Router. **Écarter** pour un projet App Router (à confirmer par prototype).
- **Multilingue Québec** : Google accepte les codes de langue-région (exemple : `fr-CA`, `en-US`) et recommande `x-default`. Chaque version doit se référencer elle-même et toutes les autres. Recommandation : `fr-CA` (contenu québécois) et `en-CA` ; `x-default` pointe vers la page de sélection ou vers `fr-CA`. À tester : la clé `x-default` dans `alternates.languages` doit être rendue correctement.
- **Testeurs hreflang** : `searchsolved/search-solved-public-seo` (licence « Other », non standard, 418 étoiles, dernier push le 21 septembre 2026) contient un Hreflang Checker en Streamlit. L'outil hreflang.org de Distilled est présenté comme open source, mais son dépôt n'a pas été identifié. **Aucun vérificateur hreflang sous licence permissive identifié** : un contrôle maison en CI est recommandé (réciprocité, `x-default`, codes valides, URL absolues).

### 4.2 Données structurées JSON-LD

- **schema-dts** (Apache-2.0, 1 252 étoiles, npm 2.1.0 publié le 2 octobre 2026) : types TypeScript pour le vocabulaire schema.org. Recommandé par la doc Next.js. **Adopter.**
- **jsonld.js** (BSD-3-Clause, 1 817 étoiles, dernier push le 4 mars 2026, npm 9.0.0 du 21 novembre 2025) : traitement JSON-LD (expansion, compactage, validation de la syntaxe). **À évaluer** pour la validation en CI.
- **Google Rich Results Test** : outil web de Google, non open source. À utiliser manuellement en recette.
- **Règle de Google** : les données structurées doivent correspondre au contenu visible de la page (billet IA de Google, 10 décembre 2025).
- **Évolution des rich results** : le billet de Google du 12 juin 2025 indique la simplification ou l'arrêt de Book actions, Course info, Claim review, Estimated salary, Learning video, Special announcement et Vehicle listing. Le billet ne cite ni FAQ ni HowTo. La situation actuelle du FAQPage n'a pas été revérifiée : à contrôler avant de compter sur ce type de résultat enrichi. Son intérêt pour l'AEO reste à évaluer.
- **Types proposés pour Nexora** (à valider par le contenu réel) : Organization (adresse au Québec, logo, identifiants sociaux), SoftwareApplication (Nexora WorkStudio), Service (installation, configuration de systèmes d'IA), Product et Offer (VPS et forfaits, si prix et disponibilité affichés), Article ou BlogPosting (ressources), BreadcrumbList partout.

### 4.3 Open Graph dynamique, images et polices

- **next/og** (natif) : `ImageResponse`, rendu Satori. **Adopter.**
- **vercel/satori** (MPL-2.0, 14 133 étoiles, dernier push le 23 octobre 2026) : moteur de conversion HTML/CSS vers SVG utilisé par next/og. Dépendance indirecte. **Adopter** (via Next.js). La licence MPL-2.0 impose de publier les modifications de ses propres fichiers si on les modifie.
- **sharp** (Apache-2.0, 32 797 étoiles, dernier push le 23 octobre 2026) : requis par `next/image` en auto-hébergement. **Adopter.**
- **fontsource** (MIT, 6 243 étoiles, dernier push le 14 octobre 2026) : polices open source empaquetées en npm, utile pour des polices hors Google Fonts. **À évaluer.**
- **subfont** (MIT, 1 636 étoiles, dernier push le 20 septembre 2026) : sous-ensembles de polices pour des pages statiques. Redondant avec `next/font` dans Next.js. **Écarter** pour ce projet.

### 4.4 Rendu, ISR et intégration Directus

- **Schéma recommandé** : Directus (Flow avec déclencheur webhook à la publication) appelle un endpoint Next.js (`/api/revalidate`) protégé par un secret partagé stocké dans les variables d'environnement ; l'endpoint appelle `revalidateTag` pour les tags concernés (par type de contenu et par langue).
- **Référence historique** : un article d'Echobind (15 décembre 2022) décrit ce schéma avec Directus Flows, mais avec `res.revalidate` (Pages Router). Il faut l'adapter à `revalidateTag`.
- **Directus** (38 640 étoiles, dernier push le 26 octobre 2026, npm directus 12.5.1 publié le 23 octobre 2026) : licence **MSCL-1.0-GPL** (Monospace Sustainable Core License 1.0), qui n'est pas une licence open source au sens de l'OSI. Points vérifiés dans le fichier LICENSE :
  - Usages permis : usage interne et accès, éducation non commerciale, recherche non commerciale, services professionnels fournis à un licencié, y compris le déploiement ou l'hébergement du logiciel pour ce licencié.
  - Usage concurrent exclu : mettre le logiciel à disposition d'un tiers, seul ou avec des produits ou services, en concurrence avec les offres commerciales du titulaire qui facturent l'usage.
  - Contournement de la clé de licence interdit.
  - Passage à GPL-3.0 après quatre ans, selon la clause de changement de licence du fichier.
  - Page officielle de self-hosting : le noyau gratuit ne nécessite pas de licence. Les limites supérieures et fonctionnalités avancées nécessitent une licence payante. Un programme « Open Innovation Grant » est mentionné pour les entités qualifiées.
  - **Conséquence pour Nexora** : Directus pour son propre site est un usage interne. L'hébergement de Directus pour des clients entre dans les services professionnels autorisés. Une offre SaaS qui revendrait Directus comme produit concurrent ne l'est pas. **Verdict : adopter sous réserve d'avis juridique**, surtout si Nexora vend une plateforme de gestion de contenu.

### 4.5 Audit technique et crawl

| Projet | Licence | Étoiles | Dernier push | Rôle | Verdict |
|---|---|---|---|---|---|
| GoogleChrome/lighthouse | Apache-2.0 | 30 953 | 25 oct. 2026 | Moteur d'audit (performance, accessibilité, bonnes pratiques, SEO) | Adopter |
| GoogleChrome/lighthouse-ci | Apache-2.0 | 7 117 | 23 oct. 2026 | Lighthouse en intégration continue, historique et non-régression | Adopter |
| treosh/lighthouse-ci-action | MIT | 1 292 | 12 mars 2026 | Action GitHub autour de LHCI | À évaluer (activité plus faible ; LHCI en CLI suffit) |
| harlan-zw/unlighthouse | MIT | 4 916 | 23 oct. 2026 (npm @unlighthouse/core 0.19.1, 3 oct. 2026) | Lighthouse sur tout le site (crawl puis audit par page) | Adopter |
| sitespeedio/sitespeed.io | MIT | 5 046 | 26 oct. 2026 | Mesure de performance, suivi dans le temps, image Docker | Adopter |
| StJudeWasHere/seonaut | MIT | 839 | 8 oct. 2026 | Audit SEO auto-hébergé (crawl, erreurs, méta, liens), Go | À évaluer (candidat principal pour un audit planifié) |
| PhialsBasement/LibreCrawl | MIT | 1 077 | 29 sept. 2026 | Crawler SEO de bureau (Flask), alternative à Screaming Frog | À évaluer (usage manuel plutôt qu'automatisé) |
| puneetindersingh/open-seo-crawler | MIT | 72 | 23 oct. 2026 | Crawler auto-hébergé ; vérifie aussi l'accès des bots IA | À évaluer (projet jeune) |
| apify/crawlee | Apache-2.0 | 26 270 | 27 oct. 2026 | Bibliothèque de crawl en TypeScript (HTTP et navigateur) | Adopter (briques pour contrôles sur mesure) |
| microsoft/playwright | Apache-2.0 | 98 591 | 27 oct. 2026 | Navigateur headless : rendu réel, tests E2E, contrôles SEO JavaScript | Adopter |
| lycheeverse/lychee | Apache-2.0 | 4 051 | 26 oct. 2026 | Vérificateur de liens rapide (Rust), liens dans HTML et Markdown | Adopter (CI) |
| JustinBeckwith/linkinator | MIT | 1 277 | 23 oct. 2026 | Vérificateur de liens en Node.js | À évaluer (alternative à lychee si pile Node uniquement) |
| wjdp/htmltest | MIT | 378 | 20 janv. 2025 | Tests de HTML généré | Écarter (activité faible) |
| dequelabs/axe-core | MPL-2.0 | 7 711 | 26 oct. 2026 | Moteur d'accessibilité pour tests automatisés | Adopter (accessibilité en CI, facteur SEO indirect) |
| pa11y/pa11y | LGPL-3.0 | 4 586 | 26 oct. 2026 | Accessibilité en CLI | À évaluer (axe-core suffit en général) |

**Lecture** : Lighthouse CI couvre les contrôles sur les pages d'une pull request. Unlighthouse couvre le site entier. SEOnaut ou LibreCrawl couvrent le crawl SEO (titres, méta, redirections, pages orphelines). lychee vérifie les liens. Playwright valide le rendu réel des pages à rendu côté client.

### 4.6 Core Web Vitals en continu

- **Seuils officiels** (web.dev, consulté le 26 octobre 2026) au 75e percentile : LCP 2 500 ms, INP 200 ms, CLS 0,1. INP a remplacé FID comme Core Web Vital en mars 2024.
- **web-vitals** (Apache-2.0, 8 661 étoiles, dernier push le 16 octobre 2026) : mesure terrain légère (LCP, INP, CLS, FCP, TTFB) à envoyer vers un endpoint interne. **Adopter.**
- **Boomerang** (akamai/boomerang, fork de bluesmoon/boomerang, licence BSD selon le fichier LICENSE.txt, 1 925 étoiles, dernier push le 10 juillet 2026) : bibliothèque RUM d'ancienne génération. **Écarter** au profit de web-vitals.
- **sitespeed.io** : mesure synthétique planifiée et historique des métriques. **Adopter.**
- **CrUX API** (données terrain Chrome, par URL ou par origine) : endpoint `records:queryRecord`, POST, clé API requise (vérifié sur developer.chrome.com). La fenêtre glissante de 28 jours et l'absence de quota gratuit précisé sont à revérifier. **Adopter** pour un suivi mensuel des pages importantes.
- **PageSpeed Insights API** : combine Lighthouse et données terrain. Non revérifié ici ; à utiliser en complément du CrUX.

### 4.7 Analyse de contenu on-page (lisibilité, style, grammaire)

**Yoast et Rank Math : analyse et licence**

- **Yoast (paquet `yoastseo`)** : moteur d'analyse JavaScript qui alimente l'extension WordPress. Le README du monorepo `Yoast/wordpress-seo` indique la prise en charge du français pour : mots de liaison, Flesch reading ease, voix passive, débuts de phrases, longueur des phrases (limite de 20 mots vérifiée pour cette langue). Le français est aussi listé pour les mots-outils (liens internes, insights, analyse des mots-clés). Version npm 3.6.0 (13 février 2026), licence GPL-3.0. Le monorepo `Yoast/wordpress-seo` (2 008 étoiles, dernier push le 26 octobre 2026) n'a pas de licence détectée par GitHub ; le paquet npm déclare GPL-3.0. Le dépôt `Yoast/javascript` est archivé depuis le 4 octobre 2022.
  - **Verdict : à évaluer, en service isolé.** Lier ce moteur dans le code applicatif en Next.js déclencherait l'obligation GPL sur l'ensemble du produit. Une exécution dans un conteneur séparé, appelé par HTTP, réduit ce risque, mais une analyse juridique est requise. Les données linguistiques pèsent environ 2,4 Mo (note du README sur `getResearcher`).
- **Rank Math** (rankmath/seo-by-rank-math, 136 étoiles, dernier push le 6 octobre 2026) : plugin WordPress en PHP. Licence non détectée par GitHub (à vérifier dans readme.txt). **Écarter** pour une pile Next.js, source d'idées de fonctionnalités uniquement.

**Lisibilité et style sans dépendance copyleft**

- **textstat** (MIT, 1 392 étoiles, dernier push le 26 octobre 2026, Python) : le tableau de support du README indique une variante française pour `flesch_reading_ease`. Il faut valider les résultats sur un corpus français de référence avant de fixer des seuils. **Adopter** pour la lisibilité française, sous réserve de cette validation.
- **textlint** (MIT, 3 203 étoiles, dernier push le 26 octobre 2026) : linter de prose extensible. Pas de règles françaises natives trouvées dans le README ; il faut les écrire. **À évaluer.**
- **Vale** (vale-cli/vale, MIT, 6 289 étoiles, dernier push le 24 octobre 2026) : linter de prose avec styles définis par règles YAML. Pour le français, il faut écrire un style maison (guide de rédaction Nexora). **À évaluer.**
- **retext** (MIT, 2 433 étoiles, dernier push le 4 février 2025) : écosystème unified, faible activité récente. **Écarter.**

**Grammaire et style français**

- **LanguageTool** (LGPL-2.1, 15 199 étoiles, dernier push le 26 octobre 2026) : vérificateur de grammaire et de style pour plus de 25 langues, dont le français. Les images Docker sont communautaires (README : meyayl/docker-languagetool ou meyay/languagetool), pas officielles : à figer par digest et à relire. La LGPL convient à un service séparé. **À évaluer**, en conteneur séparé.

**TAL pour les mots-clés et les entités**

- **Densité de mots-clés** : indicateur faible, à ne pas optimiser pour lui-même. Un calcul maison suffit (présence du mot-clé principal dans le titre, l'introduction, un intertitre et la méta-description). Le README de yoastseo indique aussi une prise en charge du français pour les analyses liées aux mots-clés (mots-outils).

- **spaCy** (MIT, 33 996 étoiles, dernier push le 27 octobre 2026) : modèles français, extraction d'entités et de mots-clés. **À évaluer** pour le maillage et la détection de sujets.
- **stanza** (Apache-2.0, 7 903 étoiles, PyPI 1.15.0) : analyse linguistique multilingue de Stanford, dont le français. **À évaluer** comme alternative à spaCy pour la qualité linguistique.

**Extraction et conversion Markdown (utile pour le GEO)**

- **mozilla/readability** (Apache-2.0, 11 516 étoiles, dernier push le 4 août 2026) : extrait le contenu principal d'une page HTML. **Adopter** pour les versions Markdown et les `llms-full.txt`.
- **mixmark-io/turndown** (MIT, 11 490 étoiles, dernier push le 18 octobre 2026) : convertit HTML en Markdown. **Adopter.**

### 4.8 Maillage interne automatisé

- Aucun outil open source mature et permissif identifié pour le maillage interne automatique. Les approches décrites en 2026 (embeddings, graphe de contenu, seuils de pertinence, règles de révision) sont des articles de blog ou des projets de recherche.
- **WebKnoGraph** (martech-engineer/WebKnoGraph, Apache-2.0, 23 étoiles, dernier push le 6 octobre 2026) : cadre de recherche combinant crawl, embeddings et prédiction de liens. **À évaluer** pour l'idée, faible maturité.
- **Recommandation** : construire le maillage en interne. Calculer les embeddings des pages, proposer des liens candidats au-dessus d'un seuil, les soumettre à validation humaine (agent rédacteur ou éditeur), puis insérer le lien dans Directus sous forme de relation. Mesurer l'effet avec Search Console (pages orphelines, clics vers les pages liées).

### 4.9 GEO et AEO (moteurs génératifs)

**Position officielle de Google**
- Billet « AI Features and Your Website » (10 décembre 2025) : `llms.txt` n'est ni nécessaire ni utilisé par Google Search, AI Overviews ou AI Mode. Aucun balisage ou fichier spécial n'est requis pour ces fonctions. Les données structurées doivent correspondre au contenu visible. Les bonnes pratiques SEO classiques restent valables. Le contrôle passe par `Google-Extended` ou `nosnippet` dans robots.txt.

**Spécification `llms.txt`**
- Proposition publiée sur llmstxt.org (Jeremy Howard, version 2, 3 septembre 2024). Fichier `/llms.txt` en Markdown : titre H1, résumé en citation, sections H2, listes de liens. `llms-full.txt` contient le contenu complet.
- **AnswerDotAI/llms-txt** (Apache-2.0, 2 670 étoiles, dernier push le 24 septembre 2026) : spécification de référence et outils. **Adopter** comme référence de validation.

**Outils et exemples**

| Projet | Licence | Étoiles | Dernier push | Apport | Verdict |
|---|---|---|---|---|---|
| Auriti-Labs/geo-optimizer-skill | MIT | 1 178 | 26 oct. 2026 (créé le 18 févr. 2026) | Audit GEO (score 0-100), CLI, serveur MCP, action GitHub, commande `geo llms` qui génère `llms.txt` depuis le sitemap | À évaluer (récent ; vérifier le code avant usage) |
| mverab/eGEOagents | MIT | 207 | 26 oct. 2026 (créé le 12 janv. 2026) | CLI et compétences Claude Code pour GEO et AEO | À évaluer |
| dodopayments/dualmark | Apache-2.0 | 121 | 15 sept. 2026 | Adaptateur Next.js : `llms.txt`, versions Markdown par page, middleware `proxy.ts` | À évaluer (pattern utile ; projet petit) |
| fuma-nama/fumadocs (llms) | MIT | 13 482 | 26 oct. 2026 | Utilitaires officiels pour `llms.txt` et `llms-full.txt` dans Next.js (routes et index depuis l'arbre de pages) | À évaluer (utile si on ajoute un centre d'aide) |
| AgriciDaniel/claude-seo | MIT | 22 158 | 22 oct. 2026 | Ensemble de compétences SEO pour Claude Code (26 sous-compétences, 19 sous-agents selon le dépôt) | À évaluer (référence d'architecture pour les agents ; auditer les compétences avant usage) |
| amplifying-ai/awesome-generative-engine-optimization | Non détectée (README : CC0-1.0) | 531 | 14 avr. 2026 | Liste curée de ressources GEO | Référence (lecture) |
| ai-robots-txt/ai.robots.txt | MIT | 4 220 | 24 oct. 2026 | Liste de robots IA à autoriser ou bloquer | Adopter (source des règles de `robots.ts`) |

**Recherche** : l'article « GEO: Generative Engine Optimization » (arXiv:2311.09735, titre vérifié) est la référence académique sur la visibilité dans les moteurs génératifs. Les pratiques retenues dans la littérature et dans les outils : citer des sources, présenter des statistiques vérifiables, reprendre des citations. Les gains chiffrés des articles de vulgarisation n'ont pas été revérifiés.

**Bots IA et robots.txt (documentation des opérateurs, consultée les 26 et 27 octobre 2026)**

| Opérateur | Bot | Rôle | Respecte robots.txt (selon l'opérateur) |
|---|---|---|---|
| OpenAI | OAI-SearchBot | Recherche ChatGPT | Oui |
| OpenAI | GPTBot | Collecte pour entraînement | Oui |
| OpenAI | ChatGPT-User | Action déclenchée par un utilisateur | Non |
| OpenAI | OAI-AdsBot | Validation des pages de publicité | Non |
| Perplexity | PerplexityBot | Indexation pour la recherche | Oui |
| Perplexity | Perplexity-User | Action déclenchée par un utilisateur | Non |
| Anthropic | ClaudeBot | Collecte pour entraînement | Oui |
| Anthropic | Claude-User | Requête d'un utilisateur Claude | Oui (selon Anthropic) |
| Anthropic | Claude-SearchBot | Indexation pour la recherche | Oui |

**Conséquences pour Nexora** : décider par bot. Autoriser les bots de recherche (OAI-SearchBot, PerplexityBot, Claude-SearchBot) si la visibilité dans les réponses IA est un objectif. Bloquer ou autoriser les bots d'entraînement (GPTBot, ClaudeBot) selon la politique de l'entreprise. Les bots déclenchés par l'utilisateur (ChatGPT-User, Perplexity-User) ne respectent pas robots.txt selon leurs opérateurs : robots.txt ne les contrôle donc pas. Cette politique est une décision d'affaires, à faire valider par le fondateur.

### 4.10 Indexation et API de soumission

- **IndexNow** (protocole ouvert, indexnow.org, consulté le 26 octobre 2026) : requête POST vers `api.indexnow.org`, jusqu'à 10 000 URL par requête. Clé à placer à la racine du site. Moteurs cités par la page : Bing et Yandex. Pas de bibliothèque officielle nécessaire : un appel HTTP suffit. **Adopter** via un appel HTTP direct après chaque déploiement, sur les URL modifiées (différence de sitemap ou `lastmod`).
- **@vijayhardaha/next-indexnow** (npm 1.2.1, MIT, publié le 20 septembre 2026) : CLI qui soumet les URL d'un sitemap Next.js. **À évaluer**, mais un appel HTTP direct est plus simple à maintenir.
- **Bing Webmaster URL submission API** (aide Bing Webmaster, consultée le 26 octobre 2026) : jusqu'à 10 000 URL par domaine et par jour ; endpoints `SubmitUrl`, `SubmitUrlBatch` et `GetUrlSubmissionQuota`, authentification par clé API. **Adopter.** Les anciennes limites (10 URL par jour, 50 par mois) sont obsolètes.
- **Google Search Console API** (page limites, consultée le 26 octobre 2026) : 30 millions de requêtes par jour, 1 200 requêtes par minute, 2 000 inspections d'URL par propriété et par jour, 600 par minute. Historique de données conservé 16 mois : à archiver dans Directus ou dans une base dédiée pour dépasser cette fenêtre.
  - **googleapis/google-api-nodejs-client** (Apache-2.0, 12 275 étoiles, dernier push le 22 octobre 2026) : client officiel Node.js. **Adopter.**
  - **AminForou/mcp-gsc** (MIT, 2 033 étoiles, dernier push le 15 septembre 2026, Python) : serveur MCP pour interroger la Search Console depuis un agent. **Adopter** pour la lecture par agent ; à tester sur un compte de service.
  - **ahonn/mcp-server-gsc** (281 étoiles, dernier push le 4 septembre 2026, TypeScript) : GitHub ne détecte pas de licence, npm déclare MIT. **À évaluer** après confirmation de la licence.
- **Google Indexing API** : d'après la documentation officielle, réservée aux pages JobPosting et aux BroadcastEvent intégrés dans VideoObject. Pas d'autres types de contenu. **Écarter** pour le site Nexora.
- **Sitemaps** : soumettre le sitemap dans Search Console et le référencer dans robots.txt. Le `lastmod` doit refléter une vraie modification, sinon il perd sa valeur.

---

## 5. Fiches projets (tableau maître)

Dernier push = champ `pushed_at` (approximation de la date du dernier commit sur la branche par défaut). Étoiles relevées les 26 et 27 octobre 2026.

### 5.1 Next.js, données structurées, images et polices

| Projet | URL | Licence | Étoiles | Dernier push | Maturité | Verdict |
|---|---|---|---|---|---|---|
| Next.js (vercel/next.js) | https://github.com/vercel/next.js | MIT | 143 307 | 27 oct. 2026 (npm next 16.4.3, 23 oct. 2026) | Très mature | Adopter (socle) |
| next-seo | https://github.com/garmeeh/next-seo | MIT | 8 534 | 29 juil. 2026 | Mature, redondant en App Router | Écarter |
| next-sitemap | https://github.com/iamvishnusankar/next-sitemap | MIT | 3 748 | 13 mai 2026 (npm dernière version : 6 sept. 2023) | Mature mais release npm ancienne | Écarter (plan B) |
| schema-dts | https://github.com/google/schema-dts | Apache-2.0 | 1 252 | 2 oct. 2026 (npm 2.1.0) | Mature, recommandé par Next.js | Adopter |
| jsonld.js | https://github.com/digitalbazaar/jsonld.js | BSD-3-Clause | 1 817 | 4 mars 2026 (npm 9.0.0 : 21 nov. 2025) | Stable | À évaluer (validation CI) |
| next-intl | https://github.com/amannn/next-intl | MIT | 4 385 | 2 oct. 2026 | Mature | À évaluer (si interface traduite) |
| next-i18next | https://github.com/i18next/next-i18next | MIT | 6 167 | 24 oct. 2026 | Mature, orienté Pages Router | Écarter (App Router) |
| Satori (vercel/satori) | https://github.com/vercel/satori | MPL-2.0 | 14 133 | 23 oct. 2026 | Mature | Adopter (via next/og) |
| sharp | https://github.com/lovell/sharp | Apache-2.0 | 32 797 | 23 oct. 2026 | Mature | Adopter (requis) |
| fontsource | https://github.com/fontsource/fontsource | MIT | 6 243 | 14 oct. 2026 | Mature | À évaluer |
| subfont | https://github.com/Munter/subfont | MIT | 1 636 | 20 sept. 2026 | Mature | Écarter (avec next/font) |
| Fumadocs (fumadocs-core) | https://github.com/fuma-nama/fumadocs | MIT | 13 482 | 26 oct. 2026 (npm 16.17.8 : 23 oct. 2026) | Très actif | À évaluer (si centre d'aide) |

### 5.2 Audit, crawl, performance et accessibilité

| Projet | URL | Licence | Étoiles | Dernier push | Maturité | Verdict |
|---|---|---|---|---|---|---|
| Lighthouse | https://github.com/GoogleChrome/lighthouse | Apache-2.0 | 30 953 | 25 oct. 2026 | Mature | Adopter |
| Lighthouse CI | https://github.com/GoogleChrome/lighthouse-ci | Apache-2.0 | 7 117 | 23 oct. 2026 | Mature | Adopter |
| lighthouse-ci-action | https://github.com/treosh/lighthouse-ci-action | MIT | 1 292 | 12 mars 2026 | Activité plus faible | À évaluer |
| Unlighthouse | https://github.com/harlan-zw/unlighthouse | MIT | 4 916 | 23 oct. 2026 | Actif | Adopter |
| sitespeed.io | https://github.com/sitespeedio/sitespeed.io | MIT | 5 046 | 26 oct. 2026 | Mature | Adopter |
| web-vitals | https://github.com/GoogleChrome/web-vitals | Apache-2.0 | 8 661 | 16 oct. 2026 | Mature | Adopter |
| Boomerang | https://github.com/akamai/boomerang | BSD (LICENSE.txt) | 1 925 | 10 juil. 2026 | Ancienne génération | Écarter |
| SEOnaut | https://github.com/StJudeWasHere/seonaut | MIT | 839 | 8 oct. 2026 | Actif (Go) | À évaluer (candidat principal) |
| LibreCrawl | https://github.com/PhialsBasement/LibreCrawl | MIT | 1 077 | 29 sept. 2026 | Actif (Python) | À évaluer |
| open-seo-crawler | https://github.com/puneetindersingh/open-seo-crawler | MIT | 72 | 23 oct. 2026 | Jeune | À évaluer |
| Crawlee | https://github.com/apify/crawlee | Apache-2.0 | 26 270 | 27 oct. 2026 | Mature | Adopter |
| Playwright | https://github.com/microsoft/playwright | Apache-2.0 | 98 591 | 27 oct. 2026 | Très mature | Adopter |
| lychee | https://github.com/lycheeverse/lychee | Apache-2.0 | 4 051 | 26 oct. 2026 | Mature | Adopter |
| linkinator | https://github.com/JustinBeckwith/linkinator | MIT | 1 277 | 23 oct. 2026 | Actif | À évaluer |
| htmltest | https://github.com/wjdp/htmltest | MIT | 378 | 20 janv. 2025 | Faible activité | Écarter |
| axe-core | https://github.com/dequelabs/axe-core | MPL-2.0 | 7 711 | 26 oct. 2026 | Mature | Adopter |
| pa11y | https://github.com/pa11y/pa11y | LGPL-3.0 | 4 586 | 26 oct. 2026 | Mature | À évaluer |

### 5.3 Contenu, langue et TAL

| Projet | URL | Licence | Étoiles | Dernier push | Maturité | Verdict |
|---|---|---|---|---|---|---|
| Yoast (yoastseo, monorepo wordpress-seo) | https://github.com/Yoast/wordpress-seo | GPL-3.0 (npm yoastseo 3.6.0) ; GitHub : non détectée | 2 008 | 26 oct. 2026 | Mature | À évaluer (service isolé, avis juridique) |
| Yoast/javascript | https://github.com/Yoast/javascript | Non détectée | 127 | 4 oct. 2022 (archivé) | Archivé | Écarter |
| Rank Math | https://github.com/rankmath/seo-by-rank-math | Non détectée | 136 | 6 oct. 2026 | Plugin WordPress | Écarter |
| textstat | https://github.com/textstat/textstat | MIT | 1 392 | 26 oct. 2026 | Actif | Adopter (après validation FR) |
| textlint | https://github.com/textlint/textlint | MIT | 3 203 | 26 oct. 2026 | Mature | À évaluer (règles FR à écrire) |
| Vale | https://github.com/vale-cli/vale | MIT | 6 289 | 24 oct. 2026 | Mature | À évaluer (style FR maison) |
| retext | https://github.com/retextjs/retext | MIT | 2 433 | 4 févr. 2025 | Faible activité | Écarter |
| LanguageTool | https://github.com/languagetool-org/languagetool | LGPL-2.1 | 15 199 | 26 oct. 2026 | Mature (25+ langues) | À évaluer (conteneur séparé) |
| spaCy | https://github.com/explosion/spaCy | MIT | 33 996 | 27 oct. 2026 | Mature | À évaluer |
| stanza | https://github.com/stanfordnlp/stanza | Apache-2.0 | 7 903 | 25 oct. 2026 | Mature | À évaluer |
| Readability (Mozilla) | https://github.com/mozilla/readability | Apache-2.0 | 11 516 | 4 août 2026 | Mature | Adopter |
| Turndown | https://github.com/mixmark-io/turndown | MIT | 11 490 | 18 oct. 2026 | Mature | Adopter |

### 5.4 GEO, AEO et indexation

| Projet | URL | Licence | Étoiles | Dernier push | Maturité | Verdict |
|---|---|---|---|---|---|---|
| llms-txt (AnswerDotAI) | https://github.com/AnswerDotAI/llms-txt | Apache-2.0 | 2 670 | 24 sept. 2026 | Référence | Adopter (spec) |
| dualmark | https://github.com/dodopayments/dualmark | Apache-2.0 | 121 | 15 sept. 2026 | Jeune | À évaluer |
| geo-optimizer-skill | https://github.com/Auriti-Labs/geo-optimizer-skill | MIT | 1 178 | 26 oct. 2026 | Jeune (créé en févr. 2026) | À évaluer |
| eGEOagents | https://github.com/mverab/eGEOagents | MIT | 207 | 26 oct. 2026 | Jeune (créé en janv. 2026) | À évaluer |
| claude-seo | https://github.com/AgriciDaniel/claude-seo | MIT | 22 158 | 22 oct. 2026 | Très suivi | À évaluer (référence d'architecture) |
| awesome-generative-engine-optimization | https://github.com/amplifying-ai/awesome-generative-engine-optimization | Non détectée (README : CC0-1.0) | 531 | 14 avr. 2026 | Liste | Référence |
| ai.robots.txt | https://github.com/ai-robots-txt/ai.robots.txt | MIT | 4 220 | 24 oct. 2026 | Actif | Adopter |
| WebKnoGraph | https://github.com/martech-engineer/WebKnoGraph | Apache-2.0 | 23 | 6 oct. 2026 | Faible | À évaluer |
| search-solved-public-seo | https://github.com/searchsolved/search-solved-public-seo | « Other » (non standard) | 418 | 21 sept. 2026 | Actif | À évaluer (lire la licence) |
| google-api-nodejs-client | https://github.com/googleapis/google-api-nodejs-client | Apache-2.0 | 12 275 | 22 oct. 2026 | Officiel Google | Adopter |
| mcp-gsc (AminForou) | https://github.com/AminForou/mcp-gsc | MIT | 2 033 | 15 sept. 2026 | Actif | Adopter (lecture par agent) |
| mcp-server-gsc (ahonn) | https://github.com/ahonn/mcp-server-gsc | Non détectée (npm : MIT) | 281 | 4 sept. 2026 | Actif | À évaluer |
| next-indexnow (npm) | https://www.npmjs.com/package/@vijayhardaha/next-indexnow | MIT | (npm) | npm 1.2.1, 20 sept. 2026 | Petit | À évaluer |

### 5.5 CMS et licence

| Projet | URL | Licence | Étoiles | Dernier push | Maturité | Verdict |
|---|---|---|---|---|---|---|
| Directus | https://github.com/directus/directus | MSCL-1.0-GPL (source disponible) | 38 640 | 26 oct. 2026 (npm directus 12.5.1 : 23 oct. 2026) | Très mature | Adopter sous réserve d'avis juridique |

---

### 5.6 Intégration par projet (Next.js, Directus, Docker)

Les projets classés « Adopter » ou « À évaluer » sont décrits ici. Les écartés ne sont pas intégrés.

**Next.js et données structurées**
- **Next.js (natif)** : `generateMetadata` par page, `app/sitemap.ts` et `app/robots.ts` dans `app/`, contenu lu depuis Directus. Image Docker en `output: standalone`, `sharp` installé dans l'image.
- **schema-dts** : types à la compilation. Un composant serveur unique `JsonLd` produit le `<script type="application/ld+json">`, avec remplacement de `<` par `<`.
- **jsonld.js** : étape CI (Node) qui extrait le JSON-LD des pages construites et le valide.
- **next-intl (à évaluer)** : détection de langue dans `proxy.ts`, messages d'interface par langue dans le dépôt. Le contenu éditorial reste dans Directus.
- **Satori via next/og** : `app/**/opengraph-image.tsx` avec `ImageResponse`. Polices TTF ou WOFF lues depuis le dépôt.
- **fontsource (à évaluer)** : paquets npm pour les polices hors Google Fonts, chargées avec `next/font/local`.
- **Fumadocs (à évaluer)** : seulement si un centre d'aide est ajouté. Sa source MDX alimente les routes `llms.txt` et `llms-full.txt`.

**Audit, performance et accessibilité (CI et planifiés)**
- **Lighthouse** : moteur commun à Lighthouse CI et Unlighthouse. Chrome headless dans l'image de CI.
- **Lighthouse CI (adopter)** : job GitHub Actions sur chaque pull request, contre un déploiement de prévisualisation Docker. Assertions sur le score SEO et sur LCP, INP, CLS. Rapports archivés.
- **lighthouse-ci-action (à évaluer)** : enveloppe de LHCI en action GitHub. Préférer LHCI en ligne de commande directe.
- **Unlighthouse (adopter)** : lancé sur l'environnement de préproduction, couvre les URL du sitemap. Rapport HTML planifié.
- **sitespeed.io (adopter)** : conteneur Docker planifié (cron) sur les pages clés. Export des métriques pour le suivi dans le temps.
- **web-vitals (adopter)** : script client qui envoie LCP, INP, CLS à une route `/api/vitals`, stockée en base ou dans une collection Directus.
- **SEOnaut (à évaluer, candidat principal)** : conteneur Go, crawl hebdomadaire du sitemap. Export des problèmes vers Directus.
- **LibreCrawl (à évaluer)** : usage manuel sur poste de travail. Pas de conteneur prévu.
- **open-seo-crawler (à évaluer)** : conteneur Python. Vérifie aussi l'accès des robots IA, utile pour la politique de la section 4.9.
- **Crawlee (adopter)** : bibliothèque dans un job Node pour les contrôles sur mesure (redirections en chaîne, pages orphelines, balises canonical).
- **Playwright (adopter)** : tests de bout en bout et rendu des pages JavaScript dans le même pipeline. Image Docker officielle de Playwright.
- **axe-core (adopter)** : appelé par Playwright lors des tests de bout en bout.
- **lychee (adopter)** : binaire ou conteneur, job CI sur le sitemap, liste d'exclusions versionnée.
- **linkinator (à évaluer)** : alternative Node à lychee. Non retenu si lychee est adopté.
- **pa11y (à évaluer)** : redondant avec axe-core. Non retenu sauf besoin de CLI.

**Contenu, langue et TAL**
- **textstat (adopter après validation)** : service Python en conteneur, appelé par un worker qui calcule la lisibilité française lors de l'enregistrement. Seuils calibrés sur un corpus.
- **textlint (à évaluer)** : règles maison en npm, exécutées en CI sur l'export Markdown de Directus.
- **Vale (à évaluer)** : binaire en CI avec un style Nexora en YAML.
- **LanguageTool (à évaluer)** : conteneur séparé, image communautaire à figer par digest, appel HTTP. Licence LGPL-2.1.
- **yoastseo (à évaluer, GPL-3.0)** : service Node isolé, appel HTTP. Pas de liaison dans le code applicatif sans avis juridique.
- **spaCy et stanza (à évaluer)** : worker Python pour mots-clés, entités et embeddings du maillage interne.
- **Readability et turndown (adopter)** : worker Node à la publication. Produit les versions Markdown et `llms-full.txt`, stockées dans Directus ou générées à la requête avec cache.

**GEO, robots et indexation**
- **llms-txt (AnswerDotAI, adopter comme référence)** : validation du format de `/llms.txt` en CI.
- **dualmark (à évaluer)** : pattern Next.js (route `llms.txt`, `proxy.ts`, versions Markdown). À lire avant adoption.
- **geo-optimizer-skill (à évaluer)** : CLI en CI. La commande `geo llms` génère `llms.txt` depuis le sitemap. Audit périodique.
- **eGEOagents (à évaluer)** : CLI à comparer en parallèle avec geo-optimizer-skill.
- **claude-seo (à évaluer)** : compétences pour Claude Code, utilisées sur le poste de l'équipe et non sur le serveur. Code à auditer avant usage.
- **ai.robots.txt (adopter)** : liste importée dans `app/robots.ts`, mise à jour mensuelle.
- **googleapis (adopter)** : job Node pour l'API Search Console (requêtes, inspections, sitemaps). Résultats archivés dans Directus.
- **mcp-gsc (adopter pour la lecture)** : serveur MCP local pour les agents. Identifiants dans les variables d'environnement.
- **mcp-server-gsc (à évaluer)** : alternative MCP, après confirmation de la licence.
- **next-indexnow (à évaluer)** : CLI npm. Un appel HTTP direct est plus simple.
- **IndexNow et Bing (adopter)** : job déclenché après déploiement (GitHub Actions ou Flow Directus). Clé IndexNow servie à la racine du site depuis `public/`.
- **Directus (adopter sous réserve)** : CMS. Un Flow de publication appelle `/api/revalidate`. Une collection SEO par page porte les champs de la section 7.1.

---

## 6. Licences et risques

| Licence | Projets concernés | Ce que cela implique pour Nexora |
|---|---|---|
| MIT, Apache-2.0, BSD | Next.js, schema-dts, Lighthouse, Crawlee, Playwright, lychee, textstat, sitespeed.io, etc. | Usage commercial, modification et intégration libres. Conserver les notices. |
| MPL-2.0 | Satori, axe-core | Usage libre. Les modifications des fichiers MPL doivent rester sous MPL. |
| LGPL-2.1, LGPL-3.0 | LanguageTool, pa11y | Utilisation possible comme bibliothèque ou service. Préférer un conteneur séparé pour LanguageTool. |
| GPL-3.0 | Yoast (yoastseo) | Liaison directe dans le code applicatif = obligation de publier l'ensemble sous GPL. Service séparé et avis juridique. |
| AGPL (aucun retenu) | n/a | Non utilisé dans cette sélection. À éviter si possible. |
| MSCL-1.0-GPL (source disponible) | Directus | Usages permis : interne, services professionnels, hébergement pour un client. Interdits : offre concurrente facturée. Passage à GPL-3.0 après quatre ans (clause du fichier LICENSE). |
| Non détectée ou « Other » | Rank Math, Yoast/javascript (archivé), search-solved-public-seo, ahonn/mcp-server-gsc, awesome-GEO | Lire le fichier de licence avant tout usage. Ne pas copier de code. |

---

## 7. Architecture SEO recommandée (pipeline automatisable par agents IA)

### 7.1 Vue d'ensemble

```
Directus (CMS, MSCL)
  champs SEO par page : titre, description, canonical, groupe hreflang,
  type de données structurées, image OG, dates, statut de validation
        |
        |  Flow de publication (webhook, secret)
        v
Next.js 16 (standalone, Docker)
  - generateMetadata : fr-CA, en-CA, x-default
  - app/sitemap.ts (alternates) et app/robots.ts (politique par bot)
  - JSON-LD via schema-dts (échappement obligatoire)
  - next/og, next/font, next/image + sharp
  - /llms.txt, /llms-full.txt, versions Markdown (turndown, readability)
  - /api/revalidate -> revalidateTag(tag, 'max')
        |
        v
Agents IA (orchestration ; validation humaine avant publication)
  A1 Audit nocturne       : Lighthouse CI + Unlighthouse + SEOnaut -> problèmes dans Directus
  A2 Qualité rédactionnelle: textstat (fr) + textlint/Vale + LanguageTool -> score, suggestions
  A3 Maillage interne     : embeddings -> liens candidats -> validation -> relation Directus
  A4 Indexation           : diff de sitemap (lastmod) -> IndexNow + Bing SubmitUrlBatch
  A5 GEO                  : régénère llms.txt, contrôle les bots (ai.robots.txt), citabilité
  A6 Mesure               : GSC API (archivage > 16 mois) + CrUX + sitespeed -> tableau de bord
```

### 7.2 Phases de mise en œuvre

1. **Fondations (sprint 1)** : Metadata API, `sitemap.ts` et `robots.ts` multilingues, JSON-LD via schema-dts avec un composant unique, `next/og`, `next/font`, `next/image` avec sharp, champs SEO dans Directus, endpoint de revalidation par tag.
2. **Garde-fous en CI (sprint 2)** : Lighthouse CI sur chaque pull request, lychee sur les liens, axe-core via Playwright, contrôles maison (titres uniques, canonical réciproque, hreflang réciproque, `x-default`, JSON-LD valide, longueurs de méta).
3. **Surveillance continue (sprint 3)** : sitespeed.io planifié, web-vitals en terrain, CrUX mensuel, SEOnaut hebdomadaire, Unlighthouse à la demande.
4. **Qualité rédactionnelle (sprint 4)** : textstat français (après validation sur un corpus), textlint ou Vale avec un style Nexora, LanguageTool en conteneur séparé, décision juridique sur Yoast.
5. **Indexation et GEO (sprint 5)** : IndexNow et Bing après chaque déploiement, sitemaps soumis à Search Console, `llms.txt` généré, politique robots par bot validée, versions Markdown.
6. **Agents (sprint 6)** : A1 à A6 en file de tâches, avec sorties dans Directus et jalons de validation humaine.

### 7.3 Garde-fous

- **Aucune publication automatique.** Les agents rédigent, proposent, mesurent. Un humain valide les textes, les liens et les données structurées.
- **Aucune page générée en masse** sans valeur propre : le risque est un contenu de faible qualité au sens des politiques anti-spam de Google.
- **Données structurées conformes au visible** (règle de Google). Un contrôle automatique doit comparer le JSON-LD au contenu rendu.
- **Quotas respectés** : IndexNow (10 000 URL par requête), Bing (10 000 par domaine et par jour), Search Console (2 000 inspections d'URL par propriété et par jour).
- **Secrets** : clés API, secret de revalidation et jetons GSC dans les variables d'environnement ou les secrets Docker, jamais dans le dépôt ni dans les logs.
- **Politique IA et robots** : décision de l'entreprise, versionnée, revue trimestrielle.
- **Indexing API de Google** : non utilisée pour ce site.

### 7.4 Topologie Docker proposée

| Service | Image ou composant | Licence | Rôle |
|---|---|---|---|
| web | Next.js 16 standalone, sharp | MIT / Apache-2.0 | Site, métadonnées, sitemap, robots, OG, revalidation |
| directus | Directus | MSCL-1.0-GPL | CMS et panneau d'administration |
| db | PostgreSQL | (non évalué ici) | Données Directus, historique GSC, embeddings (si pgvector) |
| cache | Redis | (non évalué ici) | Cache ISR partagé si plusieurs réplicas |
| audit | Lighthouse CI, Unlighthouse, sitespeed.io (planifiés) | Apache-2.0 / MIT | Audits et mesures |
| crawl | SEOnaut | MIT | Crawl SEO planifié |
| links | lychee | Apache-2.0 | Liens cassés |
| langue | LanguageTool (conteneur séparé) | LGPL-2.1 | Grammaire et style français (image communautaire à figer par digest) |
| analyse | Service textstat, éventuellement yoastseo (GPL, isolé) | MIT / GPL | Lisibilité et analyse on-page |
| jobs | Agents IA et tâches (IndexNow, GSC, Bing) | MIT / Apache-2.0 | Orchestration |

---

## 8. Points à valider avant décision

1. **Juridique, Directus** : confirmer que l'offre de Nexora (hébergement ou services d'installation pour des clients) entre dans les « services professionnels » permis. Confirmer qu'une plateforme vendue comme produit concurrent est exclue.
2. **Juridique, Yoast (GPL-3.0)** : décider entre un service séparé ou une réécriture des algorithmes (formule de Flesch en français, mots de liaison). Ne pas copier de code.
3. **Juridique, Québec** : vérifier les obligations linguistiques pour les pages commerciales (Charte de la langue française) avant de fixer la hiérarchie fr-CA et en-CA. Non vérifié dans cette recherche.
4. **Politique IA** : choisir la politique robots par bot (recherche, entraînement, action utilisateur). Décision de l'entreprise.
5. **Search Console** : confirmer la limite de lignes par requête sur la page officielle. Revalider la fenêtre de 16 mois.
6. **CrUX** : confirmer la fenêtre glissante de 28 jours et le quota sur la documentation officielle (page de remplacement consultée).
7. **Bing** : confirmer la taille maximale d'un lot `SubmitUrlBatch` sur la page officielle.
8. **FAQPage** : vérifier l'état actuel des résultats enrichis FAQ avant de compter dessus.
9. **Licence ahonn/mcp-server-gsc** : GitHub ne détecte pas de licence ; npm déclare MIT. Confirmer avant usage.
10. **Rank Math et search-solved** : lire les fichiers de licence si ces outils sont retenus.
11. **Maillage interne** : aucun outil mature trouvé ; prototype à construire.
12. **Hreflang** : aucun vérificateur permissif identifié ; contrôle maison à prévoir.

---

## 9. Sources principales (consultées les 26 et 27 octobre 2026)

- Next.js : https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap ; https://nextjs.org/docs/app/api-reference/functions/generate-metadata ; https://nextjs.org/docs/app/guides/json-ld ; https://nextjs.org/docs/app/guides/internationalization ; https://nextjs.org/docs/app/api-reference/components/image ; https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots ; https://nextjs.org/docs/app/guides/self-hosting ; https://nextjs.org/docs/app/api-reference/functions/image-response ; https://nextjs.org/docs/app/api-reference/components/font ; https://nextjs.org/docs/app/guides/incremental-static-regeneration
- Google : https://developers.google.com/search/docs/appearance/ai-features ; https://developers.google.com/search/docs/specialty/international/localized-versions ; https://developers.google.com/search/apis/indexing-api/v3/quickstart ; https://developers.google.com/webmaster-tools/limits ; https://developers.google.com/search/blog/2025/06/simplifying-search-results
- Core Web Vitals : https://web.dev/articles/defining-core-web-vitals-thresholds
- CrUX : https://developer.chrome.com/docs/crux/api
- IndexNow : https://www.indexnow.org/documentation
- Bing : https://www.bing.com/webmasters/help/URL-Submission-62f2860b
- Bots IA : https://developers.openai.com/api/docs/bots ; https://docs.perplexity.ai/docs/resources/perplexity-crawlers ; https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler ; https://www.searchenginejournal.com/anthropics-claude-bots-make-robots-txt-decisions-more-granular/568253/
- llms.txt : https://llmstxt.org
- Directus : https://directus.com/docs/self-hosting/overview ; https://raw.githubusercontent.com/directus/directus/main/license ; https://community.directus.com/t/directus-license-revision-community-feedback-requested/2125
- Yoast : https://raw.githubusercontent.com/Yoast/wordpress-seo/main/packages/yoastseo/README.md ; https://www.npmjs.com/package/yoastseo
- textstat : https://github.com/textstat/textstat
- LanguageTool : https://github.com/languagetool-org/languagetool
- Recherche GEO : https://arxiv.org/abs/2311.09735
- Echobind (pattern 2022) : https://echobind.com/post/instant-site-updates-with-on-demand-revalidation-and-directus
- Dépôts GitHub : https://github.com/vercel/next.js ; https://github.com/garmeeh/next-seo ; https://github.com/iamvishnusankar/next-sitemap ; https://github.com/google/schema-dts ; https://github.com/vercel/satori ; https://github.com/amannn/next-intl ; https://github.com/harlan-zw/unlighthouse ; https://github.com/GoogleChrome/lighthouse ; https://github.com/GoogleChrome/lighthouse-ci ; https://github.com/treosh/lighthouse-ci-action ; https://github.com/GoogleChrome/web-vitals ; https://github.com/JustinBeckwith/linkinator ; https://github.com/lycheeverse/lychee ; https://github.com/wjdp/htmltest ; https://github.com/vale-cli/vale ; https://github.com/digitalbazaar/jsonld.js ; https://github.com/fuma-nama/fumadocs ; https://github.com/AnswerDotAI/llms-txt ; https://github.com/lovell/sharp ; https://github.com/fontsource/fontsource ; https://github.com/Munter/subfont ; https://github.com/ai-robots-txt/ai.robots.txt ; https://github.com/mozilla/readability ; https://github.com/mixmark-io/turndown ; https://github.com/apify/crawlee ; https://github.com/sitespeedio/sitespeed.io ; https://github.com/textlint/textlint ; https://github.com/explosion/spaCy ; https://github.com/stanfordnlp/stanza ; https://github.com/microsoft/playwright ; https://github.com/dequelabs/axe-core ; https://github.com/pa11y/pa11y ; https://github.com/retextjs/retext ; https://github.com/akamai/boomerang ; https://github.com/StJudeWasHere/seonaut ; https://github.com/PhialsBasement/LibreCrawl ; https://github.com/puneetindersingh/open-seo-crawler ; https://github.com/Yoast/wordpress-seo ; https://github.com/Yoast/javascript ; https://github.com/rankmath/seo-by-rank-math ; https://github.com/Auriti-Labs/geo-optimizer-skill ; https://github.com/mverab/eGEOagents ; https://github.com/dodopayments/dualmark ; https://github.com/AgriciDaniel/claude-seo ; https://github.com/amplifying-ai/awesome-generative-engine-optimization ; https://github.com/martech-engineer/WebKnoGraph ; https://github.com/searchsolved/search-solved-public-seo ; https://github.com/googleapis/google-api-nodejs-client ; https://github.com/AminForou/mcp-gsc ; https://github.com/ahonn/mcp-server-gsc
- Registres : https://www.npmjs.com/package/next ; https://www.npmjs.com/package/schema-dts ; https://www.npmjs.com/package/next-sitemap ; https://pypi.org/project/stanza/
