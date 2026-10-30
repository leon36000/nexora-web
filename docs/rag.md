# Nexora RAG managé (v1) : utilisation, architecture, facturation, limites

Base de connaissances à la demande : le client dépose ses documents, Nexora les découpe, les vectorise et les rend interrogeables par une API, par un serveur MCP (agents de code, bots) et par les outils Nexora, avec **une clé d'API**. Décision d'origine : `docs/superpowers/specs/2026-10-30-credits-produits-design.md` (décisions 5 et 6).

**État honnête.** Tout le code ci-dessous est livré et testé sur une base PostgreSQL jetable avec le vrai pgvector, la vraie passerelle (débit, Privacy Router, Activité) et un **faux fournisseur** d'embedding et de reclassement (déterministe). **Aucun vrai modèle n'a été appelé** : la clé de DeepInfra n'est pas encore dans le Coffre et les modèles du catalogue sont en aperçu (`docs/catalogue-deepinfra.md`). Tant qu'ils ne sont pas passés en service, créer une base répond `409 model_unavailable`. La fiche publique `rag` des Apps n'est pas touchée ici (chantier du panneau). Le compteur d'espace est **provisoire** (voir §6).

## 1. Le parcours en un clic

Dans le panneau (chantier D), un bouton appelle `POST /api/account/rag` avec un nom. La réponse contient :

