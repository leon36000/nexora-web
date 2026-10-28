# Preuve de la chaîne de publication — S2 (journaux du script web/scripts/e2e-publication.ts)

Commande : `bun web/scripts/e2e-publication.ts` (page jetable) puis `E2E_TARGET=home bun web/scripts/e2e-publication.ts` (accueil réel, état initial rétabli).

---

# Preuve de la chaîne de publication (S2)

2026-10-27T03:14:42.854Z · site http://localhost:3500 · Directus http://localhost:8456 · cible : page jetable

Page `cf21df7a-a1b8-457c-bff5-d31c2b77d98f`, chemin `/essai-chaine-30b0b2`. Texte initial : « Texte initial 30b0b2. ». Comptes : Éditeur, Relecteur (comptes de la pile) ; compte de service « Publication ».

- OK **p0** avant tout : la page publique affiche le texte initial

## 1. Brouillon de l'Éditeur : invisible sur le site
- OK **a1** Éditeur crée une version -> 200
- OK **a2** Éditeur enregistre le brouillon (« Texte du BROUILLON 30b0b2. ») -> 200
- OK **a3** la page publique n'affiche PAS le brouillon et affiche toujours le texte initial
- OK **a4** la table principale de Directus n'a pas changé (le brouillon vit dans la version)

## 2. Aperçu authentifié : montre la version, jamais indexable
- OK **b0** génération d'un lien d'aperçu sans jeton d'administration -> 401 (attendu 401)
- OK **b1** lien d'aperçu à la signature falsifiée -> 401 (attendu 401), aucun cookie posé : true
- OK **b2** lien signé valide -> 307 vers /essai-chaine-30b0b2, cookie d'aperçu posé : true
- OK **b3** l'aperçu affiche le texte du brouillon
- OK **b4** l'aperçu porte le bandeau « Aperçu — non publié »
- OK **b5** l'aperçu est non indexable (meta robots noindex : true ; X-Robots-Tag : noindex, nofollow, noarchive) et non partagé (Cache-Control : private, no-cache, no-store, max-age=0, must-revalidate)
- OK **b6** pendant l'aperçu, un visiteur anonyme ne voit toujours pas le brouillon

## 3. Approbation sur le hash exact, version périmée, promotion
- OK **c1** promotion sans approbation -> 403 NEXORA_APPROBATION_ABSENTE (attendu 403 NEXORA_APPROBATION_ABSENTE)
- OK **c2** Éditeur propose une approbation -> 200, état en_attente
- OK **c3** Relecteur approuve -> 200
- OK **c4** version modifiée après approbation : promotion refusée -> 403 NEXORA_APPROBATION_ABSENTE (approbation périmée)
- OK **c5** l'approbation est passée à « périmée » (attendu périmée)
- OK **c6** la page publique n'a pas changé
- OK **c7** nouvelle approbation sur le hash exact, promotion par « Publication » -> 200

## 4. Revalidation et page publique exacte
- OK **d1** la page publique (visiteur anonyme, sans cookie) affiche le nouveau texte publié
- OK **d2** l'ancien texte et le texte du brouillon intermédiaire ont disparu
- OK **d3** journal de la garde de Directus : 1 revalidation(s) envoyée(s) pour cette page
- OK **d4** la réponse publique n'est ni un aperçu ni noindex (robots : index)

## 5. Remise de l'état initial (par la même chaîne approuvée)
- OK **e1** promotion du retour à l'état initial -> 200
- OK **e2** la page publique affiche de nouveau le texte initial

Nettoyage : 0 compte(s) jetable(s) supprimé(s), page jetable supprimée, 2 version(s) et 3 approbation(s) d'essai supprimées.

## Bilan : 25/25 vérifications passées

---

# Preuve de la chaîne de publication (S2)

2026-10-27T03:17:39.963Z · site http://localhost:3500 · Directus http://localhost:8456 · cible : accueil

Page `16a4f351-fee8-485a-932c-b8ed563dc20f`, chemin `/`. Texte initial : « L'IA qui travaille pour votre entreprise. Sous votre contrôle. ». Comptes : Éditeur, Relecteur (comptes de la pile) ; compte de service « Publication ».

- OK **p0** avant tout : la page publique affiche le texte initial

## 1. Brouillon de l'Éditeur : invisible sur le site
- OK **a1** Éditeur crée une version -> 200
- OK **a2** Éditeur enregistre le brouillon (« Texte du BROUILLON 03caaa. ») -> 200
- OK **a3** la page publique n'affiche PAS le brouillon et affiche toujours le texte initial
- OK **a4** la table principale de Directus n'a pas changé (le brouillon vit dans la version)

## 2. Aperçu authentifié : montre la version, jamais indexable
- OK **b0** génération d'un lien d'aperçu sans jeton d'administration -> 401 (attendu 401)
- OK **b1** lien d'aperçu à la signature falsifiée -> 401 (attendu 401), aucun cookie posé : true
- OK **b2** lien signé valide -> 307 vers /, cookie d'aperçu posé : true
- OK **b3** l'aperçu affiche le texte du brouillon
- OK **b4** l'aperçu porte le bandeau « Aperçu — non publié »
- OK **b5** l'aperçu est non indexable (meta robots noindex : true ; X-Robots-Tag : noindex, nofollow, noarchive) et non partagé (Cache-Control : private, no-cache, no-store, max-age=0, must-revalidate)
- OK **b6** pendant l'aperçu, un visiteur anonyme ne voit toujours pas le brouillon

## 3. Approbation sur le hash exact, version périmée, promotion
- OK **c1** promotion sans approbation -> 403 NEXORA_APPROBATION_ABSENTE (attendu 403 NEXORA_APPROBATION_ABSENTE)
- OK **c2** Éditeur propose une approbation -> 200, état en_attente
- OK **c3** Relecteur approuve -> 200
- OK **c4** version modifiée après approbation : promotion refusée -> 403 NEXORA_APPROBATION_ABSENTE (approbation périmée)
- OK **c5** l'approbation est passée à « périmée » (attendu périmée)
- OK **c6** la page publique n'a pas changé
- OK **c7** nouvelle approbation sur le hash exact, promotion par « Publication » -> 200

## 4. Revalidation et page publique exacte
- OK **d1** la page publique (visiteur anonyme, sans cookie) affiche le nouveau texte publié
- OK **d2** l'ancien texte et le texte du brouillon intermédiaire ont disparu
- OK **d3** journal de la garde de Directus : 1 revalidation(s) envoyée(s) pour cette page
- OK **d4** la réponse publique n'est ni un aperçu ni noindex (robots : index)

## 5. Remise de l'état initial (par la même chaîne approuvée)
- OK **e1** promotion du retour à l'état initial -> 200
- OK **e2** la page publique affiche de nouveau le texte initial

Nettoyage : 0 compte(s) jetable(s) supprimé(s), 2 version(s) et 3 approbation(s) d'essai supprimées.

## Bilan : 25/25 vérifications passées
