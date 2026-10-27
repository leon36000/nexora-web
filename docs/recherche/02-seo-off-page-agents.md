# Recherche SEO off-page et agents SEO autonomes pour le site Nexora

Date du rapport : 26 octobre 2026. Relevés GitHub effectués les 26 et 27 octobre 2026 (horodatages des requêtes).
Périmètre : suivi de positionnement, backlinks, mots-clés, concurrents, agents et pipelines SEO IA, diffusion et réseaux sociaux, relations presse numériques, citations locales (Québec et Canada), analytique souveraine, visibilité dans les moteurs IA, garde-fous.

## 0. Méthode, légende et limites

- Métadonnées GitHub (licence, étoiles, dernier push, archivage) relevées via l'API publique GitHub et un connecteur de métadonnées. Aucun dépôt cloné, rien installé, aucun secret lu.
- Pages officielles lues : Google Search Central (politiques de spam, AI Overviews, quotas Search Console), Google Business Profile, politique Google Maps, OpenAI (robots), Données Québec, LCAP (fightspam.gc.ca), Loi sur la protection des renseignements personnels dans le secteur privé (texte consolidé CanLII), Directus (annonce de licence), DataForSEO (tarifs publics).
- Certaines pages ont été résumées par un outil de synthèse ; les détails qui comptent pour une décision sont à recouper.
- Étiquettes de niveau de preuve : [P] = vérifié sur source primaire (dépôt, page officielle, texte de loi, tarif publié). [S] = source secondaire ou agrégateur, à confirmer avant décision.
- Verdicts : Adopter, À évaluer, Écarter.
- Non vérifié ou introuvable : texte officiel de la politique Google Ads sur Keyword Planner, tarifs de Canada NewsWire, processus Apple Business Connect au Canada, gratuité des fiches Pages Jaunes, dépôt NotFair, exigences officielles X, Meta et LinkedIn.
- Ce rapport n'est pas un avis juridique. Les points relevant du droit (Loi 25, LCAP, Loi sur la concurrence, licences) doivent être validés par un juriste.

## 1. Synthèse

1. OpenSEO (MIT, 25 128 étoiles, dernier push le 26 octobre 2026) est la brique la plus solide pour les données SEO et les agents : auto-hébergeable, il exige une clé DataForSEO et expose un serveur MCP.
2. DataForSEO est le fournisseur de données le plus clair et le moins cher parmi ceux dont les tarifs publics ont été vérifiés. Il faut fixer un plafond de dépense dès le départ.
3. Le suivi de positionnement par scraping de Google est un point de risque : Google classe le scraping de résultats pour suivre son positionnement parmi le trafic automatisé. Google Search Console doit rester la source primaire.
4. Google n'exige ni llms.txt ni balisage spécifique pour apparaître dans AI Overviews et AI Mode. La visibilité IA dépend du contenu indexable, des données structurées fidèles au texte visible et de la mesure dans Search Console.
5. Analytique : Umami (MIT, sans témoins) est le choix le plus simple. Plausible Community Edition (AGPL) et Matomo (GPL) sont plus lourds à exploiter.
6. Diffusion sociale : Postiz (AGPL-3.0, 38 477 étoiles) est le plus complet. Mixpost (MIT) a un dernier push en mars 2026 et une stack PHP.
7. Citations locales : la fiche Google Business Profile est prioritaire. Le Registre des entreprises du Québec est sous licence CC BY-NC-SA 4.0 : usage commercial exclu.
8. Loi 25, articles 8.1 et 9.1 : information préalable sur les technologies de profilage et paramètres de confidentialité par défaut. À prendre en compte pour tout outil d'analytique ou de témoins.
9. Plusieurs projets « SEO IA tout-en-un » très promus sont récents, opaques ou promettent des correctifs automatiques : à écarter ou à surveiller.
10. Licences à respecter avant toute offre client : n8n (usage interne), Postiz et Plausible (AGPL), Directus (MSCL depuis la v12).

## 2. Suivi de positionnement, mots-clés et données

### 2.1 Projets open source

