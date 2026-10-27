# Installation de serveurs d'IA — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `services-installation-serveurs-ia.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `services-installation-serveurs-ia` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/services/installation-serveurs-ia/` · slug : `services/installation-serveurs-ia`
- Titre SEO (38 caractères) : Installation de serveurs d'IA pour PME
- Description SEO (156 caractères) : Nexora installe et configure votre serveur d'IA chez vous ou dans son infrastructure au Québec, puis l'exploite avec vous. Matériel dimensionné avant achat.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du service d'installation. · Affirmations : CL-81, CL-05*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Services · Installation**

# Un serveur d'IA installé. Un périmètre écrit.

Nous installons, configurons et exploitons avec vous le serveur qui fait tourner vos agents et vos modèles : chez vous, ou dans notre infrastructure au Québec. Le périmètre vous est remis par écrit avant la mise en service.

[Demander une étude de déploiement](/contact/?sujet=etude-deploiement) · [Comparer les deux modes](/deploiement/)

### Bloc 2 — Section (`block_section`)

*Définition du serveur d'IA et des deux voies. · Affirmations : CL-81, CL-02, CL-13*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=deux-voies`

## Deux voies, une méthode.

Un serveur d'IA est une machine qui exécute les modèles (les moteurs qui produisent les réponses) et les agents. Ce peut être un serveur physique, ou un serveur privé virtuel (VPS), c'est-à-dire un serveur loué rien que pour vous.

La méthode est la même dans les deux cas : on dimensionne, on installe, on configure, on vérifie les flux, on forme, puis on exploite.

- **Chez vous.** Dans vos locaux ou chez l'hébergeur de votre choix. Le matériel et les accès sont à vous.
- **Chez nous, au Québec.** Dans notre infrastructure, où nous l'exploitons. Vous n'achetez ni serveur ni matériel.

### Bloc 3 — Cartes (`block_cards`)

*Six étapes, de l'étude à l'exploitation. · Affirmations : CL-81, CL-26, CL-88, CL-104, CL-05, CL-04*

Réglages : `columns=3`, `tone=sable`, `layout=etapes`, `anchor_id=etapes`

## De l'étude à l'exploitation.

#### 1. Dimensionner.

Nombre d'utilisateurs, volume de documents, modèle choisi : le diagnostic fixe ce qu'il faut, avant tout achat.

#### 2. Installer.

WorkStudio s'installe en une commande sur un serveur Docker (un outil qui empaquette les logiciels pour les installer proprement), sous Linux ou macOS. Les secrets sont générés sur la machine ; des commandes de sauvegarde, de restauration et de mise à jour sont posées.

#### 3. Configurer.

Organisation, comptes et rôles, connexion unique avec votre fournisseur d'identité, choix du modèle, connexions à vos logiciels.

#### 4. Vérifier.

Nous dressons la liste de ce qui sort du réseau et nous vous remettons le schéma des flux. Puis nous testons un cas réel, avec vos validations.

#### 5. Former.

Votre équipe apprend à superviser, à corriger et à décider, pas à programmer.

#### 6. Exploiter.

Mises à jour, sauvegardes, surveillance et évolution : ce que nous faisons et ce que vous faites est écrit au contrat.

### Bloc 4 — Cartes (`block_cards`)

*Facteurs de dimensionnement, sans valeur inventée. · Affirmations : CL-82, CL-83, CL-102*

Réglages : `columns=2`, `tone=sombre`, `layout=modules`, `anchor_id=dimensionnement`

## Ce qui fait varier le matériel.

Nous ne donnons pas de configuration type : elle dépend de ces quatre facteurs, que le diagnostic mesure avant tout achat.

#### Le nombre d'utilisateurs.

Combien de personnes interrogent le système en même temps, et à quelles heures.

#### Le volume de documents.

Il détermine la taille de la base de connaissances et le temps d'indexation.

#### Le modèle choisi.

Un modèle sur votre serveur demande du matériel plus puissant qu'un modèle externe. Un petit modèle local ne suffit pas toujours pour les agents qui appellent des outils : le choix se fait au diagnostic.

#### Les usages.

Lire des documents scannés ou transcrire des enregistrements demande des modèles supplémentaires, donc de la mémoire et du temps de calcul.

### Bloc 5 — Section (`block_section`)

*Ce que nous installons : WorkStudio et ses composants. · Affirmations : CL-26, CL-27, CL-103, CL-24, CL-88*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=composants`

## Ce que nous installons.

L'installation réunit la plateforme [Nexora WorkStudio](/workstudio/) et les services dont elle a besoin.

- **WorkStudio.** Le studio où se conçoivent et se pilotent agents et flux de travaux.
- **Une passerelle de modèles.** Un point d'accès unique à plusieurs modèles d'IA, au format OpenAI, avec clés, quotas et mesure de la consommation.
- **Nexora Connect.** Le moteur de connecteurs qui relie vos services (messagerie, agenda, stockage, facturation).
- **Des services optionnels.** Détection locale des renseignements personnels, voix locale (transcription, synthèse vocale), lecture de documents scannés.
- **Des commandes d'exploitation.** Démarrer, arrêter, journaliser, sauvegarder, restaurer, mettre à jour.

### Bloc 6 — Cartes (`block_cards`)

*Ce que nous ne promettons pas, pour ce service. · Affirmations : CL-10, CL-14, CL-86, CL-77*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=limites`

## Ce que nous ne promettons pas.

#### Aucun prix public.

Une estimation écrite suit le diagnostic.

#### Aucun délai universel.

La durée dépend de votre cas et se mesure sur un premier cas.

#### Aucun niveau de service annoncé.

Disponibilité et délais de réponse se précisent au contrat.

#### Aucun flux sortant n’est présumé nul.

Mises à jour, licences, modèle externe éventuel : tout est listé avant la mise en service.

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à l'installation. · Affirmations : CL-26, CL-81, CL-82, CL-08*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Installation : vos questions.

#### Faut-il acheter un serveur puissant ?

Cela dépend du cas. Le diagnostic répond à cette question avant tout achat : il tient compte du nombre d'utilisateurs, du volume de documents et du modèle choisi.

#### Peut-on l'installer sur un serveur existant ?

Il faut un serveur Linux ou macOS qui fait tourner Docker. Nous vérifions au diagnostic qu’il convient aux usages prévus.

#### Qui exploite ensuite ?

Nous, avec vous, selon ce que le contrat prévoit. Dans le mode sur place, les accès que vous nous donnez sont convenus à l'avance.

#### Peut-on changer de mode plus tard ?

L'exportation de vos documents, de vos configurations et de vos flux de travaux est prévue au contrat. Un changement de mode se planifie alors comme un projet.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : étude de déploiement. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Dimensionnons avant d'acheter.

Décrivez-nous vos usages. Nous vous disons quel mode convient, ce qu'il faudrait comme matériel s'il y a lieu, et par où commencer.

[Demander une étude de déploiement](/contact/?sujet=etude-deploiement) · [Voir le mode sur place](/deploiement/sur-place/)
