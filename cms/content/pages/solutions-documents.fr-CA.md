# Documents — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-documents.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-documents` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/solutions/documents/` · slug : `solutions/documents`
- Titre SEO (35 caractères) : Recherche dans vos documents par IA
- Description SEO (157 caractères) : Posez une question en français : la réponse part de vos propres documents, avec ses sources. L'indexation se calcule par défaut sur le serveur de l'instance.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution documents. · Affirmations : CL-127, CL-25*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Documents**

# La bonne clause. La bonne version. Retrouvées.

Posez votre question en français. La réponse part de vos propres documents, cite ses sources et vous renvoie vers le passage d'origine.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir toutes les solutions](/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : un cabinet de services professionnels. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=probleme`

## Des documents introuvables.

Un cabinet de services professionnels accumule des contrats, des devis, des procédures et des notes de dossier, répartis dans plusieurs dossiers et plusieurs versions. Retrouver la clause d'un ancien contrat, c'est fouiller quatre dossiers et appeler un collègue.

L'exemple est construit pour illustrer le principe ; ce n'est pas le résultat d'un client.

- **Plusieurs versions.** Laquelle est la bonne ? Celle signée, ou la dernière modifiée ?
- **Une mémoire dans les têtes.** Le départ d'une personne emporte des repères.
- **Des recherches à répéter.** La même question, posée par trois personnes, est cherchée trois fois.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : constituer la base, répondre avec sources, résumer, extraire. · Affirmations : CL-127, CL-25, CL-90, CL-101, CL-129, CL-112*

Réglages : `columns=2`, `tone=clair`, `layout=modules`, `anchor_id=systeme`

## Ce que fait le système.

Trois fonctions de WorkStudio, assemblées pour votre cas.

#### Une base de connaissances.

Vous y déposez des documents (PDF, Word, texte, pages web) ou vous branchez une source synchronisée. Ils sont découpés et indexés (rangés pour être retrouvés vite) ; le calcul se fait par défaut sur le serveur de l'instance.

#### Des réponses avec leurs sources.

L'agent cherche d'abord dans la base, répond, numérote ses sources et les rend cliquables. Un garde-fou peut contrôler la fidélité de la réponse à vos documents.

#### Des résumés et des extraits.

Un modèle de départ résume un contrat (délais, montants, clauses à faire relire). Il ne remplace pas un juriste. Les pièces scannées se lisent aussi, plus lentement.

#### Des champs structurés.

Quand un document suit une forme connue (devis, bon de commande), le système en tire des champs rangés dans une table.

### Bloc 4 — Section (`block_section`)

*Ce que reçoit l'équipe, et le bénéfice. · Affirmations : CL-127, CL-14, CL-100*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=equipe`

## Ce que reçoit l'équipe.

Une façon de poser une question à ses propres documents, dans l'Assistant interne de WorkStudio ou dans un chat que vous publiez. Le bénéfice attendu : moins de temps de recherche, moins de dépendance à la mémoire d'une personne. Aucun temps gagné n'est annoncé ; l'effet se mesure pendant un pilote, sur vos questions réelles.

- **Une réponse et ses sources.** Un clic ouvre le document ou affiche l'extrait utilisé.
- **Une mémoire d'entreprise.** La connaissance des dossiers reste dans la base quand quelqu'un part.
- **Des traces à relire.** Les questions restées sans réponse révèlent ce que vos documents ne disent pas.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, avec limites. · Affirmations : CL-127, CL-25, CL-129, CL-109, CL-06*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## Ce qui reste sous votre contrôle.

#### Vous choisissez les bases.

L'agent ne consulte que les bases de documents que vous lui ouvrez. Les droits d'accès se règlent par base et par espace, pas document par document.

#### Vos documents restent chez vous.

Par défaut, l'indexation se calcule sur le serveur de l'instance et aucun document n'en sort. Un service externe est un choix écrit.

#### Aucun avis juridique.

Le résumé de contrat signale des clauses à faire relire. Il ne remplace ni un juriste, ni une lecture attentive.

#### L'IA peut se tromper.

Un modèle peut mal lire un passage. Les sources citées permettent de vérifier, et nous contrôlons la fidélité aux documents pendant le pilote.

#### La recherche web reste un choix.

Si elle est activée pour un agent, ses requêtes quittent l'instance : nous ne l'activons pas pour des agents qui manipulent des données confidentielles.

### Bloc 6 — FAQ (`block_faq`)

*FAQ propre à la solution documents. · Affirmations : CL-127, CL-25, CL-101, CL-132*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Documents : vos questions.

#### Quels types de fichiers ?

Des PDF, des documents Word, du texte et des pages web. Les documents scannés se lisent avec un modèle de lecture, plus lentement.

#### Mes documents sont-ils envoyés ailleurs ?

Par défaut, non : l'indexation se calcule sur le serveur de l'instance. Si vous choisissez un modèle externe pour répondre, les extraits utilisés lui sont transmis ; nous l'indiquons avant, par écrit.

#### L'agent dit-il quand il ne trouve rien ?

C'est l'objectif de la configuration, et nous le vérifions pendant le pilote sur vos documents. Un garde-fou de fidélité réduit les réponses non étayées ; il ne les supprime pas.

#### Peut-on limiter ce que chaque personne voit ?

On limite ce que chaque agent consulte, base par base. Un droit d'accès document par document n'est pas annoncé à ce jour.

### Bloc 7 — Appel à l'action (`block_cta`)

*CTA : démonstration. · Affirmations : CL-01*

Réglages : `tone=sombre`

## Interrogez vos documents.

Nous préparons une démonstration sur des documents fictifs, puis nous parlons des vôtres et de l'endroit où ils doivent rester.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir le service client](/solutions/service-client/)
