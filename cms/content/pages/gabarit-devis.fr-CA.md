# Devis client — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-devis.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-devis` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/gabarits-flux-de-travaux/devis/` · slug : `gabarits-flux-de-travaux/devis`
- Titre SEO (41 caractères) : Devis client : gabarit de flux de travaux
- Description SEO (140 caractères) : Devis client : gabarit de départ de WorkStudio pour PME. Champs, étapes, validation humaine et ce qui reste à valider avec votre conseiller.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Devis client », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111, CL-M12, CL-M13*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Gabarit · Ventes et clients**

# Devis client.

Le gabarit Devis client rédige un devis structuré à partir du client et de ses prestations, prix unitaires avant taxes : un tableau, le sous-total, la TPS à 5 %, la TVQ à 9,975 % calculée sur le sous-total, le total en dollars canadiens, la validité et les conditions de paiement.

[Voir tous les gabarits](/gabarits-flux-de-travaux/) · [Demander une démonstration](/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M12, CL-M13*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Le gabarit Devis client rédige un devis structuré à partir du client et de ses prestations, prix unitaires avant taxes : un tableau, le sous-total, la TPS à 5 %, la TVQ à 9,975 % calculée sur le sous-total, le total en dollars canadiens, la validité et les conditions de paiement. Une personne relit le texte avant de l'envoyer.

Un gabarit de flux de travaux est un enchaînement automatisé de tâches, fourni comme point de départ dans WorkStudio et à adapter à l'entreprise avant son déploiement.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M12, CL-M13*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## Ce que vous fournissez.

Chaque champ de départ est prérempli d'une donnée d'exemple pour un premier lancement sans saisie, sauf les adresses de courriel et les fichiers.

- **Le client.** Nom et coordonnées du client.
- **Les prestations.** Prestations, quantités et prix unitaires avant taxes.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M12, CL-M13*

Réglages : `columns=2`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## Les étapes.

#### Rédiger le devis.

Un agent présente un tableau (désignation, quantité, prix unitaire, total avant taxes), puis le sous-total, la TPS à 5 % et la TVQ à 9,975 %, chacune calculée sur le sous-total, jamais sur la TPS, et arrondie au cent. Il ajoute le total taxes incluses, la validité de trente jours, le paiement net à trente jours et, en en-tête, les numéros TPS, TVQ et NEQ à compléter.

#### Relire.

Vous relisez le texte produit, le corrigez au besoin, puis l'utilisez ou l'envoyez vous-même : le gabarit n'envoie rien.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M12, CL-M13*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## À adapter avant l'usage.

#### Ce qui s'adapte ici.

Les numéros d'inscription à la TPS et à la TVQ et le numéro d'entreprise du Québec (NEQ) restent entre crochets, à compléter. Une prestation exonérée de taxes, ou une entreprise non inscrite, est signalée entre crochets plutôt que devinée. Seules la TPS fédérale et la TVQ sont prévues : les taxes d'autres provinces, comme la taxe de vente harmonisée, ne le sont pas.

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

#### Le gabarit calcule-t-il la TPS et la TVQ ?

Oui, par sa consigne : la TPS à 5 % et la TVQ à 9,975 %, chacune sur le sous-total avant taxes et arrondie au cent. C'est un agent qui calcule à partir du texte, pas un logiciel de comptabilité : relisez les montants avant d'envoyer le devis.

#### Convient-il à mon entreprise ?

Il part d'un devis d'une entreprise du Québec, avec des exemples fictifs. Votre statut d'inscription aux taxes, vos prestations exonérées et vos conditions ne sont pas devinés : votre comptable ou votre conseiller valide le devis avant l'envoi.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## Voyez-le à l'œuvre.

Une démonstration sur données fictives, pour voir ce que le gabarit prépare et où une personne garde la main.

[Demander une démonstration](/contact/?sujet=demonstration) · [Tous les gabarits](/gabarits-flux-de-travaux/)
