# Nexora WebPilot v1 — utilisation, limites, sécurité

API de **recherche, de lecture, d'exploration et d'extraction du Web**, vendue comme OpenRouter vend des modèles : une clé, un solde de crédits, de l'usage mesuré. Le contrat d'origine est `docs/superpowers/specs/2026-10-29-webpilot-contrat-api.md` ; ce document décrit ce qui est **livré** et les décisions prises pour le livrer.

**État honnête.** La fiche publique `/apps/webpilot` reste « Bientôt ». Sont livrés : `search`, `scrape` (rendu statique), `crawl`, `extract`. **Ne sont pas livrés** : les sessions de navigateur (les routes répondent `501 not_implemented`, message « bientôt ») et le rendu par navigateur d'une page (`render: "browser"` répond `422 render_unavailable` tant que `WEBPILOT_RENDERER_URL` n'est pas réglé). Nexora Privacy Router n'est **pas encore branché** : tant qu'il ne l'est pas, toute sortie est refusée (échec fermé, `503 privacy_router_unavailable`). **Aucun prix n'est fixé** : sans feuille de prix publiée, une organisation cliente reçoit `503 webpilot_unavailable` (« tarifs non publiés »).

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
| `…/sessions…` | — | `501 not_implemented` |

En-têtes de réponse : `x-request-id`, `x-ratelimit-*` (`Retry-After` sur 429), `x-nexora-webpilot-units` (unités facturées), `x-nexora-cost-micro` (micro-CAD ; pour `extract`, pages **et** jetons du modèle), `x-nexora-privacy-decision` (`allow` ou `mask`).

Erreurs (format OpenAI, messages en français) : celles du §8 du contrat, avec **les mêmes 402** que la passerelle (`insufficient_quota`, `account_blocked`, `api_key_spend_cap_reached` — un test compare les corps à `E.insufficient`, `E.blocked`, `E.keyCap`). Ajouts par rapport au contrat : `403 robots_disallowed` (page interdite par `robots.txt`, rien n'est facturé), `422 unsupported_content` (PDF, image…), `422 render_unavailable`, `501 not_implemented`, `429 rate_limit_exceeded` aussi pour trop d'explorations actives. Une cible qui répond 4xx donne `422 target_unreachable` ; 5xx donne `502 target_error` ; rien n'est facturé.

## 2. Facturation

Réserver le coût maximal → exécuter → régler au coût réel, règlement et événement d'usage dans **une** transaction (idempotent par `requestId`). Une erreur avant livraison libère tout et ne coûte rien.

- `scrape` : 1 page (`page_static`, ou `page_browser` si le rendu navigateur existe).
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
- **Privacy Router** : chaque sortie (requête de recherche, hôte visité, redirection vers un autre hôte, contenu envoyé au modèle) est évaluée **avant** la réservation et avant chaque sortie d'une tâche longue. `deny` → `403 privacy_policy_denied` (règle et motif, jamais le contenu) ; toute panne → `503 privacy_router_unavailable`. `mask` : le contenu masqué est celui qui sort. Interface : `web/src/server/privacy/types.ts`. Branchement : remplacer `failClosedPrivacy` (`web/src/server/webpilot/deps.ts`) et `failClosedGate` (`worker/src/webpilot/handlers.ts`).
- **Journaux** (`@nexora/log`) : chaîne de requête et ancre des adresses masquées, texte saisi et requête de recherche jamais journalisés.
- **Réseau** : SearXNG (`deploy/compose.yml`, service `searxng`) n'est pas sur le réseau de l'application ; il n'a que `nexora-webpilot-search` (interne, sans route vers l'extérieur ; le site et le worker le rejoignent) et `webpilot-egress`. Voir `deploy/compose.yml` et `deploy/.env.example`.
- Routes rendues **à la demande** (`await connection()`), enregistrées dans le registre des gardes (`api-key`, `admin-token`).

### Ce qui n'est pas fait

