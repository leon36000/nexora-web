# Passerelle de modèles et agents hébergés : recherche vérifiée

Relevé effectué le 26 octobre 2026 (heure de l'Est). Volet : passerelle de modèles (clés, crédits, catalogue, routage), serveurs de modèles auto-hébergés, agents hébergés exposés par API, facturation à l'usage.

## 0. Périmètre, méthode et limites

- **Dates de dernier commit** : date affichée par GitHub sur la page `/commits` de la branche par défaut, relevée le 26 octobre 2026. Les étoiles sont celles de la page publique du dépôt, à la même date.
- **API GitHub** : inaccessible pendant la recherche (quota anonyme épuisé, réinitialisation annoncée le 26 octobre 2026 à 22 h 29 EDT). Les métadonnées viennent donc des pages publiques de GitHub et des fichiers `LICENSE` bruts.
- **Licences** : texte des fichiers `LICENSE` lu directement. Quand un dépôt mêle plusieurs régimes (LiteLLM, Dify, Sim, Mastra, Langfuse, Unkey), le régime des dossiers séparés est indiqué.
- **Documentation** : pages officielles lues par extraction ciblée. Quand une page était introuvable ou redirigée, la source secondaire est signalée. Les pages entières n'ont pas toutes été lues (voir section 8).
- **Aucune installation, aucun clonage, aucune lecture de secret, aucune modification hors de ce rapport.**
- **Transparence** : une seule lecture sort de la règle de salle blanche du projet. J'ai lu le fichier de licence `apps/sim/ee/LICENSE` (texte juridique, pas de code) pour établir le régime. Aucun module du dossier `ee/` n'a été ouvert.

## 1. Synthèse et décisions à prendre

1. **Alerte sécurité LiteLLM (à traiter en premier).** Les versions malveillantes `litellm==1.107.0` ont été publiées sur PyPI le 21 octobre 2026, entre 11 h 39 et 13 h 23 UTC, et sur Docker (tags `v1.107.0`, `latest`, `main-latest`, `main-stable`). Elles volaient les identifiants, dont les clés fournisseurs stockées dans la base du proxy, et installaient une porte dérobée au démarrage de Python. C'est le second incident de chaîne d'approvisionnement de LiteLLM en 2026, après celui du 24 mars 2026 (versions 1.82.7 et 1.82.8). Si Nexora a tiré l'une de ces versions, il faut considérer les secrets de l'hôte comme compromis (section 2.1).
2. **Socle de la passerelle.** La décision déjà prise (OpenGateLLM, MIT, fork dur) reste la plus cohérente avec la souveraineté. OpenGateLLM n'a pas de gestion de clés clientes, de budgets ni de facturation documentés : ces briques sont à construire dans une couche « comptes et crédits » (ledger). new-api montre les fonctions attendues, mais son AGPL-3.0 et sa clause d'attribution en font une référence fonctionnelle, pas un code à forker. Bifrost (Apache-2.0) est le candidat à comparer en priorité, sous réserve de vérifier la frontière entre fonctions libres et fonctions entreprise.
3. **Serveurs GPU.** vLLM (Apache-2.0) est le moteur à adopter, avec files d'attente bornées. SGLang est à évaluer pour le routage entre plusieurs workers. Ollama et llama.cpp servent aux petits modèles et au développement, jamais exposés directement. TGI, TensorZero et Flowise sont archivés : écartés.
4. **Agents hébergés.** Agno AgentOS (Apache-2.0) est le runtime le plus adapté à des agents servis par API et auto-hébergés. WorkStudio (base Sim) expose déjà une API de workflows (clé `X-API-Key`, exécution asynchrone, réponses 429), mais une clé Sim n'est pas une clé client : la passerelle doit porter les clés clientes et le décompte. Dify (service multi-tenant interdit sans accord écrit), LangGraph auto-hébergé (licence LangSmith Enterprise) et les modules `ee/` de Mastra sont écartés pour la revente.
5. **Facturation.** Lago (AGPL-3.0, portefeuilles de crédits) pour l'agrégation et les crédits, et Stripe pour l'encaissement. Pour les crédits prépayés et le burndown, Stripe recommande désormais Metronome plutôt que les Meters de base. Le chemin critique (solde par requête) doit rester dans un ledger maison : un patron comme celui d'Unkey (solde par clé) est utile, mais sa licence FSL demande une validation juridique.
6. **Modèle OpenRouter à reproduire.** Catalogue en cartes avec prix par million de jetons, filtres par type, pages fournisseurs avec politique de données et BYOK, playground multi-modèles, classements d'usage. Ses frais sont de 5,5 % à l'achat de crédits (Standard) ou 8 % (Business), et le BYOK comprend 25 000 $ d'inférence par mois puis 5 %.

**Décisions attendues du fondateur** : (a) le plan d'action sécurité LiteLLM, dès aujourd'hui ; (b) construire le ledger maison ou le confier à Lago ; (c) le runtime d'agents retenu (Agno ou WorkStudio via son API).

## 2. Passerelles et proxys LLM

### 2.1 LiteLLM : état détaillé

**Incident du 21 octobre 2026 (1.107.0)** : d'après le billet officiel de LiteLLM mis à jour le 23 octobre 2026 et le billet de Datadog :

- Publication malveillante sur PyPI à 11 h 39 UTC, mise en quarantaine à 13 h 20 UTC, disponibilité jusqu'à 13 h 23 UTC. Images Docker publiées de 11 h 46 à 14 h 20 UTC selon les tags.
- Point d'entrée : jetons OAuth de la CLI GitHub volés à trois ingénieurs, utilisés pour lancer le workflow de publication contre un dépôt au nom presque identique (`Berri-AI/litellm`, avec un tiret). Le registre privé entreprise n'est pas touché.
- Charge utile : vol d'identifiants (clouds, développeurs, outils d'IA, identifiants fournisseurs de la base du proxy), chiffrement puis envoi vers un domaine frauduleux ; installation de `cook.pth` et `sitecustomize.py`, exécutés à chaque démarrage de Python, même sans import de LiteLLM ; démon Python détaché.
- Traces à rechercher : dossier `litellm-1.107.0.dist-info`, fichiers `cook.pth`, `cook.py`, `sitecustomize.py` dans `site-packages`, verrou `/tmp/remote_code_loader.lock`.
- Recommandations de l'éditeur : épingler `litellm==1.106.2` ou une version antérieure à l'incident ; ne pas lancer `pip install` dans un environnement touché ; supprimer les fichiers ci-dessus ; reconstruire images et environnements ; faire tourner les identifiants accessibles depuis l'hôte (rôle IAM, clés fournisseurs, clés maîtres et virtuelles, mot de passe de `DATABASE_URL`, secrets d'environnement) ; contrôler dans les journaux d'appels à l'API du fournisseur cloud les usages suspects autour de la date d'installation.
- Le billet précise que des hypothèses initiales se sont révélées inexactes. La version « attack-chain » (`docs.litellm.ai/blog/security-incident-oct-21-2026-attack-chain`) n'a pas été lue.

