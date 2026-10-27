# Recherche 03 : Directus et autogestion du site Nexora par des agents IA

**Date de rédaction :** 26 octobre 2026
**Périmètre :** Directus comme CMS et panneau d'administration ; Flows, extensions, MCP, IA intégrée ; gabarits Next.js ; passerelle LiteLLM ; rôles, versions, journal, planification ; architecture d'administration recommandée.
**Méthode :** chaque affirmation vient d'une page officielle, d'un dépôt, d'une release ou d'un paquet lu à la date de consultation (26 octobre 2026). Les sources secondaires (blogues, forums, extraits de moteurs) sont signalées comme telles. Les chiffres d'étoiles et de forks sont ceux affichés à la consultation.
**Ce qui n'a pas été fait :** aucune installation, aucun clonage de dépôt, aucune lecture ni affichage de secret, aucune modification de fichier hors de ce rapport.

---

## 1. Synthèse

1. **Dernière version stable : Directus 12.5.1**, publiée le **23 octobre 2026** (correctifs de sécurité et mises à jour de dépendances). La 12.5.0 date du 7 octobre 2026 et contient les changements « potentiellement incompatibles » sur l'application de la double authentification (2FA) et sur la gestion de licence.
2. **Licence : Directus n'est plus sous BSL 1.1.** Depuis la v12, le dépôt est sous **MSCL-1.0-GPL** (Monospace Sustainable Core License 1.0). Ce n'est pas une licence open source au sens de l'OSI : l'usage est libre sauf la « concurrence » (*Competing Use*), et chaque version passe sous GPL-3.0 quatre ans après sa publication. Un juriste doit valider l'usage prévu par Nexora, surtout l'hébergement pour des clients.
3. **Seuils officiels :** l'**Open Innovation Grant** est gratuit pour les entités de moins de 5 M$ de chiffre d'affaires annuel **et** de moins de 50 employés. Sinon : Core gratuit (3 sièges, 25 collections, 5 flows), Team (50 collections, 20 flows, 10 sièges SSO), Enterprise sur devis.
4. **Prix contradictoires sur la page officielle** pour Team (588 $ ou 698 $ par mois dans la grille, 499 $ ou 599 $ dans la FAQ). À confirmer avec Directus avant tout budget.
5. **Le modèle de données proposé (environ 37 collections, 15 à 25 flows) dépasse le plan Core.** Il faut Team au minimum, ou l'Open Innovation Grant si Nexora est éligible. Le journal d'activité et l'historique des révisions sont conservés 30 jours (Core) ou 90 jours (Team) : il faut un export pour auditer les agents.
6. **Flows et extensions** couvrent l'orchestration. Le **MCP officiel est natif** depuis Directus 11.12 (`/mcp`). Le MCP communautaire `directus/mcp` n'a pas bougé depuis le 14 mai 2025 : écarté. Les agents doivent être des utilisateurs API seulement, sans accès à l'application, ce qui ne consomme pas de siège (à tester).
7. **Gabarit Next.js :** `directus-labs/starters` (MIT, mis à jour le 23 octobre 2026) est la base recommandée. **AgencyOS est en Nuxt 3 et inactif depuis le 26 mars 2025 : écarté.**
8. **Validation humaine :** les *versions de contenu* (brouillon, publication après comparaison) sont la primitive native. **La planification de publication n'apparaît pas dans la documentation consultée** : il faut prévoir un Flow CRON. **Test bloquant :** une écriture API sur l'élément publié contourne-t-elle les versions ?
9. **LiteLLM** se branche à Directus comme fournisseur compatible OpenAI (Paramètres → IA). Limites : tous les utilisateurs de l'assistant partagent une seule clé, donc un seul budget ; la grille tarifaire range « Custom LLM » parmi les fonctions Enterprise, à confirmer pour Core et Team. Des clés virtuelles LiteLLM par agent donnent des budgets séparés.
10. **Sécurité LiteLLM :** deux compromissions de paquets PyPI en 2026 (24 mars : versions 1.82.7 et 1.82.8 ; 21 octobre : version 1.107.0, retirée). LiteLLM recommande de rester sur la 1.106.2 jusqu'à nouvel avis. Verdict : **à évaluer sous conditions strictes**.

---

## 2. Directus : version, licence et implications pour Nexora

### 2.1 Dernière version stable

