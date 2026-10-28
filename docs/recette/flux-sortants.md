# Flux sortants : inventaire et comparaison aux promesses

Recette S9, daté du 27/10/2026. Version du code : branche `s9-recette` (après fusion de `main` à b6c33ec).
Deux méthodes, qui se recoupent : **lecture du code** (tous les appels réseau sortants du site, du worker, des paquets et des extensions Directus) et **mesure dans un navigateur réel** sur un build de production.

Lire d'abord : conception §3 et §4 (souveraineté), registre `cms/content/claims.json` (affirmations CL-xx, toutes « en revue » : rien n'est approuvé par un agent).

## 1. Ce que voit un visiteur : aucune ressource tierce

Commande reproductible : `BASE_URL=http://localhost:3790 bun web/scripts/audit-flux.ts` (Chromium de Playwright, sans extension ni profil ; build de production lancé avec `next start -H localhost`). Elle charge chaque page, la fait défiler (chargement différé), journalise chaque requête réseau et chaque violation de la politique de sécurité (CSP), et **échoue** si une requête quitte l'origine du site.

Mesure du 27/10/2026 (reprise par `bun run e2e`, parcours « gardes-et-flux » ; le journal complet est dans `.data/e2e/<horodatage>/`) :

| Page | Chargée | HTTP | Requêtes | Types | Hors origine | Violations CSP | Témoins |
|---|---|---|---|---|---|---|---|
| / | / | 200 | 24 | document 1, font 3, stylesheet 1, script 9, fetch 10 | aucune | 0 | aucun |
| /modeles | /modeles | 200 | 15 | document 1, font 3, stylesheet 1, script 8, fetch 2 | aucune | 0 | aucun |
| /vps | /vps | 200 | 20 | document 1, font 3, stylesheet 1, script 10, fetch 5 | aucune | 0 | aucun |
| /agents | /agents | 200 | 15 | document 1, font 3, stylesheet 1, script 8, fetch 2 | aucune | 0 | aucun |
| /compte (non connecté) | /compte/connexion | 200 | 39 | document 2, font 6, stylesheet 2, script 21, fetch 8 | aucune | 0 | aucun |
| /en | /en | 200 | 21 | document 1, font 3, stylesheet 1, script 9, fetch 7 | aucune | 0 | aucun |
| /en/modeles | /en/modeles | 200 | 15 | document 1, font 3, stylesheet 1, script 8, fetch 2 | aucune | 0 | aucun |
| /en/vps | /en/vps | 200 | 19 | document 1, font 3, stylesheet 1, script 10, fetch 4 | aucune | 0 | aucun |
| /en/agents | /en/agents | 200 | 15 | document 1, font 3, stylesheet 1, script 8, fetch 2 | aucune | 0 | aucun |
| /en/compte (non connecté) | /en/compte/connexion | 200 | 39 | document 2, font 6, stylesheet 2, script 21, fetch 8 | aucune | 0 | aucun |

Lecture : les trois polices sont servies par le site lui-même (OFL, locales) ; les requêtes `fetch` sont les préchargements de navigation de Next.js vers le même site ; aucune analytique, aucun CDN, aucune carte, aucune vidéo, aucun cadre externe ; aucun témoin (cookie) n'est posé à un visiteur non connecté. `/compte` redirige vers `/compte/connexion` sans session (comportement voulu).

Ce résultat est **imposé** par la politique de sécurité : `default-src 'self'` et aucune origine tierce dans `script-src`, `style-src`, `img-src`, `font-src`, `connect-src` (voir `docs/recette/securite.md` §1). Une ressource tierce ajoutée par erreur serait bloquée par le navigateur *et* ferait échouer `audit-flux.ts`.

Le seul cas où une page peut appeler une origine tierce est la **bulle WorkStudio**, activée par l'administrateur sur des pages qu'il choisit : la CSP n'ouvre alors que l'origine configurée (script, cadre, connexion), nulle part ailleurs. Désactivée par défaut.

Liens (et non requêtes) : le visiteur qui paie est **redirigé** vers `checkout.stripe.com` (achat de crédits, abonnement, VPS) et `billing.stripe.com` (portail). C'est une navigation voulue du client, pas un chargement par le site.

## 2. Inventaire des appels sortants, par lecture du code

