# Charte de marque — identité « Signal »

Version du 2 novembre 2026, thème clair d'abord (3 novembre). Remplace la direction « Instrument » du 27 octobre (mosaïque de pixels orange, logo « N » en pixels, rampe « braise »), retirée du site public parce qu'elle faisait trop penser à Mistral. Mandat : `marketing/nexora/REFONTE-2026-11.md` (dépôt Nexora Creative). Journal de la refonte : `docs/refonte-signal.md`.

**Idée.** Une lumière précise dans le noir. L'univers d'un instrument de mesure et d'un centre de données : ce que l'IA voit, entend et calcule, montré en fines lignes de lumière, nuages de points, formes d'onde et cadres de détection. Cinématographique, silencieux, à grande échelle.

## 1. La marque se change à UN endroit

Le nom et le logo vont changer. Tout ce qui nomme ou dessine la marque est centralisé :

| Quoi | Où |
|---|---|
| Nom complet, logotype (partie principale + suffixe), signature, type de logo | `web/src/lib/brand.ts` (`BRAND`) ; `SITE_NAME` (`web/src/lib/site.ts`) en dérive |
| Couleurs | jetons de `web/src/app/globals.css` (`@theme`, section « Marque ») |
| Polices | `web/src/app/fonts.ts` (fichiers dans `web/src/fonts/`) |
| Logo dessiné (quand il existera) | SVG dans `web/public/marque/`, puis `BRAND.logo = { kind: "svg", dark, light, ratio }` |
| Favicon | `web/src/app/icon.svg` |
| Image Open Graph | `web/src/app/og/[lang]/[[...slug]]/route.tsx` (lit `BRAND` et la géométrie de la marque) |

Changer de nom : modifier `BRAND`, puis chercher l'ancien nom dans les dictionnaires (`web/src/i18n/dictionaries/`) et dans Directus (pages, réglages du site). Les noms de produits (Nexora Creative, WorkStudio…) et les identifiants techniques (`@nexora/*`, `NEXORA_*`) ne dépendent pas de la marque d'entreprise.

## 2. Le logo provisoire (typographique)

`Logo` / `LogoMark` (`web/src/components/brand/logo.tsx`) :

