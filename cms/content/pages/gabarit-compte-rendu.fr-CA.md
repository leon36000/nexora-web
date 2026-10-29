# Compte rendu de réunion — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-compte-rendu.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-compte-rendu` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/gabarits-flux-de-travaux/compte-rendu/` · slug : `gabarits-flux-de-travaux/compte-rendu`
- Titre SEO (44 caractères) : Compte rendu de réunion : gabarit WorkStudio
- Description SEO (151 caractères) : Compte rendu de réunion : gabarit de départ de WorkStudio pour PME. Champs, étapes, validation humaine et ce qui reste à valider avec votre conseiller.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Compte rendu de réunion », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111, CL-M12*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Gabarit · Courriels et réunions**

# Compte rendu de réunion.

Le gabarit Compte rendu de réunion transcrit l'enregistrement audio en séparant les intervenants, rédige le compte rendu (participants, points abordés, décisions, tableau des actions, questions ouvertes), le soumet à une personne et ne l'envoie par courriel qu'après son approbation.

[Voir tous les gabarits](/gabarits-flux-de-travaux/) · [Demander une démonstration](/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21, CL-M12*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Le gabarit Compte rendu de réunion transcrit l'enregistrement audio en séparant les intervenants, rédige le compte rendu (participants, points abordés, décisions, tableau des actions, questions ouvertes), le soumet à une personne et ne l'envoie par courriel qu'après son approbation.

Un gabarit de flux de travaux est un enchaînement automatisé de tâches, fourni comme point de départ dans WorkStudio et à adapter à l'entreprise avant son déploiement.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21, CL-M12*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## Ce que vous fournissez.

Chaque champ de départ est prérempli d'une donnée d'exemple pour un premier lancement sans saisie, sauf les adresses de courriel et les fichiers.

- **L'enregistrement.** Enregistrement audio de la réunion (fichier).
- **Les participants.** Participants, avec leur fonction (facultatif).
- **Le destinataire.** Adresse de courriel à laquelle envoyer le compte rendu.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21, CL-M12*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## Les étapes.

#### Transcrire.

L'enregistrement est transcrit en séparant les voix : « Intervenant 1 », « Intervenant 2 »… Ces mentions désignent des voix, pas des noms.

#### Rédiger le compte rendu.

Un agent rapproche les noms cités des intervenants quand le texte le permet, puis écrit participants, points abordés, décisions, tableau des actions et questions ouvertes.

#### Faire valider, puis envoyer.

Une personne lit le compte rendu et l'approuve ou le refuse. Seule son approbation envoie le courriel.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21, CL-M12*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## À adapter avant l'usage.

#### Ce qui s'adapte ici.

Le rapprochement des noms et des voix n'est pas infaillible : relisez avant d'approuver. La lecture de la voix demande un modèle de transcription, donc du matériel si vous êtes sur place. Réglez le serveur de courriel.

#### Ce qui vaut pour tous.

Les gabarits sont rédigés pour une PME du Québec : montants en dollars canadiens, TPS et TVQ quand une taxe entre en jeu, courriel et infolettre. Ils ne garantissent aucune conformité fiscale ou légale : les exemples sont fictifs, et votre comptable ou votre conseiller valide le résultat avant l'usage.

#### Une personne valide avant l'envoi.

Le flux s'arrête sur la validation d'une personne et n'envoie le courriel que si elle approuve. Le serveur de courriel (hôte, port, compte, expéditeur) est laissé à renseigner.

### Bloc 6 — FAQ (`block_faq`)

*Questions de la fiche : envoi, point propre au gabarit, adaptation au Québec. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21, CL-M12*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Vos questions sur ce gabarit.

#### Peut-il envoyer un courriel sans mon accord ?

Non. Le flux s'arrête sur la validation d'une personne et n'envoie le courriel que si elle approuve. Le serveur de courriel est à renseigner.

#### Le gabarit identifie-t-il qui parle par son nom ?

Non, il distingue des voix numérotées. Il rapproche les noms cités dans la discussion des intervenants quand le texte le permet, et la liste des participants que vous fournissez l'aide.

#### Convient-il à une PME du Québec ?

Il est rédigé pour le Québec, mais à valider : les exemples sont fictifs, et le gabarit ne remplace ni votre comptable ni votre conseiller. Relisez chaque résultat avant de l'utiliser et adaptez la consigne à votre entreprise.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## Voyez-le à l'œuvre.

Une démonstration sur données fictives, pour voir ce que le gabarit prépare et où une personne garde la main.

[Demander une démonstration](/contact/?sujet=demonstration) · [Tous les gabarits](/gabarits-flux-de-travaux/)
