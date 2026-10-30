# Où sont vos données d'IA — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-ou-sont-vos-donnees-ia.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-ou-sont-vos-donnees-ia` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/guides/ou-sont-vos-donnees-ia/` · slug : `guides/ou-sont-vos-donnees-ia`
- Titre SEO (44 caractères) : Où sont vos données ? Stockage et traitement
- Description SEO (159 caractères) : Stockage, traitement et juridiction : trois questions pour savoir où sont vos données d'IA, et la liste des questions à poser à un fournisseur avant de signer.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : trois questions pour savoir où sont les données, sans promesse de résidence. · Affirmations : CL-E08, CL-E09, CL-75*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · Données et juridiction**

# Où sont vraiment vos données.

Stockage, traitement, juridiction : trois questions distinctes, et les questions à poser à un fournisseur d'IA. Nous ne promettons ni conformité ni résidence que nous ne pouvons pas prouver.

[Voir les engagements sur vos données](/vos-donnees/) · [Étude de déploiement](/contact/?sujet=etude-deploiement)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : les trois questions, la différence stockage et traitement, la juridiction. · Affirmations : CL-E08, CL-E09, CL-75*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

Savoir où sont vos données demande trois questions : où elles sont stockées, où elles sont traitées et à quelle juridiction est soumis le fournisseur. Un stockage au Canada n'implique pas un traitement au Canada. Un fournisseur soumis à une loi étrangère peut devoir remettre des données qu'il détient, même stockées ici.

La juridiction est l'ensemble des lois d'un pays qui s'appliquent à une entreprise. Le traitement est le moment où le modèle lit votre requête pour produire une réponse.

### Bloc 3 — Cartes (`block_cards`)

*Les trois questions, une par carte. · Affirmations : CL-E08, CL-E09*

Réglages : `columns=3`, `tone=sable`, `layout=grille`, `anchor_id=trois-questions`

## Stockage, traitement, juridiction.

#### Où est-ce stocké ?

Les fichiers, les sauvegardes et les journaux reposent quelque part. C'est le lieu que les fournisseurs annoncent le plus volontiers.

#### Où est-ce traité ?

Le modèle lit votre requête et calcule sa réponse quelque part. Ce lieu peut différer du lieu de stockage.

#### Quelle loi s'applique ?

Un fournisseur soumis à la juridiction d'un autre pays peut devoir lui remettre des données qu'il détient. Les lois d'ici s'appliquent aussi aux entreprises d'ici.

### Bloc 4 — Section (`block_section`)

*Services grand public : le partage des conversations est un réglage que l'utilisateur doit désactiver lui-même. · Affirmations : CL-E07, CL-E08*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=grand-public`

## Ce que disent les services grand public.

Dans certains services d'IA grand public, le partage des conversations pour améliorer les modèles est un réglage que l'utilisateur doit désactiver lui-même : le non-entraînement n'y est pas le réglage par défaut. Pour une grande plateforme d'API, la résidence au Canada peut couvrir le stockage sans couvrir le traitement des demandes.

Ces constats viennent de la documentation de chaque fournisseur. Ils ne disent rien de ce que fait un fournisseur donné aujourd'hui : relisez toujours sa page à jour.

### Bloc 5 — Section (`block_section`)

*Tableau des trois modes (chez vous, hébergé au Québec, via une API) : où sont les données, où est le traitement, quoi demander. · Affirmations : CL-72, CL-E01, CL-E02, CL-73, CL-S01, CL-77, CL-05, CL-87, CL-S02*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=trois-modes`

## Trois modes, trois réponses.

<table><caption>Où sont les données selon le mode</caption><thead><tr><th>Mode</th><th>Où sont les données</th><th>Où a lieu le traitement</th><th>Quoi demander</th></tr></thead><tbody><tr><th>Chez vous</th><td>Sur votre serveur ; Nexora AI n'y accède que si vous l'autorisez par écrit, pour une tâche précise.</td><td>Sur votre serveur, sauf un modèle externe que vous activez.</td><td>La liste des flux sortants (mises à jour, licences, modèle externe) avant la mise en service.</td></tr><tr><th>Hébergé au Québec</th><td>Dans l'infrastructure de Nexora AI, au Québec, sauvegardes comprises : c'est notre engagement écrit.</td><td>Dans la même infrastructure, sauf un service que vous activez.</td><td>L'adresse et le contrat du lieu, la localisation des sauvegardes, des journaux et des sous-traitants. Cette preuve est en préparation.</td></tr><tr><th>Via une API de modèles</th><td>Selon le fournisseur ; la passerelle de Nexora AI ne garde que des métadonnées d'usage (modèle, jetons, coût, durée), jamais le contenu des requêtes ni des réponses.</td><td>Chez le fournisseur du modèle choisi.</td><td>Le lieu de traitement, pas seulement de stockage, et la politique de données du fournisseur.</td></tr></tbody></table>Voir aussi le [déploiement](/deploiement/) chez vous ou hébergé au Québec.

### Bloc 6 — Section (`block_section`)

*Ce que la fiche d'un modèle dit et ne dit pas. · Affirmations : CL-S01, CL-75, CL-E08, CL-S02, CL-M06*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=fiche-modele`

## Ce que dit la fiche d'un modèle.

Dans le catalogue de Nexora AI, la fiche de chaque modèle indique son fournisseur, son lieu d'hébergement (Québec, Canada, États-Unis, Europe ou autre) et la politique de données que ce fournisseur déclare.