- **La marque « signal »** (grille de 32 unités, géométrie exportée `SIGNAL_MARK`) : deux crochets d'angle (haut-gauche, bas-droite), le cadre de détection ; une ligne de balayage horizontale ; un point de lumière ion, avec un halo à 18 %. Aucun pixel, aucun « N ».
- **Le nom** : `BRAND.wordmark.base` en Geist 600, interlettrage -0,035 em ; le suffixe (« AI ») en JetBrains Mono 500, ion, pour qu'on ne lise jamais « Al ».
- Tons : `dark` (givre #EEF3FA, ion #3EC8FF), `light` (graphite #0B0F16, ion foncé #0B6E99, 5,3:1), `auto` (couleur du texte et accent du thème).
- Décoratif par défaut ; `label` en fait une image nommée. Taille minimale : 20 px de haut.

Les anciens fichiers du logo « N » (`docs/marque/logos/`) sont des archives : ils ne sont plus utilisés par le site.

## 3. Couleurs

**Clair d'abord, sombre en contrepoint (décision du fondateur, 3 novembre 2026).** Le site public est fait de bandes « papier » aérées ; quatre moments sombres donnent le rythme : le héros vidéo de l'accueil, les vitrines vidéo et cartes « vitrine », l'appel à l'action final et le pied de page. Une lumière principale (ion), un contrepoint chaud rare (flare). Le ton `sombre` du CMS ne rend une bande sombre que pour une vitrine (héros plein écran, section à vidéo, cartes `vitrine`, appel à l'action) ; ailleurs il devient une bande claire (`effectiveTone`, `web/src/components/blocks/tone.ts`). `clair` = papier ; `sable` = bande blanche relevée.

| Rôle | Jeton | Valeur | Contraste |
|---|---|---|---|
| Fond « abysse » (héros, appels à l'action) | `abyss-950` | `#05070B` | — |
| Bande « nuit » (fond courant des sections) | `abyss-850` | `#080B11` | — |
| Surface / surface relevée | `abyss-900` / `abyss-800` | `#0B0F16` / `#111723` | — |
| Filets | `hairline`, `--line` | `#1C2433`, brume à 16 % | décoratif |
| Filet fort, bordure de bouton | `steel` | `#5B6678` | 3,5:1 |
| Texte | `frost` | `#EEF3FA` | 18,1:1 |
| Texte secondaire | `haze` | `#8C97AA` | 6,8:1 (6,1:1 sur surface relevée) |
| **Accent ion** : liens, focus, bouton principal, graphismes, lueur | `ion-400` | `#3EC8FF` | 10,5:1 ; bouton : texte abysse 10,5:1 |
| Survol du bouton | `ion-300` | `#7BD9FF` | 12,7:1 |
| **Flare** : un seul point de chaleur par écran (CTA final, alerte, point « en direct ») | `flare-500` | `#FF6A2B` | 7,1:1 ; bouton : texte abysse 7,1:1 |
| Alerte / succès | `alert-400` / `ok-400` | `#FF4D5E` / `#3FE0A5` | 6,2:1 / 11,9:1 |

**Thème papier** (`.theme-light`, fond courant du site public, espace client) : fond `#F7F9FC`, cartes et bande relevée `#FFFFFF`, surface relevée `#EDF1F7`, filets `#E3E8F0`, texte `#0B1220`, secondaire `#5B6678` (5,5:1), accent texte ion foncé `#0B6E99` (5,3:1), graphisme `#0A8BC2` (3,6:1), **bouton principal ion foncé `#0B6E99` + texte blanc** (5,3:1 ; survol `#095B80`), flare réservé au bouton final et aux alertes. Matières sur papier : grilles et halos en ion doux (`--grid-a/b`), nuage de points `#0A8BC2` et balayage qui fonce au lieu de blanchir (`--field-rgb`, `--scan-rgb`, lus par `LightField` et `.scanline`) ; en bande sombre, elles gardent la lumière ion vive. L'en-tête, le sommaire collant et les menus sont papier (opaques : un fond translucide sur l'abysse du document tombait sous 4,5:1).

Thèmes sémantiques : `.theme-dark` (abysse), `.theme-night` (nuit, plus utilisé par les sections), `.theme-light` (papier, défaut des sections publiques). Les composants n'utilisent que les jetons sémantiques (`bg`, `surface`, `fg`, `accent`, `flare`…). Contrôle : `bun run --cwd web check:contrast` (50 paires).

## 4. Typographies

Libres, servies localement : **Geist** (titres, très grands et serrés), **Inter** (texte), **JetBrains Mono** (libellés techniques en capitales, interlettrage +0,08 em ; utilitaire `label-mono`).

| Niveau | Taille (fluide) | Interligne | Interlettrage |
|---|---|---|---|
| Méga (héros plein écran) | 52 à 144 px | 0,90 | -0,052 em |
| Affiche (héros) | 44 à 108 px | 0,95 | -0,045 em |
| H1 | 40 à 80 px | 1,0 | -0,04 em |
| H2 | 32 à 64 px | 1,02 | -0,036 em |
| H3 | 22 à 30 px | 1,15 | -0,022 em |
| Chapeau | 18 à 22 px | 1,55 | 0 |
| Texte | 16 px | 1,6 | 0 |
| Libellé (mono) | 12 px | 1,4 | +0,08 em |

## 5. Matières « Signal » (en code, jamais en image)

Composants dans `web/src/components/signal/`, tous décoratifs (`aria-hidden`), déterministes et figés sous `prefers-reduced-motion`.

1. **Ligne de balayage** (`.scanline`) : un filet de lumière horizontal qui traverse un bloc quand il entre dans l'écran (`<Section scan>`, animation pilotée par le défilement) ou en boucle lente dans les héros (`.scan-loop`).
2. **Champ de lumière** (`LightField`, `<canvas>`) : un nuage de points en perspective, comme un relevé lidar, qu'une bande de balayage parcourt ; un seul point flare facultatif. Démarre au repos (jamais avant le premier affichage), s'arrête hors écran, 30 images/s au plus. Relief partagé avec l'image Open Graph (`terrain.ts`).
3. **Forme d'onde** (`Waveform`) : barres fines symétriques (voix, réception).
4. **Cadres de détection** (`DetectionBox`, utilitaire `detect`) : crochets aux angles, libellé mono ; `hot` = flare (alerte).
5. **Grilles de précision** (`grid-precision`, `tex-grid`) : filets d'un pixel tous les 24 et 96 px, effacés vers les bords ; règle graduée (`ruler`).

`SignalBackdrop` assemble ces matières pour les héros (`champ`, `onde`, `detection`, `grille`) ; `MediaPlaceholder` les pose dans un emplacement d'image tant que le fichier n'existe pas (jamais d'image cassée) ; `SignalGlyph` remplace les pastilles de mosaïque.

**Surfaces** : rayons de 2 à 10 px ; verre (`glass`) à filet d'un pixel ; aucune ombre décorative (seulement menus et fenêtres flottantes) ; lueur retenue (`glow-ion`) seulement sur l'accent ion.

## 6. Mouvement

Apparition au défilement (opacité + 16 px), balayage, ondes qui « parlent », cadres qui se posent, point « en direct » qui pulse, vidéos en boucle silencieuses. Tout est déclaré sous `@media (prefers-reduced-motion: no-preference)` (test `design-tokens.test.ts`). Le bouton **« Mettre les animations en pause »** (héros et pied de page, WCAG 2.2.2) fige toutes les boucles (`data-motion="pause"` sur `<html>`, mémorisé pour la visite) : vidéo, champ de lumière, ondes, balayages. Durées des transitions d'interface : 150, 200 ou 250 ms.

## 7. Médias (images et vidéos)

- Images générées (Qwen-Image) et vidéos (MiniMax H3) : sans texte ni logo incrusté, palette « Signal » (sombre, lumière ion, un rare point chaud). Le texte est toujours posé en code.
- **Emplacements stables** : les pages citent des noms fixes (`site-hero-boucle.mp4`, `site-infra-dgx-spark.jpg`…) ; `cms/scripts/medias-site.sh` prépare les fichiers web et `load-content.ts --medias=<dossier>` les téléverse dans Directus. Voir `docs/refonte-signal.md` §4.
- **Interdits** : la mosaïque de pixels, les cascades de carrés orange, la rampe « braise » comme texture ; robots, cerveaux lumineux, étincelles « IA », dégradés violets, photos d'archive ; tout plan qui rappelle une franchise connue (personnages, sabres lumineux, vaisseaux reconnaissables) ou une marque.

## 8. Composants disponibles pour les pages (Directus)

- **Héros** : `layout` = `standard` (titre sur la matière) ou `plein-ecran` (boucle vidéo silencieuse + affiche, titre méga) ; `signature` = `champ`, `onde`, `detection`, `infra`, `grille`, `aucun` ; `video` (boucle) ; `media` (image ou affiche).
- **Section** : `visual` (schémas et maquettes, dont `signal-accueil`, `signal-surveillance`, `signal-infrastructure`) ; `media` image ou vidéo ; `poster` (affiche de la façade vidéo) ; `media_lang` (vidéo propre à la langue, ex. film de marque fr/en). Une vidéo placée « au-dessus » devient une vitrine plein cadre après le titre.
- **Cartes** : dispositions `grille`, `liste`, `etapes`, `modules`, `bento` et **`vitrine`** (grandes cartes à image au rapport stable ; champ de carte `image` = identifiant de fichier, `visual` = matière tant que l'image manque).
- Tons : `sombre` (abysse), `clair` (nuit), `sable` (surface relevée). L'appel à l'action final porte le bouton flare.