| Projet | Licence | Étoiles | Dernier push | Ce qu'il apporte | Intégration Docker / Next.js / Directus | Maturité | Verdict | Niveau |
|---|---|---|---|---|---|---|---|---|
| OpenSEO (every-app/open-seo) | MIT | 25 128 | 2026-10-26 | Mots-clés, suivi de positions, concurrents, backlinks, audit de site, suivi de visibilité IA ; serveur MCP et « Agent Skills » | Docker Compose (Coolify, Portainer, Dokploy) et déploiement Cloudflare. Stack Vite, TypeScript, Drizzle : pas Next.js. Aucune intégration Directus documentée. Clé DataForSEO obligatoire ; la version hébergée facture 28 % de plus les requêtes DataForSEO (selon le README) | Forte traction, projet créé le 27 février 2026, environ 125 tickets et PR ouverts | Adopter en pilote (auto-hébergé) | P |
| SerpBear (towfiqi/serpbear) | MIT | 2 144 | 2026-05-14 | Suivi de positions, export CSV, API, intégration Search Console, idées de mots-clés via Google Ads | Docker, TypeScript. Les positions sont récupérées via des scrapers tiers (ScrapingAnt, ScrapingRobot, SerpApi, etc.) : zone de risque au regard des politiques Google | Projet établi, activité plus lente depuis mai 2026 | À évaluer, en privilégiant Search Console | P (licence, activité) ; S (fonctionnement des scrapers) |
| seotoolsuite (nitishkgupta/seotoolsuite) | MIT | 56 | 2026-10-21 | Recherche de mots-clés, concurrents et backlinks sur DataForSEO | Sujet « nextjs » ; interface Next.js | Petite communauté, créé le 4 décembre 2025 | À évaluer. Le README indique que les requêtes DataForSEO partent du navigateur : risque d'exposition des identifiants, à corriger avant tout usage | P |
| All-In-One-Free-SEO-Tool (IamRamgarhia) | MIT | 87 | 2026-10-22 (créé le 2 mai 2026) | Annonce 99 outils, un « agent qui applique les correctifs », « sans API payante » | TypeScript | Très jeune, promesses très larges | Écarter pour l'instant : un agent qui modifie le site sans validation est incompatible avec les garde-fous de la section 7 | P (métadonnées) |
| advertools (eliasdabbas/advertools) | MIT | 1 486 | 2026-06-30 | Bibliothèque Python : crawl, analyse de SERP, logs, robots.txt, génération de mots-clés SEM | Python, pour scripts et agents | Projet établi | Adopter pour analyses ponctuelles | P |
| sitespeed.io | MIT | 5 046 | 2026-10-26 | Mesure de performance en navigateurs réels (Core Web Vitals) | JavaScript, conteneur à vérifier | Très actif | Adopter comme complément technique | P |
| trendspyg (flack0x/trendspyg) | MIT | 60 | 2026-10-01 | Données Google Trends non officielles (Python, CLI, serveur MCP) | Python | Projet récent (novembre 2025) | À évaluer, exploration seulement : la récupération passe par Google Trends sans API officielle | P (métadonnées) ; S (fonctionnement) |
| pytrends (GeneralMills/pytrends) | Non reconnue par GitHub (« Other ») | 3 727 | 2024-08-10, archivé | Ancienne API non officielle Google Trends | Python | Archivé en lecture seule | Écarter. Archivage annoncé le 17 avril 2025 | P (archivé) ; S (date) |

### 2.2 Services et API payantes

