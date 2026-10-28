# Sécurité : vague 2 (durcissement et essais d'intrusion)

Daté du 27/10/2026. Branche `recette/securite` (base `600e3ad`). Demande du fondateur : « colmate et rectifie toutes les failles possibles, le site doit être ultra sécurisé ». Référentiel : OWASP ASVS 4.0.3 niveau 2 (niveau 3 pour l'authentification, les paiements et le Coffre), OWASP Top 10 2025, recommandations CIS pour la pile. Suite de `docs/recette/securite.md` (recette S9) : ce qui y est déjà dit n'est pas répété.

**Méthode.** Trois audits de code en lecture seule (paiements et grand livre ; passerelle, VPS, worker, Coffre, garde réseau ; rendu, CMS, routes publiques, déploiement) ont produit des constats que j'ai relus avant de corriger. Chaque faille : un test qui la démontre (vu échouer), le correctif minimal, le test vert. Les durcissements de la pile Directus et des conteneurs ont été validés sur des conteneurs jetables (jamais sur la pile en service). Les essais d'intrusion visent **uniquement** un site de production lancé sur le port 3524, base jetable `app_securite` clonée de `app_s9`, sans appel d'un service externe (`NEXORA_PASSWORD_BREACH_CHECK=off`).

## Résumé

| Volet | Résultat |
|---|---|
| Authentification | **Double authentification** TOTP + codes de secours (clients), obligatoire pour le personnel ; mots de passe de 12 caractères, liste de mots de passe courants, vérification HIBP (k-anonymat) en production ; verrouillage progressif ; avertissement de connexion inhabituelle ; code TOTP à usage unique ; nom d'affichage assaini (injection dans les courriels). |
| Autorisation et logique métier | 12 constats corrigés (réservation sous-estimée à la passerelle, annulation facturée zéro, courses sur les dons, les quotas VPS et les clés, champ de code Stripe contournant « un par client », événements Stripe perdus…). |
| Injection et rendu | ReDoS du texte riche (9 s de boucle bloquée sur 100 000 caractères), slugs du CMS dans le XML du sitemap et le sélecteur de langue, emoji des images Open Graph (appel d'un CDN tiers), type de contenu du formulaire de contact. |
| SSRF et sortie | Redirections suivies après la garde, noms d'hôte en mode « adresses littérales », plages IPv6 de transition ; pare-feu sortant des VPS fermé vers les réseaux privés. |
| En-têtes | COOP, CORP (API), `script-src-attr 'none'`, Permissions-Policy étendue, `upgrade-insecure-requests` en HTTPS ; matrice de contrôle sur 21 adresses de types différents. **`'unsafe-inline'` reste dans `script-src`** (§3). |
| Dépendances | `bun audit` : 13 avis (2 critiques) → 2 (gravité basse et moyenne, outillage de build, §6). |
| Pile Directus et conteneurs | Rôles PostgreSQL séparés, 2FA des rôles humains, limitation de débit, CSP, `no-new-privileges`, `cap_drop`, systèmes de fichiers en lecture seule, réseau interne, secrets de fichiers (`compose.prod.yml`). |
| Complément du 28/10 (§4b) | **R9** (liste d'hôtes des clés fixée par l'opérateur), essais gratuits limités par carte et par courriel, crédits des offres annuelles versés mois par mois, session d'aperçu de 30 minutes, cache négatif court, 405 sur les méthodes exotiques, un code « un par client » = une session ouverte, quatre rulings de produit. Migration 0015. |
| Essais d'intrusion | 79 contrôles contre le site de production local, 236 contrôles de gardes et d'en-têtes, parcours navigateur de la 2FA : tout est vert au final (§5). |

## 1. Constats et correctifs

Gravité : CVSS 3.1 **indicatif** (pas de certification). « Preuve » : comment la faille a été démontrée avant le correctif. Les tests nommés sont dans le dépôt.

### 1.1 Authentification et comptes

| # | Constat | CVSS | Preuve (RED) | Correctif | Test |
|---|---|---|---|---|---|
| A1 | Aucun second facteur ; comptes « personnel » (codes `staff`, dons d'abonnements, de VPS et de crédits) protégés par un seul mot de passe (ASVS 2.8, niveau 3) | 6,8 | 15 des 16 tests de `auth-security.test.ts` échouent sur l'ancien code (route `/two-factor/*` : 404) | Plugin `twoFactor` de Better Auth : TOTP 6 chiffres, 10 codes de secours chiffrés, verrouillage après 10 échecs ; appareil de confiance refusé ; compte du personnel : privilèges suspendus sans 2FA, redirection vers `/compte/securite`, impossible de la retirer | `auth-security.test.ts` (« double authentification », 6 tests) ; `promo-apply.test.ts` (« un compte du personnel sans double authentification… ») ; `gifts.test.ts` (« double authentification obligatoire pour le personnel ») |
| A2 | Un code TOTP déjà accepté se rejoue dans sa fenêtre de 90 s (ASVS 2.8.4) | 3,1 | « un code TOTP ne sert qu'une fois » : 200 au lieu de 401 | Empreinte du code gardée 2 min (`verifications`), contrôle avant et après | idem ; essai d'intrusion « 2FA : le rejeu… est refusé » |
| A3 | Le nom saisi à l'inscription est recopié tel quel dans les courriels de vérification et de réinitialisation : un attaquant fait envoyer par le domaine Nexora un message de son choix | 4,3 | `refuse un nom qui contient une adresse web`, `aplatit les retours à la ligne` | Nom aplati (contrôles et caractères de direction retirés), 120 caractères, adresses web et balises refusées, doublé dans le hook de création | `auth-security.test.ts` (« nom d'affichage », 3 tests) |
| A4 | Politique de mots de passe faible (10 caractères, aucune liste) | 5,3 | `refuse un mot de passe courant…` (`motdepasse123`, `123456789012`) | 12 à 128 caractères, mots courants (FR/EN), suites, mot de passe bâti sur le courriel ou le nom, HIBP en production (échec réseau : on laisse passer et on journalise) | `password-policy.test.ts` (6), `auth-security.test.ts` (« politique des mots de passe », 5) |
| A5 | Bourrage d'identifiants : seule la limite par adresse (5/min) | 5,3 | `verrouille après 5 échecs…` | Verrouillage par courriel (empreinte), 1 min doublant jusqu'à 30 min, identique pour un courriel sans compte, remis à zéro à la réussite | `auth-security.test.ts` (« verrouillage progressif », 2) ; intrusion : 429 réel |
| A6 | Aucune alerte de connexion depuis une adresse inconnue | 2,0 | `avertissement de connexion inhabituelle` | Courriel sans lien, hors première connexion | `auth-security.test.ts` |
| A7 | Jetons d'administration faux : aucune limite | 3,7 | `admin-throttle.test.ts` (429 attendu après 10) | Freinage dans `proxy.ts` : 10 faux jetons en 5 min par adresse → 429 ; un jeton valide passe toujours (pas de déni de service) | `admin-throttle.test.ts` (4) |

### 1.2 Paiements, grand livre, dons

| # | Constat | CVSS | Correctif | Test |
|---|---|---|---|---|
| P1 | Le champ « code promo » de la page Stripe applique un code « un par client » sans limite | 4,3 | Champ retiré tant qu'un code de ce type est actif | `billing/http.test.ts` (« le champ « code promo »… est retiré ») |
| P2 | Limites d'un code vérifiées à la création de la session, comptées au paiement ; session ouverte 24 h | 4,3 | Sessions de 30 minutes (minimum Stripe). **Reste** : n sessions ouvertes en 30 min (§4) | `billing/http.test.ts` (« une session de paiement expire en 30 minutes ») |
| P3 | Existence d'un code du personnel révélée (`staff_only`) | 3,1 | Même réponse que « code inconnu » | `promo-apply.test.ts`, `purchase.test.ts`, `billing/http.test.ts` |
| P4 | Corps lu avant origine, session et rôle ; webhook Stripe lu en entier avant sa limite | 4,3 | Origine, session, rôle, débit, puis lecture ; `Content-Length` > 64 Ko → 413 ; webhook et contact : lecture par morceaux interrompue | `billing/http.test.ts` (3), `vps/customer-handlers.test.ts`, `stripe/webhook-route.test.ts`, `contact/handler.test.ts` |
| P5 | Dons du personnel : courses (5 dons d'un code à usage unique passaient ; deux dons actifs identiques) | 2,7 | Verrou consultatif par (organisation, offre) et limites du code revérifiées sous verrou (verrou pris **avant** l'insertion : un premier essai interbloquait) | `gifts.test.ts` (« dons simultanés », 2) |
| P6 | Remboursement ou litige reçu avant l'achat : événement marqué traité, crédits conservés | 3,1 | Erreur 500 (Stripe renvoie) pendant 15 min après l'événement | `billing/webhook.test.ts` (« un remboursement ou un litige reçu AVANT l'achat… ») |
| P7 | Réservation de jetons sous-estimée à `/v1` : une clé `image_url` sur un message texte, une imbrication de 41 niveaux, `response_format` non comptés → surconsommation sans borne | 6,5 | Estimation prudente de tout le corps transmis | `estimate.test.ts` (4), `proxy.test.ts` |
| P8 | Annulation du client avant la réponse amont : facturé zéro | 6,5 | Invite (flux) ou invite + `max_tokens` (non diffusé) ; `redirect: "error"` | `proxy.test.ts` (« le client annule… ») |
| P9 | Plafond du nombre de clés API par organisation absent ; `GET /v1/models` sans limite ni cache ; corps non plafonné pendant la lecture ; message d'erreur amont recopié | 4,3 à 5,3 | 25 clés actives (409 `key_limit`) ; limite par adresse + cache 30 s ; lecture par morceaux ; message générique | `keys.test.ts`, `account-handlers.test.ts`, `proxy.test.ts`, `net/read-limited.test.ts` |
| P10 | Quota de commandes VPS par organisation dépassé en rafale | 3,1 | Verrou consultatif | `orders.test.ts` (« quota de commandes sous concurrence ») |

### 1.3 VPS, SSRF, Coffre, worker

| # | Constat | CVSS | Correctif | Test |
|---|---|---|---|---|
| V1 | Pare-feu des VM : sortie ouverte vers les autres VPS et le réseau de l'opérateur | 6,8 | Sortie refusée vers 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10 et `fc00::/7` (après passerelle et DNS du pool) ; `fe80::/10` non fermé (découverte de voisins) | `firewall.test.ts` (5) |
| V2 | Réinstallations en chaîne : VM orphelines, stockage saturé | 6,5 | Refus `reinstall_pending_purge` et `reinstall_too_soon` (24 h) ; codes reliés à l'interface | `operate.test.ts` (3) |
| V3 | Redirections suivies après la garde SSRF ; `literalOnly` laissait passer `localhost` et `metadata.*` ; plages 6to4, NAT64, `::a.b.c.d`, `fec0::/10` non classées | 3,4 | `redirect: "manual"` ; noms refusés ; plages ajoutées (`*.internal` volontairement permis : `host.docker.internal` documenté) | `admin-handlers.test.ts`, `discovery.test.ts`, `outbound.test.ts` (9 RED) |
| V4 | AES-GCM du Coffre acceptait une étiquette tronquée (4 octets) | 3,7 | `authTagLength: 16`, longueur de l'IV vérifiée | `vault/crypto.test.ts` |
| V5 | Clé SSH du worker : échec du nettoyage ignoré ; blob de clé vérifié sur son en-tête seulement ; `deleteVm` sans garde de nom | 3,1 | Échec explicite et alerte ; longueurs vérifiées (ed25519, ECDSA, RSA) ; garde de nom | `ssh-key.test.ts` (6), `engine.test.ts`, `operate.test.ts` |

### 1.4 Rendu, CMS, routes publiques

| # | Constat | CVSS | Correctif | Test |
|---|---|---|---|---|
| W1 | Expression régulière du texte riche quadratique : 30 000 `<a ` = **8,7 s** de boucle d'événements bloquée (extrapolé à 10 s et plus à 100 000 caractères) à chaque normalisation d'une page publiée | 4,9 | Lecture des balises en un passage, fenêtre de 2 048 caractères, position du prochain `>` mémorisée : 30 000 balises en moins de 250 ms | `rich-text.test.ts` (« entrée hostile », 3) |
| W2 | Slugs de Directus non validés dans le sitemap (le XML n'échappe rien) et le sélecteur de langue (`//hôte`) | 3,5 | `cleanSlug` à la lecture et à la construction | `seo.test.ts`, `alternates.test.ts` |
| W3 | Formulaire de contact : `text/plain;application/json` accepté (requête CORS « simple ») | 3,7 | Type exact ; 413 sur `Content-Length` | `contact/handler.test.ts` (2) |
| W4 | Images Open Graph : chaque emoji d'un titre déclenche un appel à `cdn.jsdelivr.net` depuis le serveur (flux sortant non déclaré) | 3,1 | `ogSafeTitle` | `seo.test.ts` |
| W5 | Bulle WorkStudio (script tiers) autorisable sur `/compte` | 3,4 | Pages `/compte`, `/api`, `/v1`, `/admin`, `/og`, `/_next` interdites | `workstudio-embed.test.ts` (2) |
| W6 | Éditeur et Relecteur remplaçaient n'importe quel fichier Directus sans licence | 4,3 | `degrade: "drop"` | `access.test.ts` |
| W7 | Auto-approbation (aucune séparation des tâches) ; billet de promotion valable 30 s sur toute page | 3,5 | Refus d'approuver sa proposition ; billet lié à la page, 15 s | `core.test.ts` (5 + 5) |
| W8 | Directus et LiteLLM connectés à PostgreSQL en superutilisateur ; 2FA des rôles humains explicitement désactivée | 6,0 / 5,3 | Rôles `directus`, `litellm`, `umami` ; `enforce_tfa` ; politique de mot de passe | `db-roles.test.sh` (49), `compose.test.sh` (109), `access.test.ts`, `password.test.ts` |

## 2. Durcissements (sans faille précise)

- **Directus** (`deploy/compose.yml`, `compose.prod.yml`) : limitation de débit, jetons courts, `SameSite=Strict`, `DIRECTUS_COOKIE_SECURE`, liste de refus d'import par URL (plages privées), types et taille de fichiers limités, introspection GraphQL coupée, CSP sans origine tierce, `no-new-privileges`, `cap_drop: ALL`, `mem_limit`, `pids_limit`, utilisateur non root et système de fichiers en lecture seule (Directus, LiteLLM), réseau `internal: true` pour PostgreSQL, secrets de fichiers. Variables et migration du cluster existant : `docs/infra.md`. **Rien n'a été appliqué au Directus ni au PostgreSQL en service.**
- **En-têtes** : voir §3.
- **Dépendances** : Vitest 4.1.12 (corrige `tinypool`, critique, et `@vitest/mocker`), `overrides` pour `zod` 4.6.7 et `vite` 8.3.5 (le build de l'extension Directus et les 1 197 tests web passent).

## 3. En-têtes et CSP

Mesure du 27/10/2026 sur le build : une page prérendue contient **39 scripts en ligne** (amorçage Turbopack, flux RSC `self.__next_f.push`, JSON-LD) et 8 scripts externes.

| En-tête | Valeur après la vague 2 |
|---|---|
| CSP des pages | `default-src 'self'; script-src 'self' 'unsafe-inline'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` (+ `upgrade-insecure-requests` quand `SITE_URL` est en HTTPS) |
| Toutes les réponses | `Cross-Origin-Opener-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, `Permissions-Policy` (caméra, micro, géolocalisation, paiement, USB, capteurs, capture d'écran, Bluetooth, série, HID, MIDI, `browsing-topics`), HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy` |
| `/api`, `/v1` | CSP `default-src 'none'`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store` |
| `/compte*` dynamique | `Cache-Control: private, no-cache, no-store` (vérifié sur `/compte` et `/compte/securite` : le soupçon d'une page personnelle mise en cache partagé est écarté) |

**Pourquoi `'unsafe-inline'` reste dans `script-src` (ruling R1, confirmé).** La CSP à nonce de Next.js exige un rendu dynamique de **toutes** les pages : le guide officiel de la version installée dit en toutes lettres que le prérendu partiel (`cacheComponents`, qui fait la rapidité du site) est incompatible, car la coque statique est produite au build, sans requête donc sans nonce. Une politique à empreintes exigerait environ 40 empreintes par page et ne couvre pas les parties diffusées après coup. `experimental.sri` n'ajoute des empreintes qu'aux scripts externes. Ce qui a été fait à la place : `script-src-attr 'none'` (aucun gestionnaire `onclick=…` ou `onerror=…` ne s'exécute, ce qui ferme la classe d'injection la plus courante), aucune origine tierce, `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors`, et le rendu du contenu du CMS reste une liste blanche reconstruite en éléments React. **Coût si le choix est faux** : une injection de balise `<script>` dans une page ne serait pas bloquée par la CSP ; la seule sortie de HTML brut est le JSON-LD (`<` échappé, testé). **Pour lever `'unsafe-inline'`** : rendre toutes les pages dynamiques (nonce par requête dans `proxy.ts`), au prix de la coque statique et du cache de page ; décision de produit, à chiffrer avec des mesures de performance. `require-trusted-types-for 'script'` n'est pas posé : le chargeur de fragments de Next.js et React créent des scripts et des éléments par DOM, ce qui bloquerait l'hydratation.

## 4. Ce qui n'est pas corrigé, et pourquoi

| # | Constat | Pourquoi | Coût si c'est faux |
|---|---|---|---|
| N1 | `'unsafe-inline'` en `script-src` | §3 | XSS non arrêtée par la CSP |
| N2 | **Corrigé le 28/10 (§4b, R9).** Ruling R9 inexact : le détenteur du jeton d'administration peut déclarer un fournisseur dont `baseUrl` est son propre serveur HTTPS public, lui associer la référence d'un autre fournisseur (type `llm_provider`) et cliquer « Tester » : la clé part chez lui (la portée n'interdit que les références de la plateforme) | Lier chaque secret à un hôte demande de nouvelles colonnes du Coffre et une décision d'exploitation. Atténuations : jeton d'administration jamais exposé (§9), réseau interne refusé en production | Fuite des clés fournisseurs par un administrateur malveillant ou un jeton volé. **Recommandation** : liste d'hôtes fournisseurs fixée par l'opérateur (`NEXORA_PROVIDER_HOSTS`) à la prochaine vague |
| N3 | **Corrigé le 28/10 (§4b).** Cookie d'aperçu (`__prerender_bypass`) constant par construction, sans expiration | Correctif prévu (cookie signé de 30 min vérifié dans `proxy.ts`), non fait faute de temps ; lecture seule de brouillons | Un navigateur partagé garde l'aperçu jusqu'au prochain build |
| N4 | **Corrigé le 28/10 (§4b).** Pages inconnues : chaque slug inventé fait une requête Directus et une entrée de cache (30 jours) | Cache négatif court à écrire ; limite de débit du proxy en attendant | Pression sur Directus et le cache |
| N5 | **Corrigé le 28/10 (§4b).** Essai gratuit répétable avec de nouveaux comptes (courriel jetable) ; P2 résiduel (n sessions ouvertes en 30 min) | Décision de produit (empreinte de carte, courriel normalisé) | Quelques essais en trop |
| N6 | **Tranchées le 28/10 (§4b, rulings).** Décisions de produit relevées à l'audit : changement d'offre par le portail Stripe conserve les crédits de l'ancienne offre (portail non configuré dans le dépôt) ; crédits inclus intégraux avec un code de 99 % ; code d'essai sans carte ; achat dépensé puis contesté (solde négatif) | À trancher par le fondateur | Pertes financières bornées |
| N7 | Jeton « Publication » du site porte des droits d'écriture de brouillons ; `directus_revisions` lisible des rôles humains ; X-Powered-By de Directus | Sans licence Directus, aucune règle de permission ; moindre privilège à refaire avec la licence | Voir `docs/cms.md` |
| N8 | **Sans objet à ce jour (§4b).** Pare-feu sortant des VM déjà actives inchangé jusqu'à la prochaine réinstallation ; `fe80::/10` ouvert ; empreinte d'hôte SSH non épinglée entre installation et nettoyage | Réconciliation de masse à planifier avec l'opérateur | Mouvement latéral entre VPS existants |
| N9 | **Corrigé le 28/10 (§4b).** Méthode `TRACE` : 500 générique sans en-têtes (aucun écho) | Comportement de Next.js avant `proxy.ts` ; à refuser au proxy frontal (guide §9) | Réponse bruyante |
| N10 | `bun audit` : `deepmerge` 4.3.1 (extension Directus, aucun correctif publié) et `esbuild` ≤ 0.24.2 (drizzle-kit, serveur de développement jamais lancé) | Outils de build locaux | Aucun en production |
| N11 | Soupçons non confirmés : LiteLLM téléchargerait lui-même une `image_url` (SSRF depuis son réseau, jamais observé avec `openrouter/` et `openai/`) ; champs internes d'une instance d'agent recopiés au client | Nécessite LiteLLM et WorkStudio réels | À vérifier à la première mise en ligne |

## 4b. Complément du 28/10/2026 (branche `recette/securite2`, base `fcdf160`)

Chaque correctif a son test écrit et **vu échouer d'abord** (sauf mention). Suites exécutées une à une sur des bases jetables ; l'aperçu et les méthodes HTTP ont aussi été vérifiés en vrai sur un serveur de développement (port 3526, base `app_securite2` clonée de `app_s9`).

| # | Faille | Cause | Correctif | Tests (RED → GREEN) |
|---|---|---|---|---|
| R9 | Un détenteur du jeton d'administration envoyait la clé d'un fournisseur (ou d'une instance WorkStudio, d'un serveur Proxmox) vers un hôte HTTPS qu'il contrôle : « Tester », synchronisation LiteLLM, appel d'agent | La portée n'interdisait que les références de la plateforme et les mauvais types ; rien ne liait une clé à une destination | **Liste d'hôtes par type de secret, fixée par l'opérateur dans l'environnement** (`NEXORA_SECRET_HOSTS_MODEL_PROVIDER`, `_WORKSTUDIO`, `_PROXMOX`), valeurs par défaut sûres pour les fournisseurs connus (HTTPS seulement), rien par défaut pour WorkStudio et Proxmox, boucle locale hors production. Contrôle **à l'écriture sur la paire adresse + clé effective** (changer seulement l'un des deux) et **à chaque usage** (une fiche écrite en base n'envoie rien). Guide §3, §7, §8.0 | `secret-hosts.test.ts` (9), `admin-handlers.test.ts` « hôte de la clé (R9) » (5), `agents/handlers.test.ts` (3), `proxy-agents.test.ts`, `vps/admin-handlers.test.ts` (3), `vps/secret-host.test.ts` (2) |
| E1 | Essais gratuits répétables avec de nouveaux comptes | Un seul essai par organisation | **Un essai par carte (`card.fingerprint` Stripe) et par courriel normalisé**, par famille d'offre (`trial_claims`, empreintes SHA-256) ; le webhook résilie chez Stripe, sans prélèvement, un essai dont une clé a déjà servi (`trial_denials`) ; l'événement échoue (renvoi) si Stripe est injoignable ; au Checkout, un courriel déjà servi n'obtient plus d'essai ; **un code d'essai exige toujours une carte** | `trial-guard.test.ts` (15), `http.test.ts` (2) |
| A1 | Crédits inclus d'une offre annuelle versés d'un coup | Décision du fondateur déléguée | **Un douzième par mois**, valable le mois en cours (`subscription_credit_tranches`, tâche horaire `ledger.grant-tranches`), idempotent, sans dérive de calendrier ; remboursement : les mois à venir sont retirés d'abord ; litige : suspension, reprise du versé, restitution si gagné, retrait si perdu | `subscription-credits.test.ts` (10), `webhook-annual.test.ts` (7), `ledger-handlers.test.ts`, `scheduler.test.ts` |
| P2 | Un code « un par client » payé dans n sessions ouvertes en 30 minutes | Stripe ne limite pas « un par client » ; la limite n'est comptée qu'au paiement | Session créée sous verrou (organisation + code) puis expiration des autres sessions ouvertes du client qui portent le code (crédits, abonnement, VPS) | `checkout.test.ts` (3) |
| N3 | Cookie d'aperçu (`__prerender_bypass`) constant, sans expiration | Cookie du Draft Mode de Next.js | **Session signée `nexora_preview` de 30 minutes** (HMAC avec `NEXORA_PREVIEW_SECRET`) posée par `/api/preview` ; `proxy.ts` n'honore le Draft Mode qu'avec elle et efface les cookies sinon (redirection). Vérifié en vrai : cookie seul → 307 qui efface ; lien signé → page d'aperçu `noindex` ; session altérée → effacée | `preview-link.test.ts` (3), `proxy.test.ts` (4) |
| N4 | Chaque slug inventé = requête Directus + entrée de cache de 30 jours | `cacheLife` identique pour une page absente | Adresse inconnue : 2 minutes de cache au plus (`cms/cache-life.ts`) | `cache-life.test.ts` (3) |
| N9 | `TRACE` → 500 de Next.js ; `PROPFIND`/`PURGE` → page en 200 ; `DELETE` sur une page → 200 | Next.js construit un `Request` pour `proxy.ts` avant d'y entrer (TRACE lève) ; méthodes inconnues traitées comme GET | **405 avec `Allow` avant Next.js** pour toute méthode hors GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS (garde posée sur l'événement `request` de Node par `instrumentation.ts`) ; `PUT`/`PATCH`/`DELETE` sur une page : 405 dans `proxy.ts`. Vérifié en vrai (TRACE, PROPFIND, PURGE : 405 ; GET : 200). La consigne au proxy (guide §9) reste la première barrière | `http-method-guard.test.ts` (3), `proxy.test.ts` (2) |

**Rulings (décisions de produit N6, tranchées dans le sens le plus sûr pour Nexora ; coût si faux : un geste commercial à rétablir, jamais une perte d'argent) :**

- **Ruling : changement d'offre par le portail Stripe.** Le portail n'offre plus le changement d'offre ni la résiliation immédiate avec prorata : l'application crée au premier usage une configuration restreinte (moyens de paiement, factures, coordonnées sauf le courriel, résiliation **en fin de période** sans prorata) ; sans elle, aucun portail (jamais la configuration par défaut). Changer d'offre = résilier puis souscrire à la nouvelle. Si un changement a lieu quand même (tableau de bord de Stripe), les crédits suivent le prix payé (ruling suivant). Coût si faux : une étape de plus pour changer d'offre.
- **Ruling : crédits inclus proportionnels au prix payé.** `crédits = crédits de l'offre × total facturé avant taxes (après rabais) ÷ prix de l'offre`, plafonné à 100 % : un code de 99 % ne donne que 1 % des crédits, un rabais de 20 % en donne 80 %. Sans `total_excluding_tax` (anciennes versions d'API), octroi complet. Coût si faux : un rabais marketing de 20 % se voit aussi sur les crédits.
- **Ruling : code d'essai.** Un code d'essai exige **toujours** une carte (le réglage « sans carte » ne vaut que pour l'essai propre à une offre) et ne donne pas un second essai à un courriel déjà servi. Coût si faux : un code « essai sans carte » de campagne doit passer par l'offre (`trial_card = not_required`) et reste limité par courriel.
- **Ruling : achat dépensé puis contesté.** Le solde négatif d'une reprise reste une dette qui bloque l'API (inchangé : seul un achat le ramène à zéro) ; en plus, une organisation dont un litige est **ouvert ou perdu** (`payment_disputes`) ne reçoit plus d'essai ni de rabais (motif « ne peut pas être appliqué à votre compte ») ; un litige gagné lève la restriction. Les dons du personnel restent une décision de l'équipe. Coût si faux : un client en litige légitime attend l'issue pour un code.

**Ce qui reste, et pourquoi.** N1 (`'unsafe-inline'`, §3), N7 (permissions Directus : exige la licence), N10 (outils de build sans correctif publié) et N11 (soupçons à vérifier avec LiteLLM et WorkStudio réels) ne se corrigent pas dans le code. **N8 est sans objet à ce jour** : le pare-feu des VM est posé à chaque installation et réinstallation (`stepFirewall`, idempotent) et aucun Proxmox réel n'est branché, donc aucune VM existante à réconcilier ; quand il y en aura, réinstaller applique la règle (ou rejouer l'étape pare-feu) ; `fe80::/10` reste ouvert (découverte de voisins) et l'empreinte d'hôte SSH n'est pas épinglée entre installation et nettoyage (risque borné au réseau du serveur Proxmox).

## 5. Essais d'intrusion (site de production local, port 3524)

Reproductible : `BASE_URL=http://localhost:3524 MAILPIT_URL=http://127.0.0.1:8026 bun web/scripts/pentest-securite.ts` (refuse toute adresse non locale et le port 3590). **79 contrôles, tout vert**, dont :

- chemins sensibles (`.env`, `.git`, traversées encodées) : 404 ; aucune carte de sources ; aucun CORS permissif ; `X-Forwarded-Host` jamais reflété (page, sitemap, redirection 308) ;
- réflexion de paramètres (`<script>`, `onerror`, `onload`) : rien de non échappé ; aucune redirection ouverte (`callbackURL`, `redirect`, `path`) ;
- corps de 2 Mo, pollution de prototype, CRLF dans un champ, mauvais type de contenu : refusés ;
- webhook Stripe : signature absente, vide, mal formée, faux secret, horodatage ancien : jamais 200 ;
- jeton d'administration : 429 après 10 faux, autre adresse non touchée ; passerelle : en-têtes d'autorisation invalides, 401, sans lenteur ;
- comptes : réinitialisation et inscription sans énumération, même statut pour un mauvais mot de passe et un compte inconnu, cookie `HttpOnly; SameSite=Lax`, nouveau jeton à chaque connexion, **cookie de session imposé par l'attaquant remplacé**, déconnexion qui invalide le jeton, CSRF sur facturation, clés et VPS (origine étrangère et origine absente), **IDOR** (Bob ne peut pas révoquer la clé d'Alice ni agir sur son identifiant), organisation active forgée refusée, verrouillage réel (429, `Retry-After`), mots de passe refusés, nom hostile refusé ;
- double authentification : activation, aucune session avant le second facteur, mauvais code refusé, appareil jamais mémorisé, code de secours à usage unique, secret absent de toute réponse, rejeu TOTP refusé.

`bun web/scripts/check-guards.ts` : toutes les routes du registre refusent sans identification (les sondes d'administration acceptent 401 **ou** 429) et la matrice d'en-têtes (nosniff, X-Frame-Options, Referrer-Policy, HSTS, COOP, Permissions-Policy, pas de X-Powered-By, CSP adaptée, CORP) est contrôlée sur 10 pages (200, 404, redirection, espace client) et 11 autres types de réponse (API, passerelle, médias, image `/og`, `llms.txt`, sitemap, robots, icône, manifeste, adresse mal formée, ressource statique) ainsi que sur un POST refusé. `bun run e2e` (parcours « gardes et flux ») : réussi, aucune requête hors origine ni violation de CSP dans un navigateur réel. `bun web/scripts/e2e-2fa.ts` : parcours navigateur de la 2FA (activation, déconnexion, connexion à deux facteurs), aucune violation de CSP.

Défaut trouvé **par** les essais : le rejeu d'un code TOTP (A2) et un 500 sur `TRACE` (N9).

## 6. À faire par le fondateur ou l'opérateur

1. **WAF** devant le site (règles OWASP CRS) et limitation de débit au proxy (guide §9) ; refuser `TRACE`.
2. **Sauvegardes hors site** chiffrées et un essai de restauration trimestriel (`docs/recette/sauvegarde.md`) ; sauvegarder aussi `BETTER_AUTH_SECRET` (perdu : les seconds facteurs deviennent inutilisables).
3. **Rotation des clés** : maître du Coffre, jeton d'administration, `BETTER_AUTH_SECRET` (en prévenant que les sessions seront fermées), jetons statiques de Directus ; à chaque départ d'une personne ayant eu accès.
4. **Migrer le cluster PostgreSQL et Directus existants** (rôles séparés, 2FA de l'administrateur après création de son jeton statique, `compose.prod.yml`) : `docs/infra.md`, sauvegarde chiffrée d'abord.
5. **Appliquer les migrations 0014 et 0015** (`bun run db:migrate`) et prévenir les comptes du personnel d'activer leur double authentification.
6. **Déclarer les hôtes des clés** (§4b, R9) avant de brancher un fournisseur hors liste par défaut, une instance WorkStudio ou un serveur Proxmox : `NEXORA_SECRET_HOSTS_*` dans l'environnement du site **et** du worker, puis redémarrer ; sinon « hôte non autorisé ». Les fournisseurs déjà enregistrés avec une clé sur un hôte hors liste (par exemple `host.docker.internal`) ne se synchronisent plus tant qu'ils ne sont pas déclarés. Confirmer ou corriger les rulings de §4b ; décider de lever `'unsafe-inline'` (§3) ; décider HSTS `includeSubDomains`/`preload`.
6b. **Appliquer la migration 0015** et relancer le worker (nouvelle tâche `ledger.grant-tranches`). Le portail client Stripe prend la configuration restreinte à son premier usage : vérifier dans le tableau de bord de Stripe qu'aucune autre configuration ne l'ouvre.
7. Remplacer les valeurs de développement (SMTP, clés) par des secrets de fichiers ; poser `DIRECTUS_COOKIE_SECURE=true` et `SITE_URL` en HTTPS.

## 7. Migration et fichiers

**Migration signalée : `packages/db/drizzle/0014_s10_securite_2fa.sql`** (la dernière sur `main` est 0013) : tables `two_factors` et `auth_lockouts`, colonne `users.two_factor_enabled`. À renuméroter par l'orchestrateur en cas de collision. Schéma Directus : aucun changement de collection ; `cms/scripts/apply.ts` pose maintenant la 2FA, la politique de mot de passe et retire la permission de modifier les fichiers (à rejouer par l'orchestrateur, voir `docs/cms.md`). Dictionnaires : clés ajoutées dans `account-*`, `account-vps-*`, `gateway-*` (plafond de clés) ; nouveaux `security-*`. Dépendance ajoutée : `qrcode-generator` 2.0.4 (MIT, sans dépendance, code QR dessiné en SVG par React, le secret ne quitte pas la page).

**Migration signalée (28/10) : `packages/db/drizzle/0015_s11_essais_credits_mensuels_litiges.sql`** (la dernière sur `main` est 0014) : tables `subscription_credit_tranches` (douzièmes des offres annuelles), `trial_claims` et `trial_denials` (essais), `payment_disputes` (litiges). Aucun changement du schéma Directus. À renuméroter par l'orchestrateur en cas de collision. Nouvelles variables : `NEXORA_SECRET_HOSTS_MODEL_PROVIDER`, `NEXORA_SECRET_HOSTS_WORKSTUDIO`, `NEXORA_SECRET_HOSTS_PROXMOX` (site et worker). Nouveau fichier `web/src/instrumentation.ts` (garde des méthodes HTTP). Signature de `proxmoxClientFactory` et de `connectServer` : `checkHost` obligatoire.

## 8. Reproduire

```bash
bun run check                                   # lint, types, tests
bun web/scripts/check-guards.ts                 # gardes, matrice d'en-têtes
NEXORA_PASSWORD_BREACH_CHECK=off next start -H localhost -p 3524   # site de production d'essai
BASE_URL=http://localhost:3524 bun web/scripts/pentest-securite.ts
BASE_URL=http://localhost:3524 bun web/scripts/e2e-2fa.ts
bun audit
bash deploy/tests/compose.test.sh && bash deploy/tests/db-roles.test.sh
# 28/10 : méthodes exotiques et aperçu sur un serveur de développement (jamais le port 3590)
curl -i -X TRACE http://localhost:3526/            # 405 avec Allow
curl -i -H 'Cookie: __prerender_bypass=x' http://localhost:3526/solutions   # 307 qui efface les cookies d'aperçu
```
