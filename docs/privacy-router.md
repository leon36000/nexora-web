# Nexora Privacy Router (v1)

Couche qui contrôle ce qui quitte Nexora vers un tiers. Elle est **incluse par défaut dans tous les produits, sans supplément** : la confidentialité est une propriété de Nexora, jamais une option payante. Deux règles la tiennent : **échec fermé** (si la couche ne peut pas décider, rien ne sort) et **journal sans contenu** (on garde ce qui s'est passé, jamais ce qui a été dit).

Interface partagée : `web/src/server/privacy/types.ts` (`PrivacyRouter.evaluate`, `OutboundIntent`, `PrivacyDecision`). Point d'accroche pour WebPilot : `docs/superpowers/specs/2026-10-29-webpilot-contrat-api.md` §6. Code : `web/src/server/privacy/`. Migration : `0022_s13_privacy_router`.

## Où elle s'applique aujourd'hui

| Sortie | Évaluée | Destination vue par la politique |
|---|---|---|
| `POST /v1/chat/completions` (modèles et agents hébergés `agent/<slug>`) | Oui, avant l'estimation, la réservation et l'appel amont | le modèle (identifiant public) |
| `POST /v1/embeddings` | Oui, au même endroit | le modèle |
| WebPilot (site et worker) | Branché depuis le 29/10/2026 : recherche, lecture, exploration (chaque page), extraction | l'hôte |
| WorkStudio | Passe par la passerelle `/v1` avec la clé de la personne : mêmes règles que tout appel de modèle | le modèle |

Une requête vers un modèle inexistant reste un 404 : la politique ne révèle rien du catalogue.

## Niveaux de politique (par organisation)

| | Standard (défaut) | Renforcé | Souverain strict |
|---|---|---|---|
| Masquage des renseignements évidents | oui | oui | oui |
| Genres à refuser au lieu de masquer (au choix) | oui | oui | oui |
| Hôtes et modèles interdits (au choix) | oui | oui | oui |
| Liste de modèles permis | ignorée | appliquée **si elle n'est pas vide** | **obligatoire** : vide = tout est refusé |
| Liste de destinations permises | ignorée | appliquée si elle n'est pas vide | obligatoire : vide = tout est refusé |
| Pièces jointes (images, audio, fichiers) | permises | bloquées (réglable) | bloquées (réglable) |
| Collecte de données chez le fournisseur amont | refusée | refusée | refusée |
| Journal des sorties, sans contenu | oui | oui | oui |

Une organisation sans politique enregistrée applique la politique par défaut (version `0`), c'est-à-dire « standard » : l'absence de politique n'est jamais « tout permis ». Les secrets (clés `nxk_`, `sk-`, `Bearer`…) sont **toujours** masqués, même si la case est décochée.

## Ce qui est masqué par défaut

Le texte est remplacé par un jeton lisible du genre ; jamais une partie de la valeur.

| Genre | Jeton | Reconnu quand |
|---|---|---|
| Courriel | `[COURRIEL]` | adresse bien formée, accents et sous-domaines acceptés |
| Téléphone | `[TÉLÉPHONE]` | nord-américain (`514-555-0199`, `(514) 555-0199`, `+1 514 555 0199`, indicatifs valides) ou international E.164 (`+33 6 12 34 56 78`) |
| Carte de crédit | `[CARTE]` | 13 à 19 chiffres, premier chiffre 2 à 6, contrôle de Luhn valide, séparateurs espace ou tiret |
| NAS canadien | `[NAS]` | neuf chiffres (en un bloc ou 3-3-3), ne commence pas par 8, contrôle de Luhn valide |
| IBAN | `[IBAN]` | clé modulo 97 et longueur du pays valides |
| Clés et secrets | `[SECRET]` | `nxk_…`, `sk-…`, `Bearer …`, clés AWS `AKIA…`, jetons GitHub `ghp_…` et Slack `xox…`, JWT, clés privées PEM |

Un numéro qui échoue au contrôle de Luhn ou de l'IBAN n'est pas masqué (faux positifs évités). Les détecteurs sont purs (`detectors.ts`) et s'exécutent en temps linéaire.

### Parties de la requête inspectées

- `/v1/chat/completions` : `messages[].content` quand c'est une chaîne, et chaque partie `{"type":"text"}` d'un contenu en tableau. Les rôles `system`, `user`, `assistant` et `tool` sont tous visés.
- `/v1/embeddings` : `input` (chaîne, ou chaque chaîne d'une liste ; les listes de jetons entiers ne sont pas du texte).
- **Non modifiés** : images et autres parties non textuelles (elles comptent comme pièces jointes), `tools`, `tool_choice`, `response_format`, arguments des appels d'outils déjà présents dans l'historique, noms de champs. Le flux (SSE) n'est pas touché : seule la requête est masquée, pas la réponse.

## Ce que le client voit

- En-tête `x-nexora-privacy-decision: allow | mask | deny` sur les réponses de la passerelle.
- **403 `privacy_policy_denied`** (type `permission_error`, `param` : `model` ou `messages`). Le message nomme la règle, jamais le contenu. Aucune réservation, aucun appel amont, rien de facturé.

```json
{ "error": { "message": "Requête refusée par la politique de confidentialité de votre organisation : règle « model.not_allowed » (modèle non permis). Aucune donnée n'a été envoyée. Un administrateur peut ajuster la politique dans l'espace client, page Confidentialité.", "type": "permission_error", "param": "model", "code": "privacy_policy_denied" } }
```

- **503 `privacy_router_unavailable`** (type `api_error`) : la couche n'a pas pu décider (base illisible, erreur interne, résultat incohérent). Refus par précaution, jamais « laisser passer ». Rien n'est réservé ni facturé.

Règles (`ruleId`) : `mask.<genre>`, `deny.<genre>`, `host.blocked`, `host.not_allowed`, `model.not_allowed`, `sovereign.closed`, `attachment.blocked`, `policy.invalid` (politique enregistrée mais illisible : tout est refusé).

## Journal sans contenu

Table `privacy_events` : une ligne par évaluation (y compris `allow`) avec l'organisation, la clé API, le produit, l'opération, la décision, les règles appliquées, la version de politique, la destination (**hôte ou identifiant de modèle seulement**, jamais le chemin ni la requête), la nature des données (`prompt`, `attachment`…), les genres détectés et leur nombre. Aucune colonne ne peut contenir un texte (test de schéma). Si l'écriture du journal échoue, la requête continue (la décision est déjà prise) ; l'erreur est comptée (`privacyJournalFailures()`) et journalisée par son nom seulement.

Rapport mensuel : `GET /api/account/privacy/report?month=AAAA-MM` (CSV, UTF-8 avec BOM, mois civil UTC, cellules protégées contre l'injection de formules).

## Politique : données et cache

Table `privacy_policies` : une ligne par version, `current` marque la version en vigueur (une seule par organisation, index unique partiel), les autres lignes sont l'historique. La configuration (`config`, jsonb) est validée par zod à l'écriture **et** à la lecture. Un enregistrement identique à la version courante ne crée pas de version. Des enregistrements simultanés sont sérialisés (verrou consultatif) et donnent des versions distinctes.

Le routeur lit la politique par organisation avec un cache de 5 secondes (`PRIVACY_POLICY_CACHE_MS`, 0 = sans cache). Après un enregistrement, le processus qui l'a reçu vide son cache tout de suite ; les autres instances appliquent la nouvelle version en 5 secondes au plus.

## Espace client

Page `/[lang]/compte/confidentialite` (navigation « Confidentialité ») : niveau, genres masqués ou refusés, listes de modèles et de destinations, pièces jointes, décisions des 30 derniers jours (compteurs), historique des versions, téléchargement du rapport. Le propriétaire de l'organisation modifie ; les autres membres voient en lecture seule.

API (session, **propriétaire seulement**, origine contrôlée comme les routes voisines, enregistrées dans `route-guards.ts`) :

- `GET /api/account/privacy` → `{ level, version, isDefault, invalid, config, recent, versions }`
- `PUT /api/account/privacy` avec `{ level, config? }` → `{ version, changed, level, config }` ; 422 si une liste est mal formée (un hôte s'écrit `exemple.ca` ou `*.exemple.ca`, sans `https://` ni chemin) ; 401, 403, 429.
- `GET /api/account/privacy/report?month=AAAA-MM`

## Refus de la collecte chez l'amont

La synchronisation LiteLLM envoie à OpenRouter `provider.data_collection = "deny"` pour **tout** modèle servi par OpenRouter (`openrouterPreferences`, `litellm.ts`). Une consigne `allow` dans la fiche d'un modèle est ignorée. Elle ne s'applique qu'après une nouvelle synchronisation du catalogue (publier ou resynchroniser). Ce réglage vaut pour toute la plateforme, pas par organisation.

## Limites honnêtes

- La détection est heuristique. Elle ne reconnaît **pas** les noms de personnes ni les adresses postales, ne voit pas une valeur déguisée (« jean arobase exemple point ca ») et ne lit pas le contenu des images ni des fichiers.
- Le masquage ne couvre que ce que le tableau ci-dessus liste, et seulement dans les parties inspectées.
- Ce n'est **pas** une preuve de résidence des données : la politique contrôle ce qui part et vers quel modèle ou hôte, elle ne démontre pas où un fournisseur traite ensuite les données. L'attribut de résidence d'un modèle reste la déclaration du catalogue.
- Ce n'est **pas** un avis juridique ni un engagement de conformité réglementaire.
- Le refus de la collecte chez l'amont dépend de l'engagement et de l'application du fournisseur (OpenRouter et l'hébergeur final) ; Nexora le demande, ne peut pas le vérifier.
- Le cache de politique retarde d'au plus 5 secondes l'effet d'une modification sur les autres instances.

## Exploitation

1. Appliquer la migration `0022` (additive : deux tables, aucun changement aux tables existantes).
2. Resynchroniser LiteLLM pour que `data_collection = deny` parte vers OpenRouter.
3. Surveiller `privacyJournalFailures()` (compteur de pannes d'écriture du journal) et les erreurs « Privacy Router : décision impossible » dans les journaux : chacune correspond à une requête refusée en 503.
4. `GatewayDeps.privacy` est obligatoire : aucune requête ne part sans routeur.

## Décisions provisoires, modifiables par le fondateur

- **O-1 — politique par défaut = standard** : masquage des six genres ci-dessus, aucun genre refusé, aucune liste, pièces jointes permises, collecte amont refusée, journal sans contenu. S'applique à toute organisation sans politique enregistrée.
- Les **secrets sont toujours masqués**, même si la case est décochée (une clé ne doit jamais partir en clair).
- **Administrateur = propriétaire** de l'organisation (seul rôle d'administration existant) pour lire et modifier la politique et le rapport.
- **Liste de permissions vide** : sans restriction en Renforcé, tout refusé en Souverain (échec fermé).
- **Hôtes et modèles interdits** : actifs à tous les niveaux.
- **Pièces jointes** : tout contenu non textuel d'un message (image, audio, fichier) compte comme pièce jointe.
- **Journal** : chaque évaluation écrit une ligne, `allow` compris. **Durée de conservation du journal non fixée** (à décider ; aucune purge automatique pour l'instant).
- **Refus de la collecte amont** appliqué à toute la plateforme, sans exception par fiche.
- **Mois du rapport** en UTC.
- Une politique enregistrée mais illisible **refuse tout** (403 `policy.invalid`) plutôt que de retomber sur la politique par défaut.

## Tests

`web/src/server/privacy/*.test.ts` (détecteurs, politique, routeur et journal sur base d'essai, stockage, API du compte), `web/src/server/gateway/proxy-privacy.test.ts` (intégration `/v1`), `packages/db/src/privacy.test.ts` (schéma sans colonne de contenu), `web/src/components/account/privacy-*.test.ts(x)` (formulaire et rendu fr/en).

## Où vit le code (29/10/2026)

Le cœur (détecteurs, politiques, routeur, stockage, journal) est le paquet `packages/privacy` (`@nexora/privacy`), partagé par le site (cales d'import dans `web/src/server/privacy/`) et le worker (`worker/src/webpilot/privacy.ts`, exploration WebPilot). Le worker tourne sous Node nu : les imports relatifs du paquet portent leur extension `.ts` (un test le vérifie).