**Incident du 24 mars 2026** (source secondaire, pypistats) : versions 1.82.7 et 1.82.8 compromises, avec un fichier `litellm_init.pth` exécuté au démarrage de Python. Datadog relie cet incident à l'activité TeamPCP mais n'établit pas de lien avec celui d'octobre.

**Fonctions relevées (documentation officielle)** :

- **Licence** : MIT pour tout le dépôt, sauf le dossier `enterprise/` sous « BerriAI Enterprise license », réservé à un usage en production soumis aux conditions d'abonnement. GitHub affiche donc `NOASSERTION`.
- **Clés virtuelles** : `/key/generate` (paramètres `models`, `aliases`, `metadata`, `user_id`, `team_id`, `duration`, `key_alias`, `allowed_routes`), `/key/update`, `/key/delete`, `/key/block`, `/key/unblock`, `/key/{key}/regenerate`, `/key/list`, `/key/info`, `/key/service-account/generate`. Les routes ont été confirmées dans le code source du dépôt, fichier `litellm/proxy/management_endpoints/key_management_endpoints.py`.
- **Budgets** : `max_budget` en dollars, `budget_duration` (par exemple `"10d"`), budgets multiples via `budget_limits` sur `/key/update`, `temp_budget_increase` avec date d'expiration. Les alertes « soft budget » sont à peine documentées.
- **Limites** : `rpm_limit`, `tpm_limit`, `max_parallel_requests`, bornées par `upperbound_key_generate_params` (dépassement rejeté en HTTP 400).
- **Suivi** : une ligne par requête dans `LiteLLM_SpendLogs` (clé, utilisateur, équipe, tag, utilisateur final). Point de vigilance : un utilisateur final peut envoyer un autre champ `user` et échapper au suivi de la clé qui le porte.
- **Prix** : une « model cost map » par défaut, des prix personnalisés via `input_cost_per_token` et `output_cost_per_token` dans `model_info`. Une requête dont le prix manque est enregistrée à 0 $, avec un avertissement et la métrique `litellm_zero_cost_requests_total` : à surveiller pour la marge. La page « Fee/Price Margin » existe mais n'a pas été lue.
- **Fonctions entreprise** : rotation planifiée des clés, rapports de dépenses, accès non administrateur aux routes `/spend`, équipes et projets avec budgets, SSO au-delà de 5 utilisateurs, journaux d'audit, JWT, listes d'accès IP, gestionnaires de secrets (AWS, Azure, Google, Vault, CyberArk), modérations à licence. Clé de licence `LITELLM_LICENSE`, tarif sur devis, essai de 30 jours. Les garde-fous personnalisés et la détection de PII restent dans l'open source.
- **Verdict** : **écarter comme socle de production**. Deux incidents de chaîne d'approvisionnement en sept mois, sur un composant qui détient les clés fournisseurs, justifient un plan de sortie. Si LiteLLM reste en service pendant la transition, épingler `1.106.2` ou une version postérieure vérifiée, faire tourner les secrets et restreindre l'accès réseau du proxy.

### 2.2 Tableau des projets

