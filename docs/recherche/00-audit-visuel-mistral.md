# Audit visuel de mistral.ai (navigateur réel, mis à jour le 27 octobre 2026)

Pages examinées : accueil, Produits, Studio, Vibe, Inférence, Tarifs, À propos, IA souveraine, en 1440 × 900 et en 390 × 844, thèmes clair et sombre. Valeurs relevées dans le DOM (styles calculés), pas déduites de captures. **L'analyse détaillée, les mesures et la traduction dans le système de Nexora AI sont dans `docs/marque/refonte-mistral.md`** ; ce fichier en garde l'essentiel.

## Ce qui a changé depuis l'audit du 26 octobre
- Le 26 octobre, seul le thème sombre avait été relevé. Le site suit en réalité le thème du système : **clair** (blanc cassé `rgb(251,251,248)`, texte `oklch(0.21 0.006 286)`) ou **sombre** (`rgb(16,16,19)`). Les deux partagent les mêmes filets d'un pixel, les mêmes blocs orange et jaune sur les bords du héros, la même navigation à cellules.
- Les pages produits ont été refaites autour de **mosaïques de carrés teintés** (un hue par produit : vert menthe, bleu ciel, orange, jaune) sur lesquelles est posée une capture d'interface ; le produit « assistant » s'appelle désormais Vibe, la plateforme Studio ; une page de tarifs détaillée (quatre offres, tableau comparatif) et une page IA souveraine en quatre couches ont été ajoutées.
- Pied de page : trois colonnes à filets, grand symbole en pixels noirs posé sur une **bande de quatre barres** (ambre, orange, rouge, cramoisi), sélecteur de thème et de langue.

## Système visuel observé (résumé)
- **Titres** : police propriétaire (grotesque géométrique), graisse 500, 56/60 px et 44/52 px, interlettrage -0,01 em. **Corps** : Inter 16/24. **Libellés** : Space Mono 14/20, capitales, +0,02 em.
- **Grille** : colonne de 1 200 px à 1 440 px, filets verticaux et horizontaux d'un pixel, marges de 40 px, navigation de 48 px à cellules, cartes à angles francs, boutons à 6 px de rayon.
- **Palette** : toile claire ou noire, rampe chaude jaune `#FFAF01` · orange `#FF8204` · orange-rouge `#FF5229` · rouge `#E51300` · cramoisi `#C4001D`, bleu ciel `#B9DAFF` ; **aucun dégradé CSS**, des barres franches et des mosaïques.
- **Matière** : pixel art (pictogrammes, sprites, logo), mosaïques, lignes de circuit, lignes diagonales fines ; photographie réservée aux personnes et aux lieux.
- **Mouvement** : une seule animation CSS native active (apparition de 500 ms), aucun canvas, aucune vidéo ; 137 SVG, 114 images.
- **Rythme** : héros à slogan court, mur de logos clients à filets, manifeste, quatre pas (modèles · outils · logiciel · hébergement) en alternance texte/visuel, secteurs, ressources en bande sombre, pied de page dense.
- **Ton** : phrases très courtes, binaires, à la deuxième personne ; la souveraineté est l'axe central.

## Ce que Nexora reprend (principes, pas actifs)
- Fond clair ou noir profond, contraste fort, titres grands en graisse 500, Inter pour le texte, une mono pour les libellés techniques.
- Cadrage par filets d'un pixel, navigation à cellules, grilles de cartes à filets, angles francs.
- Une matière de carrés (mosaïque) et un symbole en pixels ; une bande de quatre barres en pied de page.
- Slogans courts et binaires, manifeste de souveraineté, alternance texte / visuel produit, captures d'interface (ici : maquettes étiquetées comme telles).
- Navigation courte, CTA « Planifier un diagnostic » + « Connexion ».

## Ce que Nexora ne reprend pas
- Ni leur police propriétaire, ni leur pixel art (chat, drapeau, château), ni leurs logos, ni leurs textes. Identité Nexora propre : un « N » en pixels à diagonale orange, une seule couleur d'accent, une mosaïque qui se dissout.
- Pas de mur de logos clients tant qu'aucun client n'a autorisé sa mention (règle du brief : aucun faux client).
