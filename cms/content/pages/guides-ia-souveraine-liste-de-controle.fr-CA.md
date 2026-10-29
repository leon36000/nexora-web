# IA souveraine : liste de contrôle — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-ia-souveraine-liste-de-controle.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-ia-souveraine-liste-de-controle` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/guides/ia-souveraine-liste-de-controle/` · slug : `guides/ia-souveraine-liste-de-controle`
- Titre SEO (46 caractères) : IA souveraine : la liste de contrôle d'une DSI
- Description SEO (154 caractères) : Quatre couches de contrôle, douze questions, les preuves à demander et les pièges : la liste de contrôle d'une DSI pour juger une IA souveraine au Québec.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : une liste de contrôle pour une DSI, avec la définition de travail de la souveraineté. · Affirmations : CL-70, CL-71, CL-75*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · IA souveraine**

# IA souveraine : la liste de contrôle d'une DSI.

Quatre couches de contrôle, les questions qui comptent, les preuves à demander et les pièges. Une définition de travail, sans valeur légale, qui vaut aussi pour juger Nexora AI.

[Voir la souveraineté chez Nexora AI](/souverainete/) · [Étude de déploiement](/contact/?sujet=etude-deploiement)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : la définition de travail en quatre couches, sans valeur légale. · Affirmations : CL-70, CL-71, CL-75*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

On parle d'IA souveraine quand on sait où elle tourne et où vont les données. Nexora AI la décrit par quatre couches de contrôle : les données, les modèles, le calcul et l'exploitation. C'est une définition de travail, sans valeur légale : aucune définition légale de « souverain » n'existe, et un serveur au Québec n'écarte pas, à lui seul, les lois qui s'appliquent.

