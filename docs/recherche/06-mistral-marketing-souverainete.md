# Nexora : recherche marketing et stratégie de contenu

**Volet 06 : analyse de mistral.ai, Hostinger, OpenRouter, souveraineté, mots-clés fr-CA et fr-FR, cadres de rédaction et design libre**

- Date de rédaction : 26 octobre 2026
- Périmètre : pages lues le 26 octobre 2026. Les textes juridiques, prix et chiffres publics sont à revérifier avant publication.
- Statut : version 1, destinée à l'équipe marketing et au design de NexoraSite

---

## 0. Synthèse

1. **Chez Mistral, la souveraineté est la porte d'entrée du site.** « Sovereign AI » figure au premier niveau de la navigation, avant les produits, la méthode et les cas clients. Nexora peut reprendre cette logique, en ajoutant ce que Mistral n'a pas : un ancrage québécois.
2. **Mistral n'annonce pas de présence au Canada.** Sur sa page d'inférence, les régions proposées sont l'Union européenne et, pour certains modèles, les États-Unis. Le Québec est donc un axe de différenciation réel, à condition de le démontrer.
3. **Le style Mistral repose sur trois réflexes** : titres courts terminés par un point, structure « Nous X. Vous Y. », verbes d'action à l'impératif. Ils se reproduisent facilement en français, mais les formulations doivent rester originales.
4. **Hostinger et OpenRouter convertissent par la transparence chiffrée** : prix d'appel, total engagé, catalogue filtrable, politique de données par fournisseur. Leurs chiffres ne se transposent pas tels quels : promotions datées, statistiques non sourcées. Aucun des deux n'annonce de centre au Canada.
5. **Ce que Nexora peut affirmer dépend de preuves.** « Hébergé au Québec » et « contrôle des flux » sont défendables si l'architecture le confirme. « Conforme à la Loi 25 », « 100 % souverain », « inviolable », « sans fuite de données » et « numéro un » sont à proscrire.
6. **Mots-clés** : 15 grappes identifiées. Les opportunités les moins encombrées au Québec sont l'IA locale (serveur sur place), la passerelle de modèles et la page pilier sur la souveraineté. Aucun volume de recherche n'a été mesuré.
7. **Rédaction** : StoryBrand pour l'accueil et les cas d'usage, PAS pour les pages « problème », Jobs-to-be-done pour les titres, AIDA pour les pages de démonstration. Les origines historiques d'AIDA et de PAS sont contestées ou non établies.
8. **Design** : des polices sous licence libre (Inter, Geist, IBM Plex, Space Mono ou Space Grotesk) suffisent à retrouver l'esprit Mistral. Il ne faut reprendre ni la police de titre, ni le logo, ni le motif pixel, ni le chat de Mistral.

**Décisions à prendre par Nexora** : confirmer le lieu réel d'hébergement, produire les preuves techniques, arrêter le nom des offres, et obtenir des volumes de recherche avec un outil payant.

---

## 1. Méthode, sources et niveaux de confiance

**Pages lues directement le 26 octobre 2026** (Firecrawl) : accueil de mistral.ai ; /sovereign-ai/ ; /products/ ; /products/studio/ ; /cloud/inference/ ; /our-method/ ; /pricing/ ; /brand/ ; /fr/ (accueil français).