| Service | Tarifs ou limites vérifiés | Verdict | Niveau |
|---|---|---|---|
| DataForSEO (pay-as-you-go) | Recharge minimale 50 $ ; solde sans expiration ; crédit d'essai de 1 $. SERP organique à partir de 0,0006 $ par SERP. Labs : 0,012 $ par tâche + 0,00012 $ par élément. Keywords Data à partir de 0,0012 $ par tâche. Google Ads Keyword Data : 0,06 $ par tâche en mode Standard, 0,09 $ en mode Live, 1 000 mots-clés max par tâche, Live limité à 12 requêtes par minute et par compte. Backlinks (Live) : 0,024 $ par requête + 0,000036 $ par ligne, 1 000 lignes max par requête | Adopter comme fournisseur principal de données, avec plafonds de dépense | P |
| Serveur MCP officiel DataForSEO (dataforseo/mcp-server-typescript) | Licence Apache-2.0, 255 étoiles, dernier push le 2 octobre 2026 ; un point d'accès distant est annoncé (non vérifié) | Adopter pour les agents | P |
| Google Search Console API | Search Analytics : 1 200 requêtes par minute et par site, 40 000 par minute et par projet, 30 millions par jour et par projet. Inspection d'URL : 600 par minute et 2 000 par jour et par site. Page datée du 28 août 2025 | Adopter comme source primaire. Ne donne pas les liens externes (voir section 3) | P |
| Google Business Profile API | Demande « Basic API Access » par formulaire ; fiche vérifiée et active depuis plus de 60 jours ; site web requis ; quota de 0 requête par minute avant approbation, 300 après. Délai de traitement non indiqué. Page datée du 28 août 2026 | Adopter. Démarrer la demande tôt, car elle bloque toute automatisation des fiches | P |
| Google Trends API (alpha) | Lancée en juillet 2025 en alpha, sans disponibilité générale. Accès sur demande | À demander, pas en production | P (statut alpha) ; S (accès sur demande) |
| Google Ads API / Keyword Planner | Texte officiel de politique non retrouvé. DataForSEO indique que ses données dépendent de la politique publicitaire de Google | Ne pas construire de produit dessus sans avis juridique. Utiliser la console Google Ads à la main | Non vérifié officiellement |

Point de vigilance sur le scraping : même via une API tierce, la récupération de résultats de recherche pour suivre un positionnement reste du scraping. Les politiques Google le visent expressément (section 7.1). La décision d'utiliser une API de SERP est donc une décision de risque à prendre explicitement, avec volumes limités et sans jamais remplacer Search Console.

## 3. Backlinks et concurrents

Aucun index de backlinks open source complet n'a été trouvé. Les options réalistes sont les suivantes.

