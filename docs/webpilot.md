# Nexora WebPilot v1 — utilisation, limites, sécurité

API de **recherche, de lecture, d'exploration et d'extraction du Web**, vendue comme OpenRouter vend des modèles : une clé, un solde de crédits, de l'usage mesuré. Le contrat d'origine est `docs/superpowers/specs/2026-10-29-webpilot-contrat-api.md` ; ce document décrit ce qui est **livré** et les décisions prises pour le livrer.

**État honnête.** La fiche publique `/apps/webpilot` reste « Bientôt » (décision du fondateur). Sont livrés : `search`, `scrape` (rendu statique **et** rendu par navigateur `render: "browser"`), `crawl`, `extract` et les **sessions de navigateur** (`/v1/webpilot/sessions…`), le tout par le service de navigateur `services/webpilot-browser` (section 6). Ce service n'a été éprouvé qu'ici : en conteneur durci sur pc6 (arm64) avec un vrai Chromium, jamais en production ni sur amd64. Sans `WEBPILOT_BROWSER_URL` et `WEBPILOT_BROWSER_SECRET`, `render: "browser"` répond `422 render_unavailable` et les sessions `503 webpilot_unavailable`. Nexora Privacy Router est branché (voir §3). **Aucun prix n'est fixé** : sans feuille de prix publiée (dont `browser_minute` pour les sessions et `page_browser` pour le rendu), une organisation cliente reçoit `503 webpilot_unavailable` (« tarifs non publiés »).

## 1. Utilisation

Même clé `nxk_…`, même solde, mêmes quotas et même format d'erreur que la passerelle de modèles. Chaque clé doit avoir la **permission WebPilot** (à cocher dans l'écran « Modèles et clés », désactivée par défaut) ; sans elle : `403 operation_not_allowed`. Pas de CORS : la clé reste côté serveur.

```bash
curl https://exemple.ca/v1/webpilot/scrape \
  -H "Authorization: Bearer $NEXORA_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://exemple.org/","formats":["markdown","links"]}'
```

| Appel | Corps (champs) | Réponse |
|---|---|---|
| `POST /v1/webpilot/search` | `query`, `limit`, `country`, `language`, `include_content` | `results[]` (`rank`, `title`, `url`, `snippet`, `content` si demandé), `usage.pages` |
| `POST /v1/webpilot/scrape` | `url`, `formats` (`markdown`, `text`, `html`, `links`), `render` (`static`), `only_main_content`, `wait_ms`, `headers` | `url` finale, `status` de la cible, `content`, `metadata`, `usage.pages` |
| `POST /v1/webpilot/crawl` | `url`, `limit` (requis), `max_depth`, `include_paths`, `exclude_paths`, `same_origin_only`, `formats`, `only_main_content` | `202 { id: "crawl_…", status: "queued" }` |
| `GET /v1/webpilot/crawl/{id}` | `?limit=` (≤ 100), `?next=` | `status`, `pages_done`, `pages_skipped`, `pages_total_estimate`, `results[]`, `next`, `usage`, `error` (si échec) |
| `DELETE /v1/webpilot/crawl/{id}` | — | `200` si annulée tout de suite ; `202` si elle l'est au prochain contrôle du worker |
| `POST /v1/webpilot/extract` | `urls[]` **ou** `crawl_id`, `schema` (JSON Schema) et/ou `prompt`, `model` | `data[]` (`url`, `data`, `valid`, `error`), `usage.pages`, `usage.tokens` |
| `POST /v1/webpilot/sessions` | `max_minutes` (requis), `start_url`, `viewport`, `locale`, `timezone`, `idle_timeout_s`, `record` | `201 { id: "ses_…", status, expires_at, … }` (section 6) |
| `GET /v1/webpilot/sessions/{id}` | — | état, motif de fermeture, minutes facturées |
| `POST /v1/webpilot/sessions/{id}/actions` | `actions[]` (liste fermée) | résultat de chaque action, `url`, `completed` |
| `DELETE /v1/webpilot/sessions/{id}` | — | ferme la session, règle la minute entamée |

