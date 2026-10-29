# Passerelle d'API de modèles — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `passerelle-api-modeles.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `passerelle-api-modeles` · langue : `fr-CA` · statut visé : `published` · noindex : non
- Route : `/passerelle-api-modeles/` · slug : `passerelle-api-modeles`
- Titre SEO (47 caractères) : Passerelle d'API de modèles d'IA, format OpenAI
- Description SEO (152 caractères) : Une seule API au format OpenAI pour plusieurs modèles d'IA : prix en dollars canadiens par jeton, lieu d'hébergement de chaque modèle, clés et plafonds.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la passerelle : une API au format OpenAI, des prix en dollars canadiens et le lieu d'hébergement de chaque modèle, avec l'état réel de la vente. · Affirmations : CL-27, CL-S01, CL-S04, CL-12*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Produit · Modèles et API**

# Une API. Plusieurs modèles. Des prix lisibles.

Nexora AI API est une passerelle de modèles au format OpenAI : vous changez l'adresse de base et la clé, le reste de votre code ne bouge pas. Chaque modèle affiche son prix en dollars canadiens et son lieu d'hébergement. Les offres en libre-service ne sont pas encore ouvertes à la vente : les paiements ne fonctionnent qu'en mode test.

[Voir les modèles](/modeles/) · [Lire la documentation](/docs/api/)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce qu'est une passerelle de modèles, définie en une phrase, avec le jeton défini au premier usage. · Affirmations : CL-27, CL-S04, CL-S03*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## Une passerelle, en une phrase.

Une passerelle de modèles est un point d'accès unique à plusieurs modèles d'IA : votre application appelle une seule adresse avec une seule clé, et la passerelle transmet chaque requête au modèle que vous avez choisi, puis mesure la consommation. Nexora AI API suit le format de l'API d'OpenAI : les bibliothèques et les outils qui parlent ce format s'y branchent en changeant l'adresse de base et la clé.

Un jeton est l'unité de texte que traite un modèle. C'est lui qui sert de mesure pour le prix et pour la consommation.

- **Un point d'accès.** Une adresse, une clé, plusieurs modèles.
- **Un format connu.** Celui de l'API d'OpenAI, pour ne pas réécrire votre code.
- **Une mesure claire.** Chaque réponse complète porte le coût de la requête.

### Bloc 3 — Cartes (`block_cards`)

*Les six fonctions de la passerelle, chacune tirée de la documentation publique de l'API. · Affirmations : CL-S04, CL-S05, CL-S01, CL-S03, CL-S06, CL-S02*

Réglages : `columns=3`, `tone=sable`, `layout=grille`, `anchor_id=fonctions`

## Ce que la passerelle fait.

Chaque ligne se vérifie dans la documentation de l'API.

#### Un format connu.