- Search Console, rapport « Liens » : c'est un échantillon consultable dans l'interface. Un fournisseur affirme que l'API ne l'expose pas [S] ; à vérifier dans la référence de l'API avant de concevoir un agent sur cette base. Pour votre propre site, c'est le point de départ, mais il ne couvre pas les liens des concurrents.
- Bing Webmaster Tools : des méthodes GetLinkCounts et GetUrlLinks sont décrites par des wrappers tiers à partir du WSDL officiel [S]. Vérifier les signatures sur le WSDL avant usage. Intérêt : données de liens pour votre site, gratuit.
- DataForSEO Backlinks : payant mais prévisible (voir tableau 2.2). Coût d'environ 0,06 $ pour 1 000 lignes. Adopter pour les profils de concurrents et le suivi hebdomadaire.
- Open PageRank : score de 0 à 10 construit sur Common Crawl selon un revendeur [S]. Les conditions annoncées divergent selon les sources (un revendeur annonce 30 000 requêtes par mois et 60 par minute ; un autre site renvoie à un tableau de bord non consulté). À évaluer avant usage.
- Common Crawl (graphes d'hôtes) : données ouvertes très volumineuses. La version la plus récente repérée dans nos sources date de 2020-2021 (environ 490 millions d'hôtes) [S] ; une version plus récente est probable mais non vérifiée. Usage recherche, pas suivi quotidien. À évaluer.
- Concurrents : OpenSEO (analyse de concurrents et d'écarts de mots-clés via DataForSEO) et advertools pour des crawls ponctuels.

## 4. Agents et pipelines SEO IA

### 4.1 Frameworks et passerelles de la stack

| Brique | Licence | Étoiles | Dernier push | Rôle dans le pipeline | Verdict | Niveau |
|---|---|---|---|---|---|---|
| LangGraph (langchain-ai/langgraph) | MIT | 43 942 | 2026-10-27 | Orchestration d'agents à états, validation humaine intégrée | Adopter | P |
| CrewAI (crewAIInc/crewAI) | MIT | 60 136 | 2026-10-26 | Équipes d'agents par rôle | À évaluer : fonction proche de LangGraph, à ne retenir qu'un des deux | P |
| LiteLLM (BerriAI/litellm) | MIT pour le cœur ; le dossier enterprise/ a sa propre licence | 62 088 | 2026-10-27 | Passerelle unique vers les modèles (auto-hébergés ou cloud), clés et budgets | Adopter, cœur seulement, sans le dossier enterprise/ | P |
| n8n (n8n-io/n8n) | Sustainable Use License | 208 678 | 2026-10-27 | Automatisations et connecteurs | À évaluer, usage interne. La licence réserve l'usage aux besoins internes ou à une diffusion gratuite non commerciale : un VPS vendu avec n8n préinstallé exige une licence commerciale (lecture à confirmer auprès de n8n) | P |
| Directus (CMS) | Monospace Sustainable Core License (MSCL) à partir de la v12 (mai 2026) | Non applicable | v12 annoncée le 22 avril 2026 | CMS et stockage des brouillons | Adopter. Gratuit pour les organisations sous 5 M$ de revenus et 50 employés (Innovation Grant), avec clé d'enregistrement ; seule restriction : la concurrence directe à Directus | P |

### 4.2 Agents et projets SEO IA trouvés

| Projet | Licence | Étoiles | Dernier push | Ce qu'il apporte | Verdict | Niveau |
|---|---|---|---|---|---|---|
| OpenSEO (voir 2.1) | MIT | 25 128 | 2026-10-26 | Serveur MCP et Agent Skills : c'est la base recommandée pour l'agent de données | Adopter en pilote | P |
| geo-optimizer-skill (Auriti-Labs) | MIT | 1 178 | 2026-10-26 | CLI et serveur MCP en Python : audit GEO (signaux de citation, données structurées, llms.txt) ; intégration Astro | À évaluer pour l'audit GEO, en appel CLI depuis le pipeline (pas d'intégration Next.js native) | P |
| geolook (aigclink/geolook) | MIT | 785 | 2026-08-10 (créé le 29 juillet 2026) | « GEO de bout en bout » : diagnostic, tickets, exécution, vérification | À évaluer : projet très récent, croissance rapide à surveiller | P |
| geo-aeo-tracker (danishashko) | MIT | 309 | 2026-10-19 | Suivi des mentions dans six moteurs IA, stockage local ou Supabase | À évaluer. Les réponses sont collectées via une API de scraping tierce [S] : risque au regard des conditions des moteurs | P (métadonnées) ; S (collecte) |
| NotFair (Nowork Studio) | MIT [S] | Environ 2 700 [S] | Non vérifié | Skills Claude Code pour SEO, GEO et publicité | À vérifier sur le dépôt avant tout usage | S |
| CrewAI-SEO-Agency (mshalabi02) | Aucune | 0 | 2025-05-22 | Démonstration d'agence SEO avec CrewAI | Écarter : sans licence, sans activité depuis plus d'un an | P |
| awesome-generative-engine-optimization (amplifying-ai) | Champ licence vide ; README indique CC0 | 531 | 2026-04-14 | Liste de ressources GEO | Ressource de veille | P |
| CorgiCorner/open-source-rank-trackers | CC BY 4.0 | 5 | 2026-10-17 | Comparatif des trackers de positions auto-hébergés | Ressource de veille | P |

Constat : peu de projets open source qui publient de façon autonome sont à la fois maintenus et sérieux. La valeur réelle se trouve dans les couches données (OpenSEO, DataForSEO, Search Console) et orchestration (LangGraph, LiteLLM), pas dans des « agents SEO » clés en main.

## 5. Réseaux sociaux, diffusion, relations presse et citations locales

### 5.1 Planification et publication

| Outil | Licence | Étoiles | Dernier push | Stack et déploiement | Remarques | Verdict | Niveau |
|---|---|---|---|---|---|---|---|
| Postiz (gitroomhq/postiz-app) | AGPL-3.0 | 38 477 | 2026-10-24 | Front Next.js, back NestJS, Prisma et PostgreSQL, Temporal, Resend ; docker-compose | 14 réseaux (Instagram, YouTube, LinkedIn, TikTok, Facebook, X, Threads, Pinterest, Reddit, Bluesky, Mastodon, Discord, Slack, Dribbble). API publique, webhooks, nœud n8n, serveur MCP, fonctions IA. AGPL : toute modification proposée à des utilisateurs via le réseau doit être publiée | Adopter en pilote interne | P |
| Mixpost (inovector/mixpost) | MIT (version Lite) | 3 873 | 2026-03-16 | Laravel et PHP ; installation Docker non mentionnée dans le README | Version Pro payante ; limites de Lite non documentées | À évaluer (activité plus faible, stack différente de Next.js) | P |