En-têtes de réponse : `x-request-id`, `x-ratelimit-*` (`Retry-After` sur 429), `x-nexora-webpilot-units` (unités facturées), `x-nexora-cost-micro` (micro-CAD ; pour `extract`, pages **et** jetons du modèle), `x-nexora-privacy-decision` (`allow` ou `mask`).

Erreurs (format OpenAI, messages en français) : celles du §8 du contrat, avec **les mêmes 402** que la passerelle (`insufficient_quota`, `account_blocked`, `api_key_spend_cap_reached` — un test compare les corps à `E.insufficient`, `E.blocked`, `E.keyCap`). Ajouts par rapport au contrat : `403 robots_disallowed` (page interdite par `robots.txt`, rien n'est facturé), `422 unsupported_content` (PDF, image…), `422 render_unavailable`, `409 session_closed` et `409 session_busy` (sessions), `429 rate_limit_exceeded` aussi pour trop d'explorations actives. Une cible qui répond 4xx donne `422 target_unreachable` ; 5xx donne `502 target_error` ; rien n'est facturé.

## 2. Facturation

Réserver le coût maximal → exécuter → régler au coût réel, règlement et événement d'usage dans **une** transaction (idempotent par `requestId`). Une erreur avant livraison libère tout et ne coûte rien.

- `scrape` : 1 page (`page_static`, ou `page_browser` avec `render: "browser"`).
- `sessions` : `browser_minute`, par tranches d'une minute entamée (section 6).
- `search` : 1 page de résultats ; `include_content` ajoute 1 page par résultat réellement lu (réservé : `1 + limit`).
- `crawl` : la création réserve `limit` pages (402 sinon). À **chaque lot** de pages, dans une transaction : pages et résultats enregistrés, tranche réglée au coût réel, événement d'usage du lot écrit, **tranche suivante réservée** pour les pages restantes. Un lot jamais validé n'est jamais facturé (ses pages sont relues). Annulation ou fin : le reste est libéré. Solde épuisé en cours de route : la tâche passe à `failed` (`error` = l'objet `insufficient_quota`) et garde ce qui a été lu et facturé. Page refusée (robots, politique, erreur) : écartée, non facturée. Le prix est **figé à la création**.
- `extract` : pages analysées au prix `page_static` (voir O-3) + jetons du modèle. Les jetons passent par la **passerelle interne** (`chat/completions` avec la clé de l'appelant) : même solde, même grand livre, ligne d'usage `chat.completions` à part ; l'en-tête `x-nexora-cost-micro` additionne les deux.
- Organisation « maison » : aucune réservation ni débit ; la valeur au prix public est comptée quand une feuille existe.

Événements `usage_events` : `endpoint` `webpilot.search|scrape|crawl|extract|session`, `model_public_id` `webpilot/<opération>`, unités (`units_page_static`, `units_page_browser`, `units_browser_minute`), **hôte** visité (jamais l'adresse complète), décision et version de politique. Aucun contenu, aucune requête de recherche.

### Feuille de prix

Les prix sont des **paramètres**, jamais du code : feuille versionnée et immuable (déclencheurs SQL, comme `model_prices`), unités `page_static`, `page_browser`, `browser_minute`, prix de vente en micro-CAD, coût amont en micro-USD, date d'entrée en vigueur, brouillon → publié. **Garde de marge** à la publication : aucune unité sous son coût amont converti au taux approuvé, majoré du plancher de la feuille.

```bash
bun run --cwd web webpilot:prix                                   # feuille en vigueur et historique
bun run --cwd web webpilot:prix --page-static 5000 --amont-page-static 300 --plancher 2000
bun run --cwd web webpilot:prix --page-static 7000 --brouillon     # brouillon
bun run --cwd web webpilot:prix --publier <id> --depuis 2026-11-01T00:00:00Z
```

API d'administration (même jeton que le catalogue) : `GET /api/admin/webpilot/prices`, `PUT /api/admin/webpilot/prices` (`{ prices: { page_static: { sellCadMicro, upstreamUsdMicro } }, status, effectiveAt?, marginFloorBps?, note? }` ou `{ publishDraft: "<id>" }`). L'interface Directus viendra ensuite.

## 3. Sécurité

- **Client HTTP de sortie unique** (`packages/webpilot/src/http.ts`) ; un test statique échoue si un autre module de WebPilot utilise `fetch`, `node:http(s)`, `net`, `tls`, `undici` ou `WebSocket`. Le nom est résolu **une fois par saut**, chaque adresse est classée, puis la connexion se fait **à l'adresse validée** (pas de rebond DNS). Refus : schémas autres que `http(s)`, identifiants dans l'adresse, ports hors liste, adresses privées, boucle locale, lien local, réservées, métadonnées du nuage, noms sans domaine ou en `.local`/`.internal`/`.lan`… ; mêmes contrôles à **chaque redirection** ; plafonds de taille (flux annulé) et de durée ; ni cookies, ni autorisation, ni compression.
- **robots.txt** respecté pour toute lecture automatisée (RFC 9309 : absent ou 4xx = permis ; 5xx ou injoignable = refusé). Identification : `User-Agent: NexoraWebPilot/1.0 (+<WEBPILOT_CONTACT>)`.
- **Contenu hostile** : une page est une donnée. Elle n'est jamais exécutée ; le HTML renvoyé est nettoyé (ni script, ni cadre, ni gestionnaire d'événement, ni `javascript:`). Pour `extract`, le texte de la page est **seul dans un message utilisateur balisé** `<donnees_page>` (balise de fermeture neutralisée) ; la consigne système ne contient jamais de texte de page.
- **Privacy Router** : chaque sortie (requête de recherche, hôte visité, redirection vers un autre hôte, contenu envoyé au modèle) est évaluée **avant** la réservation et avant chaque sortie d'une tâche longue. `deny` → `403 privacy_policy_denied` (règle et motif, jamais le contenu) ; toute panne → `503 privacy_router_unavailable`. `mask` : le contenu masqué est celui qui sort. Interface : `packages/privacy/src/types.ts`. **Branché le 29/10/2026** (sessions : `session.goto` et `session.type`, voir §6) : le site utilise `getPrivacyRouter()`, le worker `workerPrivacyRouter` (`worker/src/webpilot/privacy.ts`) ; `failClosedPrivacy` et `failClosedGate` ne servent plus qu'aux essais de l'échec fermé. Essayé en vrai sur la démo : `scrape`, `crawl` (3 pages d'un site public) et `extract` (schéma JSON, modèle d'essai) ; `search` répond `503 webpilot_unavailable` tant que `WEBPILOT_SEARCH_URL` (SearXNG) n'est pas réglé.
- **Journaux** (`@nexora/log`) : chaîne de requête et ancre des adresses masquées, texte saisi et requête de recherche jamais journalisés.
- **Réseau** : SearXNG (`deploy/compose.yml`, service `searxng`) n'est pas sur le réseau de l'application ; il n'a que `nexora-webpilot-search` (interne, sans route vers l'extérieur ; le site et le worker le rejoignent) et `webpilot-egress`. Voir `deploy/compose.yml` et `deploy/.env.example`.
- Routes rendues **à la demande** (`await connection()`), enregistrées dans le registre des gardes (`api-key`, `admin-token`).

### Ce qui n'est pas fait

Webhooks (O-5) ; interface Directus de la feuille de prix ; politique par organisation de Privacy Router (autre branche) ; passage de la fiche publique à « Disponible » ; OpenAPI généré ; conteneur **par session** (décision O-7 : un processus Chromium par session dans un conteneur durci, voir §6) ; bac à sable de Chromium activé (voir §6, limites) ; essai du service sur amd64 et en production. L'image SearXNG est épinglée par empreinte (`2026.10.13-22c64b8d3`, index amd64/arm64) mais **n'a pas été démarrée** ici (disque de pc6 plein) : le durcissement (`cap_drop`, `no-new-privileges`) est posé sans `read_only`, à éprouver au premier démarrage.

## 4. Décisions provisoires, modifiables par le fondateur

| # | Décision | Où la changer |
|---|---|---|
| O-1 | Politique par défaut de Privacy Router : hors de cette branche. | Branche Privacy Router |
| O-2 | `robots.txt` respecté pour `search` (contenu), `scrape`, `crawl`, `extract`. Avis d'un avocat requis avant l'ouverture. | `packages/webpilot/src/robots.ts`, `reader.ts` |
| O-3 | Prix distinct pour le rendu navigateur (`page_browser`) et la minute (`browser_minute`) ; l'extraction facture ses pages au prix `page_static` + les jetons du modèle. Une unité `page_extract` pourra s'ajouter à la feuille. | Feuille de prix |
| O-4 | Minute de navigateur entamée (arrondie vers le haut), minimum une minute, minute réservée avant d'être réglée. | `packages/webpilot/src/sessions.ts` |
| O-5 | Pas de webhooks : `webhook_url` est refusé (`400`, `param: webhook_url`) ; l'appelant interroge `GET /crawl/{id}`. | `schemas.ts` |
| O-6 | On garde l'**hôte** visité dans l'événement d'usage, jamais l'adresse complète. | `billing.ts` (`destinationHost`) |
| O-7 | Hébergement du navigateur : **sur l'infrastructure de Nexora AI**, service interne isolé (`services/webpilot-browser`), un processus Chromium par session. Aucun fournisseur de navigateurs tiers. | `deploy/compose.yml`, §6 |
| O-8 | Permission de clé `webpilot` **à cocher**, désactivée par défaut (opérations `search`, `scrape`, `crawl`, `extract`, `sessions`). | `api_keys.webpilot_operations` |

Autres choix : cible en 4xx → `422` non facturé ; page non HTML/texte → `422 unsupported_content` ; `search` facture 1 page même sans résultat (le service a travaillé) ; une recherche a pour destination déclarée `web-search` auprès de Privacy Router ; une exploration suit les liens du **même hôte** (`same_origin_only`), par largeur, 500 ms entre deux lectures, lots de 5 pages, tranches de 2 minutes (le worker relance la suivante) ; `webpilot_unavailable` aussi quand `WEBPILOT_SEARCH_URL` est absent.

### Valeurs de départ (variables d'environnement, jamais des prix)

Débit 60 requêtes/minute par clé (`rpm_limit` de la clé prime) ; corps 100 Ko ; réponse de la cible 5 Mo ; durée 20 s ; 5 redirections ; ports 80, 443, 8080, 8443 ; en-têtes transmis `accept-language`, `accept`, `referer` ; 20 résultats de recherche ; 100 pages et profondeur 5 par exploration, 3 explorations actives par organisation ; 5 adresses et 40 000 caractères par page pour `extract` ; conservation des résultats 24 h. Liste complète : `deploy/.env.example`.

## 5. Architecture

- `packages/db` : migration **0023** (additive : feuille de prix, tâches, `api_keys.webpilot_operations`, colonnes de `usage_events`) et **0025** (additive : table `webpilot_sessions`).
- `packages/webpilot` (`@nexora/webpilot`) : moteur partagé site/worker — client HTTP sûr, `robots.txt`, contenu lisible, recherche, lecture, exploration, facturation.
- `web/src/server/webpilot` : cycle de requête, routes, extraction, administration des prix, activité ; `web/src/app/v1/webpilot/*`, `web/src/app/api/admin/webpilot/prices`.
- `worker/src/webpilot` : `webpilot.crawl` (une tranche par tâche, relancée tant qu'il reste des pages), `webpilot.purge` (horaire, efface les explorations échues) et `webpilot.sessions.sweep` (chaque minute : règle les minutes échues, ferme les sessions échues ou inactives, détruit les navigateurs restés en vie).
- `services/webpilot-browser` : le service de navigateur (Node 24 + Playwright), image à part, réseau à part.
- Espace client : case de permission à la création d'une clé, colonne WebPilot dans la liste, section « WebPilot » de la page Activité (affichée seulement si l'organisation l'utilise).

## 6. Sessions de navigateur et rendu par navigateur

### Utilisation

```bash
# 1. Ouvrir (max_minutes est requis : il fixe la durée maximale ; la première minute est réservée tout de suite)
curl https://exemple.ca/v1/webpilot/sessions -H "Authorization: Bearer $NEXORA_KEY" -H "Content-Type: application/json" \
  -d '{"max_minutes":5,"start_url":"https://exemple.org/"}'
# 2. Agir (au plus 20 actions par requête ; la première qui échoue arrête la liste)
curl https://exemple.ca/v1/webpilot/sessions/ses_…/actions -H "Authorization: Bearer $NEXORA_KEY" -H "Content-Type: application/json" \
  -d '{"actions":[{"type":"click","text":"Connexion"},{"type":"read","formats":["markdown"]},{"type":"screenshot"}]}'
# 3. Fermer
curl -X DELETE https://exemple.ca/v1/webpilot/sessions/ses_… -H "Authorization: Bearer $NEXORA_KEY"
```

Ouverture : `max_minutes` (1 à 30, requis), `start_url`, `viewport` (320x240 à 1920x1200), `locale`, `timezone`, `idle_timeout_s` (défaut 120, au plus 600), `record` (`none` par défaut ; `screenshot` ajoute une capture de la dernière étape à chaque réponse, jamais conservée). Réponse `201 { id, status, max_minutes, idle_timeout_s, expires_at }` (plus `url`, `title`, `results` si `start_url`).

**Actions (liste fermée, aucun JavaScript fourni par l'appelant)** : `goto { url, wait_until? }`, `click { selector | text | x, y }`, `type { selector, text, clear? }`, `press { key }` (touches de navigation seulement : `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, flèches, `Home`, `End`, `PageUp`, `PageDown` ; jamais un caractère imprimable, le texte passe par `type`), `select { selector, value }`, `scroll { direction, amount? }`, `wait { for: "selector" | "idle" | "ms" }`, `read { formats?, only_main_content? }` (HTML rendu, nettoyé, converti comme `scrape`), `screenshot`, `extract { schema | prompt, model? }` (le texte de la page sort vers le modèle, évalué par Privacy Router ; jetons facturés par la passerelle, même solde). Réponse : `{ id, status, url, title, results[], completed, screenshot?, expires_at }` ; chaque résultat porte `type`, `ok` et, en cas d'échec, `error { code, message }` (`element_unavailable`, `timeout`, `navigation_blocked`, `url_not_allowed`, `sensitive_field_refused`, `host_changed`…).

**État et fermeture** : `GET` donne `status`, `close_reason`, `current_host` (jamais l'adresse complète), `usage { browser_minutes, cost_micro }`. Motifs : `closed_by_client`, `max_minutes`, `idle`, `insufficient_quota`, `privacy_policy`, `browser_error`. Une action sur une session fermée : `409 session_closed` (le motif est dans le message) ; un second lot pendant un lot : `409 session_busy`.

### Facturation (`browser_minute`)

Minute **entamée**. À l'ouverture, la première minute est **réservée** (402 si le solde ne suffit pas, avant tout navigateur). À l'échéance de chaque minute, elle est **réglée** et la suivante est **réservée** dans la même transaction ; si la réservation est refusée (solde, plafond de dépense de la clé), la session se ferme en `insufficient_quota` et son navigateur est détruit. À la fermeture, la minute en cours est réglée en entier (fermer à 10 s coûte une minute, à 90 s deux). Une ligne d'usage `webpilot.session` par minute réglée (unités, hôte courant, décision de politique ; jamais d'adresse complète ni de texte). Une ouverture qui échoue (le navigateur ne démarre pas) libère la réservation et ne coûte rien. Une session vue en retard (worker arrêté) n'est facturée que jusqu'à sa fin réelle (échéance ou inactivité), jamais au-delà. Les actions ne sont pas facturées ; `extract` ajoute les jetons du modèle (`x-nexora-cost-micro` de la réponse). Le prix est figé à l'ouverture. Organisation « maison » : aucune réservation ni débit, valeur comptée.

### Privacy Router

Avant **toute** exécution d'un lot : chaque `goto` (opération `session.goto`, hôte et chemin) et chaque `type` ou `select` (opération `session.type`, texte et hôte de la page, qui est celui d'un `goto` précédent du même lot ou l'hôte courant) est évalué. Un refus arrête tout le lot (`403 privacy_policy_denied`, règle et motif, jamais le contenu), une panne donne `503 privacy_router_unavailable`, un masquage remplace le texte saisi par le texte masqué (en-tête `x-nexora-privacy-decision: mask`). La politique est relue à chaque requête : si elle interdit désormais l'hôte de la page, un lot qui ne commence pas par un `goto` ferme la session en `privacy_policy` (403). Le service refuse en plus de saisir si la page n'est plus celle que la politique a évaluée (`host_changed`). Le même contrôle s'applique à `start_url`, **avant** la réservation.

### Sécurité du service (`services/webpilot-browser`)

- **Le navigateur n'atteint jamais le réseau interne.** Trois barrages indépendants : (1) il n'a **qu'un chemin**, un mandataire local au conteneur qui résout chaque nom UNE fois, classe TOUTES les adresses (privée, boucle locale, lien local, réservée, métadonnées du nuage, NAT64, 6to4…) puis se connecte à l'adresse validée (pas de rebond DNS) ; le navigateur ne résout rien lui-même (`--host-resolver-rules=MAP * ~NOTFOUND`) et WebRTC ne sort pas en UDP direct ; (2) chaque requête est interceptée (schémas http/https, ports de la liste fermée, pas d'identifiants dans l'adresse, adresses littérales non publiques, noms internes) ; (3) une navigation de premier niveau, **redirections comprises**, n'est permise que vers un hôte **approuvé par le site** (donc évalué par Privacy Router) ; ailleurs elle échoue en `navigation_blocked` et la session revient à une page vide. Le conteneur est de plus sur un réseau Docker sans route vers l'application, la base, Directus ni LiteLLM.
- **Isolation** : un processus Chromium par session, profil temporaire et contexte neufs, un onglet (les fenêtres secondaires sont fermées), ni cookies partagés ni stockage durable, téléchargements annulés, service workers, extensions et permissions coupés, boîtes de dialogue refusées, fenêtre/langue/fuseau fixés, détruit à la fermeture, à l'échéance (`max_minutes`) et à l'inactivité (minuteries du service **et** du site).
- **Ce que WebPilot ne fait pas** : aucun contournement de CAPTCHA, aucune saisie d'identifiants ou de moyen de paiement à la place d'une personne (le service refuse `type` et `select` dans un champ mot de passe, un champ `autocomplete` de carte ou de code à usage unique, ou dont le nom évoque un numéro de carte, un CVV ou un IBAN : `sensitive_field_refused`), aucun achat.
- **Authentification de service à service** : secret partagé (`WEBPILOT_BROWSER_SECRET`, 32 caractères au moins, comparé en temps constant), envoyé seulement à l'hôte nommé par l'opérateur ; le service refuse de démarrer sans lui ; aucune route sans lui sauf `/healthz`. Le secret n'est ni journalisé ni renvoyé.
- **Durcissement du conteneur** (éprouvé sur pc6 avec `docker run`) : image Playwright `v1.64.1-noble` épinglée par empreinte, utilisateur non root (1001), `cap_drop: ALL`, `no-new-privileges`, système de fichiers en lecture seule (seul `/tmp` est inscriptible, 768 Mo), mémoire 2 Go, 2 processeurs, 1024 fils, `init: true` (sans lui, les processus de Chromium restent « zombies »). Aucun secret dans l'image.
- **Journal** : une ligne par événement de cycle de vie et par sortie refusée (hôte seulement, jamais l'adresse résolue ni le chemin).

### Essais

`services/webpilot-browser` : 121 essais dont 8 avec un **vrai Chromium** (page locale servie par un petit serveur : navigation, saisie, clic, lecture, capture, fermeture sans processus restant, refus de la boucle locale, du privé, des métadonnées et d'un nom qui résout vers une adresse interne, navigation et redirection vers un hôte non approuvé, champs sensibles, téléchargements, cookies isolés d'une session à l'autre, rendu après JavaScript). Ces 8 essais sont ignorés sans Chromium. Le conteneur durci a aussi été exercé à la main (rendu de `example.com`, session réelle, noms résolvant vers `127.0.0.1`, refus de la passerelle Docker et des métadonnées, absence de zombies avec `--init`, `/tmp` vide après fermeture). Lancer : `npm ci` dans `services/webpilot-browser` puis `npx vitest run` (Chromium de Playwright requis pour les essais réels).

### Limites honnêtes

- **Bac à sable de Chromium désactivé** dans le conteneur : avec `cap_drop: ALL` et le profil seccomp par défaut de Docker, Chromium ne démarre pas avec son bac à sable (essayé : `BROWSER_CHROMIUM_SANDBOX=1` donne `502 render_failed`). Il tourne donc sans (réglage par défaut de Playwright), protégé par l'utilisateur non root, l'absence de capacités, le système de fichiers en lecture seule et l'isolation réseau. Activer le bac à sable demande le profil seccomp de Playwright : **non éprouvé**. Un conteneur par session (au lieu d'un processus par session) isolerait mieux les sessions entre elles : non fait.
- **Seules les navigations de premier niveau et les saisies passent par Privacy Router**, pas chaque sous-ressource ni chaque appel `fetch` du JavaScript de la page : une page peut, comme dans tout navigateur, contacter ses services tiers publics (jamais le réseau interne). Le texte saisi est évalué pour l'hôte de la page ; une soumission de formulaire vers un autre hôte est une navigation, donc refusée tant que l'hôte n'est pas approuvé, mais un script de la page qui enverrait la saisie ailleurs ne serait pas vu.
- Une navigation de premier niveau refusée remplace la page par une page vide : il faut refaire un `goto`.
- La détection des champs sensibles est **heuristique** (attributs du champ) : un champ ordinaire utilisé pour un numéro de carte n'est pas reconnu (les numéros de carte, NAS et IBAN saisis sont en revanche masqués par Privacy Router).
- `robots.txt` n'est pas appliqué aux sessions (navigation interactive pour le compte d'une personne), seulement au rendu `render: "browser"` d'une page (comme `scrape`). Position à valider par un avocat avant l'ouverture (O-2).
- Facturation à la minute : le worker balaye chaque minute ; une minute peut donc être réglée jusqu'à une minute après son échéance, sans effet sur le montant. Le service détruit lui-même un navigateur échu (échéance, inactivité) même si le worker est arrêté.
- Capacité : 2 sessions ouvertes par organisation, 4 sur le service, 2 rendus simultanés ; au-delà, `429`. Pas de file d'attente.
- Une seule instance du service : plusieurs instances demandent de router chaque session vers la sienne (non fait).

### Défense en profondeur recommandée à l'hôte

Le mandataire du service est le contrôle décisif, mais le réseau Docker `webpilot-browser-egress` ne devrait pas non plus pouvoir joindre les réseaux privés. Exemple (à adapter au sous-réseau réel, après avoir lu `docker network inspect`) : une règle `DOCKER-USER` qui rejette (`REJECT`) les paquets venant de ce sous-réseau et allant vers `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` et `100.64.0.0/10`, sauf la réponse aux connexions établies. **Non appliquée ni éprouvée ici.**

### Décisions provisoires, modifiables par le fondateur

| # | Décision | Où la changer |
|---|---|---|
| S-1 | Plafonds de départ : `max_minutes` ≤ 30, inactivité 120 s (≤ 600), 2 sessions ouvertes par organisation, 20 actions et 5000 caractères de saisie par requête. | `WEBPILOT_SESSION_*` |
| S-2 | `press` est limité aux touches de navigation ; le texte passe par `type`, seul évalué par Privacy Router. | `packages/webpilot` / `schemas.ts`, `actions.ts` du service |
| S-3 | Navigation de premier niveau limitée aux hôtes approuvés (un clic vers un autre site échoue ; il faut un `goto` évalué). Plus strict que nécessaire, mais « échec fermé ». | `services/webpilot-browser/src/browser.ts` |
| S-4 | Une politique qui interdit l'hôte courant ferme la session (`privacy_policy`) au lieu de la laisser continuer. | `web/src/server/webpilot/sessions.ts` |
| S-5 | `extract` dans une session facture les jetons du modèle seulement (pas de page en plus), la minute couvre la lecture. | `sessions.ts` |
| S-6 | Sessions hors `robots.txt` (voir limites). | — |
| S-7 | Profil `webpilot-browser` de Compose : le navigateur ne démarre pas avec la pile ordinaire. | `deploy/compose.yml` |
