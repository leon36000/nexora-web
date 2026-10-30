# Charte de marque Nexora AI

Version du 27 octobre 2026 : refonte « Instrument » (le fondateur voulait un visuel plus proche de Mistral, qui « transpire l'avance technologique »). L'étude de mistral.ai et les principes retenus sont dans `refonte-mistral.md` ; la version précédente (deux périmètres qui se recouvrent, palette sable et encre forêt) est abandonnée.

## 1. Le nom

- **Nexora AI** : l'entreprise et la marque. Écrit ainsi partout où le nom désigne l'entreprise (métadonnées, courriels, pied de page, données structurées, mentions légales).
- Les **produits gardent leur nom** : Nexora WorkStudio, Nexora Vision, Nexora Croissance, Nexora Code, Nexora Corpus, Nexora Connect, OPSYS-AI, VPS, API et modèles. On n'écrit jamais « Nexora AI WorkStudio ».
- Dans le code : `SITE_NAME` (`web/src/lib/site.ts`) pour les métadonnées ; `meta.siteName` dans les dictionnaires. Les identifiants techniques (`@nexora/*`, `NEXORA_*`, `nexora-cms`, `nexora/glm-5-3`) ne changent pas.
- Titres de page : `Sujet | Nexora AI` (pages de l'application) ou `Sujet — Nexora AI` (pages du CMS, gabarit des réglages). Le titre avant le suffixe tient en 48 caractères au plus pour que le titre complet reste sous 60.

## 2. Le logo

**Idée.** Un « N » dessiné en pixels : deux montants d'encre, et une diagonale de trois carrés orange qui les relie. La diagonale est le **point de passage** : ce qui entre, ce qui est approuvé, ce qui est contrôlé. Les pixels sont l'unité de construction de toute la marque (mosaïques, pastilles, bande du pied de page) ; aucun robot, aucun cerveau.

**Construction.** Grille de 64 unités, l'encre occupe 6 à 58. Cinq colonnes et cinq rangées de 10,4 unités, sans jeu. Les montants sont deux rectangles pleins (colonnes 1 et 5) ; la diagonale est faite des cellules (2, 2), (3, 3) et (4, 4), qui se touchent par un angle. Logotype : « Nexora » et le « A » en contours de Geist 500 (interlettrage -0,03 em, inchangés) ; le « I » est dessiné à la main avec des empattements, parce qu'en Geist le I majuscule et le l minuscule sont identiques et qu'on lirait « Al ». Hauteur des capitales : 36 unités, centrées sur le symbole. « AI » prend l'orange de texte du thème.

**Versions** (dossier `docs/marque/logos/`, SVG optimisés, sans police) :

| Fichier | Usage |
|---|---|
| `nexora-ai-logo.svg` | logo complet sur fond clair (papier, crème) |
| `nexora-ai-logo-sombre.svg` | logo complet sur fond sombre (noir profond) |
| `nexora-ai-logo-noir.svg` / `-blanc.svg` | monochromes : gravure, tampon, fax, impression une couleur |
| `nexora-ai-symbole.svg`, `-sombre`, `-noir`, `-blanc` | symbole seul |
| `app/tuile-*.svg` | tuiles d'application (noir profond, symbole os) |

**Dans le site.** Composant `Logo` / `LogoMark` (`web/src/components/brand/logo.tsx`, géométrie générée dans `logo-geometry.ts`) ; `web/src/app/icon.svg` (favicon SVG : graphite et orange foncé sur fond clair, os et orange signal sur fond sombre, selon le thème du navigateur), `favicon.ico` (16, 32, 48 px), `apple-icon.png` (180 px), `web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (manifeste `web/src/app/manifest.ts`), gabarit Open Graph de la route `/og/*` (fond noir, titre en Geist, mosaïque braise à droite).

**Régénération.** `bun docs/marque/outils/build-marque.mjs <racine>` (SVG et module TypeScript ; avec `opentype.js` il redessine le logotype depuis Geist, sans lui il relit les contours déjà générés), puis `bun docs/marque/outils/rasteriser.mjs <racine>` (PNG et ICO, via Playwright).

**Zone de protection.** Un vide d'au moins la largeur d'un montant du symbole (10 unités, soit 0,2 fois la hauteur du symbole) sur les quatre côtés ; en pied de page, le symbole repose sur la bande braise (c'est la seule exception). Aucun texte, bord de page ni image ne l'entame.

**Tailles minimales.** Symbole seul : 16 px (favicon). Logo complet : 20 px de hauteur à l'écran (110 px de largeur) ; en impression, 18 mm de largeur. En dessous, utiliser le symbole seul.

**Contrastes** (WCAG 2.2, calculés par `bun run check:contrast`). « AI » en orange `#FF7A45` sur noir `#0A0A0E` = 7,6:1 ; `#B53A0A` sur papier `#FBFBF8` = 5,7:1. Graphisme : orange signal `#FF5A1F` sur noir = 6,3:1 ; orange `#F04A10` sur papier = 3,6:1 (au-dessus des 3:1 exigés pour un graphisme).

**Usages interdits.**
- Changer l'orange, ajouter un dégradé, une ombre, un contour ou un effet de lueur au logo.
- Modifier la diagonale (nombre de carrés, sens), arrondir les carrés, pivoter ou incliner le symbole, le découper en pixels séparés.
- Recomposer le logotype dans une autre police, mettre « AI » dans une autre couleur que l'orange de texte du thème (ou l'ensemble en monochrome), écrire « Nexora Ai » ou « NEXORA AI ».
- Placer le logo en couleur sur une photo chargée, sur la mosaïque, sur de l'orange (utiliser la version blanche ou noire), ou à moins de 3:1 de contraste avec le fond.
- Utiliser le symbole comme puce, motif répété ou décor de fond (la seule exception : le grand symbole du pied de page).
- Accompagner le logo d'un robot, d'un cerveau lumineux ou d'une étincelle « IA » : la marque n'en a pas besoin.

## 3. Couleurs

**Une seule teinte d'accent : l'orange signal.** Une rampe chaude (la « braise ») sert uniquement de matière dans les mosaïques et la bande du pied de page, jamais à du texte. Jetons dans `web/src/app/globals.css`, contrastes recalculés par `bun run check:contrast` (29 paires).

| Rôle | Sombre (noir profond) | Clair (papier) | Crème (« sable » dans le CMS) |
|---|---|---|---|
| Fond | `#0A0A0E` | `#FBFBF8` | `#F3F2EC` |
| Surface | `#121218` | `#F3F2EC` | `#E4E2D9` |
| Texte | `#F5F4EF` (17,9:1) | `#121218` (18,0:1) | `#121218` |
| Texte secondaire | `#A8A8B6` (8,4:1) | `#54545F` (7,2:1) | `#54545F` (6,7:1) |
| Accent en texte | `#FF7A45` (7,6:1) | `#B53A0A` (5,7:1) | `#B53A0A` (5,2:1) |
| Bouton d'accent | fond `#FF5A1F`, texte noir `#0A0A0E` (6,3:1) ; survol `#FF7A45` (7,6:1) | idem | idem |
| Succès | `#4ADE9B` | `#17694A` | `#17694A` |
| Bande « nuit » | `#11112A` (texte 16,8:1) | | |

**Rampe braise** (mosaïques, du bord qui se dissout au cœur) : `#FFD37A` · `#FFB11A` · `#FF8A1F` · `#FF5A1F` · `#E0341C` · `#B01A3C`. **Autres rampes** (une par maquette de produit, voir §6) : ciel `#E1EEFF` à `#2A54C4`, or `#FFF3C4` à `#D98505`, menthe `#DEF7EA` à `#238D5F`, nuit `#1B1B2C` à `#565688`. Le texte ne se pose jamais directement sur une mosaïque : elle est repoussée vers un bord ou une colonne vide.

Le texte du bouton d'accent est **noir** (pas blanc) : sur un orange aussi vif, le blanc n'atteint que 3:1.

## 4. Typographies

Libres, servies localement (aucune requête externe) : **Geist** 500 pour les titres (interlignage serré, `text-wrap: balance`, interlettrage de -0,03 à -0,01 em selon la taille), **Inter** pour le texte, **JetBrains Mono** pour les libellés techniques (capitales, interlettrage +0,06 em) et le code. Le logotype n'utilise aucune police au chargement : il est en contours.

| Niveau | Taille (fluide) | Interligne | Interlettrage |
|---|---|---|---|
| Affiche (héros) | 44 à 96 px | 1,0 | -0,03 em |
| H1 | 40 à 68 px | 1,04 | -0,028 em |
| H2 | 32 à 56 px | 1,08 | -0,024 em |
| H3 | 22 à 32 px | 1,18 | -0,018 em |
| H4 | 18 px | 1,35 | -0,01 em |
| Chapeau | 18 à 21 px | 1,55 | 0 |
| Texte | 16 px | 1,6 | 0 |
| Libellé (mono) | 12 px | 1,4 | +0,06 em |

## 5. Espacement, rayons, ombres

- **Colonne** : 80 rem (1 280 px) au plus, gouttière fluide de 20 à 40 px ; chapeaux de lecture à 42 rem. **Rythme vertical** des sections : 64 à 120 px.
- **Rayons** : 2, 4, 6, 8 et 12 px. Boutons : 6 px. Cartes : 6 px (ou cellules de grille à angle franc). Rien n'est « pilule ».
- **Filets** : 1 px, `--line` (14 % de la couleur du texte). Les cartes sont séparées par des filets, pas par des ombres ; l'ombre n'est réservée qu'aux fenêtres de maquette et aux menus déroulants.
- **Cadrage** : chaque section est fermée par un filet horizontal et bordée de deux filets verticaux (les « rails », masqués sur téléphone) qui portent un petit carré à chaque angle supérieur. L'en-tête est découpé en cellules par des filets ; l'action principale est sa dernière cellule, pleine, en orange signal.

## 6. Matières, rythme et mouvement

- **Rythme des pages** : bandes sombre / clair / crème en alternance ; un héros sombre, un appel à l'action sombre en conclusion, puis un pied de page clair posé sur la bande braise. Une lueur d'accent très douce (radiale, 10 à 20 % d'orange) coiffe les bandes sombres et crème ; une bande qui en prolonge une autre de même ton n'en répète pas.
- **La mosaïque** (`web/src/components/brand/mosaic.tsx`) : un champ de carrés dont la teinte suit une rampe et qui **se dissout en pixels** vers un côté, comme une image qui se calcule. Déterministe (même graine, même rendu serveur et client), une couche SVG par teinte (quelques nœuds, aucun fichier image), décorative (`aria-hidden`). Héros : la mosaïque occupe la moitié droite et s'éteint vers le texte ; chaque héros a sa graine. Maquettes : un champ de teintes (une rampe par produit : braise pour WorkStudio et les agents, ciel pour les modèles et l'API, or pour les VPS, menthe pour le tableau de bord) sur lequel la fenêtre noire du produit est posée. Pastille de tuile : une petite mosaïque de 5 × 5.
- **Grille de mesure** (`tex-grid`) : filets tous les 4 rem qui s'effacent vers les bords, derrière les héros ; **règle graduée** (`ruler`) au bas des héros ; **bande braise** (`stripes`) de quatre barres en pied de page, qu'un carré traverse lentement.
- **Cartes** : grille à filets (les cartes sont des cellules séparées d'un pixel) pour les dispositions « grille » ; liste éditoriale, étapes (pixel orange sur un filet), modules ; **mosaïque de tuiles** (`bento`) avec une tuile noire mise en valeur et une pastille colorée par tuile.
- **Maquettes d'interface** : composants (`web/src/components/visuals/`), toujours en thème sombre comme l'interface produit, avec une légende qui dit « maquette illustrative, données d'exemple » ou « schéma de principe, pas une capture d'écran ». Aucun chiffre de performance, aucun client, aucune certification dans une maquette.
- **Mouvement** : CSS seulement, aucune bibliothèque. Transformations et opacité de décors uniquement (jamais d'opacité sur le texte du premier écran, pour ne pas retarder le LCP). Apparition au défilement par `animation-timeline: view()` (ignorée là où elle n'existe pas) ; les couches de la mosaïque respirent, une ligne de balayage traverse la grille du héros. Tout est déclaré sous `@media (prefers-reduced-motion: no-preference)` ; un test (`visuals.test.tsx`) échoue si une animation en sort.
- **Interdits de matière** : jamais de photo d'archive, jamais de robot ni de cerveau, jamais de faux client ni de logo de client sans accord écrit.

## 7. Composants disponibles pour les pages

Champ `visual` d'un bloc « section » (Directus, versionné dans `cms/scripts/lib/schema.ts`) : `perimetre-sur-place`, `perimetre-heberge`, `flux-donnees`, `flux-workstudio`, `catalogue-modeles`, `console-vps`, `tableau-de-bord`, `vision-sur-place`, `croissance-canaux`, `engagements-donnees`. Une section sans titre ni texte mais avec un visuel devient une bande « vitrine » centrée. Dispositions de cartes : `grille`, `liste`, `etapes`, `modules`, `bento`. Tons : `sombre`, `clair`, `sable`. La galerie de développement (`/galerie-marque`, active seulement avec `NEXORA_GALERIE_MARQUE=1`) montre tous les visuels, tons et dispositions.

## 8. Polissage visuel du 30 octobre 2026

Détail, mesures et décisions : `docs/recette/polissage-visuel-2026-10-30.md`. Ce qui s'ajoute à la charte :

- **En-tête de page** (`PageHero`, `web/src/components/ui/page-hero.tsx`) : bande sombre à mosaïque, une rampe par famille (ciel : modèles et API ; or : serveurs ; braise : le reste), fil d'Ariane, pastilles, h1, chapeau, actions et **bandeau de repères** (`StatStrip`). Utilisé par Nexora Apps, les fiches de modèles, le comparateur, les classements, les fiches VPS et le contact. Les pages du CMS gardent leur bloc « héros ».
- **Famille de produits** (`ProductFamily`, accueil, sous le héros) : un compte, huit outils, l'état de chacun écrit en toutes lettres (lu au registre de Nexora Apps).
- **Jetons** (`globals.css`) : rayons par rôle (`--radius-card`, `--radius-frame`, `--radius-chip`), durées de mouvement `--dur-fast/base/slow` (150, 200, 250 ms ; un test interdit les autres), espacement unique d'une carte (24 px, puis 32 px dès sm). L'anneau de focus d'une carte cliquable entoure toute la carte.
- **Mouvement** : des pixels de la mosaïque s'allument un à un (`mo-blink`), les barres de score se déploient à l'entrée dans l'écran ; tout sous `prefers-reduced-motion: no-preference` (un test vérifie que **toute** animation CSS y est).
- **Écrans de défaut** : `ErrorScreen` sert la 404, la 500 (`[lang]/error.tsx`) et « contenu indisponible » (503) ; les chiffres sont dessinés en carrés.

