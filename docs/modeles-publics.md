# Pages publiques de modèles (`/modeles`)

Refonte sur le modèle d'OpenRouter (liste filtrable, fiche détaillée, comparateur, classements). Rendu serveur, sans JavaScript obligatoire, fr-CA et en-CA par `web/src/i18n/dictionaries/models-*-CA.ts` (jamais de texte en dur). Aucune donnée n'est écrite dans le code : tout vient de `PublicModel.sheet` ; un champ absent reste absent.

## Pages

| Adresse | Rôle | Indexation |
|---|---|---|
| `/modeles` | Liste : recherche, filtres, tri, vue cartes ou tableau, raccourcis par catégorie, sélection à comparer | indexable ; toutes les variantes de filtre ont l'adresse canonique `/modeles` |
| `/modeles/<id>` | Fiche : aperçu, tarifs, benchmarks, similaires, API | indexable ; `Product` + `BreadcrumbList` |
| `/modeles/comparer?m=…&m=…` | 2 à 4 modèles côte à côte | `noindex` (dépend de l'adresse) |
| `/modeles/benchmarks` | Une table par épreuve publiée pour au moins 3 modèles | indexable, dans le sitemap et `llms.txt` |

## Paramètres d'adresse de la liste

`q` (recherche), `type` (`chat`, `embedding`), `entree` (modalités d'entrée, toutes requises), `etiquette` (catégories, toutes requises), `capacite` (`tools`, `reasoning`, `vision`, `json_mode`), `editeur` (segment sans accent), `licence` (`ouverte`, `fermee`), `disponibilite` (`disponible`, `apercu`), `hebergement` (proposé seulement s'il y a plusieurs lieux), `contexte` (minimum : 32 000, 128 000, 256 000, 1 000 000), `prix-entree` et `prix-sortie` (maximum : 0,10 / 0,50 / 1 / 2 / 5 / 10 $ CAD), `tri` (`recents`, `prix-entree`, `prix-entree-desc`, `prix-sortie`, `prix-sortie-desc`, `contexte`, `nom`), `vue` (`cartes`, `tableau`), `m` (modèles à comparer, 4 au plus). Une valeur inconnue est ignorée. Logique pure et testée : `web/src/lib/models/query.ts`.

## Honnêteté des données

- Un modèle dont la fiche ne dit rien d'un critère (licence, modalités, étiquettes) n'est pas retenu par ce critère.
- Benchmarks : chaque mesure garde son éditeur et sa source ; un avertissement de non-comparabilité accompagne chaque tableau ; une barre n'est tracée que pour un pourcentage ; un « meilleur résultat » n'est signalé que si l'éditeur et l'unité sont les mêmes pour tous les modèles de la ligne ; les durées et coûts (ms, s, $) ne sont pas classés. Aucune donnée d'usage (« populaire ») n'est affichée.
- Un modèle en aperçu affiche « Bientôt disponible », aucun exemple d'appel (il échouerait) et « Me prévenir » vers `/contact?sujet=modele-apercu&modele=<id>`.

## Décisions provisoires, modifiables par le fondateur

- Canonical unique `/modeles` pour toutes les variantes de filtre (métadonnées statiques, pas de page de catégorie indexée séparément).
- Aucune offre `Product` pour un modèle en aperçu (rien à acheter encore) ni pour un prix de développement.
- Pas d'`ItemList` JSON-LD sur la liste (type inconnu du contrôle `@nexora/seo`) : seulement le fil d'Ariane.
- Un plafond de prix de sortie exclut les modèles d'embeddings (pas de prix de sortie).
- Paliers de contexte et de prix : constantes de `query.ts`.
- Le filtre d'hébergement n'apparaît que si le catalogue compte plusieurs lieux (aujourd'hui un seul hébergeur).
- Le contexte est affiché arrondi vers le bas (« 32 k » pour 32 768) sur les cartes, exact sur la fiche.
