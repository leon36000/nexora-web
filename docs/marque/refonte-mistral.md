# Refonte visuelle : ce que mistral.ai fait aujourd'hui, et ce que Nexora AI en retient

Version du 27 octobre 2026. Demande du fondateur : le visuel du site ne lui plaît pas ; il veut qu'il ressemble davantage à Mistral et qu'il « transpire l'avance technologique ». Ce document consigne l'étude de mistral.ai (relevés réels, pas des impressions), les principes retenus, et la manière dont chacun est traduit dans le système de Nexora AI. Les décisions de marque qui en découlent sont dans `charte.md`.

**Règle de lecture.** On s'inspire de principes (structure, rythme, matière, densité, ton visuel) ; on ne reproduit ni leurs marques, ni leur logo, ni leurs polices propriétaires, ni leurs illustrations, ni leurs textes. Aucune image de leur site n'est dans le dépôt : les captures d'étude sont hors dépôt, dans le dossier de travail de la session.

## 1. Méthode

- Navigateur réel (Chromium sans interface, Playwright), en 1440 × 900 et en 390 × 844, mouvement réduit, bandeau de témoins laissé tel quel (il masque une partie des captures : les mesures viennent du DOM, pas des pixels).
- Pages étudiées : accueil, Produits, Studio (la plateforme de construction), Vibe (l'assistant), Inférence (cloud), Tarifs, À propos, IA souveraine.
- Mesures : styles calculés (`getComputedStyle`) des titres, de la navigation, des boutons, des libellés mono ; couleurs de fond les plus fréquentes ; polices réellement chargées (`document.fonts`) ; animations actives (`document.getAnimations()`) ; décompte des canvas, vidéos, SVG et images.

## 2. Ce qu'on observe

### Typographie

| Rôle | Valeur observée |
|---|---|
| Titres | police propriétaire (grotesque géométrique), graisse 500 ; 56 px / 60 px pour le titre principal d'une section, 44 px / 52 px pour les suivants ; interlettrage de -0,01 em (-0,56 px à 56 px) |
| Navigation | même police, 16 px / 24 px, graisse 500, interlettrage +0,01 em |
| Corps | Inter variable (100 à 900), 16 px / 24 px, graisse 400, texte quasi noir bleuté (zinc-900, `oklch(0.21 0.006 286)`) |
| Libellés techniques | Space Mono 400 et 500, 14 px / 20 px, capitales, interlettrage +0,02 em (menu, dates, étiquettes de produit) |
| Boutons | Inter 16 px, 8 × 16 px de remplissage, **rayon de 6 px** |

À retenir : des titres **grands, en graisse moyenne, peu serrés**, jamais gras ; une mono discrète pour tout ce qui est « donnée » ; très peu de niveaux de taille.

### Couleur

- **Toile** : le site a **deux thèmes automatiques** (il suit le réglage du système ; un sélecteur système / clair / sombre est dans le pied de page). Clair : un blanc cassé chaud presque blanc (`rgb(251,251,248)`), plus un second crème un peu plus profond (`rgb(245,244,239)`) pour alterner, avec des bandes sombres pour le rythme. Sombre : `rgb(16,16,19)`, les mêmes filets, les mêmes blocs orange sur les bords du héros. L'audit du 26 octobre avait été fait en thème sombre ; celui du 27 octobre montre aussi le thème clair.
- **Noirs** : un noir profond bleuté (`oklch(0.141 0.005 286)`, soit zinc-950) pour les boutons et pieds de section ; un bleu nuit (`rgb(21,21,36)`) pour la grande bande « aller plus loin » et les dernières nouvelles.
- **Accent** : aucune couleur d'accent unique. Une **rampe chaude** (jaune `#FFAF01`, orange `#FF8204`, orange-rouge `#FF5229`, rouge `#E51300`, cramoisi `#C4001D`) sert d'identité ; chaque produit reçoit en plus un aplat de couleur propre (vert menthe, bleu ciel `#B9DAFF`, orange, jaune) sur lequel est posée une capture d'interface.
- **Dégradés** : aucun dégradé CSS (le décompte des `background-image` à dégradé est nul). Le « dégradé » est fait de **bandes franches** (quatre barres de couleurs de la rampe empilées) et de **mosaïques de carrés** de teintes voisines.

### Grille, marges, densité

- Colonne de contenu de **1 200 px** à 1 440 px (filets verticaux à 120 px et à 1 320 px), marges de 40 px à l'intérieur, **filets d'un pixel** partout : entre les sections, entre les cellules d'une grille, autour de la navigation. La page se lit comme un instrument cadré, pas comme des cartes qui flottent.
- Navigation de **48 px de haut**, découpée en cellules séparées par des filets ; le bouton de connexion est une dernière cellule noire, collée au bord de l'écran.
- Sections de 80 à 160 px de rythme vertical, hauteur du héros = 800 px ; des cellules de mur de logos (5 colonnes à filets) ; des rangées « texte à gauche / visuel à droite » qui alternent, dans un cadre à filets ; un menu latéral d'onglets pour passer d'un produit à l'autre.
- Cartes : **angles francs** (rayon 0) ou presque, bord d'un pixel, aucune ombre ; la hiérarchie vient de la taille des titres et des aplats, pas de l'élévation.
- Pied de page : trois colonnes à filets, grand symbole de la marque en pixels noirs posé sur une **bande de quatre barres** (ambre, orange, rouge, cramoisi) qui clôt toutes les pages.

### Matière, motifs, iconographie

- **Pixel art** comme langage : pictogrammes en pixels (drapeau, château, gemme, nuage, éclair) dans les titres de section et les cartes ; sprites animés (un chat, un drapeau) dans le héros et le pied de page ; le logo lui-même est un M en gros pixels.
- **Mosaïques** : les visuels de produit sont des champs de carrés de teintes proches (un hue par produit, du clair au saturé) sur lesquels un panneau d'interface blanc est posé, avec de fines lignes de circuit qui relient des pictogrammes.
- **Formes de héros** : carrés et losanges orange-rouge, blocs jaunes et oranges empilés sur les bords, sur la toile crème ; deux petits carrés noirs aux intersections des filets.
- **Textures** : fines lignes diagonales qui convergent sur la bande crème du manifeste ; une photographie topographique rouge pour la citation d'un client.
- **Photographie** : seulement pour les personnes (fondateurs) et les lieux (À propos).

### Mouvement

Très peu de CSS animé : une seule animation CSS native est active (une apparition de 500 ms), pas de canvas, pas de vidéo, 137 SVG et 114 images. Le mouvement vient des sprites et des survols. Le site **ne cherche pas l'effet** ; il cherche la précision et la densité.

### Ce qui donne l'impression d'avance technologique

1. Le **cadrage par filets** : tout est aligné, mesuré, découpé en cellules ; on dirait un tableau de bord, pas un dépliant.
2. Des **titres très grands et très calmes** : l'assurance de celui qui n'a pas besoin de crier.
3. Des **captures d'interface réelles** (terminal, traces, code, éditeur de flux) posées sur des aplats colorés : la preuve que le produit existe.
4. Une **matière numérique cohérente** (pixels, mosaïques, circuits) qui rappelle la machine sans recourir au cliché du robot ou du cerveau.
5. Une **mono** pour les données, qui dit « ceci est mesurable ».
6. Un **rythme** clair : héros, preuve, manifeste, quatre pas (modèles, outils, logiciel, hébergement), secteurs, ressources, pied de page.

## 3. Ce que Nexora AI retient, et ce qui la distingue

| Principe observé | Chez Nexora AI | En quoi c'est le nôtre |
|---|---|---|
| Toile claire, bandes sombres | Papier `#FBFBF8`, noirs profonds `#0A0A0E`, bleu nuit `#11112A` | Le héros reste noir (ton du CMS) : un laboratoire sombre, pas une copie du crème |
| Cadrage par filets d'un pixel | `rails` (deux filets verticaux avec nœuds carrés), filets de section, **grilles à cellules** pour les cartes, en-tête découpé en cellules | Même grammaire, mais avec des nœuds carrés aux angles (le « point de passage ») |
| Rampe chaude | « Braise » : ambre, orange signal, vermillon, cramoisi, framboise | Une seule couleur d'accent (l'orange signal `#FF5A1F`), la rampe ne sert qu'à la matière, jamais au texte |
| Mosaïques de carrés | `Mosaic` : champ de carrés qui **se dissout en pixels** vers un côté ; un hue par maquette de produit (braise, ciel, or, menthe) | Une image qui « se calcule » : la densité monte avec l'avancée, il reste des pixels éteints ; déterministe, générée, sans fichier image |
| Pixel art | Le logo est un **N en pixels** (deux montants, une diagonale orange : le point de passage) ; les pastilles de tuiles sont de petites mosaïques | Aucun sprite, aucune mascotte ; le pixel est une unité de construction, pas un personnage |
| Captures d'interface sur aplat | Maquettes restylées dans une `Stage` (fenêtre noire sur champ de carrés teinté) | Chaque maquette dit qu'elle en est une (« maquette illustrative ») |
| Angles francs | Rayons de 2 à 8 px ; boutons à 6 px ; aucune ombre sur les cartes | Identique dans l'esprit |
| Titres grands, graisse 500 | Geist 500, jusqu'à 96 px, interlettrage -0,03 em | Geist (libre) à la place de la police propriétaire |
| Mono pour les données | JetBrains Mono, capitales, avec un pixel orange devant l'étiquette d'accent | Même rôle |
| Bande de quatre barres + grand symbole en pied de page | **Bande braise** de quatre barres, le « N » posé dessus, un carré blanc la traverse (immobile si le mouvement est réduit) | Notre symbole, notre carré qui passe |
| Mur de logos clients | **Absent** : aucun client n'a autorisé sa mention (règle du brief) | On ne simule rien |
| Peu de mouvement | CSS seulement, opacité et transformation, sous `prefers-reduced-motion: no-preference` ; une ligne de balayage et des couches de mosaïque qui respirent | Même retenue ; un test interdit toute animation hors de cette condition |

