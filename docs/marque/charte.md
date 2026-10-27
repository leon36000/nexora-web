# Charte de marque Nexora AI

Version du 27 octobre 2026 (décision D6 de la vague 2). Les trois pistes étudiées et la justification du choix sont dans `pistes-logo.html`.

## 1. Le nom

- **Nexora AI** : l'entreprise et la marque. Écrit ainsi partout où le nom désigne l'entreprise (métadonnées, courriels, pied de page, données structurées, mentions légales).
- Les **produits gardent leur nom** : Nexora WorkStudio, Nexora Vision, Nexora Croissance, Nexora Code, Nexora Corpus, Nexora Connect, OPSYS-AI, VPS, API et modèles. On n'écrit jamais « Nexora AI WorkStudio ».
- Dans le code : `SITE_NAME` (`web/src/lib/site.ts`) pour les métadonnées ; `meta.siteName` dans les dictionnaires. Les identifiants techniques (`@nexora/*`, `NEXORA_*`, `nexora-cms`, `nexora/glm-5-3`) ne changent pas.
- Titres de page : `Sujet | Nexora AI` (pages de l'application) ou `Sujet — Nexora AI` (pages du CMS, gabarit des réglages). Le titre avant le suffixe tient en 48 caractères au plus pour que le titre complet reste sous 60.

## 2. Le logo

**Idée.** Deux périmètres carrés qui se recouvrent : le vôtre (chez vous) et le nôtre (chez nous, au Québec). Leur intersection, en orange Nexora, est l'endroit où Nexora AI travaille : un point de passage contrôlé, jamais une fuite. C'est la grille de périmètre du site réduite à son essentiel.

**Construction.** Grille de 64 unités. Deux carrés de 36 unités, aux angles (6, 6) et (22, 22) ; l'intersection mesure 20 unités. Aucun arrondi, aucun dégradé. Logotype : « Nexora » et le « A » en contours de Geist 500 (interlettrage -0,03 em) ; le « I » est dessiné à la main avec des empattements, parce qu'en Geist le I majuscule et le l minuscule sont identiques et qu'on lirait « Al ». Hauteur des capitales : 36 unités, centrées sur le symbole. « AI » prend l'orange de texte du thème.

**Versions** (dossier `docs/marque/logos/`, SVG optimisés, sans police) :

| Fichier | Usage |
|---|---|
| `nexora-ai-logo.svg` | logo complet sur fond clair (papier, sable) |
| `nexora-ai-logo-sombre.svg` | logo complet sur fond sombre (encre forêt) |
| `nexora-ai-logo-noir.svg` / `-blanc.svg` | monochromes : l'intersection devient un évidement ; gravure, tampon, fax, impression une couleur |
| `nexora-ai-symbole.svg`, `-sombre`, `-noir`, `-blanc` | symbole seul |
| `app/tuile-*.svg` | tuiles d'application (encre forêt, symbole os) |

**Dans le site.** Composant `Logo` / `LogoMark` (`web/src/components/brand/logo.tsx`, géométrie générée dans `logo-geometry.ts`) ; `web/src/app/icon.svg` (favicon SVG qui passe de forêt à os selon le thème du navigateur), `favicon.ico` (16, 32, 48 px), `apple-icon.png` (180 px), `web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (manifeste `web/src/app/manifest.ts`), gabarit Open Graph de la route `/og/*`.

**Régénération.** `docs/marque/outils/build-marque.mjs` (SVG et module TypeScript, dépend d'`opentype.js`, hors dépôt) puis `docs/marque/outils/rasteriser.mjs` (PNG et ICO, via Playwright).

**Zone de protection.** Un vide d'au moins la moitié du côté d'un carré du symbole (18 unités, soit 0,35 fois la hauteur du symbole) sur les quatre côtés. Aucun texte, bord de page ni image ne l'entame.

**Tailles minimales.** Symbole seul : 16 px (favicon). Logo complet : 20 px de hauteur à l'écran (96 px de largeur) ; en impression, 18 mm de largeur. En dessous, utiliser le symbole seul.

**Contrastes** (WCAG 2.2, calculés le 27/10/2026). Texte : « AI » orange `#F07A52` sur encre `#0E1613` = 6,7:1 ; `#B83A18` sur papier `#FBF8F2` = 5,4:1 ; sur sable `#F3EEE4` = 5,0:1. Graphisme : orange `#CE411C` sur encre = 3,9:1, sur papier = 4,5:1, contre les carrés forêt = 3,4:1, contre les carrés os = 4,2:1 (tous au-dessus de 3:1 exigés pour un graphisme).

**Usages interdits.**
- Changer l'orange, ajouter un dégradé, une ombre, un contour ou un effet de lueur au logo.
- Séparer les deux carrés, modifier leur recouvrement, les arrondir, les pivoter ou les incliner.
- Recomposer le logotype dans une autre police, mettre « AI » dans une autre couleur que l'orange de texte du thème (ou l'ensemble en monochrome), écrire « Nexora Ai » ou « NEXORA AI ».
- Placer le logo en couleur sur une photo chargée, sur de l'orange (utiliser la version blanche), ou à moins de 3:1 de contraste avec le fond.
- Utiliser le symbole comme puce, motif répété ou décor de fond sans l'accord de la direction (le filigrane du pied de page est l'exception décrite plus bas).
- Accompagner le logo d'un robot, d'un cerveau lumineux ou d'une étincelle « IA » : la marque n'en a pas besoin.

## 3. Couleurs

Une seule teinte d'accent, l'orange Nexora. Jetons dans `web/src/app/globals.css`, contrastes recalculés par `bun run check:contrast`.

| Rôle | Sombre (encre forêt) | Clair (papier) | Sable |
|---|---|---|---|
| Fond | `#0E1613` | `#FBF8F2` | `#F3EEE4` |
| Surface | `#16211D` | `#F3EEE4` | `#E4DDCF` |
| Texte | `#F4F1EA` (16,3:1) | `#17221E` (15,4:1) | `#17221E` |
| Texte secondaire | `#A9B3AE` (8,5:1) | `#58625B` (6,0:1) | `#58625B` |
| Accent en texte | `#F07A52` (6,7:1) | `#B83A18` (5,4:1) | `#B83A18` (5,0:1) |
| Bouton d'accent | orange `#CE411C`, texte blanc `#FFFFFF` (4,8:1) | idem | idem |
| Succès | `#5CC596` | `#2F7D5B` | `#2F7D5B` |

Le vert de succès n'est utilisé que pour un état valide (ligne de journal, pastille « Actif »). L'orange `#CE411C` ne sert jamais à du texte courant sur fond sombre.

## 4. Typographies

Libres, servies localement (aucune requête externe) : **Geist** 500 pour les titres (interlignage serré, `text-wrap: balance`), **Inter** pour le texte, **JetBrains Mono** pour les libellés techniques et le code. Le logotype n'utilise aucune police au chargement : il est en contours.

## 5. Matières, rythme et mouvement

- **Rythme des pages** : bandes sombre / clair / sable en alternance ; un héros sombre, un appel à l'action sombre en conclusion. Une lueur d'accent très douce (radiale, 7 à 15 % d'orange) coiffe les bandes sombres et sable ; une bande qui en prolonge une autre de même ton n'en répète pas.
- **Textures** : trame de points (`tex-dots`) et grille de périmètre ; jamais de photo d'archive, jamais de robot ni de cerveau.
- **Maquettes d'interface** : composants (`web/src/components/visuals/`), toujours en thème sombre comme l'interface produit, avec une légende qui dit « maquette illustrative, données d'exemple » ou « schéma de principe, pas une capture d'écran ». Aucun chiffre de performance, aucun client, aucune certification dans une maquette.
- **Mouvement** : CSS seulement, aucune bibliothèque. Transformations uniquement (jamais d'opacité sur le texte du premier écran, pour ne pas retarder le LCP). Apparition au défilement par `animation-timeline: view()` (ignorée là où elle n'existe pas). Tout est déclaré sous `@media (prefers-reduced-motion: no-preference)` ; un test (`visuals.test.tsx`) échoue si une animation en sort.
- **Filigrane du pied de page** : le symbole en très grand (6 % d'opacité), ancré dans l'angle bas droit, masqué sous 768 px.

## 6. Composants disponibles pour les pages

Champ `visual` d'un bloc « section » (Directus, versionné dans `cms/scripts/lib/schema.ts`) : `perimetre-sur-place`, `perimetre-heberge`, `flux-donnees`, `flux-workstudio`, `catalogue-modeles`, `console-vps`, `tableau-de-bord`, `vision-sur-place`, `croissance-canaux`, `engagements-donnees`. Une section sans titre ni texte mais avec un visuel devient une bande « vitrine » centrée. Disposition de cartes `bento` (mosaïque sur six colonnes). La galerie de développement (`/galerie-marque`, active seulement avec `NEXORA_GALERIE_MARQUE=1`) les montre tous.