| Projet | URL | Licence exacte | Étoiles (26 oct. 2026) | Dernier commit | Apport | Maturité | Verdict |
|---|---|---|---|---|---|---|---|
| LiteLLM | https://github.com/BerriAI/litellm | MIT ; dossier `enterprise/` sous licence BerriAI Enterprise (propriétaire) | 62 088 | 27 oct. 2026 | Clés virtuelles, budgets, limites, suivi des dépenses, prix par modèle, routage | Très adopté ; deux incidents 2026 | Écarter comme socle (section 2.1) |
| new-api | https://github.com/QuantumNous/new-api | AGPL-3.0, plus clause 7 : garder la mention « Frontend design and development by New API contributors » et le lien vers le projet d'origine | 50 745 | 25 oct. 2026 | Canaux vers fournisseurs amont, priorités et poids, quotas et abonnements, tarification par paliers, groupes, journaux d'usage et d'audit, console, playground | Forte adoption ; dérivé de One API | Référence fonctionnelle seulement (AGPL, clause d'attribution) |
| one-api | https://github.com/songquanpeng/one-api | MIT | 37 256 | 21 févr. 2025 (activité de push le 9 janv. 2026) | Ancêtre de new-api : canaux, quotas, codes de recharge | Stagnant depuis 2025 | Écarter |
| Portkey Gateway | https://github.com/Portkey-AI/gateway | MIT | 13 276 | 25 mai 2026 | Fallbacks, retries (jusqu'à 5, backoff exponentiel), répartition pondérée, plus de 40 garde-fous, clés virtuelles mentionnées ; budgets et tableaux de coûts non décrits dans l'open source | Active, mais pas de commit depuis cinq mois | À évaluer pour le routage ; gouvernance probablement côté SaaS (à confirmer) |
| Helicone | https://github.com/Helicone/helicone | Apache-2.0 | 6 239 | 20 oct. 2026 | Observabilité (coûts, latence, traces) et passerelle (routage, repli, plus de 100 modèles) | Active ; aucun avis de cessation trouvé | À évaluer pour l'observabilité, pas pour la facturation |
| TensorZero | https://github.com/tensorzero/tensorzero | Apache-2.0 | 11 709 | 4 juin 2026 ; dépôt archivé par son propriétaire le 12 juin 2026 (lecture seule) | Passerelle Rust, observabilité, évaluation, optimisation | Archivé ; cause non trouvée | Écarter |
| Bifrost | https://github.com/maximhq/bifrost | Apache-2.0 | 9 126 | 27 oct. 2026 | Passerelle Go, plus de 23 fournisseurs, API compatible OpenAI, fallbacks, répartition, clés virtuelles, budgets hiérarchiques, limites, équipes | Active ; frontière libre / entreprise floue (répartition adaptative, clustering, garde-fous et MCP cités côté entreprise) | À évaluer en priorité, après vérification de ce qui est libre |
| OpenGateLLM | https://github.com/etalab-ia/OpenGateLLM | MIT (copyright DINUM, 2024) | 217 | 23 oct. 2026 | API compatible OpenAI pensée pour les modèles auto-hébergés et la souveraineté ; déploiement Docker Compose | Bêta ; clés, budgets et facturation non décrits | Adopter comme socle de données (décision déjà prise) ; ajouter la couche comptes et crédits |
| Agent Router (ex-Envoy AI Gateway) | https://github.com/envoyproxy/ai-gateway | Apache-2.0 | 2 298 | 26 oct. 2026 | Sur Kubernetes (Envoy Gateway) : routage, repli, quotas, MCP, identifiants fournisseurs centralisés ; pas de budget explicite | Renommé ; documentation déplacée | À évaluer pour l'infrastructure Kubernetes |
| Kong Gateway (plugins IA) | https://github.com/Kong/kong ; https://developer.konghq.com/ai-gateway/ | Apache-2.0 pour Kong Gateway ; niveau des plugins IA non précisé sur la page lue | 44 306 | 19 oct. 2026 | Proxy IA, limites IA, cache sémantique, quotas de tokens, coûts | Mature | À évaluer ; matrice libre / entreprise à vérifier |
| agentgateway | https://github.com/agentgateway/agentgateway | Apache-2.0 | 5 665 | 26 oct. 2026 | LLM, MCP et A2A ; routage, limites, JWT, OAuth, RBAC | « En développement actif », pas de version publiée | À évaluer, surtout pour MCP et A2A |
| RouteLLM | https://github.com/lm-sys/RouteLLM | Apache-2.0 | 5 637 | 10 août 2024 | Routage selon la difficulté de la requête | Inactif depuis plus de deux ans | Écarter (idée utile seulement) |
| Unkey | https://github.com/unkeyed/unkey | FSL-1.1-ALv2 (source disponible, non OSI) | 5 481 | 26 oct. 2026 | Clés API avec solde (`remaining`), coût par requête, recharges, quotas, limites | Active | À évaluer comme patron ; licence à faire valider |

### 2.3 Comparatif des capacités utiles à la revente

Valeurs selon les pages officielles lues. « Non décrit » signifie que la page consultée ne le mentionne pas, pas qu'il est absent du produit.

| Capacité | LiteLLM | new-api | Bifrost | OpenGateLLM | Portkey (open source) |
|---|---|---|---|---|---|
| Clés clientes | Oui (`/key/*`) | Oui (jetons, groupes, restrictions par groupe et par modèle) | Oui (clés virtuelles) ; part libre non tranchée | Non décrit | Clés virtuelles mentionnées |
| Budgets et crédits | Oui par clé ; projets et budgets par équipe en entreprise | Quotas et abonnements (unité non précisée) | Budgets hiérarchiques ; part libre non tranchée | Non décrit | Non décrit |
| Limites de débit | Oui (rpm, tpm, parallèles) | Non décrit | Oui | « QoS avancée » non détaillée | Non décrit |
| Routage et repli | Oui | Oui (priorités, poids, nouvelles tentatives) | Oui | Non décrit | Oui |
| Prix par modèle, marges | Oui (`model_info`, model cost map) ; marges non lues | Oui (tarification par expressions et paliers) | Non décrit | Non décrit | Non décrit |
| Console d'administration | Oui | Oui (dont en français) | Oui (interface web) | Non décrite (dossier `playground`) | Console locale de journaux |
| Licence pour la revente | MIT ; fonctions entreprise payantes | AGPL-3.0 + clause d'attribution | Apache-2.0 | MIT | MIT |
| Incidents relevés | Deux en 2026 | Aucun trouvé (non recherché en profondeur) | Non recherché | Non recherché | Non recherché |

## 3. Ce que présente OpenRouter, et ce qu'il faut reproduire

Relevé sur `openrouter.ai/models`, `/providers`, `/rankings`, `/chat`, `/pricing` et `/docs/faq`, le 26 octobre 2026.