« Désactivable » = on peut empêcher l'appel sans modifier le code. Aucune valeur secrète n'est dans ce tableau.

### 2.1 Site (`web/`, Next.js côté serveur)

| # | Flux | Hôte | Déclencheur | Données envoyées | Configurable | Désactivable | Code |
|---|---|---|---|---|---|---|---|
| W1 | Lecture du contenu publié | Directus (`DIRECTUS_URL`, réseau interne) | Rendu et revalidation de pages | Jeton « Lecteur » ; requêtes de lecture. Aucune donnée de visiteur | Oui | Non (cœur du site) ; en panne, le site sert ses instantanés (voir `cms-indisponible.md`) | `server/cms/client.ts`, `media.ts`, `billing/plans.ts` |
| W2 | Aperçu des brouillons | Directus | Lien d'aperçu signé et daté | Jeton « Publication » | Oui | Oui (sans `NEXORA_PREVIEW_SECRET`, aucun lien) | `server/cms/runtime.ts` |
| W3 | Base `app` | PostgreSQL (`DATABASE_URL`, interne) | Toute requête | Données de l'application | Oui | Non | `server/db.ts` |
| W4 | **Passerelle de modèles** | LiteLLM (`LITELLM_BASE_URL`, interne) | Chaque appel `/v1/*` d'un client | **Contenu des requêtes du client** ; clé maîtresse LiteLLM (jamais exposée au client) | Oui | Oui (sans `LITELLM_MASTER_KEY`, `/v1` répond 503) | `server/gateway/proxy.ts`, `deps.ts` |
| W5 | Synchronisation du catalogue | LiteLLM | Publication d'une version de catalogue | Clés des fournisseurs (lues du Coffre) et adresses amont | Oui | Oui (action manuelle de l'administrateur) | `server/gateway/litellm.ts` |
| W6 | **Instances WorkStudio** | Adresse saisie par l'administrateur | Appel d'un agent hébergé ; « Tester » ; « Découvrir » | Contenu de la requête du client ; clé d'espace WorkStudio (Coffre) | Oui, saisie dans Directus | Oui (instance désactivée) | `server/agents/*`, `gateway/proxy.ts` |
| W7 | « Tester le fournisseur » | Adresse saisie par l'administrateur | Action manuelle | Clé du fournisseur (Coffre). Aucun contenu de client | Oui | Oui (action manuelle) | `server/gateway/provider-test.ts` |
| W8 | **Stripe** (API) | `api.stripe.com` (SDK officiel, **mode test** imposé par le code) | Achat de crédits, abonnement, VPS, portail, « Publier vers Stripe », remboursement | Courriel, nom, montant, identifiants d'organisation et de commande (métadonnées), adresse de facturation saisie chez Stripe | Clé dans le Coffre | Oui (sans clé Stripe, paiements indisponibles) | `server/stripe/*`, `billing/*`, `vps/stripe-sync.ts` |
| W9 | Webhooks Stripe | (entrant) | Événement Stripe | Signature vérifiée sur le corps brut ; événements `livemode` refusés | Secret dans le Coffre | Oui | `server/stripe/webhook-route.ts` |
| W11 | **Vérification des fuites de mots de passe** (vague 2) | `api.pwnedpasswords.com` (HTTPS, délai 3 s, sans redirection) | Inscription, changement et réinitialisation du mot de passe, en production seulement | Les 5 premiers caractères de l'empreinte SHA-1 du mot de passe (k-anonymat, `Add-Padding`) ; jamais le mot de passe ni le courriel | `NEXORA_PASSWORD_BREACH_CHECK` | Oui (`off`) | `server/auth/password-policy.ts` |
| W10 | Courriels transactionnels | Serveur SMTP (`SMTP_URL`) | Vérification d'adresse, réinitialisation de mot de passe | Adresse du destinataire, lien à usage unique | Oui | Non (la vérification du courriel est obligatoire) | `server/auth/mailer.ts` |

### 2.2 Worker (`worker/`) et paquets

