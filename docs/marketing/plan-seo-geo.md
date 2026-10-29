# Plan de marketing SEO et GEO — Nexora AI

Date : 29 octobre 2026 (mise à jour du jour : piliers rédigés, voir la section 5). Horizon : 90 jours (2 novembre 2026 au 30 janvier 2027). Documents liés : `audit-seo-geo.md` (état des lieux), `docs/seo.md` (code), `cms/content/README.md` (gouvernance du contenu), `docs/recherche/01`, `02`, `06`, `09`.

**Règles du plan.**

- **Aucune promesse chiffrée de résultat.** Ni classement, ni trafic, ni nombre de citations, ni inscriptions « visés ». Le plan fixe des **actions**, des **mesures** et des **seuils de décision** (que faire si une mesure est absente), jamais des gains attendus.
- **Gouvernance du contenu** : toute affirmation publiée est au registre `cms/content/claims.json` avec sa source ; rien d'inventé (pas de client, pas de chiffre de performance, pas de « le meilleur » sans preuve) ; aucune mention de la Loi 25 hors des pages qui la traitent ; le libre-service n'est pas ouvert à la vente et les paiements sont en mode test (CL-12) ; aucun comparatif nominatif sans validation du fondateur (R-47).
- **Honnêteté d'abord.** Les moteurs génératifs récompensent des faits nets, datés, cohérents d'une page à l'autre ; un fait faux ou périmé se retrouve cité pendant des mois. Chaque page dit son état réel (disponible, partiel, en test).
- Ce plan est un document de travail : les mots-clés n'ont **aucun volume mesuré** (docs/recherche/06 §5.1), les personas sont des **hypothèses** à valider par des entretiens.

## 1. Ce qu'on vend, en une phrase par ligne (état réel)

| Ligne | Ce que c'est | État à dire sans détour | Affirmations |
|---|---|---|---|
| Modèles et API | passerelle au format OpenAI, prix en dollars canadiens par jeton, lieu d'hébergement affiché pour chaque modèle | libre-service **pas ouvert à la vente**, paiements en mode test, aucun prix publié | CL-27, CL-S01 à S06, CL-12 |
| WorkStudio | agents et flux de travaux sans code, en français, validation humaine, gabarits de départ, Nexora Connect | livré, démonstration sur demande, aucun client cité | CL-20 à CL-26, CL-90 à CL-113 |
| OPSYS-AI | flagship : équipe d'agents coordonnée pour les PME de services terrain | **produit en développement, partiel** ; installation par les techniciens de Nexora AI | CL-O01 à CL-O10, CL-D01 à CL-D10 |
| VPS au Québec | serveurs privés virtuels avec une application d'IA au choix | « Nexora AI prépare… » ; rien de commandable | CL-13 |
| Nexora Apps | agent de code, Gitspace, RAG, WebPilot, Privacy Router, Creative, Nexora Bot | page `/apps` et fiches `/apps/<outil>` dans l'application, états « disponible / bientôt / plus tard » dans `i18n/apps.ts` ; **affirmations (gratuit, code ouvert prévu, inclus) absentes du registre `claims.json`** | à enregistrer (voir P12 et 11) |
| Québec et souveraineté | quatre couches de contrôle (données, modèles, calcul, exploitation) ; deux modes (chez vous, hébergé au Québec) | définition de travail, aucune valeur légale ; preuve de l'hébergement à produire (CL-A05) | CL-70 à CL-77, CL-E01 à CL-E09 |

**Phrase canonique de l'entreprise (à approuver, voir 11.2)** : « Nexora AI est une entreprise du Québec qui conçoit, installe et accompagne des systèmes d'IA : accès aux modèles par une API, WorkStudio, OPSYS-AI et serveurs privés virtuels, installés chez vous ou hébergés au Québec. » Elle s'appuie sur CL-130, CL-01, CL-02, CL-13, CL-27 ; elle remplacerait les trois descriptions courtes qui coexistent aujourd'hui (audit, section 4).

## 2. Personas (hypothèses à valider par cinq à huit entretiens chacun)

### 2.1 Nathalie, direction administrative d'une PME québécoise de services

- **Contexte** : trop de courriels, de factures et de documents, équipe réduite, peu de personnel technique. **But** : traiter plus vite sans embaucher, sans perdre le contrôle. **Freins** : données sensibles, budget, peur de « l'IA qui se trompe », jargon.
- **Mots (fr-CA)** : *automatisation des courriels PME*, *facturation automatisée PME*, *IA pour PME Québec*, *agent IA PME*, *prise de rendez-vous automatique*. **Mots (en-CA)** : *AI automation for small business Quebec*.
- **Questions posées aux moteurs génératifs** : « Par où commencer avec l'IA dans une PME ? », « L'IA peut-elle lire mes factures sans les envoyer aux États-Unis ? », « Qu'est-ce qu'un agent IA ? », « Faut-il un serveur puissant ? ».
- **Pages d'entrée** : guide PME (publié), guide agents (publié), solutions par cas, FAQ. **Conversion** : demande de diagnostic (`/contact?sujet=diagnostic`) ou de démonstration.
- **Preuves attendues** : statuts honnêtes, méthode, limites ; **jamais** de témoignage ni de gain chiffré tant qu'aucune étude de cas n'est autorisée par écrit (CL-09, CL-11).

### 2.2 Samuel, développeur ou agence qui veut une passerelle d'API

