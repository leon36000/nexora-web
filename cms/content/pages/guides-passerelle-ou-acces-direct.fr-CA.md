# Passerelle ou accès direct — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-passerelle-ou-acces-direct.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-passerelle-ou-acces-direct` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/guides/passerelle-ou-acces-direct/` · slug : `guides/passerelle-ou-acces-direct`
- Titre SEO (47 caractères) : Passerelle de modèles ou accès direct : choisir
- Description SEO (146 caractères) : Une passerelle ajoute un intermédiaire utile pour comparer des modèles ou garder une seule clé. Critères, limites et cas où l'accès direct suffit.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : choisir entre une passerelle et un accès direct, sans marque. · Affirmations : CL-27, CL-S04*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · Passerelle de modèles**

# Passerelle ou accès direct : comment choisir.

Une passerelle ajoute un intermédiaire et en retour une clé, un format et une mesure uniques. Voici les critères, côte à côte, et les cas où elle ne sert à rien.

[Voir la passerelle de Nexora AI](/passerelle-api-modeles/) · [Planifier un diagnostic](/contact/?sujet=diagnostic)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : quand la passerelle, quand l'accès direct, avec les deux termes définis. · Affirmations : CL-27, CL-S04, CL-S05*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Une passerelle de modèles ajoute un intermédiaire entre votre application et les fournisseurs d'IA. Elle devient utile quand vous comparez ou changez de modèle, ou quand vous voulez une seule clé, un seul plafond de dépense et une seule mesure de la consommation. Avec un seul fournisseur, un accès direct peut suffire.

Une passerelle de modèles est un point d'accès unique à plusieurs modèles d'IA. Un accès direct est un appel à l'API d'un seul fournisseur, avec sa clé et son contrat. La consommation se mesure en jetons, l'unité de texte que traite un modèle.

- **Une passerelle.** Une adresse, une clé, plusieurs modèles.
- **Un accès direct.** Un fournisseur, sa clé, son contrat.
- **Le bon choix.** Il dépend du nombre de modèles que vous comptez comparer.

### Bloc 3 — Section (`block_section`)

*Tableau des critères, sans marque : huit critères, deux colonnes. La latence n'est pas chiffrée (aucune mesure). · Affirmations : CL-S04, CL-S05, CL-S01, CL-S03, CL-M08*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=criteres`

## Les critères, côte à côte.

<table><caption>Accès direct et passerelle, critère par critère</caption><thead><tr><th>Critère</th><th>Accès direct</th><th>Passerelle</th></tr></thead><tbody><tr><th>Nombre de fournisseurs</th><td>Un seul : le montage le plus simple.</td><td>Plusieurs, derrière une seule adresse.</td></tr><tr><th>Clé et plafonds</th><td>Une clé par fournisseur, avec les réglages de chacun.</td><td>Une clé, avec plafond de dépense, expiration et limite de débit réglés au même endroit (Nexora AI API les offre).</td></tr><tr><th>Changer de modèle</th><td>Réécrire l'appel si le format du fournisseur diffère.</td><td>Changer l'identifiant du modèle dans la requête, si la passerelle suit le format que votre code parle.</td></tr><tr><th>Mesure de la consommation</th><td>Un relevé par fournisseur.</td><td>Un relevé unique, par jour et par modèle.</td></tr><tr><th>Latence ajoutée</th><td>Aucune : un seul saut.</td><td>Un saut de plus. Nexora AI n'a publié aucune mesure de cette latence.</td></tr><tr><th>Lieu de traitement</th><td>Celui du fournisseur, à lire dans son contrat.</td><td>Celui de chaque fournisseur derrière la passerelle ; la fiche de chaque modèle de Nexora AI l'affiche.</td></tr><tr><th>Contrat</th><td>Directement avec le fournisseur.</td><td>Avec l'exploitant de la passerelle, qui a ses propres contrats.</td></tr><tr><th>Frais</th><td>Le prix du fournisseur.</td><td>Le prix de la passerelle : le mode de calcul varie, à lire avant de choisir.</td></tr></tbody></table>

### Bloc 4 — Cartes (`block_cards`)

*Ce que la passerelle apporte, avec les fonctions de Nexora AI API à l'appui. · Affirmations : CL-S04, CL-S05, CL-S01, CL-S03*

Réglages : `columns=4`, `tone=clair`, `layout=grille`, `anchor_id=apports`

## Ce que la passerelle apporte.

Chaque ligne se vérifie dans la documentation de Nexora AI API.

#### Un format.

Le format de l'API d'OpenAI : vos bibliothèques et vos outils s'y branchent en changeant l'adresse de base et la clé.

