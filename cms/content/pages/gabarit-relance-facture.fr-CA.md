# Relance de facture impayée — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-relance-facture.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-relance-facture` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/gabarits-flux-de-travaux/relance-facture/` · slug : `gabarits-flux-de-travaux/relance-facture`
- Titre SEO (47 caractères) : Relance de facture impayée : gabarit WorkStudio
- Description SEO (154 caractères) : Relance de facture impayée : gabarit de départ de WorkStudio pour PME. Champs, étapes, validation humaine et ce qui reste à valider avec votre conseiller.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Relance de facture impayée », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111, CL-M12, CL-M13*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Gabarit · Ventes et clients**

# Relance de facture impayée.

Le gabarit Relance de facture impayée écrit le courriel de relance (objet et corps) d'après le client, la facture, le montant, l'échéance dépassée et le niveau de relance : courtois, ferme ou mise en demeure.

[Voir tous les gabarits](/gabarits-flux-de-travaux/) · [Demander une démonstration](/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M12, CL-M13*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Le gabarit Relance de facture impayée écrit le courriel de relance (objet et corps) d'après le client, la facture, le montant, l'échéance dépassée et le niveau de relance : courtois, ferme ou mise en demeure. Il produit un texte à relire ; il n'envoie rien.

Un gabarit de flux de travaux est un enchaînement automatisé de tâches, fourni comme point de départ dans WorkStudio et à adapter à l'entreprise avant son déploiement.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M12, CL-M13*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## Ce que vous fournissez.

Chaque champ de départ est prérempli d'une donnée d'exemple pour un premier lancement sans saisie, sauf les adresses de courriel et les fichiers.

- **Le client.** Nom du client.
- **La facture.** Numéro de la facture.
- **Le montant.** Montant dû, taxes incluses.
- **L'échéance.** Date d'échéance dépassée.
- **Le niveau.** Niveau de relance : 1 courtois, 2 ferme ou 3 mise en demeure.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M12, CL-M13*

Réglages : `columns=2`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## Les étapes.

#### Rédiger la relance.

Un agent écrit le courriel au niveau demandé : rappel simple, nouveau délai de huit jours, ou mise en demeure. Au niveau trois, il rappelle des frais ou intérêts de retard seulement s'ils figurent déjà sur la facture ou dans vos conditions, sans en inventer le taux ni le montant, et termine par la note interne « Mise en demeure à valider par votre conseiller avant l'envoi. »

#### Relire.

Vous relisez le texte produit, le corrigez au besoin, puis l'utilisez ou l'envoyez vous-même : le gabarit n'envoie rien.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M12, CL-M13*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## À adapter avant l'usage.

#### Ce qui s'adapte ici.

Au niveau trois, la consigne ne cite aucun taux ni aucune indemnité : les frais ou intérêts de retard n'apparaissent que s'ils figurent déjà sur la facture ou dans vos conditions. La note « à valider par votre conseiller » rappelle qu'une mise en demeure engage : faites-la relire avant l'envoi.

#### Ce qui vaut pour tous.

Les gabarits sont rédigés pour une PME du Québec : montants en dollars canadiens, TPS et TVQ quand une taxe entre en jeu, courriel et infolettre. Ils ne garantissent aucune conformité fiscale ou légale : les exemples sont fictifs, et votre comptable ou votre conseiller valide le résultat avant l'usage.

#### Rien n'est envoyé.

Le gabarit produit un texte à relire. Seuls cinq gabarits de la collection envoient un courriel, et chacun attend d'abord la validation d'une personne.

### Bloc 6 — FAQ (`block_faq`)

*Questions de la fiche : envoi, point propre au gabarit, adaptation au Québec. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M12, CL-M13*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Vos questions sur ce gabarit.

#### Ce gabarit envoie-t-il quelque chose à ma place ?

Non. Il produit un texte à relire ; vous l'utilisez ou l'envoyez vous-même. Seuls cinq gabarits de la collection envoient un courriel, et chacun attend d'abord la validation d'une personne.

#### Le courriel de mise en demeure a-t-il une valeur juridique ?

Le gabarit rédige un texte, pas un avis juridique. Faites relire une mise en demeure par la personne compétente avant de l'envoyer, en tenant compte du droit applicable au Québec.

#### Convient-il à une facture du Québec ?

Il est écrit pour une facture du Québec, montant taxes incluses en dollars canadiens, mais il ne connaît ni votre contrat ni vos conditions de paiement. Une mise en demeure se fait valider par votre conseiller avant l'envoi.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## Voyez-le à l'œuvre.

Une démonstration sur données fictives, pour voir ce que le gabarit prépare et où une personne garde la main.

[Demander une démonstration](/contact/?sujet=demonstration) · [Tous les gabarits](/gabarits-flux-de-travaux/)