- **Contexte** : teste plusieurs modèles pour ses clients ; veut une clé, un format connu, des coûts prévisibles, des données contrôlées. **Freins** : enfermement chez un fournisseur, latence, opacité des prix, lieu de traitement.
- **Mots (fr-CA)** : *passerelle d'API de modèles*, *API compatible OpenAI*, *alternative à OpenRouter*, *API IA Canada*, *hébergement des modèles au Québec*. **Mots (en-CA)** : *AI model gateway*, *OpenAI-compatible API Canada*, *OpenRouter alternative*, *LLM gateway Canada pricing CAD*.
- **Questions** : « Quelle passerelle pour comparer des modèles en dollars canadiens ? », « Où sont traitées mes requêtes ? », « Comment changer de modèle sans réécrire mon code ? ».
- **Pages d'entrée** : passerelle (publiée), catalogue `/modeles`, `/docs/api`, comparatifs (P2, P3), VPS. **Conversion** : création d'une clé (en mode test aujourd'hui), demande de diagnostic.
- **Preuves attendues** : catalogue lisible, documentation exacte, état réel de la vente, politique de données par fournisseur.

### 2.3 Marc, DSI ou responsable TI qui veut la souveraineté des données

- **Contexte** : doit intégrer l'IA dans un système existant sans dépendre d'un fournisseur étranger ; doit documenter où vont les données. **Freins** : lois étrangères applicables à un fournisseur, stockage versus traitement, preuves contractuelles.
- **Mots (fr-CA)** : *IA souveraine Québec*, *hébergement de données au Québec*, *IA sur place PME*, *serveur IA sur place*, *où sont mes données IA*. **Mots (en-CA)** : *sovereign AI Quebec*, *Quebec data residency AI*, *on-premises AI server small business*.
- **Questions** : « Un hébergement au Canada suffit-il ? », « Quelle différence entre stockage et traitement ? », « Comment vérifier où tourne un modèle ? ».
- **Pages d'entrée** : souveraineté, déploiement (sur place, hébergé au Québec), centre de confiance, vos données. **Conversion** : étude de déploiement (`/contact?sujet=etude-deploiement`).
- **Preuves attendues** : schéma des flux, registre des sous-traitants, contrat de traitement (documents en préparation : CL-87, CL-A06 ; **ne pas les annoncer comme livrés**).

## 3. Grappes thématiques et mots-clés

Volumes : **non mesurés** (aucun outil de volume). Avant d'investir, mesurer avec la Search Console (requêtes réelles) et, si le fondateur l'autorise, DataForSEO (docs/recherche/02 §2.2). « Concurrence » : observation du 26 octobre 2026 (docs/recherche/06 §5.2), à rafraîchir.

| # | Grappe | Mot-clé principal (fr-CA) | Variantes et en-CA | Intention | Persona | Page | Concurrence observée |
|---|---|---|---|---|---|---|---|
| G1 | IA pour PME au Québec | *IA pour PME Québec*, *par où commencer IA PME* | *AI for small business Quebec* | informationnelle puis commerciale | Nathalie | P5 (publiée) | moyenne à élevée |
| G2 | Passerelle d'API de modèles | *passerelle d'API de modèles*, *passerelle IA modèles* | *AI model gateway*, *LLM gateway* | informationnelle, B2B | Samuel | P1 (publiée), P2 | faible au Québec ; ambiguïté avec « passerelle API » |
| G3 | Alternative à OpenRouter | *alternative à OpenRouter* | *OpenRouter alternative Canada* | comparaison | Samuel | P3 (à valider) | non observée ; la marque est celle du concurrent |
| G4 | API compatible OpenAI | *API compatible OpenAI*, *changer de modèle sans réécrire* | *OpenAI-compatible API* | informationnelle, technique | Samuel | P4 (avec `/docs/api`) | élevée (documentation d'éditeurs) |
| G5 | Hébergement de données au Québec | *hébergement de données IA Québec*, *où sont mes données IA* | *Quebec data residency AI* | informationnelle | Marc | P8 | moyenne (institutions présentes) |
| G6 | IA souveraine | *IA souveraine Québec* | *sovereign AI Quebec* | informationnelle, commerciale | Marc | souveraineté (publiée), P9 | moyenne à élevée |
| G7 | IA sur place | *serveur IA sur place PME*, *IA locale entreprise* | *on-premises AI server small business* | informationnelle puis commerciale | Marc, Nathalie | sur place (publiée), P10 | faible à moyenne (Québec) |
| G8 | Agents IA sans code | *agent IA PME*, *agents IA sans code* | *no-code AI agents small business* | informationnelle, commerciale | Nathalie | P6 (publiée), WorkStudio | élevée (surtout France) |
| G9 | WorkStudio et gabarits | *WorkStudio*, *gabarits de flux de travaux PME* | *AI workflow templates small business* | commerciale | Nathalie | WorkStudio, P7 | faible (marque propre) |
| G10 | VPS pour l'IA | *VPS Québec IA*, *héberger un agent IA* | *host AI agent VPS Canada* | transactionnelle | Samuel | VPS, P11 | élevée (hébergeurs établis) |
| G11 | Cas d'usage PME | *automatisation des courriels PME*, *facturation automatisée PME*, *service client IA PME*, *prise de rendez-vous IA* | variantes en-CA | commerciale | Nathalie | six pages solutions (publiées) | moyenne à élevée |
| G12 | OPSYS-AI | *logiciel IA entreprise de construction*, *estimation et soumission IA* | *AI software for construction companies* | commerciale B2B | dirigeant de construction | OPSYS-AI (publiée) | à observer |
| G13 | Marque | *Nexora AI*, *Nexora WorkStudio*, *OPSYS-AI* | idem | navigationnelle | tous | accueil, entreprise | nulle ou homonymes : à observer |
| G14 | Nexora Apps | *agent de code*, *RAG*, *routeur de confidentialité* | *private AI coding agent* | informationnelle, produit | Samuel | P12 | élevée ; **affirmations à enregistrer** |

**Lexique** : fr-CA (courriel, infonuagique à éviter dans les titres au profit de la description, passerelle de modèles, flux de travaux, sur place, renseignements personnels). Les variantes françaises de France (*TPE*, *email*, *sur site*) restent hors des titres.

## 4. Principes GEO (optimisation pour les moteurs génératifs)

Hypothèses de travail tirées de docs/recherche/01 §4.9 et de la littérature (arXiv:2311.09735 : citer des sources, présenter des faits vérifiables, reprendre des citations ; les gains chiffrés des articles de vulgarisation n'ont pas été revérifiés). **Rien de ce qui suit n'est garanti.**

1. **Réponse d'abord.** Chaque page pilier commence, sous le titre, par un bloc « La réponse en bref » de deux à quatre phrases autonomes, citables telles quelles.
2. **Phrases autonomes.** Chaque phrase importante nomme son sujet (« Nexora AI API est… », pas « Elle est… ») et ne dépend pas de la précédente : un moteur peut n'en extraire qu'une.
3. **Faits canoniques identiques partout** : `CANONICAL_FACTS` (code, tracé au registre) alimente `llms.txt` et `llms-full.txt` ; les pages disent les mêmes choses avec les mêmes mots.
4. **Définitions au premier usage** (jeton, agent, passerelle, flux de travaux, VPS) : ce sont des requêtes en soi.
5. **Honnêteté sur les limites** : une page qui dit ce qu'elle ne fait pas est plus fiable et se fait moins contredire.
6. **Entité cohérente** : même nom, même `@id`, mêmes profils (`sameAs`), même description canonique ; logo servi par le site.
7. **Fraîcheur réelle** : `dateModified` vient de Directus ; ne modifier une page que pour une vraie raison (une date « rafraîchie » sans changement perd sa valeur, docs/recherche/01 §4.10).
8. **Tableaux et listes** pour les comparaisons ; FAQ en question/réponse complètes. La situation actuelle de FAQPage dans les résultats enrichis de Google n'a pas été revérifiée (docs/recherche/01 §4.2) : on ne compte pas dessus ; la valeur retenue est l'extraction par les moteurs génératifs (hypothèse à mesurer, section 8).
9. **Sources lisibles** : lier les textes officiels quand ils sont cités (pages de lois seulement dans le guide dédié, test S3) ; dater les faits externes.
10. **Accès** : tout le public est ouvert aux robots de recherche, de réponse et d'entraînement ; les robots déclenchés par une personne (`ChatGPT-User`, `Claude-User`, `Perplexity-User`) voient la page comme un visiteur : **pas de contenu derrière JavaScript** (le contenu est rendu côté serveur).
11. **Version propre pour les machines** : `llms.txt` (plan et faits), `llms-full.txt` (contenu). Phase 2 à évaluer : une version Markdown de chaque page (`/<chemin>.md`), selon le patron « dualmark » (docs/recherche/01 §4.9), si les journaux montrent que les agents la demandent.

## 5. Les douze pages piliers

Légende (mise à jour du 29/10/2026) : **Publiée** = rédigée en fr-CA et en-CA, au statut `published` dans le dépôt, tests verts, chargée et vérifiée sur une instance Directus d'essai ; **elle n'est en ligne qu'après le chargement dans le Directus de production et l'approbation des affirmations par une personne habilitée** ; **Brouillon** = rédigée mais au statut `draft` et non indexée ; **À relire** = les faits externes doivent être relus à la publication ; **À rédiger** = plan prêt ; **À valider** = attend une décision ou une preuve du fondateur. Les « réponses d'abord » ci-dessous sont des **brouillons** : toute phrase qui n'est pas adossée à une affirmation existante est signalée « (à enregistrer) ». Liens internes : sortants et entrants listés ; chaque page publiée doit recevoir au moins un lien entrant (test S3).

### P1. Passerelle d'API de modèles d'IA — **Publiée** (`passerelle-api-modeles` / `model-gateway-api`)

- **Titre** (SEO) : « Passerelle d'API de modèles d'IA, format OpenAI ». **H1** : « Une API. Plusieurs modèles. Des prix lisibles. » **Intention** : informationnelle puis commerciale (Samuel). **Mot-clé** : *passerelle d'API de modèles* ; secondaires : *API compatible OpenAI*, *prix en dollars canadiens*.
- **Réponse d'abord** : « Une passerelle de modèles est un point d'accès unique à plusieurs modèles d'IA… Nexora AI API suit le format de l'API d'OpenAI. » (CL-27, CL-S04).
- **H2** : Une passerelle, en une phrase · Ce que la passerelle fait · De la clé au premier appel · Le lieu, dit sans détour · Limites à connaître · Passerelle d'API : vos questions · Parlons de votre usage.
- **Questions couvertes (FAQPage)** : qu'est-ce qu'une passerelle ; compatibilité OpenAI ; facturation ; lieu d'hébergement ; conservation du contenu des requêtes ; achat aujourd'hui ; utilité avec un seul modèle ; changer de modèle.
- **Données structurées** : BreadcrumbList, WebPage, **Service** (registre `page-schema.ts`), FAQPage. Aucune `Offer` (CL-12).
- **Liens** : sortants → `/modeles`, `/docs/api`, `/deploiement`, `/vos-donnees`, `/contact` ; entrants ← WorkStudio (carte API) ; à ajouter ← accueil (carte « Modèles et API »), P2, P3, P4, P11.
- **Prérequis** : CL-S01 à CL-S06 en revue ; **CL-S02 à confirmer** (journaux de la couche de routage amont).

### P2. Passerelle de modèles ou accès direct : comment choisir — **Publiée** (`guides/passerelle-ou-acces-direct` / `guides/gateway-or-direct-access`)

- **État (29/10/2026)** : rédigée comme prévu (tableau de huit critères sans marque, « Quand Nexora AI ne convient pas », FAQ). La ligne « latence ajoutée » dit qu'**aucune mesure n'est publiée** (CL-M08, décision 14 inchangée). Liens ajoutés : ← passerelle (P1), accueil ; → P4, P8, `/modeles`.

- **Intention** : comparaison, sans marque. **Mot-clé** : *passerelle de modèles ou accès direct*, *faut-il une passerelle LLM*.
- **Réponse d'abord (brouillon)** : « Une passerelle ajoute un intermédiaire ; elle devient utile quand vous comparez ou changez de modèle, ou quand vous voulez une seule clé, un seul plafond de dépense et une seule mesure de la consommation. Avec un seul fournisseur, un accès direct peut suffire. » (CL-27 ; raisonnement d'architecture, déjà publié dans la FAQ de P1.)
- **H2** : En bref : quand l'une, quand l'autre · Les critères (tableau) · Ce que la passerelle apporte · Ce qu'elle coûte en dépendance · Où passent vos données · Quand Nexora AI n'est pas le bon choix · Questions.
- **Tableau (critères, sans marque)** : nombre de fournisseurs ; clé et plafonds ; changement de modèle ; mesure de la consommation ; latence ajoutée (**à mesurer avant d'écrire** : aucune mesure n'existe) ; lieu de traitement ; contrat avec chaque fournisseur ; frais.
- **« Quand Nexora AI n'est pas le bon choix »** (honnêteté) : besoin d'un contrat direct avec le fournisseur ; besoin d'un modèle absent du catalogue ; achat immédiat en libre-service (non ouvert, CL-12) ; aucun niveau de service annoncé (CL-86).
- **Données structurées** : Article, FAQPage, BreadcrumbList. **Liens** : → P1, `/modeles`, `/docs/api`, P8 ; ← P1, P3.
- **Prérequis** : aucune nouvelle affirmation si le tableau ne chiffre rien ; la latence n'y figure qu'avec une mesure.

### P3. Alternative à OpenRouter : comparatif honnête — **Brouillon, à relire** (`guides/alternative-openrouter` / `guides/openrouter-alternative`, statut `draft`, `noindex`)

- **État (29/10/2026)** : page rédigée selon la méthode de la section 6, **non publiée**. Faits d'OpenRouter lus le 29/10/2026 sur `openrouter.ai/pricing` et `openrouter.ai/docs/faq` (CL-X01 à CL-X07, « en revue », portée « À RELIRE », échéance 29/01/2027) ; aucun adjectif de valeur, aucun prix de Nexora AI (aucun n'est publié), une section « Quand choisir l'autre ». **Elle divulgue que la passerelle peut s'appuyer sur OpenRouter comme fournisseur amont** (CL-M09, d'après `docs/privacy-router.md`) : sans cette phrase, le titre serait trompeur ; le fondateur la confirme ou la retire. Aucune page publiée ne renvoie vers elle (test). Reste : décision écrite du fondateur, relecture d'un avocat (CL-A10), revérification des faits le jour de la publication.

- **Pourquoi à valider** : nommer un concurrent engage la Loi sur la concurrence (art. 74.01 : représentation trompeuse) et la formulation retirée R-47 interdit toute « comparaison nominative ou dénigrante » sans faits sourcés. Les tests S3 refusent aujourd'hui le nom d'un prestataire non qualifié dans les pages.
- **Si le fondateur autorise** : une page « OpenRouter et Nexora AI API : ce qui diffère » avec **un tableau de faits sourcés et datés** de chaque côté, sans adjectif de valeur. Faits du concurrent relevés le 26 octobre 2026 (docs/recherche/06 §3.2) et **à revérifier le jour de la publication** : interface unique pour de nombreux modèles ; frais à l'achat de crédits ; options de données par fournisseur ; formule gratuite limitée ; routage régional réservé à une formule. Faits Nexora : CL-27, CL-S01 à S06, CL-12, CL-86.
- **Ce qu'on peut défendre honnêtement** : prix en dollars canadiens, lieu d'hébergement de chaque modèle affiché, installation chez vous ou hébergée au Québec, accompagnement. **Ce qu'on ne dit pas** : « meilleur », « moins cher », « plus sûr », « plus de modèles ».
- **H2** : En bref · Ce que chacun fait (tableau daté) · Données et lieu de traitement · Facturation · Pour qui · Quand choisir l'autre · Questions.
- **Variante sans marque** : P2 couvre la même intention sans nommer personne ; elle peut sortir seule.
- **Données structurées** : Article, FAQPage. **Prérequis** : décision écrite du fondateur ; extension du test S3 (liste de noms permis pour cette page) ; revue d'un avocat québécois (CL-A10).

### P4. API compatible OpenAI : changer de modèle en changeant l'adresse de base — **Publiée** (`guides/api-compatible-openai` / `guides/openai-compatible-api`)

- **État (29/10/2026)** : tutoriel en page du CMS (le texte riche accepte maintenant tableaux et code). Exemples cURL, Python et JavaScript **identiques mot pour mot** à ceux de `/docs/api` (test), adresse de base d'exemple `https://www.example.com/v1`. Vérifié sur la pile de développement avec curl et les bibliothèques officielles Python et JavaScript : liste des modèles (200, sans clé), clé invalide (401 `invalid_api_key`), modèle inconnu (404 `model_not_found`). **Aucun résultat d'appel réussi n'est montré** : la pile de développement refusait par précaution (migration du Privacy Router absente, 503). La page `/docs/api` a un `TechArticle`. Reste : un appel de conversation réussi, à constater sur une pile complète, pour pouvoir montrer un résultat.

- **Intention** : tutoriel (Samuel). **Mot-clé** : *API compatible OpenAI*, *changer l'adresse de base*.
- **Pourquoi hors CMS** : les blocs du CMS n'ont pas de bloc de code ; la documentation vit dans `app/[lang]/docs/api` (dictionnaire `gateway-*`). Proposition : ajouter à cette page une section « Changer de fournisseur en trois lignes » et un `TechArticle` daté.
- **Réponse d'abord** : « Pour utiliser Nexora AI API, changez l'adresse de base et la clé de votre client OpenAI ; le reste du code ne bouge pas. » (CL-S04 ; reprend la documentation publique.)
- **H2** : Les trois lignes à changer · Ce qui est pris en charge · Ce qui ne l'est pas (un seul choix par requête, paramètres propres à un fournisseur ignorés) · Erreurs et limites · Facturation · Questions.
- **Données structurées** : TechArticle + BreadcrumbList ; FAQPage si une FAQ s'affiche. **Liens** : ← P1, P2 ; → `/modeles`.

### P5. L'IA pour une PME du Québec : par où commencer — **Publiée** (`guides/ia-pme-quebec`)

- **Intention** : informationnelle (Nathalie). **Mot-clé** : *IA pour PME Québec*, *par où commencer*.
- **Réponse d'abord** : « Commencer par l'IA, c'est choisir un cas répétitif et précis, décider si le système vit chez vous ou est hébergé au Québec, nommer la personne qui valide, puis mesurer sur un pilote avant d'étendre. Aucun délai ni gain n'est universel. » (CL-03, CL-80, CL-02, CL-128, CL-14.)
- **H2** : La réponse en bref · Quatre questions avant de choisir · La méthode, en cinq temps · Chez vous ou au Québec · Les solutions les plus courantes · Ce que l'IA ne fait pas · IA pour PME : vos questions · Choisissons votre premier cas.
- **Données structurées** : BreadcrumbList, **Article** (image Open Graph, dates réelles), FAQPage. **Liens** : → solutions (6), déploiement (2), méthode, contact ; ← méthode, solutions ; à ajouter ← accueil, FAQ, entreprise.

### P6. Qu'est-ce qu'un agent IA ? Guide pour PME — **Publiée** (`guides/agents-ia-pour-pme`)

- **Intention** : informationnelle (Nathalie). **Mot-clé** : *agent IA PME*, *qu'est-ce qu'un agent IA*.
- **Réponse d'abord** : « Un agent IA est un assistant logiciel qui accomplit une tâche avec les outils que vous autorisez… Dans WorkStudio, chaque outil d'action demande par défaut l'accord d'une personne avant d'écrire ou de supprimer. » (CL-90, CL-93.)
- **H2** : La réponse en bref · Modèle, agent, flux de travaux · Ce qu'un agent fait, concrètement · Les garde-fous, un par un · Sans code : comment ça marche · Ce qu'un agent ne fait pas · Agents IA : vos questions · Voyez un agent à l'œuvre.
- **Données structurées** : BreadcrumbList, Article, FAQPage. **Liens** : → WorkStudio, solutions, contact ; ← WorkStudio ; à ajouter ← accueil, solutions courriels et documents.

### P7. Gabarits de flux de travaux pour PME — **Publiée** (`gabarits-flux-de-travaux` et 29 fiches `gabarits-flux-de-travaux/<gabarit>`)

- **État (29/10/2026)** : inventaire réel fait et relu après l'adaptation au Québec (`templates.ts`, commit 0888af53 : **vingt-neuf gabarits**, cinq qui envoient un courriel derrière une validation, deux qui reçoivent un fichier), figé dans `cms/content/gabarits-inventaire.json` (noms, descriptions, champs, étapes, clés JSON, références légales, taux) et vérifié par test. Une synthèse (cinq familles, limites, envoi) et une fiche fidèle par gabarit (champs de départ, étapes, ce qui est à valider, FAQ). **Les gabarits sont adaptés au Québec, à valider** : dollars canadiens, TPS de 5 % et TVQ de 9,975 % calculée sur le sous-total, numéros d'inscription et NEQ à la place du SIRET, courriel et infolettre (CL-M02, CL-M13, CL-111). **Limite honnête reprise sur chaque page** : aucune conformité fiscale ou légale n'est garantie, les exemples sont fictifs, un comptable ou un conseiller valide (CL-M12) ; les références légales de l'offre d'emploi et de l'accueil d'un salarié ne sont que nommées (CL-M14) ; la lecture de documents scannés garde TVA, hors taxes et toutes taxes comprises et n'est pas adaptée (CL-M15). Les fiches « Tri des courriels entrants » et « Infolettre mensuelle » portent les nouveaux noms (adresses inchangées). Le guide de prise en main de WorkStudio annonçait vingt modèles dans la version lue le 26/10/2026 (à vérifier).

- **Intention** : commerciale (Nathalie). **Mot-clé** : *gabarits de flux de travaux PME*, *modèles d'automatisation PME*, *AI workflow templates*.
- **Réponse d'abord (brouillon)** : « WorkStudio fournit des modèles de départ pour PME (devis, relances, tri des courriels, comptes rendus) : on les adapte à son entreprise avant de les déployer. » (CL-92 ; liste de la page WorkStudio ; CL-111 : modèles adaptés au Québec, à valider.)
- **H2** : En bref · Les gabarits fournis (liste fidèle à la page WorkStudio) · Comment on en adapte un · Adaptés au Québec, à valider (ce que l'adaptation fait et ne garantit pas : CL-M02, CL-M12) · De la description au flux (Copilote, CL-92) · Questions.
- **À faire avant** : **inventorier les gabarits réellement livrés** dans le dépôt de WorkStudio (noms, étapes) pour une page par gabarit ; sans inventaire, la page reste générale.
- **Données structurées** : Article, FAQPage, ItemList si une liste de gabarits nommés s'affiche. **Liens** : ← WorkStudio, P6 ; → solutions, contact.

### P8. Où sont vraiment vos données ? Stockage, traitement et juridiction — **Publiée** (`guides/ou-sont-vos-donnees-ia` / `guides/where-is-your-ai-data`)

- **État (29/10/2026)** : trois questions, tableau des trois modes, liste de six questions à poser, documents que Nexora AI remet. Aucune mention de la Loi 25, aucune promesse de résidence : la preuve du lieu d'hébergement est dite « en préparation » (CL-87).

- **Intention** : informationnelle (Marc). **Mot-clé** : *où sont mes données IA*, *hébergement de données IA Québec*, *Quebec data residency AI*.
- **Réponse d'abord (brouillon)** : « Savoir où sont vos données demande trois questions : où elles sont stockées, où elles sont traitées, et à quelle juridiction est soumis le fournisseur. Un stockage au Canada n'implique pas un traitement au Canada. » (CL-E08, CL-E09, CL-75.)
- **H2** : En bref · Stockage, traitement, juridiction · Ce que disent les services d'IA grand public (CL-E07 : réglage à désactiver soi-même) · Chez vous, hébergé au Québec, ou via une API (trois modes, tableau) · Ce que la fiche d'un modèle dit, et ne dit pas · Quoi demander à un fournisseur (liste) · Ce que Nexora AI documente par écrit (CL-05, CL-73) · Questions.
- **Données structurées** : Article, FAQPage. **Liens** : → souveraineté, vos données, P1, déploiement (2), centre de confiance ; ← P1, P9, P10.
- **Prérequis** : aucune nouvelle affirmation si on reste aux CL existantes. **Ne pas** écrire « conforme à la Loi 25 » ni citer la loi hors du guide dédié (brouillon, non publié).

### P9. IA souveraine : liste de contrôle pour une DSI — **Publiée** (`guides/ia-souveraine-liste-de-controle` / `guides/sovereign-ai-checklist`)

- **État (29/10/2026)** : quatre couches, douze questions, preuves à demander, pièges, « ce que Nexora AI ne promet pas ». Ni « 100 % souverain », ni certification.

- **Intention** : informationnelle puis commerciale (Marc). **Mot-clé** : *IA souveraine Québec*, *liste de contrôle IA souveraine*, *questions à poser à un fournisseur d'IA*.
- **Réponse d'abord (brouillon)** : « Une IA est souveraine quand on sait où elle tourne et où vont les données. Nexora AI la décrit par quatre couches de contrôle : les données, les modèles, le calcul et l'exploitation ; c'est une définition de travail, sans valeur légale. » (CL-70, CL-71.)
- **H2** : En bref · Les quatre couches · Les questions qui comptent (liste à cocher) · Preuves à demander (schéma des flux, sous-traitants, journaux d'accès) · Pièges (flux sortants, bascule silencieuse : CL-76, CL-77) · Ce que Nexora AI ne promet pas (CL-75) · Questions.
- **Données structurées** : Article, FAQPage. **Liens** : → souveraineté, P8, centre de confiance, déploiement ; ← souveraineté.
- **Attention** : « 100 % souverain », « inviolable » interdits (docs/recherche/06 §4.5).

### P10. Serveur d'IA sur place : ce qu'il faut décider avant d'acheter — **Publiée** (`guides/serveur-ia-sur-place` / `guides/on-premises-ai-server`)

- **État (29/10/2026)** : cinq décisions, flux sortants, qui fait quoi, installation en une commande, limites. **Aucun prix ni dimensionnement** (décision 13 inchangée).

- **Intention** : informationnelle puis commerciale (Marc, Nathalie). **Mot-clé** : *serveur IA sur place PME*, *IA locale entreprise*, *peut-on faire tourner une IA sans internet*.
- **Réponse d'abord (brouillon)** : « Le matériel nécessaire dépend du nombre d'utilisateurs, du volume de documents, du modèle choisi et des usages ; il est établi au diagnostic, avant tout achat. Un petit modèle local ne suffit pas toujours pour les agents qui appellent des outils. » (CL-82, CL-83.)
- **H2** : En bref · Les cinq décisions (usagers, documents, modèle, outils, sauvegardes) · Ce qui reste chez vous, ce qui sort (CL-77) · Qui fait quoi : vous, Nexora AI (CL-72, CL-04) · Installation en une commande (CL-26, CL-88) · Limites (aucun niveau de service annoncé : CL-86) · Questions.
- **Données structurées** : Article, FAQPage. **Liens** : → sur place, installation de serveurs, P8 ; ← sur place, services.
- **Prérequis** : **aucun prix ni dimensionnement chiffré** tant que le fondateur n'a pas de grille (docs/recherche/11 : enquête de prix VPS).

### P11. VPS au Québec pour agents d'IA : choisir son application et son plan — **Publiée** (`guides/vps-quebec-agents-ia` / `guides/quebec-vps-ai-agents`)

- **État (29/10/2026)** : écrite d'après la page `/vps` réelle et le jeu de départ des applications (cinq installées par Nexora AI, trois en guide seulement pour des raisons de licence). Dit que rien n'est commandable (CL-13, CL-12) ; ni prix ni mémoire minimale chiffrée (le catalogue publié fait foi).

- **Intention** : transactionnelle (Samuel). **Mot-clé** : *VPS Québec IA*, *héberger un agent IA*.
- **Réponse d'abord (brouillon)** : « Nexora AI prépare des serveurs privés virtuels hébergés au Québec, avec une application d'IA installée au choix. » (CL-13 : **rien n'est commandable aujourd'hui**, la page doit le dire.)
- **H2** : En bref · Ce qu'est un VPS (défini) · Les applications proposées (liste générée depuis le catalogue publié) · Quel plan pour quelle application (mémoire minimale par application ; **pas de prix tant qu'aucun plan n'est publié**) · Ce qui est inclus, ce qui ne l'est pas · Questions.
- **Données structurées** : Article, ItemList des applications, SoftwareApplication par fiche (existant). `Offer` seulement quand un prix est publié (CL-12).
- **Remarque** : cette page vit mieux dans l'application (données du catalogue) qu'en CMS.

### P12. Nexora Apps : l'agent de code et la suite d'outils — **Publiée dans l'application (affirmations enregistrées)**

- **État (29/10/2026)** : (1) « La réponse en bref » sur chaque fiche ; (2) affirmations au registre : CL-AP01 (gratuit prévu), CL-AP02 (code ouvert prévu), CL-AP03 (Privacy Router incluse), CL-AP04 (abonnement), CL-AP05 (à l'usage, plus tard), chaque outil les cite (`claims` du registre `i18n/apps.ts`, vérifié par test) ; (3) `publisher` = l'Organization dans le `SoftwareApplication` ; (4) liens entrants ajoutés (accueil, WorkStudio, passerelle) ; (5) FAQ qui dit ce qui est prêt. **Nexora Cloud** (espace infonuagique avec dépôt de code) est ajoutée. La fiche de Privacy Router dit désormais ce que la passerelle applique déjà. Reste : fixer les conditions de « gratuit » (durée, limites d'usage) avant toute sortie.
- **Ancien état constaté** :

- **État constaté (29 octobre 2026, après la fusion de la page Apps)** : `/apps` et une fiche par outil (`/apps/bot`, `/apps/code`, `/apps/creative`, `/apps/gitspace`, …) sont dans le plan du site et dans `llms.txt` ; chaque outil dit son état (disponible, bientôt, plus tard) ; le balisage `SoftwareApplication` n'émet aucune offre.
- **Intention** : produit (Samuel). **Mot-clé** : *agent de code privé*, *RAG*, *routeur de confidentialité*, *Gitspace*.
- **Ce que le plan demande encore** : (1) un bloc « La réponse en bref » par fiche et sur l'index ; (2) **les affirmations au registre** : « gratuit », « code ouvert prévu », « inclus par défaut » (Privacy Router) sont dans le dictionnaire `i18n/apps`, pas dans `claims.json` : les enregistrer avec leur source, leurs conditions (durée, limites d'usage) et leur état ; (3) renvoyer l'éditeur à l'Organization (`softwareApplicationJsonLd` accepte désormais `publisher`) ; (4) des liens entrants depuis l'accueil, WorkStudio et P1 ; (5) une FAQ qui dit ce qui est prêt et ce qui ne l'est pas.
- **Liens** : ← accueil, WorkStudio, P1 ; → documentation, contact.

## 6. Comparatifs honnêtes (méthode)

Un comparatif honnête suit six règles : (1) **critères d'abord**, choisis avant de regarder qui gagne ; (2) **faits sourcés et datés** des deux côtés, avec lien vers la source ; (3) **pas d'adjectif de valeur** (« meilleur », « plus sûr », « moins cher ») ; (4) **une section « quand choisir l'autre »** ; (5) **ce que Nexora AI ne fait pas** dit en toutes lettres (libre-service non ouvert, aucun niveau de service annoncé, catalogue limité) ; (6) **revérification** à chaque publication et tous les trois mois, avec la date de dernière vérification affichée.

| Comparatif | Nommé ? | État | Condition |
|---|---|---|---|
| Passerelle ou accès direct (P2) | non | **publiée** | aucune |
| Chez vous, hébergé au Québec ou API (dans P8) | non | **publiée** | aucune |
| Outils d'automatisation génériques ou WorkStudio (dans P6, P7) | non | publiée (P6) ; P7 décrit les gabarits sans comparer | décrire les approches, pas les marques |
| OpenRouter et Nexora AI API (P3) | **oui** | **brouillon, à relire** | décision écrite du fondateur, faits revérifiés le jour de la publication, avis d'un avocat (R-47, CL-A10) |

## 7. Plan de maillage interne

| Page | Liens sortants (cibles principales) | Liens entrants à créer |
|---|---|---|
| Accueil | solutions, WorkStudio, OPSYS-AI, `/modeles`, `/vps` (existants) | **fait** → P5, P6, P2, Nexora Apps (paragraphe de la méthode) ; P1 par WorkStudio et `/modeles` |
| WorkStudio | solutions, contact | → P1 (fait), P6 (fait), **P7 et P4 (fait)**, Nexora Apps (fait) |
| Solutions (hub) | six solutions, WorkStudio | → P5 (fait) |
| Méthode | contact, services, WorkStudio | → P5 (fait) |
| Souveraineté | déploiement, vos données | **fait** → P8, P9 |
| Déploiement sur place | contact | **fait** → P10, P8 |
| `/modeles`, `/docs/api` | catalogue, fiches | P1 → P2, P4, P11 (fait) ; les pages d'application elles-mêmes restent minces (audit 5.1) |
| FAQ | contact, solutions | → P5, P6, P8 (réponses en texte brut : liens à ajouter plus tard) |

Règle : un lien dans le **corps** d'un texte vaut plus qu'un lien de menu ; un texte de lien décrit la cible (« le guide de l'IA pour une PME du Québec », pas « cliquez ici »).

## 8. Mesure : quoi, comment, avec quelles limites

**Aucune cible chiffrée.** Chaque mesure a une définition, un outil, une fréquence et un **seuil de décision** (que faire quand elle manque).

| Famille | Indicateur | Comment on le mesure | Fréquence | Seuil de décision |
|---|---|---|---|---|
| Indexation | URL du plan du site indexées / URL soumises | Search Console, rapport « Pages » ; API d'inspection d'URL (2 000 par jour et par propriété) | hebdomadaire | une URL indexable non indexée après trois semaines : examiner le rendu, le maillage, les doublons |
| Indexation | erreurs d'exploration, pages exclues | Search Console, Bing Webmaster | hebdomadaire | toute erreur de serveur : corriger la semaine même |
| Visibilité | impressions, clics, CTR, position moyenne par grappe (G1 à G14) | Search Console, filtres de requêtes par expression régulière ; historique archivé (la console n'en garde que seize mois) | mensuelle | une grappe sans impression après huit semaines : revoir titre, réponse d'abord, maillage |
| Visibilité | requêtes de marque (*Nexora AI*, *WorkStudio*, *OPSYS-AI*) | Search Console | mensuelle | indicateur de notoriété, jamais une cible |
| Moteurs génératifs | **taux de mention** et **taux de citation** de nexora sur un panel fixe de requêtes (annexe A), par moteur et par langue | protocole ci-dessous | mensuelle | un fait faux restitué : corriger la page source et `CANONICAL_FACTS`, puis re-tester |
| Moteurs génératifs | **exactitude** : chaque fait de `llms.txt` restitué correctement (oui/non) | même panel | mensuelle | un fait restitué faux deux mois de suite : le reformuler en phrase plus autonome |
| Moteurs génératifs | **récupérations par une personne** : requêtes `ChatGPT-User`, `Claude-User`, `Perplexity-User`, `MistralAI-User` dans les journaux du serveur | journaux d'accès (agrégés, sans adresse IP personnelle) | hebdomadaire | pages récupérées = pages utiles pour répondre : renforcer celles-là |
| Trafic | sessions par canal (recherche, direct, **moteurs génératifs** par origine : chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai) | analytique **sans témoins et auto-hébergée** (Umami, MIT : docs/recherche/02 §6.1), **à valider** | hebdomadaire | si la mesure n'existe pas, ne rien conclure |
| Conversions | demandes de diagnostic, de démonstration, d'étude de déploiement (par `sujet`) ; clés d'API créées (mode test) ; comptes créés | base `app` (événements internes du formulaire de contact et de la passerelle), jamais un outil tiers | hebdomadaire | rapprocher chaque conversion de sa page d'entrée quand l'analytique le permet |
| Technique | Core Web Vitals terrain (LCP 2 500 ms, INP 200 ms, CLS 0,1 au 75e centile) | CrUX, Lighthouse du worker (03 h) | mensuelle | tout dépassement : ouvrir une tâche avec la page et la cause |
| Technique | problèmes ouverts de l'audit nocturne (structure, liens, accessibilité, performance) | module « SEO » de Directus | quotidienne | zéro erreur ouverte avant toute publication |

### Protocole du panel « moteurs génératifs » (reproductible, honnête sur ses limites)

1. **Panel fixe** : 30 requêtes fr-CA et leurs équivalents en-CA (annexe A), figées et versionnées dans `docs/marketing/`.
2. **Moteurs** : ChatGPT (avec recherche), Perplexity, Gemini, Claude (avec recherche), Copilot, Google (aperçus IA). Utiliser les **API officielles** ou les interfaces, **sans extraction automatisée** des pages de résultats (interdite par leurs conditions : docs/recherche/02 §6.3).
3. **Pour chaque exécution** : date, moteur et version annoncée, langue, session neuve, trois exécutions par requête (les réponses varient), conservation du texte et des sources citées.
4. **Notation** : (a) *Nexora AI est-elle nommée ?* (oui/non) ; (b) *une page de nexora est-elle citée ?* (oui/non) ; (c) *les faits restitués sont-ils exacts ?* (oui/non par fait de `CANONICAL_FACTS`) ; (d) *quels concurrents sont cités ?* (information).
5. **Limites** : résultats non déterministes, personnalisés, variables dans le temps ; échantillon petit ; **aucune conclusion statistique** ; on suit une tendance qualitative et on cherche les faits faux, pas un « score ».

## 9. Calendrier sur 90 jours

**Avancement au 29/10/2026** : les piliers P2, P4, P7, P8, P9, P10 et P11 sont rédigés d'avance (et P3 en brouillon) ; il reste leur approbation, leur chargement en production et la mesure de référence. Les semaines 3 à 10 se réduisent donc au contrôle des faits, au maillage et aux mesures.

Début : lundi 2 novembre 2026. Les semaines 8 et 9 (fêtes) sont allégées. Les tâches « fondateur » bloquent d'autres tâches : elles sont en tête.

| Semaine | Dates | Actions | Livrable |
|---|---|---|---|
| 1 | 2 au 8 nov. | **Fondateur** : approuver la politique des robots, la phrase canonique, CL-S01 à CL-S06 ; fournir profils publics et coordonnées. Charger les trois pages dans Directus (`load-content.ts`). Poser `SITE_SAME_AS`. | décisions écrites ; pages publiées |
| 1 | idem | Connecter Bing Webmaster et la Search Console (vérification de propriété) ; autoriser IndexNow ; vérifier `robots.txt`, `sitemap.xml`, `llms.txt` en production avec `check-seo.ts`. | état des adaptateurs « connecté » |
| 2 | 9 au 15 nov. | Installer l'analytique sans témoins (si validée). **Mesure de référence** : panel de requêtes (annexe A) sur les six moteurs, pages indexées, Core Web Vitals. | rapport de référence daté |
| 3 | 16 au 22 nov. | Rédiger **P2** (passerelle ou accès direct) et **P8** (où sont vos données). Enrichir `/modeles`, `/vps`, `/tarifs` (propriétaires) : réponse d'abord, FAQ, liens. | P2, P8 en revue |
| 4 | 23 au 29 nov. | Publier P2, P8. Relier accueil, FAQ, souveraineté (maillage, section 7). Entretiens personas (Nathalie, Samuel, Marc) : cinq par segment. | liens entrants en place |
| 5 | 30 nov. au 6 déc. | Rédiger **P9** (liste de contrôle DSI) et **P10** (serveur sur place). Inventaire des gabarits livrés de WorkStudio. | P9, P10 en revue |
| 6 | 7 au 13 déc. | Publier P9, P10. Rédiger **P7** (gabarits) avec l'inventaire. Première lecture des requêtes réelles de la Search Console : ajuster titres et descriptions. | P7 en revue |
| 7 | 14 au 20 déc. | Publier P7. **P4** (tutoriel API) avec le propriétaire de `/docs/api`. | P4 en revue |
| 8 | 21 au 27 déc. | Allégée : mesures hebdomadaires seulement ; revue des faits de `llms.txt`. | — |
| 9 | 28 déc. au 3 janv. | Allégée : idem. Préparer P11 (VPS) et P12 (Nexora Apps : registre, réponse d'abord) avec leurs propriétaires. | — |
| 10 | 4 au 10 janv. | Publier P4. Rédiger **P11**. **P3** seulement si le fondateur a décidé (section 6). | P11 en revue |
| 11 | 11 au 17 janv. | Publier P11 ; compléter **P12** (Nexora Apps) une fois ses affirmations au registre. Deuxième passage du panel de requêtes. | rapport n° 2 |
| 12 | 18 au 24 janv. | Rafraîchir les pages dont un fait a changé (jamais « pour la date ») ; corriger les faits restitués faux ; compléter le maillage. | pages à jour |
| 13 | 25 au 30 janv. | **Revue trimestrielle** : robots d'IA (registre), faits canoniques, claims, rapport final de 90 jours, plan des 90 jours suivants. | rapport et décisions |

**Seuils de décision à la fin des 90 jours** (sans chiffre promis) : si aucune des pages publiées n'est indexée, arrêter de publier et diagnostiquer (rendu, robots, canonicals, sitemap) ; si des faits faux sont restitués par plusieurs moteurs, corriger avant d'écrire autre chose ; si aucune récupération par une personne n'apparaît dans les journaux, revoir la visibilité des pages (indexation, liens, requêtes).

## 10. Autorité hors du site (off-page), dans le respect des règles

Le code ne produit pas ces signaux ; ils dépendent du fondateur. Ils comptent pour les moteurs de recherche comme pour les moteurs génératifs (mentions concordantes d'une même entité).

1. **Profils officiels cohérents** (même nom, même description canonique, même logo, lien vers le site) : LinkedIn, dépôt de code public, chaîne vidéo si elle existe. **Les poser dans `SITE_SAME_AS`** quand ils existent. Rien n'est inventé.
2. **Annuaires et citations locales** (Québec et Canada : docs/recherche/02 §5.4) : exigent l'identité légale (raison sociale, NEQ, adresse : CL-A01, CL-A02, à fournir). Nom, adresse et téléphone **identiques** partout.
3. **Mentions concrètes** : articles invités ou études de cas **avec accord écrit du client** (aucun aujourd'hui, donc rien à publier) ; contributions utiles à des communautés techniques (réponses sourcées, pas de promotion déguisée).
4. **Interdits** (docs/recherche/02 §7) : faux avis, achat de liens, contenu produit en masse sans relecture (la gouvernance du registre est l'antidote), pages « satellite », texte caché. Les avis ne se rédigent ni ne se masquent (CL-G07).
5. **Diffusion** : l'agent de diffusion (Postiz) reste **non connecté** tant que le fondateur n'a pas donné son accord (docs/seo.md §3) ; chaque publication est validée par une personne.

## 11. À valider par le fondateur

Mise à jour du 29/10/2026. Les lignes **faites** sont gardées pour la trace ; la liste à traiter est celle des lignes « reste ».

| # | Décision ou information | Pourquoi | État |
|---|---|---|---|
| 1 | Politique des robots d'IA : tout autorisé, entraînement compris (décision du 29/10/2026) ; revue trimestrielle ; repli `ROBOTS_AI_TRAINING=disallow` | engage l'usage du contenu public par des tiers | **reste** : confirmation écrite |
| 2 | **Une** description canonique de l'entreprise (phrase de la section 1 ou autre) ; à poser dans les réglages publiés (`seoDescription`), le dictionnaire et l'accueil | une seule description pour les moteurs | **reste** |
| 3 | Profils publics (`SITE_SAME_AS`), adresse, courriel, téléphone (CL-A01, CL-A02) | Organization complète, citations locales | **reste** |
| 4 | Approbation des affirmations « en revue » (188 au registre, dont les 30 nouvelles : CL-M01 à M11, CL-X01 à X07, CL-AP01 à AP05, plus CL-S01 à S06) ; **confirmation de CL-S02** (journaux de la couche de routage amont, clauses des fournisseurs : CL-A12) | rien n'est « approuvé » par un script | **reste** |
| 5 | Chargement des pages dans le Directus de production ; connexion Bing Webmaster et Search Console ; autorisation d'écriture IndexNow | actions d'écriture | **reste** : les 37 pages nouvelles et les pages modifiées sont chargées **en brouillon** (versions et approbations en attente) sur le Directus de développement (8456) ; la chaîne complète (approbation, promotion, lecture publique conforme) est vérifiée sur une instance jetable. Relancer `apply.ts` (barre d'outils « Tableau », « Bloc de code ») avant toute édition dans le panneau |
| 6 | Comparatif nommé (P3) : le publier ou non ; confirmer la divulgation du fournisseur amont (CL-M09) ; avis d'un avocat (CL-A10) ; faits d'OpenRouter à relire le jour de la publication | Loi sur la concurrence, R-47 | **reste** : page rédigée, en brouillon non indexé |
| 7 | Nexora Apps : conditions de « gratuit » (durée, limites d'usage), « code ouvert prévu » ; état réel | gouvernance du contenu | **fait en partie** : affirmations enregistrées (CL-AP01 à AP05), citées par chaque fiche ; **reste** les conditions |
| 8 | Analytique sans témoins et auto-hébergée (Umami) : oui ou non ; emplacement des données | mesure du trafic et des conversions | **reste** |
| 9 | Date de dernière mise à jour **visible** sur les guides | fraîcheur lisible | **fait** : ligne de signature (auteur, publication, mise à jour réelles) |
| 10 | Page `/tarifs` : « essai gratuit » alors que CL-61 | contradiction publique | **fait** : retiré de la description et de l'accroche ; `trial_days` = 0 dans le jeu de départ (**à confirmer** : l'accès gratuit reste réservé à l'administrateur de la maison) |
| 11 | Réouverture du libre-service : quand les paiements passent en production, publier prix et `Offer` (JSON-LD, tableaux de P1, P11) | CL-12 | **reste** |
| 12 | Gabarits de WorkStudio : inventaire réel | P7 | **fait** (29 gabarits) ; **fait** : gabarits adaptés au Québec (TPS, TVQ, vocabulaire), fiches mises à jour le 29/10/2026 ; **reste** : validation par un comptable, et adaptation de la lecture de documents (CL-M15) |
| 13 | Grille de matériel et de prix pour le serveur sur place | P10 | **reste** : P10 n'en publie aucune |
| 14 | Latence ajoutée par la passerelle : une mesure existe-t-elle ? | P2 | **reste** : aucune mesure, la page le dit (CL-M08) |
| 15 | Domaine de production : les exemples de P4 utilisent `https://www.example.com/v1` | exemples exacts | **nouveau** : fixer le domaine, puis remplacer |
| 16 | Menu public « Produits » à six entrées (VPS, Modèles et API, WorkStudio, Nexora Apps, Suite logicielle, OPSYS-AI) : Croissance et Vision n'y sont plus (restent au pied de page) | consigne du 29/10/2026 | **à confirmer** |
| 17 | `/agents` : indexable (état actuel) ou non | audit 5.1 | **à décider** |
| 18 | URL anglaises localisées (`/en/modeles` → `/en/models`) | mot-clé anglais dans l'adresse | **reporté** (sous-chemins de fiches, redirections à tester) |

### Décisions provisoires, modifiables par le fondateur

- **P3 en brouillon.** Rédigée mais non publiée ; elle nomme OpenRouter et le dit amont de la passerelle (CL-M09).
- **Pas de résultat d'appel réussi dans P4** (R-52) : seul le 401 observé est montré.
- **Les fiches de gabarits disent « adaptés au Québec, à valider »**, jamais « conformes » : les taux (TPS, TVQ) et les clés de sortie sont lus dans `templates.ts` et vérifiés par test, mais aucun comptable ne les a validés ; la lecture de documents scannés (TVA, hors taxes, toutes taxes comprises) est dite non adaptée plutôt que passée sous silence.
- **Les piliers sont « Publiée » au sens du dépôt** : rien n'est en ligne tant qu'une personne n'a pas approuvé les affirmations et chargé le Directus de production.
- **Privacy Router** : la fiche reste « Bientôt » (la passerelle qui l'applique n'est pas ouverte à la vente), mais ne la dit plus non livrée.
- **Pas de page « VPS en un clic » dans Nexora Apps** : `/apps` présente déjà le VPS parmi les produits principaux (lien vers `/vps`) ; Nexora Cloud est la seule fiche ajoutée.

## Annexe A. Panel de requêtes de mesure (30, à figer au début du jour 1)

Chaque requête a un équivalent en-CA. Les requêtes sont celles qu'une personne poserait, pas des mots-clés.

**Nathalie (PME)** : 1. Par où commencer avec l'IA dans une PME au Québec ? 2. Qu'est-ce qu'un agent IA et à quoi sert-il dans une PME ? 3. Comment automatiser le tri de mes courriels avec l'IA sans perdre le contrôle ? 4. L'IA peut-elle lire mes factures fournisseurs sans les envoyer à l'étranger ? 5. Faut-il un serveur puissant pour faire tourner une IA dans une PME ? 6. L'IA va-t-elle remplacer mes employés ? 7. Qu'est-ce que WorkStudio ? 8. Existe-t-il des modèles de flux de travaux prêts à l'emploi pour une PME ? 9. Comment faire de la prise de rendez-vous automatique avec l'IA ? 10. Quelle entreprise du Québec installe des systèmes d'IA pour les PME ?

**Samuel (API)** : 11. Qu'est-ce qu'une passerelle d'API de modèles ? 12. Existe-t-il une API compatible OpenAI avec des prix en dollars canadiens ? 13. Comment changer de modèle sans réécrire mon code ? 14. Où sont traitées mes requêtes quand j'appelle un modèle par une passerelle ? 15. Une passerelle conserve-t-elle le contenu de mes requêtes ? 16. Faut-il une passerelle si je n'utilise qu'un modèle ? 17. Quelles sont les alternatives à OpenRouter au Canada ? 18. Peut-on héberger un agent IA sur un VPS au Québec ? 19. Quelle est la différence entre un agent et un flux de travaux ? 20. Qu'est-ce que Nexora AI API ?

**Marc (DSI)** : 21. Qu'est-ce qu'une IA souveraine ? 22. Un hébergement au Canada suffit-il pour garder mes données ? 23. Quelle différence entre stockage et traitement des données d'un service d'IA ? 24. Quelles questions poser à un fournisseur d'IA sur le lieu de mes données ? 25. Peut-on faire tourner une IA sans internet dans une entreprise ? 26. Quelle entreprise installe un serveur d'IA sur place au Québec ? 27. Qu'est-ce qu'OPSYS-AI ? 28. Nexora AI utilise-t-elle mes données pour entraîner des modèles ? 29. Comment vérifier où tourne un modèle d'IA ? 30. Qui est Nexora AI ?

Les questions 7, 20, 27, 28 et 30 mesurent **l'exactitude des faits sur l'entreprise** : ce sont elles qui révèlent une description périmée ou contradictoire.
