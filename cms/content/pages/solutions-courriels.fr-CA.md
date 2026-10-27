# Courriels — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-courriels.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-courriels` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/solutions/courriels/` · slug : `solutions/courriels`
- Titre SEO (37 caractères) : Automatisation des courriels pour PME
- Description SEO (152 caractères) : Un système trie vos courriels, résume chaque demande et prépare un brouillon à partir de vos documents. Rien ne part sans la validation de votre équipe.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution courriels. · Affirmations : CL-120, CL-21*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Courriels**

# Des courriels triés. Des réponses prêtes.

Un système lit les courriels qui arrivent, les classe, prépare un brouillon à partir de vos documents et attend votre feu vert avant d'envoyer quoi que ce soit.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir toutes les solutions](/solutions/)

### Bloc 2 — Section (`block_section`)

*Le problème, avec un exemple précis. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=probleme`

## Le problème, au quotidien.

Prenons une entreprise de rénovation. Chaque jour arrivent des demandes de prix, des questions sur l'avancement d'un chantier, des factures de fournisseurs et des courriels sans rapport. Quelqu'un ouvre tout, trie, cherche l'historique, rédige. Le courriel urgent attend derrière trois autres.

L'exemple est construit pour illustrer le principe ; ce n'est pas le résultat d'un client.

- **Le tri.** Distinguer la demande de prix de la facture, et l'urgent du reportable.
- **La recherche.** Retrouver la dernière soumission, la clause, le numéro de dossier.
- **La rédaction.** Répondre poliment, complètement, dans le style de la maison.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : quatre étapes, la dernière attend une personne. · Affirmations : CL-120, CL-103, CL-95, CL-21, CL-85*

Réglages : `columns=4`, `tone=sable`, `layout=etapes`, `anchor_id=systeme`

## Ce que fait le système.

Le flux de travaux réagit à l'arrivée d'un courriel dans la messagerie que nous avons reliée à WorkStudio. Chaque étape est visible et modifiable.

#### Il repère.

Un nouveau courriel déclenche le flux. Seules les boîtes que vous choisissez de connecter sont lues.

#### Il classe.

Catégorie (demande de prix, facture, réclamation, autre), urgence et résumé en une phrase.

#### Il prépare.

Un brouillon de réponse, rédigé selon vos consignes de style et à partir de vos documents.

#### Il attend.

Une personne relit, corrige, approuve ou refuse. Rien ne part avant.

### Bloc 4 — Section (`block_section`)

*Ce que reçoit l'équipe. · Affirmations : CL-120, CL-96, CL-95*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=equipe`

## Ce que reçoit l'équipe.

L'équipe ne travaille plus dans le désordre d'une boîte de réception : elle reçoit des éléments prêts à relire.

- **Une file triée.** Les courriels arrivent classés par catégorie et par urgence.
- **Un résumé par message.** Une phrase pour comprendre sans tout lire.
- **Un brouillon par réponse.** À corriger, pas à écrire. Le style vient de consignes que vous versionnez : la consigne en production et celle en test restent distinctes.
- **Une trace de chaque brouillon.** Quel modèle, quelle demande, quelle réponse : tout est consultable.

### Bloc 5 — Section (`block_section`)

*Bénéfice attendu, sans chiffre. · Affirmations : CL-14, CL-09*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=benefice`

## Le bénéfice attendu.

Moins de tri à la main, des urgences vues plus tôt, des réponses plus homogènes d'une personne à l'autre. Nous n'annonçons pas de pourcentage ni de gain de temps : ils dépendent de votre volume et de vos règles, et se mesurent pendant un pilote, sur vos propres courriels.

### Bloc 6 — Cartes (`block_cards`)

*Ce qui reste sous contrôle. · Affirmations : CL-128, CL-21, CL-06, CL-23, CL-103*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## Ce qui reste sous votre contrôle.

#### Rien ne part sans feu vert.

La validation d'une personne précède tout envoi, sauf décision écrite contraire de votre part.

#### Vous écrivez les règles de tri.

Les catégories, les seuils d'urgence et les cas à ne jamais traiter automatiquement sont les vôtres.

#### Vous choisissez les boîtes.

Chaque connexion appartient à un espace de travail et peut être retirée.

#### Le modèle est un choix écrit.

Sur votre serveur ou dans notre infrastructure ; un modèle externe seulement avec votre accord, et son lieu est indiqué.

#### Pas d'envoi en masse.

Cette solution répond à des demandes reçues. Elle ne sert pas à envoyer des courriels promotionnels.

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à la solution courriels. · Affirmations : CL-85, CL-103, CL-112, CL-132*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Courriels : vos questions.

#### Ça fonctionne avec ma messagerie ?

Cela dépend du service. Un large catalogue de services se connecte à WorkStudio, mais chaque messagerie se qualifie au diagnostic, et certaines connexions demandent qu'un administrateur enregistre d'abord une application chez le fournisseur.

#### L'IA peut-elle se tromper de réponse ?

Oui, comme une personne pressée. C'est pourquoi un humain approuve chaque envoi, que chaque brouillon laisse une trace et qu'un garde-fou peut vérifier que la réponse reste fidèle à vos documents avant qu'elle vous soit présentée. Le garde-fou réduit l'erreur ; il ne la rend pas impossible.

#### Peut-elle répondre toute seule aux cas simples ?

Techniquement oui. Dans nos configurations, la validation humaine est la règle ; supprimer cette étape pour un type de message précis est une décision écrite de votre part, que nous consignons.

#### Combien de temps pour la mettre en service ?

Aucun délai universel : il dépend de votre messagerie, de vos règles et de vos documents. Il se mesure sur un premier cas.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : démonstration. · Affirmations : CL-01*

Réglages : `tone=sombre`

## Voir vos courriels triés.

Nous préparons une démonstration sur des courriels fictifs, puis nous parlons de votre messagerie et de vos règles.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir les autres solutions](/solutions/)
