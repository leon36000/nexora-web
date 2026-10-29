# Sécurité : recette S9

Daté du 27/10/2026. Branche `s9-recette`. Les défauts réels trouvés ont été corrigés avec un test écrit avant le correctif (RED puis GREEN) ; ce qui n'est pas corrigé a un ruling « constat, pourquoi, coût si faux » (§7).

## Résumé

| Volet | Résultat |
|---|---|
| En-têtes HTTP | **Défaut trouvé et corrigé** : aucune CSP, aucun HSTS, aucun `X-Content-Type-Options`, `X-Powered-By: Next.js` exposé. Corrigé (§1). |
| Cookies | Conformes (§2). |
| Gardes d'accès | 31 routes recensées, chacune avec un genre de garde déclaré ; test d'inventaire (une route sans garde fait échouer les tests) et 43 sondes sur site vivant, toutes en 401/403/400/404 attendus (§3). |
| SSRF | **Défaut trouvé et corrigé** : adresses saisies en administration non contrôlées, contournement de la garde de la Veille par IPv4-dans-IPv6 (§4). |
| Secrets | **Aucun secret** dans l'historique git (81 commits), dans `.next`, ni dans les réponses publiques (§5). |
| Dépendances | 0 avis en production ; 12 avis en outillage de développement, aucun exploitable ici (§6). |
| Autres défauts corrigés | Clé du Coffre envoyable vers une adresse choisie par un administrateur (portée des secrets) ; assertion Google envoyée vers un `token_uri` falsifiable. |

## 1. En-têtes HTTP