### 5.2 Contraintes des API de publication

- X : facturation à l'usage par défaut pour les nouveaux développeurs [S]. Les sources divergent sur la date (février ou avril 2026) et sur le coût d'une publication contenant un lien (une source avance 0,20 $). À chiffrer au cas par cas avant de prévoir l'automatisation.
- Meta (Instagram) : l'accès standard est le défaut ; l'accès avancé exige une vérification d'entreprise [S]. Un compte propre peut publier en mode développement avec le rôle de testeur [S]. La page officielle n'a pas été lue.
- LinkedIn (Community Management API) : palier développement, puis palier standard sur demande avec vidéo de démonstration ; questionnaire de vérification à remplir dans les 21 jours ; octroi discrétionnaire [S, guide partenaires Microsoft].

### 5.3 Relations presse numériques

- Connectively : fermé fin 2024 selon un bilan 2026 [S].
- Featured (ex-HARO, racheté en avril 2025) : à partir de 49 $ par mois [S]. Qwoted : palier Pro d'environ 99 $ par mois [S]. SourceBottle et Source of Sources : gratuits [S].
- Verdict : À évaluer, travail humain de réponse aux journalistes. Les communiqués et contenus sponsorisés avec liens optimisés sont du link spam au sens de Google (section 7.1).
- Diffusion de communiqués au Canada : Canada NewsWire, tarifs non trouvés. Les chiffres repérés concernent Newswire.com (États-Unis) et ne sont pas applicables. Demander un devis.

### 5.4 Citations et annuaires locaux (Québec et Canada)

- Google Business Profile [P] : voir tableau 2.2. Priorité absolue.
- Bing Places for Business : présenté comme gratuit et importable depuis Google Business Profile [S]. À vérifier directement sur bing.com/forbusiness.
- Apple Business Connect : cité parmi les fiches gratuites prioritaires en 2026 [S]. Processus canadien non vérifié.
- Pages Jaunes : les pages consultées sont promotionnelles ; le service d'alignement des fiches est payant (NetSync) [S]. Gratuité de la fiche non vérifiée.
- Registre des entreprises du Québec (Données Québec) [P] : licence CC BY-NC-SA 4.0 (attribution, pas d'utilisation commerciale, partage à l'identique). Mise à jour bimensuelle, dernière modification le 16 octobre 2026, fichier ZIP de 225 Mo, six fichiers CSV reliés par le NEQ. Les noms et adresses des personnes physiques en sont absents. Verdict : Écarter pour tout produit ou service commercial. Pour un usage ponctuel de vérification des données de Nexora, demander l'avis du Registraire.

## 6. Analytique souveraine et visibilité dans les moteurs IA

### 6.1 Analytique

| Outil | Licence | Étoiles | Dernier push | Stack et déploiement | Vie privée | Verdict |
|---|---|---|---|---|---|---|
| Umami (umami-software/umami) | MIT | 39 717 | 2026-10-23 | Node, Prisma et PostgreSQL ; image Docker officielle et docker compose ; Next.js déduit du dépôt | « Sans témoins » annoncé ; authentification à deux facteurs ; point d'accès MCP désactivé par défaut | Adopter |
| Plausible Community Edition (plausible/analytics) | AGPL-3.0 | 29 675 | 2026-10-27 | Elixir et Phoenix, PostgreSQL, ClickHouse ; Dockerfile à la racine ; installation dans un dépôt séparé | Sans cookies ni IP stockées (README). CE : mises à jour deux fois par an, pas de SSO ni d'API de sites, filtrage des robots basique | À évaluer : ClickHouse alourdit l'exploitation |
| Matomo (matomo-org/matomo) | GPL-3.0 | 21 984 | 2026-10-27 | PHP 8.1 minimum, MySQL 8 ou MariaDB 10.6 ; image Docker non mentionnée sur la page consultée | Données dans votre base ; options de confidentialité à configurer (mode sans cookies non vérifié) | À évaluer : fonctionnalités riches, plus lourd |

### 6.2 Loi 25 (Québec), texte officiel consolidé [P]