**Catalogue (`/models`)**
- Liste en cartes : logo du fournisseur, nom sous la forme « Fournisseur: Nom », fenêtre de contexte (« 262K context »), description courte, créateur et date d'ajout.
- Prix affichés par million de jetons : « $X/M input tokens » et « $X/M output tokens ». Autres unités : « $X/M tokens » pour les embeddings, « $X/K images », « $X/M characters » pour la synthèse vocale, « $X/second » pour la transcription.
- Variantes : « Free variant » (suffixe `:free`, prix à 0 $), « Batch variant » (prix réduit), mentions de fin de service datées.
- Onglets par type : Text, Image, Video, Speech, Embeddings, Rerank, Transcription, Audio, et plus. Recherche au raccourci ⌘K, comparaison de modèles, filtre avancé, affichage liste ou tableau.
- Classements par catégorie affichés sur les cartes (Programming, Science, Technology, SEO).

**Fournisseurs (`/providers`)** : 96 fournisseurs. Pour chacun : pays du siège, tokens quotidiens et mensuels, nombre de modèles, politique de données (entraînement sur les prompts, durée de conservation, liens vers les conditions), prise en charge du BYOK. La page n'affiche ni uptime ni latence.

**Pages modèle et routage** (documentation FAQ) : latence et débit par fournisseur ; routage par `:nitro` (débit), `:floor` (prix), `:exacto` (fiabilité des outils) ; bascule automatique vers un autre fournisseur en cas d'erreur 5xx ou de limitation ; liste `models` avec `route: 'fallback'`.

**Classements (`/rankings`)** : par volume hebdomadaire de tokens traités ; parts ouvert/fermé ; coût par session d'agent de code ; répartition par tâche, langue, domaine, longueur de contexte, appels d'outils, images. Le classement de qualité (benchmarks) affiche un score « Artificial Analysis Intelligence Index » et un graphique prix moyen pondéré / score avec frontière de Pareto.

**Playground (`/chat`)** : envoi du même message à plusieurs modèles, réponses côte à côte, lien vers la comparaison. Plus de 500 modèles annoncés. Mention d'avertissement sur les réponses générées par IA.

**Crédits et tarification (`/pricing`, FAQ)**

- Frais à l'achat de crédits : 5,5 % (Standard) et 8 % (Business). Paiement en USDC accepté avec les mêmes frais. Les prix d'inférence des fournisseurs ne sont pas majorés.
- Crédits : dépôts en dollars débités à chaque requête selon les tokens ; recharge manuelle ou automatique sous seuil ; historique d'usage filtrable par modèle, fournisseur et clé ; expiration des crédits inutilisés après un an, remboursement possible dans les 24 heures sauf frais.
- BYOK : 25 000 $ d'inférence au prix catalogue par mois sans frais, puis 5 % du coût catalogue de la même requête, déduit des crédits. Forfaits Enterprise sur mesure.
- Politique de données : métadonnées seules journalisées par défaut ; contenu journalisé en échange d'une remise de 1 %.
- Clés : jetons Bearer ; clés de gestion pour créer et administrer les clés par programme ; statistiques d'une génération via `/api/v1/generation`.

**API** : base `https://openrouter.ai/api/v1`, schéma très proche de l'API Chat d'OpenAI, en-tête `Authorization: Bearer`.

**À reproduire**
- Fiche par modèle : prix par million de jetons (entrée, sortie, cache), contexte, capacités, fournisseurs avec latence, débit et politique de données, date d'ajout et fin de service.
- Page fournisseur (politique de données, BYOK, pays).
- Playground multi-modèles et comparaison.
- Journal d'activité par modèle, fournisseur et clé.
- Clés de gestion pour automatiser la création de clés clientes.
- Recharge automatique sous seuil.
- Variantes de routage (débit, prix, fiabilité) et repli automatique.

**À ne pas copier sans réflexion**
- Frais de 5,5 % à 8 % sur l'achat de crédits : à comparer avec les coûts de paiement réels de Nexora.
- Classements publics d'usage : ils reposent sur un volume qui n'existe pas au départ. Mieux vaut publier les statistiques de Nexora sur ses propres modèles.

**Conditions de revente OpenRouter** : non lues dans cette recherche. Les conditions du fournisseur amont doivent être vérifiées avant de revendre des modèles OpenRouter.

## 4. Serveurs de modèles auto-hébergés

| Projet | URL | Licence exacte | Étoiles | Dernier commit | Apport | Maturité | Verdict |
|---|---|---|---|---|---|---|---|
| vLLM | https://github.com/vllm-project/vllm | Apache-2.0 | 95 632 | 27 oct. 2026 | Serveur compatible OpenAI (`/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/models`) ; clé API (`--api-key`) ; files bornées : `--max-num-seqs`, `--max-num-active-seqs`, `--max-num-queued-reqs` (HTTP 503 au-delà), `--max-num-queued-tokens` | Très élevée | Adopter : moteur GPU principal |
| SGLang (SGLang Model Gateway) | https://github.com/sgl-project/sglang | Apache-2.0 | 38 220 | 27 oct. 2026 | Passerelle de routage : politiques cache-aware, power-of-two, round-robin ; nouvelles tentatives avec gigue ; disjoncteurs par worker ; contrôles de santé ; limitation de débit avec file ; métriques Prometheus | Élevée | À évaluer pour le routage entre plusieurs workers |
| Ollama | https://github.com/ollama/ollama | MIT | 184 901 | 27 oct. 2026 | `OLLAMA_NUM_PARALLEL` (1 par défaut), `OLLAMA_MAX_QUEUE` (512 par défaut, HTTP 503 au-delà), `OLLAMA_MAX_LOADED_MODELS` (3 par GPU), `keep_alive` (5 minutes) ; écoute sur 127.0.0.1:11434 par défaut | Élevée | Adopter pour le développement et les petits modèles, derrière la passerelle uniquement |
| llama.cpp (llama-server) | https://github.com/ggml-org/llama.cpp | MIT | 132 468 | 26 oct. 2026 | `--parallel`, batching continu, `--api-key` ou `--api-key-file`, `/metrics` avec `--metrics`, mode routeur (`--models-dir`, `--models-max` à 4 par défaut, `--models-autoload`) | Très élevée | Adopter pour CPU, périphérie et petits déploiements |
| llama-swap | https://github.com/mostlygeek/llama-swap | MIT | 6 092 | 26 oct. 2026 | Changement de modèle à la demande derrière une API OpenAI et Anthropic ; déchargement après `ttl` ; backends llama.cpp, vLLM, tabbyAPI | Active | À évaluer pour plusieurs modèles sur un même GPU |
| Text Generation Inference | https://github.com/huggingface/text-generation-inference | Apache-2.0 | 10 882 | 21 mars 2026 ; archivé le 21 mars 2026 | Serveur Hugging Face | Archivé | Écarter |
| LocalAI | https://github.com/mudler/LocalAI | MIT | 49 985 | 26 oct. 2026 | Alternative multi-backends compatible OpenAI | Active | À évaluer (non prioritaire) |