Conversation, embeddings (des textes transformés en suites de nombres que l'on peut comparer) et liste des modèles, avec diffusion en continu, outils et formats de réponse.

#### Des clés encadrées.

Chaque clé peut recevoir un plafond de dépense, une expiration et une limite de débit. Sa valeur n'est affichée qu'une fois ; seule son empreinte est conservée.

#### Le lieu affiché.

Chaque modèle indique où il est hébergé, avec la politique de données déclarée par son fournisseur.

#### Facturé au jeton.

Prix en dollars canadiens par million de jetons, entrée et sortie séparées. Chaque requête est réglée au coût réel.

#### Des erreurs lisibles.

Les erreurs suivent le format d'OpenAI. Si le fournisseur du modèle est indisponible, rien n'est débité.

#### Aucun contenu conservé.

Les événements d'usage ne contiennent que des métadonnées : le modèle, les jetons, le coût et la durée.

### Bloc 4 — Cartes (`block_cards`)

*Quatre étapes de la clé au premier appel, avec l'état réel : comptes et paiements en mode test. · Affirmations : CL-27, CL-S01, CL-S05, CL-S04, CL-S03, CL-12*

Réglages : `columns=4`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## De la clé au premier appel.

Les comptes et les paiements ne fonctionnent qu'en mode test pour l'instant : le parcours ci-dessous décrit le fonctionnement, pas une offre ouverte à la vente.

#### Choisissez un modèle.

Le catalogue donne l'identifiant, le prix, le contexte et le lieu d'hébergement de chacun.

→ [Voir le catalogue](/modeles/)

#### Créez une clé.

Dans l'espace client, avec un plafond de dépense si vous le souhaitez.

#### Appelez l'API.

Même format qu'OpenAI : changez l'adresse de base et la clé.

→ [Lire la documentation](/docs/api/)

#### Suivez l'usage.

Requêtes, jetons et coût, par jour et par modèle, dans l'espace client.

### Bloc 5 — Section (`block_section`)

*Le lieu d'hébergement affiché : une information du catalogue, pas une garantie de résidence ; renvoi vers le déploiement et les engagements sur les données. · Affirmations : CL-S01, CL-E08, CL-E09, CL-75, CL-02*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=lieu`

## Le lieu, dit sans détour.

Le lieu d'hébergement affiché sur chaque fiche vient du catalogue publié : c'est une information, pas une garantie de résidence. Un modèle hébergé hors du Québec traite vos requêtes hors du Québec. Certains fournisseurs annoncent un stockage des données au Canada alors que le traitement des demandes s'effectue ailleurs : la différence entre stockage et traitement est une question à poser. Un fournisseur soumis à la juridiction d'un autre pays peut aussi être tenu de lui remettre des données qu'il détient, même stockées au Canada.

Quand la résidence des données est une exigence, le bon choix peut être un système installé chez vous ou hébergé au Québec : voir le [déploiement](/deploiement/) et les [engagements sur vos données](/vos-donnees/).

- **Ce que la fiche dit.** Le fournisseur, le lieu d'hébergement et la politique de données qu'il déclare.
- **Ce qu'elle ne dit pas.** Qu'aucune loi étrangère ne s'applique : un hébergement au Québec n'écarte pas, à lui seul, les lois qui s'appliquent.

### Bloc 6 — Cartes (`block_cards`)

*Limites à connaître : libre-service non ouvert, prix de développement, un seul choix par requête, pas de niveau de service annoncé. · Affirmations : CL-12, CL-S04, CL-86*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=limites`

## Limites à connaître.

#### Pas encore en vente.

Les offres en libre-service (serveurs, catalogue de modèles à crédits, agents hébergés) ne sont pas ouvertes à la vente : les comptes et les paiements ne fonctionnent qu'en mode test et aucun paiement réel n'est accepté.

#### Pas de prix publié.

Les prix du catalogue actuel sont des prix de développement : aucun prix n'est encore publié.

#### Un seul choix par requête.

Une requête renvoie un seul choix, et les paramètres propres à un fournisseur sont ignorés.

#### Pas de niveau de service annoncé.

La disponibilité et les délais de réponse se précisent au contrat.

### Bloc 7 — FAQ (`block_faq`)

*Questions de la passerelle, réponse d'abord : définition, compatibilité, facturation, lieu, données, état de la vente, utilité d'une passerelle, changement de modèle. · Affirmations : CL-27, CL-S04, CL-S03, CL-S01, CL-S02, CL-12, CL-80*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Passerelle d'API : vos questions.

#### Qu'est-ce qu'une passerelle d'API de modèles ?

Un point d'accès unique à plusieurs modèles d'IA. Votre application appelle une seule adresse avec une seule clé ; la passerelle transmet chaque requête au modèle choisi et mesure la consommation.

#### L'API de Nexora AI est-elle compatible avec celle d'OpenAI ?

Oui, pour la conversation (avec diffusion en continu, outils et formats de réponse), les embeddings et la liste des modèles : il suffit de changer l'adresse de base et la clé. Une requête renvoie un seul choix, et les paramètres propres à un fournisseur sont ignorés.

#### Comment la consommation est-elle facturée ?

Au jeton, en dollars canadiens. Chaque requête réserve d'abord son coût maximal, puis est réglée au coût réel d'après les jetons d'entrée et de sortie ; le reste est libéré. Sans solde suffisant, l'API répond par une erreur de paiement avant tout appel au modèle.

#### Où sont hébergés les modèles ?

Chaque fiche du catalogue indique le lieu d'hébergement du modèle (Québec, Canada, États-Unis, Europe ou autre) et la politique de données déclarée par son fournisseur. C'est une information du catalogue, pas une garantie de résidence.

#### Nexora AI conserve-t-elle le contenu de mes requêtes ?

Non. Les événements d'usage de la passerelle ne contiennent que des métadonnées : le modèle, les jetons, le coût et la durée. La politique de données du fournisseur du modèle est affichée sur sa fiche.

#### Puis-je acheter l'accès aujourd'hui ?

Pas en libre-service : les comptes et les paiements ne fonctionnent qu'en mode test et aucun paiement réel n'est accepté. Pour un projet, écrivez-nous : nous commençons par un diagnostic du cas visé.

#### Faut-il une passerelle si j'utilise un seul modèle ?

Pas forcément. Une passerelle ajoute un intermédiaire ; elle devient utile quand vous comparez ou changez de modèle, ou quand vous voulez une seule clé, un seul plafond de dépense et une seule mesure de la consommation. Si un seul fournisseur vous suffit, un accès direct peut être plus simple.

#### Puis-je changer de modèle sans réécrire mon code ?

Oui : le modèle se choisit par un identifiant dans la requête. Changez l'identifiant, gardez le reste.

### Bloc 8 — Appel à l'action (`block_cta`)

*Appel à l'action : diagnostic, puis catalogue. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Parlons de votre usage.

Dites-nous quels modèles vous voulez comparer et où vos données doivent rester. Nous commençons par un diagnostic.

[Planifier un diagnostic](/contact/) · [Voir les modèles](/modeles/)