- Article 8.1 : avant de recueillir des renseignements personnels au moyen d'une technologie permettant d'identifier, de localiser ou de profiler une personne, il faut informer la personne du recours à cette technologie et des moyens offerts pour activer ces fonctions. Le profilage vise l'analyse de préférences, d'intérêts ou de comportements.
- Article 9.1 : un produit ou service technologique offert au public et doté de paramètres de confidentialité doit les régler par défaut au plus haut niveau. Les paramètres de témoins de connexion sont exclus.
- Lecture pratique, non juridique : un analytique sans témoins et sans profilage réduit fortement l'exposition. Tout outil avec témoins ou profilage exige information et réglages par défaut. À valider par un juriste.

### 6.3 Visibilité dans les moteurs IA

- Google [P, page AI features] : aucune exigence supplémentaire pour apparaître dans AI Overviews ou AI Mode. Pas de balisage spécifique. Google indique qu'il n'est pas nécessaire de créer de fichiers destinés à l'IA ni de llms.txt. Les données de ces affichages figurent dans le rapport de performance de Search Console (type « Web »).
- OpenAI [P, documentation des robots] : OAI-SearchBot sert à l'apparition dans la recherche ChatGPT ; GPTBot sert à l'entraînement ; ChatGPT-User agit sur demande d'un utilisateur et n'est pas soumis à robots.txt. Une modification de robots.txt met environ 24 heures à être prise en compte pour la recherche.
- IndexNow [P] : supporté par Microsoft Bing, Naver, Seznam.cz, Yandex et Yep. Google n'est pas listé sur indexnow.org.
- Mesure de la visibilité IA : les outils de la section 4.2 (geo-optimizer-skill, geolook, geo-aeo-tracker) sont les pistes. Point de vigilance : interroger les interfaces grand public par scraping va à l'encontre de leurs conditions d'utilisation. Préférer les API officielles et un échantillon de requêtes limité.

## 7. Garde-fous : ce qui est interdit ou risqué

### 7.1 Google, politiques de spam [P, mise à jour du 28 août 2026]

- Spam de liens : achat ou vente de liens ; échanges de liens excessifs ; liens générés automatiquement ; lien imposé dans des conditions d'utilisation ; liens publicitaires textuels qui transmettent du poids ; publireportages et communiqués avec liens optimisés ; annuaires ou signets de faible qualité ; widgets à mots-clés ; liens de pied de page diffusés sur de nombreux sites ; liens dans des commentaires de forum. Tolérés : liens payants qualifiés avec rel="sponsored" ou rel="nofollow".
- Scaled content abuse : création massive de pages peu originales et sans valeur, qu'elles soient générées par IA, copiées ou reformulées automatiquement. Le mode de production n'est pas le critère.
- Site reputation abuse : contenu tiers publié surtout grâce à la réputation du domaine, sans supervision réelle.
- Trafic automatisé : requêtes automatisées sans autorisation, dont le scraping de résultats pour suivre son positionnement.
- Autres politiques pertinentes : texte caché ou lien caché, bourrage de mots-clés, pages-portes, affiliation pauvre, contenu piraté, redirections trompeuses.
- Conséquence : déclassement ou retrait des résultats.

### 7.2 Avis et fiches (Google Maps et Business Profile) [P]

- Interdit : offrir un incitatif (paiement, remise, bien ou service) en échange d'un avis, de sa révision ou de la suppression d'un avis négatif ; avis payés ; comptes multiples ; avis rédigés par des personnes en conflit d'intérêt, dont des employés non déclarés ; demander un contenu précis dans un avis ; décourager les avis négatifs ; liens et coordonnées dans les avis.
- Autorisé : solliciter des avis authentiques, sans incitatif et sans influencer le contenu.

### 7.3 Droit canadien

- Loi sur la concurrence : les faux avis et les avis trompeurs relèvent de la publicité trompeuse (lignes directrices du Bureau de la concurrence de mars 2022 [S]). Exemples d'amendes rapportés : Bell (1,25 M$) et FlightHub (5 M$) [S]. Vérifier le texte actuel sur le site du Bureau.
- LCAP (anti-pourriel) : le périmètre des messages électroniques commerciaux est confirmé par le site officiel [P]. Le consentement (exprès ou implicite), l'identification de l'expéditeur et le désabonnement sont des obligations décrites par des sources secondaires [S]. Conserver la preuve du consentement. Montants maximaux de sanctions rapportés par des sources secondaires (1 M$ pour une personne, 10 M$ pour une entreprise) : à confirmer dans la loi.
- Loi 25 : voir section 6.2.

