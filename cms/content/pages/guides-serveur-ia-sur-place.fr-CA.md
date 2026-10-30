# Serveur d'IA sur place — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-serveur-ia-sur-place.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-serveur-ia-sur-place` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/guides/serveur-ia-sur-place/` · slug : `guides/serveur-ia-sur-place`
- Titre SEO (48 caractères) : Serveur d'IA sur place : décider avant d'acheter
- Description SEO (150 caractères) : Les cinq décisions avant d'acheter un serveur d'IA sur place : usagers, documents, modèle, outils, sauvegardes. Ce qui reste chez vous et ce qui sort.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : les décisions à prendre avant d'acheter un serveur d'IA sur place, sans prix ni dimensionnement. · Affirmations : CL-82, CL-80*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · IA sur place**

# Un serveur d'IA sur place : décider avant d'acheter.

Cinq décisions, ce qui reste chez vous, ce qui sort, et qui fait quoi. Le matériel s'établit au diagnostic, avant tout achat : aucun prix ni dimensionnement n'est publié ici.

[Voir le déploiement sur place](/deploiement/sur-place/) · [Demander une étude](/contact/?sujet=etude-deploiement)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : le matériel dépend du cas et se décide au diagnostic ; un petit modèle ne suffit pas toujours. · Affirmations : CL-82, CL-83, CL-80*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Le matériel nécessaire dépend du nombre d'utilisateurs, du volume de documents, du modèle choisi et des usages ; il est établi au diagnostic, avant tout achat. Un petit modèle local ne suffit pas toujours pour les agents qui appellent des outils. Aucun prix ni dimensionnement n'est publié : ils dépendent de votre cas.

Un serveur d'IA sur place est un serveur installé chez vous, qui exécute le système d'IA et garde vos documents sur votre site.

### Bloc 3 — Cartes (`block_cards`)

*Les cinq décisions, dans l'ordre où on les prend. · Affirmations : CL-82, CL-83, CL-26*

Réglages : `columns=4`, `tone=sable`, `layout=etapes`, `anchor_id=decisions`

## Les cinq décisions.

Chacune change le matériel. Le diagnostic les tranche avec vous.

#### Les usagers.

Combien de personnes s'en servent, et en même temps ?

#### Les documents.

Quel volume, quels formats, et faut-il lire des PDF scannés ou transcrire de la voix ?

#### Le modèle.

Un modèle plus capable demande plus de mémoire. Un petit modèle ne suffit pas toujours pour des agents à outils.

#### Les outils.

Que doivent pouvoir faire les agents : lire, écrire, envoyer ?

#### Les sauvegardes.

Où, à quelle fréquence, et qui restaure ?

### Bloc 4 — Section (`block_section`)

*Ce qui reste chez vous et ce qui sort : flux sortants à lister, jamais de bascule silencieuse. · Affirmations : CL-77, CL-76, CL-E01, CL-06*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=flux`

## Ce qui reste, ce qui sort.

Sur place, vos données restent sur votre serveur. Nexora AI n'y accède que si vous l'autorisez par écrit, pour une tâche précise et limitée dans le temps, et chaque accès est journalisé.

Installer le système sur votre serveur n'équivaut pourtant pas à n'avoir aucun flux sortant. Les mises à jour, les licences et un éventuel modèle externe sont listés avant la mise en service. Aucun appel à un service d'IA externe n'est configuré sans votre activation explicite, consignée par écrit, et le système ne bascule jamais en silence vers un modèle externe, par exemple en cas de panne d'un modèle local.

### Bloc 5 — Cartes (`block_cards`)

*Qui fait quoi : le client, Nexora AI. · Affirmations : CL-72, CL-04, CL-81*

Réglages : `columns=2`, `tone=clair`, `layout=grille`, `anchor_id=qui-fait-quoi`

## Qui fait quoi.

#### Vous.

Le matériel, les accès et les sauvegardes vous appartiennent. Vous nommez la personne qui valide les actions.

#### Nexora AI.

Elle installe et configure le système, puis l'exploite avec vous et le fait évoluer. L'exploitation se convient au contrat.

### Bloc 6 — Section (`block_section`)

*Installation en une commande : WorkStudio, Docker défini, choix du modèle, sauvegarde, restauration, mise à jour. · Affirmations : CL-26, CL-88*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=installation`

## Installation en une commande.

WorkStudio s'installe en une commande sur un serveur Docker, Linux ou macOS, d'architecture amd64 ou arm64. Docker est un outil qui empaquette les logiciels pour qu'ils s'installent de la même façon partout.

L'installateur propose un modèle local ou un service tiers compatible avec le format d'OpenAI, génère les secrets sur la machine et installe des commandes de sauvegarde, de restauration et de mise à jour. Voir [WorkStudio](/workstudio/) et l'[installation de serveurs d'IA](/services/installation-serveurs-ia/).

### Bloc 7 — Cartes (`block_cards`)

*Limites : niveau de service, modèle local, voix et documents, absence de réseau. · Affirmations : CL-86, CL-83, CL-82, CL-77*

Réglages : `columns=2`, `tone=clair`, `layout=modules`, `anchor_id=limites`

## Limites à connaître.

#### Aucun niveau de service.

La disponibilité et les délais de réponse se précisent au contrat.

#### Le modèle local a ses limites.

Un petit modèle ne suffit pas toujours pour les agents qui appellent des outils : le modèle se choisit avec le cas.

#### Voix et documents.

La lecture de documents et la voix demandent des modèles supplémentaires, donc plus de matériel.

#### Hors ligne non garanti.

Le fonctionnement sans réseau n'est pas garanti : mises à jour et licences ont des flux sortants.

### Bloc 8 — FAQ (`block_faq`)

*Questions du guide : serveur puissant, sans internet, matériel, prix, responsabilité. · Affirmations : CL-82, CL-83, CL-77, CL-10, CL-72, CL-86, CL-E01, CL-80*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Serveur d'IA sur place : vos questions.

#### Faut-il un serveur puissant pour faire tourner une IA dans une PME ?

Cela dépend du cas : nombre d'utilisateurs, volume de documents, modèle choisi et usages. Le diagnostic établit le matériel nécessaire avant tout achat.

#### Peut-on faire tourner une IA sans internet ?

En partie. Installer le système sur votre serveur n'équivaut pas à un fonctionnement hors ligne garanti : les mises à jour, les licences et un modèle externe éventuel sont des flux sortants, listés avant la mise en service.

#### Un petit modèle local suffit-il ?

Pas toujours. Un petit modèle local suffit pour certaines tâches, mais pas toujours pour les agents qui appellent des outils. Le modèle se choisit avec le cas.

#### Combien coûte un serveur d'IA sur place ?

Il n'y a pas encore de prix public. Une estimation écrite suit le diagnostic et dit ce qui est inclus et ce qui ne l'est pas. Aucune grille de matériel n'est publiée, car le matériel dépend de votre cas.

#### À qui appartiennent le matériel et les données ?

À vous : le matériel, les accès et les sauvegardes vous appartiennent, et vos données restent sur votre serveur. Nexora AI installe, configure et exploite avec vous.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : étude de déploiement sur place. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Commençons par le diagnostic.

Dites-nous vos usagers, vos documents et vos usages. Nous établissons le matériel avec vous avant tout achat.

[Demander une étude](/contact/?sujet=etude-deploiement) · [Déploiement sur place](/deploiement/sur-place/)
