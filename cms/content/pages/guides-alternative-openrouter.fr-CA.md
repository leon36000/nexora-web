# OpenRouter et Nexora AI API — fr-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-alternative-openrouter.fr-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-alternative-openrouter` · langue : `fr-CA` · statut visé : `draft` · noindex : oui
- Route : `/guides/alternative-openrouter/` · slug : `guides/alternative-openrouter`
- Titre SEO (44 caractères) : OpenRouter et Nexora AI API : ce qui diffère
- Description SEO (154 caractères) : Comparatif de faits datés et sourcés entre OpenRouter et Nexora AI API : format, catalogue, monnaie, données, lieu de traitement et quand choisir l'autre.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse : un comparatif de faits datés et sourcés, sans adjectif de valeur. Page à relire avant publication. · Affirmations : CL-27, CL-X01, CL-S01*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Comparatif · Faits lus le 29 octobre 2026**

# OpenRouter et Nexora AI API : ce qui diffère.

Deux passerelles de modèles au format de l'API d'OpenAI. Un tableau de faits datés et sourcés de chaque côté, sans adjectif de valeur, et une section pour dire quand choisir l'autre.

[Voir la passerelle de Nexora AI](/passerelle-api-modeles/) · [Passerelle ou accès direct](/guides/passerelle-ou-acces-direct/)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que sont les deux passerelles, ce qui les distingue, l'état de la vente. · Affirmations : CL-27, CL-X01, CL-X02, CL-X07, CL-S01, CL-12*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## La réponse en bref.

OpenRouter et Nexora AI API sont deux passerelles de modèles au format de l'API d'OpenAI. OpenRouter annonce plus de cinq cents modèles et facture en dollars américains. Nexora AI API a un catalogue limité aux modèles publiés sur sa page Modèles, des prix en dollars canadiens et la fiche de chaque modèle avec son lieu d'hébergement. Son libre-service n'est pas encore ouvert à la vente.

Cette page est un comparatif de faits, pas un classement : chaque fait d'OpenRouter est daté et renvoie à sa source publique.

### Bloc 3 — Section (`block_section`)

*Tableau de faits : OpenRouter (lu le 29/10/2026, avec sources) et Nexora AI API (registre), sans adjectif de valeur. · Affirmations : CL-X01, CL-X02, CL-X03, CL-X04, CL-X05, CL-X06, CL-X07, CL-S01, CL-S02, CL-S03, CL-M06, CL-86, CL-12*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=faits`

## Ce que chacun fait.

<table><caption>Faits d'OpenRouter lus le 29 octobre 2026 et faits de Nexora AI API</caption><thead><tr><th>Critère</th><th>OpenRouter (lu le 29 octobre 2026)</th><th>Nexora AI API</th></tr></thead><tbody><tr><th>Format de l'API</th><td>Interface au format de l'API d'OpenAI (points d'accès /completions et /chat/completions).</td><td>Format de l'API d'OpenAI : conversation, embeddings, liste des modèles.</td></tr><tr><th>Catalogue</th><td>Plus de cinq cents modèles et plus de quatre-vingts fournisseurs annoncés (formules payantes).</td><td>Les modèles publiés sur la page Modèles.</td></tr><tr><th>Monnaie</th><td>Dollars américains.</td><td>Dollars canadiens, par million de jetons.</td></tr><tr><th>Frais</th><td>Inférence au prix de liste du fournisseur, sans majoration ; frais à l'achat de crédits : 5,5 % (Standard), 8 % (Business).</td><td>Aucun prix publié aujourd'hui : les prix du catalogue actuel sont des prix de développement.</td></tr><tr><th>Journalisation</th><td>Métadonnées de base ; invites et réponses non journalisées par défaut ; option de journalisation contre un rabais d'un pour cent.</td><td>Événements d'usage limités aux métadonnées : modèle, jetons, coût, durée.</td></tr><tr><th>Lieu de traitement</th><td>Routage régional pour l'Europe et les États-Unis (Business, Enterprise) ; la page des tarifs ne mentionne pas de routage canadien.</td><td>Lieu d'hébergement de chaque modèle affiché sur sa fiche : une information du catalogue, pas une garantie de résidence.</td></tr><tr><th>Politiques de données</th><td>Routage selon les politiques de données à partir de la formule Standard.</td><td>Nexora Privacy Router incluse : masquage de six genres de renseignements, refus selon la politique, journal sans contenu.</td></tr><tr><th>Niveau de service</th><td>Contractuel seulement avec la formule Enterprise.</td><td>Aucun niveau de service annoncé.</td></tr><tr><th>Achat</th><td>Inscription et achat de crédits en libre-service.</td><td>Libre-service non ouvert : les paiements ne fonctionnent qu'en mode test.</td></tr></tbody></table>Sources d'OpenRouter, lues le 29 octobre 2026 : la [page des tarifs](https://openrouter.ai/pricing) et la [foire aux questions](https://openrouter.ai/docs/faq). Ces pages changent : les faits sont revérifiés à chaque publication et tous les trois mois.

### Bloc 4 — Section (`block_section`)

*Données et lieu de traitement : divulgation du fournisseur amont, limites du refus de collecte, stockage et traitement. · Affirmations : CL-M09, CL-M06, CL-E08, CL-E09, CL-75*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=donnees`

## Données et lieu de traitement.