| # | Flux | Hôte | Déclencheur | Données envoyées | Configurable | Désactivable | Code |
|---|---|---|---|---|---|---|---|
| K1 | Notification du formulaire de diagnostic | Serveur SMTP (`SMTP_HOST`…) | Nouvelle demande | Nom, courriel, entreprise, besoin, message saisis par le visiteur, **vers l'équipe** (`CONTACT_NOTIFY_TO`) | Oui | Non (la demande est d'abord enregistrée en base ; l'envoi se reprend) | `worker/src/contact-notify.ts` |
| K2 | Agents du site → passerelle | `NEXORA_APP_INTERNAL_URL` (le site) | Exécution d'un agent | Brief, extraits de pages ; clé de l'agent | Oui | Oui (agent désactivé, budget) | `worker/src/agents/gateway-client.ts` |
| K3 | Agents du site → Directus | `DIRECTUS_URL` | `create_draft` | Brouillon (jamais de publication ni de suppression) | Oui | Oui | `worker/src/agents/directus-client.ts` |
| K4 | **Ingestion de sources** (Veille, Rédacteur) | URL fournie par un humain | Brief avec une URL | Une requête GET sans identifiant. Garde SSRF `@nexora/net` ; redirections non suivies ; taille et durée bornées | Non | Oui (agent désactivé) | `worker/src/agents/ingest.ts` |
| K5 | Audits du site | Le site lui-même (`SEO_AUDIT_BASE_URL`, sinon `NEXORA_APP_INTERNAL_URL`, sinon `SITE_URL`) | Planificateur nocturne | Aucune donnée ; Lighthouse et axe pilotent Chromium sur le site | Oui | Oui (planificateur) | `worker/src/seo/audit*.ts` |
| K6 | Audit des liens (lychee) | **Tous les hôtes liés par les pages** | Audit nocturne | Une requête par lien externe ; révèle l'adresse IP du serveur aux sites liés | Binaire `LYCHEE_BIN` | Oui | `worker/src/seo/audit-links.ts` |
| K7 | Indexation IndexNow | `api.indexnow.org` | Après publication | Domaine, clé IndexNow, liste d'**URL publiques**. Jamais en préproduction (`SITE_ENV` ≠ `production`) ; adaptateur « écriture » requis | Oui | Oui (défaut : simulation ou non connecté) | `worker/src/seo/indexing.ts` |
| K8 | Indexation Bing | `ssl.bing.com` | Après publication | Clé API Bing (Coffre) et URL publiques. Mêmes conditions que K7 | Oui | Oui | `worker/src/seo/indexing.ts` |
| K9 | Test des adaptateurs | `api.dataforseo.com`, `www.googleapis.com` et `oauth2.googleapis.com` (Search Console, **lecture seule**), `POSTIZ_URL`, `ssl.bing.com` | « Tester » d'un adaptateur dans le module SEO | Identifiants du Coffre propres à chaque service. L'assertion Google ne part que vers `oauth2.googleapis.com` (correctif S9) | Oui | Oui (adaptateur « non connecté » par défaut) | `worker/src/seo/adapters.ts` |
| K10 | **Proxmox VE** | Hôte saisi par l'administrateur (réseau de l'opérateur) | Provisionnement, arrêt, démarrage, réinstallation, suppression | Jeton API (Coffre) après vérification TLS ou empreinte épinglée ; configuration de VM, clé SSH publique du client, adresse IP | Oui | Oui (serveur « maintenance » ou « hors ligne ») | `packages/vps/src/proxmox/*`, `servers.ts` |
| K11 | SSH vers les VPS des clients | Adresse IP de la VM | Installation de l'application | Script versionné (somme SHA-256 vérifiée) ; clé privée du worker (Coffre) | Oui | Oui | `packages/vps/src/install.ts` |
| K12 | Contenu des VPS (côté VM du client, pas du site) | `download.docker.com`, registres d'images, dépôts des applications | Installation | Téléchargements seulement ; port 25 sortant fermé par défaut | Scripts versionnés | Oui | `packages/vps/src/seed/*` |

### 2.3 Services de la pile (`deploy/compose.yml`) et extensions

