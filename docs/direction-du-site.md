# Direction du site : proposition à approuver

Date : 30/10/2026. Origine : le fondateur veut que le site, quand on n'est pas connecté, **vende**, et qu'il ait « une direction claire ». Fondé sur l'audit du site vu par un visiteur (30/10, relecture en lecture seule) et sur des vérifications faites à la main.

## Constat (vérifié)

Le site ne vend pas aujourd'hui, pour quatre raisons :

1. **Aucune porte d'entrée vers la plateforme.** Aucune page publique ne mène à `/compte/inscription`. Tous les boutons principaux disent « écrivez-nous » ou « démonstration ».
2. **Rien n'est « disponible ».** Les 33 modèles sont « En aperçu » (appel par API non ouvert), les outils de `/apps` sont « Bientôt » ou « Plus tard », et WorkStudio exige un crédit qu'on ne peut pas acheter (paiements en mode test).
3. **Aucun prix.** La page Tarifs explique très bien les crédits, mais n'affiche aucun palier. Le visiteur ne sait pas si c'est 10 $ ou 1 000 $ par mois.
4. **Des phrases se contredisent.** « Des données qui restent chez vous ou au Québec » (accueil) contre « Hébergement hors Canada » sur chaque fiche modèle ; « pas de prix public » (FAQ) contre 33 pages de prix au million de jetons ; WorkStudio « Disponible » contre « Pas encore en vente ».

Ce qui marche déjà : le ton sobre, l'explication du crédit, le catalogue de modèles (la page la plus crédible), les listes d'attente par outil.

## Direction recommandée : « deux portes, une promesse »

**La promesse** (en réutilisant les mots du site, sans rien ajouter) : *l'IA qui travaille pour votre entreprise, sous votre contrôle : un compte, des crédits, tous vos outils.*

**Deux portes**, visibles dès le haut de l'accueil, chacune avec UN bouton :

| Porte | Pour qui | Ce qu'elle vend aujourd'hui | Bouton |
|---|---|---|---|
| **Accompagnement** | Le dirigeant de PME qui veut qu'on le fasse avec lui | Un diagnostic, puis une estimation écrite. C'est la seule voie qui rapporte avant l'ouverture. | « Décrire mon besoin » |
| **Plateforme à crédits** | Celui qui veut l'outil lui-même (et le développeur) | Le forfait de base annoncé (29,99 $ CA par mois, 1 000 crédits, 1 Go), avec la mention « souscription pas encore ouverte », et une place sur la liste d'ouverture | « Me prévenir à l'ouverture » |

**Une seule règle d'honnêteté**, qui devient notre argument : chaque modèle affiche où il tourne et ce qu'il coûte. On ne dit jamais « au Québec » de la plateforme tant que ce n'est pas vrai de chaque modèle.

**À l'ouverture réelle (serveur Proxmox, paiement réel)**, un seul geste change : le bouton de la porte « Plateforme » devient « Commencer » et mène à l'inscription, puis au paiement. Le reste de la page ne bouge pas.

## Ce qui se fait sans l'approbation du fondateur (aucune nouvelle affirmation)

1. Ajouter « Me prévenir à l'ouverture » (mécanisme de liste d'attente existant) sur l'accueil, Tarifs, WorkStudio, Apps, Modèles et l'inscription.
2. Bandeau en haut de `/modeles` : « Catalogue en aperçu : fiches et prix de développement publics, appel par API pas encore ouvert. » et retirer le lien vers une liste vide.
3. Corriger Tarifs : remplacer l'excuse « catalogue indisponible » par l'équivalence 1 000 crédits = 10 $ CA de jetons ; corriger la carte VPS qui promet un prix inexistant ; retirer les textes d'« essai gratuit » restés dans le dictionnaire.
4. Inscription : dire en quatre lignes ce que le compte donne et ce qui n'est pas encore ouvert, avec les liens Tarifs, Conditions, Confidentialité.
5. WorkStudio : remonter « Ouvert depuis votre compte » sous le héros, ajouter « Voir les tarifs » à côté de « Demander une démonstration ».
6. `/apps` : WorkStudio en tête comme seul outil « Disponible » ; corriger la légende.

## Ce qui exige l'approbation du fondateur

- **Publier le prix de base 29,99 $** (nouvelle affirmation) et réviser les affirmations « pas de prix public ».
- **Nuancer où vont les données** (accueil, WorkStudio, FAQ) : mentionner que la plateforme passe par un fournisseur hors Canada (DeepInfra) ; à valider avec l'avocat.
- **Approuver les affirmations** : 192 sont « en revue » et 18 « brouillon » ; **aucune n'est approuvée**. Il faut un chemin court : un document de décision groupé par thème, où le fondateur répond oui ou non par paquet.
- **Ouvrir ou non la création de compte au public** pendant que les paiements sont en mode test (le compte serait vide).
- **Appeler ou non « accès anticipé »** des comptes de test remis à quelques entreprises (la règle du 29/10 interdit tout « essai gratuit »).

## Ce qu'on ne fait pas

Aucune précommande, aucun paiement test présenté comme réel, aucune date de lancement, aucun nombre de clients, aucun prix pour Pro et Équipe (brouillons non validés), aucune certification inventée.

## Ordre proposé

1. Tranche A (sans approbation) : les six corrections ci-dessus, tests, démo mise à jour.
2. Document d'approbation groupé des affirmations ; le fondateur répond.
3. Publication du contenu réécrit (E2) et du prix de base, selon ses réponses.
4. À l'ouverture sur Proxmox : bascule du bouton de la porte « Plateforme ».