- **Ce qu'elle dit.** L'information déclarée au catalogue.
- **Ce qu'elle ne dit pas.** Qu'aucune loi étrangère ne s'applique, ni que le traitement a lieu au même endroit que l'hébergement.
C'est une information, pas une garantie de résidence. Voir la [passerelle d'API de modèles](/passerelle-api-modeles/) et la [liste des modèles](/modeles/).

Avant chaque appel à un fournisseur, Nexora Privacy Router évalue la requête : elle masque des renseignements évidents (courriel, téléphone, carte de crédit, NAS, IBAN, clés et secrets) ou la refuse, selon la politique de l'organisation. Sa détection est heuristique, elle ne repère ni les noms ni les adresses postales, et elle ne prouve pas où le fournisseur traite ensuite les données.

### Bloc 7 — Cartes (`block_cards`)

*Liste de questions à poser à un fournisseur d'IA. · Affirmations : CL-E08, CL-E09, CL-E05, CL-E03*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=questions-a-poser`

## Quoi demander à un fournisseur.

#### Où sont traitées mes requêtes ?

Le pays et le fournisseur d'hébergement, pas seulement le lieu de stockage.

#### Mes données entraînent-elles un modèle ?

Par défaut ou seulement si je l'active, et ce que dit le contrat.

#### Qui sont vos sous-traitants ?

Leur pays et leur rôle, dans un registre que je peux lire.

#### Quelle loi s'applique à votre entreprise ?

Et peut-elle vous obliger à remettre des données hébergées ici ?

#### Que gardez-vous de mes requêtes ?

Métadonnées seulement, ou contenu, et pour combien de temps.

#### Que se passe-t-il si un modèle tombe ?

Un basculement silencieux vers un autre fournisseur changerait le lieu de traitement.

### Bloc 8 — Section (`block_section`)

*Ce que Nexora AI documente par écrit : schéma des flux, lieu, sous-traitants ; documents types en préparation. · Affirmations : CL-05, CL-73, CL-E06, CL-87, CL-76*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=documents`

## Ce que Nexora AI documente par écrit.

Avant la mise en service, Nexora AI remet par écrit le schéma des flux : où les données sont stockées, quels services externes sont appelés, quelles sauvegardes existent. Dans le mode hébergé, le lieu d'hébergement, celui des sauvegardes et des journaux et la liste des sous-traitants sont précisés par écrit. Le système ne bascule jamais en silence vers un modèle externe.

Ces engagements s'appuient sur un contrat de traitement, un registre des sous-traitants et un journal d'accès. Ces documents types sont en préparation : aucun n'est encore disponible.

### Bloc 9 — FAQ (`block_faq`)

*Questions du guide : stockage au Canada, vérification, entraînement, mode API, preuve. · Affirmations : CL-E08, CL-E09, CL-E03, CL-S01, CL-02, CL-87, CL-S02, CL-M06, CL-T05, CL-PL01*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Où sont vos données : vos questions.

#### Un hébergement au Canada suffit-il ?

Pas à lui seul. Certains fournisseurs annoncent un stockage au Canada alors que le traitement des demandes s'effectue ailleurs, et un fournisseur soumis à une loi étrangère peut devoir remettre des données qu'il détient. Demandez où se fait le traitement et quelle juridiction s'applique.

#### Quelle différence entre stockage et traitement ?

Le stockage est l'endroit où reposent vos fichiers, sauvegardes et journaux. Le traitement est l'endroit où le modèle lit votre requête et calcule sa réponse. Les deux peuvent être dans des pays différents.

#### Comment vérifier où tourne un modèle ?

En le demandant par écrit au fournisseur, avec le pays et l'hébergeur du traitement, et en lisant son contrat et son registre de sous-traitants. Une fiche de catalogue indique ce que le fournisseur déclare ; elle ne le prouve pas.

#### Nexora AI utilise-t-elle mes données pour entraîner des modèles ?

Non. Nexora AI s'engage à n'utiliser jamais les données, documents, invites ni résultats d'un client pour entraîner ou ajuster un modèle. Cet engagement s'appuie sur un contrat de traitement en préparation.

#### Nexora AI prouve-t-elle que ses serveurs sont au Québec ?

Le mode hébergé s'engage à garder les données au Québec, mais la preuve technique (adresse, contrat, lieu des sauvegardes et des sous-traitants) est en préparation. Elle sera remise par écrit avant la mise en service.

#### Où sont mes données sur la plateforme à crédits de Nexora AI ?

Les documents et fichiers que vous gardez chez Nexora AI comptent dans l'espace disque de votre offre. La passerelle de modèles ne garde que des métadonnées d'usage (modèle, jetons, coût, durée), jamais le contenu des requêtes ni des réponses. Chaque modèle affiche son lieu d'hébergement et la politique de données de son fournisseur, et Nexora Privacy Router évalue chaque requête avant l'appel. Le lieu affiché informe, il ne garantit pas la résidence : le traitement a lieu chez le fournisseur du modèle choisi.

### Bloc 10 — Appel à l'action (`block_cta`)

*Appel à l'action : étude de déploiement. · Affirmations : CL-80, CL-05*

Réglages : `tone=sombre`

## Mettons vos flux à plat.

Une étude de déploiement dresse le schéma des flux de votre cas : où sont les données, ce qui sort, ce qui reste.

[Demander une étude](/contact/?sujet=etude-deploiement) · [Vos données](/vos-donnees/)