Une DSI (direction des systèmes d'information) peut s'en servir comme grille, pour Nexora AI comme pour tout autre fournisseur.

### Bloc 3 — Cartes (`block_cards`)

*Les quatre couches de contrôle, une question directrice par couche. · Affirmations : CL-70, CL-71*

Réglages : `columns=4`, `tone=sable`, `layout=grille`, `anchor_id=couches`

## Les quatre couches.

#### Les données.

Où sont-elles stockées, qui y accède, et que devient une sauvegarde ?

#### Les modèles.

Qui les exécute, avec quelle licence, et peuvent-ils être remplacés ?

#### Le calcul.

Sur quel matériel et dans quel pays les requêtes sont-elles traitées ?

#### L'exploitation.

Qui administre le système, avec quels accès, et lesquels sont journalisés ?

### Bloc 4 — Section (`block_section`)

*Liste de contrôle : douze questions, trois par couche, sous forme de liste. · Affirmations : CL-70, CL-E08, CL-E05, CL-76, CL-77*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=questions`

## Les questions qui comptent.

<h3>Les données</h3>- Où sont stockés les fichiers, les sauvegardes et les journaux ?
- Le fournisseur peut-il lire mes données, et dans quelles conditions ?
- Mes données servent-elles à entraîner un modèle, par défaut ou sur activation ?
<h3>Les modèles</h3>- Quels modèles sont utilisés, et sous quelle licence ?
- Un appel à un modèle externe est-il possible, et qui l'active ?
- Le système peut-il basculer en silence vers un autre modèle en cas de panne ?
<h3>Le calcul</h3>- Où le traitement a-t-il lieu : pays, hébergeur, matériel ?
- Quels flux sortants existent (mises à jour, licences, télémétrie) ?
- Le système fonctionne-t-il sans accès à l'extérieur, et jusqu'où ?
<h3>L'exploitation</h3>- Qui administre, avec quels accès, et chaque accès est-il journalisé ?
- Quels sous-traitants interviennent, dans quel pays, pour quel rôle ?
- Que se passe-t-il à la fin du contrat : exportation, suppression ?

### Bloc 5 — Section (`block_section`)

*Preuves à demander, avec l'état réel des documents de Nexora AI (en préparation). · Affirmations : CL-05, CL-73, CL-E06, CL-87*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=preuves`

## Les preuves à demander.

Une réponse orale ne prouve rien. Demandez des documents :

- **Le schéma des flux** : où vont les données, quels services externes sont appelés.
- **Le registre des sous-traitants** : leur pays et leur rôle.
- **Le contrat de traitement** : ce qui est promis, par écrit.
- **L'adresse et le contrat du lieu d'hébergement**, et celui des sauvegardes et des journaux.
- **Le journal d'accès** : qui est entré dans vos données, quand et pour quelle tâche.
Nexora AI s'engage à remettre le schéma des flux avant la mise en service. Le contrat type, le registre des sous-traitants et la preuve du lieu d'hébergement sont en préparation : aucun n'est encore disponible.

### Bloc 6 — Cartes (`block_cards`)

*Les pièges : flux sortants, bascule silencieuse, stockage et traitement, serveur local, vocabulaire. · Affirmations : CL-77, CL-76, CL-E08, CL-75*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=pieges`

## Les pièges.

#### Installé chez vous n'est pas isolé.

Installer un système sur votre serveur n'équivaut pas à n'avoir aucun flux sortant : mises à jour, licences et modèle externe éventuel sont à lister avant la mise en service.

#### La bascule silencieuse.

Un système qui passe seul à un modèle externe en cas de panne change le lieu de traitement sans vous le dire. Exigez qu'il ne le fasse jamais.

#### Stockage n'est pas traitement.

Un stockage au Canada ne dit pas où le modèle lit vos requêtes.

#### Un serveur ici ne suffit pas.

Il n'écarte pas à lui seul les lois qui s'appliquent au fournisseur. Les lois d'ici s'appliquent aussi aux entreprises d'ici.

### Bloc 7 — Section (`block_section`)

*Ce que Nexora AI ne promet pas : risque nul, immunité, conformité automatique, certification. · Affirmations : CL-75, CL-09, CL-86*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=limites`

## Ce que Nexora AI ne promet pas.

Nexora AI ne promet ni risque nul, ni immunité juridique, ni conformité automatique. Elle n'affiche aucune certification qu'elle ne peut pas prouver et n'annonce aucun niveau de service à ce jour. Une IA souveraine est une IA dont on sait où elle tourne : ce n'est pas une IA que rien ne peut atteindre.

### Bloc 8 — FAQ (`block_faq`)

*Questions du guide : définition, hébergement canadien, vérification, auto-hébergement, Nexora AI. · Affirmations : CL-70, CL-75, CL-E08, CL-77, CL-02, CL-87*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=faq`

## IA souveraine : vos questions.

#### Qu'est-ce qu'une IA souveraine ?

Une IA dont on sait où elle tourne et où vont les données. Nexora AI la décrit par quatre couches de contrôle : les données, les modèles, le calcul et l'exploitation. C'est une définition de travail, sans valeur légale.

#### Un hébergement au Canada suffit-il ?

Pas à lui seul : un stockage au Canada n'implique pas un traitement au Canada, et un fournisseur soumis à une loi étrangère peut devoir remettre des données qu'il détient. Voir le guide sur le lieu des données.

#### Un serveur chez moi garantit-il l'absence de flux sortants ?

Non. Installer le système sur votre serveur n'équivaut ni à une absence de télémétrie ni à un fonctionnement hors ligne garanti : les flux sortants sont listés avant la mise en service.

#### Comment vérifier les réponses d'un fournisseur ?

En demandant des documents plutôt que des réponses orales : schéma des flux, registre des sous-traitants, contrat de traitement, adresse et contrat du lieu d'hébergement, journal d'accès.

#### Nexora AI est-elle une IA souveraine ?

Nexora AI propose deux modes, chez vous ou hébergé au Québec, et s'engage à documenter les flux par écrit. Le contrat type et la preuve du lieu d'hébergement sont en préparation : jugez-la avec la liste ci-dessus, pièces en main.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : étude de déploiement. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Appliquons la liste à votre cas.

Une étude de déploiement passe ces questions en revue pour votre contexte : couches, flux sortants, preuves.

[Demander une étude](/contact/?sujet=etude-deploiement) · [Où sont vos données](/guides/ou-sont-vos-donnees-ia/)
