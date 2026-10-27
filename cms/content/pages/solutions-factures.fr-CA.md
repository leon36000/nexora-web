# Factures — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-factures.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-factures` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/solutions/factures/` · slug : `solutions/factures`
- Titre SEO (41 caractères) : Traitement automatisé des factures en PME
- Description SEO (155 caractères) : Un système lit vos factures fournisseurs, extrait les montants, signale ce qui ne concorde pas et range tout dans une table. Une personne approuve ensuite.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution factures. · Affirmations : CL-101, CL-121*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Factures**

# Des factures lues. Des écarts signalés.

Le système lit les factures de vos fournisseurs, extrait les champs que vous avez définis et vous montre d'abord ce qui est douteux. Le paiement et la comptabilité restent entre les mains d'une personne.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir toutes les solutions](/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : exemple d'un atelier qui reçoit des formats variés. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=probleme`

## La même saisie, deux fois.

Imaginons un atelier d'usinage. Un fournisseur de métal envoie un PDF par courriel, un transporteur une photo prise au quai, un autre une facture scannée en travers. Quelqu'un retape les numéros, les dates et les montants, puis cherche qui doit approuver.

L'exemple est construit pour illustrer le principe ; ce n'est pas le résultat d'un client.

- **Des formats variés.** PDF numérique, scan, photo : chacun se lit différemment.
- **Des erreurs de frappe.** Un montant inversé passe jusqu'à l'approbation, voire au paiement.
- **Une file sans visibilité.** Personne ne voit d'un coup d'œil ce qui est reçu, vérifié, approuvé.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : lecture, extraction, vérification, rangement. · Affirmations : CL-101, CL-121, CL-21*

Réglages : `columns=4`, `tone=sable`, `layout=etapes`, `anchor_id=systeme`

## Ce que fait le système.

Les étapes sont celles d'un flux de travaux WorkStudio : un fichier entre, une ligne de table en sort.

#### Il lit.

Un PDF numérique est lu directement ; une image ou un PDF scanné passe par un modèle de lecture de documents. Les scans se lisent plus lentement.

#### Il extrait.

Vous définissez les champs (numéro, date, fournisseur, montants, taxes, numéro de projet) ; le système les cherche dans chaque pièce.

#### Il vérifie.

Un champ obligatoire manquant, une valeur illisible ou un total qui ne concorde pas : la pièce est marquée « à vérifier », avec le motif.

#### Il range.

Une ligne par pièce dans une table, prête pour la suite. La suite attend une personne.

### Bloc 4 — Section (`block_section`)

*Ce que reçoit l'équipe. · Affirmations : CL-101, CL-121*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=equipe`

## Ce que reçoit l'équipe.

L'équipe ouvre une table, pas une pile de courriels. Les pièces sûres se parcourent vite ; celles qui sont douteuses remontent en tête.

- **Une table de pièces.** Une ligne par facture, avec les champs que vous avez choisis.
- **Un indicateur « à vérifier ».** Avec le motif : champ manquant, valeur illisible, total qui ne concorde pas.
- **Une conclusion simple.** Le modèle de départ « contrôle d'une facture fournisseur » conclut « à payer » ou « à vérifier ».
- **Le texte lu.** Le document tel qu'il a été lu est conservé, pour comparer avec l'original.

### Bloc 5 — Section (`block_section`)

*Bénéfice attendu, sans chiffre. · Affirmations : CL-14, CL-09*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=benefice`

## Le bénéfice attendu.

Moins de ressaisie, des erreurs repérées avant l'approbation plutôt qu'après le paiement, une vue claire de ce qui reste à traiter. Nous n'annonçons aucun pourcentage de précision ni aucun temps gagné : la qualité de lecture dépend de vos pièces et se mesure pendant un pilote, sur vos propres factures.

### Bloc 6 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, y compris les limites. · Affirmations : CL-128, CL-21, CL-125, CL-111, CL-06*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## Ce qui reste sous votre contrôle.

#### Aucun paiement automatique.

Le système ne paie rien. L'approbation et le paiement restent à une personne.

#### Aucune écriture sans validation.

L'écriture dans votre logiciel comptable passe par un connecteur à qualifier, après validation. Tous les logiciels ne se relient pas de la même façon.

#### Vos champs, vos taxes.

Les modèles de départ sont généraux et ne suivent pas les règles fiscales du Québec : vos champs (TPS, TVQ, numéro de projet) se définissent avec nous, puis se vérifient sur vos pièces.

#### Une personne relit les doutes.

Tout ce qui est marqué « à vérifier » passe sous les yeux de quelqu'un.

#### Le lieu de lecture est un choix.

Un modèle de lecture sur votre serveur garde les documents chez vous ; un service externe est un choix écrit et indiqué.

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à la solution factures. · Affirmations : CL-101, CL-125, CL-132*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Factures : vos questions.

#### Lit-il les factures scannées de travers ?

Il lit les images et les PDF scannés avec un modèle de lecture de documents, plus lentement qu'un PDF numérique. La qualité dépend de la netteté du scan ; ce qui est douteux est marqué « à vérifier ».

#### Se relie-t-il à mon logiciel comptable ?

Peut-être : cela dépend du logiciel. Nous le vérifions au diagnostic. Sans connexion, la table peut servir de base à une saisie plus rapide, validée par votre comptable.

#### Et les taxes du Québec ?

Elles ne sont pas gérées par défaut. Nous définissons avec vous les champs de taxes à extraire et les vérifications à faire, puis nous les mettons à l'épreuve sur vos pièces.

#### Peut-on aussi traiter devis et notes de frais ?

Des modèles de départ existent pour les devis, les bons de commande et les notes de frais. Ils se personnalisent comme celui des factures.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : démonstration. · Affirmations : CL-01*

Réglages : `tone=sombre`

## Voir vos factures lues.

Nous préparons une démonstration sur des factures fictives, puis nous parlons de vos pièces, de vos champs et de votre comptabilité.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir la comptabilité](/solutions/comptabilite/)