| Élément | Constat | Source |
|---|---|---|
| Version stable la plus récente | **v12.5.1**, publiée le 23 oct. 2026 (correctifs, dépendances : `nodejs`, `dompurify`, `follow-redirects`, `hono`…). Paquets : `@directus/app` 18.1.1, `@directus/api` 40.0.1 | https://github.com/directus/directus/releases/tag/v12.5.1 |
| Version précédente | **v12.5.0**, publiée le 7 oct. 2026 : nouveau paramètre « Preview Base URL » (aperçu), activation/désactivation groupée des Flows, liens d'image dans l'éditeur WYSIWYG, avertissements sur la politique *Public*, correctif des doublons de traduction IA, mises à jour CVE, SDK 27.0.0 | https://github.com/directus/directus/releases/tag/v12.5.0 |
| Changements « potentiellement incompatibles » en 12.5.0 | Application de la 2FA selon les permissions effectives (IP incluses) ; nouvelle gestion de licence ; suppression de la dépendance `ip-matching` (sous-réseaux mal formés refusés) ; `CACHE_SCHEMA_MAX_ITERATIONS` supprimée, `CACHE_SCHEMA_SYNC_TIMEOUT` vaut 60 000 ms par défaut | même page |
| Rythme | « Environ une fois par mois » selon la documentation des versions | https://directus.com/docs/releases |
| Version 12 | Lancée en mai 2026, annoncée par le CEO le 22 avr. 2026 | https://directus.com/resources/directus-v12-license-change |
| Activité du dépôt | Dépôt : 38,6 k étoiles, 5,0 k forks ; dernier commit sur `main` le 26 oct. 2026 (« Fix flaky policy cache clear timing test (#28411) ») ; 19 commits sur `main` après la v12.5.1 | https://github.com/directus/directus |

### 2.2 Licence exacte

- **Nom :** Monospace Sustainable Core License, Version 1.0 ; abréviation **MSCL-1.0-GPL** ; copyright 2026 Monospace Inc. Le fichier `license` à la racine est identique sur `main` et sur le tag `v12.5.1`.
- **Ce qui est permis :** utiliser, copier, modifier, créer des œuvres dérivées, redistribuer, pour tout *Permitted Purpose*, c'est-à-dire tout usage autre qu'une *Competing Use*. Usages explicitement permis : usage interne ; éducation non commerciale ; recherche non commerciale ; services professionnels rendus à un licencié, y compris **déployer ou héberger le logiciel pour ce licencié**.
- **Concurrence interdite (*Competing Use*) :** mettre le logiciel à disposition d'un tiers, seul ou avec ses produits ou services, en concurrence avec les offres commerciales de l'éditeur sur ce même logiciel, lorsque l'éditeur impose des frais pour l'exercer.
- **Contournement interdit :** ne pas modifier, désactiver ou contourner la fonction de clé de licence pour débloquer des fonctions protégées ou en retirer.
- **Redistribution :** les copies doivent garder la licence et ne peuvent pas être soumises à des restrictions ou frais supplémentaires.
- **Conversion :** « Grant of Future License » : chaque version passe sous **GPL-3.0** au quatrième anniversaire de sa mise à disposition.
- **Dérivée de :** Fair Core License (FCL), selon l'annonce officielle.
- **SDK :** les SDK et d'autres projets (`rstore`, `vue-split-panel`) restent sous **MIT** (annonce officielle).
- **Historique :** BSL 1.1 pendant environ trois ans, avec une « usage grant » gratuite pour moins de 5 M$ de « total finances ». Consultation communautaire ouverte le 2 avr. 2026 (plus de 100 messages). Annonce officielle du 22 avr. 2026 par Benjamin Haynes (CEO).
- **Clés de licence :** format `DXXXX-XXXXX-XXXXX-XXXXX-XXXXC`, liées à une instance et à son `PUBLIC_URL`. Variable `LICENSE_KEY` (environnement) ou saisie dans le Studio (Paramètres → Licence). Les **jetons de licence hors ligne** (`LICENSE_TOKEN`) sont réservés aux offres Enterprise.

Sources : https://raw.githubusercontent.com/directus/directus/v12.5.1/license ; https://directus.com/resources/directus-v12-license-change ; https://community.directus.com/t/directus-license-revision-community-feedback-requested/2125 ; https://directus.com/docs/licensing/overview

> **Source secondaire :** un message Reddit cité dans un extrait de recherche indique qu'un client a renoncé à Directus à cause d'un modèle « 5 à 50 utilisateurs ». Message non lu en entier et daté au hasard : à traiter comme un signal, pas comme un fait.

### 2.3 Offres et seuils (page officielle, consultée le 26 oct. 2026)

| Offre | Prix affiché | Limites et fonctions | Remarques |
|---|---|---|---|
| **Core, auto-hébergé** | Gratuit, sans clé | 3 sièges ; 25 collections ; 5 flows ; Assistant IA ; RBAC avancé ; support communautaire ; journal et révisions sur 30 jours | Fonctionne sans licence |
| **Core, cloud** | 89 $/mois (annuel) ou 99 $/mois | Mêmes limites | Hébergement Directus |
| **Team** | **Contradictoire** : 588 $/mois annuel ou 698 $ mensuel dans la grille ; 499 $/mois annuel (5 988 $/an) ou 599 $ mensuel dans la FAQ | 10 sièges SSO (extra : 50 $/siège/mois) ; 50 collections (extensibles à 100 ; extra : 100 $/25 collections) ; 20 flows ; RBAC granulaire ; support de base ; journal et révisions sur 90 jours | SSO inclus |
| **Enterprise** | Sur devis | SSO SAML/OIDC ; mode hors ligne ; « Custom LLM » ; traductions IA ; désactivation de la télémétrie ; flows illimités ; rétention configurable ; support premium | La répartition exacte des fonctions par colonne est illisible dans l'extrait : à confirmer |
| **Open Innovation Grant** | **Gratuit** | CA annuel **< 5 M$** **et** **< 50 employés** ; « aucune limite de fonctionnalité » ; auto-hébergement gratuit ; clé d'inscription ; **5 activations** (local, dev, préprod, prod) | Éligibilité jugée sur les entités dont les représentants se connectent au Studio |

Sources : https://directus.com/pricing ; https://directus.com/docs/licensing/overview

> **Anomalie :** une ancienne page `directus.io/pricing/self-hosted` évoque une « Production License » à 999 $/mois (5 sièges) selon un extrait de moteur. Non vérifiée, et plus récente page officielle à privilégier.

### 2.4 Ce que cela implique pour Nexora (à faire valider par un juriste et par Directus)

a. **Éligibilité à l'Open Innovation Grant.** Nexora doit vérifier son chiffre d'affaires et son effectif. Si Nexora héberge une instance par client, il faut aussi vérifier chaque entité dont les représentants se connectent au Studio.

b. **Hébergement pour des clients.** La licence autorise les « services professionnels… incluant déployer ou héberger le logiciel pour le licencié ». La question ouverte est de savoir si un service d'hébergement Directus facturé à des clients constitue une *Competing Use* au sens de la licence. Aucune conclusion juridique n'est tirée ici.

c. **Respect des mécanismes de licence.** Il faut éviter tout contournement des limites de sièges ou de collections : la licence l'interdit.

d. **Sièges.** Un siège est consommé par chaque utilisateur qui a l'accès à l'application (*App Access*) ou l'accès administrateur. Les utilisateurs API seulement (clients finaux, comptes de service, jetons statiques) ne consomment pas de siège. Conséquence : **les agents doivent être des utilisateurs API seulement** (à tester).

e. **Collections.** Comptent : les collections utilisateur, les collections de traduction (`articles_translations`, etc.), les tables de jonction. Ne comptent pas : les collections système `directus_*`, les dossiers, les tables sans métadonnées Directus.

f. **Flows.** Core : 5 ; Team : 20 ; Enterprise : illimité.

g. **Mode verrouillé.** Si l'instance dépasse ses droits et que la période de grâce est écoulée, les API GraphQL, WebSocket **et MCP** sont désactivées. L'agent s'arrêterait donc en même temps que le site.

h. **`PUBLIC_URL`** doit être une URL absolue avant toute activation. Changer l'URL sans réactiver la licence rétrograde l'instance vers Core au bout du délai.

i. **Désactiver la licence avant de détruire une instance.** Sinon l'activation reste liée et consomme une des 5 activations de l'Open Innovation Grant ; aucun moyen en libre-service de la libérer.

j. **Connexion sortante** vers `https://licensing.directus.com` requise en mode en ligne. Le mode hors ligne n'existe que pour Enterprise.

k. **Journal et révisions :** 30 jours en Core, 90 jours en Team. Pour l'audit des agents, il faut exporter ou conserver les traces dans une collection maison (`agent_runs`).

l. **Conformité :** la page tarifaire affiche SOC 2 Type II et RGPD. Le rapport SOC 2 se trouve sur le Trust Center (`trust.directus.com`), non consulté ici.

Source : https://directus.com/docs/licensing/overview ; https://directus.com/pricing

---

## 3. Flows, extensions, MCP officiel et intégrations IA

### 3.1 Flows (intégrés au cœur)

**Cinq types de déclencheurs** (https://directus.com/docs/guides/flows/triggers) :

- **Événement (*Event Hook*)** : basé sur les hooks API ; le déclencheur « Filter (Blocking) » annule la transaction si le flow se termine en rejet ou en erreur. Attention : une création groupée de trois éléments déclenche le flow trois fois.
- **Webhook** : `GET` ou `POST` sur `/flows/trigger/:id`, mode asynchrone ou synchrone, réponse personnalisable.
- **Planification (CRON)** : syntaxe à **six champs**, avec la seconde en tête (bibliothèque `node-cron`).
- **Autre flow** : déclenché par l'opération *Trigger Flow*.
- **Manuel** : bouton dans le Studio, avec notification.

**Quinze opérations** (https://directus.com/docs/guides/flows/operations) : Condition ; Run Script ; Create / Read / Update / Delete Data ; JSON Web Token ; Log to Console ; Send Email ; Send Notification ; **Webhook / Request URL** ; Sleep ; Throw Error ; Transform Payload ; Trigger Flow.

Points qui comptent pour Nexora :

- **Run Script** s'exécute dans un bac à sable : pas de système de fichiers, **pas de requête réseau**, pas de modules npm. Un appel à LiteLLM doit passer par *Webhook / Request URL* ou par une extension d'opération.
- Les opérations Create, Read, Update et Delete ont un champ **Permissions** : elles peuvent s'exécuter avec le rôle d'un utilisateur donné. On peut donc faire tourner la publication avec un compte de service à droits minimaux.
- *Send Email* exige une messagerie configurée. *Send Notification* cible des utilisateurs par UUID.

### 3.2 Extensions

Types (https://directus.com/docs/guides/extensions) :

- **Hooks** (filtres et actions) : chargés **dans le processus Directus**.
- **Endpoints** : routes HTTP personnalisées (`router`).
- **Opérations** : entrée *app* (interface) et entrée *api* (exécution). Elles peuvent utiliser des paquets npm, contrairement à Run Script.
- **Variantes sandbox** (TypeScript, SDK `directus:api`) pour les endpoints et les opérations.
- **Interfaces, affichages, panneaux, modules, mises en page, thèmes** : créés avec `create-directus-extension` (liste des types relevée dans un article tiers : https://upstash.com/blog/directus-semantic-search).

Marketplace : le dépôt `directus-labs/extensions` indique que certaines extensions ne sont pas compatibles avec la sandbox et exigent **`MARKETPLACE_TRUST=all`**. À traiter comme un risque : ne pas activer ce réglage en production sans revue.

**Recommandation :** écrire nous-mêmes les extensions critiques (passerelle LiteLLM, garde de publication, notification de revalidation Next.js) et les garder dans le dépôt de Nexora, pas dans le Marketplace.

### 3.3 MCP officiel de Directus (natif)

- **Disponibilité :** Directus **11.12 et plus**. Activation dans *Paramètres → IA*, puis jeton d'un **utilisateur MCP dédié**. Documentation : https://directus.com/docs/guides/ai/mcp
- **Points d'accès :** `/mcp` (un outil par opération) ou `/mcp?tool_mode=registry` (trois outils racine : `search`, `execute`, `schema`).
- **Outils du mode par défaut** : `system-prompt`, `items`, `schema`, `collections`, `fields`, `relations`, `files`, `assets`, `flows`, `operations`, `trigger-flow`, `folders`. Remarque : les outils `collections`, `fields` et `relations` modifient le schéma ; seule une politique admin doit les autoriser.
- **Permissions :** l'agent agit avec les permissions de l'utilisateur MCP. Journal d'audit complet. **Protection globale contre la suppression : désactivée par défaut**, à activer.
- **Prompt système** personnalisable dans *Paramètres → IA → Model Context Protocol*. Une collection de prompts (*AI Prompts Collection*) est partagée avec l'assistant.
- **Limite :** en mode verrouillé, le MCP est coupé (voir 2.4 g).

**MCP local communautaire** (`@directus/content-mcp`, dépôt `directus/mcp`) : licence **MIT**, 86 étoiles, 18 forks, un seul tag, 50 commits, **dernier commit le 14 mai 2025**. Outils : `read-items`, `create-item`, `update-item`, `delete-item`, champs, fichiers, flows, prompts, commentaires. Options pour désactiver des outils (`DISABLE_TOOLS`). Limite : l'authentification par mot de passe passe par une variable d'environnement (`DIRECTUS_USER_PASSWORD`), donc un secret en clair dans une configuration. Verdict : **écarté** pour une instance en 11.12 ou plus.

### 3.4 IA intégrée à Directus (*AI Assistant*, traductions)

Source principale : https://directus.com/docs/guides/ai/assistant/setup

- **Fournisseurs intégrés :** OpenAI, Anthropic, Google (Gemini). Clés saisies dans *Paramètres → IA*. La documentation affirme qu'elles sont **chiffrées au repos et masquées** dans l'interface.
- **Liste blanche de modèles** par fournisseur : sans sélection, aucun modèle n'est disponible.
- **Fournisseurs compatibles OpenAI** (Ollama, LM Studio, Azure, Mistral, ou LiteLLM) : URL de base, clé, en-têtes personnalisés, liste des modèles avec fenêtre de contexte (128 000 par défaut), sortie maximale (16 000 par défaut), pièces jointes, raisonnement, options propres au fournisseur.
- **Limites documentées :** pièces jointes non prises en charge avec un fournisseur compatible OpenAI ; les modèles locaux ont une qualité d'appel d'outils variable ; **tous les utilisateurs de l'assistant partagent une seule clé**, donc un seul budget.
- **Accès :** les utilisateurs doivent avoir l'accès à l'application (*App Access*).
- **Télémétrie :** Langfuse ou Braintrust (variables `AI_TELEMETRY_*`). `AI_TELEMETRY_RECORD_IO=true` envoie le contenu complet des échanges : à éviter si Nexora promet la confidentialité.
- **Désactivation globale :** variable `AI_ENABLED`.
- **Traductions IA** (https://directus.com/docs/guides/ai/translations) : traduction des champs depuis l'interface de traduction. Comme indiqué plus haut, la grille place les *traductions IA* parmi les fonctions Enterprise : à confirmer pour Team et l'Open Innovation Grant.

### 3.5 Intégrations IA de la communauté et de `directus-labs`

- **`directus-labs/extensions`** (dépôt officiel de la communauté Directus Labs) : opérations IA *sandbox* — rédaction, traduction, extraction de texte, transcription, génération d'images, modération d'images, alt text, etc. Détails dans le tableau de la section 7.
- **`@directus-labs/ai-writer-operation`** (npm) : version 1.4.3, publiée **environ huit mois avant la consultation**. Fournisseurs fixes : OpenAI, Anthropic, Replicate (Mistral et Llama). Pas de URL de base personnalisable visible : **écartée** pour un usage LiteLLM.
- **Bundle « AI Operation » du site Directus** (OpenAI et Stability) : lien d'API obsolète (`beta.openai.com`). **Écarté.**

---

## 4. Gabarits Next.js + Directus, aperçu, édition visuelle, i18n, SEO, médias

### 4.1 Gabarits

| Gabarit | Stack | Constat |
|---|---|---|
| **`directus-labs/starters`** (`cms/nextjs`, `cms-i18n/nextjs`) | Next.js App Router, Tailwind, shadcn, TypeScript, ESLint/Prettier, pnpm | Mis à jour le **23 oct. 2026** (Directus 12.5.1, Node 22.23.4 pour des CVE d'octobre 2026). Constructeur de pages dynamique, mode aperçu, formulaires, route de recherche, génération de types (`directus-sdk-typegen`). Variante Nuxt dans le même dépôt ; Astro apparaît dans l'historique. |
| **`directus-labs/directus-template-cli`** | Outil npm | Initialise un projet, extrait et applique des modèles (schéma, rôles, flows, contenu). |
| **`directus-labs/directus-templates`** | Modèles | Contient `simple-website-cms`, `simple-crm`, `simple-ecommerce`, `help-center`, `agencyos`. Mis à jour le 28 août 2026. |
| **`directus-labs/agency-os`** | **Nuxt 3** | Démonstrateur d'agence. Dernier commit le **26 mars 2025**. Écarté comme base, utile comme inspiration de modèle (clients, projets, facturation). |

Points de sécurité à corriger dans `cms/nextjs` avant usage :
- le `.env` demande un **jeton statique du compte administrateur** (`DIRECTUS_SERVER_TOKEN`). Le README recommande, sur une instance sous licence, un jeton d'utilisateur limité aux politiques « Content - Live Preview » et « Forms - Submission » ;
- le formulaire d'API limite la taille des requêtes : prévoir une protection anti-robot au bord du réseau.

### 4.2 Aperçu en direct et édition visuelle

- **Édition visuelle** : paquet `@directus/visual-editing`, version 2 obligatoire depuis Directus 11.16.0 (mars 2026). Côté Next.js : `apply({ directusUrl, onSaved })`, `setAttr`, `remove`. Côté Directus : CSP `frame-src` pointant vers le site, et CORS (`CORS_ENABLED`, `CORS_ORIGIN`). La licence du paquet n'a pas été vérifiée individuellement.
- **Aperçu en direct** : URL d'aperçu par collection (*Paramètres → Modèle de données*) avec la variable `{{$version}}`. Paramètre global « Preview Base URL » depuis 12.5.0. Le mode brouillon de Next.js lit la version demandée.
- **Éditeur visuel** : configuré globalement (*Paramètres → Éditeur visuel*), avec `{{$version}}` pour écrire dans la bonne version.
- **Piège Directus Cloud :** l'aperçu exige HTTPS (tunnel ou CSP à configurer).

Sources : https://directus.com/docs/frameworks/nextjs/visual-editor ; https://directus.com/docs/guides/content/content-versioning ; https://github.com/directus-labs/starters/blob/main/cms/nextjs/README.md

### 4.3 Internationalisation fr/en

- **Interface de traduction** : crée automatiquement une collection `languages` (`code`, `direction`), une collection de traduction par collection (ex. `articles_translations`), les relations et le champ alias (https://directus.com/docs/configuration/translations).
- **Conséquence licence :** chaque collection de traduction compte pour la limite de collections.
- **Traduction IA** : voir 3.4 (tiers à confirmer).
- **Valeurs de repli (fallback)** : non vérifiées ; à tester côté API avant de compter dessus.

### 4.4 SEO intégré

- **Pas de module SEO natif** trouvé dans la documentation consultée. Il faut ajouter un groupe `seo` (titre, description, image, canonique, `noindex`) à chaque collection publique, et le mapper aux métadonnées Next.js.
- **Extension SEO** : `directus-labs/extensions` contient le paquet *SEO Plugin* (type *Bundle*). Non examiné en détail : à évaluer sur une instance de test (la colonne « sandbox » est marquée N/A).
- Le gabarit Next.js prend `NEXT_PUBLIC_SITE_URL` pour les métadonnées et le routage des articles.

### 4.5 Gestion des médias

- Bibliothèque `directus_files` avec dossiers (`directus_folders`), métadonnées (titre, alt, description, tags) et remplacement de fichier.
- **Stockage** : pilotes officiels publiés dans 12.5.0 : S3, Google Cloud Storage, Azure, Cloudinary, Supabase. Pour la souveraineté, vérifier l'emplacement réel du stockage (un fournisseur étranger sort les fichiers du Québec).
- Le serveur MCP sait importer un fichier depuis une URL (`import-file`, dans le MCP local) et lire un actif en base64 pour analyse (`assets`, dans le MCP natif).

---

## 5. Brancher LiteLLM à Directus

### 5.1 Options

| Option | Principe | Avantages | Limites | Verdict |
|---|---|---|---|---|
| **A. Fournisseur compatible OpenAI (Paramètres → IA)** | URL de base = proxy LiteLLM (`/v1`), clé = clé virtuelle | Aucun code ; l'Assistant passe par LiteLLM (traductions IA : à confirmer) | Une seule clé pour tous les utilisateurs, donc un seul budget ; pas de pièces jointes ; dépend de la fonction « Custom LLM » (Enterprise sur la grille) | **À tester** en premier |
| **B. Flow + opération *Webhook / Request URL*** | Requête HTTP `POST` vers `/v1/chat/completions` avec un en-tête `Authorization` | Intégré, pas de code | La clé est stockée dans la configuration du flow, visible par qui peut modifier les flows ; pas de secret géré | Acceptable pour un prototype |
| **C. Extension d'opération maison (entrée *api*)** | Opération TypeScript/JS qui appelle LiteLLM avec la clé de l'agent, lue depuis l'environnement, et journalise dans `agent_runs` | Contrôle total : budget, tentative, journal, modèle choisi par route | Code à maintenir ; à déployer comme extension locale | **Recommandée** pour la production |
| **D. Extensions IA de la communauté** | `ai-writer-operation`, bundle obsolète | Prêtes à l'emploi | Fournisseurs fixes | **Écarté** |

### 5.2 Clés

- **Clés fournisseur (OpenRouter, etc.) :** ne doivent pas vivre dans Directus. Elles restent dans LiteLLM, qui les chiffre avec `LITELLM_SALT_KEY` (source tierce : https://blog.lo0.es/en/posts/litellm-virtual-keys-budgets-limits/). Cette variable doit être définie dès le premier jour, différente de la clé maîtresse, et ne jamais être changée à la légère : sans elle, une rotation de la clé maîtresse rend les identifiants fournisseur illisibles, sans erreur bloquante.
- **Clés virtuelles (une par agent et par client) :** stockées hachées par LiteLLM ; Directus n'en garde qu'une référence (identifiant), jamais la valeur.
- **Clés Directus pour les fournisseurs intégrés :** chiffrées au repos selon la documentation. Pour un fournisseur compatible OpenAI, la clé est saisie dans *Paramètres → IA* : le chiffrement de ce champ n'est pas documenté. **À vérifier.**
- **Directus ne documente pas de champ chiffré générique** dans les pages consultées. Ne pas stocker de clé lisible dans une collection.

### 5.3 Budgets

- **Clé virtuelle** : `max_budget`, `budget_duration` (ex. `24h`, `30d`), et plusieurs fenêtres avec `budget_limits` (ex. 10 $ par 24 h et 100 $ par 30 jours). Budgets par modèle à l'intérieur d'une même clé (source : https://docs.litellm.ai/docs/proxy/virtual_keys et https://docs.litellm.ai/docs/proxy/users).
- **Équipe et utilisateur :** chaque niveau est vérifié indépendamment ; une clé d'équipe ne contourne pas le budget utilisateur seulement si `apply_user_budget_to_team_keys` est activé (source tierce, vérifiée par son auteur sur la v1.100.0).
- **Code HTTP à dépassement** : la documentation et une analyse tierce divergent (400 contre 429). **À tester.**
- **Rotation programmée** : `LITELLM_KEY_ROTATION_*` avec période de grâce.
- **Rôles LiteLLM** : `proxy_admin`, `org_admin`, `internal_user`, `team`. Les administrateurs d'équipe peuvent modifier les budgets, dans les limites de l'organisation.

**Recommandation :** une clé virtuelle par agent et par client, un budget mensuel par clé, une alerte CRON qui interroge l'état de chaque clé.

### 5.4 Sécurité de LiteLLM (incidents 2026)

- **24 mars 2026 :** les versions **1.82.7** et **1.82.8** publiées sur PyPI contenaient un voleur d'identifiants, disponibles au moins deux heures (https://www.sonatype.com/blog/compromised-litellm-pypi-package-delivers-multi-stage-credential-stealer). Avis associé : PYSEC-2026-2. Les mainteneurs ont ensuite adopté les *Trusted Publishers* (https://blog.pypi.org/posts/2026-04-02-incident-report-litellm-telnyx-supply-chain-attack/).
- **21 octobre 2026 :** la version **1.107.0** a été publiée sur PyPI (sept wheels) et dans les images Docker, entre 11 h 39 et 13 h 23 UTC. Les attaquants ont utilisé des jetons OAuth GitHub volés à trois ingénieurs pour lancer le pipeline de publication contre un faux dépôt (`Berri-AI/litellm`). La charge utile ajoute des fichiers de démarrage Python (`cook.pth`, `sitecustomize.py`) et exfiltre les identifiants du développeur, du cloud, du navigateur, SSH, les variables d'environnement et la base LiteLLM (https://docs.litellm.ai/blog/security-incident-oct-21-2026 ; https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-docker/ ; https://www.microsoft.com/en-us/security/blog/2026/10/23/inside-the-litellm-1-107-0-supply-chain-compromise-credential-theft-through-python-startup-hooks/).
- **Position de LiteLLM :** rester sur **1.106.2** jusqu'à nouvel avis. La version *entreprise* n'a pas été touchée ; une correction embargoée vise une vulnérabilité dont la divulgation est prévue le 27 octobre 2026.

**Conséquence pour Nexora :** la passerelle contient les clés fournisseur. Une compromission équivaut à une fuite de toutes les clés. Mesures minimales : version figée et vérifiée (empreinte de l'image Docker), réseau sortant restreint, rotation des clés après toute installation de 1.82.7, 1.82.8 ou 1.107.0, abonnement aux avis de sécurité, et envisager l'édition entreprise.

### 5.5 Souveraineté

Les modèles routés par OpenRouter peuvent être hébergés hors du Québec : il faut un champ `data_residency` par modèle, qui reflète l'emplacement réel du traitement. **Ne pas promettre la souveraineté sans ce champ.**

---

## 6. Rôles, permissions, journal, versions, planification

### 6.1 Politiques et rôles

Source : https://directus.com/docs/guides/auth/access-control

- **Politiques** (depuis Directus 11.0) : les permissions sont portées par les politiques, attachées à des rôles ou à des utilisateurs ; les rôles peuvent s'imbriquer.
- **Combinaison :** les permissions se cumulent (addition) ; les filtres d'éléments se combinent par OU ; **les restrictions IP sont soustractives** : une politique dont l'IP n'est pas autorisée disparaît du calcul.
- **Permissions :** par collection et par action (créer, lire, modifier, supprimer, partager). Au niveau élément : filtres. Au niveau champ : liste de champs, validation (expressions régulières), valeurs par défaut (*presets*).
- **Accès :** case *App Access* (Studio) et *Admin Access*. Un utilisateur sans l'une ni l'autre est un utilisateur API seulement, sans siège.
- **Rôle public :** **désactivé par défaut**. Une lecture publique sur une collection expose tous ses éléments, y compris non publiés, si les versions ne filtrent pas.
- **Statuts utilisateur :** brouillon, invité, non vérifié, actif, suspendu, archivé.
- **2FA par politique** : exigée seulement si la connexion vient d'une IP autorisée par la politique.

### 6.2 Journal d'activité et révisions

- Tables système : **`directus_activity`** (journal) et **`directus_revisions`** (historique des modifications, avec comparaison et restauration dans le Studio).
- **Rétention** : 30 jours (Core), 90 jours (Team), configurable (Enterprise). Des variables d'environnement de rétention des journaux existent (documentation « Log Retention »). Le nettoyage manuel de `directus_revisions` peut supprimer des versions encore utilisées.
- **Pour Nexora :** exporter le journal chaque jour vers une collection d'audit ou un stockage externe, et journaliser les actions des agents dans `agent_runs`.

Sources : https://directus.com/pricing ; https://directus.com/docs/guides/content/content-versioning

### 6.3 Versions de contenu (base de la validation humaine)

Source : https://directus.com/docs/guides/content/content-versioning

- **Activation** par collection (*Paramètres → Modèle de données → Activer les versions*).
- **Concepts :** `published` (clé réservée, ancienne `main`), `draft` (brouillon global, toujours disponible), versions personnalisées créées depuis le contenu publié.
- **Édition :** la vue publiée est en **lecture seule** dans le Studio ; on édite le brouillon ou une version.
- **Publication :** le bouton *Publier* ouvre une **comparaison** où l'on accepte ou refuse chaque champ modifié. Une version est supprimée après publication si la politique l'autorise.
- **Permissions à accorder à un éditeur :** lecture, création, modification sur la collection ; `directus_versions` en lecture, création, modification et suppression ; `directus_revisions` en lecture.
- **API :** les versions sont accessibles par l'API (documentation `directus.com/docs/api/versions`).
- **Clés réservées :** `published`, `main`, `draft` ; une clé réservée refusée renvoie HTTP 400.

### 6.4 Planification de publication

**Non native** dans les pages consultées (ni champ de date de publication, ni opération « publier une version » dans les Flows). Deux pistes :

1. **Champ `publish_at`** dans chaque collection publiée, et un flow CRON (par exemple toutes les cinq minutes) qui cherche les approbations validées dont la date est échue, puis promeut la version via l'API versions avec un compte de service. **À prototyper** : le nom exact de l'action de promotion n'a pas été vérifié dans la documentation de l'API.
2. Une extension d'opération maison qui appelle les services internes de Directus.

**Règle de conception :** pas de LLM dans le chemin de publication. La publication est déterministe, sous contrôle d'une approbation.

### 6.5 Test bloquant

**Une écriture API sur l'élément publié contourne-t-elle les versions ?** Si oui, retirer à l'agent la permission de modifier la collection et ne lui laisser que `directus_versions`. À tester sur une instance de test avant tout déploiement.

---

## 7. Tableau d'évaluation des éléments examinés

Légende : **Adopter** (retenu pour la cible) ; **À évaluer** (test nécessaire) ; **Écarter** (non retenu).

| Élément | URL | Licence | Étoiles / forks | Dernier commit ou release | Apport | Maturité | Verdict |
|---|---|---|---|---|---|---|---|
| Directus (cœur, v12.5.1) | https://github.com/directus/directus | **MSCL-1.0-GPL** (GPL-3.0 après 4 ans) | 38,6 k / 5,0 k | Release 23 oct. 2026 ; commit `main` 26 oct. 2026 | CMS, Flows, MCP, versions, i18n, politiques | Très mature, sortie environ mensuelle | **Adopter**, sous réserve juridique |
| Flows (cœur) | https://directus.com/docs/guides/flows/triggers | Idem | — | Docs du 26 oct. 2026 | Orchestration sans code (événements, CRON, webhooks, 15 opérations) | Mature | **Adopter** |
| Extensions (hooks, endpoints, opérations) | https://directus.com/docs/guides/extensions | Idem | — | — | Code maison : LiteLLM, garde de publication | Mature | **Adopter** |
| MCP natif (≥ 11.12) | https://directus.com/docs/guides/ai/mcp | Idem | — | Documentation 26 oct. 2026 | Agents externes sous permissions Directus | Récent | **Adopter**, avec politiques strictes |
| MCP local `directus/mcp` | https://github.com/directus/mcp | MIT | 86 / 18 | **14 mai 2025** | Outils CRUD, flows, prompts | Faible activité | **Écarter** (sauf instance < 11.12) |
| Assistant IA et fournisseurs compatibles OpenAI | https://directus.com/docs/guides/ai/assistant/setup | Idem | — | Docs du 26 oct. 2026 | Assistant Studio, LLM branchable | Récent | **À évaluer** (clé partagée ; « Custom LLM » sur la grille) |
| Traductions IA | https://directus.com/docs/guides/ai/translations | Idem | — | — | Traduction des champs | Récent | **À évaluer** (palier à confirmer) |
| Édition visuelle `@directus/visual-editing` v2 | https://directus.com/docs/frameworks/nextjs/visual-editor | Non vérifiée (SDK annoncés MIT) | — | Requis depuis 11.16.0 | Édition au clic sur le site | Mature | **Adopter** (Next.js) |
| Versions de contenu | https://directus.com/docs/guides/content/content-versioning | Idem | — | — | Brouillon, publication, comparaison | Mature | **Adopter** |
| Traductions (i18n) | https://directus.com/docs/configuration/translations | Idem | — | — | Langues et champs traduits | Mature | **Adopter** (compte dans les collections) |
| Politiques et rôles | https://directus.com/docs/guides/auth/access-control | Idem | — | Politiques depuis 11.0.0 | RBAC, IP, 2FA | Mature | **Adopter** |
| `directus-labs/starters` (Next.js) | https://github.com/directus-labs/starters | **MIT** | 76 / 26 | **23 oct. 2026** (PR #139) | Base Next.js App Router, aperçu, formulaires, types | Actif | **Adopter** (à durcir) |
| `directus-template-cli` | https://github.com/directus-labs/directus-template-cli | **MIT** | 191 / 37 | **28 août 2026** (v0.8.1) | Init, extraction et application de modèles | Actif | **Adopter** (migration dev → prod) |
| `directus-templates` | https://github.com/directus-labs/directus-templates | Non vérifiée | 102 / 19 | **28 août 2026** (PR #23) | Modèles (`simple-website-cms`, `simple-crm`, `agencyos`…) | Actif | **À évaluer** (licence à vérifier) |
| AgencyOS | https://github.com/directus-labs/agency-os | **MIT** | 988 / 181 | **26 mars 2025** (PR #135) | Démonstrateur d'agence en Nuxt 3 | Inactif depuis 19 mois | **Écarter** (Nuxt, inactif) |
| `directus-labs/extensions` | https://github.com/directus-labs/extensions | MIT (indiqué sur la page) | 199 / 54 | **17 août 2026** (PR #324) | SEO Plugin ; opérations IA en sandbox ; Resend | Expérimental | **À évaluer** |
| `@directus-labs/ai-writer-operation` | https://www.npmjs.com/package/@directus-labs/ai-writer-operation | Non affichée | — | v1.4.3, environ 8 mois avant consultation | Opération texte (OpenAI, Anthropic, Replicate) | Modeste | **Écarter** (pas d'URL de base) |
| Bundle « AI Operation » (OpenAI, Stability) | https://directus.com/extensions/directus-extension-ai-operation-bundle | Non vérifiée | — | — | Opérations IA | Obsolète | **Écarter** |
| LiteLLM | https://github.com/BerriAI/litellm | **MIT** (cœur) ; `enterprise/` sous licence séparée | 62,1 k / 12,7 k | Commit visible 27 oct. 2026 (CI en échec affiché) | Proxy compatible OpenAI, clés virtuelles, budgets | Très utilisé ; **deux compromissions en 2026** | **À évaluer sous conditions** |

---

## 8. Architecture d'administration recommandée

### 8.1 Principes

1. **Directus est la seule source de contenu et de configuration.** Next.js lit Directus ; il n'écrit jamais.
2. **Un agent n'écrit jamais dans l'élément publié.** Il écrit dans un brouillon et crée une approbation.
3. **Une publication exige une approbation validée** (garde de publication, voir 8.4).
4. **Aucun secret dans Directus.** Seules des références (nom de variable, identifiant de clé virtuelle) y sont stockées. Les clés fournisseur restent dans LiteLLM.
5. **Un LLM n'est jamais sur le chemin de publication.**
6. **Budget et journal par agent.** Chaque agent a sa clé virtuelle, son budget et ses traces.
7. **Dimensionnement :** la version Core ne suffit pas (25 collections, 5 flows). Viser Team au minimum, ou l'Open Innovation Grant si Nexora est éligible.

### 8.2 Modèle de données proposé

Décompte : **environ 37 collections**, dont 8 collections de traduction, la table `languages`, une jonction de blocs et 6 collections de blocs (une par type de bloc). Le nombre peut monter avec les jonctions d'étiquettes et les collections de formulaires.

| Collection | Rôle | Champs clés | Relations | Versionnée | Traduite | Accès agent |
|---|---|---|---|---|---|---|
| `sites` | Réglages du site (singleton) | nom, domaine, `default_locale`, groupe SEO, logo | — | non | oui | lecture |
| `pages` | Pages du site | `slug` (par langue), titre, groupe SEO, `publish_at`, statut éditorial | blocs (M2A via `pages_blocks`) | **oui** | oui | brouillon seulement |
| `pages_blocks` + 6 blocs (`block_hero`, `block_features`, `block_pricing`, `block_faq`, `block_cta`, `block_form`) | Composition des pages | position, données du bloc | M2A | non | selon bloc | brouillon |
| `articles` | Blog | `slug`, titre, extrait, corps, couverture, `publish_at`, groupe SEO | auteur (M2O), étiquettes (M2M) | **oui** | oui | brouillon |
| `authors`, `tags`, `articles_tags` | Auteurs et taxonomie | nom, rôle, slug | jonction | non | tags : oui | lecture |
| `faqs` | Questions fréquentes | question, réponse, catégorie, ordre | — | **oui** | oui | brouillon |
| `vps_offers` | Offres VPS publiques | fournisseur, identifiant produit, vCPU, RAM, disque, bande passante, lieu, **`price_cents` (public)**, `cost_cents` (**admin seul**), `public`, `last_synced_at` | — | **oui** (prix sous approbation) | oui | brouillon ; **pas de lecture du coût** |
| `subscription_plans` | Plans d'abonnement | nom, niveau, prix, intervalle, budget de jetons inclus, fonctions, `public` | — | **oui** | oui | brouillon |
| `hardware_offers` | Serveurs IA sur place (sur devis) | référence, CPU, GPU, RAM, stockage, délai, `public` | — | **oui** | oui | brouillon |
| `proxmox_servers` | Serveurs Proxmox à brancher | nom, hôte, nœud, lieu, capacité, état, `last_seen_at`, **`token_ref`** (nom de variable seulement) | — | non | aucun | aucun |
| `llm_providers` | Fournisseurs de modèles | nom, type (OpenRouter, direct, local), `base_url`, `key_ref` (référence), état, `last_health_at` | modèles (1-N) | non | non | écriture d'état seulement |
| `llm_models` | Modèles | identifiant LiteLLM, nom affiché, fenêtre de contexte, prix (entrée/sortie par million), capacités (JSON), **`data_residency`**, activé | fournisseur (M2O) | non | non | écriture d'état seulement |
| `llm_routes` | Routage tâche → modèle | tâche (rédaction, traduction, SEO…), modèle principal, modèle de repli, coût max par exécution | modèles (M2O x2) | non | non | lecture |
| `payment_methods` | Moyens de paiement | nom affiché, type, configuration publique (JSON), `secret_ref` (référence), test, activé | — | non | oui | aucun |
| `clients` | Clients | nom, entité juridique, plan, état, région, mode de licence | plan (M2O) | non | non | aucun |
| `client_api_keys` | Clés API des clients | libellé, préfixe, **hachage SHA-256** (jamais la valeur), portées (JSON), **`litellm_key_ref`**, budget mensuel, état, `last_used_at` | client (M2O) | non | non | aucun |
| `ai_agents` | Agents | nom, mission, propriétaire humain, utilisateur Directus dédié, prompt, route par défaut, budget, activé, `last_run_at` | prompt (M2O), route (M2O), utilisateur (M2O) | non | non | lecture de sa propre fiche |
| `ai_prompts` | Prompts des agents | `name`, `description`, `system_prompt`, `messages`, `variables`, version, langue | — | non | non | lecture |
| `agent_runs` | Traces des exécutions | agent, déclencheur, cible, version, modèle, jetons entrée et sortie, coût, état, identifiant de requête LiteLLM, dates, erreur | agent (M2O) | non | non | création seulement |
| `approvals` | **File de validation** | collection, identifiant de l'élément, clé de version, type de changement, résumé, diff, proposé par (agent), état (en attente, approuvée, refusée, à corriger, expirée), relecteur, commentaire, `publish_at` | agent (M2O), relecteur (M2O) | non | non | création et lecture de ses propres demandes |
| `languages` | Langues (créée par l'interface de traduction) | `code`, `direction` | — | non | — | lecture |

Les noms des champs `name`, `description`, `system_prompt` et `messages` de `ai_prompts` correspondent aux valeurs par défaut de la collection de prompts du MCP : la collection sert donc à la fois aux agents et au MCP.

### 8.3 Rôles et politiques

| Politique | Accès à l'application | Droits | Remarque |
|---|---|---|---|
| **Administrateur Nexora** | Admin | Tout ; 2 personnes au plus | 2FA et liste blanche IP |
| **Éditeur** | Oui | Créer, lire, modifier les brouillons ; lire tout | Ne publie pas |
| **Relecteur** | Oui | Lire tout ; modifier `approvals` ; publier une version approuvée | Publier = accepter la comparaison |
| **Agent rédaction / traduction / SEO / offres / médias** | **Non** (API seulement) | Lire le contenu ; écrire dans les brouillons (`directus_versions`) ; créer des approbations ; aucune suppression ; aucun accès à `cost_cents`, `proxmox_servers`, `payment_methods`, `clients`, `client_api_keys`, `llm_*` | Ne consomme pas de siège (à tester) |
| **Agent modèles** | Non | Modifier l'état de `llm_providers` et `llm_models` seulement | Vérifications de santé |
| **Compte de publication (flow)** | Non | Promouvoir une version approuvée ; rien d'autre | Exécution des flows sous ce rôle |
| **Public (site)** | — | Lire seulement les éléments publiés, `public = true` | Rôle public, sans `cost_cents`, sans `directus_versions`, sans `approvals` |
| **Client API** | Non | Lire ses propres données | Par filtre d'élément |

Règles complémentaires : désactiver la suppression pour tous les agents ; activer la protection globale contre la suppression MCP ; retirer aux agents les outils de schéma du MCP natif.

### 8.4 Flux de validation

1. **L'agent** lit son prompt (`ai_prompts`), appelle son modèle via LiteLLM (sa clé virtuelle), écrit dans le brouillon de l'élément et crée une ligne `approvals` (résumé et diff).
2. **Notification** : *Send Notification* ou *Send Email* aux relecteurs.
3. **Le relecteur** ouvre la comparaison Directus, accepte ou refuse champ par champ, puis passe la ligne `approvals` à « approuvée » ou « à corriger ».
4. **Publication** : par le bouton *Publier* (comparaison native), ou par un flow *Publier les approbations validées*, déclenché manuellement ou par CRON pour `publish_at`.
5. **Garde de publication** : un hook bloquant refuse toute publication sans approbation validée pour cette version. **À développer** comme extension maison.
6. **Après publication** : un flow *Request URL* appelle la route de revalidation de Next.js pour rafraîchir les pages concernées (**à prototyper**).
7. **Retour arrière** : restauration depuis les révisions, ou nouvelle version.

### 8.5 Agents IA à créer

Principe commun : une clé virtuelle LiteLLM et un budget par agent ; une route de modèle ; des traces dans `agent_runs` ; aucune écriture sur l'élément publié ; aucune suppression.

| Agent | Mission | Déclencheur | Sortie | Validation | Modèle (route) |
|---|---|---|---|---|---|
| **Rédacteur** | Rédige ou reformule pages et articles à partir d'un brief | Manuel (MCP ou Studio) | Brouillon + approbation « contenu » | Relecteur | Rédaction (modèle de qualité) |
| **Traducteur fr/en** | Crée la version anglaise à partir du français approuvé | Approbation FR validée (flow) | Brouillon de traduction + approbation | Relecteur, par langue | Traduction (ou traduction IA de Directus, si disponible) |
| **SEO** | Titres, descriptions, slugs, données structurées | Brouillon créé (flow) | Groupe SEO dans le brouillon | Relecteur | SEO (modèle économique) |
| **Catalogue offres** | Synchronise les offres VPS et plans depuis les fournisseurs | CRON (quotidien) | Brouillon d'offre + approbation « prix » si le prix change | Relecteur obligatoire pour tout prix | Aucun LLM nécessaire (déterministe) |
| **Santé modèles** | Vérifie les fournisseurs et modèles via LiteLLM | CRON (horaire) | Mise à jour de `llm_*` ; alerte si panne | Aucune (lecture et état seulement) | Aucun |
| **Médias** | Alt text, étiquettes et description des fichiers importés | Upload de fichier (webhook) | Métadonnées de fichier | Aucune si texte seulement ; sinon relecteur | Vision (modèle multimodal) |
| **Veille et amélioration** | Propose des améliorations de pages à partir de l'analytique | CRON (hebdomadaire) | Approbations « suggestion » (aucune écriture) | Relecteur | Analyse (modèle économique) |
| **Compte de publication** (non IA) | Publie les éléments approuvés, à l'heure prévue | CRON (5 min) | Promotion de version | Approbation requise (garde) | — |

Points de vigilance : pas d'agent sur les paiements, les clients ou la facturation ; pas d'agent qui crée des schémas ; un agent qui échoue deux fois s'arrête et ouvre une approbation « à corriger ».

### 8.6 Décisions et tests à faire avant la construction

1. **Juridique :** éligibilité à l'Open Innovation Grant ; statut de l'hébergement pour clients au regard de la *Competing Use* ; usage de la licence pour un service géré.
2. **Commercial :** confirmer les prix Team (contradiction de la page) et la répartition Enterprise (« Custom LLM », traductions IA).
3. **Test 1 :** un fournisseur compatible OpenAI (LiteLLM) fonctionne-t-il sur un plan Core et Team ?
4. **Test 2 :** une écriture API sur l'élément publié contourne-t-elle les versions ?
5. **Test 3 :** un utilisateur API seulement avec jeton MCP peut-il appeler le MCP sans consommer de siège ?
6. **Test 4 :** code HTTP à dépassement de budget LiteLLM (400 ou 429) ; comportement de `apply_user_budget_to_team_keys`.
7. **Test 5 :** la fonction de traduction IA est-elle disponible sur le plan retenu, et avec un fournisseur personnalisé ?
8. **Sécurité :** épingler LiteLLM sur une version vérifiée ; définir `LITELLM_SALT_KEY` ; restreindre le réseau sortant.
9. **Modèle :** réduire le nombre de types de blocs (chacun coûte une collection) pour rester dans les limites du plan.

---

## 9. Limites et points non vérifiés

- Licence de `@directus/visual-editing`, `directus-templates` et `directus-labs/extensions` non vérifiée paquet par paquet.
- Étoiles et dates : relevées à la consultation (26 oct. 2026) ; elles évolueront.
- Le dernier commit de LiteLLM (27 oct. 2026) est affiché avec un statut de CI en échec : à surveiller.
- Le message Reddit sur le modèle « 5 à 50 utilisateurs » n'a été lu que dans un extrait.
- Le rapport SOC 2 (Trust Center) n'a pas été lu.
- La fonction de *Custom LLM* et la fonction de traduction IA ne sont pas attribuées de façon certaine à un palier.
- Les pages `license` et `LICENSE` du dépôt LiteLLM : le texte MIT a été lu, la licence des extensions d'entreprise ne l'a pas été.
- Les exemples de coûts (Team, Core cloud) peuvent changer.
- Les analyses juridiques (licence, hébergement pour clients) ne sont pas des avis juridiques.

---

## 10. Sources consultées (dates de consultation : 26 oct. 2026)

**Directus officiel**
- https://github.com/directus/directus (dépôt, étoiles, dernier commit)
- https://github.com/directus/directus/releases/tag/v12.5.1
- https://github.com/directus/directus/releases/tag/v12.5.0
- https://github.com/directus/directus/releases
- https://raw.githubusercontent.com/directus/directus/main/license (identique au tag v12.5.1)
- https://directus.com/docs/releases
- https://directus.com/docs/releases/changelog
- https://directus.com/docs/licensing/overview
- https://directus.com/pricing
- https://directus.com/resources/directus-v12-license-change (annonce du 22 avr. 2026)
- https://community.directus.com/t/directus-license-revision-community-feedback-requested/2125
- https://directus.com/docs/guides/flows/triggers
- https://directus.com/docs/guides/flows/operations
- https://directus.com/docs/guides/extensions/api-extensions/hooks
- https://directus.com/docs/guides/extensions/api-extensions/endpoints
- https://directus.com/docs/guides/extensions/api-extensions/operations
- https://directus.com/docs/guides/ai/mcp
- https://directus.com/docs/guides/ai/mcp/tools
- https://directus.com/docs/guides/ai/assistant/setup
- https://directus.com/docs/guides/ai/translations
- https://directus.com/docs/guides/content/content-versioning
- https://directus.com/docs/configuration/translations
- https://directus.com/docs/guides/auth/access-control
- https://directus.com/docs/frameworks/nextjs/visual-editor

**Dépôts et paquets**
- https://github.com/directus/mcp (MCP local communautaire)
- https://github.com/directus-labs/starters
- https://github.com/directus-labs/starters/blob/main/cms/nextjs/README.md
- https://github.com/directus-labs/directus-template-cli
- https://github.com/directus-labs/directus-templates
- https://github.com/directus-labs/agency-os
- https://github.com/directus-labs/extensions
- https://www.npmjs.com/package/@directus-labs/ai-writer-operation
- https://directus.com/extensions/directus-extension-ai-operation-bundle

**LiteLLM**
- https://github.com/BerriAI/litellm
- https://raw.githubusercontent.com/BerriAI/litellm/main/LICENSE (MIT, enterprise séparée)
- https://docs.litellm.ai/docs/proxy/virtual_keys
- https://docs.litellm.ai/docs/proxy/users
- https://docs.litellm.ai/docs/proxy/access_control
- https://docs.litellm.ai/blog/security-incident-oct-21-2026 (incident du 21 oct. 2026)

**Sources secondaires (à recouper)**
- https://blog.lo0.es/en/posts/litellm-virtual-keys-budgets-limits/ (analyse de LITELLM_SALT_KEY et de l'héritage des budgets)
- https://www.sonatype.com/blog/compromised-litellm-pypi-package-delivers-multi-stage-credential-stealer (24 mars 2026)
- https://blog.pypi.org/posts/2026-04-02-incident-report-litellm-telnyx-supply-chain-attack/ (2 avr. 2026)
- https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-docker/ (incident du 21 oct. 2026)
- https://www.microsoft.com/en-us/security/blog/2026/10/23/inside-the-litellm-1-107-0-supply-chain-compromise-credential-theft-through-python-startup-hooks/ (23 oct. 2026)
- https://upstash.com/blog/directus-semantic-search (types d'extensions)