Dans les deux cas, votre requête est transmise à un fournisseur de modèle, qui la traite chez lui. Pour une partie de son catalogue, la passerelle de Nexora AI s'appuie elle-même sur OpenRouter comme fournisseur amont. Elle lui demande de refuser la collecte des données par l'hébergeur final, mais ne peut pas vérifier que ce refus est appliqué.

Choisir Nexora AI API n'écarte donc pas, à lui seul, un traitement par un tiers : lisez la fiche du modèle. Pour savoir comment poser la question du lieu, voir [Où sont vraiment vos données](/guides/ou-sont-vos-donnees-ia/).

### Bloc 5 — Cartes (`block_cards`)

*Facturation : comment chacun facture, sans comparaison de prix possible aujourd'hui. · Affirmations : CL-X02, CL-X03, CL-S03, CL-S05, CL-12*

Réglages : `columns=2`, `tone=clair`, `layout=grille`, `anchor_id=facturation`

## Qui facture quoi.

Aucune comparaison de prix n'est possible aujourd'hui : Nexora AI n'a publié aucun prix.

#### Chez OpenRouter.

Le prix de liste du fournisseur, sans majoration, en dollars américains ; des frais s'ajoutent à l'achat de crédits ; les taxes s'ajoutent ; selon ses conditions, les crédits peuvent expirer un an après l'achat.

#### Chez Nexora AI API.

Au jeton, en dollars canadiens : chaque requête réserve son coût maximal puis est réglée au coût réel ; sans solde suffisant, l'API répond par une erreur de paiement avant tout appel. Chaque clé peut avoir un plafond de dépense.

### Bloc 6 — Cartes (`block_cards`)

*Pour qui : trois profils, sans classement. · Affirmations : CL-02, CL-04, CL-S01, CL-M06*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=pour-qui`

## Pour qui.

#### Vous comparez des modèles en dollars canadiens.

Les prix de Nexora AI API sont en dollars canadiens et la fiche de chaque modèle affiche son lieu d'hébergement.

#### Vous voulez une protection incluse.

Nexora Privacy Router est incluse sans supplément et s'applique à chaque requête de la passerelle.

#### Vous voulez être accompagné.

Nexora AI installe, exploite et fait évoluer des systèmes d'IA, chez vous ou hébergés au Québec.

### Bloc 7 — Section (`block_section`)

*Quand choisir l'autre : quatre besoins que seul OpenRouter couvre aujourd'hui. · Affirmations : CL-12, CL-86, CL-X06, CL-X07*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=choisir-lautre`

## Quand choisir l'autre.

OpenRouter répond aujourd'hui à plusieurs besoins que Nexora AI API ne couvre pas :

- **Vous voulez acheter maintenant.** Le libre-service de Nexora AI n'est pas ouvert à la vente.
- **Vous avez besoin d'un très large catalogue.** Celui de Nexora AI se limite aux modèles publiés sur sa page Modèles.
- **Vous exigez un niveau de service contractuel.** Nexora AI n'en annonce aucun.
- **Vous voulez un routage régional européen ou américain.** OpenRouter le propose dans ses formules Business et Enterprise.

### Bloc 8 — FAQ (`block_faq`)

*Questions du comparatif : alternative, fournisseur amont, prix, lieu, migration. · Affirmations : CL-M09, CL-X02, CL-X06, CL-S04, CL-12, CL-M07*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Comparatif : vos questions.

#### Nexora AI API est-elle une alternative à OpenRouter ?

Pour certains usages, oui : les deux sont des passerelles de modèles au format de l'API d'OpenAI. Elles diffèrent par la monnaie, le catalogue, la façon d'afficher le lieu d'hébergement et l'état de la vente. Le tableau de cette page donne les faits.

#### Nexora AI API utilise-t-elle OpenRouter ?

Pour une partie de son catalogue, oui : OpenRouter peut servir de fournisseur amont. Nexora AI lui demande de refuser la collecte des données par l'hébergeur final, mais ne peut pas vérifier l'application de ce refus. La fiche de chaque modèle donne son fournisseur et sa politique de données.

#### Laquelle coûte moins cher ?

Nous ne pouvons pas le dire : Nexora AI n'a publié aucun prix, et les prix d'OpenRouter sont en dollars américains avec des frais à l'achat de crédits. Comparez sur votre cas, taxes et change compris.

#### Où mes requêtes sont-elles traitées ?

Chez le fournisseur du modèle choisi, dans les deux cas. OpenRouter propose un routage régional pour l'Europe et les États-Unis dans ses formules Business et Enterprise ; Nexora AI affiche le lieu d'hébergement sur la fiche de chaque modèle. Ni l'un ni l'autre n'est, à lui seul, une preuve de résidence.

#### Puis-je passer de l'une à l'autre en changeant l'adresse de base ?

Le format est le même, donc l'adresse de base et la clé changent ; les identifiants de modèles diffèrent, il faut les adapter. Voir le guide sur l'API compatible OpenAI.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : parler du cas d'usage. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Parlons de votre cas.

Dites-nous quels modèles vous voulez comparer, où vos données doivent rester et ce qui compte le plus pour vous. Nous répondons par un diagnostic.

[Planifier un diagnostic](/contact/?sujet=diagnostic) · [Passerelle ou accès direct](/guides/passerelle-ou-acces-direct/)