### 7.4 Licences à respecter

- AGPL-3.0 (Postiz, Plausible CE) : une modification proposée à des utilisateurs via le réseau doit être publiée.
- Sustainable Use License (n8n) : usage interne ou diffusion gratuite non commerciale seulement [P]. Une offre payante de VPS avec n8n exige une licence commerciale.
- MSCL (Directus v12 et suivantes) : la concurrence directe est interdite ; l'hébergement et les services sont autorisés ; clés d'enregistrement [P].
- LiteLLM : le dossier enterprise/ relève d'une licence distincte [P].
- CC BY-NC-SA 4.0 (Registre des entreprises du Québec) : pas d'usage commercial [P].

## 8. Boucle SEO autonome recommandée

### 8.1 Architecture proposée

- Données primaires : Search Console (API, quotidienne), Google Business Profile (API, hebdomadaire après approbation), Bing Webmaster Tools (après vérification du WSDL).
- Données tierces : DataForSEO, via le serveur MCP officiel ou via OpenSEO. Plafonds de dépense fixés dès le départ.
- Orchestration : LangGraph pour les états et les validations ; modèles via LiteLLM (cœur MIT) et OpenRouter ; clés gérées hors des navigateurs.
- Stockage des contenus : Directus, avec un statut explicite (brouillon, à relire, approuvé, publié). Aucun agent ne publie directement.
- Mesure : Umami sans témoins ; sitespeed.io pour la performance.
- Diffusion : Postiz en pilote interne, file d'attente validée par un humain.
- Visibilité IA : geo-optimizer-skill pour l'audit et, pour le reste, des API officielles sur un échantillon limité.

### 8.2 Agents, données, cadence et validations

| Agent | Données | Cadence | Sortie | Validation humaine |
|---|---|---|---|---|
| 1. Surveillance Search Console | API Search Console | Quotidienne | Alertes (clics, impressions, indexation) | Lecture seule ; un humain traite les alertes |
| 2. Contrôle technique | Inspection d'URL (2 000 par jour et par site au maximum), sitespeed.io, geo-optimizer-skill | Hebdomadaire | Liste de correctifs priorisés | Humain pour toute modification de site, robots.txt, redirection ou donnée structurée |
| 3. Mots-clés et regroupements | DataForSEO Google Ads Keyword Data (mode Standard) ; API Google Trends si l'accès est obtenu | Mensuelle | Regroupements et briefs | Humain choisit les sujets |
| 4. Backlinks | DataForSEO Backlinks ; exports Search Console et Bing | Hebdomadaire | Liens gagnés ou perdus, ancres | Aucun contact et aucun désaveu sans humain |
| 5. Concurrents | DataForSEO Labs ; advertools pour des crawls ponctuels | Mensuelle | Écarts de contenu et de mots-clés | Humain |
| 6. Rédaction | Brief validé, sources citées | À la demande | Brouillon dans Directus avec sources | Relecture experte, preuves et expérience ; aucune production en masse |
| 7. Maillage interne | Sitemap Next.js et contenus Directus | Hebdomadaire | Suggestions de liens | Humain approuve chaque lien |
| 8. Diffusion sociale | API Postiz | Selon le calendrier validé | File d'attente | Humain valide chaque publication |
| 9. Citations locales | Google Business Profile, Bing Places, annuaires retenus | Mensuelle | Contrôle de cohérence du nom, de l'adresse et du téléphone | Humain pour toute création de fiche |
| 10. Visibilité IA | geo-optimizer-skill ; API officielles (échantillon) | Mensuelle | Rapport | Humain |
| 11. Conformité | Suivi des politiques Google ; listes LCAP et Loi 25 | Trimestrielle | Rapport de conformité | Juriste ou responsable |