**Routage, file d'attente et repli (recommandation)**

- Les files d'attente des moteurs (vLLM : 503 au-delà de `--max-num-queued-reqs` ; Ollama : 503 au-delà de 512) doivent être gérées par la passerelle : délai maximal, nouvelle tentative sur un autre worker, puis repli vers un fournisseur cloud du même modèle.
- Un disjoncteur par worker évite d'envoyer du trafic à un GPU en panne.
- Les moteurs ne doivent jamais être exposés directement aux clients. Ollama n'a pas d'authentification native documentée dans sa FAQ.
- Un GPU partagé entre plusieurs modèles peut passer par llama-swap ou le mode routeur de llama.cpp, avec un `ttl` court.

## 5. Agents hébergés exposés par API

| Projet | URL | Licence exacte | Étoiles | Dernier commit | Apport | Maturité | Verdict |
|---|---|---|---|---|---|---|---|
| Agno (AgentOS) | https://github.com/agno-agi/agno | Apache-2.0 | 42 905 | 26 oct. 2026 | FastAPI qui sert agents, équipes et workflows par API ; état en base de données ; RBAC par JWT ; clé de sécurité partagée ; comptes de service ; isolation par utilisateur ; Control Plane web (hébergement non précisé) | Active | Adopter comme runtime d'agents à évaluer en premier |
| Letta | https://github.com/letta-ai/letta | Apache-2.0 | 25 262 | 18 oct. 2026 | Agents avec état et mémoire longue ; App Server auto-hébergeable ; offre Letta Cloud (tarif non lu) | Active | À évaluer pour les agents à mémoire |
| LangGraph | https://github.com/langchain-ai/langgraph | MIT (bibliothèque) | 43 942 | 26 oct. 2026 | Bibliothèque d'agents. Serveur auto-hébergé soumis à une clé de licence LangSmith Enterprise (add-on payant) | Active | Écarter pour l'auto-hébergement sans contrat ; SDK à évaluer |
| Dify | https://github.com/langgenius/dify | Licence Dify (Apache-2.0 modifiée) : service multi-tenant interdit sans accord écrit (un tenant = un espace de travail) ; logo et copyright à conserver | 159 632 | 26 oct. 2026 | API par application ; une clé par application, partagée par les utilisateurs finaux ; à appeler depuis le backend seulement | Très active | Écarter pour la revente (cohérent avec la décision déjà prise) |
| Sim (base de WorkStudio) | https://github.com/simstudioai/sim | Apache-2.0 hors `apps/sim/ee/` ; `apps/sim/ee/` sous Sim Enterprise License (production soumise à un abonnement) | 29 924 | 25 oct. 2026 | API v2 : `POST /api/v2/workflows/{id}/execute`, en-tête `X-API-Key`, mode asynchrone (HTTP 202 avec `runId`), limites par identifiant (HTTP 429 avec `Retry-After`) ; clés personnelles ou d'espace de travail ; SDK TypeScript et Python, CLI | Active | Adopter pour WorkStudio, sans `ee/` ; exposer via la passerelle (clés clientes gérées par Nexora) |
| Mastra | https://github.com/mastra-ai/mastra | Apache-2.0 hors `ee/` ; `ee/` sous Mastra Enterprise Edition License v2.0 (en vigueur le 22 sept. 2026), sans production sans licence | 29 095 | 27 oct. 2026 | Serveur HTTP (Hono), déploiement autonome ou sur plateformes | Active | À évaluer hors `ee/` ; exclure les modules `ee/` |
| Flowise | https://github.com/FlowiseAI/Flowise | Non déterminée (fichier LICENSE introuvable) | 55 531 | 13 août 2026 ; archivé le 13 août 2026 | Éditeur visuel d'agents | Archivé | Écarter |
| A2A (protocole) | https://github.com/google-a2a/A2A | Apache-2.0 | 26 305 | 20 oct. 2026 | Protocole d'interopérabilité entre agents, spécification 1.0, gouvernance Linux Foundation | Actif | Adopter comme protocole de référence (pas un runtime) |
| CrewAI | https://github.com/crewAIInc/crewAI | MIT | 60 136 | 26 oct. 2026 | Orchestration multi-agents | Active | À évaluer (API non étudiée) |
| Langflow | https://github.com/langflow-ai/langflow | MIT | 156 042 | 22 oct. 2026 | Éditeur visuel, flux exposés en API | Active | À évaluer (plan C déjà noté) |

