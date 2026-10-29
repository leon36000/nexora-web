# Nexora WebPilot — contrat d'API (squelette, 29/10/2026)

**Statut : v1 livrée en partie (voir `docs/webpilot.md`) ; ce document reste le contrat.** Reste à faire : sessions de navigateur, rendu par navigateur, branchement de Privacy Router. Il fixe ce que l'API doit faire : endpoints, format des erreurs, compteurs de facturation et point d'accroche de Nexora Privacy Router. Il ne publie aucun prix, aucun délai et aucune performance. La fiche publique `/apps/webpilot` (état « Bientôt ») renvoie vers la liste d'attente (`/contact?sujet=apps-webpilot`) tant que rien n'est livré.

Demande du fondateur (résumé fidèle) : WebPilot est une API de **recherche, d'extraction et d'exploration du Web** (comme on en trouve chez les services d'exploration de sites) **plus la navigation et l'action sur des pages** (comme on en trouve chez les agents de navigation), **vendue comme OpenRouter vend des modèles** : un solde de crédits, une clé, de l'usage mesuré. **Nexora Privacy Router** est la couche de protection commune, **incluse par défaut et jamais payante** : elle contrôle ce qui sort, selon une politique par client, jusqu'à la souveraineté stricte.

Références du site : passerelle `/v1/*` (`docs/infra.md`, « Couche publique `/v1/*` » et « Agents hébergés »), erreurs `web/src/server/gateway/errors.ts`, grand livre `web/src/server/gateway/usage.ts` et `packages/db/src/schema-gateway.ts`. WebPilot **réutilise** clés `nxk_…`, quotas, grand livre et format d'erreur ; il n'invente aucun second système.

## 1. Principes

1. **Un seul compte, une seule clé, un seul solde.** Même en-tête `Authorization: Bearer nxk_…`, mêmes quotas par clé, même plafond de dépense par clé, même solde de crédits que les modèles et les agents.
2. **Réserver, exécuter, régler au coût réel.** Comme la passerelle : le coût maximal est réservé avant tout appel sortant (402 si le solde ne suffit pas), puis réglé au coût réel ; le reste est libéré.
3. **Privacy Router d'abord.** Aucune requête ne sort vers le Web sans que la politique de l'organisation ait été évaluée (section 6). La couche est toujours active et n'apparaît sur aucune ligne de facturation.
4. **Aucun contenu stocké.** Comme la passerelle : seules des métadonnées d'usage sont conservées (opération, unités, coût, durée, décision de politique). Ni les pages récupérées, ni les requêtes, ni le texte saisi dans une session ne sont journalisés ni stockés par Nexora AI, sauf ce que l'appelant demande explicitement de garder le temps d'une tâche (section 4.4).
5. **Format OpenAI pour les erreurs, JSON simple pour le reste.** Pas de SDK obligatoire : cURL doit suffire.
6. **État honnête.** Tant que le code n'existe pas, `/v1/webpilot/*` répond 404 `unknown_url` (comportement actuel de `handleUnknownEndpoint`) et la fiche dit « Bientôt ».

## 2. Authentification, en-têtes, versions

| Élément | Règle |
|---|---|
| Authentification | `Authorization: Bearer nxk_…` (401 `invalid_api_key` / `api_key_revoked` / `api_key_expired`, comme aujourd'hui). |
| Portée de la clé | Nouvelle permission de clé `webpilot` (liste d'opérations permises : `search`, `scrape`, `crawl`, `extract`, `sessions`). Une clé existante **n'a pas** WebPilot tant qu'une personne ne l'a pas cochée (refus : 403 `operation_not_allowed`). |
| Corps | `application/json`, UTF-8, taille limitée (413 `request_too_large`). |
| En-têtes de réponse | `x-request-id`, `x-nexora-webpilot-units` (unités facturées, entier), `x-nexora-cost-micro` (micro-CAD, comme `chat.completions`), `x-nexora-privacy-decision` (`allow`, `mask`), `x-ratelimit-*`, `Retry-After` sur 429. |
| Pas de CORS | Comme pour les agents : la clé ne doit jamais se trouver dans une page web ; l'appelant passe par son serveur. |
| Version | Chemin `/v1/webpilot/…`. Un champ ajouté est compatible ; un champ retiré ou renommé exige `/v2`. |

## 3. Vue d'ensemble des endpoints

| Méthode et chemin | Rôle | Mode | Unité facturée |
|---|---|---|---|
| `POST /v1/webpilot/search` | Recherche sur le Web, résultats classés | synchrone | `page` (une page de résultats) |
| `POST /v1/webpilot/scrape` | Lire **une** adresse, rendre son contenu | synchrone | `page` |
| `POST /v1/webpilot/crawl` | Explorer un site à partir d'une adresse | asynchrone (tâche) | `page` par page lue |
| `GET /v1/webpilot/crawl/{id}` | État et résultats d'une exploration | synchrone | aucune |
| `DELETE /v1/webpilot/crawl/{id}` | Annuler une exploration | synchrone | aucune (le non lu est libéré) |
| `POST /v1/webpilot/extract` | Extraire des données structurées d'une ou plusieurs pages selon un schéma | synchrone (≤ quelques pages) ou tâche | `page` (+ jetons du modèle, section 5.3) |
| `POST /v1/webpilot/sessions` | Ouvrir une session de navigateur | synchrone | `browser_minute` (dès l'ouverture) |
| `GET /v1/webpilot/sessions/{id}` | État de la session (ouverte, fermée, motif) | synchrone | aucune |
| `POST /v1/webpilot/sessions/{id}/actions` | Naviguer, cliquer, saisir, attendre, lire | synchrone | inclus dans la minute |
| `DELETE /v1/webpilot/sessions/{id}` | Fermer la session | synchrone | arrête la minute en cours |

Les schémas ci-dessous sont des **formes cibles** : noms de champs à confirmer avant l'implémentation.

### 3.1 `POST /v1/webpilot/search`

Requête : `query` (texte, requis), `limit` (nombre de résultats voulus, plafonné), `country` et `language` (facultatifs), `include_content` (booléen : joindre le contenu lisible de chaque résultat, ce qui compte une `page` de plus par résultat lu).
Réponse : `results[]` avec `title`, `url`, `snippet`, `rank` ; `usage` : `{ "pages": n }`.
Politique : la **requête** de recherche est une donnée qui sort (section 6) ; elle peut être masquée ou refusée avant l'envoi.

### 3.2 `POST /v1/webpilot/scrape`

Requête : `url` (requis, `http` ou `https`), `formats` (`markdown`, `text`, `html`, `links`), `render` (`static` ou `browser` : exécuter le JavaScript de la page), `only_main_content`, `wait_ms` (plafonné), `headers` (liste fermée d'en-têtes permis).
Réponse : `url` finale (après redirections), `status` HTTP de la cible, `content` par format demandé, `metadata` (titre, langue, date de lecture), `usage` : `{ "pages": 1 }`.
Une page lue avec `render: "browser"` compte la même unité `page` ; le rendu par navigateur n'est pas une session (pas de minute facturée), il sert à une lecture.

### 3.3 `POST /v1/webpilot/crawl` et `GET /v1/webpilot/crawl/{id}`

Création : `url` de départ, `limit` (nombre maximal de pages, **requis** : c'est lui qui fixe la réservation), `max_depth`, `include_paths` / `exclude_paths` (motifs), `same_origin_only` (vrai par défaut), `formats` comme `scrape`, `webhook_url` (facultatif, voir 4.3).
Réponse de création : `202` avec `{ "id": "crawl_…", "status": "queued" }`.
Lecture : `status` (`queued`, `running`, `completed`, `cancelled`, `failed`), `pages_done`, `pages_total_estimate`, `results[]` paginés (`next` pour la page suivante), `usage` cumulé. Les résultats sont gardés **un temps limité** (paramètre, section 4.4) puis effacés.
Un site qui interdit l'exploration (robots.txt) : la page n'est pas lue et n'est **pas** facturée (section 7.2).

### 3.4 `POST /v1/webpilot/extract`

Requête : `urls[]` (une ou plusieurs, plafonné) **ou** `crawl_id`, et `schema` (JSON Schema du résultat voulu) et/ou `prompt` (consigne en langage naturel), `model` (identifiant public du catalogue ; défaut défini par Nexora AI).
Réponse : `data[]` (un objet par page, conforme au schéma ou accompagné d'un indicateur `valid: false` et de la raison), `usage` : `{ "pages": n, "tokens": { "prompt": …, "completion": … } }`.
L'extraction appelle un modèle : le contenu de la page **sort** vers ce modèle et passe donc par Privacy Router (une décision `deny` pour les modèles hors de l'environnement choisi). Facturation : section 5.3.

### 3.5 Sessions de navigation

Ouverture (`POST /v1/webpilot/sessions`) : `start_url` (facultatif), `viewport`, `locale`, `timezone`, `max_minutes` (**requis** : plafond de la session, fixe la réservation initiale), `idle_timeout_s`, `record` (`none` par défaut ; une capture d'écran de la dernière étape peut être renvoyée, jamais conservée).
Réponse : `{ "id": "ses_…", "status": "open", "expires_at": … }`.

Actions (`POST /v1/webpilot/sessions/{id}/actions`) : liste ordonnée d'actions, chacune d'un type **de liste fermée** :
`goto { url }`, `click { selector | text | coordinates }`, `type { selector, text }`, `press { key }`, `select { selector, value }`, `scroll { direction, amount }`, `wait { for: "selector"|"idle"|"ms", … }`, `extract { schema | prompt }`, `read { formats }`, `screenshot {}`.
Réponse : résultat de chaque action (`ok`, `error`), la `url` courante, le contenu demandé. Le premier échec arrête la liste (les actions suivantes ne sont pas exécutées).
**Pas de `evaluate` arbitraire** (aucun code JavaScript fourni par l'appelant) dans la première version : la surface d'attaque serait trop grande.
Chaque `goto` et chaque `type` sont des **sorties** évaluées par Privacy Router (adresse visitée ; texte saisi dans un formulaire d'un tiers).

Clôture : `DELETE` ferme la session ; la session se ferme aussi seule (`expires_at`, inactivité, solde épuisé, politique, erreur du navigateur). `GET` donne le motif : `closed_by_client`, `max_minutes`, `idle`, `insufficient_quota`, `privacy_policy`, `browser_error`.

Ce que WebPilot **ne fait pas** (décision de principe, à garder dans la documentation publique) : résoudre ou contourner des CAPTCHA ou d'autres protections anti-robots, saisir à la place d'une personne des identifiants ou des moyens de paiement, exécuter des achats. Une session n'a ni coffre d'identifiants ni stockage durable : tout (cookies, stockage local, téléchargements) disparaît à la fermeture.

## 4. Modèle d'exécution

### 4.1 Cycle d'une requête synchrone

`authentifier la clé → vérifier la permission webpilot → limites de débit (RPM, concurrence) → Privacy Router.evaluate (allow | mask | deny) → réserver le coût maximal au grand livre (402 si insuffisant) → exécuter → régler au coût réel dans la même transaction que l'événement d'usage → répondre`.
Une décision `deny` est rendue **avant** toute réservation (aucun montant retenu). Une erreur de la cible ou un délai dépassé **avant** de livrer quoi que ce soit libère la réservation et ne coûte rien.

### 4.2 Tâches asynchrones (`crawl`, grosses `extract`)

La tâche est mise en file dans la base `app` (file existante du worker, `SKIP LOCKED`, bail renouvelé pendant les étapes longues). La réservation couvre `limit` pages ; chaque page lue **règle** son unité (le grand livre est mis à jour à chaque lot, pas seulement à la fin) ; à la fin ou à l'annulation, le reste est libéré. Si le solde s'épuise en cours de route, la tâche passe à `failed` avec `error.code = "insufficient_quota"` et conserve ce qui a été lu et facturé.

### 4.3 Retours d'appel (webhook) — facultatif, à trancher

`webhook_url` est une **sortie** (Privacy Router) et une surface d'abus (SSRF). Première version proposée : pas de webhook ; l'appelant interroge `GET /crawl/{id}`. Décision O-5.

### 4.4 Conservation

Résultats d'une exploration ou d'une extraction asynchrone : conservés **le temps nécessaire à la lecture**, durée paramétrable (valeur à fixer, section 9), puis effacés. Jamais indexés, jamais relus par Nexora AI. Les métadonnées d'usage suivent la conservation du grand livre.

## 5. Facturation

### 5.1 Compteurs

| Compteur | Définition | Où il s'incrémente |
|---|---|---|
| `page` | Une page **lue avec succès** (statut HTTP de la cible exploitable et contenu rendu). Une recherche compte une page par page de résultats servie ; une exploration compte chaque page lue ; une extraction compte chaque page analysée. | `search`, `scrape`, `crawl`, `extract` |
| `browser_minute` | Une minute de **session de navigateur ouverte**, comptée par minute entamée (arrondie vers le haut), minimum d'une minute à l'ouverture. | `sessions` |

Rien d'autre n'est un compteur de facturation de WebPilot : ni les actions d'une session, ni le nombre de requêtes, ni la bande passante. **Privacy Router n'a aucun compteur** (jamais payante).

### 5.2 Prix

Les prix sont des **paramètres du catalogue**, jamais du code : une feuille de prix versionnée, comme celle des modèles, avec un prix de vente par unité (`page`, `browser_minute`) en micro-CAD, un coût amont en micro-USD par unité (pour suivre la marge) et une date d'entrée en vigueur. **Aucun prix n'est fixé ici** : le fondateur les décide, ils apparaissent sur la fiche seulement quand ils sont fixés et publiés. Le rendu par navigateur d'une page (`render: "browser"`) peut avoir un prix par `page` distinct du rendu statique : décision O-3.

### 5.3 Extraction avec modèle

`extract` ajoute au compteur `page` les **jetons** du modèle utilisé, au prix public de ce modèle dans le catalogue (comme `chat.completions`, avec réservation, règlement au coût réel et dépassement facturé en entier). Le modèle est choisi dans le catalogue ; une organisation en souveraineté stricte ne peut choisir qu'un modèle de l'environnement qu'elle a retenu (Privacy Router refuse les autres).

### 5.4 Réservation et règlement

| Opération | Réservation | Règlement |
|---|---|---|
| `search` | prix de `limit`/taille de page × unités attendues | pages réellement servies |
| `scrape` | 1 page | 1 page si succès, 0 sinon |
| `crawl` | `limit` pages | page par page ; reste libéré à la fin ou à l'annulation |
| `extract` | pages × prix + jetons maximaux × prix du modèle | réel, dépassement facturé |
| `sessions` | `max_minutes` au plus, **par tranches** (la première minute à l'ouverture, puis une minute à la fois) | minutes entamées ; une tranche non obtenue ferme la session |

Une réservation par tranche évite de bloquer un solde entier pour une session longue : si le solde ne couvre pas la minute suivante, la session se ferme (`insufficient_quota`) et son contenu est détruit.

### 5.5 Événements d'usage

Une ligne par requête (ou par lot, pour une tâche) dans `usage_events`, avec `endpoint` étendu à `webpilot.search`, `webpilot.scrape`, `webpilot.crawl`, `webpilot.extract`, `webpilot.session` (migration du type énuméré), `units` par compteur, `cost_micro`, `status`, `http_status`, `error_code`, `privacy_decision`, `policy_version`. **Aucun** champ de contenu, d'adresse visitée ni de requête de recherche : l'hôte de destination seul peut être gardé si la politique l'exige pour l'audit du client (décision O-6). Le tableau de consommation de l'espace client gagne une section « WebPilot » à côté des modèles et des agents.

## 6. Point d'accroche de Privacy Router

### 6.1 Où elle s'applique

À **chaque sortie**, c'est-à-dire chaque fois que quelque chose quitte l'environnement de l'organisation ou de Nexora AI vers un tiers :

| Sortie | Exemple | Donnée évaluée |
|---|---|---|
| Requête de recherche | `search.query` | le texte de la requête |
| Adresse visitée | `scrape.url`, `crawl.url`, `goto.url`, liens suivis | l'hôte et le chemin |
| Saisie dans une page | `type.text`, `select.value` | le texte saisi et l'hôte de destination |
| Contenu envoyé à un modèle | `extract` | le texte de la page et le modèle visé |
| Retour d'appel | `webhook_url` (si retenu) | l'hôte |

### 6.2 Interface

Appelée **avant la réservation** et **avant chaque sortie d'une tâche longue ou d'une session** (la politique peut changer en cours de route : elle est relue, avec cache court, à chaque action).

```ts
type OutboundIntent = {
  organizationId: string;
  apiKeyId: string;
  product: "webpilot";
  operation: "search" | "scrape" | "crawl" | "extract" | "session.goto" | "session.type" | "webhook";
  /** Destination de la sortie : hôte (toujours) et chemin (si la politique le demande). */
  destination: { host: string; path?: string } | { model: string };
  /** Nature des données qui sortent ; le contenu n'est passé que si la politique doit l'inspecter. */
  kinds: readonly ("query" | "url" | "form_input" | "page_content")[];
  content?: string;
};

type PrivacyDecision =
  | { decision: "allow"; policyVersion: string }
  | { decision: "mask"; policyVersion: string; content: string; ruleIds: string[] }
  | { decision: "deny"; policyVersion: string; ruleId: string; reason: PrivacyDenyReason };

interface PrivacyRouter {
  evaluate(intent: OutboundIntent): Promise<PrivacyDecision>;
}
```

- `allow` : la sortie a lieu telle quelle.
- `mask` : les renseignements reconnus par la politique (par exemple noms, courriels, numéros de téléphone) sont remplacés avant la sortie ; l'appelant reçoit un en-tête `x-nexora-privacy-decision: mask` et la liste des règles appliquées, jamais le texte masqué d'origine.
- `deny` : aucune sortie, aucune réservation. Réponse **403** `privacy_policy_denied` (section 8), qui nomme la règle et la raison, jamais le contenu.
- **Panne de la couche = refus** (fail closed) : 503 `privacy_router_unavailable`, jamais « laisser passer ».

### 6.3 Politique par organisation

Une politique par organisation, versionnée, lue par `organizationId` : listes d'hôtes permis ou interdits, catégories de renseignements à masquer ou à refuser dans les requêtes et les saisies, modèles permis pour l'extraction, niveau de journalisation de l'audit. Modifiable par les administrateurs de l'organisation dans l'espace client (hors périmètre de ce document). Une politique absente applique la **politique par défaut de Nexora AI** (contenu à décider : O-1) ; l'absence de politique n'est jamais « tout permis » par accident.
**Souveraineté stricte** : politique dont la liste d'hôtes permis est vide (rien ne sort) ou limitée à des hôtes nommés, et dont les modèles permis sont ceux de l'environnement choisi. Dans cette politique, `search` et `scrape` sur le Web ouvert sont refusés ; elle est un choix légitime, pas une erreur.

### 6.4 Ce que la couche ne fait pas

Elle ne prouve pas la résidence d'une donnée, ne remplace pas un avis juridique et n'est pas un engagement de conformité réglementaire. Ce que la fiche publique dit : « contrôle ce qui sort selon la politique de votre organisation ». Rien de plus tant que ce n'est pas démontré.

## 7. Sécurité et abus (à traiter avant tout code)

1. **SSRF.** WebPilot récupère des adresses fournies par des inconnus depuis l'infrastructure de Nexora AI. Obligatoire : exécution dans un réseau **sans accès** à l'intranet de Nexora AI (ni base, ni Directus, ni LiteLLM, ni coffre, ni métadonnées d'hébergeur) ; refus des adresses privées, de boucle locale, de lien local et des plages réservées après **résolution DNS** (la connexion se fait à l'adresse résolue, pour éviter le DNS rebinding) ; mêmes contrôles à chaque redirection ; schémas `http`/`https` seulement ; ports en liste fermée.
2. **Robots et conditions des sites.** Par défaut, `robots.txt` est respecté pour `crawl` et `search`/`scrape` automatisés ; un site qui refuse n'est pas lu ni facturé. Identification claire du robot (nom, adresse de contact). Position à valider par un avocat avant l'ouverture : décision O-2.
3. **Navigateur.** Un conteneur éphémère par session, sans profil partagé, sans cookies d'une session à l'autre, avec limites de processeur, mémoire, disque, durée et nombre d'onglets ; téléchargements désactivés ; destruction à la fermeture ; aucune extension.
4. **Taille et temps.** Plafonds de taille de réponse, de pages par exploration, de durée par requête, de sessions simultanées par organisation. Valeurs en configuration, pas dans le code.
5. **Contenu hostile.** Le contenu d'une page est une **donnée non fiable**, jamais une instruction : il est renvoyé à l'appelant tel quel (ou extrait), jamais exécuté par Nexora AI, et jamais concaténé à une consigne système lors d'une extraction (l'extraction place le texte de la page dans un message séparé, balisé comme donnée).
6. **Usage interdit.** Conditions d'utilisation : pas de contournement de protections, pas d'envoi massif non sollicité, pas de collecte de renseignements personnels sans fondement légal, pas d'accès à des services authentifiés d'un tiers sans son autorisation. Liées à la politique d'utilisation acceptable (page en brouillon).
7. **Journaux.** `@nexora/log` masque déjà `nxk_…` ; ajouter le masquage des adresses complètes (query string comprise) et du texte saisi. Aucun contenu de page dans les journaux.

## 8. Erreurs (format OpenAI)

Même enveloppe que le reste de `/v1` : `{ "error": { "message", "type", "param", "code" } }`, `cache-control: no-store`, messages en français, `param` renseigné quand un champ est en cause.

### 8.1 Solde vide : 402

```json
{
  "error": {
    "message": "Solde de crédits insuffisant pour cette requête. Rechargez votre compte.",
    "type": "insufficient_quota",
    "param": null,
    "code": "insufficient_quota"
  }
}
```

Mêmes trois codes que `E.insufficient`, `E.blocked` et `E.keyCap` de la passerelle, **avant tout appel sortant** :

| Statut | `code` | `type` | Cas |
|---|---|---|---|
| 402 | `insufficient_quota` | `insufficient_quota` | Le solde ne couvre pas la réservation. |
| 402 | `account_blocked` | `insufficient_quota` | Solde négatif (un règlement a dépassé la réservation) : rechargez pour reprendre. |
| 402 | `api_key_spend_cap_reached` | `insufficient_quota` | Le plafond de dépense de la clé est atteint. |

En cours de tâche ou de session, la même erreur n'est pas renvoyée en HTTP (la requête est déjà terminée) : elle devient l'état `failed` / la fermeture `insufficient_quota`, avec l'objet `error` ci-dessus dans la ressource.

### 8.2 Autres erreurs

| Statut | `code` | `type` | Cas |
|---|---|---|---|
| 400 | `invalid_request` | `invalid_request_error` | Champ absent, mal formé ou hors limites (`param` renseigné). |
| 400 | `url_not_allowed` | `invalid_request_error` | Adresse interdite (réseau privé, schéma, port) : voir section 7.1. |
| 401 | `invalid_api_key`, `api_key_revoked`, `api_key_expired` | `authentication_error` | Comme aujourd'hui. |
| 403 | `operation_not_allowed` | `invalid_request_error` | La clé n'a pas la permission `webpilot` ou l'opération. |
| 403 | `privacy_policy_denied` | `invalid_request_error` (ou un type `permission_error` à ajouter à `ErrorType`) | Privacy Router a refusé la sortie ; `message` nomme la règle, pas le contenu. |
| 404 | `not_found` | `invalid_request_error` | Tâche ou session inconnue, expirée ou d'une autre organisation. |
| 409 | `session_closed` | `invalid_request_error` | Action sur une session fermée (le motif est dans `GET /sessions/{id}`). |
| 413 | `request_too_large` | `invalid_request_error` | Corps trop volumineux. |
| 422 | `target_unreachable` | `invalid_request_error` | La cible n'a pas répondu, DNS inconnu, certificat invalide : rien n'est facturé. |
| 429 | `rate_limit_exceeded` | `rate_limit_error` | Débit ou concurrence dépassés, `Retry-After` renseigné. |
| 502 | `target_error` | `api_error` | Statut 5xx de la cible ou réponse illisible : rien n'est facturé. |
| 503 | `webpilot_unavailable` | `api_error` | Service non configuré ou arrêté. |
| 503 | `privacy_router_unavailable` | `api_error` | La couche ne répond pas : refus par défaut, rien n'est facturé. |
| 504 | `target_timeout` | `api_error` | Délai dépassé avant tout contenu : rien n'est facturé. |

Règle commune de facturation : **une erreur avant livraison de contenu ne coûte rien** ; une erreur après livraison partielle facture ce qui a été livré (une page lue d'une exploration interrompue est facturée, la suivante non).

## 9. Paramètres à fixer (jamais en dur dans le code)

Débit par clé (requêtes par minute), sessions simultanées par organisation, pages maximales d'une exploration, durée maximale d'une session, délai d'inactivité, taille maximale d'une réponse, durée de conservation des résultats asynchrones, liste fermée des en-têtes et des ports permis, nom et adresse de contact du robot, prix par unité et coûts amont. Aucune valeur n'est proposée ici : elles se décident avec le fondateur et se mesurent sur un pilote.

## 10. Décisions ouvertes (fondateur)

| # | Question | Pourquoi elle compte |
|---|---|---|
| O-1 | Contenu de la **politique par défaut** de Privacy Router (qu'est-ce qui est masqué ou refusé sans réglage) ? | Elle s'applique à tous les clients qui n'ont rien réglé. |
| O-2 | Respect de `robots.txt` et position sur les conditions des sites ; avis d'un avocat avant l'ouverture. | Risque juridique propre à l'exploration du Web. |
| O-3 | Un prix distinct pour le rendu par navigateur d'une page ? Pour l'extraction ? | Le coût amont d'un rendu est plus élevé qu'une lecture statique. |
| O-4 | Arrondi des minutes de navigateur : minute entamée (proposé) ou prorata à la seconde ? | Équité perçue et simplicité de la facture. |
| O-5 | Webhooks de fin de tâche dans la première version ? | Surface SSRF supplémentaire. |
| O-6 | Garder l'**hôte** visité dans l'événement d'usage pour l'audit du client ? | Audit utile contre confidentialité ; l'adresse complète n'est jamais gardée. |
| O-7 | Hébergement du navigateur : sur l'infrastructure de Nexora AI ou chez un fournisseur de navigateurs ? | Détermine la résidence des données et la marge. Si un fournisseur tiers est retenu, il passe par la liste publique des fournisseurs et l'activation explicite. |
| O-8 | Permission de clé `webpilot` activée par défaut sur les nouvelles clés, ou à cocher ? | Sécurité par défaut (proposé : à cocher). |

## 11. Plan d'implémentation (quand le fondateur dit go)

1. **Contrat d'abord** : générer un document OpenAPI de `/v1/webpilot/*` depuis les schémas Zod, test de contrat des réponses d'erreur (402 identique à `E.insufficient`, `E.blocked`, `E.keyCap`).
2. **Grand livre** : migration (`endpoint` étendu, compteurs `units`), feuille de prix versionnée, réservations par tranches ; tests rouges d'abord (réservation, règlement partiel d'une exploration, fermeture d'une session sur solde épuisé, idempotence par `requestId`).
3. **Privacy Router (interface seule)** : implémentation de `evaluate` avec la politique par défaut, tests de refus (`deny` sans réservation), de panne (fail closed) et de masquage ; aucun appel sortant sans passer par elle (test statique : le client HTTP de sortie n'est exporté que par ce module).
4. **Garde SSRF** et client HTTP de sortie, avec ses tests (adresses privées, redirections, DNS rebinding simulé).
5. **`scrape` puis `search`** (synchrones), **`crawl`** (tâche), **`extract`**, **sessions**.
6. **Espace client** : permission de clé, section de consommation, politique de l'organisation.
7. **Fiche publique** : passer `webpilot` de « Bientôt » à « Disponible » dans `web/src/i18n/apps.ts` seulement quand 1 à 5 sont livrés et vérifiés ; compléter « ce qui est prêt » dans les deux dictionnaires ; publier les prix **après** décision du fondateur.

Rien de ce plan ne s'exécute avant la validation de la section 10.
