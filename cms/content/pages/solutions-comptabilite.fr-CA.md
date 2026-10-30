# Comptabilité — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-comptabilite.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-comptabilite` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/solutions/comptabilite/` · slug : `solutions/comptabilite`
- Titre SEO (36 caractères) : Pré-saisie comptable par IA pour PME
- Description SEO (152 caractères) : L'IA lit vos pièces, prépare la pré-saisie et signale les écarts : votre comptable relit et décide. Le rapprochement bancaire n'est pas livré à ce jour.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution comptabilité : l'IA prépare, le comptable décide. · Affirmations : CL-125, CL-101*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Comptabilité**

# Une pré-saisie prête. Le comptable décide.

Le système lit vos pièces, prépare la pré-saisie (les lignes prêtes à être reprises en comptabilité) et signale les écarts. Votre comptable relit, corrige et valide : l'IA prépare, elle ne comptabilise pas.

[Demander une démonstration](/contact/?sujet=demonstration) · [Voir toutes les solutions](/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : exemple construit d'un cabinet comptable en fin de mois. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=probleme`

## La fin de mois, c'est la saisie.

Un petit cabinet comptable reçoit de ses clients des factures, des notes de frais et des relevés, dans toutes les formes possibles : photos de reçus, PDF, courriels transférés. À la fin du mois, l'adjointe relit des montants et retape des lignes, pendant que le comptable aurait des clients à conseiller.

Cet exemple est construit pour illustrer le principe ; ce n'est pas le résultat d'un client.

- **Des pièces dans tous les formats.** Courriels, photos, scans, PDF.
- **Des contrôles à répéter.** Les montants hors taxes, les taxes et le total doivent concorder.
- **Du temps de conseil perdu.** Ce que le client paie vraiment, c'est le jugement du comptable.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : lecture, contrôles de cohérence, table, relecture. · Affirmations : CL-101, CL-121, CL-125, CL-21, CL-P01*

Réglages : `columns=4`, `tone=clair`, `layout=etapes`, `anchor_id=systeme`

## De la pièce à la pré-saisie.

Le comptable définit les champs et les règles de contrôle ; le système les applique pièce par pièce, avec la lecture de documents par IA de WorkStudio.

#### Il lit les pièces.

Factures, devis, bons de commande, notes de frais : des modèles de départ existent pour ces quatre types.

#### Il contrôle.

Il vérifie que le hors taxes et les taxes donnent le total, à quelques sous près, et marque les pièces douteuses.

#### Il prépare.

Une ligne de pré-saisie par pièce, avec les champs convenus avec le comptable (catégorie, fournisseur, projet).

#### Il attend.

Le comptable relit les lignes, corrige et valide. Rien n'est enregistré avant.

### Bloc 4 — Cartes (`block_cards`)

*Ce que reçoit l'équipe : mosaïque de bénéfices (bento), dont le renvoi vers OPSYS-AI pour la construction (statut pilote). · Affirmations : CL-125, CL-D05, CL-101*

Réglages : `columns=2`, `tone=sombre`, `layout=bento`, `anchor_id=equipe`

## Un dossier relu, pas ressaisi.

Une table de pièces prêtes à relire, avec les écarts en tête.

#### Une table de pré-saisie.

Une ligne par pièce, avec l'indicateur « à vérifier ».

#### Les motifs des écarts.

Champ manquant, valeur illisible, total qui ne concorde pas.

#### Du temps pour le jugement.

Le comptable consacre son temps à conseiller plutôt qu'à retaper.

#### Pour la construction, OPSYS-AI va plus loin.

Son département Finance (M5) vise à préparer la facturation et à suivre les coûts de chantier. OPSYS-AI est un produit en développement : une lecture ciblée de coûts est qualifiée localement, mais la comptabilité complète, la paie et les connecteurs ne sont pas démontrés.

→ [Découvrir OPSYS-AI](/opsys-ai/)

### Bloc 5 — Section (`block_section`)

*Bénéfice attendu, sans chiffre ; lien diagnostic. · Affirmations : CL-14, CL-09, CL-125*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=benefice`

## Du temps rendu au conseil.

Le bénéfice attendu : moins de ressaisie et des erreurs repérées plus tôt, donc plus de temps pour ce que le client paie vraiment, le jugement de son comptable. Aucun gain chiffré n'est annoncé ; il se mesure pendant un pilote, sur vos propres dossiers.

[Planifier un diagnostic](/contact/?sujet=diagnostic) pour définir vos champs et vos règles de contrôle.

### Bloc 6 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, et ce qui n'est pas livré (rapprochement bancaire) ; carte données avec lien Vos données. · Affirmations : CL-125, CL-126, CL-128, CL-M15, CL-06, CL-E01, CL-E02, CL-E03, CL-E04, CL-E05*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## Le comptable garde le dernier mot.

#### Le comptable garde la décision.

Aucune écriture n'est enregistrée sans sa validation.

#### Aucun lien bancaire.

Le rapprochement bancaire n'est pas livré dans WorkStudio. Il peut être étudié sur mesure, à partir de relevés que vous exportez, sans connexion à votre banque.

#### Votre logiciel, à qualifier.

L'écriture dans votre logiciel comptable passe par un connecteur qui se qualifie au diagnostic, logiciel par logiciel.

#### Vos règles fiscales.

Les modèles de lecture de documents ne sont pas encore adaptés au Québec. Taxes, catégories et plan comptable du Québec se définissent avec vous et se vérifient sur vos pièces.

#### Aucun conseil comptable.

Le système prépare et contrôle ; il ne conseille pas. Les décisions restent celles de votre comptable.

#### Vos données restent à vous.

Sur votre serveur ou chez nous, au Québec : jamais utilisées pour entraîner un modèle, jamais vendues. Un service externe de lecture n'entre qu'avec votre activation explicite, consignée par écrit.

→ [Lire nos engagements](/vos-donnees/)

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à la solution comptabilité. · Affirmations : CL-125, CL-126, CL-132, CL-10, CL-PL03, CL-T01, CL-T06, CL-T04, CL-T09, CL-12, CL-T02*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Comptabilité : vos questions.

#### L'IA fait-elle la comptabilité ?

Non. Elle prépare la pré-saisie et signale les écarts. Les écritures et les décisions restent à votre comptable.

#### Peut-on automatiser le rapprochement bancaire ?

Pas avec un produit livré à ce jour. Une étude sur mesure est possible, à partir de relevés exportés, sans connexion bancaire.

#### Mon comptable doit-il changer d'outil ?

Non, en principe : la pré-saisie se range dans une table, et la suite dépend du logiciel qu'il utilise, que nous qualifions avec lui.

#### Mes pièces quittent-elles mon serveur ?

Pas si la lecture se fait avec un modèle sur votre serveur. Un service externe de lecture est possible, seulement avec votre accord écrit, et il est indiqué.

#### Combien cela coûte-t-il ?

Pour la pré-saisie comptable, il n'y a pas encore de prix public. Deux choses se paient. L'accompagnement (diagnostic, installation, configuration) : une estimation écrite suit le diagnostic et dit ce qui est inclus et ce qui ne l'est pas. L'usage de la plateforme : en crédits, car tout ce qui appelle un modèle d'IA en consomme ; un abonnement donne des crédits et de l'espace chaque mois, sinon on recharge. Les prix de la plateforme s'afficheront sur la page Tarifs dès leur publication.

#### Qu'est-ce qui consomme des crédits ici ?

Chaque fois que le système appelle un modèle d'IA hébergé par Nexora AI pour lire une pièce, en extraire les champs ou contrôler un total, il consomme des crédits : un crédit vaut un cent canadien de jetons au prix du catalogue de modèles. Les étapes qui n'appellent aucun modèle n'en consomment pas. Quand il n'en reste plus, l'appel est refusé avec un message qui renvoie vers la recharge et l'abonnement. La plateforme à crédits n'est pas encore ouverte à la vente.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : diagnostic ; partenaire d'ici. · Affirmations : CL-01, CL-04*

Réglages : `tone=sombre`

## Parlons de votre fin de mois.

Décrivez-nous vos pièces et votre logiciel. Nous vous disons ce qui se prépare, ce qui se relie et ce qui reste à votre comptable. Un partenaire d'ici installe, exploite et forme avec vous.

[Planifier un diagnostic](/contact/?sujet=diagnostic) · [Voir les factures](/solutions/factures/)