## 4. Ce qu'on ne reprend pas

- Leur police propriétaire, leur logo et son M, leurs sprites (chat, drapeau, château), leurs illustrations, leurs textes, leur bandeau de témoins ambre.
- Leur dispersion de couleurs d'accent (jaune, rouge, bleu, vert au même niveau) : Nexora n'a qu'un accent.
- La photographie d'archive et les portraits (aucun faux visage, aucun faux client).

## 5. Traduction dans le code

- `web/src/app/globals.css` : jetons (toile, noirs, rampe braise, rayons de 2 à 8 px, échelle typographique plus grande), utilitaires `rails`, `tex-grid`, `ruler`, `stripes`, `wash-*`, et le mouvement.
- `web/src/components/brand/mosaic.tsx` : la matière signature (fonction pure `mosaicCells`, une couche SVG par teinte). `mosaic-backdrop.tsx` : décor des héros et bandeaux.
- `web/src/components/brand/logo.tsx`, `logo-geometry.ts` : le « N » en pixels ; outils dans `docs/marque/outils/`.
- `web/src/components/ui/*` : bouton (orange signal, texte encre, variante discrète), carte (cellule de grille à filets), section (filets et nœuds), badge (pixel orange).
- `web/src/components/layout/*` : en-tête en cellules, pied de page à bande braise.
- `web/src/components/blocks/*`, `visuals/*` : tous les blocs et toutes les maquettes.

Les noms des visuels (`visual`) et des dispositions (`layout`) du CMS n'ont pas changé : toute page existante ou à venir s'affiche avec la nouvelle direction.
