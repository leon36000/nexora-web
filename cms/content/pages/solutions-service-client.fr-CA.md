# Service client — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-service-client.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-service-client` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/solutions/service-client/` · slug : `solutions/service-client`
- Titre SEO (40 caractères) : Service client par IA pour PME au Québec
- Description SEO (148 caractères) : Un agent répond à vos clients à partir de vos documents, cite ses sources et passe la main à une personne quand il ne sait pas. Vous gardez la main.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution service client. · Affirmations : CL-122, CL-90*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Service client**

# Des réponses sourcées. Une personne en relais.

Un agent répond aux questions de vos clients à partir de vos propres documents, cite ce qu'il a utilisé et transmet la demande à votre équipe quand il ne sait pas.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir toutes les solutions](/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : un distributeur de produits de plomberie. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=probleme`

## Les mêmes questions, tous les jours.

Prenons un distributeur de produits de plomberie qui sert des entrepreneurs. Chaque jour, on lui demande les heures d'ouverture, la politique de retour, les documents à fournir pour ouvrir un compte, les zones desservies. Les réponses existent, dans des fiches et des guides, mais il faut quelqu'un pour les retrouver et les redire.

L'exemple est construit pour illustrer le principe ; ce n'est pas le résultat d'un client.

- **Une équipe interrompue.** Les questions simples coupent le travail des personnes qui devraient traiter les cas difficiles.
- **Des réponses inégales.** Selon la personne et le jour, la réponse change.
- **Des clients qui renoncent.** Une question sans réponse rapide devient parfois une commande perdue.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : trois étapes, avec relais humain. · Affirmations : CL-122, CL-25, CL-90, CL-107, CL-112*

Réglages : `columns=3`, `tone=sombre`, `layout=modules`, `anchor_id=systeme`

## Ce que fait le système.

L'agent est publié dans WorkStudio. Il peut vivre sur votre site (une bulle de chat) ou dans un espace interne réservé à votre équipe.

#### Il cherche.

À chaque question, il consulte les bases de documents que vous lui avez ouvertes : fiches, guides, politiques. L'indexation se calcule par défaut sur le serveur de l'instance.

#### Il répond et cite.

La réponse numérote ses sources, qu'un clic permet d'ouvrir. Un garde-fou peut vérifier que la réponse reste fidèle à vos documents avant qu'elle parte.

#### Il passe la main.

S'il ne trouve rien, il propose un rappel par une personne et transmet la demande à l'équipe avec un résumé.

### Bloc 4 — Section (`block_section`)

*Ce que reçoit l'équipe, et le bénéfice. · Affirmations : CL-96, CL-122, CL-14*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=equipe`

## Ce que reçoit l'équipe.

Les questions simples trouvent une réponse sans mobiliser quelqu'un. Les autres arrivent avec leur contexte : la question, ce que l'agent a déjà répondu, un résumé.

Le bénéfice attendu : moins d'interruptions, des réponses plus constantes, des clients qui obtiennent quelque chose plus vite. Aucun pourcentage n'est annoncé ; l'effet se mesure pendant un pilote, sur vos vraies questions.

- **Les demandes transmises.** Avec le résumé de l'échange, pour ne pas poser deux fois la question.
- **Un journal des conversations.** Les échanges de l'agent sont tracés : on peut voir ce qui a été répondu, avec quelles sources.
- **Des traces à relire.** Les questions restées sans réponse se repèrent dans les traces et disent quels documents manquent à votre base.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, avec limites : pas de téléphone, pas de promesse de disponibilité. · Affirmations : CL-124, CL-86, CL-109, CL-93, CL-128, CL-06*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## Ce qui reste sous votre contrôle.

#### Vous choisissez les documents.

L'agent ne consulte que les bases que vous lui ouvrez. Un agent accessible au public ne devrait jamais avoir accès à des documents confidentiels : nous séparons les deux.

#### Rien d'irréversible sans accord.

Si l'agent a un outil qui écrit (créer un dossier, envoyer un message), l'action attend l'approbation de votre équipe quand le chat est public.

#### Pas de téléphone.

Aucun service de réception d'appels n'est livré à ce jour. La solution couvre le chat et les demandes écrites.

#### Pas de promesse de disponibilité.

L'agent répond quand le système est en ligne. Aucun niveau de disponibilité n'est annoncé à ce jour ; il se précise au contrat.

#### Le modèle est un choix écrit.

Sur votre serveur ou dans notre infrastructure ; un modèle externe seulement avec votre accord. La recherche sur le web, si elle était activée pour l'agent, enverrait ses requêtes hors du système : nous ne l'activons pas pour un agent public.

### Bloc 6 — FAQ (`block_faq`)

*FAQ propre à la solution service client. · Affirmations : CL-107, CL-122, CL-132, CL-112*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Service client : vos questions.

#### Comment l'agent apparaît-il sur mon site ?

Une ligne de code ajoute une bulle de chat, ou vous insérez un cadre dans une page. Vous limitez la liste des sites autorisés à l'afficher. Il faut pour cela une adresse HTTPS publique pour votre instance.

#### Peut-il inventer une réponse ?

Un modèle peut se tromper. Nous réduisons le risque en le faisant répondre à partir de vos documents, en citant ses sources et, au besoin, en ajoutant un garde-fou de fidélité. Nous vérifions pendant le pilote qu'il dit quand il ne trouve rien.

#### Et si le client veut parler à quelqu'un ?

L'agent propose un rappel par une personne et transmet la demande avec un résumé. Le chat en direct avec un humain n'est pas une fonction annoncée.

#### Parle-t-il en français et en anglais ?

Il répond dans la langue de la question dans la mesure où le modèle choisi le permet. Nous vérifions les deux langues sur vos documents pendant le pilote.

### Bloc 7 — Appel à l'action (`block_cta`)

*CTA : démonstration. · Affirmations : CL-01*

Réglages : `tone=sombre`

## Voir l'agent répondre.

Nous préparons une démonstration sur des documents fictifs, puis nous parlons de vos questions fréquentes et de votre site.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir les documents](/solutions/documents/)
