# Catalogue DeepInfra de Nexora AI : chargement et mode « aperçu »

Décision du fondateur (29/10/2026) : **DeepInfra héberge tous les modèles** de Nexora AI. On veut une vitrine publique (liste, fiches, prix, mesures sourcées) **avant** que la clé de DeepInfra soit dans le Coffre. Deux pièces y répondent : la disponibilité « aperçu » d'un modèle, et un chargement du catalogue piloté par des données.

## 1. Aperçu : visible, pas encore appelable

Colonne `models.availability` (`live` par défaut, ou `preview`), migration additive `0026_apercu_modeles`. La valeur voyage jusqu'à la version publiée du catalogue (`SnapshotModel.availability`, écrite **seulement** pour un aperçu : la version d'un modèle appelable reste identique à celles d'avant) et jusqu'à la fiche publique (`PublicModel.availability`).

| Un modèle `preview` | Comportement |
|---|---|
| Garde de publication (`guardSnapshot`) | Ni `secret_missing` ni `route_secret_missing` : la clé du fournisseur et celles des routes ne sont pas exigées. Restent exigés : taux de change approuvé, prix valide (jamais 0 $, plancher de marge), fournisseur actif (`provider_disabled` bloque). |
| Catalogue public (`/modeles`) | Listé avec sa fiche et ses prix (`availability: "preview"` pour que les pages puissent l'annoncer). |
| `GET /v1/models` | **Absent**, avec ou sans clé, même pour une clé qui le nomme dans ses modèles autorisés. |
| Synchronisation LiteLLM | **Sauté** : aucun crédential, aucun déploiement, aucune lecture de secret. Un déploiement déjà poussé disparaît au passage suivant. |
| Appel d'inférence (`/v1/chat/completions`, `/v1/embeddings`) | 404 au format OpenAI : code `model_not_available`, message « Ce modèle est en aperçu : il n'est pas encore disponible à l'appel. », `param: "model"`. Refus **avant** la confidentialité, l'estimation, la réservation et tout appel amont : rien n'est réservé, débité ni journalisé en usage. Un modèle inconnu reste `model_not_found`. |

### Passer en service

`PATCH /api/admin/catalog/models/{id}` avec `{"availability":"live"}` applique la **garde complète** (clé du fournisseur et des routes dans le Coffre comprises) : sans clé, 422 `publication_refused` avec `secret_missing`, et le modèle reste en aperçu. Si elle passe, il faut **publier une nouvelle version du catalogue** (la mention d'aperçu disparaît de l'instantané) : l'écran « Passer en service » du module Modèles enchaîne les deux, puis la synchronisation LiteLLM facultative. Même sans passer par l'écran, une version qui contiendrait un modèle « live » sans clé est refusée à l'approbation.

Pas à pas côté opérateur : `docs/guide-operateur.md` §8.1 bis, H.

## 2. Chargement piloté par des données

`bun run --cwd web models:seed [--nettoyer] [--service] [--dossier <chemin>]` (code : `web/src/server/gateway/deepinfra-loader.ts` et `deepinfra-source.ts` ; le script garde son nom).

Données, dans `web/src/server/gateway/catalog-deepinfra/` :

- `selection.json` : lu dans l'API de DeepInfra (`readAt`, `source`, puis pour chaque modèle `deepinfraId`, `kind`, `contextMax`, `quantization`, `upstreamInputUsdMicro`, `upstreamOutputUsdMicro`, `cacheReadRate`). Les autres clés (étiquettes et description de DeepInfra, rang…) sont ignorées.
- `fiches/<slug>.json` : nom, descriptions fr/en, capacités, `maxOutputTokens`, `sheet` validée par `modelSheetSchema` (format : le brief de recherche des fiches). `tagsWhy` et `gaps` sont tolérés (documentation de la recherche), tout autre champ inconnu fait refuser la fiche. **Un répertoire vide est toléré.**
- `retraits.json` : modèles à passer en « retiré », avec leur note fr/en.

Règles :

- **Identifiant public** `nexora/<slug>`, slug = dernier segment de l'identifiant DeepInfra en minuscules ; `upstreamId` = identifiant DeepInfra exact ; `visibility: public` ; région « autre » ; aucune consigne de routage (elles ne servent qu'à OpenRouter).
- **Prix** : amont lu dans `selection.json` ; **vente = amont × taux approuvé × (1 + 10 %)**, plancher 10 % (garde existante) ; **cache lu = `cacheReadRate` × prix d'entrée** (entier, arrondi au micro-dollar) quand le taux est fourni ; embeddings : sortie à 0. Une nouvelle ligne de prix n'est écrite que si l'amont a changé (ou si le prix en vigueur a des plages horaires ou une écriture de cache, qui n'existent pas chez DeepInfra) ; l'historique reste intact.
- **Fiche** : `quantization` vient de `selection.json` (minuscules, `bfloat16` devient `bf16`, absente = champ omis, et elle prime sur celle de la fiche) ; la source des prix (« DeepInfra, liste des modèles et des prix ») est ajoutée aux sources de la fiche ; `maxOutputTokens` reste `null` s'il n'est pas dans la fiche ; `contextMax` = celui de `selection.json`.
- **Disponibilité** : `preview` pour tout le lot (`--service` : directement `live`, ce qui exige la clé `llm.deepinfra`). Posée à la création et au rattachement seulement : un rejeu ne remet jamais en aperçu un modèle que l'opérateur a passé en service.
- **Mise en ligne** par la chaîne officielle (garde du modèle, approbation, publication du modèle, brouillon de version, approbation, publication) **uniquement si un taux de change approuvé existe**. Sinon : modèles en brouillon, sans prix, et un rejeu après l'approbation du taux complète tout. Un modèle dont la garde n'est pas verte reste en brouillon (le rapport dit pourquoi).
- **Fournisseurs** : `deepinfra` (compatible OpenAI, `https://api.deepinfra.com/v1/openai`, clé `llm.deepinfra`, **actif**, aucune route de secours) et `openrouter` (désactivé, route de secours future). Créés s'ils manquent, jamais réécrits.
- **Modèles déjà présents** (ex. `nexora/glm-5.3`, `nexora/glm-5.3-flash`, `nexora/deepseek-v4.1-flash-1017`, créés par l'ancien chargement) : **rattachés** à `deepinfra` (fournisseur, identifiant amont, fiche, nouveau prix, aperçu, routage vidé). `nexora/minimax-m3.1-flash` et `nexora/kimi-k3.1-pro` (absents de DeepInfra) passent en `retired` avec la note de `retraits.json` dans leur fiche ; `nexora/glm-5-3` (ancien) reste retiré. Un modèle retiré qui figure dans la sélection n'est pas réactivé.
- **`--nettoyer`** : supprime les fournisseurs directs (`deepseek`, `zai`, `minimax`, `moonshot`) que plus **aucun modèle (retirés compris) ni route** ne référence. Les modèles retirés gardent leur fournisseur d'origine : ces fournisseurs-là restent (le rapport les liste avec la raison).
- **Rapport** : taux, fournisseurs créés, modèles créés / rattachés / mis à jour / retirés / mis en ligne, nouvelles versions de prix, brouillons avec leurs motifs, modèles sautés (fiche absente, invalide ou orpheline), état de la version du catalogue.

Rejouable : un second passage sans changement des données ne crée ni modèle, ni prix, ni version.

### Politique de données de DeepInfra (texte affiché)

Écrite à partir de la documentation de DeepInfra, lue le 29/10/2026 (`docs.deepinfra.com/account/data-privacy`) : données soumises non stockées sur disque (entrées en mémoire le temps du calcul, sorties effacées une fois envoyées ; le traitement par lots, que Nexora n'offre pas, peut les garder chiffrées), pas d'entraînement sur ces données **sauf pour les modèles de Google ou d'Anthropic** (la politique de l'éditeur s'applique : plusieurs modèles Gemma sont au catalogue), et **aucune indication du pays ou de la région** : la région du fournisseur est donc « autre ». Aucune certification n'est affirmée. À relire avant le lancement.

## 3. Avant le lancement (ordre conseillé)

1. Module Modèles, onglet Taux de change : ajouter et approuver un taux USD→CAD.
2. Copier les données réelles dans `catalog-deepinfra/` (`selection.json`, `fiches/*.json`), puis `bun run --cwd web models:seed` : les modèles sont publiés **en aperçu** ; la page publique se met à jour d'ici cinq minutes (cache de la liste).
3. Plus tard, quand la clé existe : Coffre, référence `llm.deepinfra` (type « Fournisseur de modèles »), « Tester la connexion » du fournisseur, puis **Passer en service** modèle par modèle (ou `models:seed --service` pour tout le lot), enfin « Synchroniser vers LiteLLM ».

## Décisions provisoires, modifiables par le fondateur

- **Aperçu par défaut pour tout le lot**, y compris les modèles rattachés qui étaient déjà publiés en service chez un autre fournisseur : ils deviennent non appelables jusqu'au passage en service.
- **Les données font foi au rejeu** : nom, descriptions, capacités, fiche et contexte d'un modèle déjà chargé sont réécrits depuis les fichiers ; la visibilité, la date de retrait, le statut et la disponibilité ne le sont pas.
- **Fournisseur existant non réécrit** : si `deepinfra` existe déjà et est désactivé (créé à la main), le chargement le laisse tel quel et l'indique dans le rapport.
- **Fournisseurs directs gardés tant que des modèles retirés les référencent** (aucune migration de l'historique).
- **Appel d'un modèle en aperçu sans LiteLLM configuré** : la passerelle répond 503 comme pour tout appel (le refus 404 n'intervient qu'une fois la passerelle en état de servir).
- **Forfait de 5 M de jetons de WorkStudio** : 247 cents (2,47 $ CA), valeur de 5 M de jetons de `nexora/deepseek-v4.1-flash-1017` aux prix DeepInfra, taux de référence 1,4025 et marge de 10 % (voir `docs/facturation-workstudio.md`). Le taux approuvé en production fait foi pour la facturation.
- **`maxOutputTokens` absent des fiches** : `null` ; la passerelle applique alors son plafond par défaut (`GATEWAY_DEFAULT_MAX_OUTPUT_TOKENS`, 4 096).