**Exposer les agents WorkStudio par API (option retenue pour l'étude)**

- Faisable techniquement : la passerelle reçoit `POST /v1/agents/{id}/runs` avec la clé client, vérifie les crédits, appelle l'API de workflows de WorkStudio avec une clé de service, relaie le flux, puis décompte.
- Limites à traiter : une clé Sim est liée à un utilisateur ou à un espace de travail, pas à un client. Les limites Sim s'appliquent par identifiant. La passerelle doit donc isoler chaque client et ne jamais exposer la clé de service.
- Le document Sim décrit des workflows, pas des agents conversationnels : la forme exacte des « agents » de WorkStudio reste à définir.
- Les workflows doivent être déployés pour être appelables par API ; le déploiement exige le rôle Admin de l'espace de travail.

## 6. Facturation à l'usage

| Projet | URL | Licence exacte | Étoiles | Dernier commit | Apport | Maturité | Verdict |
|---|---|---|---|---|---|---|---|
| Stripe Billing (usage-based) | https://docs.stripe.com/billing/subscriptions/usage-based | Propriétaire, SaaS | n.a. | n.a. | Meters API (de base, toujours pris en charge) ; Metronome, désormais chez Stripe, recommandé pour les nouveaux projets : crédits prépayés, burndown, contrats, plafonds | Production | Adopter pour l'encaissement et les abonnements |
| Lago | https://github.com/getlago/lago | AGPL-3.0 (racine) | 10 714 | 26 oct. 2026 | Mesure d'usage, portefeuilles de crédits payés et offerts, recharges manuelles ; recharges automatiques réservées à la licence premium | Active | À évaluer en priorité pour l'agrégation et les crédits |
| OpenMeter | https://github.com/openmeterio/openmeter | Apache-2.0 | 2 411 | 26 oct. 2026 | Événements, compteurs, entitlements et limites ; intégration Stripe listée ; présenté comme « OpenMeter by Kong » | Active | À évaluer pour le métrage seul ; crédits non vérifiés |
| Kill Bill | https://github.com/killbill/killbill | Apache-2.0 | 5 822 | 23 oct. 2026 | Moteur complet d'abonnements et de facturation (Java) | Active | À évaluer ; lourd, non prioritaire |
| Langfuse | https://github.com/langfuse/langfuse | MIT hors dossiers `ee/` | 36 542 | 26 oct. 2026 | Traces, coûts, évaluation | Active | À évaluer pour l'observabilité, pas pour la facturation |
| Unkey | https://github.com/unkeyed/unkey | FSL-1.1-ALv2 | 5 481 | 26 oct. 2026 | Solde par clé : décrément à chaque vérification, coût variable, recharges quotidiennes ou mensuelles, quotas | Active | Patron à reprendre ; dépendance à éviter sans validation juridique |

**Constats détaillés**

- **Stripe** : Metronome est présenté comme la plateforme principale pour les nouvelles intégrations, avec crédits prépayés et burndown. Les Meters restent maintenus pour les intégrations existantes.
- **Lago** : un achat de crédits génère une facture, et les crédits n'arrivent dans le portefeuille qu'après paiement. Les taxes ne s'appliquent pas aux achats de crédits, traités comme avances. Les coupons ne s'appliquent pas aux recharges. Un client n'a qu'un portefeuille actif, et la devise du portefeuille doit correspondre à celle de la facture. Les informations proviennent d'extraits de recherche des pages de documentation de Lago (`docs.getlago.com/guide/wallet-and-prepaid-credits/`), la page complète n'a pas été lue.
- **Unkey** : `credits.remaining` vide signifie clé illimitée. Chaque vérification consomme 1 par défaut, ou `credits.cost`. Le solde ne descend jamais sous zéro, et une recharge remplace le solde au lieu de l'augmenter. La page ne précise pas si la fonction est incluse dans le plan gratuit.

**Recommandation de facturation**

1. Un ledger maison sur PostgreSQL pour le chemin critique : réservation du montant maximal estimé, débit réel à la fin de la requête, montants en micro-dollars entiers, idempotence par `request_id`.
2. Export périodique vers Lago (agrégation, factures, portefeuilles) ou vers Stripe Metronome, selon la décision de l'étape (b).
3. Stripe pour l'encaissement des achats de crédits et des abonnements.
4. Taxes du Québec (TPS et TVQ) : à configurer et à faire valider par un comptable.

## 7. Architecture passerelle recommandée

### 7.1 Composants

```
Clients (applications, WorkStudio, Assistant, intégrations)
        | HTTPS, en-tête Authorization: Bearer <clé Nexora>
        v
Nexora API (fork OpenGateLLM)
  - authentification des clés (hachées, préfixe affiché, valeur affichée une seule fois)
  - autorisation par modèle, limites RPM et TPM, plafonds par clé
  - alias de modèles, réservation de crédits, décompte
  - journal d'usage (métadonnées par défaut, contenu seulement si le client y consent)
        |
        +--> Ledger de crédits (PostgreSQL) <--> Stripe (achats, abonnements, webhooks)
        |                                  <--> Lago ou export mensuel (factures, agrégation)
        v
Routeur de fournisseurs : priorités, repli, nouvelles tentatives, disjoncteurs, délai maximal
        +--> vLLM / SGLang (GPU au Québec) pour les modèles auto-hébergés
        +--> llama.cpp / Ollama (petits modèles, développement)
        +--> fournisseurs cloud par adaptateurs (OpenRouter, clés dans un coffre)

Admin Directus : fournisseurs, modèles, prix, marges, quotas, agents, clés
Agents : Nexora Agents API --> WorkStudio (API Sim v2) ; Agno AgentOS ou Letta pour le code
```

### 7.2 Flux client : inscription, crédits, clé, appel, décompte

1. **Inscription** : création d'une organisation, vérification du courriel. Le SSO est un plus pour les équipes (gratuit jusqu'à 5 utilisateurs sur LiteLLM, à vérifier pour le choix final).
2. **Crédits** : achat par Stripe Checkout, ou abonnement qui accorde des crédits offerts à expiration de période. Le webhook Stripe crédite le ledger. Les taxes québécoises sont appliquées.
3. **Clé** : création dans le portail, avec nom, modèles autorisés, plafond de dépense, limites de débit et date d'expiration. La valeur est affichée une seule fois et stockée sous forme hachée. Une clé de gestion permet d'automatiser ces opérations.
4. **Appel** : `POST https://api.<domaine>/v1/chat/completions`, `/v1/embeddings`, `/v1/models`, ou `/v1/agents/{id}/runs` pour les agents.
5. **Contrôles** : clé valide, modèle autorisé, limites RPM et TPM, solde suffisant pour le montant maximal estimé (réservation).
6. **Routage** : alias vers le fournisseur prioritaire (par exemple vLLM au Québec). Repli en cas de délai, de 503 ou d'erreur 5xx. Disjoncteur par worker.
7. **Réponse** en flux continu. Les jetons remontés par le fournisseur (entrée, sortie, cache, raisonnement) sont multipliés par le prix en vigueur à la date de la requête, puis la marge est appliquée.
8. **Décompte** : débit définitif du ledger, événement d'usage idempotent (`request_id`), agrégation horaire, facture mensuelle (Lago ou Stripe), alertes de solde bas, recharge automatique sous seuil.