Avant : aucun des en-têtes de sécurité (la CSP n'existait que sur les pages de la bulle WorkStudio). Maintenant, source unique `web/src/lib/security-headers.ts`, posés par `next.config.ts` (toutes les routes) et par `proxy.ts` (CSP des pages, qui dépend de la bulle).

Mesuré sur un build de production (`bun web/scripts/check-guards.ts`, 7 pages dont une inconnue en 404, `/api/health`, `/v1/models`) :

| En-tête | Valeur | Remarque |
|---|---|---|
| `Content-Security-Policy` (pages) | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` | Aucune origine tierce. `'unsafe-eval'` n'existe qu'en développement. `blob:` sert au calcul ALTCHA (formulaire de contact : testé en navigateur, 17/17). |
| `Content-Security-Policy` (`/api`, `/v1`) | `default-src 'none'; frame-ancestors 'none'` | |
| `Strict-Transport-Security` | `max-age=31536000` | « Prêt pour HTTPS » : ignoré par les navigateurs en HTTP, actif dès que le site est servi en HTTPS. Sans `includeSubDomains` ni `preload` : engagements du domaine entier, décision de l'opérateur (ruling R2). |
| `X-Content-Type-Options` | `nosniff` | Aussi sur `/api/media/*`. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `X-Frame-Options` | `DENY` | Redondant avec `frame-ancestors 'none'` (anciens navigateurs). |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` | |
| `X-Powered-By` | absent | `poweredByHeader: false`. |

Pages de la bulle WorkStudio : la politique de base est conservée et l'origine configurée **s'y ajoute** pour `script-src`, `frame-src` et `connect-src` seulement (test `security-headers.test.ts` : l'origine n'apparaît dans aucune autre directive ; `frame-ancestors` reste `'none'`).

Tests : `web/src/lib/security-headers.test.ts` (6), `web/src/proxy.test.ts` (CSP de base sur toute page, y compris redirections et POST ; fusion avec la bulle). RED observé : le module n'existait pas ; l'ancien proxy ne posait aucune politique hors bulle.

## 2. Cookies

| Témoin | Attributs observés | Où |
|---|---|---|
| Session Better Auth | `HttpOnly`, `SameSite=Lax`, `Secure` quand `SITE_URL` commence par `https://` (`useSecureCookies`) | `server/auth/index.ts` |
| Aperçu (Draft Mode, `__prerender_bypass`) | `Secure; HttpOnly; SameSite=None` (mesuré avec un lien signé valide) | Next.js. Réservé aux liens d'aperçu signés (ruling R6) |
| Visiteur anonyme | **aucun** témoin sur 10 pages (`audit-flux.ts`) | |

Condition de déploiement : `SITE_URL` doit être l'origine HTTPS réelle, sinon le témoin de session n'est pas `Secure` et le contrôle d'origine (CSRF) refuse les requêtes (guide opérateur).

## 3. Gardes d'accès

### 3.1 Inventaire

Registre : `web/src/server/security/route-guards.ts` (33 routes `route.ts`). Test d'inventaire : `route-guards.test.ts` compare le registre aux fichiers `route.ts` du dossier `src/app` ; une route sans entrée **fait échouer le test** (démontré en ajoutant une route factice). Il n'existe **aucune Server Action** (`"use server"` : 0 occurrence).

| Genre | Routes | Qui peut appeler | Sans identification |
|---|---|---|---|
| `admin-token` | `/api/admin/catalog`, `hosted-agents`, `site-agents`, `seo`, `vps`, `vault`, `vault/[ref]`, `preview-link`, `stripe/publish-plan`, `/api/revalidate` | Porteur du jeton d'administration (`NEXORA_APP_ADMIN_TOKEN`, 32 caractères au moins, comparaison en temps constant, échec fermé si absent : 503) | 401 |
| `session` | `/api/account/api-keys` (+ `[id]`), `/api/account/privacy` (+ `report`, propriétaire seulement), `/api/account/vps/[id]/action`, `/api/billing/checkout/credits`, `/subscription`, `/portal`, `/api/vps/checkout` | Session Better Auth, membre de l'organisation de la session ; création de clés et paiement : propriétaire seulement ; origine contrôlée (CSRF) | 401 ou 403 |
| `api-key` | `/v1/chat/completions`, `/v1/embeddings` | Clé `nxk_` (empreinte SHA-256), solde suffisant | 401 |
| `signature` | `/api/stripe/webhook`, `/api/preview` | Signature Stripe vérifiée sur le corps brut ; lien d'aperçu signé et daté | 400/401 (503 si le secret n'est pas au Coffre) |
| `better-auth` | `/api/auth/*` | Origine contrôlée, limitation de débit (5/min par adresse), courriel vérifié | 403 si origine étrangère |
| `public` | `/v1/models` (catalogue public, 401 si clé invalide), `/api/contact` (+ défi ALTCHA), `/api/health`, `/api/media/[id]`, `/api/seo/indexnow-key/[key]`, `/api/preview/exit`, `/llms.txt`, `/og/*` | Tout le monde, volontairement | — |

### 3.2 Sondes sur site vivant

`bun web/scripts/check-guards.ts` (parcours « gardes-et-flux » de `bun run e2e`) : 43 sondes sans identification (aucune ne peut réussir) : toutes dans les statuts attendus, par exemple `GET /api/admin/vault` sans jeton 401 et avec un mauvais jeton 401, `POST /api/billing/portal` sans session ni origine 403, `POST /v1/chat/completions` avec une clé inconnue 401, `POST /api/stripe/webhook` sans signature 400. Les réponses d'erreur ne contiennent ni trace de pile ni chemin de fichier.

### 3.3 Jeton d'une autre organisation

Tests automatisés existants (S4 à S7), relus pendant cette recette :

| Cas | Test |
|---|---|
| Une autre organisation ne peut ni lister ni révoquer la clé | `web/src/server/gateway/keys.test.ts` ligne 129 |
| Une instance VPS d'une autre organisation n'existe pas (404) ; origine et session contrôlées | `web/src/server/vps/customer-handlers.test.ts` ligne 391 |
| Un abonnement d'une autre organisation n'est pas utilisé même avec le même identifiant Stripe ; journal d'une autre organisation exclu | `web/src/server/vps/account.test.ts` lignes 235, 253, 394 |
| `getFullOrganization` et `setActiveOrganization` vers l'organisation d'un autre compte refusés | `web/src/server/auth/auth.test.ts` lignes 305 à 340 |
| Requête d'une autre origine (CSRF) refusée sur la facturation | `web/src/server/billing/http.test.ts` ligne 188 |
| Un jeton d'administration erroné, absent ou trop court : 401 ou 503 sur chaque API d'administration | `gateway/admin-handlers.test.ts`, `agents/handlers.test.ts`, `vps/admin-handlers.test.ts`, `site-agents/handlers.test.ts`, `vault/vault.test.ts`, `revalidate.test.ts`, `stripe/admin-publish.test.ts` |

Ajouté en S9 : le test d'inventaire (aucune route sans garde déclarée), les sondes HTTP, et la portée des secrets (§4.3).

## 4. SSRF : adresses saisies en administration

### 4.1 Constats

1. `testProvider`, `discoverAgents`, la synchronisation LiteLLM et les appels d'agents envoyaient `Authorization: Bearer <clé du Coffre>` vers une adresse saisie par l'administrateur, **sans contrôle** : `http://169.254.169.254/` (métadonnées du nuage), `http://127.0.0.1:…`, réseau interne. Les URL étaient seulement validées comme `http(s)`.
2. Conséquence indirecte : « une clé n'est jamais relisible » n'était vrai que pour l'API du Coffre. Un administrateur pouvait désigner `stripe.secret_key` comme clé d'un fournisseur et cliquer « Tester » : la clé partait vers son serveur.
3. La garde de l'ingestion (S8) laissait passer **`::ffff:7f00:1`** (127.0.0.1 en IPv4 inscrite, forme hexadécimale) et `febf::1`, `198.18.0.1`, `192.0.0.8`, `240.0.0.1`. RED : 6 tests échouaient sur l'ancienne `isNonPublicAddress`.
4. L'assertion JWT du compte de service Google partait vers le `token_uri` écrit dans le fichier collé. RED : 2 tests échouaient.

### 4.2 Correctifs (RED puis GREEN)

| Correctif | Fichiers | Tests |
|---|---|---|
| Paquet `@nexora/net` : classification (public, loopback, private, link-local, reserved) avec `net.BlockList`, IPv4-dans-IPv6, adresses décimales/hexadécimales normalisées par `URL`, résolution DNS de **toutes** les adresses (une seule interne suffit à refuser) | `packages/net/src/index.ts` | `outbound.test.ts` : 36 tests |
| L'ingestion de la Veille utilise la même garde | `worker/src/agents/ingest.ts` | `ingest.test.ts` +7 (RED : 6 échecs avant) |
| Fournisseurs de modèles : `baseUrl` vérifiée à la création, à la modification **et à chaque « Tester »** (adresse revérifiée : le DNS a pu changer) ; `litellmBaseUrl` (adresse vue par LiteLLM) : adresses littérales seulement | `web/src/server/gateway/admin-handlers.ts` | `admin-handlers.test.ts` +5 |
| Instances WorkStudio : même contrôle à la création, la modification, « Tester » et « Découvrir » | `web/src/server/agents/handlers.ts` | `agents/handlers.test.ts` +3 |
| Serveurs Proxmox : `host` vérifié (lien local, métadonnées et réservées refusés ; réseau de l'opérateur admis) | `web/src/server/vps/admin-handlers.ts` | `vps/admin-handlers.test.ts` +2 |
| Jeton Google : l'assertion ne part que vers `https://oauth2.googleapis.com/token` | `worker/src/seo/adapters.ts` | `google-token.test.ts` : 3 (RED : 2 échecs) |

Politique : en **développement** (`NODE_ENV` ≠ `production`), boucle locale et réseau privé sont admis. En **production**, ils sont refusés sauf pour les hôtes, adresses ou plages que l'opérateur liste dans `NEXORA_OUTBOUND_ALLOW` (par exemple `ollama.interne.ca,10.20.0.0/24`). Les adresses de lien local (dont les métadonnées du nuage 169.254.169.254) et réservées sont refusées **sans exception**, même listées. Le message de refus ne contient ni l'adresse résolue ni les identifiants de l'URL.

### 4.3 Portée des secrets du Coffre

`packages/vault/src/scope.ts` et `readSecretForScope` : un secret ne peut être **envoyé vers une adresse saisie** que si son type et sa référence conviennent.

| Usage | Types admis | Toujours refusé |
|---|---|---|
| Fournisseur de modèles | `llm_provider` | références `stripe.*`, `site-agent.*`, `seo.*`, `directus.*` |
| Instance WorkStudio | `llm_provider`, `other` | idem, et `payment`, `proxmox` |
| Serveur Proxmox (site et worker) | `proxmox` | idem |

La vérification a lieu à l'enregistrement (422 `secret_scope`) **et** à l'usage (`getSecretForScope` dans les dépendances de production ; le worker lit le jeton Proxmox par `readSecretForScope`). Tests : `vault/scope.test.ts` (6), `vault/scope-store.test.ts` (4, base jetable).

## 5. Secrets : balayage

| Balayage | Outil | Résultat |
|---|---|---|
| Historique git complet (81 commits, toutes les branches) | gitleaks 8.30.1 (binaire linux-arm64, somme SHA-256 vérifiée contre `checksums.txt` de la version), `--log-opts=--all` | 4 alertes, **toutes des fausses alertes** : trois valeurs factices dans des tests (`sk-nexora-CLE-SECRETE-…`, `sk-live-123456789012345`, une clé SSH tronquée de test) et `sk_test_stripemocklocal0123456789`, valeur de stripe-mock écrite par `scripts/init-dev-env.sh` |
| Répertoire de construction `web/.next` (196 Mo) | gitleaks `dir` | 8 alertes de type `generic-api-key` dans `preview-props.json`, `prerender-manifest.json`, `server-reference-manifest.json`, `.rscinfo` : ce sont les **clés de chiffrement générées par Next.js au build** (propres à chaque construction, jamais de secret du projet). `.next` ne doit pas être publié (déjà ignoré par git) |
| Valeurs exactes | 15 secrets réels de la pile de développement (mots de passe, jetons, clés, y compris `NEXORA_VAULT_MASTER_KEY`, `NEXORA_APP_ADMIN_TOKEN`, clé LiteLLM de pc1, jetons Directus) cherchés tels quels dans `web/.next`, dans toute l'arborescence suivie et dans **tout l'historique git** (`git log -S`) | **0 occurrence**, hors les 2 valeurs factices de stripe-mock |
| Réponses publiques | `check-guards.ts` : aucune trace de pile ni chemin ; archive de sauvegarde ; journaux du site (`check-cms-down.ts` : aucun jeton) | Aucun secret |
| Archive de sauvegarde | `pg_restore` en texte de `app.dump` et `directus.dump`, recherche de la clé maîtresse et du jeton d'administration | 0 occurrence (`sauvegarde.md`). **À savoir** : `directus.dump` contient les jetons statiques des comptes de service Directus **en clair** (5 lignes de `directus_users.token`, non hachées) : l'archive se chiffre (`--chiffrer`) |

## 6. Dépendances

`bun audit` (27/10/2026) : **`bun audit --prod` : aucune vulnérabilité (197 paquets)**. `bun audit` complet : 12 avis, tous dans l'outillage de développement ou de construction.

| Paquet (via) | Avis | Gravité | Exploitable ici ? |
|---|---|---|---|
| `tinypool` 1.1.1 (vitest) | Pollution de prototype menant à l'exécution de code (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) | critique | **Non.** Outil de tests, jamais chargé en production ; l'attaquant doit contrôler les options de worker de Vitest, donc déjà exécuter du code sur la machine de développement |
| `vitest` 3.2.7, `@vitest/mocker` (GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8) | Lecture de fichier / injection par simulacre de module | moyenne | Non : Vitest ne tourne qu'en tests locaux, sur des fichiers du dépôt |
| `esbuild` ≤ 0.24.2 (drizzle-kit, extensions-sdk, vite) | Une page web peut interroger le serveur de développement | moyenne | Non : serveur de développement d'esbuild, jamais lancé ; `drizzle-kit generate` est un outil local |
| `vite` 7.3.7 / 8.1.2 et `launch-editor` (extensions-sdk, vitest) | Service de fichiers hors `server.fs.allow`, injection de commande d'éditeur, contournement sous Windows | basse à haute | Non : serveur de développement de Vite non lancé ; machine Linux ; `launch-editor` n'est jamais appelé |
| `zod` 4.1.12 (`@directus/types`, `chromium-bidi`) | Mémoire épuisée par la validation de collections démesurées (GHSA-mrhx-c7xc-m3w5, corrigé en 4.6.6) | haute | Non pour le code du projet (`zod` 4.6.7, version corrigée). Les copies 4.1.12 valident, côté outil, des messages locaux de Chrome (Lighthouse) et des types de build d'extension : pas d'entrée d'un attaquant |

Next.js 16.4.3, Better Auth 1.7.14 et Stripe 23.0.1 : aucun avis. LiteLLM reste en `v1.106.2` (épinglé par empreinte).

## 7. Rulings

| # | Constat | Pourquoi on le garde | Coût si le choix est faux |
|---|---|---|---|
| R1 | CSP avec `script-src 'unsafe-inline'` et `style-src 'unsafe-inline'` | Next.js injecte ses scripts d'amorçage en ligne ; les pages sont statiques ou à rendu partiel : aucun nonce par requête. Le reste est strict (aucune origine tierce, `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors`) | Une injection de script (XSS) ne serait pas bloquée par la CSP. Les seules sorties de HTML brut sont les JSON-LD (échappement de `<`, testé) ; le contenu riche passe par une liste blanche |
| R2 | HSTS sans `includeSubDomains` ni `preload` | Ces options engagent tout le domaine (y compris des sous-domaines qui ne sont pas à Nexora) et le préchargement est quasi irréversible | Premier accès en HTTP d'un visiteur non protégé jusqu'à la première réponse HTTPS ; l'opérateur peut les ajouter une fois le domaine stabilisé |
| R3 | Pas de re-résolution DNS **à chaque appel** de la passerelle vers une instance WorkStudio (vérifiée à l'enregistrement, au test et à la découverte). La vérification précède la connexion : un rebond DNS entre les deux n'est pas couvert | Le coût d'une résolution par appel sur le chemin chaud de facturation ; l'adresse est saisie par un administrateur de confiance et la clé qui part est de type `llm_provider` ou `other`, jamais une clé de la plateforme (références `stripe.*`, `site-agent.*`, `seo.*`, `directus.*` et `vps.*` réservées ; `vps.*` ajouté après la revue finale, qui a montré que la clé SSH du worker, de type `other`, pouvait partir) | Un administrateur malveillant (déjà porteur du jeton) pourrait rediriger un nom vers une adresse interne après le test. Atténuation : pare-feu sortant du serveur, `NEXORA_OUTBOUND_ALLOW` minimal |
| R4 | Serveurs Proxmox : réseau interne admis | Un Proxmox est par nature sur le réseau de l'opérateur ; sa fiche est protégée par TLS vérifié ou empreinte épinglée **avant** l'envoi du jeton, et le jeton est de type `proxmox` | Un administrateur pourrait viser un autre service interne en HTTPS ; le jeton Proxmox seul partirait (jamais une autre clé) |
| R5 | La limitation de débit du formulaire de contact et de Better Auth lit la première valeur de `X-Forwarded-For` | Le site est conçu derrière un proxy frontal | Si le proxy ajoute au lieu d'écraser l'en-tête, un client peut esquiver la limite par adresse ; ALTCHA (preuve de travail) reste exigé. **Le proxy doit écraser `X-Forwarded-For`** (guide opérateur) |
| R6 | Cookie d'aperçu en `SameSite=None` | Valeur imposée par Next.js pour le Draft Mode (aperçu dans Directus) ; le cookie n'est posé que par un lien signé et daté, et ne donne que la lecture de brouillons | Un site tiers pourrait déclencher l'affichage d'un brouillon dans le navigateur d'un administrateur déjà en aperçu : aucune écriture possible |
| R7 | `/api/media/[id]` est public et le jeton Lecteur voit aussi les fichiers de brouillons | Sans licence Directus (pas de règles de permission), le lecteur ne peut pas être restreint ; les identifiants sont des UUID aléatoires, non listables ; seules les images raster sont servies (SVG refusé, `nosniff`, `sandbox`) | Un fichier de brouillon dont l'identifiant fuit serait lisible. Corriger en demandant la clé Open Innovation Grant |
| R8 | `/v1/models` est public | C'est le catalogue public (comme OpenRouter) ; une clé invalide est tout de même refusée | Aucun ; la liste ne contient que des modèles publiés |
| R9 | Un seul jeton d'administration pour le Coffre, le catalogue, les VPS, la revalidation | Les modules Directus l'utilisent par un relais côté serveur de Directus ; il n'existe qu'une classe d'administrateur | Sa compromission donne toute l'administration (mais jamais la lecture d'un secret). **Ne pas publier `/api/admin/*` ni `/api/revalidate`** : ils ne doivent être joignables que depuis le réseau de Directus (règle du proxy frontal, guide opérateur) ; faire tourner le jeton |
| R10 | Le webhook Stripe répond 503 tant que ses secrets ne sont pas au Coffre (en production, les variables `STRIPE_*` sont ignorées) | Évite de traiter des événements non vérifiables | Paiements indisponibles jusqu'à la configuration ; voulu |
| R11 | Limiteur du formulaire de contact en mémoire (5 par 10 minutes par adresse, par processus) | Un seul processus web à ce stade | Avec plusieurs instances, la limite se multiplie ; passer à `api_rate_limits` (déjà en base) si l'on met le site à l'échelle |
| R12 | Avis de dépendances de développement (§6) laissés | Aucun n'est chargé en production | Une mise à jour future de Vitest/Vite les résout ; à reprendre à chaque `bun audit` |
| R13 | Pas de test automatisé « jeton d'une autre organisation » pour les routes `/v1` | La clé `nxk_` *est* l'organisation (aucun identifiant d'organisation dans les requêtes) ; le grand livre est réservé sous verrou par clé | Aucun cas d'usage croisé possible par construction ; couvert par `web/src/server/gateway/proxy.test.ts` (clé révoquée, plafond de clé) |

## 8. Reproduire

```bash
bun run check                                   # lint, types, tests (dont l'inventaire des routes et les gardes SSRF)
bash deploy/tests/manifest.test.sh              # manifeste de sauvegarde (20 contrôles)
bun run e2e                                      # parcours regroupés, dont « gardes-et-flux »
BASE_URL=http://localhost:3790 bun web/scripts/check-guards.ts
BASE_URL=http://localhost:3790 bun web/scripts/audit-flux.ts
bun audit --prod && bun audit                    # dépendances
gitleaks git . --log-opts=--all --redact         # historique
```