→ [Changer l'adresse de base](/guides/api-compatible-openai/)

#### Une clé encadrée.

Plafond de dépense, expiration et limite de débit par clé ; la valeur de la clé n'est affichée qu'une fois.

#### Un lieu affiché.

Chaque fiche de modèle dit où il est hébergé et quelle politique de données son fournisseur déclare.

#### Un coût lisible.

Le prix en dollars canadiens par million de jetons, et le coût de chaque réponse complète.

→ [Voir les modèles](/modeles/)

### Bloc 5 — Section (`block_section`)

*Le coût en dépendance : intermédiaire, contrat, catalogue, point de passage des données. · Affirmations : CL-S02, CL-S06, CL-E08*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=dependance`

## Ce qu'elle coûte en dépendance.

Une passerelle crée toujours une dépendance, même quand elle est simple. Elle ajoute un maillon qui peut tomber, un contrat de plus à lire, un catalogue qui n'est pas le vôtre et un point par où passent vos requêtes.

- **Un maillon de plus.** Si le fournisseur d'un modèle est indisponible, la passerelle de Nexora AI répond par une erreur de passerelle et ne débite rien.
- **Un catalogue à suivre.** Vous utilisez les modèles que la passerelle publie, pas tous ceux que les fournisseurs vendent.
- **Un point de passage.** Ce que la passerelle garde de vos requêtes est une question à poser. Celle de Nexora AI ne conserve que des métadonnées d'usage : le modèle, les jetons, le coût et la durée.

### Bloc 6 — Section (`block_section`)

*Où passent les données : stockage et traitement, juridiction, renvoi vers le guide dédié et vers Vos données. · Affirmations : CL-E08, CL-E09, CL-75, CL-S01*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=donnees`

## Où passent vos données.

Avec une passerelle, le lieu de traitement est celui du fournisseur du modèle choisi. Certains fournisseurs annoncent un stockage des données au Canada alors que le traitement s'effectue ailleurs : la différence entre stockage et traitement est la première question à poser. Un fournisseur soumis à la juridiction d'un autre pays peut aussi être tenu de lui remettre des données qu'il détient.

Le guide [Où sont vraiment vos données](/guides/ou-sont-vos-donnees-ia/) détaille ces trois questions, et la page [Vos données](/vos-donnees/) liste les engagements de Nexora AI.

### Bloc 7 — Cartes (`block_cards`)

*Quand Nexora AI n'est pas le bon choix : quatre cas, dits sans détour. · Affirmations : CL-12, CL-86, CL-S01, CL-02*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=limites`

## Quand Nexora AI ne convient pas.

#### Un contrat direct est exigé.

Si votre organisation doit signer elle-même avec le fournisseur du modèle, un accès direct est plus simple.

#### Le modèle n'est pas au catalogue.

La passerelle ne sert que les modèles publiés dans son catalogue.

#### Vous voulez acheter aujourd'hui.

Le libre-service n'est pas ouvert à la vente : les comptes et les paiements ne fonctionnent qu'en mode test.

#### Un niveau de service est requis.

Aucun niveau de service n'est annoncé à ce jour ; la disponibilité et les délais se précisent au contrat.

### Bloc 8 — FAQ (`block_faq`)

*Questions du guide : une passerelle en vaut-elle la peine, latence, clés, lieu, changement de modèle. · Affirmations : CL-27, CL-S04, CL-S05, CL-M08, CL-E08, CL-12*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Passerelle ou accès direct : vos questions.

#### Faut-il une passerelle si je n'utilise qu'un modèle ?

Pas forcément. Avec un seul fournisseur, un accès direct est plus simple et supprime un intermédiaire. Une passerelle devient utile quand vous comparez ou changez de modèle, ou quand vous voulez une clé, un plafond et une mesure uniques.

#### Une passerelle ralentit-elle les appels ?

Elle ajoute un saut réseau. Nexora AI n'a publié aucune mesure de la latence ajoutée par sa passerelle : nous n'en annonçons aucune. Mesurez-la sur votre cas avant de décider.

#### Puis-je changer de modèle sans réécrire mon code ?

Oui, si la passerelle suit le format que votre code parle. Avec Nexora AI API, qui suit le format de l'API d'OpenAI, il suffit de changer l'identifiant du modèle dans la requête.

#### Où mes requêtes sont-elles traitées ?

Chez le fournisseur du modèle choisi. La fiche de chaque modèle de Nexora AI indique son lieu d'hébergement et la politique de données déclarée par son fournisseur : c'est une information du catalogue, pas une garantie de résidence.

#### Puis-je acheter l'accès à Nexora AI API aujourd'hui ?

Pas en libre-service : les comptes et les paiements ne fonctionnent qu'en mode test et aucun paiement réel n'est accepté. Pour un projet, écrivez-nous : nous commençons par un diagnostic.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : diagnostic, puis passerelle. · Affirmations : CL-80, CL-12*

Réglages : `tone=sombre`

## Parlons de votre usage.

Dites-nous quels modèles vous voulez comparer et où vos données doivent rester. Nous commençons par un diagnostic.

[Planifier un diagnostic](/contact/?sujet=diagnostic) · [Voir la passerelle](/passerelle-api-modeles/)