- la **base** (isolée à l'organisation) ;
- sa **clé dédiée** `nxk_…` (lecture et écriture, limitée à cette base, valeur montrée **une seule fois**, empreinte SHA-256 seulement au repos, révocable) ;
- les **adresses** (`api`, `mcp`) et les **configurations à copier** (`snippets` : `.mcp.json`, Nexora Code, `curl`, variables d'environnement), clé comprise.

Ensuite, depuis le panneau (`/api/account/rag/{id}/documents`) ou avec la clé (API, MCP), on ajoute des documents et on interroge. Une base peut avoir d'autres clés (`POST /api/account/rag/{id}/keys`, `mode` `read` ou `write`) : une clé **en lecture seule** pour un bot, qui ne peut ni ajouter ni supprimer, limite les dégâts d'une injection d'instructions.

La clé ne sert **qu'aux modèles de ses bases** (`allowedModels` = embedding + reclassement) : elle ne peut pas appeler un modèle de conversation. Elle compte dans les 25 clés actives par organisation et dans la liste « Modèles et clés ».

## 2. API REST (`/v1/rag`, clé `nxk_`)

`Authorization: Bearer nxk_…`. Erreurs au format OpenAI (`{ error: { message, type, param, code } }`), messages en français. Pas de CORS : la clé reste côté serveur.

| Appel | Droit | Réponse |
|---|---|---|
| `GET /v1/rag/bases` | lecture | les bases de la clé |
| `GET /v1/rag/bases/{id}` | lecture | la base et ses compteurs |
| `GET /v1/rag/bases/{id}/documents?limit=&cursor=` | lecture | liste paginée (plus récent d'abord) |
| `POST /v1/rag/bases/{id}/documents` | écriture | JSON `{ title?, text, source?, metadata? }` **ou** formulaire `multipart/form-data` (`file`, `title?`, `source?`, `metadata?` en JSON). `201` prêt, `200` déjà présent, `202` en cours (worker) |
| `GET /v1/rag/bases/{id}/documents/{doc}` | lecture | état du document |
| `DELETE /v1/rag/bases/{id}/documents/{doc}` | écriture | supprime document et extraits, rend l'espace |
| `POST /v1/rag/bases/{id}/query` | lecture | `{ query, top_k?, rerank?, min_score? }` → extraits avec sources |
| `POST /v1/rag/mcp` | selon l'outil | serveur MCP (§3) |

Créer et supprimer une **base**, et gérer les clés, se fait par le compte (session du propriétaire) : une clé volée ne peut pas détruire une base.

```bash
export NEXORA_KEY=nxk_…   # la clé montrée à la création
BASE=https://exemple.ca/v1/rag

# Ajouter un fichier (.txt, .md, .html, .pdf)
curl $BASE/bases/$BASE_ID/documents -H "Authorization: Bearer $NEXORA_KEY" \
  -F file=@politique-de-remboursement.pdf -F 'metadata={"service":"ventes"}'

# Ajouter du texte
curl $BASE/bases/$BASE_ID/documents -H "Authorization: Bearer $NEXORA_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Procédure d’annulation","text":"# Annuler une commande\n\nOuvrez la fiche…"}'

# Interroger
curl $BASE/bases/$BASE_ID/query -H "Authorization: Bearer $NEXORA_KEY" -H "Content-Type: application/json" \
  -d '{"query":"délai de remboursement","top_k":5}'
```

Réponse d'une requête : `data[]` avec `document_id`, `document_title`, `source`, `chunk_index`, `page` (PDF), `heading` (chemin des titres), `text`, `score` (reclassement si fait, sinon similarité cosinus), `scores { vector, lexical, rerank }`, `start`, `end` ; `rerank { requested, applied, model, reason? }` ; `usage { embedding_tokens, rerank_tokens, cost_micro }` (aussi en-tête `x-nexora-cost-micro`). Les scores d'un reclasseur ne se comparent pas d'un modèle à l'autre.

## 3. Serveur MCP (`POST /v1/rag/mcp`)

Transport « HTTP en flux » **sans état** : un message JSON-RPC (ou un lot) par POST, réponse `application/json`, pas de session, pas de flux serveur (`GET` répond `405`, ce que la spécification permet). Versions négociées : 2025-11-25, 2025-06-18, 2025-03-26. Authentification : la clé en `Authorization: Bearer`. Une requête de navigateur n'est admise que depuis l'origine du site (`RAG_MCP_ALLOWED_ORIGINS` pour en ajouter) : défense contre le rebond DNS.

| Outil | Rôle | Droit |
|---|---|---|
| `rag_search` | `query`, `base?`, `top_k?`, `rerank?` : extraits avec document, section, page, pertinence | lecture |
| `rag_list_documents` | `base?`, `limit?`, `cursor?` | lecture |
| `rag_add_document` | `title`, `text`, `base?`, `source?`, `metadata?` | écriture |

`base` accepte le nom ou l'identifiant ; il est facultatif quand la clé ne couvre qu'une base. Les erreurs d'exploitation (solde, quota, droits) sont rendues comme **résultat d'outil** (`isError: true`) pour que l'agent les lise.

Configurations à copier (le panneau les remplit avec la clé à la création) :

```jsonc
// Claude Code et la plupart des clients MCP : .mcp.json
{ "mcpServers": { "nexora-rag": { "type": "http", "url": "https://exemple.ca/v1/rag/mcp",
    "headers": { "Authorization": "Bearer nxk_votre_cle" } } } }

// Nexora Code (format de configuration d'OpenCode : opencode.json) — à confirmer avec le chantier Nexora Code
{ "mcp": { "nexora-rag": { "type": "remote", "url": "https://exemple.ca/v1/rag/mcp",
    "headers": { "Authorization": "Bearer nxk_votre_cle" }, "enabled": true } } }
```

Un bot ou un autre outil sans MCP appelle l'API REST (§2) ; les variables `NEXORA_RAG_URL`, `NEXORA_RAG_API_KEY` et `NEXORA_RAG_BASE_ID` du panneau servent à ça.

## 4. Facturation

Le client paie l'**espace** et les **jetons d'embedding et de reclassement**. Les appels de modèle passent par la **passerelle** (mêmes fonctions que `/v1/chat/completions` : `handleEmbeddings`, `handleRerank`) :

- **Embedding** : un appel `embeddings` par lot de 32 extraits à l'ajout, un par requête. Réservation du coût maximal, règlement au coût réel, ligne `usage_events` (`endpoint` `embeddings`) donc ligne dans l'**Activité** du client, par modèle ; organisation « maison » sans débit.
- **Reclassement** : nouveau point d'entrée **`POST /v1/rerank`** (format Cohere : `model`, `query`, `documents` en textes ou `{ text }`, `top_n`, `return_documents`), type de modèle **`rerank`** au catalogue, facturé en jetons d'entrée (`endpoint` `rerank`). Utilisable directement par les clients. Trois modèles Qwen3-Reranker (0,6B, 4B, 8B) sont chargés avec leur fiche ; prix et contexte lus sur DeepInfra le 30/10/2026. Les jetons viennent de l'amont (`meta.tokens.input_tokens`), sinon de l'estimation de la passerelle.
- **Espace** : texte des extraits (octets UTF-8) + vecteur demi-précision (2 048 octets + 8) + 256 octets de métadonnées par extrait. **Les index (HNSW, plein texte) ne sont pas comptés.** Réservé à l'ajout (`recordStorageUsage(org, "rag", +n)`), rendu à la suppression d'un document ou d'une base, rendu aussi si l'indexation échoue.
- **Solde à zéro** : l'ajout et la requête répondent `402 insufficient_quota` avec **le même message que la passerelle** (« Solde de crédits insuffisant pour cette requête. Rechargez votre compte. »). Un solde épuisé en cours d'indexation fait échouer le document : extraits purgés, espace rendu ; les lots déjà vectorisés restent facturés (les jetons ont été consommés).
- **Quota dépassé** : `507 quota_exceeded`, « Votre espace est plein… supprimez des documents ou des bases… ou ajoutez de l'espace depuis la page Facturation… », avant tout appel de modèle.
- Un même contenu ajouté deux fois (empreinte SHA-256 du texte) ne coûte rien et rend le premier document.
- Le reclassement est facultatif par requête (`rerank: false`) et par base (`rerank: false` à la création). Sans modèle de reclassement disponible, la requête répond quand même (`rerank.reason: "no_model"`) et ne facture que l'embedding. Un seul candidat : pas de reclassement.

## 5. Architecture

- **`packages/rag`** (`@nexora/rag`, importable par le worker sous Node nu, imports relatifs en `.ts`) : `chunkText` (tranches contiguës, titres Markdown, paragraphes, phrases, chevauchement ; 3 200 caractères et 400 de chevauchement par défaut, paramétrables par base), `extractText` (`.txt`, `.md`, `.html`, `.pdf`), vecteurs (`fitVector`, `chunkStorageBytes`), `reciprocalRankFusion`, reclassement (`parseRerankResults`, `applyRerank`), `queryTerms`, requêtes SQL à paramètres liés, profils des modèles d'embedding.
- **PDF : `unpdf` 1.8.1** (exact, publié le 13/08/2026), choisi pour être autonome (pdf.js embarqué, aucune dépendance obligatoire, 2,6 Mo sur disque) et fonctionner sous Node et Bun sur arm64 ; `pdfjs-dist` (35 Mo) et `pdf-parse` (21 Mo, dépend d'un module natif de rendu) sont plus lourds. L'évaluation de code de pdf.js est désactivée. HTML : `node-html-parser` (déjà au dépôt) ; script, style, cadre, `noscript` jamais extraits.
- **Base de données** (migration **0028**, `packages/db/src/schema-rag.ts`) : extension `vector`, `rag_bases`, `rag_documents`, `rag_chunks` (`halfvec(1024)` avec index HNSW cosinus, colonne `tsvector` générée avec index GIN), `api_keys.rag_access`, `models.kind` accepte `rerank`.
- **Vecteurs de 1 024 dimensions** pour tous les modèles : un seul index. Plus court (EmbeddingGemma, 768) : complété par des zéros (le cosinus ne change pas) ; plus long (Qwen3, 4 096) : tronqué puis renormalisé (Matryoshka). Aucun paramètre `dimensions` n'est envoyé à l'amont. Modèles pris en charge : `nexora/qwen3-embedding-8b` (défaut, avec l'instruction de requête recommandée par Qwen), `nexora/bge-m3-multi-8k`, `nexora/embeddinggemma-2`. Nemotron Embed (4 096 sans troncature) n'est pas pris en charge.
- **Recherche hybride** : vecteurs (cosinus, parcours itératif de l'index HNSW pour tenir compte du filtre de base) + plein texte (`simple`, sans radical : bon pour les identifiants et le code) fusionnés par rangs réciproques, puis reclassement des 30 meilleurs (50 au plus). Mesure de développement sur pc6 : 30 000 extraits répartis en 5 bases, vecteurs aléatoires, requête filtrée sur une base : 30 résultats sur 30, rappel 1,0 contre le balayage exact, 27 ms.
- **Serveur** : `web/src/server/rag/` (bases, clés, documents, indexation, recherche, MCP, REST, compte, tâche interne), routes `web/src/app/v1/rag/[[...path]]`, `web/src/app/api/account/rag/[[...path]]`, `web/src/app/api/admin/rag/index`, `web/src/app/v1/rerank`.
- **Indexation** : jusqu'à 48 extraits (environ 150 000 caractères) pendant la requête ; au-delà, `202` et tâche `rag.index` du worker. Une **tranche** vectorise plusieurs lots, chacun inséré avec l'avancement dans une transaction ; une réservation de 60 s (`claimed_until`) empêche deux tranches simultanées ; une panne passagère (429, 5xx) reprogramme la tranche, un arrêt du worker ne perd rien. Le worker appelle `POST /api/admin/rag/index` du site (jeton d'administration) : seul le site parle à la passerelle. Les appels qui n'arrivent pas avec la clé du client (panneau, worker) sont facturés à la clé qui a ajouté le document, sinon à la plus récente clé active de la base ; sans clé active : `409 no_active_key` avec la marche à suivre.

## 6. Exploitation

1. **Migration 0028** : `CREATE EXTENSION vector` exige un super-utilisateur (pgvector n'est pas une extension « de confiance »). Le service `db` de Compose utilise déjà `pgvector/pgvector:pg17` (épinglé par empreinte). Si le rôle du site n'est pas super-utilisateur, créer l'extension une fois dans la base `app` (`CREATE EXTENSION IF NOT EXISTS vector;`), puis migrer.
2. **Catalogue** : `bun run --cwd web models:seed` charge aussi les trois reclasseurs (en aperçu). Pour que le RAG fonctionne : clé DeepInfra dans le Coffre, **Passer en service** les modèles `nexora/qwen3-embedding-8b` et `nexora/qwen3-reranker-4b`, puis synchroniser LiteLLM. Un reclasseur est déployé dans LiteLLM avec la chaîne `deepinfra/<modèle>` (fournisseur DeepInfra de LiteLLM) ; **non éprouvé contre un vrai LiteLLM** : au premier branchement, essayer `curl $LITELLM/v1/rerank` avec la clé maîtresse, et vérifier que l'adresse de base du crédential (`…/v1/openai`) n'empêche pas l'appel à `…/v1/inference/<modèle>`.
3. **Worker** : variables `NEXORA_APP_INTERNAL_URL` et `NEXORA_APP_ADMIN_TOKEN` (32 caractères au moins). Sans elles le worker le dit au démarrage et les gros documents restent « en file ».
4. **Espace — à brancher à la fusion du module des offres** : `web/src/server/rag/deps.ts` utilise un compteur **provisoire** (somme des octets des documents, quota unique `RAG_PROVISIONAL_QUOTA_BYTES`, 1 Gio par défaut). Remplacer `storage` par `record: (org, d) => recordStorageUsage(org, "rag", d)` et `used: async (org) => (await getOrgEntitlements(org)).storage.byProduct.rag`. Si un écart apparaît entre le compteur des offres et les documents (arrêt entre l'enregistrement et le compteur), la somme de `rag_documents.stored_bytes` fait foi : un rapprochement (`used` contre la somme) corrige par un `record` du delta.
5. Variables (toutes facultatives) : `RAG_MAX_FILE_BYTES` (10 Mio), `RAG_MAX_TEXT_CHARS` (5 000 000), `RAG_MAX_PDF_PAGES` (500), `RAG_MAX_BASES_PER_ORG` (10), `RAG_MAX_DOCS_PER_BASE` (2 000), `RAG_MAX_CHUNKS_PER_BASE` (200 000), `RAG_DEFAULT_RPM` (120 requêtes par minute et par clé, `rpm_limit` de la clé prime), `RAG_KEY_RPM` (600) et `RAG_KEY_TPM` (2 000 000) posés sur les clés créées, `RAG_DEFAULT_EMBEDDING_MODEL`, `RAG_DEFAULT_RERANK_MODEL` (`off` pour aucun), `RAG_MCP_ALLOWED_ORIGINS`. Ce sont des valeurs de départ, jamais des prix.

## 7. Sécurité

- **Isolation** : l'organisation vient de la clé (ou de la session), jamais du corps. Chaque requête SQL filtre `organization_id` **et** `base_id`, y compris la jointure des documents ; une base hors de la portée de la clé, d'une autre organisation ou inexistante donne la même réponse `404 base_not_found`. Essais : une clé de B ne lit, ne liste, n'ajoute, ne supprime rien chez A ; une clé dont la portée a été falsifiée pour nommer la base de A ne la voit toujours pas ; on ne peut pas créer une clé pour la base d'une autre organisation.
- **Aucune injection SQL** : toute valeur extérieure est un paramètre lié (essai avec une chaîne hostile ; la requête plein texte est reconstruite à partir de termes `[lettres chiffres _]`).
- **Clés** : 256 bits, SHA-256 au repos, montrées une fois, révocables ; lecture seule ou écriture ; limite de débit par clé (`429` + `Retry-After`), plus les limites de la passerelle (requêtes et jetons par minute).
- **Tailles** : fichier 10 Mio (lecture bornée du flux, pas seulement `Content-Length`), texte 5 M de caractères, PDF 500 pages, 5 000 extraits par document, 2 000 documents et 200 000 extraits par base, 10 bases par organisation, métadonnées 4 Kio.
- **Journalisation sans contenu** : seuls des identifiants, des compteurs et des noms d'erreur sont journalisés (essai : ni le texte des documents ni la requête n'apparaissent). Un document en échec garde un **code** d'erreur, jamais un extrait.
- **Privacy Router** : s'applique comme pour tout appel de modèle, parce que l'embedding et le reclassement passent par la passerelle : les renseignements personnels reconnus sont masqués avant l'envoi au modèle (courriel, téléphone, carte, NAS, IBAN, secrets), la politique de l'organisation peut refuser (403 `privacy_policy_denied` : l'ajout échoue sans rien garder ni facturer). Le client récupère son texte d'origine. Limites : la détection est heuristique (voir `docs/privacy-router.md`).
- **Fichiers** : le contenu est une donnée, jamais exécuté ; pdf.js tourne **dans le processus du site** (limites de taille et de pages, évaluation désactivée, mais pas d'isolation de processus).
- **Contenu hostile** : un document ou une réponse du RAG peut contenir des instructions destinées à un agent. L'agent doit traiter les extraits comme des **données**, pas comme des consignes ; les outils MCP rendent le texte tel quel avec sa source. Une clé en lecture seule limite ce que l'agent peut faire.

## 8. Limites honnêtes

- Aucun vrai modèle n'a été appelé (faux fournisseur) ; le déploiement LiteLLM d'un reclasseur n'est pas éprouvé (§6.2) ; `dimensions` n'est pas envoyé à l'amont, donc 4 096 flottants par extrait traversent la passerelle avec Qwen3 (la troncature est locale).
- Approvisionnement **logique** : tables partagées, isolation par organisation et base dans le code et le SQL, pas de conteneur ni de base par client. Un défaut de code serait un défaut d'isolation ; les essais le couvrent mais ce n'est pas une preuve.
- Pas de reconnaissance de caractères : un PDF numérisé sans texte est refusé (`empty_document`). Pas de tableaux, d'images, de mise en page : le texte brut de pdf.js. Pas de .docx ni .csv en v1.
- Un document n'est ni modifié ni réindexé : le supprimer puis le rajouter (le même contenu est reconnu). Pas de changement de modèle d'embedding sur une base existante.
- La recherche plein texte n'a ni radical ni mots vides par langue (`simple`) ; le sens vient des vecteurs. Les identifiants de produit, codes d'erreur et noms propres sont bien trouvés ; une question reformulée sans mot commun dépend du modèle d'embedding.
- Un document en cours d'indexation n'est pas encore cherché (ses extraits partiels peuvent occuper des places dans les candidats d'une requête, qui en rend alors un peu moins).
- L'espace compté ne comprend pas les index (HNSW, plein texte) : le stockage réel est plus grand. **Non mesuré** sur des textes réels ; mesurer `pg_total_relation_size('rag_chunks')` contre l'espace compté avant de fixer le prix du Go supplémentaire.
- Un arrêt entre l'enregistrement d'un document et le compteur d'espace peut laisser un écart (§6.4).
- Les scores de similarité ne sont pas des probabilités ; les seuils (`min_score`) ne valent que pour un reclasseur donné.
- Le serveur MCP n'ouvre pas de flux serveur (pas de notifications, pas de reprise de session) ; il n'a pas été essayé avec un vrai client MCP, seulement avec les messages du protocole.

## 9. Phase 2 : isolation physique

Si le fondateur la demande : une base PostgreSQL (ou un conteneur) par client sur le module VPS, `rag_*` déplacées dans ce schéma, et la même interface (`/v1/rag`, MCP). Ce qui reste à faire : un pilote d'approvisionnement, la copie des extraits existants, un compteur d'espace par instance, la clé d'accès propre à l'instance, et l'extraction des PDF dans un processus isolé (conteneur sans réseau).

## 10. Décisions provisoires, modifiables par le fondateur

| # | Décision | Où la changer |
|---|---|---|
| R-1 | Vecteurs en `halfvec(1024)` pour tous les modèles | `schema-rag.ts`, `vector.ts` |
| R-2 | Modèle d'embedding par défaut : Qwen3 Embedding 8B ; reclassement par défaut : Qwen3 Reranker 4B | `RAG_DEFAULT_*` |
| R-3 | Dépassement de l'espace : `507 quota_exceeded` | `failure.ts` |
| R-4 | Une clé de base en écriture à la création ; création et suppression de bases et de clés réservées au propriétaire | `account.ts` |
| R-5 | Reclassement dégradé en silence (avec `rerank.reason`) plutôt qu'en erreur | `search.ts` |
| R-6 | Un document identique n'est jamais refacturé | `documents.ts` |
| R-7 | Index non comptés dans l'espace | `vector.ts` (`chunkStorageBytes`) |

## 11. Essais

`packages/rag` (découpage, extraction, vecteurs, fusion, reclassement, SQL, chargement sous Node nu), `packages/db/src/rag.test.ts` (migration, pgvector, cascades), `web/src/server/gateway/proxy-rerank.test.ts` et `proxy-authenticate.test.ts`, `web/src/server/rag/*.test.ts` (indexation, facturation, quota, isolation, Privacy Router, REST, MCP, compte, tâche interne, **preuve de bout en bout** `rag-e2e.test.ts`), `worker/src/rag/handlers.test.ts`. Commandes : `node node_modules/vitest/vitest.mjs run --root <dossier>` (Node 24, voir `docs/restauration.md`).
