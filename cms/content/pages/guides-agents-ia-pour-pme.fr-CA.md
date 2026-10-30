# Agents IA pour PME — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-agents-ia-pour-pme.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-agents-ia-pour-pme` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/guides/agents-ia-pour-pme/` · slug : `guides/agents-ia-pour-pme`
- Titre SEO (41 caractères) : Qu'est-ce qu'un agent IA ? Guide pour PME
- Description SEO (155 caractères) : Un agent IA suit vos consignes, utilise les outils et les documents autorisés, cite ses sources et agit sous validation humaine. Définitions et garde-fous.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : définir un agent IA simplement, avec la validation humaine dès le sous-titre. · Affirmations : CL-90, CL-93, CL-21*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · Agents IA**

# Qu'est-ce qu'un agent IA ? Définition simple.

Un agent est un assistant logiciel : il suit vos consignes, utilise les outils et les documents que vous lui autorisez, cite ses sources et peut agir. Une personne valide avant que quoi que ce soit ne parte.

[Voir WorkStudio](/workstudio/) · [Demander une démonstration](/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : la définition d'un agent, en un paragraphe, et ses quatre composantes. · Affirmations : CL-90, CL-20, CL-93*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Un agent IA est un assistant logiciel qui accomplit une tâche avec les outils que vous autorisez. Il suit vos consignes, utilise les outils et les documents que vous lui ouvrez, cite ses sources et peut être publié dans un chat. Dans WorkStudio, chaque outil d'action demande par défaut l'accord d'une personne avant d'écrire ou de supprimer.

Un modèle de langage, seul, produit du texte. Un agent combine un modèle, des consignes, des outils et des documents pour mener une tâche à son terme.

- **Un modèle.** Le moteur qui lit et produit du texte.
- **Des consignes.** Ce que vous lui demandez de faire, et comment.
- **Des outils.** Ce qu'il a le droit d'utiliser.
- **Des documents.** Ce sur quoi il s'appuie pour répondre.

### Bloc 3 — Cartes (`block_cards`)

*Trois mots qu'on confond : modèle, agent, flux de travaux. · Affirmations : CL-90, CL-91, CL-21*

Réglages : `columns=3`, `tone=sable`, `layout=grille`, `anchor_id=vocabulaire`

## Modèle, agent, flux de travaux.

Trois mots qu'on confond souvent.

#### Un modèle.

Le moteur qui lit et produit du texte. Il répond ; il ne fait rien d'autre.

#### Un agent.

Un modèle, des consignes, des outils et des documents autorisés. Il suit vos consignes et cite ses sources.

#### Un flux de travaux.

Un enchaînement automatisé de tâches. Il peut s'arrêter sur la validation d'une personne, qui approuve ou refuse avant que l'action ne parte.

### Bloc 4 — Section (`block_section`)

*Ce qu'un agent fait, concrètement : quatre exemples construits à partir de ce que WorkStudio permet, étiquetés comme exemples. · Affirmations : CL-120, CL-101, CL-122, CL-102, CL-11*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=exemples`

## Ce qu'un agent fait, concrètement.

Ces exemples sont construits à partir de ce que WorkStudio permet ; ce ne sont pas des résultats mesurés chez des clients.

- **Il classe vos courriels.** À l'arrivée d'un courriel, il le classe (catégorie, urgence, résumé), prépare un brouillon de réponse et n'envoie qu'après la validation d'une personne.
- **Il lit le papier.** Il lit des PDF scannés et des images, extrait les champs d'une facture, d'un devis ou d'une note de frais, et marque « à vérifier » ce qui est manquant, illisible ou incohérent.
- **Il répond à partir de vos documents.** Il répond aux questions de clients dans un chat à partir des documents qui lui sont ouverts, cite ses sources et, à défaut de réponse, propose un rappel par une personne.
- **Il transcrit une réunion.** Il transcrit des enregistrements audio, avec les intervenants, et lit un texte à voix haute. Il ne répond pas au téléphone.

### Bloc 5 — Cartes (`block_cards`)

*Les garde-fous un par un : validation, traces, masquage, outils désactivés par défaut, plafonds. · Affirmations : CL-93, CL-21, CL-96, CL-24, CL-105, CL-109, CL-22, CL-106, CL-PL01, CL-T04, CL-T09*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=garde-fous`

## Les garde-fous, un par un.

#### Validation humaine.

Chaque outil d'action demande par défaut l'accord d'une personne avant d'écrire ou de supprimer ; sans réponse, l'action n'a pas lieu.

#### Traces.

Chaque appel de modèle laisse une trace consultable (étapes, durée, jetons, modèle) ; les renseignements personnels peuvent y être masqués.

#### Renseignements masqués.

Une politique par espace décide si les renseignements personnels sont autorisés, masqués ou refusés avant un appel à un modèle hors de l'instance.

#### Outils désactivés par défaut.

La recherche web d'un agent n'est disponible que si un administrateur l'active ; l'interpréteur de code est désactivé par défaut.

#### Plafonds et journal.

Organisations, rôles, journal d'audit et plafonds mensuels de consommation.

#### Crédits comptés.

Tout appel à un modèle d'IA consomme des crédits, dont le solde est visible dans « Mes outils » ; sans crédits, l'appel est refusé avec un message qui renvoie vers la recharge et l'abonnement.

### Bloc 6 — Section (`block_section`)

*Sans code : comment on construit, avec le Copilote, un flux relu avant création. · Affirmations : CL-92, CL-P02, CL-91*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=sans-code`

## Sans code : comment ça marche.

On décrit le besoin en français ; le Copilote, l'assistant de création, prépare un flux que l'on relit, que l'on teste pas à pas, puis que l'on déploie. Chaque déploiement est une version à laquelle on peut revenir. Des modèles de départ pour PME sont fournis. Voir [WorkStudio](/workstudio/).

Les modèles de départ sont décrits un par un dans les [gabarits de flux de travaux](/gabarits-flux-de-travaux/).

### Bloc 7 — Cartes (`block_cards`)

*Ce qu'un agent ne fait pas : téléphone, rapprochement bancaire, règles fiscales, avis juridique. · Affirmations : CL-124, CL-126, CL-111, CL-129*

Réglages : `columns=2`, `tone=clair`, `layout=modules`, `anchor_id=limites`

## Ce qu'un agent ne fait pas.

#### Il ne répond pas au téléphone.

Aucun service de réception d'appels téléphoniques n'est livré à ce jour.

#### Il ne fait pas le rapprochement bancaire.

Il n'est pas livré dans WorkStudio ; il peut être étudié sur mesure, à partir de relevés exportés, sans connexion bancaire.

#### Il ne connaît pas vos règles fiscales.

Les modèles de départ sont adaptés au Québec, mais ne garantissent aucune conformité fiscale ou légale : votre comptable ou votre conseiller les valide.

#### Il ne remplace pas un juriste.

Un modèle de départ résume un contrat ; il ne remplace pas un juriste.

### Bloc 8 — FAQ (`block_faq`)

*Questions du guide : agent et agent conversationnel, envoi autonome, lieu d'exécution, mesure, coût. · Affirmations : CL-90, CL-122, CL-93, CL-26, CL-02, CL-97, CL-80, CL-106, CL-10, CL-PL03, CL-T01, CL-T02, CL-T04, CL-T06, CL-12*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Agents IA : vos questions.

#### Un agent IA, est-ce un agent conversationnel ?

Pas exactement. Un agent conversationnel dialogue. Un agent peut aussi utiliser des outils et des documents pour accomplir une tâche, avec les droits que vous lui donnez.

#### Un agent IA peut-il envoyer un courriel seul ?

Pas par défaut. Chaque outil d'action demande l'accord d'une personne avant d'écrire ou de supprimer ; sans réponse, l'action n'a pas lieu. Dans les flux que Nexora AI configure, toute action qui engage l'entreprise passe par une validation, sauf décision écrite contraire du client.

#### Où tournent les agents IA ?

WorkStudio s'installe en une commande sur un serveur Docker, un outil qui empaquette les logiciels pour qu'ils s'installent de la même façon partout. Le système est installé chez vous ou hébergé dans l'infrastructure de Nexora AI, située au Québec.

#### Comment savoir si un agent répond bien ?

Des jeux de tests et des juges mesurent si un agent, une consigne ou un modèle répond bien, et comparent deux versions.

#### Combien coûte un agent IA ?

Le coût d'un agent dépend du cas. Il n'y a pas encore de prix public. Deux choses se paient. L'accompagnement (diagnostic, installation, configuration) : une estimation écrite suit le diagnostic et dit ce qui est inclus et ce qui ne l'est pas. L'usage de la plateforme : en crédits, car tout ce qui appelle un modèle d'IA en consomme ; un abonnement donne des crédits et de l'espace chaque mois, sinon on recharge. La consommation se mesure en jetons, l'unité de texte que traite un modèle : un crédit vaut un cent canadien de jetons, avec des plafonds mensuels. Les prix de la plateforme s'afficheront sur la page Tarifs dès leur publication.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : voir un agent à l'œuvre, sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## Voyez un agent à l'œuvre.

Une démonstration sur données fictives, pour voir ce qu'un agent prépare et où il s'arrête avant que vous validiez.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir les solutions](/solutions/)