Validations humaines obligatoires : publier ; envoyer tout message commercial (consentement enregistré) ; demander ou accepter un lien ; répondre à un avis ou en solliciter un ; soumettre un désaveu ; modifier robots.txt, redirections ou données structurées ; obtenir ou activer un accès API (Business Profile, Meta, LinkedIn) ; relever un plafond de dépense.

### 8.3 Coûts indicatifs (tarifs DataForSEO publiés [P])

- 1 000 mots-clés en volume de recherche (mode Standard) : 0,06 $ par tâche.
- 1 000 lignes de backlinks : environ 0,06 $.
- Suivi de 500 mots-clés 30 fois par mois, soit 15 000 SERP à partir de 0,0006 $ : environ 9 $ par mois, minimum. Le mode Live coûte davantage.
- Ces montants n'incluent ni les modèles de langage ni l'hébergement.

## 9. Points à trancher et non vérifiés

- Politique officielle Google Ads sur l'usage des données Keyword Planner dans un produit : à obtenir auprès de Google avant tout développement.
- Canada NewsWire : tarifs. Apple Business Connect : processus au Canada. Pages Jaunes : gratuité de la fiche. Bing Places : confirmer la gratuité sur bing.com.
- X, Meta et LinkedIn : exigences et coûts officiels (pages non lues ou résumées par des vendeurs).
- NotFair : dépôt à ouvrir avant de conclure.
- Common Crawl : dernière version de graphe d'hôtes.
- Open PageRank : conditions d'accès réelles.
- Bing Webmaster Tools : signatures exactes des méthodes de liens (WSDL).
- Montants des sanctions LCAP et conditions du Bureau de la concurrence sur les avis : textes officiels.
- Juridique : Loi 25 (articles 8.1 et 9.1) pour l'analytique et les témoins ; LCAP pour les courriels ; licence n8n pour une offre VPS ; licence Directus pour une offre gérée.

## 10. Sources consultées

Dépôts (métadonnées GitHub) : github.com/towfiqi/serpbear ; github.com/every-app/open-seo ; github.com/nitishkgupta/seotoolsuite ; github.com/IamRamgarhia/All-In-One-Free-SEO-Tool ; github.com/dataforseo/mcp-server-typescript ; github.com/GeneralMills/pytrends ; github.com/flack0x/trendspyg ; github.com/eliasdabbas/advertools ; github.com/sitespeedio/sitespeed.io ; github.com/gitroomhq/postiz-app ; github.com/inovector/mixpost ; github.com/umami-software/umami ; github.com/plausible/analytics ; github.com/matomo-org/matomo ; github.com/BerriAI/litellm ; github.com/langchain-ai/langgraph ; github.com/crewAIInc/crewAI ; github.com/n8n-io/n8n (fichier LICENSE.md) ; github.com/Auriti-Labs/geo-optimizer-skill ; github.com/aigclink/geolook ; github.com/danishashko/geo-aeo-tracker ; github.com/mshalabi02/CrewAI-SEO-Agency ; github.com/amplifying-ai/awesome-generative-engine-optimization ; github.com/CorgiCorner/open-source-rank-trackers.

Officiel : developers.google.com/search/docs/essentials/spam-policies (28 août 2026) ; developers.google.com/search/docs/appearance/ai-features ; developers.google.com/search/blog/2025/07/trends-api ; developers.google.com/my-business/content/prereqs (28 août 2026) ; developers.google.com/webmaster-tools/limits (28 août 2025) ; support.google.com/contributionpolicy/answer/7400114 ; developers.openai.com/api/docs/bots ; indexnow.org ; directus.com/resources/directus-v12-license-change (22 avril 2026) ; dataforseo.com/pricing ; dataforseo.com/pricing/keywords-data/google-ads ; dataforseo.com/pricing/backlinks/backlinks ; fightspam-combattrelepourriel.ised-isde.canada.ca ; canlii.org (RLRQ c. P-39.1) ; donneesquebec.ca/recherche/dataset/registre-des-entreprises.

Secondaires (à confirmer) : bilans de vendeurs et agrégateurs sur X, Meta, LinkedIn, Featured, Qwoted, Open PageRank, Common Crawl, Bing Places, Bureau de la concurrence, LCAP (sanctions) ; guide partenaires LinkedIn (learn.microsoft.com).
