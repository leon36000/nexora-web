# Polissage visuel du site public — 30/10/2026

Chantier E1 (visuel seulement : `web/src/components/**`, `web/src/app/**`, jetons, SVG, mouvement). Les textes du CMS (`cms/content/**`) et `docs/marketing/**` ne sont pas touchés (chantier E2). Les captures sont hors dépôt, dans `~/Desktop/NexoraSite-wt/captures-polissage/` (`avant/`, `apres/`).

## 1. Audit visuel (avant)

Méthode : `web/scripts/capture-polissage.mjs`, pleine page à 1 440, 1 024 et 375 px, mouvement réduit, 20 pages ; le script mesure aussi le débordement horizontal et les cibles tactiles de moins de 44 px. Données : catalogue de modèles et VPS de développement dans une base jetable ; Directus de développement en lecture seule.

| Page | Ce qui était faible |
|---|---|
| Accueil | Héros fort mais isolé : rien ne dit « un compte, tous les outils » ; la mosaïque ne bouge que par respiration d'opacité (monotone) ; la liste « Une suite, pas une pile » est un long texte sans repère visuel d'état. |
| Solutions, WorkStudio, Suite, FAQ (CMS) | Héros solides ; rythme correct. Les cartes « bento » et « grille » n'avaient pas le même espacement interne (28 px et 32 px) et des rayons posés à la main. |
| Nexora Apps (liste) | En-tête blanc, sans matière : la page la plus « produit » du site n'avait ni mosaïque ni repère d'état au premier écran ; légende des états en simple texte ; cartes sans identité visuelle. |
| Nexora Apps (fiches) | Même défaut : un titre sur fond clair, aucun repère (état, accès) au premier écran ; l'information clé était enfouie dans le texte. |
| Modèles (liste) | Titre en h2, sans bande d'en-tête ; chargement : un vide de 640 px ; état « aucun résultat » en simple encadré ; cartes sans repère visuel (36 cartes identiques). |
| Modèles (fiche) | En-tête clair et dense : puces de contexte et de prix petites, difficiles à comparer d'un coup d'œil ; barres de benchmark minces, sans graduation ; fil d'Ariane à 32 px de haut. |
| Comparateur | Sans sélection, une page presque vide (un cadre et un lien) ; aucun repère. |
| Classements | Tables correctes, barres sans graduation, rang en chiffres simples ; deux épreuves dont le nom ne diffère que par la ponctuation (« MMLU Pro », « MMLU-Pro ») partageaient la même ancre (identifiant en double, avertissement axe `landmark-unique`). |
| Documentation de l'API | Déjà riche (maquette sur fond de mosaïque) ; laissée telle quelle. |
| Contact | Titre et formulaire sur fond clair, sans bande d'en-tête (incohérent avec le reste). |
| VPS (liste) | Bonne ; non modifiée. |
| VPS (fiche) | En-tête clair, sans matière. |
| 404 | Correcte, mais c'était la seule page d'erreur : pas d'écran pour une erreur d'exécution (500), et l'écran « contenu indisponible » avait une autre mise en page. |
| Pied de page | Quatre colonnes de liens à 32 px de haut ; aucun accès direct à « Mes outils » ni à « Tarifs » hors des colonnes. |
| Mobile (375 px) | Aucun défilement horizontal nulle part. Mais 28 cibles de moins de 44 px sur chaque page (liens du pied de page, fil d'Ariane, lien « Page de l'éditeur »). |

## 2. Ce qui a été fait

