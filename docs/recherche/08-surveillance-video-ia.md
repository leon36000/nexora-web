# Surveillance vidéo par IA : marché, concurrence, cadre légal et potentiel pour Nexora

**Date :** 27 octobre 2026
**Périmètre :** offre « l'IA regarde vos caméras » pour PME, installée chez le client ou hébergée au Québec.
**Statut :** document de travail interne. Ce n'est pas un texte publiable tel quel.

**Méthode et limites (à lire avant tout chiffre) :**

- Les pages tarifaires de Genetec et de Rhombus ont été lues directement. Les prix de Verkada, Spot AI, Coram, Eagle Eye, Ambient.ai, Milestone, Avigilon et Hanwha ne sont **pas publics**. Les chiffres cités viennent de revendeurs, d'intégrateurs ou de concurrents, et sont des ordres de grandeur.
- Les textes officiels de lois (legisquebec.gouv.qc.ca) ont renvoyé des erreurs 403 et 502 pendant la recherche. Les articles cités de la Loi sur le privé, de la LCCJTI et de la Charte sont donc **à confirmer sur le texte officiel** avant toute diffusion. Le guide de la CAI sur la biométrie, lui, a été lu intégralement.
- Les données de Statistique Canada proviennent d'extraits de recherche. Les pages elles-mêmes n'ont pas pu être relues en entier.
- Aucune source gratuite de volumes de recherche (SEO) n'a été obtenue. Les volumes sont donc marqués « non obtenu ».
- Les estimations de délais et de charges de travail sont des hypothèses de Nexora, pas des données sourcées. Elles sont signalées comme telles.

---

## 0. Synthèse

- **Le marché existe et croît vite.** Les études sur l'analyse vidéo (« video analytics ») donnent entre 5 et 15 G$ US en 2025 selon le cabinet, avec des taux de croissance de 20 à 23 % par an. Le marché canadien de la vidéosurveillance, lui, croît plus lentement, de 6 à 9 % par an selon MarketsandMarkets.
- **La demande est réelle au Canada.** Les vols à l'étalage déclarés à la police ont augmenté de 14 % en 2024 (182 361 cas) puis de 11 % en 2025 (208 941 cas), selon Statistique Canada. Aux États-Unis, la NRF rapporte au contraire une baisse de 12,4 % en 2025. Le signal canadien est donc spécifique.
- **Les concurrents établis baissent leurs prix et intègrent l'IA.** Genetec vend ses connexions vidéo 149 $ (Standard) ou 199 $ (Premium) US par an, avec recherche en langage naturel incluse dès le niveau Standard. Rhombus vend sa licence 149 $ US par caméra.
- **Le « sur place » n'est pas unique.** Milestone, Avigilon, Genetec et Coram proposent des installations locales. La différence de Nexora doit venir du service au Québec, en français, de la protection des renseignements personnels et d'un prix accessible aux PME.
- **Le cadre légal est exigeant mais clair.** La Loi 25 s'applique pleinement depuis le 22 septembre 2024. La CAI a sanctionné l'usage non conforme de la biométrie (affaire Clearview, 2021). Les arbitres du travail acceptent la surveillance vidéo des employés seulement si elle est justifiée et limitée, et refusent la surveillance continue.
- **Deux points bloquants à régler avant de vendre :** la licence des modèles YOLO (AGPL-3.0 chez Ultralytics, qui exige une licence commerciale pour un produit fermé) et le choix d'un modèle de description de scène sur site, à concilier avec votre règle de ne pas utiliser de modèle local 7B.
- **Verdict :** le potentiel est réel mais moyen à court terme, parce que la concurrence intègre déjà l'analyse et que la preuve de performance manque. Statut recommandé : **projet pilote (sur invitation)**, pas « disponible ».
- **Positionnement recommandé :** « analyse vidéo IA sur place, pour PME du Québec, sans reconnaissance faciale et sans entraîner de modèle sur vos images ».
- **Le plus de valeur à court terme** : un pilote mesuré sur un seul site (stationnement ou entrepôt, où les preuves sont les plus solides), avec une étude d'impact sur la vie privée (EFVP) dès le départ.

---

## 1. Marché

### 1.1 Taille et croissance (mondial)