**Analyses confiées à trois sous-agents, dont les résultats sont repris ici avec leurs niveaux de confiance** :
- Hostinger (VPS, versions anglaise et française) et OpenRouter (accueil, catalogue partiel d'environ 113 cartes, documentation, tarifs, politique de confidentialité) ;
- souveraineté (textes officiels, CLOUD Act, acteurs) : LégisQuébec, CanLII, Congress.gov et uscode.house.gov étaient inaccessibles ;
- mots-clés (15 requêtes de résultats de recherche, 6 suggestions de saisie) ;
- cadres de rédaction, processus et ressources de design (dépôts officiels, registres de paquets, W3C, MDN).

Ces résultats n'ont pas tous été relus page par page par moi. Les points critiques sont signalés dans la section 12.

**Non visité** : /about/, /customers/, /use-cases/, /products/vibe/, /products/forge/, /cloud/compute/, /pricing/enterprise-deployments/, docs.mistral.ai (inaccessible au sous-agent). Le kit de marque (fichiers .zip) n'a pas été téléchargé : le téléchargement demande une autorisation.

**Légende** : [V] vérifié sur la source lue ; [I] inféré ; [NV] non vérifié. Les chiffres des sites tiers sont donnés « tels qu'affichés le 26 octobre 2026 ».

**Limites majeures** :
- aucun volume de recherche n'a été mesuré (aucun outil de volume disponible) ;
- les numéros d'articles de la Loi 25 n'ont pas été lus dans le texte officiel ;
- l'extraction automatique de la charte visuelle de Mistral (couleurs, polices) n'a pas été contrôlée dans le code source.

---

## 2. mistral.ai : analyse

### 2.1 Arborescence et navigation [V]

| Zone | Entrées (URL) | Remarque |
|---|---|---|
| Niveau principal | Research ; Sovereign AI ; Cloud ; Customers ; Company | « Sovereign AI » est un niveau principal, pas un produit |
| Sovereign AI | Why Sovereign AI (/sovereign-ai/) ; Products (/products/) ; Method (/our-method/) ; Sovereign AI in practice (/use-cases/) | Le récit de souveraineté ouvre la section produits |
| Cloud | Inference (/cloud/inference/) ; Compute (/cloud/compute/) | Deux offres d'infrastructure |
| Customers | Énergie, fabrication, services financiers, secteur public (/industry/...) ; All customers (/customers/) | Découpage par secteur |
| Company | Blog (/news/) ; Docs ; About us (/about/) ; Careers (/careers/) | Documentation externalisée |
| Accès | Get in touch ; Login (console) ; Studio ; Vibe | Deux produits mis en avant dans l'en-tête |
| Pied de page | Build with us (clients, partenaires, marque, tarifs) ; Dive deeper (cas d'usage) ; Company (conditions, confidentialité, entente de traitement des données, centre de confiance, mentions légales) | Preuves de confiance en navigation |
| Langues | English, Français (/fr/), Italiano | Version française traduite ; noms de produits en anglais |

**Observation** : le menu fait de la souveraineté la porte d'entrée, puis décline les produits. Le centre de confiance et l'entente de traitement des données sont dans le pied de page, visibles.

**Note** : Le Chat ne figure plus dans le menu produit. Vibe le remplace dans la navigation et les plans tarifaires [V], mais le lien de l'application mobile porte encore le nom « Le Chat » [V]. Mistral Studio s'appelle désormais « Studio ».

### 2.2 Pages clés [V]

| Page | Rôle | Structure observée | Appels à l'action |
|---|---|---|---|
| Accueil (/) | Positionnement et routage vers les produits | Titre d'accroche ; bloc de promesse « Mistral lets you decide… » ; quatre piliers en alternance texte et image ; logos clients en noir et blanc ; secteurs avec citations ; trois liens « Go deeper » | « Discover Research », « Discover Forge », « Discover Vibe », « Discover Studio », « Discover Inference », « Discover Compute » |
| Sovereign AI (/sovereign-ai/) | Argumentaire de souveraineté | Titre « Sovereignty is existential. » ; définition façon dictionnaire avec transcription phonétique ; animation des flux données et IA ; quatre couches de contrôle (données, intelligence, calcul, exploitation) ; parcours en cinq étapes ; appel final | « Learn more about our customers » ; « Use open models » (étape 1 du parcours) |
| Products (/products/) | Carte des offres | Titre « Build your AI with Mistral. » ; sous-titre sur trois composantes ; cinq cartes (Vibe, Studio, Inference, Compute, Forge) avec une phrase chacune | Cartes cliquables |
| Studio (/products/studio/) | Plateforme de construction et de gouvernance d'agents (équivalent de WorkStudio) | Cinq verbes : Build, Iterate, Deploy, Govern, Accelerate ; vignettes produit ; section « Build what's next » (documentation, exemples, support, services) | « Try Studio » ; « Contact sales » |
| Inference (/cloud/inference/) | Accès API et déploiement régional (équivalent d'une passerelle de modèles) | Titre « Inference to build your frontier in Europe. » ; exemples de code en trois langages ; section « Data sovereignty for every request » (choisir le lieu, savoir qui traite, limiter la conservation) ; citations clients ; tableau des modèles et des prix par million de jetons ; FAQ | « Get API key » ; « Read our docs » ; « Enterprise APIs » ; « Compare » |
| Our method (/our-method/) | Services d'accompagnement (proche de l'installation chez le client) | Titre « Partnering with ambitious enterprises at the frontier. » ; quatre engagements (cas prioritaire, modèles sur mesure, exploitation, rendements croissants) ; parcours en trois étapes ; équipe (stratèges, ingénieurs, chercheurs, ingénieurs de déploiement) ; quatre modèles de déploiement (API hébergée en UE, capacité dédiée, cloud privé, sur site) | « Contact us » |
| Pricing (/pricing/) | Grille de tarifs et FAQ | Quatre forfaits (Free, Pro, Team, Enterprise) ; tableau comparatif long ; FAQ rédigée comme des questions d'utilisateurs ; tarification API par million de jetons | « Start now » ; « Contact us » |
| Brand (/brand/) | Kit de marque pour partenaires | Consignes de logo (espace de protection, version dégradée, usages interdits) ; ressources téléchargeables ; modèles présentés comme illustrations pixel | « Start building » ; « Contact sales » |
| Accueil FR (/fr/) | Version française | Même structure ; titres traduits ; CTA « Découvrir… » ; noms de produits en anglais | Idem |

### 2.3 Ton, longueur et vocabulaire [V pour les exemples ; I pour les estimations]

- **Titres** : courts, souvent de 3 à 7 mots, avec un point final (« Sovereignty is existential. » ; « We host it. Or you do. »). Le point final fait partie du style.
- **Structure « Nous X. Vous Y. »** : l'accueil l'utilise quatre fois de suite. Elle exprime une répartition des rôles et un bénéfice.
- **Phrases de corps** : courtes dans les blocs de promesse (souvent moins de 12 mots) ; plus longues et techniques dans les pages Sovereign AI et Our method (15 à 25 mots, parfois davantage).
- **Verbes à l'impératif en début de paragraphe** : « Use », « Customize », « Control », « Choose », « Run » dans le parcours de souveraineté.
- **Vocabulaire technique assumé** : poids des modèles, tokenizer, points de contrôle, VPC, sur site, SLA, garde-fous, observabilité, traçabilité, inférence, mélange d'experts. Le lecteur non technique saisit le sens général grâce aux verbes simples (garder, posséder, construire, exécuter, décider).
- **Répétition du mot-clé** : « sovereign » apparaît dans presque toutes les sections. C'est un mot-marque répété plutôt qu'un synonyme varié.
- **Preuves** : chiffres ciblés (un gain de 70 % de rapidité, cité pour ASML), noms d'entreprises, citations de dirigeants. Les citations sont longues et vérifiables.
- **Superlatif** : « #1 in Sovereign AI » dans le titre d'accueil (version française : « N°1 en IA souveraine »). Le superlatif n'est accompagné d'aucune source visible. Nexora ne doit pas le copier.
- **Vocabulaire signature à ne pas reprendre** : « frontier », « powerhouse », « compounding », « Own your AI future ». Ce sont des marqueurs de marque de Mistral.

### 2.4 Formulations observées et principe retenu

Huit extraits, chacun de moins de 15 mots et cité une seule fois. Le reste est reformulé.

| Formulation observée | Principe à retenir |
|---|---|
| « We make the models. You keep them. » (accueil) | Répartition claire des rôles en deux phrases courtes |
| « Mistral lets you decide how AI works in your organization. » (accueil) | Le titre promet un contrôle, pas une fonctionnalité |
| « Sovereignty is existential. » (Sovereign AI) | Titre court qui pose un enjeu fort ; à manier avec prudence pour une PME |
| « Sovereign AI means the intelligence you build stays with you. » (Sovereign AI) | Définition simple d'un terme-clé, placée tôt dans la page |
| « Nothing leaves your perimeter. » (Studio, déploiement autohébergé) | Garantie courte ; exige une preuve technique (section 4) |
| « Your data stays within your walls. » (Our method, sur site) | Image concrète de la souveraineté : les murs de l'entreprise |
| « Our abstract pixel cat is our emblem. » (Brand) | Expliquer l'emblème ; ici, à ne pas copier |
| « Personne d'autre ne devrait tenir les ficelles de votre » (accueil FR) | Expression idiomatique française qui rend la métaphore du contrôle |

### 2.5 Appels à l'action [V]

- Verbes employés : Discover / Découvrir (navigation), Start now / Start building (accès à l'espace de travail), Try (essai), Contact sales / Contact us / Get in touch (contact commercial), Get API key (clé d'API), Read our docs (documentation), Learn more about our customers (preuves), Compare (comparaison de modèles).
- Structure : deux boutons par section, un principal (plein) et un secondaire (contour ou lien).
- Lecture : l'action commerciale est explicite (« Contact sales ») ; l'action d'exploration (« Discover ») sert à la découverte. Nexora peut reprendre ce double niveau.

### 2.6 Identité visuelle

| Élément | Observation | Statut |
|---|---|---|
| Fond | Clair, teinte chaude proche de #FBFBF8 | Extraction automatique (confiance globale de 0,57) |
| Texte | Quasi noir, proche de #18181B | Extraction automatique |
| Couleurs de marque | Rouge proche de #C4001D ; orange proche de #FA500F ; noir | Extraction automatique ; valeurs du logo lues dans le fichier SVG [V] |
| Logo | Grille de carrés colorés formant un M ; dégradé du jaune (#FFAF01) au rouge (#C4001D) ; version monochrome pour fonds chargés ; consignes de protection et usages interdits | [V] sur /brand/ et le SVG |
| Typographie | Corps : Inter ; titres : ALTMistral (vraisemblablement propriétaire) ; monospace : Space Mono | Extraction automatique ; la page marque ne cite aucune police [V] |
| Angles | Bouton principal aux angles arrondis (6 px) ; autres éléments aux angles droits | Extraction automatique ; confiance faible sur les boutons (0,36) |
| Grille | Sections pleine largeur ; cartes en mosaïque (« bento ») ; grandes marges | Inféré à partir des noms d'images et de la structure |
| Illustrations | Modèles figurés par des illustrations pixelisées colorées ; diagrammes de flux (organisation interne contre IA externe) ; motifs de points | [V] pour le contenu ; style [I] |
| Animations | Titres d'accroche découpés (animation probable) ; transitions entre pages (métadonnées de transition de vue) ; GIF animés (drapeau dans le titre, chat en pied de page) ; défilement de logos | Inféré à partir du texte extrait et des métadonnées |
| Photographie | Pas de photos d'archive ; captures d'interface et illustrations | [V] |
| Technique | Métadonnées compatibles avec un site Astro et une structure Tailwind | Inféré |

### 2.7 À retenir et à ne pas copier

**À retenir** :
- ouvrir par la souveraineté, puis descendre vers les offres ;
- structurer la page produit par verbes d'action ;
- montrer les options de déploiement (sur site, hébergé, cloud privé) avec leurs conditions ;
- publier un centre de confiance et une entente de traitement des données ;
- écrire la FAQ en questions d'utilisateurs ;
- aider à choisir (la page tarifs répond à la question « quel modèle utiliser ? »).

**À ne pas copier** :
- le logo, le motif pixel, le chat, l'emblème ;
- la police de titre (vraisemblablement propriétaire) et le dégradé de marque ;
- le superlatif « numéro un » ;
- les phrases d'accroche, mot pour mot ;
- les logos de grandes entreprises : Nexora a besoin de preuves à sa taille.

---

## 3. Hostinger (VPS) et OpenRouter (passerelle de modèles)

### 3.1 Hostinger, page VPS

Sources [V, sous-agent] : https://www.hostinger.com/vps-hosting ; https://www.hostinger.com/pricing/vps-hosting ; https://www.hostinger.com/fr/vps (version française).

**Structure** (version anglaise, ordre observé) :
1. Héros : prix barré, bouton « Claim deal », garantie de 30 jours.
2. Trois bénéfices : processeurs AMD EPYC, stockage NVMe, commandes en langage naturel.
3. Note de satisfaction (Trustpilot : 4,6/5 pour 73 476 avis, observé le 26 octobre 2026).
4. Quatre plans KVM (1, 2, 4, 8), bouton « Choose plan », badge « MOST POPULAR » sur le plan du milieu.
5. Fonctions communes (bande passante, API publique, domaine offert pour un an).
6. Cinq cas d'usage, chacun avec un bouton « Get started ».
7. Catalogue de systèmes d'exploitation et d'applications en un clic.
8. Localisation des centres de données, puis « Hostinger Agent », puis outils (terminal web, accès root, anti-DDoS, pare-feu, Docker).
9. Témoignages, connecteur pour agent (« Connect your agent »), FAQ de huit questions, dernier appel « Help me choose a VPS plan ».

**Prix** : de 6,49 $ à 25,99 $ par mois en anglais, de 5,49 € à 21,99 € en français, sur un engagement de 24 mois payé d'avance. La version française précise le renouvellement automatique. Les offres sont promotionnelles (Black Friday) et datées. Un sous-agent estime la hausse au renouvellement entre 71 et 123 % en dollars [I] : à vérifier avant toute comparaison.

**Localisation** : dix centres de données annoncés, sans centre au Canada ni au Québec sur les pages lues [V]. Les listes de pays ne concordent pas d'une page à l'autre [V] : un défaut de rédaction à ne pas reproduire.

**Tactiques de conversion** :
- prix d'appel barré, précédé de « à partir de » ;
- total engagé affiché (« Today you pay ») ;
- badge sur le plan central ;
- preuve chiffrée (avis, nombre d'utilisateurs revendiqué) ;
- assistant de choix en fin de page ;
- promotion datée.

**Ton** : vouvoiement dans la version française ; phrases de FAQ de 20 à 30 mots [I] ; vocabulaire technique dense (KVM, vCPU, inodes) présenté par cas d'usage.

**À transposer** : un parcours court par cas d'usage, un engagement total affiché, un assistant de choix.
**À éviter** : promotions datées, urgence artificielle, chiffres sans source.

### 3.2 OpenRouter, passerelle et catalogue de modèles

Sources [V, sous-agent] : https://openrouter.ai/ ; https://openrouter.ai/models ; https://openrouter.ai/docs/quickstart ; https://openrouter.ai/pricing ; https://openrouter.ai/business/eu ; https://openrouter.ai/docs/guides/privacy/provider-logging.

**Structure de l'accueil** : titre sur une interface unique pour tous les modèles ; deux boutons (obtenir une clé d'API, découvrir les modèles) ; quatre chiffres (volume de jetons, utilisateurs, fournisseurs, modèles) ; trois cartes (disponibilité, prix et performance, politiques de données) ; modèles en vedette ; parcours en trois étapes.

**Chiffres affichés** (non audités, sans source détaillée) : plus de 500 modèles, plus de 80 fournisseurs, « 700T+ » jetons par mois tel qu'affiché (unité non développée) [V pour l'affichage].

**Modèle économique** [V] :
- pas d'abonnement pour les formules Standard et Business ;
- aucun frais par requête ; des frais s'appliquent à l'achat de crédits (5,5 % en Standard, 8 % en Business) ;
- les tentatives échouées ne sont pas facturées ;
- formule gratuite limitée (25 modèles et 50 requêtes par jour, selon la page) ;
- formule Enterprise sur devis.

**Routage et disponibilité** : bascule automatique vers un autre fournisseur en cas de panne ; la latence n'est pas garantie.

**Données** [V] :
- contrôle par fournisseur, par requête ou par compte ;
- dans l'Union européenne, les prompts et réponses restent dans la zone UE, Royaume-Uni et Suisse, mais les données de compte, de facturation et de sécurité peuvent être traitées aux États-Unis ;
- en Business, le routage régional est réservé ; la recherche web, les fichiers et l'API batch sont refusés en UE ;
- quatre fournisseurs sont signalés comme pouvant entraîner leurs modèles sur les données ;
- la conservation nulle est offerte sur tous les forfaits.

**Catalogue** : tableau avec fournisseur, volume d'usage, fenêtre de contexte, prix par million de jetons en entrée et en sortie, prix par image ou par caractère, onglets par modalité, tri, comparateur. Pas de colonne de latence [V].

**Ton** : impératifs courts, vocabulaire de développeur.

**À transposer** : un tableau de comparaison au format par million de jetons pour toute passerelle ; une carte « politiques de données » en page d'accueil ; le détail des frais dès la page tarifaire ; la bascule automatique, à condition de la décrire précisément.
**À éviter** : les chiffres d'échelle non sourcés ; « aucun entraînement » sans les exceptions ; la comparaison directe des prix Hostinger et OpenRouter (unités et devises différentes).

**Contre-modèle utile** : la route européenne d'OpenRouter transfère encore des données de compte vers les États-Unis. Nexora doit dire précisément quelles données restent au Québec et lesquelles n'y restent pas.

### 3.3 Transposition pour Nexora (VPS et passerelle)

- Afficher le prix de renouvellement avec la même visibilité que le prix d'appel.
- Montrer le total engagé et préciser le traitement des taxes (à confirmer au regard de la Loi sur la protection du consommateur).
- Présenter la passerelle comme un point d'accès unique, avec un catalogue par modèle et un tableau de confidentialité par fournisseur.
- Ne pas concurrencer sur le prix seul : Nexora vend l'installation, l'exploitation et le lieu d'hébergement.

---

## 4. Souveraineté : cadre juridique et ce que Nexora peut affirmer

**Avertissement** : ce chapitre n'est pas un avis juridique. Un avocat québécois doit valider les formulations, et un juriste français si le site vise la France.

### 4.1 Loi 25 (Québec)

- Nom usuel : Loi 25. Texte consolidé : Loi sur la protection des renseignements personnels dans le secteur privé (LPRPSP), RLRQ c. P-39.1. Sanctionnée le 22 septembre 2021 (LQ 2021, c. 25) [V, Assemblée nationale].
- Entrée en vigueur progressive : une partie des règles dès le 22 septembre 2022, la plupart au 22 septembre 2023 [V, gouvernement du Québec, communiqué du 22 septembre 2023].
- Points retenus par les cabinets (à confirmer au texte) :
  - communication hors Québec : une évaluation des facteurs relatifs à la vie privée (EFVP) est requise avant ; elle vaut aussi pour une autre province ou un tiers qui héberge hors Québec [I, cabinets] ;
  - responsable de la protection des renseignements personnels, incidents de confidentialité, information requise lorsqu'une décision repose exclusivement sur un traitement automatisé ;
  - sanctions administratives jusqu'à 10 M$ ou 2 % du chiffre d'affaires mondial ; sanctions pénales jusqu'à 25 M$ ou 4 % [I, non vérifié au texte].
- Ce que la loi n'impose pas (à confirmer à l'article 17) : une obligation générale de résidence des données au Québec pour le secteur privé. Elle encadre les transferts sans les interdire [I].
- Terme juridique à employer : « renseignements personnels ». « Données personnelles » relève de l'usage français et européen.

### 4.2 Résidence des données et secteur public

- Secteur public : des documents d'archive (non officiels) citent des énoncés d'orientation du Secrétariat du Conseil du trésor sur l'infonuagique, qui exigeraient l'hébergement au Québec des renseignements personnels, sauf protection équivalente [I, à confirmer sur tresor.gouv.qc.ca].
- Conséquence probable : un client public québécois peut exiger un hébergement au Québec. À vérifier dans chaque appel d'offres.
- Fédéral : le projet de loi C-27, qui contenait la loi sur l'IA (AIDA), n'a pas été adopté ; la session a pris fin le 6 janvier 2025 [V, LEGISinfo]. Un projet de remplacement, C-36, aurait été déposé le 15 juin 2026 ; son statut est à confirmer [dépôt signalé ; statut NV].
- Programme fédéral : ISDE a recherché, du 15 janvier au 15 février 2026, des centres de données IA souverains de plus de 100 MW. La souveraineté est un critère, mais aucune localisation des données clients n'est exigée [V]. Les montants annoncés (2 G$ sur cinq ans, programme SCIP) sont [I] et à confirmer sur canada.ca.

### 4.3 CLOUD Act américain et droit canadien

- CLOUD Act (2018), 18 U.S.C. § 2713, adopté le 23 mars 2018 : il oblige les fournisseurs de services électroniques soumis à la juridiction américaine à produire les données en leur possession, leur garde ou leur contrôle, où qu'elles se trouvent [V, miroir Cornell LII ; DOJ].
- Conséquences :
  - une entreprise canadienne sans entité américaine, chez un prestataire sans entité américaine, n'est pas visée directement [I] ;
  - une filiale américaine d'un fournisseur étranger est visée [I] ;
  - un fournisseur européen sans entité américaine est en principe hors champ, mais un sous-traitant américain (infrastructure, support, télémétrie) réintroduit le risque [I].
- Cadre UE-États-Unis (décision d'adéquation de 2023) : le Tribunal de l'UE a rejeté le recours de M. Latombe le 3 septembre 2025 (T-553/23) ; un pourvoi est pendant (C-703/25 P) [V]. Statut à la date du jour : à confirmer.
- Nuance essentielle : les lois canadiennes et québécoises (mandats, ordonnances de production) s'appliquent aussi aux entreprises locales, et le droit français aux entreprises françaises [I, à confirmer]. « Souverain » désigne un contrôle juridique et opérationnel, non une immunité.

### 4.4 Acteurs de la souveraineté (état au 26 octobre 2026)

| Acteur | Positionnement vérifié | Hébergement annoncé | Certifications citées | Lecture pour Nexora |
|---|---|---|---|---|
| Cohere (Toronto) | Déploiement privé de modèles, avec NVIDIA (communiqué de mars 2026) [V] | Non précisé | Aucune | Concurrent direct sur le « souverain canadien » |
| Mistral (France) | Auto-hébergement par conteneurs et déploiement sur site sous contrat [I, documentation non lue] | UE pour l'API ; États-Unis pour certains modèles [V] | Non vérifié | Référence de la présente analyse |
| OVHcloud (France) | 46 centres sur quatre continents [V] ; le Canada n'est pas mentionné sur la page lue | Canada : à confirmer | SecNumCloud pour l'offre française (presse, septembre 2026) [I] | Partenaire d'infrastructure possible |
| ThinkOn (Toronto) | Plateforme infonuagique pour organismes publics canadiens [I, communiqué vendeur] | Québec non confirmé | Aucune citée | Concurrent potentiel en infonuagique souverain |
| Bell | Offre d'IA souveraine avec sites en Colombie-Britannique, en Saskatchewan et au Manitoba [I] | Aucun site québécois trouvé | Aucune citée | Grand concurrent sur les infrastructures |
| Telus | Projet d'infrastructure souveraine en Colombie-Britannique ; mention d'une « AI factory » à Rimouski [V pour le projet fédéral ; I pour Rimouski] | Rimouski : à confirmer | Aucune citée | Concurrent régional possible |

### 4.5 Formulations autorisées et formulations à éviter

| Formulation | Statut | Preuve à produire |
|---|---|---|
| « Hébergé au Québec » | Autorisée si vraie | Adresse du centre ; contrat avec clause de localisation ; localisation des sauvegardes, des journaux et des sous-traitants |
| « Vos données ne quittent pas votre infrastructure » (cas sur place) | Autorisée si vérifiée | Schéma des flux ; test de sortie réseau ; liste des flux sortants (mises à jour, licences) ; mode hors ligne testé |
| « Conçu pour faciliter votre conformité à la Loi 25 » | Autorisée | Gabarit d'entente de traitement ; modèle d'EFVP ; procédure d'incident |
| « Conforme à la Loi 25 » | À éviter | Aucune certification légale ne l'atteste |
| « 100 % souverain » | À éviter | Aucune définition légale ; dépendances étrangères possibles (poids de modèles, composants, matériel) |
| « Inviolable », « sans fuite de données » | À éviter | Garantie absolue ; risque au sens de la Loi sur la concurrence |
| « Numéro un » ou « #1 » | À éviter | Aucune source |
| « Vos données ne servent jamais à entraîner un modèle » | Autorisée si contractuelle | Clause écrite et procédure technique |

### 4.6 Risques de publicité

- **Loi sur la concurrence, article 74.01** : interdit la représentation fausse ou trompeuse sur un point important. Pour une personne morale : jusqu'à 10 M$ (première ordonnance) ou 15 M$ ensuite, ou trois fois l'avantage, ou 3 % du chiffre d'affaires mondial si l'avantage ne peut être déterminé [V, laws-lois.justice.gc.ca].
- **Loi sur la protection du consommateur (Québec)** : pratiques interdites de publicité trompeuse ; articles à confirmer. Affichage des prix et des taxes à vérifier [NV].
- **Charte de la langue française (Loi 96)** : publicités commerciales, sites et documents en français au Québec [I, article à confirmer].
- **LCAP (anti-pourriel)** : consentement exprès ou implicite pour les messages commerciaux électroniques, identification de l'expéditeur, désabonnement ; sanctions jusqu'à 10 M$ pour une personne morale [V, articles 6(1) et 20(4)].
- **Témoins et traceurs** : la Loi 25 exige une information et une désactivation par défaut des fonctions de profilage [I, article 8.1 à confirmer]. Le bandeau de témoins doit refléter ce choix.

---

## 5. Recherches en automatisation IA pour PME : fr-CA et fr-FR

### 5.1 Méthode et limites

- **Volumes** : non mesurés. Aucun outil de volume n'était disponible. Une suggestion vide ne signifie pas un faible volume.
- **Concurrence** : observée sur les huit premiers résultats par requête, à une seule date (26 octobre 2026). Beaucoup de résultats sont des pages d'agences : biais commercial.
- **Suggestions de saisie** : 6 requêtes testées, 4 vides ; aucune différence observée entre le Canada et la France.
- **Questions fréquentes (PAA) et recherches associées** : non observées (la page de résultats Google était inaccessible).
- **Lexique** : deux fiches de l'OQLF lues directement ; les autres termes viennent de résumés, à confirmer.

### 5.2 Grappes de mots-clés (volume non mesuré)

| # | Grappe | Mot-clé principal fr-CA | Variantes fr-FR | Intention | Page Nexora | Concurrence observée |
|---|---|---|---|---|---|---|
| 1 | Courriels automatisés | automatisation des courriels PME | automatisation des emails TPE | commerciale | /solutions/courriels/ | Élevée |
| 2 | Factures et comptes fournisseurs | facturation automatisée PME | facturation électronique IA TPE | informationnelle, commerciale | /solutions/factures/ | Élevée |
| 3 | Service client | service client intelligence artificielle PME | chatbot service client TPE | commerciale | /solutions/service-client/ | Élevée |
| 4 | Prise de rendez-vous | prise de rendez-vous automatique IA | prise de rendez-vous automatisée TPE | commerciale, transactionnelle | /solutions/rendez-vous/ | Moyenne à élevée |
| 5 | Comptabilité | comptabilité automatisée IA PME | logiciel comptable IA TPE | informationnelle | /solutions/comptabilite/ | Moyenne |
| 6 | CRM | CRM intelligence artificielle PME | CRM IA TPE | commerciale | /solutions/crm/ (à créer si pertinent) | Moyenne à élevée |
| 7 | Documents, extraction | extraction de données documents IA PME | OCR IA factures, extraction PDF IA | informationnelle, commerciale | /solutions/documents/ | Moyenne |
| 8 | Agents IA | agent IA PME | agent IA TPE | informationnelle, commerciale | /agents-ia/ | Élevée |
| 9 | n8n | n8n PME Québec | n8n TPE PME | informationnelle, commerciale | /ressources/guides/n8n-pme/ | Moyenne (QC), élevée (FR) |
| 10 | IA locale, serveur sur place | serveur IA sur place PME | IA locale entreprise, IA hors ligne | informationnelle, puis commerciale | /deploiement/sur-place/ | Faible à moyenne (QC) |
| 11 | ChatGPT en entreprise | ChatGPT en entreprise | ChatGPT RGPD entreprise | informationnelle (risque, politique) | /ressources/guides/chatgpt-entreprise/ | Élevée (FR), moyenne (QC) |
| 12 | Passerelle de modèles | passerelle IA modèles | passerelle IA LLM | informationnelle, B2B | /produits/passerelle/ | Faible (QC) ; ambiguïté avec « passerelle API » |
| 13 | VPS pour IA | VPS Québec IA | serveur virtuel IA France | transactionnelle | /produits/vps/ | Élevée (hébergeurs établis) |
| 14 | Souveraineté IA | IA souveraine Québec | IA souveraine PME France | informationnelle, commerciale | /souverainete/ | Moyenne à élevée |
| 15 | Loi 25 et IA | Loi 25 IA PME | RGPD IA PME | informationnelle | /souverainete/loi-25/ | Moyenne (institutions présentes) |

**Lecture (inférée)** : les opportunités les moins encombrées au Québec sont l'IA locale (le SERP mélange forums, formations et articles, sans vendeur dominant), la passerelle IA (à condition de lever l'ambiguïté avec « API ») et la page Loi 25 et IA. Les grappes agents IA, service client, VPS et ChatGPT en entreprise sont saturées, surtout en France.

**Priorité proposée** (non chiffrée) : 1) souveraineté et Loi 25 ; 2) IA locale ; 3) courriels et factures (cas d'usage à fort volume, concurrence élevée mais intention claire) ; 4) passerelle et VPS (pages techniques, volume probablement plus faible).

### 5.3 Questions fréquentes par thème (inférées des titres et suggestions)

- **Courriels** : comment trier sans perdre le contrôle ; l'IA peut-elle lire mes courriels en sécurité.
- **Factures** : comment l'IA extrait-elle les données d'une facture ; quelle est l'échéance de la facturation électronique en France (à vérifier : un contenu sponsorisé cite une date).
- **Service client** : un agent conversationnel peut-il remplacer mon équipe ; combien coûte-t-il pour une PME.
- **Rendez-vous** : comment réduire les rendez-vous manqués.
- **Comptabilité** : l'IA remplacera-t-elle le comptable.
- **Documents** : mes documents restent-ils au Québec.
- **Agents IA** : qu'est-ce qu'un agent IA pour une PME ; existe-t-il une aide pour former les employés (programme Activation IA observé, à vérifier).
- **IA locale** : peut-on faire tourner une IA sans internet ; quel matériel faut-il.
- **ChatGPT en entreprise** : peut-on utiliser des données clients ; faut-il bloquer l'outil.
- **Passerelle** : qu'est-ce qu'une passerelle de modèles ; peut-on changer de modèle sans tout réécrire.
- **Souveraineté** : qu'est-ce qu'une IA souveraine ; un hébergement au Canada suffit-il pour la Loi 25.

### 5.4 Écarts fr-CA et fr-FR à respecter

| Fr-CA | Fr-FR | Remarque |
|---|---|---|
| courriel | email, e-mail | Le terme québécois est recommandé par l'OQLF |
| PME | TPE, PME | PME est le terme général au Québec |
| infonuagique | informatique en nuage, cloud | Infonuagique est privilégié au Québec |
| Loi 25, renseignements personnels, CAI | RGPD, données personnelles, CNIL | Les cadres juridiques diffèrent |
| sur place | sur site | Usage constaté ; à confirmer |
| clavardage | messagerie instantanée | Terme recommandé par l'OQLF |

---

## 6. Cadres de rédaction et processus d'équipe marketing

### 6.1 Cadres

| Cadre | Origine (état de la vérification) | Principe | Pages recommandées | Exemple d'application pour Nexora (formulé pour ce rapport) |
|---|---|---|---|---|
| AIDA (attention, intérêt, désir, action) | Attribué à Elias St. Elmo Lewis (vers 1898) ; une étude de 2024 conteste cette attribution [V, résumé] | Quatre temps d'une accroche | Démonstration, tarifs | Accroche sur le gain de temps → trois bénéfices → un cas client chiffré, avec accord → « Planifier un diagnostic » |
| PAS (problème, amplification, solution) | Origine non établie ; sources secondaires contradictoires [NV] | Nommer le problème, en mesurer les coûts, présenter la solution | Pages cas d'usage, pages « problème » | Dossiers répartis dans plusieurs outils ; chaque recherche retarde une réponse ; Nexora réunit le dépôt, les dossiers et la base de connaissances |
| StoryBrand (Donald Miller) | Méthode publiée sous forme de cours ; étapes : personnage, problème, guide, plan, appel à l'action, issue [V, storybrand.com] | Le client est le héros ; la marque est le guide | Accueil, pages solutions | Héros : une directrice administrative. Problème : des documents éparpillés. Guide : Nexora. Plan : déposer, organiser, interroger. Action : créer un premier dossier |
| Jobs-to-be-done | Christensen, Hall, Dillon, Duncan, Harvard Business Review, septembre 2016 [V] | Le client « embauche » un produit pour une tâche précise | Titres des cas d'usage | « Retrouver la clause exacte avant la signature » plutôt que « moteur documentaire avancé » |

### 6.2 Processus recommandé, dans l'ordre

1. **Personas** : fondés sur des entretiens réels (cinq à huit par segment, estimation [I]). Livrable : au plus trois personas PME et une carte de tâches (JTBD). Méthode : Nielsen Norman Group, article daté du 3 octobre 2025 [V].
2. **Proposition de valeur** : Value Proposition Canvas de Strategyzer [V]. Livrable : un canvas par segment, validé avec trois clients ou prospects.
3. **Messages par page** : modèle de « maison de messages » (un message central, trois ou quatre piliers, preuves sous chaque pilier) [structure V ; origine NV]. Livrable : une maison par page clé.
4. **Preuves** : chiffres mesurés et datés ; études de cas nommées avec accord écrit ; certifications vérifiables. Livrable : registre de preuves avec source et date.
5. **Objections** : collecte dans les tickets de support, les notes d'appel et les sondages après achat [I]. Livrable : registre classé par fréquence, avec une réponse et une preuve par objection.
6. **FAQ** : Google a limité les résultats enrichis FAQ aux sites gouvernementaux et de santé en 2023. Un avis de retrait est daté du 8 mai 2026 ; la documentation aurait été retirée le 15 juin 2026 selon le sous-agent [V, à recouper : le texte source annonce une fin d'affichage au 7 mai]. Conséquence : la FAQ n'apporte plus de résultat enrichi, mais reste utile aux lecteurs et à la préparation des objections.
7. **Mesure et révision** : taux de clic des appels à l'action, conversion par page, nouvelles objections par mois ; révision trimestrielle du message de chaque page.

---

## 7. Ressources de design libres

### 7.1 Polices (licences lues sur les dépôts officiels [V] ; « dernière activité » = date du dernier commit visible)

| Police | Licence | Dernière activité | Usage suggéré | Remarque |
|---|---|---|---|---|
| Inter | SIL OFL 1.1 | 19 novembre 2024 | Corps de texte, interface | Proche du corps de Mistral ; accents à vérifier au rendu |
| Geist | SIL OFL 1.1 | 26 octobre 2026 | Titres et interface | Dépôt très actif ; français à tester |
| IBM Plex Sans et Plex Mono | SIL OFL 1.1 | 16 octobre 2026 | Corps et code | Famille complète |
| Space Grotesk | SIL OFL 1.1 | 2 septembre 2021 | Titres | Dépôt peu actif |
| Space Mono | SIL OFL 1.1 [I, à confirmer sur Google Fonts] | NV | Étiquettes techniques | Monospace que l'extraction attribue à Mistral |
| JetBrains Mono | SIL OFL 1.1 | 31 janvier 2025 | Code | Monospace de référence |
| DM Sans | SIL OFL | NV | Alternative pour le corps | DM Mono absente du dépôt |
| Public Sans | SIL OFL 1.1 | NV | Usage institutionnel | Dépôt sans maintenance active |

- **Police de Mistral** : la page marque ne cite aucune police [V]. L'extraction automatique propose ALTMistral pour les titres ; cette police est vraisemblablement propriétaire. Ne pas la copier.
- **Français** : les caractères é, è, ç, œ et « » n'ont pas été testés sur les fichiers ; à contrôler au rendu.

### 7.2 Bibliothèques

| Bibliothèque | Licence (lue sur le dépôt) | Version stable observée | Usage pour Nexora |
|---|---|---|---|
| Tailwind CSS | MIT | 4.3.3, publiée le 16 juillet 2026 | Base de style |
| shadcn/ui | MIT | CLI 4.22.1 (date NV) | Composants copiés dans le projet |
| Motion (ex-Framer Motion) | MIT | 14.6.0 (date NV) | Apparitions et transitions ; import depuis motion/react |
| GSAP | « Standard No Charge » (non MIT) | 3.15.0 (date NV) | Animations avancées ; usage commercial gratuit, avec restrictions à lire avant usage |
| Lenis | MIT | 1.3.27, publiée le 15 octobre 2026 | Défilement fluide ; à désactiver si la préférence de mouvement réduit est active |
| Radix UI | MIT | radix-ui 1.8.1 | Composants accessibles |
| Lucide | ISC | lucide-react 1.61.0 | Icônes |
| Heroicons | MIT | 2.2.0 | Icônes alternatives |

### 7.3 Effets et licences des exemples

- **MDN Web Docs** (dégradés CSS, défilement) : texte sous CC BY-SA 2.5 ou ultérieure ; exemples de code sous CC0 après 2010 ; citer « Mozilla Contributors » [V].
- **Hero Patterns** (motifs en grille) : CC BY 4.0, attribution à Steve Schoger [V].
- **Magic UI** (texte animé, défilement de logos) : MIT [V].
- **Bruit de fond** : filtre SVG feTurbulence (documenté par MDN) [I].

### 7.4 Accessibilité (WCAG 2.2)

- WCAG 2.2 est une recommandation du W3C publiée le 12 décembre 2024 [V].
- Contraste : 4,5:1 pour le texte normal, 3:1 pour le grand texte (critère 1.4.3, niveau AA) [V]. Vérifier chaque couleur de la maquette.
- Mouvement : tout défilement, clignotement ou mise à jour automatique doit pouvoir être mis en pause (critère 2.2.2, niveau A) [V]. Les logos défilants ont donc besoin d'un bouton pause.
- Préférence de mouvement réduit : `prefers-reduced-motion` n'est pas exigé en AA, mais il est fortement recommandé [I].

### 7.5 Direction visuelle proposée pour Nexora

Objectif : retrouver l'esprit de Mistral (sobriété, grands titres, blocs, contraste fort) sans reprendre son identité.

- **Fond et texte** : fond clair, légèrement chaud ; texte presque noir ; contrastes vérifiés au niveau AA.
- **Titres** : grand format, police géométrique ou grotesque sous licence libre (Geist, Inter Display ou Space Grotesk) ; police monospace pour les étiquettes techniques (IBM Plex Mono ou JetBrains Mono).
- **Motif de marque** : créer un motif propre à Nexora, par exemple une grille de carrés qui figure une frontière, celle du périmètre de données. Ne pas reprendre le motif pixel ni le chat de Mistral.
- **Couleurs** : palette de départ à valider : neutres, un accent unique, une couleur de succès ; contrastes à vérifier. Point de design à tester : éviter de reprendre le bleu et le blanc du drapeau québécois, qui peuvent évoquer le secteur public.
- **Grille** : sections pleine largeur, mosaïques de cas d'usage, grandes marges, appels à l'action répétés à intervalles réguliers.
- **Animation** : animations discrètes au défilement, désactivées avec la préférence de mouvement réduit ; aucun contenu essentiel dans une animation.
- **Illustrations** : diagrammes de flux (où vont les données) plutôt que photos d'archive ; c'est la preuve visuelle de la souveraineté.

---

## 8. Livrable 1 : personas et proposition de valeur

### 8.1 Personas

Les personas sont des hypothèses à valider par cinq à huit entretiens par segment. Les prénoms sont fictifs.

| Persona | Contexte | Objectif | Freins | Mots recherchés (fr-CA) | Page d'entrée |
|---|---|---|---|---|---|
| **Nathalie**, directrice administrative (PME de 30 à 150 employés, services) | Trop de courriels, de factures et de documents ; équipe réduite | Traiter plus vite sans embaucher ; réduire les erreurs | Données sensibles ; budget ; manque de temps | automatisation des courriels PME ; facturation automatisée PME | /solutions/courriels/ ; /solutions/factures/ |
| **Marc**, responsable TI (PME de 50 à 250 employés) | Intégrer l'IA au système existant | Contrôle, documentation, conformité | Dépendance à un fournisseur étranger ; compétences internes limitées | IA souveraine Québec ; Loi 25 IA PME | /souverainete/ ; /deploiement/ |
| **Julie**, propriétaire d'une clinique ou d'un cabinet (5 à 30 employés) | Appels manqués, rendez-vous annulés | Répondre à toute heure ; réduire les absences | Peur de déshumaniser le service ; budget modeste | prise de rendez-vous automatique IA | /solutions/rendez-vous/ |
| **Samuel** (persona secondaire), développeur ou agence web | Teste plusieurs modèles pour ses clients | Un point d'accès, des coûts prévisibles, des données contrôlées | Complexité ; enfermement chez un fournisseur ; latence | passerelle IA modèles ; VPS Québec IA | /produits/passerelle/ ; /produits/vps/ |

### 8.2 Proposition de valeur

**Énoncé** : pour les PME québécoises de 10 à 250 employés qui veulent automatiser des tâches répétitives (courriels, factures, service client, rendez-vous, documents) sans confier leurs données à des plateformes étrangères, Nexora installe et exploite des systèmes d'IA sur place ou hébergés au Québec, avec son logiciel WorkStudio. Contrairement aux abonnements infonuagiques et aux outils d'automatisation génériques, Nexora prend en charge la conception, l'installation et l'exploitation, et documente où circulent les données.

**Trois promesses** :
1. Un résultat sur un cas précis, en production, avant toute extension (délai à fixer après un pilote).
2. Un contrôle des données : lieu d'hébergement, flux et accès décrits et vérifiables.
3. Un partenaire qui exploite : installation, mises à jour, formation et transfert de compétences.

**Jobs-to-be-done** :
- répondre aux clients plus vite sans augmenter l'équipe ;
- retrouver l'information d'un dossier en quelques secondes ;
- garder le contrôle des données de l'entreprise ;
- tester des modèles sans multiplier les fournisseurs.

**Titres d'accueil à tester** (trois options) :
- « Votre IA, installée chez vous ou au Québec. »
- « Automatisez votre PME. Gardez vos données au Québec. »
- « La souveraineté, c'est savoir où vont vos données. »

### 8.3 Preuves à réunir avant publication

- Un schéma des flux de données pour chaque mode de déploiement (sur place, hébergé au Québec, hybride) ;
- une entente de traitement des données type, avec la clause de localisation ;
- la liste des sous-traitants et de leurs lieux d'hébergement ;
- une procédure d'incident conforme à la Loi 25 ;
- deux ou trois études de cas pilotes, avec accord écrit et chiffres mesurés (temps gagné, délai de réponse) ;
- une démonstration enregistrée du traitement d'un courriel ou d'une facture.

### 8.4 Objections principales (à traiter en FAQ et sur les pages concernées)

- « Mes données sortent-elles du Québec ? » : réponse par mode de déploiement, avec le détail des flux.
- « Entraînez-vous vos modèles avec nos données ? » : réponse contractuelle, uniquement si elle est vraie.
- « Nous n'avons pas de personnel technique. » : Nexora exploite le système ; la formation est optionnelle.
- « Que se passe-t-il si nous arrêtons ? » : export des configurations, des documents et des flux ; à prévoir dans le contrat.
- « Combien cela coûte-t-il ? » : estimation après diagnostic, avec ce qui est inclus et ce qui ne l'est pas.
- « L'IA va-t-elle remplacer nos employés ? » : elle prend les tâches répétitives ; la décision reste humaine (« le comptable garde la décision »).
- « Pourquoi ne pas utiliser ChatGPT en entreprise ? » : comparer les lieux d'hébergement, le contrôle et l'intégration, sans dénigrer le concurrent.
- « Avons-nous besoin d'un serveur puissant ? » : cela dépend du cas ; le diagnostic répond à la question.

---

## 9. Livrable 2 : arborescence proposée

### 9.1 fr-CA (version première)

```
/                                  Accueil
/solutions/                        Cas d'usage (hub)
  /solutions/courriels/
  /solutions/factures/
  /solutions/service-client/
  /solutions/rendez-vous/
  /solutions/comptabilite/
  /solutions/documents/
/agents-ia/                        Agents IA (définition, garde-fous)
/souverainete/                     Pilier : IA souveraine (définition et quatre couches)
  /souverainete/loi-25/            Loi 25 et IA (guide et limites)
/deploiement/                      Hub : options de déploiement
  /deploiement/sur-place/          Serveurs installés chez le client
  /deploiement/heberge-quebec/     Hébergement chez Nexora, au Québec
  /deploiement/hybride/            Combinaison (à confirmer selon l'offre)
/produits/                         Hub : offres
  /produits/workstudio/            Logiciel WorkStudio
  /produits/vps/                   Serveurs privés virtuels (VPS)
  /produits/passerelle/            Passerelle de modèles
  /produits/agents/                Agents hébergés
/methode/                          Méthode : du diagnostic à l'exploitation
/clients/                          Cas clients (hub)
  /clients/[cas]/                  Une page par cas, avec accord
/tarifs/                           Tarifs et estimation
/ressources/                       Hub
  /ressources/guides/              Guides (IA locale, ChatGPT en entreprise, n8n)
  /ressources/blogue/              Articles datés
/faq/                              Questions fréquentes
/centre-de-confiance/              Sécurité, entente de traitement, sous-traitants, lieux
/entreprise/                       À propos, équipe, valeurs
/contact/                          Contact et diagnostic
/connexion/                        Accès à la console (lien)
/mentions-legales/ ; /confidentialite/ ; /conditions/
/partenaires/                      Partenaires (optionnel)
```

### 9.2 en (ensuite)

Même arborescence, préfixe `/en/`, slugs en anglais : `/en/solutions/email/`, `/en/sovereignty/`, `/en/sovereignty/data-protection-law/`, `/en/deployment/on-premises/`, `/en/deployment/hosted-quebec/`, `/en/products/workstudio/`, `/en/products/vps/`, `/en/products/gateway/`, `/en/products/agents/`, `/en/method/`, `/en/customers/`, `/en/pricing/`, `/en/resources/`, `/en/faq/`, `/en/trust-center/`, `/en/company/`, `/en/contact/`.

Attention : la version anglaise doit être une adaptation, pas une traduction littérale. Le nom officiel de la Loi 25 reste en français.

### 9.3 Navigation principale (fr-CA)

« IA souveraine » (pilier) ; « Solutions » ; « Déploiement » ; « Produits » ; « Méthode » ; « Clients » ; « Tarifs » ; « Ressources » ; « Entreprise ». À droite : « Nous joindre » (bouton secondaire), « Planifier un diagnostic » (bouton principal), « Connexion » (lien texte).

Le pied de page reprend le centre de confiance, l'entente de traitement, les mentions légales et la politique de confidentialité, comme Mistral.

---

## 10. Livrable 3 : contenu par page (fr-CA)

« Principal » désigne le mot-clé à viser. « Non testé » signifie une proposition sans observation dans les résultats. Les volumes ne sont pas mesurés.

| Page | Objectif | Mot-clé principal | Messages clés | Appel principal / secondaire |
|---|---|---|---|---|
| / (Accueil) | Qualifier le visiteur et l'orienter vers un cas ou la souveraineté | automatisation IA PME Québec (non testé) | 1. Une IA qui travaille pour la PME. 2. Sur place ou au Québec. 3. Installée et exploitée par Nexora. | « Planifier un diagnostic » / « Voir les cas d'usage » |
| /solutions/ | Choisir son cas | solutions IA pour PME Québec (non testé) | Six cas, un par tâche répétitive ; même structure pour chacun | « Voir le cas » |
| /solutions/courriels/ | Trier et répondre plus vite | automatisation des courriels PME | Tri, brouillons sourcés, escalade vers une personne ; l'humain valide | « Demander une démonstration » / « Voir un cas client » |
| /solutions/factures/ | Extraire et valider des factures | facturation automatisée PME | Extraction, contrôle, export vers la comptabilité ; l'humain approuve | « Planifier un diagnostic » / « Voir comment ça marche » |
| /solutions/service-client/ | Répondre à toute heure, avec transfert humain | service client intelligence artificielle PME | Réponses sourcées, transfert, historique ; garde-fous | « Planifier un diagnostic » / « Voir la démonstration » |
| /solutions/rendez-vous/ | Réduire les absences | prise de rendez-vous automatique IA | Prise de rendez-vous, rappels, annulations ; agenda de l'entreprise | « Demander une démonstration » / « Voir un cas client » |
| /solutions/comptabilite/ | Pré-saisie et rapprochement | comptabilité automatisée IA PME | Pré-saisie, rapprochement, contrôle ; le comptable garde la décision | « Planifier un diagnostic » / « Lire le guide » |
| /solutions/documents/ | Retrouver et extraire l'information | extraction de données documents IA PME | Lecture de documents, recherche sourcée, base de connaissances | « Planifier un diagnostic » / « Voir un exemple » |
| /agents-ia/ | Expliquer un agent IA simplement | agent IA PME | Définition en une phrase ; ce qu'il fait ; ses limites ; ses garde-fous | « Voir les cas d'usage » / « Planifier un diagnostic » |
| /souverainete/ | Pilier de confiance | IA souveraine Québec | Définition ; quatre couches de contrôle (données, modèles, calcul, exploitation) ; preuves | « Lire le centre de confiance » / « Planifier un diagnostic » |
| /souverainete/loi-25/ | Expliquer les obligations et l'aide de Nexora | Loi 25 IA PME | Ce que la loi exige ; EFVP ; incidents ; ce que Nexora fournit ; ce qui reste à l'entreprise | « Télécharger le modèle d'EFVP » (à créer) / « Parler à un expert » |
| /deploiement/ | Comparer les trois modes | déploiement IA PME Québec (non testé) | Sur place, hébergé au Québec, hybride : qui contrôle quoi | « Choisir un mode » |
| /deploiement/sur-place/ | Serveurs chez le client | serveur IA sur place PME | Matériel, installation, flux locaux, mises à jour contrôlées | « Planifier un diagnostic » / « Voir le schéma des flux » |
| /deploiement/heberge-quebec/ | Hébergement chez Nexora | IA hébergée au Québec | Lieu exact, sauvegardes, accès, sous-traitants | « Voir le centre de confiance » / « Planifier un diagnostic » |
| /produits/ | Carte des offres | produits IA PME Québec (non testé) | Quatre offres, une phrase chacune | Cartes cliquables |
| /produits/workstudio/ | Construire, déployer et gouverner des agents | plateforme d'agents IA PME (non testé) | Concevoir, connecter, déployer, contrôler, améliorer | « Demander une démonstration » / « Voir la documentation » |
| /produits/vps/ | Serveur pour agents et modèles | VPS Québec IA | Lieu, prix avec renouvellement affiché, cas d'usage, sauvegardes | « Choisir un serveur » / « Parler à un expert » |
| /produits/passerelle/ | Un point d'accès à plusieurs modèles | passerelle IA modèles | Catalogue au format par million de jetons, bascule, politiques de données | « Créer un compte » / « Voir le catalogue » |
| /produits/agents/ | Agents hébergés | agents IA hébergés au Québec (non testé) | Agent prêt à l'emploi, supervisé, avec journal | « Demander un agent » |
| /methode/ | Montrer le parcours | accompagnement IA PME (non testé) | 1. Diagnostic. 2. Cas prioritaire en production. 3. Déploiement. 4. Exploitation et transfert. | « Planifier un diagnostic » |
| /clients/ | Preuves | clients IA PME Québec (non testé) | Cas quantifiés, avec accord écrit | « Lire une étude de cas » |
| /tarifs/ | Transparence | prix automatisation IA PME (non testé) | Ce qui est inclus, ce qui ne l'est pas, renouvellements, taxes | « Obtenir une estimation » |
| /ressources/guides/ia-locale/ | Capter la recherche informationnelle | IA locale entreprise | Matériel, coûts, sécurité, comparaison des options | « Télécharger le guide » / « Planifier un diagnostic » |
| /ressources/guides/chatgpt-entreprise/ | Modèle de politique d'usage | ChatGPT en entreprise | Risques, choix, politique type, outils alternatifs | « Télécharger le modèle » |
| /ressources/guides/n8n-pme/ | Intégrations | n8n PME Québec | Connexions, hébergement, limites | « Voir les intégrations » |
| /faq/ | Lever les objections | questions IA PME (non testé) | Les huit objections de la section 8.4 | « Poser une question » |
| /centre-de-confiance/ | Preuves de sécurité | sécurité données IA PME (non testé) | Lieux, sous-traitants, entente de traitement, procédure d'incident, journaux | « Demander l'entente de traitement » |
| /entreprise/ | Crédibilité | Nexora (marque) | Mission, équipe, valeurs, engagements | « Nous joindre » |
| /contact/ | Conversion | diagnostic IA PME (non testé) | Ce qui se passe après le formulaire : délai, personne, préparation | « Envoyer » |

---

## 11. Livrable 4 : charte de ton et lexique

### 11.1 Principes de ton

1. **Savant et clair** : chaque terme technique est défini une fois, en une phrase, à son premier usage.
2. **Phrases courtes dans les accroches**, plus longues dans les pages techniques ; titres de 3 à 7 mots ; point final sur les accroches (repris du style Mistral).
3. **« Nous » pour Nexora, « vous » pour le client**, vouvoiement partout.
4. **Une promesse par page**, prouvée dans le corps de la page.
5. **Verbes d'action** à l'impératif pour les étapes (« Installer », « Vérifier », « Exploiter »).
6. **Chiffres datés et sourcés**, jamais de superlatif.
7. **Typographie française** : espaces insécables avant : ; ? ! et à l'intérieur des guillemets « ».

### 11.2 Termes à employer (fr-CA)

| Terme | Usage | Source ou statut |
|---|---|---|
| courriel | Messagerie électronique | Recommandé par l'OQLF |
| infonuagique | Informatique en nuage | Recommandé par l'OQLF ; « cloud » seulement dans les mots-clés |
| clavardage | Messagerie instantanée | Recommandé par l'OQLF |
| agent conversationnel | Assistant qui dialogue | Recommandé par l'OQLF ; une autre fiche diverge, à trancher |
| IA générative | IA qui crée du contenu | Recommandé par l'OQLF (« intelligence artificielle générative ») |
| grand modèle de langage (LLM) | Modèle de langage à grande échelle | OQLF ; abréviation à définir au premier usage |
| jeton | Unité de texte traitée par un modèle | Fiche OQLF (2025) |
| invite | Instruction donnée à un modèle | OQLF ; FranceTerme diverge |
| flux de travaux | Enchaînement automatisé de tâches | Recommandé (CELF) ; remplace « workflow » |
| passerelle de modèles | Point d'accès unique à plusieurs modèles | Équivalent de « gateway » ; à définir |
| serveur privé virtuel (VPS) | Serveur virtuel dédié | Usage observé ; « serveur virtuel » a un autre sens à l'OQLF |
| renseignements personnels | Données personnelles au sens de la Loi 25 | Terme juridique québécois |
| automatisation des processus | Automatisation | Fiche OQLF observée |
| sur place | Chez le client | Usage observé ; « sur site » en France |

### 11.3 Termes à éviter ou à employer avec précaution

| À éviter | Remplacer par | Raison |
|---|---|---|
| cloud (dans les titres), stockage dans le cloud | infonuagique | OQLF |
| email, e-mail | courriel | Usage français |
| workflow | flux de travaux | CELF |
| dashboard | tableau de bord | Anglicisme |
| onboarding | accueil, intégration | Anglicisme |
| lead | prospect | Anglicisme |
| ROI | retour sur investissement | Clarté |
| SLA (seul) | niveau de service (SLA) | Définir au premier usage |
| on-prem, VPC (seuls) | sur place ; « réseau privé virtuel » seulement avec explication (en France, ce terme désigne un VPN) | Clarté |
| données personnelles (au Québec) | renseignements personnels | Terme légal |
| TPE (au Québec) | petite entreprise, PME | TPE est un terme français |
| sur site (au Québec) | sur place | Usage québécois |
| prompt (seul) | invite | OQLF |
| #1, numéro un, leader | à retirer | Aucune source |
| magique, révolutionnaire, disruptif | à retirer | Vide de contenu |
| frontier, powerhouse, compounding | à retirer | Marqueurs de Mistral |

### 11.4 Affirmations à éviter ou à conditionner

| Affirmation | Règle |
|---|---|
| « conforme à la Loi 25 » | Remplacer par « conçu pour faciliter votre conformité à la Loi 25 » |
| « 100 % souverain », « inviolable », « sans fuite de données » | Interdit |
| « aucune donnée ne quitte le Québec » | Seulement si la configuration le prouve, avec le mode de déploiement précisé |
| « vos données ne servent jamais à entraîner un modèle » | Seulement si la clause est signée |
| « garanti », « résultat assuré » | Interdit ; utiliser « objectif mesuré pendant le pilote » |
| « gratuit » (diagnostic) | Seulement si Nexora le fournit à titre gratuit |
| Prix et taxes | Préciser avant ou après taxes ; à valider au regard de la Loi sur la protection du consommateur |

---

## 12. Points à vérifier avant publication

1. Lire les articles 3.1, 3.5 à 3.8, 8.1, 12.1, 17, 90.12 et 91 de la LPRPSP sur LégisQuébec (non lus à ce jour).
2. Confirmer la politique de localisation et la liste des sous-traitants de Nexora : chaque affirmation de la section 4.5 doit correspondre à une réalité.
3. Vérifier le statut du projet de loi C-36 et du pourvoi C-703/25 P.
4. Trancher le conflit lexical sur « agent conversationnel » (deux fiches OQLF).
5. Recouper les dates de retrait des résultats enrichis FAQ de Google (7 mai ou 15 juin 2026).
6. Contrôler les couleurs et polices de Mistral dans le code source (outils de développement) : l'extraction automatique est indicative.
7. Mesurer les volumes de recherche avec un outil payant ou le Planificateur de mots clés de Google Ads, après création du compte par Nexora. Ces volumes conditionnent la priorité des pages.
8. Revérifier les prix, les avis et le nombre de modèles de Hostinger et d'OpenRouter à la date de publication.
9. Faire valider les textes juridiques par un avocat québécois.

---

## 13. Sources (consultées le 26 octobre 2026)

**Mistral AI** (lues directement) : https://mistral.ai/ ; https://mistral.ai/fr/ ; https://mistral.ai/sovereign-ai/ ; https://mistral.ai/products/ ; https://mistral.ai/products/studio/ ; https://mistral.ai/cloud/inference/ ; https://mistral.ai/our-method/ ; https://mistral.ai/pricing/ ; https://mistral.ai/brand/

**Hostinger** : https://www.hostinger.com/vps-hosting ; https://www.hostinger.com/pricing/vps-hosting ; https://www.hostinger.com/fr/vps

**OpenRouter** : https://openrouter.ai/ ; https://openrouter.ai/models ; https://openrouter.ai/docs/quickstart ; https://openrouter.ai/pricing ; https://openrouter.ai/business/eu ; https://openrouter.ai/docs/guides/privacy/provider-logging

**Souveraineté et droit** :
- Assemblée nationale du Québec, projet de loi 64 : https://www.assnat.qc.ca/fr/travaux-parlementaires/projets-loi/projet-loi-64-42-1.html
- Gouvernement du Québec, entrée en vigueur de la Loi 25 (22 septembre 2023) : https://www.quebec.ca/nouvelles/actualites/details/entree-en-vigueur-des-nouvelles-dispositions-de-la-loi-25-50723
- Commission d'accès à l'information : https://www.cai.gouv.qc.ca/entreprises/loi-25
- LEGISinfo : C-27 https://www.parl.ca/legisinfo/en/bill/44-1/c-27 ; C-36 https://www.parl.ca/legisinfo/en/bill/45-1/c-36
- ISDE, appel de centres de données IA souverains : https://ised-isde.canada.ca/site/ised/en/node/718
- Gouvernement du Canada, projet TELUS (11 mai 2026) : https://www.canada.ca/en/innovation-science-economic-development/news/2026/05/government-of-canada-and-telus-advance-work-to-build-sovereign-ai-infrastructure.html
- CLOUD Act, 18 U.S.C. § 2713 (miroir) : https://www.law.cornell.edu/uscode/text/18/2713 ; DOJ : https://www.justice.gov/criminal/cloud-act-resources
- Loi sur la concurrence, article 74.1 : https://laws-lois.justice.gc.ca/eng/acts/c-34/section-74.1.html
- LCAP, article 20 : https://laws-lois.justice.gc.ca/eng/acts/e-1.6/section-20.html
- Cohere, communiqué du 16 mars 2026 : https://cohere.com/blog/cohere-sovereign-ai-nvidia
- OVHcloud, infrastructure mondiale : https://www.ovhcloud.com/en/about-us/global-infrastructure
- ThinkOn : https://thinkon.com

**Mots-clés et lexique** : Office québécois de la langue française, Grand dictionnaire terminologique : https://gdt.oqlf.gouv.qc.ca (fiches « agent conversationnel » et « dialogueur » lues directement ; autres termes via résumés de recherche). Suggestions de saisie et résultats de recherche : Firecrawl, 26 octobre 2026.

**Cadres et processus** :
- StoryBrand : https://storybrand.com/ ; https://storybrand.com/wp-content/uploads/2016/01/HowToTellAStory-2.pdf
- Harvard Business Review, « Know Your Customers' "Jobs to Be Done" » (septembre 2016) : https://hbr.org/2016/09/know-your-customers-jobs-to-be-done
- Nielsen Norman Group, personas : https://www.nngroup.com/articles/persona/
- Strategyzer, Value Proposition Canvas : https://www.strategyzer.com/library/the-value-proposition-canvas
- Google, données structurées FAQ : https://developers.google.com/search/docs/appearance/structured-data/faqpage ; mises à jour : https://developers.google.com/search/updates

**Design** :
- Polices (dépôts officiels) : https://github.com/rsms/inter ; https://github.com/vercel/geist-font ; https://github.com/floriankarsten/space-grotesk ; https://github.com/IBM/plex ; https://github.com/googlefonts/dm-fonts ; https://github.com/JetBrains/JetBrainsMono ; https://github.com/uswds/public-sans
- Bibliothèques : https://github.com/tailwindlabs/tailwindcss ; https://github.com/shadcn-ui/ui ; https://github.com/motiondivision/motion ; https://gsap.com/licensing/ ; https://github.com/darkroomengineering/lenis ; https://github.com/radix-ui/primitives ; https://github.com/lucide-icons/lucide ; https://github.com/tailwindlabs/heroicons
- Effets : https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license ; https://heropatterns.com/ ; https://github.com/magicuidesign/magicui
- Accessibilité : https://www.w3.org/TR/WCAG22/ ; https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion

---

*Rapport rédigé le 26 octobre 2026. Aucun fichier autre que ce rapport n'a été créé ni modifié, et aucun paquet n'a été installé.*