1. **Accueil** : bande `ProductFamily` sous le héros (« Un compte, tous vos outils ») : le compte (le « N » en pixels) relié par un filet orange qui avance à huit outils (WorkStudio, Code, RAG, Bot, Creative, WebPilot, Privacy Router, VPS), chacun avec son état écrit (lu au registre de Nexora Apps ; WorkStudio « disponible » suit l'affirmation CL-P01, les VPS « bientôt » suivent le site). Mouvement : des pixels de la mosaïque s'allument un à un (`mosaicBlinks`, testé : déterministe, décalé, aucun battement synchrone).
2. **Système unifié** : jetons de rôle (`--radius-card/frame/chip`), durées 150/200/250 ms (`--dur-*`), un seul espacement de carte (24 px, 32 px dès sm), ombre de survol `--shadow-lift`, anneau de focus qui entoure toute la carte cliquable. Composants `PageHero`, `Breadcrumb`, `StatStrip`, `Skeleton`.
3. **Nexora Apps et modèles** : `PageHero` sur Nexora Apps (liste et fiches, une rampe par famille d'outil), fiches de modèles (bandeau contexte / entrée / sortie en grandes valeurs), comparateur, classements, contact, fiches VPS. Cartes de la liste Nexora Apps et du catalogue : pastille de mosaïque. Barres de score à quatre graduations qui se déploient à l'entrée dans l'écran. Rang en mono (`01`), le premier en orange. Squelette de chargement et état vide à mosaïque. Ancres de classement uniques (correctif, test RED→GREEN).
4. **Micro-interactions** : survol des cartes (200 ms, ombre et −2 px, sauf mouvement réduit), enfoncement des boutons (`active`), anneau de focus de carte. Tout mouvement sous `prefers-reduced-motion: no-preference`.
5. **Mobile** : liens du pied de page, fil d'Ariane et liens d'action à 44 px de haut (et de large) sous `md` ; menu mobile : 0 cible sous 44 px.
6. **Pied de page et navigation** : rangée « Accès rapide » (Mes outils, Tarifs, diagnostic) au-dessus des colonnes ; l'entrée de session connectée du menu devient « Mes outils » (le panneau du compte porte ce nom ; l'en-tête avait « Mon compte »).
7. **Écrans de défaut** : `ErrorScreen` unique pour la 404, la 500 (nouvelle `[lang]/error.tsx`, avec « Réessayer ») et « contenu indisponible » (503) ; chiffres 404, 500 et 503 dessinés en carrés. L'écran 500 complet est chargé à la demande (`lazy`), un texte simple et « Réessayer » tiennent lieu d'écran en attendant.

## 3. Mesures

### Accessibilité, mise en page, SEO, liens (build de production, `SITE_ENV=production`)

| Contrôle | Résultat |
|---|---|
| axe (WCAG 2.0 à 2.2 AA + bonnes pratiques), 28 chemins × 390 et 1 440 px (accueil, solutions, WorkStudio, Suite, Apps et 3 fiches, modèles, fiche, comparateur avec et sans sélection, classements, docs API, FAQ, contact, VPS, fiche VPS, tarifs, agents, 404, versions en-CA) | **0 violation** sur 56 chargements, 0 erreur JavaScript, 0 défilement horizontal |
| Menu mobile ouvert | 0 violation, 0 cible sous 44 px |
| Cibles tactiles à 375 px (cases et boutons radio mesurés par leur libellé) | 28 sous 44 px par page avant, 1 après (le lien d'évitement, caché hors focus) |
| `check:contrast` | 29 paires conformes (inchangé) |
| `web/scripts/check-seo.ts` (252 adresses du sitemap fr et en) | 0 erreur, 58 avertissements (descriptions de plus de 160 caractères dans le CMS, et `TechArticle` : tous antérieurs, hors périmètre) |
| Liens (lychee, pages du sitemap, 2 095 liens uniques, externes compris) | 2 liens cassés : `huggingface.co/…/DeepSeek-V4.1-Flash-1017/tree/main/LICENSE` (404), donnée du catalogue de modèles, pas du visuel |
| `verify-ui.mjs` | 42/44, **identique à `main`** : les 2 échecs (« Menu mobile : navigation complète », « entrées Produits ») viennent de la navigation Directus (« Ressources » absent, « Nexora Apps » en plus) et préexistent |
| `bun run check` | vert : lint (106 avertissements, comme `main`), types, 2 379 tests web, 197 worker, 241 vps (4 ignorés), 145 webpilot, 100 db, 69 rag, 54 net, 54 privacy, 21 seo, 9 log |

### Performance de l'accueil (médiane de 5 passes, Chromium, cache vide, octets transférés avec en-têtes)

| | `main` | cette branche | écart |
|---|---|---|---|
| Total | 359,1 Ko (15 requêtes) | 366,0 Ko (16 requêtes) | +6,9 Ko (+1,9 %) |
| JavaScript | 171,8 Ko | 173,4 Ko | +1,6 Ko (+0,9 %) |
| CSS | 12,7 Ko | 13,3 Ko | +0,6 Ko |
| HTML | 56,2 Ko | 60,9 Ko | +4,7 Ko (la bande « famille » et ses huit pastilles, présentes deux fois : HTML et données de flux) |
| Polices, images | 117,5 Ko, 0 Ko | identiques | 0 |

Autres pages : `/modeles` 332,8 → 345,6 Ko (JS 163,7 → 165,3) ; `/apps/code` 326,1 → 325,2 Ko. Aucune bibliothèque ajoutée. Une première version chargeait l'écran 500 complet dans chaque page (+3,3 Ko de JavaScript) : il est maintenant à la demande.

## 4. Décisions

- **Ruling : une seule bande d'en-tête (`PageHero`) pour les pages de l'application, les héros du CMS inchangés** — les pages du CMS ont déjà leur héros ; l'application n'en avait pas — coût si faux : une page de plus à remettre en bande claire (un composant à retirer).
- **Ruling : le bandeau de repères des fiches de modèles remplace les trois puces de prix et de contexte** — trois grandes valeurs se comparent d'un coup d'œil ; les textes sont les mêmes qu'avant (libellés du dictionnaire) — coût si faux : le test de fiche a été adapté (il cherchait « Entrée 0,30 $ » d'un seul tenant).
- **Ruling : « Mes outils » remplace « Mon compte » dans l'en-tête connecté** — le panneau s'appelle « Mes outils » partout ailleurs — coût si faux : une ligne de dictionnaire (`nav.accountLabel`).
- **Ruling : écran 500 chargé à la demande (`lazy`, pas `next/dynamic`)** — `next/dynamic` fait précharger le morceau sur chaque page — coût si faux : si le réseau est la cause de l'erreur, le texte simple de repli s'affiche au lieu de l'écran illustré.
- **Ruling : +1,9 % de poids transféré sur l'accueil accepté** — l'écart est le contenu ajouté (la bande « famille »), aucune bibliothèque, JavaScript +0,9 % — coût si faux : retirer la bande ou ses pastilles de mosaïque (−4 Ko de HTML).
- **Ruling : les durées de mouvement du panneau du compte (`duration-500` de la barre d'un VPS) sont hors du test des durées** — le panneau vient d'être fait et n'est pas dans le périmètre — coût si faux : une ligne à changer dans `vps-parts.tsx`.

## 5. Ce qui n'est PAS fait ou PAS vérifié

- Les pages de `/compte/**` et `/tarifs` ne sont pas retouchées (seuls les jetons et composants partagés les touchent : cartes, boutons, focus). Leur rendu n'a pas été comparé avant/après image par image ; axe passe sur `/tarifs`, pas sur les pages du compte (session requise).
- Aucun test de survol ni de focus par capture : vérifiés au code (classes) et par les tests de jetons, pas à l'œil.
- L'écran 500 a été vérifié dans un navigateur sur le serveur de développement, avec une page temporaire (supprimée) qui lève une erreur ; pas sur le build de production.
- Lighthouse n'a pas été relancé ; la mesure de poids est celle de la section 3.
- Quatre builds ont été faits (au lieu d'un) : un premier de la branche (qui a révélé les 3,3 Ko de l'écran 500), un de `main` pour mesurer à armes égales, puis deux de la branche après correction ; chaque `.next` (≈ 0,4 Go) a été supprimé.
- Textes à adapter par E2 : voir le compte rendu du chantier.
- `bun run check` : vert à la première passe (exit 0). Deux relances en parallèle complet ont échoué sur des tests à base de données (`PostgresError: out of shared memory`) parce que PostgreSQL de développement, partagé avec d'autres sessions, manquait de verrous (`max_locks_per_transaction` = 64) ; les mêmes tests passent avec `vitest --maxWorkers=3` (web 2 379/2 379, worker 197/197). Aucun code touché ne lit la base. 13 bases `nexora_test_*` laissées par d'autres sessions (créées entre 08 h 01 et 08 h 30) sont intactes ; les 32 que mes relances ont laissées ont été supprimées.