| Source (date de l'extrait) | Périmètre | Valeur de départ | Valeur cible | Taux annuel | Lien |
|---|---|---|---|---|---|
| MarketsandMarkets (date non indiquée, consulté le 27 oct. 2026) | Analyse vidéo intelligente, mondial | 14,65 G$ US en 2026 | 41,39 G$ en 2031 | 23,1 % | https://www.marketsandmarkets.com/ResearchInsight/size-and-share-of-intelligent-video-analytics-market.amp |
| SNS Insider (communiqué, date non indiquée) | Analyse vidéo IA, mondial | 8,30 G$ en 2025 | 64,48 G$ en 2035 | 22,85 % (2026-2035) | https://www.snsinsider.com/press-release/global-ai-video-analytics-market |
| Ken Research (date non indiquée) | Analyse vidéo IA, mondial | 5,04 G$ en 2025 | n.d. | 22,72 % (2026-2031) | https://www.kenresearch.com/industry-reports/global-ai-video-analytics-market.md |
| Fortune Business Insights (cité dans les résultats, URL non récupérée) | Analyse vidéo, mondial | 12,29 G$ en 2025 | 65,08 G$ en 2034 | 20,30 % | URL non récupérée |
| Grand View Research (cité dans les résultats, URL non récupérée) | Analyse vidéo, mondial | 12,7 G$ en 2024 | 37,8 G$ en 2030 | n.d. | URL non récupérée |

**Lecture :** l'écart entre cabinets est d'environ 2,4 fois pour l'année 2025 (5 à 12 G$). Les périmètres diffèrent. Pour un dossier, retenez MarketsandMarkets et indiquez la définition utilisée. Les pages de revendeurs (Alibaba, Agrexai) répètent des chiffres mal attribués. Ne les utilisez pas.

### 1.2 Canada et PME

| Source | Périmètre | Valeur | Taux | Lien |
|---|---|---|---|---|
| MarketsandMarkets (Canada, vidéosurveillance) | Tout le marché de la vidéosurveillance | ~1,73 G$ US en 2025, ~2,58 G$ en 2030 | 6,9 % | https://www.marketsandmarkets.com/Market-Reports/geography/video-surveillance-market/canada |
| MarketsandMarkets (Canada, VSaaS) | Vidéosurveillance en mode service (infonuagique) | 172,8 M$ en 2026, 276,6 M$ en 2031 | 8,1 % | https://www.marketsandmarkets.com/Market-Reports/geography/video-surveillance-as-a-service-market/Canada |
| IMARC (Canada, caméras CCTV) | Caméras seulement | 2,6 G$ US en 2024 (valeur de l'extrait) | 19,15 % (2025-2033) | https://www.imarcgroup.com/canada-cctv-camera-market |

**Réserves :** la page MarketsandMarkets Canada contient des passages visiblement copiés d'un autre pays. Sa fiabilité est donc limitée. Aucune donnée spécifique aux PME québécoises n'a été trouvée.

**Taille de marché pour Nexora :** non estimable à partir des sources. Il faudrait compter les PME (nombre de sites et de caméras) au Québec, ce que cette recherche n'a pas fait.

### 1.3 Tendances 2025-2026

1. **Recherche en langage naturel dans les vidéos.** Genetec inclut la « recherche en langage naturel avancée » dès le niveau Standard de son offre SaaS (page officielle, consultée le 27 oct. 2026 : https://www.genetec.com/products/unified-security/security-center-saas/saas-pricing). VIVOTEK (Think Search) et March Networks ont présenté des outils de recherche par modèle de vision-langage à Security Canada West 2026 (https://securityjournalamericas.com/ai-solutions-security-canada-west-2026/). Scylla affirme qu'une recherche classe un court-list sur 64 caméras en moins d'une minute. C'est une affirmation de fournisseur, non vérifiée (https://www.scylla.ai/natural-language-video-search-is-here-what-it-means-for-security-investigations-in-2026/).
2. **Résumé vidéo par modèle de vision-langage (VLM).** Milestone a lancé un VLM orienté trafic, basé sur NVIDIA Cosmos Reason, qui résume la vidéo et permet de chercher par contenu (Security Systems News, février 2026 : https://digital.securitysystemsnews.com/articles/milestone-systems-launches-vision-language-model-vlm-). Milestone avance une réduction « jusqu'à 30 % » de la fatigue d'alarmes. C'est un chiffre de fournisseur, présenté comme un premier rapport.
3. **Analyse sur place (« edge »).** Les caméras et des boîtiers locaux exécutent la détection. Une architecture de référence publiée en juin 2026 par un prestataire décrit des Jetson qui détectent, des embeddings indexés, et un orchestrateur d'agent qui fait appel à un VLM pour relire les extraits, avec validation humaine (https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/surveillance-investigation-multimodal-agent). C'est une référence de prestataire, pas une étude indépendante.
4. **Limites scientifiques.** Un article de recherche (arXiv 2510.23190) met en évidence les limites des petits VLM ouverts comme détecteurs d'anomalies sans entraînement. À lire avant de promettre des alertes « intelligentes » sans réglage (https://arxiv.org/abs/2510.23190v1).
5. **Pression sur les prix.** Les SaaS vendent à la connexion ou à la caméra, et les marges se réduisent (voir section 3).

### 1.4 Indicateurs de demande

| Indicateur | Valeur | Source |
|---|---|---|
| Vols à l'étalage déclarés au Canada, 2024 | 182 361 cas, +14 %, 442 pour 100 000 habitants (4e hausse annuelle) | Statistique Canada, Le Quotidien du 22 juillet 2025 (extrait de recherche) : https://www150.statcan.gc.ca/daily-quotidien/250722/dq250722a-fra.htm |
| Vols à l'étalage déclarés au Canada, 2025 | 208 941 cas, +11 %, 502 pour 100 000 habitants (5e hausse annuelle) | Statistique Canada, Le Quotidien du 22 juillet 2026 (extrait de recherche) : https://www150.statcan.gc.ca/n1/daily-quotidien/260722/dq260722a-fra.htm |
| Hausse depuis 2015 | +79 % en 2015-2025 | Même source |
| Indice de gravité de la criminalité, Québec | 64,83 (2024) à 61,55 (2025) | Même source (chiffre global, pas le vol) |
| Vol à l'étalage au Québec | Chiffre spécifique non trouvé | n.d. |
| Shrink commerce de détail, États-Unis | 1,6 % des ventes en FY2022, soit 112,1 G$ | NRF, enquête 2023 : https://nrf.com/media-center/press-releases/nrf-reports-retail-shrink-nearly-100b-problem |
| Vols à l'étalage, États-Unis, 2025 | -12,4 % vs 2024 | NRF et LPRC, « Impact of Theft & Violence 2026 » (cité par SecurityInfoWatch) : https://www.securityinfowatch.com/retail/news/55396090/national-retail-federation-nrf-study-shoplifting-declined-in-2025-as-retail-fraud-schemes-increased |
| Vol d'équipements de construction, Canada | ~46 M$ par an en 2024 (estimation d'assureur, cité) | Samsara et Insurance Business (sondage commercial) : https://www.insurancebusinessmag.com/ca/news/breaking-news/equipment-tracking-gaps-cost-canadian-operators-millions-annually-samsara-study-finds-582579.aspx |
| Matériel volé non récupéré | 68 % des organisations canadiennes ne récupèrent pas la moitié de leur matériel de grande valeur | Même source (sondage de fournisseur) |
| Matériel volé non récupéré (construction) | Moins de 25 % récupéré | MHCC, sondage de 100 entrepreneurs (date non indiquée) : https://www.mhccna.com/en-ca/expertise/construction-site-theft-prevention-advice-for-canadian-ontractors |

**Avertissement :** la NRF a cessé de publier son rapport annuel sur le shrink en 2024 (Retail Dive). Ses enquêtes reposent sur les impressions de dirigeants, pas sur des données comptables.

---

## 2. Cas d'usage par secteur PME au Québec

Le niveau de preuve est indiqué pour chaque secteur : **fort** si une étude indépendante existe, **moyen** si un chiffre de source commerciale ou un rapport d'assureur existe, **faible** si rien n'a été trouvé.

| Secteur | Cas d'usage réaliste | Bénéfice chiffré (source) | Niveau de preuve | Points de vigilance |
|---|---|---|---|---|
| **Chantiers de construction** | Détection de personnes ou de véhicules hors heures dans une zone définie ; alerte sur équipement déplacé ; zone de stationnement de matériel | Vol de matériel de construction de l'ordre de 46 M$ par an au Canada (assureur, 2024). Aucune réduction mesurée par une caméra IA n'a été trouvée. | Moyen (contexte) / faible (efficacité) | Connectivité limitée sur chantier ; alimentation électrique ; équipement exposé aux intempéries |
| **Commerce de détail** | Caisses et entrées : détection de comportements suspects, alerte de zone restreinte, recherche d'un événement dans les images | 208 941 vols à l'étalage déclarés au Canada en 2025 (+11 %). Shrink américain de 1,6 % des ventes (NRF, 2022). Aucune réduction vérifiée par l'IA. | Fort pour le contexte, faible pour l'efficacité de l'IA | Analyse des clients : zone à risque juridique (voir section 4) ; ne pas suivre les personnes d'un rayon à l'autre |
| **Restauration** | Surveillance de l'arrière-boutique, de la porte de livraison, de la caisse | Aucun chiffre trouvé | Faible | Surveillance du personnel : très risquée (voir section 4.5) ; pas de caméra en cuisine si elle filme le personnel de façon continue |
| **Entrepôts** | Périmètre, quais de chargement, accès hors heures, inventaire de zones | Aucun chiffre spécifique trouvé ; le principe est proche de la vidéosurveillance de propriété | Faible à moyen | Gros volumes de flux vidéo : dimensionnement matériel nécessaire |
| **Cliniques** | Entrée, accès aux zones sécuritaires, stationnement | Aucun chiffre trouvé | Faible | **Données de santé sensibles.** La CPVP juge la vidéosurveillance inappropriée dans les lieux à forte attente de vie privée (toilettes, salles de soins) : https://www.priv.gc.ca/en/privacy-topics/surveillance/video-surveillance-by-businesses/gl_vs_080306/ |
| **Bureaux** | Accès hors heures, salle serveurs, zones réservées | Aucun chiffre trouvé | Faible | Aucune caméra qui filme les postes de travail en continu |
| **Stationnements** | Détection de personnes ou de véhicules, alerte d'intrusion, vols de véhicules ou d'effets | Revue systématique de Piza, Welsh, Farrington et Thomas (2019) : effet significatif mais **modeste** sur la criminalité ; effet le plus fort et le plus constant dans les stationnements ; effet supérieur avec surveillance active | Fort (revue académique) | Le gain ne vient pas de l'IA seule. La surveillance active avec intervention humaine compte davantage. Source : https://www.ojp.gov/ncjrs/virtual-library/abstracts/cctv-surveillance-crime-prevention-40-year-systematic-review-meta |
| **Agriculture** | Vol de matériel sur des sites isolés, accès à des bâtiments, détection de véhicules | Vol d'équipements au Canada (voir 1.4) ; pas de chiffre agricole trouvé | Faible | Connectivité rurale ; alimentation ; équipement mobile |

**Conclusion par secteur :** le meilleur point d'entrée est le **stationnement** et le **périmètre de site** (chantier, entrepôt). Les preuves y sont les plus solides, et la vie privée est moins sensible qu'en restauration ou en clinique. La restauration et les cliniques exigent une analyse juridique avant toute offre.

---

## 3. Concurrents, prix et briques libres

### 3.1 Concurrents commerciaux

| Acteur | Modèle | Prix public | Ce qu'il faut retenir | Source (date) |
|---|---|---|---|---|
| **Genetec** (siège à Montréal, selon les connaissances générales, non revérifié ici) | SaaS « par connexion » (caméra, lecteur, centrale d'intrusion) ou sur site via un partenaire certifié | **Vidéo : 149 $ US (Standard) ou 199 $ US (Premium) par connexion et par an.** Contrôle d'accès : 99 $ / 149 $. Matériel vendu à part (appliances Cloudlink). Sur site : devis du partenaire. | Recherche en langage naturel dès Standard ; entrée/sortie, recherche par similarité et trajectoires en Premium | Page officielle, lue le 27 oct. 2026 : https://www.genetec.com/products/unified-security/security-center-saas/saas-pricing |
| **Rhombus** | Caméras propriétaires avec licence cloud | Matériel R120 à 399 $ à R600 à 3 299 $ US. Licence Professional ou Enterprise : 149 $ US par caméra. Les fonctions IA ne sont pas incluses dans la licence Professional. | Passerelle N100 pour caméras tierces : 2 To = environ 20 jours par caméra | Page officielle, extraction automatique à reconfirmer : https://www.rhombus.com/pricing |
| **Verkada** | Caméras propriétaires avec licence cloud | Non publié. Revendeurs : environ 249 $ US par caméra et par an (1 an) ; fourchette 150 à 500 $ selon Vendr ; matériel 600 à 3 500 $ | Multi-années moins cher par an ; remises à partir de 25 caméras | Getsafeandsound (partenaire, biais commercial) : https://getsafeandsound.com/blog/verkada-cameras-price/ ; rfp.wiki : https://www.rfp.wiki/it-security/video-surveillance-management-systems/verkada/eagle-eye-networks ; Vendr : https://www.vendr.com/marketplace/verkada |
| **Spot AI** | Abonnement par forfait (sites, flux, rétention) | Non publié. Estimation tierce : environ 99 $ US par caméra et par mois (non officiel). Capterra : « à partir de 1 500 $ » sans précision. | Fonctionne avec caméras IP et analogiques existantes | https://www.spot.ai/pricing-information ; https://getsafeandsound.com/blog/spot-ai-pricing/ ; https://www.capterra.com/p/208390/Spot-AI/ |
| **Coram AI** | Appliance Coram Point possédée par le client + licence par caméra (1, 3, 5 ou 10 ans) | Non publié. Agrégateur : 180 à 400 $ et plus par caméra et par an (non confirmé) | Modèle **sur site** proche du vôtre | https://us.fitgap.com/products/032483/coram-ai |
| **Eagle Eye Networks** | Cloud, avec pont ou CMVR matériel | Non publié. Revendeurs : 15 à 50 $ par caméra et par mois (enregistrement complet). L'offre à 5 $ est un prix de lancement de 2014. | Prix cloud à l'échelle | https://www.spot.ai/blog/eagle-eye-networks-pricing-2026 (concurrent) ; https://ipvm.com/reports/2412 (2014) |
| **Ambient.ai** | Entreprise, sur site, centre opérationnel de sécurité | Non publié (sur devis) | Cible les grandes entreprises ; trop cher pour les PME selon plusieurs avis | https://www.g2.com/products/ambient-ai/pricing |
| **Milestone (XProtect)** | Logiciel de gestion vidéo (VMS) sur site, vendu via partenaires | Non publié. Essential+ serait retiré (fin 2025, selon des comparatifs). Express+ : environ 150 $ par caméra (agrégateur, peu fiable). Hausse de 30 à 47 % annoncée par un revendeur pour août 2026. | Référence du VMS ouvert ; VLM de trafic en 2026 | https://netcamcenter.com/en/news/milestone-xprotect-express-breidt-uit-naar-100-cameras ; https://ipvm.com/reports/milestone-essential-vms-sharp-price-drop |
| **Avigilon (Motorola Solutions)** | Licence perpétuelle sur site (Unity) ou abonnement par caméra (Alta) | Non publié. ACC Enterprise : environ 335 $ par caméra (MSRP, cité par un concurrent). Analyse NVIDIA : environ 980 $. Système intermédiaire : 75 000 à 100 000 $ matériel compris. | Gros acteur sur site ; coûteux | https://www.spot.ai/blog/avigilon-pricing-2026 ; https://getsafeandsound.com/blog/avigilon-cost/ |
| **Hanwha (Wisenet WAVE)** | Licence par caméra pour le VMS (une fois) ; module IA par serveur | Licence Professional : 200 $ MSRP (148 $ chez SHI). Module IA 16 flux : environ 1 851 $ chez un détaillant, soit environ 116 $ par flux (calcul sur un prix de détail) | Matériel et logiciel très accessibles | https://www.shi.com/product/35651707/Hanwha-Techwin-Wisenet-WAVE ; https://fleetnetwork.ca/products/wave-pro-01 |
| **Solution Nexam inc.** (Québec) | Analyse vidéo par IA, petite entreprise de la ville de Québec | Non public. Subvention fédérale CNRC de 75 000 $ (2024-2025) pour un service d'analyse vidéo par IA | **Concurrent local à étudier** : son offre et son modèle de traitement sur site ne sont pas confirmés | https://rechercher.ouvert.canada.ca/grants/record/nrc-cnrc%2C172-2024-2025-Q3-1023841%2Ccurrent |

**Lecture pour Nexora :**

- Les prix publics des grands acteurs se situent à **149 à 249 $ US par caméra et par an** avant matériel. Un offre PME locale doit se situer dans cette fourchette ou la dépasser en valeur de service, pas en fonctionnalité.
- Le **sur site n'est pas un avantage unique** : Genetec, Milestone, Avigilon, Hanwha et Coram le proposent. L'avantage à défendre est la combinaison suivante : traitement local, français, Québec, sans reconnaissance faciale, EFVP fournie.
- Ambient.ai et Avigilon ciblent les grandes organisations. Les PME ne sont pas leur cœur de marché.

### 3.2 Briques libres

| Brique | Rôle | Licence et contraintes | Source |
|---|---|---|---|
| **Frigate NVR** | NVR avec détection d'objets locale, notifications, enregistrement continu ou sur événement | Code sous **licence MIT**. Le nom « Frigate » et son logo sont **exclus** de la licence (marque). Documentation 0.18 consultée. | README du dépôt : https://raw.githubusercontent.com/blakeblackshear/frigate/dev/README.md ; documentation : https://docs.frigate.video/configuration/object_detectors |
| **Détecteurs Frigate** | Coral EdgeTPU (USB, PCIe, M.2), Hailo-8 / 8L, OpenVINO (CPU/GPU/NPU Intel 6e génération et plus), ROCm (AMD), TensorRT (Jetson, communautaire), MemryX | **Un seul type de détecteur** pour la détection (pas de mélange Coral + OpenVINO). Plusieurs instances d'un même type possibles. | Même documentation |
| **Latence indicative** | Coral : environ 10 ms par inférence (une instance). GPU : environ 30 ms, plusieurs caméras en parallèle. | Repères de la documentation Frigate | Même documentation |
| **ONVIF / RTSP** | Standards pour caméras IP : flux vidéo (RTSP) et contrôle (ONVIF) | Standards ouverts (non sourcés dans cette recherche) | À vérifier auprès des fabricants |
| **Modèles YOLO (Ultralytics)** | Détection d'objets (personne, véhicule) | **AGPL-3.0**, ou **licence Enterprise** (sur devis) si le produit est fermé ou vendu en SaaS, en appliance ou intégré à un produit commercial. La licence Enterprise est requise même pour un modèle réentraîné. **Bloquant pour un produit payant.** | https://ultralytics.com/license ; https://www.ultralytics.com/request-license |
| **Modèles de vision-langage (VLM)** | Description de scène, résumé, recherche en langage naturel | Licences variables selon le modèle. Pas vérifié ici. Un VLM ne peut pas tourner sur un petit boîtier sans compromis. | Voir section 5.2 (décision à prendre) |

**Note sur la licence Frigate :** la licence MIT du code n'accorde pas le droit d'utiliser le nom Frigate pour votre produit. Votre offre doit être présentée comme « basée sur Frigate » seulement si la politique de marque le permet. À vérifier avant toute mention.

### 3.3 Matériel nécessaire

| Élément | Prix (source) | Usage et limites |
|---|---|---|
| **NVIDIA Jetson Orin Nano Super, kit développeur 8 Go** | 249 $ US au lancement (décembre 2024) (Phoronix : https://www.phoronix.com/news/NVIDIA-Jetson-Orin-Nano-Super). Prix actuel non vérifié ; revente à 369-866 $ sur eBay (non représentatif). | Le kit développeur n'est pas un produit de production. Frigate indique que TensorRT Jetson est communautaire. |
| **Google Coral USB Accelerator** | 60 à 80 $ US (blog homelab) ; 89,95 € (revendeur allemand) | Une seule inférence à la fois ; modèle par défaut MobileDet. Frigate ne le recommande plus pour la plupart des nouvelles installations, selon un guide (non officiel). |
| **Hailo-8L (13 TOPS) M.2** | Environ 70 $ US (blog homelab, source : https://mustafa.net/hailo-8l-vs-google-coral/) | Meilleur rapport puissance/prix que le Coral selon ce blog. Hailo-8 (26 TOPS) : prix non confirmé. |
| **Dimensionnement CPU/RAM (estimation d'un prestataire d'hébergement, septembre 2026)** | 4 caméras 1080p : 4 vCPU, 8 Go et un Coral USB ; 8 caméras : 6 vCPU, 16 Go ; 16 caméras : 8 vCPU, 32 Go et un Coral PCIe ou GPU | Estimation commerciale, à valider par un test réel : https://valebyte.com/es/blog/frigate-hardware-requirements-cpu-gpu-and-coral-camera-capacity/ |
| **Stockage** | Pas de prix obtenu | Dimensionner selon le débit, la résolution et la durée de conservation, et non selon le nombre de caméras seul |
| **Processeur Intel avec NPU (OpenVINO)** | Non chiffré | NPU inutilisable sous Home Assistant OS (documentation Frigate) |

---

## 4. Cadre légal au Québec et au Canada

> **Avertissement :** cette section ne constitue pas un avis juridique. Les articles de loi cités doivent être confirmés sur le texte officiel, et une validation par un avocat est nécessaire avant de publier une offre ou une promesse de conformité.

### 4.1 Loi 25 (Loi sur la protection des renseignements personnels dans le secteur privé, P-39.1)

- **Entrée en vigueur :** toutes les dispositions de la Loi 25 sont applicables depuis le 22 septembre 2024 (secureprivacy.ai, guide 2026 : https://secureprivacy.ai/fr/blog/loi-25-au-quebec-guide-complet-de-conformite-pour-les-entreprises-2026).
- **Sanctions :** pénalités administratives jusqu'à 10 M$ ou 2 % du chiffre d'affaires mondial ; sanctions pénales jusqu'à 25 M$ ou 4 % (Osler et secureprivacy.ai, mêmes liens).
- **Évaluation des facteurs relatifs à la vie privée (EFVP) :** obligatoire pour tout projet d'acquisition, de développement ou de refonte d'un système d'information qui traite des renseignements personnels (art. 3.3, à confirmer).
- **Technologies d'identification, de localisation ou de profilage :** obligation d'informer les personnes **avant** la collecte, y compris des moyens offerts pour désactiver ces fonctions (art. 8.1, à confirmer). **Cette disposition vise directement la vidéo analysée par IA.**
- **Décisions automatisées :** obligation d'informer lorsqu'une décision est fondée exclusivement sur un traitement automatisé (art. 12.1, à confirmer).
- **Destruction :** renseignements détruits ou anonymisés lorsque la finalité est accomplie (art. 23, à confirmer).
- **Sécurité :** mesures de protection raisonnables (art. 10, à confirmer).

### 4.2 Biométrie (LCCJTI, c. C-1.1)

- **Déclaration à la CAI :** toute création d'une banque de caractéristiques ou de mesures biométriques doit être déclarée **au moins 60 jours avant sa mise en service**. Le même régime s'applique à un procédé biométrique de vérification ou de confirmation de l'identité, même sans base de données (guide CAI et Osler). Articles 44 et 45 de la LCCJTI : **numéros à confirmer** sur le texte officiel.
- **Consentement exprès** de chaque personne, et **solution alternative non biométrique** si la personne refuse ou retire son consentement (guide CAI, cité plus bas).
- **Formulaire de déclaration** fourni par la CAI.
- **Sanction réelle :** dans l'affaire Transcontinental, une déclaration de 2020 a donné lieu à une lettre de la CAI en juin 2024 sur une possible violation de la loi (commentaire Osler, cité dans les résultats).

**Source primaire lue intégralement :** CAI, « Biométrie : principes à respecter et obligations légales des organisations », version 2.0, 21 septembre 2022 (non contraignant) : https://www.cai.gouv.qc.ca/uploads/pdfs/CAI_GU_Biometrie_Organisations.pdf. Le guide précise que les usages « hors identification » (caméras thermiques, **analyse de vidéo anonyme**, reconnaissance des émotions) ne sont pas tous couverts par ses principes, mais que la Loi sur le privé s'applique tout de même à ces projets.

### 4.3 Vidéosurveillance : lignes directrices

- **CAI :** aucun guide spécifique à la vidéosurveillance dans le secteur privé n'a été trouvé. Les documents de la CAI sur le sujet concernent les organismes publics (Règles minimales d'utilisation des caméras de surveillance, consultation). À vérifier directement sur cai.gouv.qc.ca.
- **Commissariat à la protection de la vie privée du Canada (CPVP), « Guidelines for Overt Video Surveillance in the Private Sector », 2008 :** document de référence reconnu, qui s'applique au secteur privé hors Québec et sert de guide de bonnes pratiques. Il recommande de :
  1. vérifier d'abord si une mesure moins intrusive suffit ;
  2. établir une finalité d'affaires précise et s'y limiter ;
  3. rédiger une politique de vidéosurveillance ;
  4. limiter la portée et les angles des caméras ;
  5. informer le public **avant** l'entrée dans les lieux, par une affiche avec un contact ;
  6. conserver les images dans un endroit sécurisé, à accès limité, et les détruire lorsqu'elles ne servent plus ;
  7. répondre aux questions et donner accès aux images concernant une personne ;
  8. former les opérateurs ;
  9. réévaluer périodiquement la nécessité du système.
  
  Le document précise aussi : pas de caméras dirigées vers des lieux à forte attente de vie privée (douches, fenêtres) ; pas d'enregistrement du son sans besoin précis ; prudence avec le Code criminel pour les communications privées (source : https://www.priv.gc.ca/en/privacy-topics/surveillance/video-surveillance-by-businesses/gl_vs_080306/, date de modification : 6 mars 2008). Le document **exclut la surveillance des employés**.

### 4.4 Reconnaissance faciale

- **Décision Clearview AI (CAI, 14 décembre 2021, dossier 1023158-S) :** la Loi sur le privé s'applique à une entreprise étrangère qui collecte des images de Québécois. La CAI a ordonné à Clearview de cesser la collecte et l'utilisation de ces images et de les détruire. Source : https://decisions.cai.gouv.qc.ca/cai/ss/fr/518218/1/document.do ; communiqué : https://www.quebec.ca/nouvelles/actualites/details/la-commission-ordonne-a-clearview-ai-de-cesser-ses-pratiques-de-reconnaissance-faciale-non-conformes-37044
- **Recours collectif :** une demande d'autorisation a été examinée dans *Doan c. Clearview AI inc.*, 2024 QCCS 3968. Un commentaire Osler indique que les constats réglementaires n'ont pas suffi à fonder la demande dans ce dossier. **Non vérifié dans le jugement.**
- **Conclusion :** la reconnaissance faciale est, en pratique, la fonction la plus exposée. Ne pas l'offrir est la décision la plus simple.

### 4.5 Surveillance des employés

- **Cadre :** la Charte des droits et libertés de la personne du Québec protège la vie privée (art. 5) et les conditions de travail justes et raisonnables (art. 46). Le Code civil encadre aussi les atteintes à la vie privée (à confirmer). Aucune disposition spécifique à l'IA n'a été trouvée. Un mémoire de l'Université de Montréal conclut que le droit québécois encadre la vidéosurveillance traditionnelle mais est muet sur les systèmes fondés sur l'IA (https://umontreal.scholaris.ca/items/33c75285-c2c7-41ec-9bae-a6a85bb7c86f).
- **Jurisprudence d'arbitrage (sources secondaires : cabinets et chroniques RH, décisions à vérifier sur CanLII) :**
  - **Aliments Prémont (2018, employeur gagnant) :** cinq caméras filmant en continu des travailleurs d'une usine de viande, maintenues car la viabilité de l'entreprise était en jeu. https://www.blg.com/en/insights/2018/05/arbitrator-allows-video-surveillance-of-employees-where-viability-of-company-at-stake
  - **Delastek (2021, syndicat gagnant) :** surveillance vidéo des employés jugée non raisonnable, faute de preuve d'un besoin de sécurité ; ordre de retirer les caméras et de détruire les enregistrements (commentaire repris dans les résultats : https://hrinsider.ca/employer-ordered-to-stop-video-surveillance-of-union-workers/?print=pdf).
  - **Coach Canada / NewCAN (août 2025, décision partagée) :** l'arbitre admet la surveillance IA de sécurité des conducteurs d'autobus, mais juge excessifs la diffusion en direct et l'accès illimité aux images. https://www.hrreporter.com/focus-areas/safety/quebec-court-draws-hard-line-between-legal-and-illegal-employee-monitoring/393856
- **Critère retenu par la pratique :** surveillance légitime si elle a une finalité sérieuse (vols ou vandalisme répétés, par exemple), utilise des moyens raisonnables, cible étroitement les zones, et n'a pas pour objet le contrôle disciplinaire ou la mesure du rendement.

### 4.6 LPRPDE (fédéral)

La LPRPDE s'applique aux organisations de compétence fédérale et aux flux de renseignements qui traversent les frontières provinciales. Au Québec, la Loi sur le privé est la loi de référence pour une PME. Les lignes directrices de la CPVP restent une bonne pratique et sont souvent citées par les tribunaux et les commissaires. Le statut de la réforme fédérale n'a pas été vérifié dans cette recherche.

### 4.7 Ce qui est interdit ou risqué

| Pratique | Niveau de risque | Raison |
|---|---|---|
| Reconnaissance faciale ou identification de personnes | **Interdit sans déclaration et consentement exprès ; très risqué** | Biométrie (LCCJTI), Loi 25, affaire Clearview |
| Surveillance continue des employés, mesure de leur productivité | **Très risqué** | Charte (art. 5, 46) ; jurisprudence arbitrale |
| Diffusion en direct des images à un superviseur pour surveiller les employés | **Très risqué** | Coach Canada / NewCAN (2025) |
| Caméras dans les toilettes, vestiaires, salles de soins, douches | **Interdit en pratique** | CPVP, lignes directrices |
| Enregistrement du son | **Risqué** | Code criminel (communications privées) |
| Caméras sans affiche avant l'entrée | **Risqué** | CPVP, obligation d'information (Loi 25, art. 8.1) |
| Analyse de l'attitude ou des émotions | **Risqué** | Reconnaissance des émotions cité par la CAI comme usage hors identification, avec exigences de Loi sur le privé |
| Réentraînement d'un modèle sur les images d'un client | **Risqué** | Usage secondaire non autorisé ; contrat et consentement requis |
| Envoi des images vers un fournisseur étranger (infonuagique ou VLM) | **Risqué** | Transfert hors du Québec : Loi 25 exige une évaluation des facteurs (art. 17, à confirmer) |
| Conservation indéfinie des images | **Risqué** | Destruction lorsque la finalité est accomplie (art. 23, à confirmer) |

### 4.8 Ce qui différencie une offre « confidentielle par conception »

1. **Traitement sur place** : les images restent chez le client, et seules les **métadonnées d'événement** (type d'objet, horodatage, zone) sortent, si le client le choisit.
2. **Pas de reconnaissance faciale** : désactivée et non livrée, pas seulement masquée.
3. **Floutage automatique** des visages des personnes hors cible, et masquage de zones sensibles (fenêtres, écrans, vestiaires), au niveau du boîtier.
4. **Journal d'accès** : qui a consulté quelles images, quand, pourquoi. Exportable pour une demande d'accès.
5. **Conservation paramétrable** par type d'événement, avec destruction automatique et vérifiée.
6. **Zones et horaires définis** par le client, documentés dans une politique.
7. **EFVP fournie** avant le déploiement, et modèle d'affiche avec coordonnées.
8. **Aucun entraînement** sur les images, garanti par contrat **et** par architecture (modèles préentraînés, sans réentraînement sur les données client).
9. **Pas d'analyse des employés** comme fonction, avec alertes limitées aux zones de sécurité.
10. **Support et mises à jour** sur site, en français, avec engagement de sécurité des correctifs.

---

## 5. Verdict pour Nexora

### 5.1 Forces

1. **Demande mesurable au Canada :** vols à l'étalage en hausse depuis cinq ans, selon Statistique Canada.
2. **Créneau sur site, en français, pour PME** : les grands acteurs sont chers, complexes ou orientés grandes entreprises (Ambient.ai, Avigilon, Genetec sur devis).
3. **Base libre et mature :** Frigate (MIT) fournit la détection locale, les notifications et l'enregistrement. Vous n'avez pas à tout construire.
4. **Argument de confiance cohérent avec le reste de l'offre Nexora** : la vie privée est un argument naturel, et la CAI sanctionne réellement les usages à risque.
5. **Prix de référence clair** : 149 à 249 $ US par caméra et par an chez les acteurs établis, ce qui permet de chiffrer une offre locale.

### 5.2 Risques

1. **Concurrence établie avec analyse incluse.** Genetec offre la recherche en langage naturel dès le niveau Standard. Les marques établies ont la confiance des assureurs et des intégrateurs.
2. **Licence des modèles de détection (bloquant).** YOLO est sous AGPL-3.0 ; un produit payant doit obtenir une licence Enterprise (sur devis) ou utiliser un modèle sous licence permissive, à vérifier modèle par modèle.
3. **Décision sur le VLM.** Un modèle de description de scène (utile pour la recherche en langage naturel) doit tourner **sur site** pour tenir la promesse. Or votre mémoire de projet interdit les modèles locaux de 7 B paramètres et demande de vérifier avec les modèles cloud du LiteLLM de pc1. **Il faut trancher :** soit la fonction VLM est reportée, soit une exception est décidée explicitement, soit elle passe par un modèle cloud, ce qui contredit « les données ne sortent pas de chez le client ». Cette décision n'est pas technique seulement, elle engage la promesse.
4. **Responsabilité :** une alerte manquée ou une fausse accusation (vol) a des conséquences. Prévoir un contrat avec limites de responsabilité et une assurance responsabilité professionnelle.
5. **Risque juridique sur les employés et la biométrie** (section 4), qui peut rendre des clients réticents ou exposer Nexora.
6. **Exploitation physique :** installation sur site, mises à jour de caméras de marques différentes, support, disponibilité 24 h. Un coût de service élevé pour une petite équipe.
7. **Preuve de performance absente :** aucune étude indépendante du taux de détection ou de fausses alertes n'a été trouvée. Il faut la produire soi-même pendant le pilote.
8. **Dépendance à des chiffres peu fiables :** la plupart des prix concurrents sont des estimations de revendeurs.

### 5.3 Ce qu'il faut pour livrer un premier produit réel

**Périmètre recommandé pour la version 1 (décision de Nexora) :**

- détection de personnes et de véhicules dans des zones définies, sur 4 à 8 caméras IP existantes (RTSP/ONVIF) ;
- alertes selon des horaires et des zones ;
- recherche par type d'objet et par horaire ;
- journal d'accès, conservation paramétrable, floutage des visages hors cible ;
- **exclus de la version 1 :** reconnaissance faciale, analyse des employés, langage naturel, VLM.

**Composants :**

| Composant | Choix possible | Commentaire |
|---|---|---|
| Boîtier de traitement sur site | Jetson (Orin Nano ou plus) ou mini-PC Intel avec OpenVINO | Le kit développeur à 249 $ n'est pas un boîtier de production. Chiffrer un boîtier et un carrier. |
| Accélérateur | Coral USB, ou Hailo-8L M.2 | Une seule famille de détecteur pour la détection |
| Caméras | Caméras existantes du client ; une caméra d'essai | Compatibilité ONVIF/RTSP à tester marque par marque |
| Stockage | Disques, RAID, onduleur (UPS) | Dimensionner selon débit et rétention |
| Réseau | Commutateur PoE, accès distant sécurisé (VPN) | Pas de port ouvert sur Internet |
| Logiciel | Frigate (MIT, sans le nom de marque) + couche Nexora (zones, journal, politique, EFVP) | Vérifier la politique de marque |
| Modèles | Licence Ultralytics Enterprise, ou modèle sous licence permissive | **Bloquant** |
| Juridique | Avocat pour l'EFVP, la politique, les affiches, les contrats | Avant le premier client |

**Délais réalistes (estimation de Nexora, non sourcée, à valider) :**

- préparation juridique et licences : 4 à 8 semaines en parallèle ;
- prototype sur banc d'essai : 4 à 6 semaines ;
- pilote terrain sur un site, mesures comprises : 6 à 8 semaines ;
- **total : environ 4 à 5 mois** avec une équipe réduite à temps partiel. Des délais plus courts ne sont pas réalistes sans une équipe dédiée.

**Coûts :** le budget matériel d'un pilote doit être chiffré par devis. Les seuls prix sourcés sont ceux des composants de la section 3.3 (ordres de grandeur).

### 5.4 Statut recommandé à afficher

**Recommandation : « Projet pilote (sur invitation) ».**

- **Pourquoi pas « Disponible » :** aucune installation, aucune mesure de performance, licence des modèles non réglée, EFVP et affiches non rédigées.
- **Pourquoi pas « Accès anticipé » maintenant :** l'accès anticipé suppose au moins un site pilote mesuré, une EFVP et une licence de modèles valides. Ces trois conditions passeront à « Accès anticipé » lorsqu'elles seront réunies.
- **Critère de passage à « Accès anticipé » :** un site pilote installé, taux de détection et de fausses alertes mesurés et publiables, licence réglée, avis juridique obtenu.

---

## 6. Marketing

### 6.1 Positionnement

« L'analyse vidéo IA des PME québécoises, traitée chez vous, sans reconnaissance faciale et sans entraînement sur vos images. »

Cible prioritaire : petites entreprises avec 4 à 16 caméras, sur un site avec un risque identifié (stationnement, entrepôt, chantier, commerce). Cible secondaire : propriétaires de sites multiples qui veulent une vue unifiée sans cloud.

### 6.2 Promesse en une phrase

« Vos caméras restent chez vous : l'IA y analyse les images, vous envoie des alertes utiles et tient un journal de chaque accès, sans reconnaissance faciale et sans jamais utiliser vos images pour entraîner une IA. »

*Attention : « jamais » doit être vrai et prouvé par contrat et par architecture avant publication.*

### 6.3 Cinq titres forts (fr-CA)

1. **Vos caméras voient. L'IA comprend, chez vous.**
2. **Des alertes qui méritent votre attention, sans vos images dans le nuage.**
3. **Analyse vidéo IA sur place, pour les PME du Québec.**
4. **Surveillance intelligente, sans reconnaissance faciale.**
5. **Une piste d'audit pour chaque regard sur vos images.**

En anglais (en-CA), pour les mêmes titres : *Your cameras see. The AI understands, on-site.* / *Useful alerts, with your footage kept on your premises.*

### 6.4 Dix arguments

1. **Traitement sur place :** la vidéo n'est pas envoyée à un serveur tiers.
2. **Aucune reconnaissance faciale :** désactivée et non livrée.
3. **Vos images ne servent pas à entraîner de modèles :** garanti par contrat et par architecture.
4. **Floutage automatique** des personnes hors cible et masquage des zones sensibles.
5. **Journal d'accès** : vous savez qui a regardé quelles images et quand.
6. **Conservation paramétrable**, avec suppression automatique.
7. **Vos caméras actuelles** : pas besoin de remplacer tout le parc (sous réserve de compatibilité).
8. **Prix par caméra, prévisible**, sans frais de nuage surprises (à définir).
9. **Support en français**, installé et entretenu au Québec.
10. **EFVP fournie** avant le déploiement, et modèle d'affiche.

### 6.5 Objections et réponses

| Objection | Réponse |
|---|---|
| « Le nuage est plus sûr. » | Une donnée qui ne quitte pas vos locaux n'est pas exposée à une fuite chez un hébergeur. En contrepartie, la sécurité du site (mises à jour, réseau) doit être entretenue. Nous incluons cet entretien dans le contrat. |
| « Genetec ou Verkada font déjà ça. » | Ils font de la très bonne vidéo de grande entreprise, avec des prix à la connexion (Genetec : 149 à 199 $ US par an par connexion, avant matériel). Nous visons les PME qui n'ont pas d'équipe de sécurité, avec un service en français. Nous ne prétendons pas être plus précis qu'eux. |
| « Ça va surveiller mes employés. » | Nous n'analysons pas la productivité. Les zones et les horaires sont définis par vous, avec un avis aux employés. Une surveillance continue du personnel n'est pas une fonction proposée. |
| « L'IA va rater des vols ou sonner pour rien. » | Un pilote mesure les vrais résultats sur votre site. Le réglage des zones réduit les fausses alertes. Nous présenterons les taux mesurés, pas des promesses. |
| « Est-ce légal ? » | Oui, sous conditions : affiche avant l'entrée, politique écrite, EFVP, pas de biométrie sans déclaration. Nous vous aidons à préparer ces documents, sans remplacer un avis juridique. |
| « Combien ça coûte ? » | Le prix dépend du nombre de caméras, du stockage et de la durée de conservation. Un pilote a un tarif fixe. (Les montants restent à définir.) |
| « Mes caméras sont anciennes. » | La compatibilité ONVIF/RTSP est vérifiée avant l'installation. Certaines caméras ne seront pas compatibles. |
| « Et si vous fermez ? » | La base logicielle est libre (Frigate, MIT). Vos données sont exportables. Des engagements contractuels sont à rédiger. |
| « Le Québec n'a pas de loi sur l'IA. » | La Loi 25 s'applique à l'IA et impose une information préalable (art. 8.1, à confirmer). La CAI a déjà sanctionné une pratique de reconnaissance faciale (Clearview, 2021). |
| « Je veux la reconnaissance faciale. » | Nous ne l'offrons pas. Pour un besoin d'identification, la loi exige une déclaration à la CAI, un consentement exprès et une alternative. Nous pouvons vous orienter vers un avocat. |

### 6.6 Mots-clés SEO (fr-CA et en-CA)

**Volumes : non obtenus.** Aucune source gratuite consultée ne donne de volumes. Les relever avec Google Keyword Planner (compte Google Ads requis) ou un outil payant avant de planifier le contenu.

| Mot-clé | Langue | Intention | Usage suggéré |
|---|---|---|---|
| analyse vidéo IA | fr-CA | Informationnelle et commerciale | Page principale |
| vidéosurveillance IA | fr-CA | Commerciale | Page principale |
| caméra de surveillance intelligente | fr-CA | Commerciale | Page produit |
| analyse vidéo sur place | fr-CA | Commerciale (niche) | Titre, page principale |
| vidéosurveillance sans infonuagique | fr-CA | Commerciale (niche) | Page principale |
| vidéosurveillance PME Québec | fr-CA | Locale et commerciale | Page de secteur |
| loi 25 vidéosurveillance | fr-CA | Informationnelle (juridique) | Article de blogue |
| détection de personnes caméra IA | fr-CA | Informationnelle | Article |
| surveillance de chantier caméra IA | fr-CA | Commerciale | Page de cas d'usage |
| vol à l'étalage caméra IA | fr-CA | Commerciale | Page de cas d'usage |
| stationnement surveillance IA | fr-CA | Commerciale | Page de cas d'usage |
| AI video analytics Canada | en-CA | Commerciale | Page en anglais |
| on-premise video analytics | en-CA | Commerciale (niche) | Page en anglais |
| edge AI security camera | en-CA | Informationnelle et commerciale | Article |
| AI security camera no cloud | en-CA | Commerciale (niche) | Page en anglais |
| video surveillance PIPEDA | en-CA | Informationnelle (juridique) | Article |
| Frigate NVR setup | en-CA | Informationnelle (technique) | Article (attention à la marque) |
| natural language video search security camera | en-CA | Informationnelle | Article, quand la fonction existera |

### 6.7 Structure recommandée de la page d'accueil

1. **En-tête :** promesse en une phrase, bouton « Demander un pilote », mention « projet pilote, sur invitation ».
2. **Problème :** vols, incidents, besoin de preuve, sans alarme (chiffres de Statistique Canada, avec source).
3. **Comment ça marche :** trois étapes (branchez vos caméras existantes ; l'IA analyse sur place ; vous recevez alertes et journal).
4. **Ce qu'on ne fait pas :** pas de reconnaissance faciale, pas de surveillance des employés, pas d'images vers le nuage, pas d'entraînement sur vos images.
5. **Cas d'usage :** cartes par secteur (stationnement, entrepôt, chantier, commerce), avec le niveau de preuve.
6. **Conformité Loi 25 :** EFVP, affiches, conservation, droits d'accès, sans promesse de « conformité garantie ».
7. **Confiance :** architecture simple (schéma), licences de logiciels libres, journal d'accès.
8. **Statut et tarifs :** projet pilote, prix à partir d'une mesure de pilote, bouton de demande.
9. **FAQ** (section 6.8).
10. **Pied de page :** « ceci n'est pas un avis juridique » ; lien vers la politique de confidentialité.

### 6.8 FAQ (8 questions)

1. **Mes images sortent-elles de mes locaux ?**
   Non, par défaut. L'analyse se fait sur le boîtier installé chez vous. Seules les métadonnées d'événement (type, heure, zone) peuvent sortir, et seulement si vous l'activez. *(À confirmer dans l'architecture finale.)*
2. **Faites-vous de la reconnaissance faciale ?**
   Non. Cette fonction n'est pas livrée. Une identification de personnes exigerait une déclaration à la CAI, un consentement exprès et une solution de rechange, que nous n'offrons pas.
3. **Mes images servent-elles à entraîner une IA ?**
   Non. Nous n'utilisons pas vos images pour entraîner ou améliorer un modèle. C'est une obligation contractuelle.
4. **Dois-je informer mes employés et mes clients ?**
   Oui. La Loi 25 impose une information avant la collecte, et la CPVP recommande une affiche avant l'entrée. Nous fournissons un modèle d'affiche et une politique.
5. **Combien de temps les images sont-elles conservées ?**
   Vous le choisissez, par type d'événement. Les images sont ensuite détruites automatiquement.
6. **Puis-je utiliser mes caméras actuelles ?**
   Souvent, oui. Nous vérifions la compatibilité ONVIF/RTSP avant l'installation. Certaines caméras ne sont pas compatibles.
7. **Est-il légal de surveiller mes employés ?**
   Cela dépend de la finalité, des zones et des horaires. Une surveillance continue du personnel ou de sa productivité est risquée et peut être refusée par un arbitre. Nous ne proposons pas cette fonction. Consultez un avocat avant toute installation dans une zone de travail.
8. **Que se passe-t-il si l'IA se trompe ?**
   Les alertes sont vérifiées par une personne, et le système journalise chaque alerte. Nous mesurons le taux de fausses alertes pendant le pilote. Une alerte ne remplace pas une intervention de sécurité, et le contrat précise les limites de responsabilité.

### 6.9 Ce qu'il NE faut PAS affirmer (risques juridiques ou factuels)

- « Conforme à la Loi 25 » ou « certifié CAI » : la conformité ne se garantit pas, et il n'existe pas de certification de la CAI pour ce type d'offre.
- « Aucune donnée ne quitte jamais votre site » : seulement après la preuve technique (audit, test de réseau), et en précisant les exceptions (métadonnées, mises à jour).
- « Aucune reconnaissance faciale possible » : dire « non offerte et désactivée » ; une désactivation logicielle seule ne suffit pas à le garantir.
- « Nous réduisons les vols de X % » : aucun chiffre sourcé n'existe. Ne publier que les résultats mesurés du pilote, avec la méthode.
- « Précision de 99 % » ou tout taux de détection sans mesure locale et méthode.
- « L'IA remplace un agent de sécurité » ou « surveillance 24 h/24 sans personne » : une alerte demande une intervention humaine.
- « Entraîne aucun modèle sur vos images » si cela n'est pas garanti par contrat et architecture (ne pas réentraîner, ne pas journaliser les images dans un outil tiers).
- « Solution approuvée par la CAI » ou « agréée par la CPVP » : aucune approbation de ce type n'existe.
- « Basé sur Frigate » ou « officiel Frigate » sans autorisation de la marque, ou utiliser le logo.
- « Identifie les voleurs » : l'IA détecte des personnes et des objets, pas l'intention ni l'identité.
- Comparaisons de prix nominatives (« moins cher que Genetec ») fondées sur des prix non publics ou des estimations de revendeurs.
- « Surveillance des employés » ou « mesure de la productivité » comme avantage commercial.
- Toute « certification » ou « norme » non obtenue (ISO 27001, SOC 2).

---

## 7. Sources

**Marché et tendances**

- MarketsandMarkets, Video Analytics Market (monde) : https://www.marketsandmarkets.com/ResearchInsight/size-and-share-of-intelligent-video-analytics-market.amp (consulté le 27 oct. 2026)
- SNS Insider, Global AI Video Analytics Market : https://www.snsinsider.com/press-release/global-ai-video-analytics-market (date non indiquée)
- Ken Research, Global AI Video Analytics Market : https://www.kenresearch.com/industry-reports/global-ai-video-analytics-market.md (date non indiquée)
- MarketsandMarkets, Video Surveillance Market Canada : https://www.marketsandmarkets.com/Market-Reports/geography/video-surveillance-market/canada (consulté le 27 oct. 2026)
- MarketsandMarkets, VSaaS Canada : https://www.marketsandmarkets.com/Market-Reports/geography/video-surveillance-as-a-service-market/Canada (consulté le 27 oct. 2026)
- IMARC, Canada CCTV Camera Market : https://www.imarcgroup.com/canada-cctv-camera-market (consulté le 27 oct. 2026)
- Security Journal Americas, Security Canada West 2026 : https://securityjournalamericas.com/ai-solutions-security-canada-west-2026/ (date non indiquée)
- Scylla, Natural language video search (2026) : https://www.scylla.ai/natural-language-video-search-is-here-what-it-means-for-security-investigations-in-2026/ (fournisseur)
- Security Systems News, Milestone VLM (févr. 2026) : https://digital.securitysystemsnews.com/articles/milestone-systems-launches-vision-language-model-vlm-
- Fora Soft, Surveillance multimodal agent (4 juin 2026) : https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/surveillance-investigation-multimodal-agent (prestataire)
- arXiv 2510.23190 : https://arxiv.org/abs/2510.23190v1
- Axis, « AI in video analytics » (livre blanc, 2021, cité dans les résultats) : https://www.axis.com/files/whitepaper/wp_AI_in_video_analytics_fr_2103.pdf

**Demande et indicateurs**

- Statistique Canada, Le Quotidien du 22 juillet 2025 (crimes déclarés 2024) : https://www150.statcan.gc.ca/daily-quotidien/250722/dq250722a-fra.htm (extrait de recherche)
- Statistique Canada, Le Quotidien du 22 juillet 2026 (crimes déclarés 2025) : https://www150.statcan.gc.ca/n1/daily-quotidien/260722/dq260722a-fra.htm (extrait de recherche)
- NRF, Retail shrink (communiqué, enquête 2023) : https://nrf.com/media-center/press-releases/nrf-reports-retail-shrink-nearly-100b-problem
- SecurityInfoWatch, NRF 2025 shoplifting study : https://www.securityinfowatch.com/retail/news/55396090/national-retail-federation-nrf-study-shoplifting-declined-in-2025-as-retail-fraud-schemes-increased
- Insurance Business (Canada), Samsara study : https://www.insurancebusinessmag.com/ca/news/breaking-news/equipment-tracking-gaps-cost-canadian-operators-millions-annually-samsara-study-finds-582579.aspx
- MHCC, Construction site theft prevention (Canada) : https://www.mhccna.com/en-ca/expertise/construction-site-theft-prevention-advice-for-canadian-ontractors
- Piza, Welsh, Farrington, Thomas (2019), CCTV meta-analysis (résumé OJP) : https://www.ojp.gov/ncjrs/virtual-library/abstracts/cctv-surveillance-crime-prevention-40-year-systematic-review-meta

**Concurrents et prix**

- Genetec, Security Center SaaS pricing (lue le 27 oct. 2026) : https://www.genetec.com/products/unified-security/security-center-saas/saas-pricing
- Rhombus, Pricing (extraction automatique, à reconfirmer) : https://www.rhombus.com/pricing
- Getsafeandsound, Verkada pricing (partenaire) : https://getsafeandsound.com/blog/verkada-cameras-price/
- rfp.wiki, Verkada vs Eagle Eye : https://www.rfp.wiki/it-security/video-surveillance-management-systems/verkada/eagle-eye-networks
- Vendr, Verkada : https://www.vendr.com/marketplace/verkada
- Spot AI, Pricing information : https://www.spot.ai/pricing-information
- Getsafeandsound, Spot AI pricing : https://getsafeandsound.com/blog/spot-ai-pricing/
- Capterra, Spot AI : https://www.capterra.com/p/208390/Spot-AI/
- FitGap, Coram AI : https://us.fitgap.com/products/032483/coram-ai
- Spot AI, Eagle Eye pricing 2026 (concurrent) : https://www.spot.ai/blog/eagle-eye-networks-pricing-2026
- IPVM, Eagle Eye cloud VMS $5 (2014) : https://ipvm.com/reports/2412
- G2, Ambient.ai pricing : https://www.g2.com/products/ambient-ai/pricing
- NetcamCenter, Milestone Express+ : https://netcamcenter.com/en/news/milestone-xprotect-express-breidt-uit-naar-100-cameras
- IPVM, Milestone Essential : https://ipvm.com/reports/milestone-essential-vms-sharp-price-drop
- Spot AI, Avigilon pricing 2026 (concurrent) : https://www.spot.ai/blog/avigilon-pricing-2026
- Getsafeandsound, Avigilon cost : https://getsafeandsound.com/blog/avigilon-cost/
- SHI, Hanwha Wisenet WAVE : https://www.shi.com/product/35651707/Hanwha-Techwin-Wisenet-WAVE
- FleetNetwork, Wisenet WAVE Pro : https://fleetnetwork.ca/products/wave-pro-01
- Gouvernement du Canada, subvention CNRC (Solution Nexam inc.) : https://rechercher.ouvert.canada.ca/grants/record/nrc-cnrc%2C172-2024-2025-Q3-1023841%2Ccurrent

**Briques libres et matériel**

- Frigate NVR, README (licence MIT) : https://raw.githubusercontent.com/blakeblackshear/frigate/dev/README.md
- Frigate, Object Detectors (documentation 0.18) : https://docs.frigate.video/configuration/object_detectors
- Ultralytics, License : https://ultralytics.com/license
- Ultralytics, Request License : https://www.ultralytics.com/request-license
- Phoronix, Jetson Orin Nano Super (17 déc. 2024) : https://www.phoronix.com/news/NVIDIA-Jetson-Orin-Nano-Super
- Botmonster, Hailo-8 vs Coral (2026) : https://botmonster.com/smart-home/hailo-8-vs-coral-tpu-frigate-nvr-comparison/
- Mustafa.net, Hailo-8L vs Google Coral : https://mustafa.net/hailo-8l-vs-google-coral/
- Valebyte, Frigate hardware requirements (septembre 2026, estimation) : https://valebyte.com/es/blog/frigate-hardware-requirements-cpu-gpu-and-coral-camera-capacity/

**Cadre légal**

- Loi sur la protection des renseignements personnels dans le secteur privé, P-39.1 : https://www.legisquebec.gouv.qc.ca/fr/document/lc/P-39.1 (**non récupérée : erreur 502 ; articles à confirmer**)
- Loi concernant le cadre juridique des technologies de l'information, C-1.1 : https://www.legisquebec.gouv.qc.ca/fr/document/lc/C-1.1 (**non récupérée : erreur 403 ; articles 44 et 45 à confirmer**)
- Charte des droits et libertés de la personne, C-12 : https://www.legisquebec.gouv.qc.ca/fr/document/cs/C-12 (**non récupérée : erreur 502 ; articles 5 et 46 à confirmer**)
- CAI, Biométrie : principes à respecter et obligations légales des organisations (version 2.0, 21 sept. 2022) : https://www.cai.gouv.qc.ca/uploads/pdfs/CAI_GU_Biometrie_Organisations.pdf (lu intégralement)
- Osler, CAI et biométrie : https://www.osler.com/fr/articles/mises-%C3%A0-jour/la-commission-dacces-a-linformation-du-quebec-maintient-la-severite-des-exigences-applicables-au-traitement-des-renseignements-biometriques-lecons-pour-les-entreprises/?pdf=1
- secureprivacy.ai, Loi 25 guide 2026 : https://secureprivacy.ai/fr/blog/loi-25-au-quebec-guide-complet-de-conformite-pour-les-entreprises-2026
- CAI, décision Clearview AI (14 déc. 2021, dossier 1023158-S) : https://decisions.cai.gouv.qc.ca/cai/ss/fr/518218/1/document.do
- Gouvernement du Québec, communiqué sur Clearview AI : https://www.quebec.ca/nouvelles/actualites/details/la-commission-ordonne-a-clearview-ai-de-cesser-ses-pratiques-de-reconnaissance-faciale-non-conformes-37044
- Osler, Doan c. Clearview (2024 QCCS 3968, commentaire) : https://www.osler.com/?p=123322 (non vérifié dans le jugement)
- CPVP, Guidelines for Overt Video Surveillance in the Private Sector (2008) : https://www.priv.gc.ca/en/privacy-topics/surveillance/video-surveillance-by-businesses/gl_vs_080306/
- BLG, Aliments Prémont (2018) : https://www.blg.com/en/insights/2018/05/arbitrator-allows-video-surveillance-of-employees-where-viability-of-company-at-stake
- HR Insider, Delastek (commentaire) : https://hrinsider.ca/employer-ordered-to-stop-video-surveillance-of-union-workers/?print=pdf
- HR Reporter, Coach Canada / NewCAN (2025, commentaire) : https://www.hrreporter.com/focus-areas/safety/quebec-court-draws-hard-line-between-legal-and-illegal-employee-monitoring/393856
- Gowling WLG, Vigi Santé (Cour d'appel, 2017, peu pertinent) : https://gowlingwlg.com/fr/insights-resources/articles/2017/the-vigi-sante-ltee-decision-the-court-of-appeal
- Université de Montréal, mémoire sur la vidéosurveillance algorithmique au Québec : https://umontreal.scholaris.ca/items/33c75285-c2c7-41ec-9bae-a6a85bb7c86f

**Sources à reconfirmer avant publication** : Rhombus (extraction automatique), Statistique Canada (extraits), arbitrages (commentaires de cabinets), articles de loi (texte officiel non récupéré).