### 7.3 Ce qui se configure dans l'administration Directus

- **Fournisseurs** : type (OpenRouter, vLLM, SGLang, llama.cpp, Ollama, Agno, WorkStudio), adresse, référence à la clé dans le coffre (jamais la clé en clair dans Directus), zone géographique d'hébergement (Québec, Canada, États-Unis, Europe), politique de données déclarée, quotas amont, priorité, statut de santé.
- **Modèles** : identifiant public, alias, contexte maximal, capacités (vision, outils, raisonnement), fournisseurs ordonnés, visibilité par forfait, date de fin de service.
- **Prix** : coût amont et prix de vente par unité (million de jetons en entrée, sortie et cache ; image ; seconde ; exécution d'agent). Historique daté : un changement de prix ne touche jamais les requêtes passées.
- **Marges** : marge par défaut, par modèle, par client ou contrat, avec un plancher de marge qui bloque une publication sous le coût.
- **Quotas** : par forfait (crédits inclus, RPM, TPM, concurrence) ; par clé (plafond de dépense, modèles, expiration) ; par organisation (budget mensuel, seuils d'alerte).
- **Agents** : identifiant du workflow, version déployée, prix par exécution ou par jeton, quotas, clés autorisées.
- **Exploitation** : durée de conservation des journaux, régions autorisées, consentement à la journalisation des contenus, rotation des clés fournisseurs, journal d'audit des modifications.

### 7.4 Sécurité et exploitation

- Épingler les versions et les digests d'images. Aucun `pip install` automatique dans les environnements de production.
- Surveiller les dépendances et les avis de sécurité, en particulier LiteLLM tant qu'il est utilisé.
- Les clés fournisseurs et les clés de service vivent dans un coffre. Les clés clientes sont hachées.
- Journaux : métadonnées seules par défaut, comme OpenRouter. Le contenu n'est conservé qu'avec un consentement explicite.
- Tests de rotation des secrets au moins une fois par trimestre.

## 8. Risques juridiques et points ouverts

| Sujet | Constat | Action |
|---|---|---|
| LiteLLM | MIT pour le cœur, `enterprise/` payant ; deux incidents en 2026 | Plan de sortie ; réviser la décision avant toute mise en production |
| new-api | AGPL-3.0 avec clause d'attribution | Pas de code copié ; référence fonctionnelle seulement |
| Lago | AGPL-3.0 ; recharges automatiques en licence premium | Si modifié et exposé au réseau, publier les modifications ; valider la version premium |
| Unkey | FSL-1.1-ALv2 : usage concurrentiel restreint, passage à Apache-2.0 après deux ans | Validation juridique avant tout usage en production |
| Sim | `apps/sim/ee/` : production interdite sans abonnement | Retirer `ee/` (décision déjà prise) ; jamais le lire ni le copier |
| Dify | Multi-tenant interdit sans accord écrit | Exclu pour la revente |
| LangSmith / LangGraph auto-hébergé | Clé de licence et abonnement Enterprise | Exclu sans contrat |
| Mastra | `ee/` : licence Enterprise v2.0, production non permise sans licence | Exclure les modules `ee/` |
| OpenRouter | Conditions de revente non lues | Vérifier avant de revendre des modèles OpenRouter |
| Données | La politique de données varie par fournisseur (OpenRouter en publie une liste) | Déclarer la politique par modèle ; valider les obligations de la Loi 25 du Québec |
| Fiscalité | TPS et TVQ sur les crédits et les abonnements | Faire valider par un comptable |

**Points non vérifiés ou incomplets**

- Kong : niveaux libres et entreprise des plugins IA non trouvés sur la page lue.
- Bifrost : frontière entre fonctions libres et entreprise à confirmer dans le code.
- Portkey : présence des budgets dans l'open source non confirmée.
- Unkey : disponibilité sur le plan gratuit non précisée.
- SGLang : documentation consultée via une source secondaire (`lmsysorg.mintlify.app`), pages officielles `docs.sglang.io` introuvables.
- vLLM : seule la page de référence des arguments a été lue, sur plus de 130 000 caractères, les 30 000 derniers caractères n'ont pas été lus.
- Lago : pages de documentation lues via des extraits de recherche, pas en entier.
- Letta et Agno : tarifs et modèles d'hébergement non détaillés.
- Kill Bill, LocalAI, CrewAI et Langflow : métadonnées vérifiées, fonctions non étudiées en détail.
- Envoy AI Gateway : la documentation redirige vers un autre domaine (`theagentrouter.ai`), dont le lien avec le projet d'origine n'a pas été vérifié au-delà de la mention du README.

## 9. Sources

Consultées le 26 octobre 2026, sauf mention contraire.

**Incidents**
- Billet LiteLLM, incident du 21 octobre 2026 : https://docs.litellm.ai/blog/security-incident-oct-21-2026 (mis à jour le 23 octobre 2026)
- Datadog Security Labs, compromission PyPI et Docker de LiteLLM : https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-docker/
- Incident de mars 2026 (source secondaire) : https://pypistats.com/blog/litellm-pypi-supply-chain-compromise-how-a-popular-llm-proxy-became-a-credential-stealing-backdoor-march-24-2026

**LiteLLM**
- Dépôt : https://github.com/BerriAI/litellm ; licence : https://raw.githubusercontent.com/BerriAI/litellm/main/LICENSE ; licence entreprise : https://raw.githubusercontent.com/BerriAI/litellm/main/enterprise/LICENSE.md
- Clés virtuelles : https://docs.litellm.ai/docs/proxy/virtual_keys
- Suivi des dépenses : https://docs.litellm.ai/docs/proxy/cost_tracking
- Fonctions entreprise : https://docs.litellm.ai/docs/enterprise
- Routes de gestion des clés (code source) : https://github.com/BerriAI/litellm/blob/main/litellm/proxy/management_endpoints/key_management_endpoints.py

**OpenRouter**
- Catalogue : https://openrouter.ai/models ; fournisseurs : https://openrouter.ai/providers ; classements : https://openrouter.ai/rankings ; playground : https://openrouter.ai/chat ; tarification : https://openrouter.ai/pricing ; FAQ : https://openrouter.ai/docs/faq ; référence API : https://openrouter.ai/docs/api-reference/overview

**Gateways et proxys**
- new-api : https://github.com/QuantumNous/new-api ; one-api : https://github.com/songquanpeng/one-api ; Portkey : https://github.com/Portkey-AI/gateway ; Helicone : https://github.com/Helicone/helicone ; TensorZero : https://github.com/tensorzero/tensorzero ; Bifrost : https://github.com/maximhq/bifrost ; OpenGateLLM : https://github.com/etalab-ia/OpenGateLLM ; Envoy AI Gateway : https://github.com/envoyproxy/ai-gateway ; Kong : https://developer.konghq.com/ai-gateway/ ; agentgateway : https://github.com/agentgateway/agentgateway ; RouteLLM : https://github.com/lm-sys/RouteLLM ; Unkey : https://github.com/unkeyed/unkey (licence brute : https://raw.githubusercontent.com/unkeyed/unkey/HEAD/LICENSE)
- Documentation Unkey (crédits) : https://www.unkey.com/docs/apis/features/remaining

**Serveurs de modèles**
- vLLM : https://github.com/vllm-project/vllm ; arguments : https://docs.vllm.ai/en/latest/cli/serve/ ; serving : https://docs.vllm.ai/en/latest/serving/online_serving/
- SGLang : https://github.com/sgl-project/sglang ; passerelle (source secondaire) : https://lmsysorg.mintlify.app/docs/advanced_features/sgl_model_gateway
- Ollama : https://github.com/ollama/ollama ; FAQ : https://docs.ollama.com/faq
- llama.cpp : https://github.com/ggml-org/llama.cpp ; README serveur : https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- llama-swap : https://github.com/mostlygeek/llama-swap
- TGI : https://github.com/huggingface/text-generation-inference ; LocalAI : https://github.com/mudler/LocalAI

**Agents**
- Agno : https://github.com/agno-agi/agno ; AgentOS : https://docs.agno.com/agent-os/introduction
- Letta : https://github.com/letta-ai/letta ; documentation : https://docs.letta.com/
- LangGraph : https://github.com/langchain-ai/langgraph ; LangSmith auto-hébergé : https://docs.langchain.com/langsmith/self-hosted
- Dify : https://github.com/langgenius/dify ; licence : https://raw.githubusercontent.com/langgenius/dify/HEAD/LICENSE ; API : https://docs.dify.ai/en/guides/application-publishing/developing-with-apis
- Sim : https://github.com/simstudioai/sim ; licence racine : https://raw.githubusercontent.com/simstudioai/sim/HEAD/LICENSE ; licence du dossier `ee/` (texte seul) : https://raw.githubusercontent.com/simstudioai/sim/HEAD/apps/sim/ee/LICENSE ; API v2 : https://docs.sim.ai/api-reference/getting-started
- Mastra : https://github.com/mastra-ai/mastra ; licence : https://github.com/mastra-ai/mastra/blob/main/LICENSE.md ; licence `ee/` : https://raw.githubusercontent.com/mastra-ai/mastra/HEAD/ee/LICENSE ; déploiement : https://mastra.ai/docs/deployment/overview
- Flowise : https://github.com/FlowiseAI/Flowise
- A2A : https://github.com/google-a2a/A2A ; site : https://a2a-protocol.org/latest/
- CrewAI : https://github.com/crewAIInc/crewAI ; Langflow : https://github.com/langflow-ai/langflow

**Facturation**
- Stripe, facturation à l'usage : https://docs.stripe.com/billing/subscriptions/usage-based
- Lago : https://github.com/getlago/lago ; portefeuilles (extraits de recherche) : https://docs.getlago.com/guide/wallet-and-prepaid-credits/overview
- OpenMeter : https://github.com/openmeterio/openmeter ; documentation : https://openmeter.io/docs
- Kill Bill : https://github.com/killbill/killbill ; Langfuse : https://github.com/langfuse/langfuse

**Compléments**
- TensorZero : archivage confirmé sur la page du dépôt ; la recherche n'a trouvé aucune annonce de l'éditeur.
