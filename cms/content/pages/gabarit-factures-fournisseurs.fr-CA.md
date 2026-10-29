# Extraction d'une facture fournisseur — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-factures-fournisseurs.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-factures-fournisseurs` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/gabarits-flux-de-travaux/factures-fournisseurs/` · slug : `gabarits-flux-de-travaux/factures-fournisseurs`
- Titre SEO (44 caractères) : Gabarit Extraction d'une facture fournisseur
- Description SEO (149 caractères) : Extraction d'une facture fournisseur : gabarit de départ de WorkStudio. Champs, étapes, validation humaine et points à valider avec votre conseiller.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Extraction d'une facture fournisseur », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111, CL-M12, CL-M13, CL-M15*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Gabarit · Finance et documents**

# Extraction d'une facture fournisseur.

Le gabarit Extraction d'une facture fournisseur extrait en JSON les champs d'une facture (fournisseur, numéro, date, sous-total, TPS, TVQ, total, échéance), avec nul pour toute valeur absente, puis vérifie la cohérence des totaux et des taxes et conclut « COHÉRENTE »

[Voir tous les gabarits](/gabarits-flux-de-travaux/) · [Demander une démonstration](/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13, CL-M15*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Le gabarit Extraction d'une facture fournisseur extrait en JSON les champs d'une facture (fournisseur, numéro, date, sous-total, TPS, TVQ, total, échéance), avec nul pour toute valeur absente, puis vérifie la cohérence des totaux et des taxes et conclut « COHÉRENTE » ou « À VÉRIFIER ». La facture se dépose en fichier PDF ou image.

Un gabarit de flux de travaux est un enchaînement automatisé de tâches, fourni comme point de départ dans WorkStudio et à adapter à l'entreprise avant son déploiement.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13, CL-M15*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## Ce que vous fournissez.

Chaque champ de départ est prérempli d'une donnée d'exemple pour un premier lancement sans saisie, sauf les adresses de courriel et les fichiers.

- **La facture.** Facture déposée en fichier (PDF ou image).
- **Le texte.** Texte de la facture, tel qu'il apparaît dans le fichier.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13, CL-M15*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## Les étapes.

#### Extraire les champs.

Un agent répond en JSON seulement : fournisseur, numero, date, sous_total (avant taxes), tps, tvq, total et echeance, dates en AAAA-MM-JJ et montants en nombres ; nul pour toute valeur absente du texte.

#### Vérifier la cohérence.

Un second agent affiche le calcul : le sous-total, la TPS et la TVQ donnent le total à un cent près, la TPS vaut 5 % du sous-total et la TVQ 9,975 % du sous-total, jamais de la TPS. Il vérifie l'échéance et l'absence de valeur nulle, signale sans la rejeter l'absence de taxes d'un petit fournisseur non inscrit, et liste les anomalies.

#### Relire.

Vous relisez le texte produit, le corrigez au besoin, puis l'utilisez ou l'envoyez vous-même : le gabarit n'envoie rien.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13, CL-M15*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## À adapter avant l'usage.

#### Ce qui s'adapte ici.

La vérification connaît la TPS fédérale et la TVQ, pas les taxes des autres provinces. Le premier agent recopie les montants du texte sans rien recalculer ; c'est le second qui contrôle. Un fournisseur non inscrit n'ajoute aucune taxe : ce cas est à vérifier par vous.

#### Ce qui vaut pour tous.

Les gabarits sont rédigés pour une PME du Québec : montants en dollars canadiens, TPS et TVQ quand une taxe entre en jeu, courriel et infolettre. Ils ne garantissent aucune conformité fiscale ou légale : les exemples sont fictifs, et votre comptable ou votre conseiller valide le résultat avant l'usage.

#### Rien n'est envoyé.

Le gabarit produit un texte à relire. Seuls cinq gabarits de la collection envoient un courriel, et chacun attend d'abord la validation d'une personne.

### Bloc 6 — FAQ (`block_faq`)

*Questions de la fiche : envoi, point propre au gabarit, adaptation au Québec. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13, CL-M15*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Vos questions sur ce gabarit.

#### Ce gabarit envoie-t-il quelque chose à ma place ?

Non. Il produit un texte à relire ; vous l'utilisez ou l'envoyez vous-même. Seuls cinq gabarits de la collection envoient un courriel, et chacun attend d'abord la validation d'une personne.

#### Le gabarit lit-il le PDF lui-même ?

Le fichier se dépose dans le gabarit, et le texte de la facture est aussi demandé. La lecture de PDF scannés et d'images demande un modèle de lecture de documents, à prévoir selon l'installation ; ses champs de taxes (TVA, hors taxes, toutes taxes comprises) ne sont pas encore adaptés au Québec.

#### Convient-il aux factures de mes fournisseurs ?

Il est écrit pour un fournisseur du Québec, avec des exemples fictifs. Un agent contrôle les calculs : il ne remplace pas votre comptable, qui valide la saisie. Les taxes des autres provinces ne sont pas gérées.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## Voyez-le à l'œuvre.

Une démonstration sur données fictives, pour voir ce que le gabarit prépare et où une personne garde la main.

[Demander une démonstration](/contact/?sujet=demonstration) · [Tous les gabarits](/gabarits-flux-de-travaux/)
