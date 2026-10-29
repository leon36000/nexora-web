# Contrôle d'une facture fournisseur — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-controle-facture.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-controle-facture` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/gabarits-flux-de-travaux/controle-facture/` · slug : `gabarits-flux-de-travaux/controle-facture`
- Titre SEO (48 caractères) : Contrôle d'une facture fournisseur : gabarit PME
- Description SEO (147 caractères) : Contrôle d'une facture fournisseur : gabarit de départ de WorkStudio. Champs, étapes, validation humaine et points à valider avec votre conseiller.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Contrôle d'une facture fournisseur », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111, CL-M12, CL-M13*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Gabarit · Finance et documents**

# Contrôle d'une facture fournisseur.

Le gabarit Contrôle d'une facture fournisseur extrait les données de la facture (fournisseur, numéro, date, sous-total, TPS, TVQ, total, numéros d'inscription et NEQ), puis vérifie les calculs (TPS à 5 %, TVQ à 9,975 % du sous-total) et le format des numéros, et conclut « À PAYER »

[Voir tous les gabarits](/gabarits-flux-de-travaux/) · [Demander une démonstration](/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Le gabarit Contrôle d'une facture fournisseur extrait les données de la facture (fournisseur, numéro, date, sous-total, TPS, TVQ, total, numéros d'inscription et NEQ), puis vérifie les calculs (TPS à 5 %, TVQ à 9,975 % du sous-total) et le format des numéros, et conclut « À PAYER » ou « À VÉRIFIER ».

Un gabarit de flux de travaux est un enchaînement automatisé de tâches, fourni comme point de départ dans WorkStudio et à adapter à l'entreprise avant son déploiement.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## Ce que vous fournissez.

Chaque champ de départ est prérempli d'une donnée d'exemple pour un premier lancement sans saisie, sauf les adresses de courriel et les fichiers.

- **La facture.** Texte de la facture.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## Les étapes.

#### Extraire les données.

Un agent répond en JSON avec les clés fournisseur, numero, date, sous_total (avant taxes), tps, tvq, total, numero_tps, numero_tvq et neq ; la valeur est nulle si elle est absente.

#### Contrôler.

Un second agent vérifie que le sous-total, la TPS et la TVQ donnent le total à un cent près, que la TPS vaut 5 % du sous-total et la TVQ 9,975 % du sous-total, jamais de la TPS, et que les numéros d'inscription à la TPS (neuf chiffres, RT, quatre chiffres) et à la TVQ (dix chiffres, TQ, quatre chiffres) sont présents. Un petit fournisseur non inscrit est signalé « à vérifier », sans être déclaré fautif ; les anomalies sont listées.

#### Relire.

Vous relisez le texte produit, le corrigez au besoin, puis l'utilisez ou l'envoyez vous-même : le gabarit n'envoie rien.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## À adapter avant l'usage.

#### Ce qui s'adapte ici.

Le contrôle vise un fournisseur du Québec : TPS fédérale et TVQ seulement, avec les formes RT et TQ. Il contrôle la forme des numéros, pas leur existence auprès de Revenu Québec ou de l'Agence du revenu du Canada. Les numéros des exemples sont fictifs.

#### Ce qui vaut pour tous.

Les gabarits sont rédigés pour une PME du Québec : montants en dollars canadiens, TPS et TVQ quand une taxe entre en jeu, courriel et infolettre. Ils ne garantissent aucune conformité fiscale ou légale : les exemples sont fictifs, et votre comptable ou votre conseiller valide le résultat avant l'usage.

#### Rien n'est envoyé.

Le gabarit produit un texte à relire. Seuls cinq gabarits de la collection envoient un courriel, et chacun attend d'abord la validation d'une personne.

### Bloc 6 — FAQ (`block_faq`)

*Questions de la fiche : envoi, point propre au gabarit, adaptation au Québec. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Vos questions sur ce gabarit.

#### Ce gabarit envoie-t-il quelque chose à ma place ?

Non. Il produit un texte à relire ; vous l'utilisez ou l'envoyez vous-même. Seuls cinq gabarits de la collection envoient un courriel, et chacun attend d'abord la validation d'une personne.

#### Le gabarit paie-t-il la facture ?

Non. Il conclut « À PAYER » ou « À VÉRIFIER » avec la liste des anomalies. Le paiement et la décision restent à une personne.

#### Convient-il aux factures de mes fournisseurs ?

Il est écrit pour un fournisseur du Québec. Les exemples et les numéros sont fictifs, et c'est un agent qui contrôle : il ne remplace pas votre comptable. Les taxes des autres provinces ne sont pas gérées.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## Voyez-le à l'œuvre.

Une démonstration sur données fictives, pour voir ce que le gabarit prépare et où une personne garde la main.

[Demander une démonstration](/contact/?sujet=demonstration) · [Tous les gabarits](/gabarits-flux-de-travaux/)
