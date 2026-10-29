# Panneau client Nexora et panneau d'OpenRouter : audit et lacunes comblées

Branche `feat/panel-ultime`, 29/10/2026. But : un panneau « triple A » pour les clients qui s'inscrivent (portefeuille, clés, activité, WorkStudio branché d'office), au moins aussi lisible que celui d'OpenRouter, avec un forfait de jetons inclus.

## Sources et limites de la comparaison

Lues le 29/10/2026 (documentation publique d'OpenRouter, résumées ici avec nos mots, sans copie de texte) :

| Page | Adresse |
|---|---|
| Clés d'API (gestion) | https://openrouter.ai/docs/guides/overview/auth/management-api-keys |
| Comptabilité de l'usage | https://openrouter.ai/docs/guides/guides/usage-accounting |
| Foire aux questions (crédits, facturation, activité, confidentialité) | https://openrouter.ai/docs/faq |
| Garde-fous (plafonds de dépense, listes de modèles) | https://openrouter.ai/docs/guides/features/guardrails |
| Limites et erreurs 402 / 403 | https://openrouter.ai/docs/api-reference/limits |

**Ce qui n'a pas pu être vérifié** : le tableau de bord d'OpenRouter lui-même (il demande une connexion) ; les lignes sur l'écran « Settings », « Logs/Generations » et « Billing » reposent donc sur la documentation, pas sur l'interface. Les outils de lecture du Web de la session (Firecrawl) étaient sans crédit ; la lecture s'est faite avec l'outil de lecture de pages standard. Quand la documentation ne dit rien, la case est marquée « non documenté » et rien n'est supposé.

## Tableau

Légende : **Oui** = déjà là avant cette branche · **Fait** = livré par cette branche · **Reste** = non livré, avec la raison.

| Fonction d'OpenRouter | Nexora avant | Manque | Maintenant |
|---|---|---|---|
| **Crédits : solde prépayé** consulté en tout temps | Oui : solde disponible, montant réservé, compte bloqué si négatif | Un coup d'œil dès l'ouverture du panneau | **Fait** : l'aperçu ouvre sur le solde et « Ajouter des fonds » ; page Portefeuille |
| **Ajout de crédits** (carte) | Oui : un seul champ « montant » (Stripe, mode test) | Montants proposés ; dire à quoi servent les fonds | **Fait** : 20 / 50 / 100 / 250 / 500 $ dans les bornes de la configuration, montant libre, mêmes routes `/api/billing/*`, Stripe en mode test seulement |
| **Recharge automatique** sous un seuil | Non | Prélèvement hors-session : exige une carte enregistrée et un accord du fondateur pour tout débit sans geste du client | **Fait (honnête)** : carte « Recharge automatique » marquée « Bientôt », désactivée, avec explication ; remplacée par l'alerte de solde bas (ligne suivante). Aucun prélèvement automatique n'est promis |
| **Alertes de budget** | Non documenté chez OpenRouter (la FAQ n'en parle pas) ; non chez Nexora | Un avis avant l'interruption | **Fait** : seuil du solde au choix du propriétaire, courriel aux propriétaires (worker, toutes les 30 minutes, un seul courriel par passage sous le seuil, réarmé quand le solde remonte). Migration additive `0024_s14_alerte_solde_bas` |
| **Expiration des crédits** (un an après l'achat, selon la FAQ) | Oui : 12 mois, lots, expiration quotidienne | Les voir | **Fait** : tableau « D'où viennent vos crédits » (origine, reçu, restant, échéance), ordre d'usage expliqué |
| **Frais à l'achat de crédits** | Oui (facultatif, réglé dans l'administration, déduit des crédits) | — | Oui, affiché avant le paiement |
| **Remboursement des crédits inutilisés** (24 h, selon la FAQ) | Remboursements et litiges Stripe reflétés au grand livre ; pas de bouton client | Libre-service | **Reste** : décision commerciale du fondateur (frais, délai) ; le portail Stripe donne les reçus |
| **Historique des opérations / reçus** | Oui : 25 dernières écritures ; portail Stripe | Voir plus ; reçus clairs | **Fait** : « Afficher plus » (200 écritures), section « Reçus et factures » vers le portail Stripe. **Reste** : export CSV du grand livre (l'export CSV de l'activité existe) |
| **Page Activity** : usage historique filtrable par modèle et par clé | Oui : synthèse, jour / modèle / agent / clé, journal, statut | Filtre par dates précises | **Fait** : « Du / Au » (jours de Montréal, fin incluse) en plus des périodes 24 h, 7, 30, 90 jours. Pas de filtre par fournisseur amont : Nexora ne l'expose pas (le client choisit un modèle, pas un fournisseur) |
| **Graphique par jour** | Oui (barres, texte alternatif) | Empilé par modèle | **Reste** : le détail par modèle et par clé est en tableaux ; un graphique empilé n'ajoute pas d'information décisive |
| **Export** de l'activité | Oui : CSV en flux, jusqu'à 100 000 lignes | — | Oui |
| **Coût par requête** et jetons (entrée, sortie, cache, raisonnement) | Oui dans le journal | Le détail d'une requête | **Fait** : page « Détail d'une requête » : identifiant, clé, statut, mode flux, délai, jetons dont cache et raisonnement, prix par million appliqués, plage horaire, décision de confidentialité, coût (ou valeur offerte pour la maison). **Sans contenu**, sans coût amont ni version interne |
| **Retrouver une requête par son identifiant** (API `/generation`) | `x-request-id` en en-tête ; pas de route de relecture | Route publique de relecture | **Reste** : la page de détail couvre le besoin du panneau ; une route d'API serait une surface de plus à protéger |
| **Clés : nom** | Oui | — | Oui |
| **Clés : plafond de crédit** (OpenRouter : plafond avec remise à zéro quotidienne, hebdomadaire ou mensuelle) | Oui : plafond de dépense cumulée par clé | Remise à zéro périodique | **Reste** : plafond cumulé seulement (arrêt net à 402 `api_key_spend_cap_reached`). Une remise à zéro périodique demande une colonne et une tâche ; à décider |
| **Clés : expiration** | Oui à la création | La voir | **Fait** : colonne « Expiration » dans la liste (la documentation d'OpenRouter ne décrit l'expiration que pour ses clés de gestion) |
| **Clés : limites de débit** | Oui côté serveur (RPM / TPM par clé) mais pas dans le formulaire | Les régler | **Fait** : « Limites et restrictions » : requêtes et jetons par minute ; la liste les affiche |
| **Clés : modèles permis** | Oui côté serveur, pas dans le formulaire | Les choisir | **Fait** : cases à cocher d'après le catalogue ; la liste dit « N modèles permis » ou « Tous » |
| **Clés : permission WebPilot** | Oui | — | Oui |
| **Clés : valeur affichée une seule fois** | Oui (empreinte seule en base) | — | Oui. (La documentation d'OpenRouter ne le dit que pour ses clés de gestion.) |
| **Clés : révocation** | Oui, immédiate, irréversible | Désactiver / réactiver, renommer, modifier le plafond | **Reste** : la révocation + création d'une nouvelle clé couvre la sécurité ; l'édition d'une clé existante est une fonction de confort |
| **Clés : dernière utilisation, dépense par clé** | Oui | — | Oui |
| **Informations d'une clé par l'API** (`GET /key`) | Non | Route | **Reste** : non demandée ; le panneau montre les mêmes chiffres |
| **Erreurs 402 qui disent la cause** (solde, plafond de clé, réservation) | Oui : `insufficient_quota`, `account_blocked`, `api_key_spend_cap_reached` | — | Oui |
| **Garde-fous** : modèles permis, rétention zéro, par clé ou par membre | Partiel : modèles permis par clé ; Privacy Router par organisation (niveaux, listes, masquage, refus) | Plafonds de dépense par membre | **Reste** : une organisation = un compte, pas de membres facturés séparément (invitations non livrées) |
| **Confidentialité / journalisation** (par défaut, métadonnées seulement ; contenu en option contre un rabais) | Oui et plus strict : jamais de contenu, aucune option de journalisation du contenu | — | Oui : page Confidentialité et Privacy Router, sans supplément |
| **Organisations, membres, espaces de travail** | Une organisation par compte ; rôles propriétaire / membre | Invitations | **Reste** : déjà noté dans les limites connues de `docs/infra.md` |
| **BYOK** (apporter sa clé de fournisseur) | Non | — | **Hors périmètre** : Nexora vend l'accès aux modèles (marge de 10 %) |
| **Page « Models »** avec prix | Oui : `/modeles` et catalogue du panneau | — | Oui |
| **Chat intégré** | Non | — | **Hors périmètre** de cette branche (assistant LibreChat envisagé à part) |

### Ce qui n'existe que chez Nexora (et que le panneau montre maintenant)

- **WorkStudio branché d'office** : la page WorkStudio affiche le modèle par défaut, la clé automatique (préfixe, dernier usage), la facturation au portefeuille, le solde et un lien vers l'activité de cette clé ; l'aperçu l'indique (« Branché », « Pas encore ouvert », « Abonnement requis »). L'organisation maison ouvre WorkStudio sans abonnement.
- **Forfait de 5 millions de jetons par mois** (voir plus bas) avec compteur « X de 5 M de jetons inclus utilisés ».
- **Accès gratuit réservé à l'administrateur** : l'organisation maison voit « Accès administrateur gratuit » à la place du solde, de la recharge et des alertes ; aucun client ordinaire n'y a droit (tests).

## Forfait de jetons inclus

- Les trois offres WorkStudio préparées en brouillon portent `included_credits_cents` = **440** (annuel : 5 280, un douzième par mois) = valeur de 5 M de jetons du modèle par défaut `nexora/deepseek-v4.1-flash-1017`.
- Calcul (`tokensValueMicro`, 70 % d'entrée, 30 % de sortie), tarif de pointe de la feuille de départ (0,30 $ US en entrée, 1,20 $ US en sortie par million), taux de référence 1,4025, marge de 10 % : 0,462825 $ et 1,8513 $ par million, soit 5 M × (0,7 × 0,462825 + 0,3 × 1,8513) = 4,396838 $, arrondi à **4,40 $**. Détail et honnêteté sur l'équivalence : `docs/facturation-workstudio.md`.
- Le compteur de l'espace client est une **équivalence en valeur** : un modèle plus cher consomme le forfait plus vite, et il le dit. Les crédits inclus expirent à la fin de leur période et servent avant les crédits achetés.
- `trial_days` = 0 partout ; la page /tarifs ne promet plus d'essai (méta, introduction) et annonce le forfait. Les **prix restent des suggestions non publiées**.

## Décisions provisoires, modifiables par le fondateur

1. Même forfait de 5 M de jetons pour les trois offres (la taille par palier reste à décider).
2. Valeur du forfait calculée au tarif de pointe de DeepSeek et au taux de référence 1,4025 ; le taux approuvé en production fait foi pour la facturation.
3. Recharge automatique **non livrée** : désactivée et expliquée, remplacée par l'alerte de solde bas. À livrer seulement avec l'accord du fondateur pour un prélèvement sans geste (carte enregistrée, consentement, mode réel).
4. Alerte de solde : désactivée par défaut (le propriétaire l'active) ; un courriel par passage sous le seuil ; envoyée aux propriétaires dont le courriel est vérifié, dans leur langue.
5. Plafond de clé : cumulé, sans remise à zéro périodique (voir tableau).
6. Pas de route d'API de relecture d'une requête ni d'information de clé : le panneau suffit pour l'instant.
7. Période par dates : jours de Montréal (comme le graphique par jour), fin incluse, au plus 366 jours.
8. Le mécanisme d'essai gratuit de Stripe reste dans le code (donnée par offre dans Directus) : seul le jeu de départ et le texte de la page l'abandonnent. Le retirer du code est possible, mais non demandé.