Sessions de navigateur (contrat conservé, `501`) ; rendu par navigateur (client prêt pour un service `POST /render`, protocole **provisoire**, décision O-7 ; le service n'existe pas) ; webhooks (O-5) ; interface Directus de la feuille de prix ; politique par organisation de Privacy Router (autre branche) ; passage de la fiche publique à « Disponible » ; OpenAPI généré. L'image SearXNG est épinglée par empreinte (`2026.10.13-22c64b8d3`, index amd64/arm64) mais **n'a pas été démarrée** ici (disque de pc6 plein) : le durcissement (`cap_drop`, `no-new-privileges`) est posé sans `read_only`, à éprouver au premier démarrage.

## 4. Décisions provisoires, modifiables par le fondateur

| # | Décision | Où la changer |
|---|---|---|
| O-1 | Politique par défaut de Privacy Router : hors de cette branche. | Branche Privacy Router |
| O-2 | `robots.txt` respecté pour `search` (contenu), `scrape`, `crawl`, `extract`. Avis d'un avocat requis avant l'ouverture. | `packages/webpilot/src/robots.ts`, `reader.ts` |
| O-3 | Prix distinct pour le rendu navigateur (`page_browser`) et la minute (`browser_minute`) ; l'extraction facture ses pages au prix `page_static` + les jetons du modèle. Une unité `page_extract` pourra s'ajouter à la feuille. | Feuille de prix |
| O-4 | Minute de navigateur entamée (arrondie vers le haut). | Sessions, à venir |
| O-5 | Pas de webhooks : `webhook_url` est refusé (`400`, `param: webhook_url`) ; l'appelant interroge `GET /crawl/{id}`. | `schemas.ts` |
| O-6 | On garde l'**hôte** visité dans l'événement d'usage, jamais l'adresse complète. | `billing.ts` (`destinationHost`) |
| O-7 | Hébergement du navigateur : non tranché ; le client de rendu suppose un service interne isolé. | `renderer.ts` |
| O-8 | Permission de clé `webpilot` **à cocher**, désactivée par défaut (opérations `search`, `scrape`, `crawl`, `extract`). | `api_keys.webpilot_operations` |

Autres choix : cible en 4xx → `422` non facturé ; page non HTML/texte → `422 unsupported_content` ; `search` facture 1 page même sans résultat (le service a travaillé) ; une recherche a pour destination déclarée `web-search` auprès de Privacy Router ; une exploration suit les liens du **même hôte** (`same_origin_only`), par largeur, 500 ms entre deux lectures, lots de 5 pages, tranches de 2 minutes (le worker relance la suivante) ; `webpilot_unavailable` aussi quand `WEBPILOT_SEARCH_URL` est absent.

### Valeurs de départ (variables d'environnement, jamais des prix)

Débit 60 requêtes/minute par clé (`rpm_limit` de la clé prime) ; corps 100 Ko ; réponse de la cible 5 Mo ; durée 20 s ; 5 redirections ; ports 80, 443, 8080, 8443 ; en-têtes transmis `accept-language`, `accept`, `referer` ; 20 résultats de recherche ; 100 pages et profondeur 5 par exploration, 3 explorations actives par organisation ; 5 adresses et 40 000 caractères par page pour `extract` ; conservation des résultats 24 h. Liste complète : `deploy/.env.example`.

## 5. Architecture

- `packages/db` : migration **0023** (additive : feuille de prix, tâches, `api_keys.webpilot_operations`, colonnes de `usage_events`).
- `packages/webpilot` (`@nexora/webpilot`) : moteur partagé site/worker — client HTTP sûr, `robots.txt`, contenu lisible, recherche, lecture, exploration, facturation.
- `web/src/server/webpilot` : cycle de requête, routes, extraction, administration des prix, activité ; `web/src/app/v1/webpilot/*`, `web/src/app/api/admin/webpilot/prices`.
- `worker/src/webpilot` : `webpilot.crawl` (une tranche par tâche, relancée tant qu'il reste des pages) et `webpilot.purge` (horaire, efface les explorations échues).
- Espace client : case de permission à la création d'une clé, colonne WebPilot dans la liste, section « WebPilot » de la page Activité (affichée seulement si l'organisation l'utilise).