| # | Flux | Hôte | Déclencheur | Données envoyées | Configurable | Désactivable |
|---|---|---|---|---|---|---|
| D1 | Directus → site | `NEXORA_APP_INTERNAL_URL` | Promotion d'une page ; module Coffre ; modules d'administration | Identifiants de page à revalider ; jeton d'administration (interne) ; valeur d'un secret collé dans le Coffre, **directement** vers le Coffre | Oui | Non |
| D2 | Télémétrie de Directus | — | — | `TELEMETRY=false` dans le compose : **aucun envoi** | Oui | Déjà désactivée |
| D3 | **Marketplace de Directus** | `registry.directus.io` (constante `DEFAULT_REGISTRY` de `@directus/extensions-registry`) | Un administrateur ouvre la page Marketplace | Requête de recherche d'extensions, depuis le serveur Directus | Variable `MARKETPLACE_REGISTRY` | **Neutralisé le 27/10/2026** : `MARKETPLACE_REGISTRY: http://127.0.0.1:9` dans `deploy/compose.yml` (essai sur un Directus jetable de la même image : `GET /extensions/registry` répond 503 « Unable to connect to the registry server » en moins d'une seconde, sans sortie vers l'extérieur) ; voir §4, écart E3 |
| D4 | Courriels de Directus | `EMAIL_SMTP_HOST` | Invitation, réinitialisation d'un compte Directus | Adresse du destinataire | Oui | Oui |
| L1 | LiteLLM → fournisseurs amont | `api_base` de chaque fournisseur (Coffre pour la clé) | Chaque appel de modèle | **Contenu des requêtes du client**. `turn_off_message_logging: true`, `store_prompts_in_spend_logs: false`, aucun repli (`fallbacks`) configuré, aucune télémétrie (aucun attribut `litellm.telemetry` dans l'image épinglée) | Oui | Oui (fournisseur désactivé) |

### 2.4 Outils de construction (hors exécution du site)

| # | Flux | Hôte | Constat |
|---|---|---|---|
| B1 | **Télémétrie anonyme de Next.js** | `telemetry.nextjs.org` (module `next/dist/telemetry`) | **Activée par défaut** (`next telemetry status` : Enabled). Elle part de la machine qui lance `next build` ou `next dev`. Corrigé : les scripts `dev`, `build` et `start` de `web/package.json`, `scripts/e2e.ts` et `check-cms-down.ts` posent `NEXT_TELEMETRY_DISABLED=1`. Un `next build` lancé à la main doit poser la variable (guide opérateur). Mes propres builds de cette recette, faits avant ce correctif, l'ont émise une fois. |
| B2 | Dépendances | Registre npm (bun) | Seulement à l'installation. Verrouillé par `bun.lock`. |
| B3 | Images | `docker.io`, `ghcr.io` | Seulement au déploiement. Épinglées par empreinte. |

### 2.5 Ce qui n'existe pas (vérifié)

Aucun service d'analyse, de cartes, de polices distantes, de vidéo, de CAPTCHA tiers (ALTCHA est auto-hébergé), de chat tiers, de réseau social, d'ancre vers un CDN. Aucune requête de la page vers un sous-traitant. Aucun témoin publicitaire. Umami (conception §4) n'est pas branché.

## 3. Garde sur les adresses saisies (SSRF)

Trois familles d'adresses sont saisies dans l'administration (W6/W7 fournisseurs et instances, K10 serveurs Proxmox). Avant ce correctif, rien n'empêchait de viser `127.0.0.1`, le réseau interne ou les métadonnées du nuage, ni d'envoyer à ces adresses une clé du Coffre. Détails, tests et rulings : `docs/recette/securite.md` §3.

## 4. Comparaison aux promesses : promesse, réalité, à corriger

| # | Promesse (source) | Réalité constatée | À corriger |
|---|---|---|---|
| E1 | « Le site ne charge aucune ressource tierce » (conception §4, polices OFL locales ; CL-78 : trois plans distincts) | **Conforme** : 10 pages, 0 requête hors origine, 0 violation de CSP, 0 témoin (§1). La CSP l'impose désormais (avant S9, aucune CSP : une régression aurait passé inaperçue) | Rien |
| E2 | CL-06 « Aucun appel à un service d'IA externe n'est configuré sans votre accord écrit » ; CL-76 « Le système ne bascule jamais en silence vers un modèle externe » | **Conforme dans le code** : un fournisseur n'existe que si un administrateur le saisit ; LiteLLM n'a aucun repli ; la résidence est affichée par modèle (en-tête `x-nexora-residency`, page `/modeles`). **Mais** le seul modèle présent en développement (`nexora/glm-5-3`, résidence « autre ») passe par un LiteLLM de développement vers un modèle infonuagique | Retirer ce modèle et son fournisseur de développement avant la publication (liste de contrôle du guide opérateur) |
| E3 | Souveraineté : « le Québec » ; aucun flux non déclaré (CL-77 : flux listés avant mise en service) | **Écart** : la Marketplace de Directus peut interroger `registry.directus.io` depuis le serveur dès qu'un administrateur l'ouvre (valeur par défaut prouvée dans le code de l'image épinglée) ; la télémétrie de Next.js (B1) était active à la construction | B1 corrigé. **E3 fermé le 27/10/2026** : `MARKETPLACE_REGISTRY` est posé sur une adresse inatteignable dans `deploy/compose.yml` (test `deploy/tests/env.test.sh`) et son effet vérifié sur un Directus jetable ; le Directus partagé de développement ne le prend qu'à sa prochaine recréation (`docker compose up -d directus`) |
| E4 | CL-07 « Nous ne réutilisons pas les données d'un client… pour entraîner un modèle » | **Conforme pour Nexora** : aucun contenu de requête n'est journalisé ni stocké (journal de l'app sans contenu ; `store_prompts_in_spend_logs: false` ; `turn_off_message_logging: true`). **Hors du contrôle de Nexora** : ce que fait le fournisseur amont choisi (champ « politique des données » du fournisseur, affiché publiquement) | Renseigner la politique des données de chaque fournisseur réel avant de l'activer |
| E5 | CL-73 / CL-L02 « lieu de l'hébergement… liste des sous-traitants précisés par écrit » ; transfert hors Québec | Sous-traitants réels du site, à déclarer : **Stripe** (W8, États-Unis, paiement), **le serveur SMTP** choisi (W10, K1), **Postiz / Bing / IndexNow / DataForSEO / Google** (K7 à K9, seulement si activés), **les fournisseurs de modèles** (L1) | Compléter CL-A05 (preuve du lieu d'hébergement) et la liste des sous-traitants avec le fondateur ; faire l'évaluation exigée pour les transferts hors Québec avant d'ouvrir les paiements réels |
| E6 | CL-A07 « mesure d'audience, témoins, prestataires » (à compléter) | Aucune mesure d'audience, aucun témoin pour le visiteur anonyme (§1). Les seuls témoins sont ceux de la session Better Auth (HttpOnly, SameSite=Lax, Secure en HTTPS) après connexion, et le témoin d'aperçu (Draft Mode, réservé aux administrateurs) | Si Umami est branché plus tard, mettre à jour CL-A07 et la politique de confidentialité |
| E7 | CL-12 « Les offres en libre-service (serveurs, catalogue de modèles à crédits, agents hébergés) ne sont pas encore ouvertes » | **Écart de statut** : les pages et API existent et fonctionnent en **mode test** (Stripe test, plans « [DEV] » commandables) | **Corrigé le 27/10/2026** : CL-12 dit désormais « pas encore ouvertes **à la vente** : parcours de compte et de paiement en mode test seulement, aucun paiement réel, aucun prix publié » (son indication de preuve disait à tort que S5 à S7 n'étaient pas livrés) ; la FAQ de WorkStudio ne dit plus « il n'y a pas de compte à créer » (un compte se crée en mode test). Reste à la charge du fondateur : approuver l'affirmation, et garder les plans « [DEV] » désactivés tant que la vente n'est pas décidée |
| E8 | Conception §4 : « jamais de bascule silencieuse vers un modèle externe » ; le badge de résidence est lu | Le badge vient de la fiche du modèle (saisie de l'administrateur) : le code ne peut pas vérifier où LiteLLM envoie réellement la requête | Procédure d'exploitation : toute modification de fournisseur passe par une version de catalogue approuvée (déjà le cas) ; relire la résidence à chaque changement |
| E9 | Page de confiance : « aucun lien sortant surprise » | L'audit des liens (K6) contacte les hôtes des liens externes et leur révèle l'IP du serveur | Négligeable ; le noter dans la liste des flux publiée |

Aucune de ces lignes n'est une accusation de mensonge : le registre d'affirmations est « en revue » et aucun texte vérifiable par le visiteur n'affirme ce que le code contredit. Les écarts E3, E5 et E7 sont à traiter **avant** que les affirmations correspondantes soient approuvées.
