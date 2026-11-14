# Contrat d'API — Grants d'appareil entre NexoraSite et LifeCode

| Champ | Valeur |
|---|---|
| Titre | Contrat Device Grants — COMPTE NEXORA (site) ↔ LifeCode (`par/b1-compte`) |
| Version du contrat | 2.0.0 |
| Date | 2026-11-12 (UTC) |
| Langue | Français canadien (fr-CA) — messages d'erreur bilingues FR/EN |
| Exploitant du compte | NexoraSite (`root/nexora-web`) — base publique : `https://nexora-ai.ca` (variable `NEXORA_ACCOUNT_URL`) |
| Consommateur | LifeCode — branche `par/b1-compte` |
| Portée | Connexion OIDC PKCE, grants d'appareil, solde, consommation, passerelle `/v1/*` |
| Secrets dans ce document | Aucun. Toutes les clés, codes et jetons sont fictifs et tronqués. |

> Conventions : montants en **micro-CAD** entiers (`1 CAD = 1 000 000 micro-CAD`, arithmétique `BigInt`,
> sérialisation décimale à 6 décimales). Dates en ISO-8601 UTC. Toutes les réponses d'erreur du
> périmètre « compte / appareil » suivent l'enveloppe bilingue décrite en § 3.6. `xxx…` désigne une
> valeur fictive tronquée. Aucun appel réseau n'est requis pour interpréter ce contrat.

Glossaire :

- **Grant d'appareil** : droit d'accès d'un appareil précis, lié à un compte et à une organisation,
  matérialisé par une clé API `nxk_…` à usage passerelle.
- **Code OIDC** (`nxc_…`) : code d'autorisation à usage unique, durée de vie courte.
- **Jeton OIDC** (`nxo_…`) : jeton d'accès opaque porteur de la portée `device:grant`, durée de vie courte.
- **Clé d'appareil** (`nxk_…`) : clé API à longue durée de vie, renouvelable et révocable, acceptée par
  la passerelle exactement comme une clé manuelle.

---

## 1) Garanties de sécurité

### 1.1 Zéro secret en clair en base

1. **Aucun secret brut n'est conservé.** Seules des **empreintes SHA-256 hexadécimales** sont stockées :
   - codes d'autorisation `nxc_…` → `codeHash = SHA-256(code)` ;
   - jetons d'accès `nxo_…` → `tokenHash = SHA-256(jeton)` ;
   - clés d'appareil et clés API `nxk_…` → `keyHash = SHA-256(clé)`.
2. **Une clé `nxk_…` n'est renvoyée qu'une seule fois**, au moment de sa création ou de sa rotation,
   dans le corps HTTPS de la réponse. Elle n'est ensuite plus jamais lisible (listes et lectures
   l'expurgent ; seuls `grant_id`, préfixe visible et métadonnées sont retournés).
3. **Préfixe non sensible :** seuls les 12 premiers caractères (`nxk_…`, p. ex. `nxk_EXEMPLE…`
   — valeur fictive) peuvent être journalisés ou affichés pour identifier une clé. Jamais la clé entière.
4. **Comparaisons en temps constant** pour la vérification PKCE (`timingSafeEqual`) ; consommation
   **atomique** du code d'autorisation dès la première tentative (tout rejeu, même concurrent, échoue).
5. **Transport et cache :** HTTPS obligatoire en production ; réponses sensibles avec
   `Cache-Control: no-store` (et `Pragma: no-cache` pour le jeton) ; redirections `302` non mises en cache.
6. **Aucun secret embarqué dans LifeCode.** Les clients natifs sont des **clients publics** :
   `token_endpoint_auth_methods_supported: ["none"]`, aucun `client_secret` dans l'application,
   PKCE S256 obligatoire (voir § 2).
7. **Aucun secret dans les journaux, les commits ni les exports.** Les journaux ne retiennent que
   l'empreinte, le préfixe, l'identifiant du grant et les métadonnées. Les exports CSV d'activité
   (voir § 4.5) ne contiennent aucune clé.

### 1.2 Empreintes et préfixes

| Secret | Format | Stockage | Durée de vie | Rejouable |
|---|---|---|---|---|
| Code d'autorisation | `nxc_` + 43 caractères base64url (fictif : `nxc_EXEMPLE…`) | `codeHash` SHA-256 + `consumedAt` | 300 s, usage unique | Non — brûlé à la première tentative |
| Jeton d'accès OIDC | `nxo_` + 43 caractères base64url (fictif : `nxo_EXEMPLE…`) | `tokenHash` SHA-256 + `expiresAt` + `revokedAt` | 900 s | Non après expiration ou révocation |
| Clé d'appareil / clé API | `nxk_` + partie aléatoire (fictif : `nxk_EXEMPLE…`) | `keyHash` SHA-256 | Selon `ttl_days` (renouvelable, révocable) | Non après révocation ou expiration |
| `id_token` | JWT compact HS256 signé côté serveur (`iss`, `sub`, `aud`, `account_id`, `courriel`, `name`, `iat`, `exp`, `nonce` repris s'il y a lieu) | Non stocké (vérifié par signature) | 900 s | Non après expiration |

Règles communes :

- Toute valeur `nxc_`, `nxo_` ou `nxk_` inconnue, expirée, consommée ou révoquée est refusée
  en `401` (`invalid_grant`, `invalid_api_key`, `api_key_revoked`, `api_key_expired` — voir § 3.6).
- Un en-tête `Authorization` présent mais invalide **ne se rabat jamais** sur le témoin de session :
  la requête est rejetée en `401`, même si un cookie valide existe.
- Les requêtes `POST` et `DELETE` par session exigent une **origine de même origine** vérifiée
  (`Origin`/`Referer` contre l'URL du site), sinon `403 forbidden` (« Origine de la requête refusée »).

### 1.3 Authentification à deux facteurs (2FA) du personnel

- La 2FA est **obligatoire pour les comptes du personnel actif**.
- Parcours OIDC (§ 2.3) : si l'utilisateur connecté est membre actif du personnel et que
  `twoFactorEnabled` n'est pas `true`, le serveur **redirige vers la page sécurité**
  (`/fr/compte/securite` ou `/en/account/security` selon la langue) au lieu d'émettre un code.
  Aucun `nxc_…` n'est émis tant que la 2FA n'est pas activée.
- Les comptes ordinaires ne sont pas bloqués par cette règle, mais toute organisation peut
  imposer la 2FA par politique interne sans changement de contrat.

### 1.4 Rétrocompatibilité des clés API manuelles

- Les clés API créées à la main (préfixe `nxk_…`) **continuent de fonctionner sans changement** :
  même authentification (`authenticateApiKey`), même grand livre, même débit de crédits,
  même `402` quand le solde est vide.
- Une clé manuelle **ne porte aucun `grant_id`** : elle peut appeler la passerelle et lire le
  solde et l'usage, mais elle **ne peut ni créer un grant** (`403 insufficient_scope`) **ni gérer
  un autre appareil** (`403 cross_device_forbidden`).
- Une clé d'appareil est **acceptée par la passerelle exactement comme une clé `nxk_`** :
  même comptabilité, mêmes portées `models`/`webpilot`, même `402` à solde vide, et
  **révoquée = refusée immédiatement** en `401 api_key_revoked` (y compris la clé en période
  de grâce après rotation une fois la grâce écoulée ou après révocation explicite).
- Les migrations de base de données du site sont **strictement additives et non destructives**
  (numérotation après `0034`) : aucun effacement de clés ou de grand livre existant.

---

## 2) OIDC PKCE S256 (clients natifs)

Flux : **Authorization Code + PKCE S256** (RFC 8252, client public sans secret).
Découverte, autorisation, jeton. Le flux « code d'appareil » (§ 4.4) n'est qu'un secours.

### 2.1 Découverte — `GET /.well-known/openid-configuration`

- **Route :** `GET /.well-known/openid-configuration` (émetteur = URL publique du site, sans barre finale).
- **Réponse `200`** (exemple de structure, valeurs relatives à l'émetteur) :

```json
{
  "issuer": "https://nexora-ai.ca",
  "authorization_endpoint": "https://nexora-ai.ca/oauth/authorize",
  "token_endpoint": "https://nexora-ai.ca/oauth/token",
  "jwks_uri": "https://nexora-ai.ca/api/auth/jwks",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["openid", "profile", "email", "device:grant"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

Notes :

- `token_endpoint_auth_methods_supported: ["none"]` confirme qu'**aucun secret client** n'est attendu.
- Seule la méthode `S256` est annoncée et acceptée ; `plain` est refusé.
- Les alias historiques du site (`/api/auth/oauth2/*`) peuvent subsister à titre transitoire,
  mais les routes contractuelles sont celles du § 2.2 et § 2.4.

### 2.2 Autorisation — `GET /oauth/authorize` et `GET /v1/account/authorize`

Les deux routes sont **strictement équivalentes** ; documentée ici avec `/oauth/authorize`.

**Requête** (paramètres de chaîne de requête) :

| Paramètre | Requis | Règle |
|---|---|---|
| `client_id` | Oui | L'un de `lifecode-desktop`, `lifecode-cli`, `nexora-lifecode-cli`, `creative-studio-desktop`. Tout autre → `400 JSON`, **sans redirection** |
| `redirect_uri` | Oui | Boucle locale `http://` (voir § 2.5). Invalide → `400 JSON`, **sans redirection** (anti-redirection ouverte) |
| `response_type` | Oui | Doit valoir `code`, sinon retour d'erreur vers `redirect_uri` |
| `scope` | Oui | Liste séparée d'espaces incluant `device:grant` ou un alias (§ 2.6) ; portée inconnue → erreur |
| `code_challenge` | Oui | 43 à 128 caractères `[A-Za-z0-9_-]` (empreinte S256 du vérificateur) |
| `code_challenge_method` | Oui | Doit valoir `S256` |
| `state` | Recommandé | Repris tel quel dans la redirection de succès ou d'erreur |
| `nonce` | Recommandé | Repris dans l'`id_token` s'il fait ≤ 255 caractères |
| `ui_locales` | Non | `en` force l'anglais ; sinon `Accept-Language` commençant par `en` → anglais, défaut français |

**Comportement :**

1. Client ou `redirect_uri` invalides → **`400 JSON`** `{ "error": "invalid_request", "error_description": "…" }`,
   **jamais** de redirection.
2. Autres paramètres invalides (`response_type`, `scope`, PKCE) → **redirection `302`** vers
   `redirect_uri` avec `error`, `error_description` et `state` repris (p. ex. `invalid_scope`).
3. Utilisateur non connecté → **redirection `302`** vers la connexion, langue négociée, avec `next` :
   - `https://nexora-ai.ca/fr/compte/connexion?next=%2Foauth%2Fauthorize%3F…`
   - ou `/en/account/signin?next=…` si l'anglais est préféré.
4. Personnel sans 2FA → **redirection `302`** vers `/fr/compte/securite` (ou équivalent anglais).
5. Succès → **redirection `302`** vers `redirect_uri` avec `code=nxc_EXEMPLE…` (fictif, usage unique,
   300 s) et `state` repris. Seule l'empreinte SHA-256 du code est stockée.

Exemple de redirection de succès (valeurs fictives) :

```text
http://127.0.0.1:5173/callback?code=nxc_EXEMPLE&state=xyz
```

### 2.3 Redirection vers la connexion

- **Forme contractuelle :** `/fr/compte/connexion?next=…` (français par défaut),
  `/en/account/signin?next=…` si `ui_locales=en` ou `Accept-Language: en…`.
- `next` contient le chemin et la requête d'autorisation d'origine encodés
  (p. ex. `/oauth/authorize?…` ou `/v1/account/authorize?…`).
- Après connexion, le parcours reprend à l'URL d'autorisation sans perte de `state`, `nonce` ni PKCE.

### 2.4 Jeton — `POST /oauth/token` et `POST /v1/account/token`

Les deux routes sont **strictement équivalentes** ; échange **atomique** du code contre un jeton.

**Requête :**

- Méthode `POST`, corps `application/x-www-form-urlencoded` **ou** `application/json`.
- Champs : `grant_type=authorization_code` (seule valeur acceptée, sinon `unsupported_grant_type`),
  `code` (le `nxc_…` reçu), `redirect_uri` (identique à l'autorisation), `client_id`
  (identique à l'autorisation), `code_verifier` (43 à 128 caractères `[A-Za-z0-9._~-]`).
- `client_id` inconnu → `401 invalid_client`. Code inconnu, déjà consommé, expiré, ou discordant
  (`client_id`, `redirect_uri`, échec PKCE) → `400 invalid_grant` (messages distincts :
  « déjà utilisé », « expiré », « discordance », « échec PKCE »).

**Réponse `200`** (exemple, secrets fictifs tronqués) :

```json
{
  "access_token": "nxo_EXEMPLE",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "openid profile email device:grant",
  "id_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.EXEMPLE.SIGNATURE",
  "account": {
    "id": "org_00000000-0000-4000-8000-000000000000",
    "user_id": "user_00000000-0000-4000-8000-000000000000",
    "email": "utilisateur@exemple.ca",
    "display_name": "Utilisateur Exemple"
  }
}
```

Notes :

- `access_token` : opaque `nxo_…`, 900 s, seule l'empreinte est stockée (`tokenHash`, `expiresAt`).
- `id_token` : JWT HS256 compact avec `iss` (site), `sub` (utilisateur), `aud` (client),
  `account_id` (organisation), `courriel`, `name`, `iat`, `exp` (+ `nonce` repris).
- Le code est **brûlé atomiquement à la première tentative** : tout rejeu échoue, même concurrent.

### 2.5 Clients et redirection loopback

**Clients natifs autorisés** (clients publics, sans secret) :

- `lifecode-desktop`
- `lifecode-cli`
- `nexora-lifecode-cli`
- `creative-studio-desktop`

**`redirect_uri` loopback valide** (`isValidLoopbackRedirectUri`) :

- Schéma `http:` uniquement (jamais `https:`, jamais schéma privé) ;
- Hôte `127.0.0.1`, `localhost`, `::1` ou `[::1]` ;
- Port explicite, entier, de `1024` à `65535` ;
- Aucun identifiant (`userinfo`) ni fragment (`#…`) ;
- Chemin commençant par `/callback` (p. ex. `/callback`, `/callback/`, `/callback/fin`).

Exemples valides : `http://127.0.0.1:5173/callback`, `http://localhost:8080/callback/fin`.
Exemples refusés : `https://…`, `http://127.0.0.1/callback` (sans port), `http://exemple.ca/callback`,
`http://127.0.0.1:5173/autre`, `http://127.0.0.1:5173/callback#frag`.

### 2.6 Portées (scopes)

Portée canonique exigée pour tout jeton d'appareil : **`device:grant`**.

| Portée publiée | Sens |
|---|---|
| `openid` | Jetons `id_token` |
| `profile` | Profil (`name`) |
| `email` | Courriel du compte |
| `device:grant` | **Obligatoire** — autorise l'émission et la gestion de grants d'appareil |
| `lifecode:device-grant` | **Alias** accepté, normalisé en `device:grant` |
| `nexora:device-grants` | **Alias** accepté, normalisé en `device:grant` |

- Toute portée hors de cette liste → `invalid_scope`.
- Absence de `device:grant` (ou d'un alias) après normalisation et déduplication → `invalid_scope`.
- Le `scope` retourné par `/oauth/token` est la forme normalisée (p. ex. `openid profile email device:grant`).

---

## 3) Grants d'appareil (Device Grants)

Préfixe équivalent : **`POST/GET /v1/device-grants`** et **`POST/GET /v1/account/device-grants`**
sont strictement interchangeables dans tout ce chapitre (même chose pour les sous-routes
`/[id]`, `/[id]/rotate`, `/[id]/revoke`, `/rotate`, `/revoke`). Les exemples utilisent
`/v1/account/device-grants`.

Authentification du périmètre « compte » (`authenticateAccountRequest`) :

- `Authorization: Bearer nxo_…` → principal OIDC (`userId`, `organizationId`), portée `device:grant` exigée ;
- `Authorization: Bearer nxk_…` → principal clé API (`organizationId`, `apiKeyId`, `grantId` s'il s'agit
  d'une clé d'appareil de la même organisation) ; clé révoquée → `401 api_key_revoked`,
  expirée → `401 api_key_expired` ;
- sans `Authorization`, témoin de session + contrôle de même origine pour `POST`/`DELETE`
  (principal session : `userId`, `organizationId`, `role`) ;
- en-tête `Authorization` présent mais mal formé ou inconnu → `401 invalid_api_key`, sans repli session.

Rôles d'organisation : `owner`, `admin` (privilégiés), autres rôles (p. ex. `member`) limités à
leurs propres lectures ; toute opération de rotation ou révocation par session exige `owner`/`admin`
(voir chaque route). Un jeton OIDC qui révoque tout doit appartenir à un `owner`/`admin`
(vérifié en base via l'appartenance).

### 3.1 Création — `POST /v1/device-grants` et `POST /v1/account/device-grants`

- **Auth :** OIDC `nxo_…` ou session. **Une clé `nxk_…` ne peut jamais créer un grant**
  → `403 insufficient_scope` (« Une clé d'appareil ne peut pas émettre un nouvel accès d'appareil »).
- **Corps JSON** (`device_id` et `device_label` requis ; clés serpent ou chameau acceptées) :

| Champ | Type | Règle |
|---|---|---|
| `device_id` / `deviceId` | chaîne non vide | Identifiant stable de l'appareil (p. ex. UUID local) |
| `device_label` / `deviceLabel` / `label` | chaîne non vide | Nom affichable (« Portable de Marie ») |
| `product` | chaîne ou `null` | Défaut `"lifecode"` ; p. ex. `lifecode-desktop` |
| `scopes.models` | tableau de chaînes | Modèles publics autorisés ; défaut : catalogue autorisé |
| `scopes.webpilot` | tableau de chaînes | Opérations `search`, `scrape`, `extract` ; défaut selon `webpilot` |
| `scopes.daily_cap_micros` | entier sûr > 0 | Plafond quotidien optionnel en micro-CAD |
| `spend_cap_cad` / `spendCapCad` | nombre ≥ 0 ou `null` | Plafond de dépenses en CAD ; `null` = sans plafond |
| `ttl_days` / `ttlDays` | entier | Durée de vie en jours (doit être > 0 ; limites serveur applicables) |
| `require_positive_balance` | booléen | Si `true`, exige un solde disponible > 0, sinon `402` |

- **Réponse `201`** : le grant **avec sa clé en clair, une seule fois** (champs serpent et chameau
  fournis pour compatibilité ; horodatages ISO, `spendCapMicro` en chaîne entière pour `BigInt`) :

```json
{
  "grant_id": "00000000-0000-4000-8000-000000000000",
  "keyId": "00000000-0000-4000-8000-000000000000",
  "key": "nxk_EXEMPLE_A_NE_JAMAIS_REUTILISER",
  "key_prefix": "nxk_EXEMPLE",
  "device_id": "appareil-local-001",
  "device_label": "Portable de Marie",
  "organization_id": "org_00000000-0000-4000-8000-000000000000",
  "expiresAt": "2027-11-12T00:00:00.000Z",
  "expires_at": "2027-11-12T00:00:00.000Z",
  "rotateAfter": "2026-12-12T00:00:00.000Z",
  "rotate_after": "2026-12-12T00:00:00.000Z",
  "rotated": false,
  "webpilot": true,
  "spendCapMicro": "5000000",
  "spend_cap_micro": "5000000",
  "spend_cap_cad": 5,
  "scopes": { "models": ["nexora/helix"], "webpilot": ["search", "scrape"] },
  "allowedModels": ["nexora/helix"],
  "allowed_models": ["nexora/helix"]
}
```

- LifeCode **doit stocker la clé aussitôt** dans son trousseau local ; le site ne pourra plus la redonner.
- Erreurs : `400 invalid_request` (paramètres manquants/invalides, JSON mal formé),
  `401` (jeton absent/invalide), `402` (solde vide quand `require_positive_balance`), `403` (clé qui tente de créer).

### 3.2 Liste et lecture

**Liste — `GET /v1/device-grants` et `GET /v1/account/device-grants`**

- Requête : `GET ?include_revoked=true` pour inclure les révoqués (défaut : masqués).
- Visibilité : un principal OIDC ou session voit tous les grants de son organisation ;
  un principal **clé `nxk_…` ne voit que son propre grant** (ou rien s'il s'agit d'une clé manuelle).
- **Réponse `200`** (clés expurgées — aucun champ `key` ni `keyHash`) :

```json
{
  "object": "list",
  "data": [
    {
      "grant_id": "00000000-0000-4000-8000-000000000000",
      "device_id": "appareil-local-001",
      "device_label": "Portable de Marie",
      "key_prefix": "nxk_EXEMPLE",
      "revokedAt": null,
      "expiresAt": "2027-11-12T00:00:00.000Z"
    }
  ],
  "grants": []
}
```

(`grants` reprend `data` pour compatibilité.)

**Lecture — `GET /v1/account/device-grants/[id]`** (et alias `/v1/device-grants/[id]`)

- `[id]` : UUID du grant, ou **`current`** comme alias de « mon propre grant » pour une clé `nxk_…`
  (toute autre identité → `404 grant_not_found` ; une clé qui vise un autre `[id]`
  → `403 cross_device_forbidden`).
- Succès `200` : le grant **sans** la clé. Inconnu ou hors organisation → `404 grant_not_found`
  (« Accès d'appareil introuvable » / « Device grant not found »).
- `[id]` mal formé (non-UUID et non `current`) → `404 grant_not_found`.

### 3.3 Rotation — `POST /v1/account/device-grants/[id]/rotate` et `POST …/rotate`

Deux formes équivalentes :

- **Ciblée :** `POST /v1/account/device-grants/[id]/rotate` et `POST /v1/device-grants/[id]/rotate` ;
- **Par soi-même :** `POST /v1/account/device-grants/rotate` et `POST /v1/device-grants/rotate`,
  avec le grant désigné par `Bearer nxk_…` (alias `id=current`) **ou** par `grant_id` explicite
  dans le corps (`{ "grant_id": "…" }`).

Règles :

- Auth : OIDC, session `owner`/`admin`, ou la **clé concernée elle-même** (`actingApiKeyId`).
  Session non privilégiée → `403 forbidden`. Clé visant un autre grant → `403 cross_device_forbidden`.
- Corps optionnel : `{ "grace_seconds": 60 }` — durée pendant laquelle **l'ancienne clé reste
  acceptée** après rotation. **Défaut `60` s, plage `0..300` s** ; hors plage → `400 invalid_request`.
  `0` signifie bascule immédiate.
- Effet : nouvelle clé `nxk_…` émise (renvoyée **une seule fois**, comme en création),
  ancien `keyHash` conservé en grâce jusqu'à `maintenant + grace_seconds`, puis définitivement
  invalidé ; `rotated: true`, `rotateAfter` recalculé.
- **Réponse `200`** : même forme qu'en création (nouveau `key` + métadonnées, `rotated: true`).

Exemple de requête par soi-même (valeurs fictives) :

```http
POST /v1/account/device-grants/rotate HTTP/1.1
Authorization: Bearer nxk_EXEMPLE
Content-Type: application/json

{ "grace_seconds": 60 }
```

Pendant la grâce, l'ancienne et la nouvelle clés sont acceptées ; après la grâce (ou après
révocation explicite), l'ancienne est refusée en `401 api_key_revoked`.

### 3.4 Révocation — `DELETE [id]`, `POST [id]/revoke`, `POST /revoke`, `DELETE` collection

Toutes les formes révoquent **immédiatement** : la clé courante **et** l'éventuelle clé en
période de grâce sont invalidées d'un coup ; tout appel passerelle ultérieur avec l'une
d'elles est refusé en **`401 api_key_revoked`**.

| Route | Effet | Auth |
|---|---|---|
| `DELETE /v1/account/device-grants/[id]` et alias `/v1/device-grants/[id]` | Révoque le grant `[id]` (ou `current` pour sa propre clé) | Session `owner`/`admin`, OIDC du compte, ou la clé elle-même |
| `POST /v1/account/device-grants/[id]/revoke` et alias `/v1/device-grants/[id]/revoke` | **Alias équivalent** au `DELETE` ciblé (même effet immédiat) | Idem |
| `POST /v1/account/device-grants/revoke` et `POST /v1/device-grants/revoke` | Révoque **sa propre clé** via `Bearer nxk_…`, ou le grant désigné par `{ "grant_id": "…" }` | Clé elle-même ou principal du compte |
| `DELETE /v1/account/device-grants` et `DELETE /v1/device-grants` | Révoque **tous** les grants de l'organisation | OIDC ou session `owner`/`admin` uniquement ; une clé `nxk_…` → `403 cross_device_forbidden` ; session non privilégiée → `403 forbidden` |

Réponses :

- Révocation ciblée `200` : `{ "revoked": true, "grant_id": "…" }`.
- Révocation de masse `200` : `{ "revoked": true, "revoked_count": 3 }`.
- Grant inconnu → `404 grant_not_found`. Clé visant autrui → `403 cross_device_forbidden`.

Après révocation, la passerelle répond (voir § 4.6) :

```json
{
  "error": {
    "message": "Cette clé API d'appareil a été révoquée.",
    "message_fr": "Cette clé API d'appareil a été révoquée.",
    "message_en": "This device API key has been revoked.",
    "type": "authentication_error",
    "param": null,
    "code": "api_key_revoked"
  },
  "code": "api_key_revoked",
  "message_fr": "Cette clé API d'appareil a été révoquée.",
  "message_en": "This device API key has been revoked."
}
```

(En anglais, `message` reprend `message_en` ; en-tête `WWW-Authenticate: Bearer realm="nexora"`.)

### 3.5 Matrice des permissions (résumé)

| Opération | OIDC `nxo_…` | Session `owner`/`admin` | Session autre rôle | Clé `nxk_…` d'appareil (soi) | Clé manuelle / autre grant |
|---|---|---|---|---|---|
| Créer un grant | ✅ | ✅ | ✅ (création permise) | ❌ `403 insufficient_scope` | ❌ `403 insufficient_scope` |
| Lister | ✅ (organisation) | ✅ | ✅ | ✅ (soi uniquement) | ✅ (vide, sauf soi) |
| Lire `[id]` | ✅ | ✅ | ✅ | ✅ (`current`/soi) | ❌ `403 cross_device_forbidden` |
| Rotation `[id]` / `/rotate` | ✅ | ✅ | ❌ `403 forbidden` | ✅ (soi, grâce `0..300` s, défaut `60` s) | ❌ `403 cross_device_forbidden` |
| Révocation `[id]` / `/revoke` | ✅ | ✅ | ❌ `403 forbidden` | ✅ (soi, immédiate) | ❌ `403 cross_device_forbidden` |
| Révocation de masse | ✅ si `owner`/`admin` | ✅ | ❌ `403 forbidden` | ❌ `403 cross_device_forbidden` | ❌ `403 cross_device_forbidden` |

### 3.6 Enveloppe d'erreur bilingue et codes

Toutes les routes des § 2–4 (compte/appareil) renvoient, en cas d'échec, l'enveloppe suivante
(en français par défaut, en anglais si `Accept-Language` commence par `en`) :

```json
{
  "error": {
    "message": "Message dans la langue négociée",
    "message_fr": "Message français",
    "message_en": "English message",
    "type": "authentication_error",
    "param": null,
    "code": "api_key_revoked",
    "recharge_url": "https://nexora-ai.ca/fr/compte/facturation#ajouter-des-fonds"
  },
  "code": "api_key_revoked",
  "message_fr": "Message français",
  "message_en": "English message",
  "recharge_url": "https://nexora-ai.ca/fr/compte/facturation#ajouter-des-fonds",
  "topup_url": "https://nexora-ai.ca/fr/compte/facturation#ajouter-des-fonds"
}
```

- `type` selon le statut : `401 → authentication_error`, `402 → billing_error`,
  `403 → permission_error`, `404 → not_found_error`, `429 → rate_limit_error`,
  `≥ 500 → api_error`, sinon `invalid_request_error`.
- `recharge_url` (et son alias `topup_url`) n'est joint qu'en `402`, avec l'ancre
  `#ajouter-des-fonds` et la langue négociée (`/fr/compte/facturation` ou `/en/account/billing`).
- `401` joint `WWW-Authenticate: Bearer realm="nexora"` ; `429` joint `Retry-After: 60`.
- Méthode non permise → `405 method_not_allowed` avec en-tête `Allow`.

Codes contractuels (union OIDC + compte + passerelle ; `http` = statut canonique) :

| Code | HTTP | Sens fr-CA | Rejouable |
|---|---|---|---|
| `invalid_api_key`, `invalid_key`, `missing_api_key`, `unauthenticated`, `invalid_token` | 401 | Jeton ou clé absent/invalide | Non |
| `api_key_revoked` | 401 | Clé révoquée (y compris après grâce ou révocation) | Non — nouvelle clé requise |
| `api_key_expired` | 401 | Clé expirée | Non — rotation requise |
| `invalid_client` | 401 | `client_id` inconnu | Non |
| `invalid_grant` | 400 | Code inconnu, déjà utilisé, expiré ou discordant | Non |
| `pkce_mismatch` | 400 | Échec PKCE | Non |
| `invalid_request`, `invalid_parameter` | 400/422 | Requête ou paramètre invalide | Non |
| `unsupported_grant_type` | 400 | `grant_type` ≠ `authorization_code` | Non |
| `invalid_device` | 400 | Appareil invalide | Non |
| `authorization_pending`, `expired_token` | 428/400 | Flux code d'appareil en attente / expiré | Oui (sondage) / Non |
| `access_denied`, `invalid_origin`, `forbidden`, `cross_device_forbidden`, `insufficient_scope`, `scope_denied`, `webpilot_not_permitted`, `privacy_blocked` | 403 | Refus d'accès, d'origine ou de portée | Non |
| `insufficient_quota`, `insufficient_balance`, `account_blocked`, `api_key_spend_cap_reached` | 402 | Facturation : solde vide, compte bloqué ou plafond atteint (+ `recharge_url`) | Non — recharger |
| `grant_not_found`, `model_not_found`, `not_found` | 404 | Ressource introuvable | Non |
| `method_not_allowed` | 405 | Méthode non permise (+ `Allow`) | Non |
| `payload_too_large` | 413 | Corps trop volumineux | Non |
| `rate_limit_exceeded`, `rate_limited` | 429 | Limite dépassée (+ `Retry-After`) | Oui après délai |
| `internal_error`, `upstream_error`, `gateway_unavailable`, `privacy_unavailable`, `upstream_timeout` | 500/502/503/504 | Erreur interne ou d'amont | Oui selon cas |

---

## 4) Solde, consommation et passerelle

La clé d'appareil est acceptée par la passerelle **exactement comme une clé `nxk_`** :
même grand livre, même débit de crédits, même `402` à solde vide, révocation à effet immédiat.

### 4.1 Solde — `GET /v1/account/balance` et `GET /v1/account/credit-balance`

Routes strictement équivalentes ; auth OIDC, session ou clé `nxk_…` de l'organisation.

- **Réponse `200`** :

```json
{
  "organization_id": "org_00000000-0000-4000-8000-000000000000",
  "currency": "CAD",
  "balance_micros": 4250000,
  "balance_cad": 4.25,
  "total_balance_micros": 5000000,
  "reserved_micros": 750000,
  "can_use_models": true,
  "recharge_url": "https://nexora-ai.ca/fr/compte/facturation#ajouter-des-fonds"
}
```

- `balance_micros` = disponible (`total − réservé`), `balance_cad` = division par 1 000 000,
  `can_use_models` = `disponible > 0`.
- **Solde débiteur** (`total < 0`) → **`402 account_blocked`** (« Le compte de facturation est
  bloqué (solde débiteur)… » / « The billing account is blocked… ») avec `recharge_url` dans la langue négociée.

### 4.2 Compatibilité — `GET /api/code/credits`

Route historique du site, conservée pour les clients existants (même authentification).
Forme réelle :

```json
{
  "credits": { "subscription": 120, "refill": 305, "total": 425 },
  "can_use_models": true,
  "plan_code": "exemple",
  "organization_name": "Exemple inc.",
  "recharge_url": "https://nexora-ai.ca/fr/compte/facturation"
}
```

- **Équivalence : 1 crédit = 1 cent CAD = 10 000 micro-CAD** (`availableMicro = total × 10 000`).
- Forme plate `{ "balance_cad": …, "spend_cap_cad": …, "spent_cad": … }` acceptée en lecture
  pour compatibilité (convertie en micro-CAD arrondis).
- `recharge_url` vaut par défaut `…/fr/compte/facturation` (ou `/en/…` en anglais) si absente.

### 4.3 Consommation — `GET /v1/account/usage`

- **Requête :** `GET /v1/account/usage?from=2026-11-01T00:00:00Z&to=2026-11-12T00:00:00Z&limit=100`
  - `from`, `to` : ISO-8601 facultatifs (`from < to`, sinon `400 invalid_request`) ;
  - `limit` : entier ≥ 1, défaut `100`, plafond `500`, sinon `400 invalid_request`.
- **Réponse `200`** :

```json
{
  "object": "list",
  "events": [
    {
      "id": "evt_00000000-0000-4000-8000-000000000000",
      "request_id": "req_00000000",
      "ts": "2026-11-12T12:00:00.000Z",
      "poste": "turn",
      "model": "nexora/helix",
      "endpoint": "chat.completions",
      "input_tokens": 512,
      "output_tokens": 128,
      "cache_read_tokens": 0,
      "reasoning_tokens": 0,
      "cost_micros": 1250,
      "cost_cad": 0.00125
    }
  ],
  "data": []
}
```

(`data` reprend `events`.) Tri : plus récent d'abord (`createdAt`, puis `id`).
`poste` dérivé du point d'appel : `webpilot.*` → `webpilot`, `embeddings` → `embedding`,
`rerank` → `rerank`, sinon `turn`. L'alias historique `GET /api/account/activity`
(et son export `GET /api/account/activity/export` en CSV à 18 colonnes : `created_at`,
`request_id`, `model`, `endpoint`, `api_key_name`, `api_key_prefix`, `status`, `http_status`,
`error_code`, `stream`, `prompt_tokens`, `completion_tokens`, `cached_tokens`,
`reasoning_tokens`, `cost_cad`, `value_cad`, `billed`, `latency_ms`) reste lisible
avec les mêmes identifiants.

### 4.4 Flux code d'appareil (secours) — `/api/code/device/*` et `/api/code/credits`

Secours quand le navigateur ou la boucle locale est indisponible. Le flux OIDC PKCE (§ 2)
reste prioritaire.

| Route | Rôle |
|---|---|
| `POST /api/code/device/start` | Ouvre une demande d'appareil (retourne un code utilisateur et un identifiant de sondage) |
| `POST /api/code/device/approve` | Approbation côté compte connecté (dans le navigateur) |
| `GET /api/code/device/poll` (ou `POST` selon déploiement) | Sondage : `428 authorization_pending` (rejouable) jusqu'à approbation, `400 expired_token` si expiré |
| `GET /api/code/credits` | Solde au format § 4.2, consultable pendant ou après le flux |

Erreurs : `authorization_pending` (`428`, rejouable), `expired_token` (`400`),
`invalid_device` (`400`), `access_denied` (`403` si refus explicite).

### 4.5 Catalogue et postes de coût

Référence passerelle (prix de vente en micro-CAD, chaînes entières pour `BigInt`) :

| Modèle | Nature | Contexte | `sellInput` / `sellOutput` / `sellCache` (micro-CAD) |
|---|---|---|---|
| `nexora/helix` | conversation, rapide | 131 072 / sortie max 16 384 | 250 000 / 750 000 / 62 500 |
| `nexora/quanta` | conversation, équilibré | 262 144 / sortie max 32 768 | 1 000 000 / 4 000 000 / 250 000 |
| `nexora/quantum` | conversation, approfondi | 262 144 / sortie max 65 536 | 2 500 000 / 10 000 000 / 625 000 |
| `nexora/embed-1` | plongements lexicaux | 32 768 | 50 000 / 0 / — |
| `nexora/rerank-1` | reclassement | 32 768 | 80 000 / 0 / — |

Postes (`x-nexora-poste`, champ `poste`) : `turn`, `subagent`, `compaction`, `amd`, `rag`,
`webpilot`, `autocomplete` (le poste `embedding`/`rerank` de l'usage est rattaché à `rag`
dans les synthèses). Chaque appel débite le grand livre de l'organisation au coût catalogue ;
`cost_cad` = `cost_micros / 1 000 000` (6 décimales exactes).

### 4.6 Passerelle `/v1/*` — portées et erreurs

Routes publiques (auth `Bearer nxk_…`, y compris clés d'appareil) :

| Route | Rôle | Portée requise |
|---|---|---|
| `GET /v1/models` | Catalogue public (`PublicModel`) | `models` (lecture; sans clé selon politique) |
| `POST /v1/chat/completions` | Conversation compatible OpenAI (avec ou sans flux) | `models` |
| `POST /v1/embeddings` | Plongements lexicaux | `models` |
| `POST /v1/rerank` | Reclassement | `models` |
| `POST /v1/webpilot/search` | Recherche WebPilot | `webpilot` + opération `search` |
| `POST /v1/webpilot/scrape` | Extraction de page WebPilot | `webpilot` + opération `scrape` |
| `POST /v1/webpilot/extract` | Extraction structurée WebPilot | `webpilot` + opération `extract` |

En-têtes de réponse : `x-nexora-request-id` (identifiant unique), `x-nexora-cost-micro`
(coût débité en micro-CAD), `x-nexora-poste` (poste de coût).

Comportement de facturation :

- Débit **dans le même grand livre** que les clés manuelles, au coût catalogue réel ;
- **Solde vide ou plafond atteint** → `402` (`insufficient_quota`, `insufficient_balance`,
  `account_blocked`, `api_key_spend_cap_reached`) avec `recharge_url` bilingue ;
- **Clé révoquée ou en grâce échue** → `401 api_key_revoked` immédiat ;
- **Portée manquante** (p. ex. WebPilot non autorisé) → `403` (`scope_denied`,
  `webpilot_not_permitted`, `privacy_blocked`).

Autres codes passerelle : `404 model_not_found` / `not_found`, `413 payload_too_large`,
`422 invalid_parameter`, `429 rate_limit_exceeded` / `rate_limited` (+ `Retry-After`, rejouable),
`500 internal_error`, `502 upstream_error`, `503 gateway_unavailable` / `privacy_unavailable`,
`504 upstream_timeout` (rejoubles selon le cas). Voir la table complète au § 3.6.

Exemple d'appel avec une clé d'appareil (clé fictive) :

```http
POST /v1/chat/completions HTTP/1.1
Host: nexora-ai.ca
Authorization: Bearer nxk_EXEMPLE
Content-Type: application/json

{ "model": "nexora/helix", "messages": [{ "role": "user", "content": "Bonjour" }] }
```

```http
HTTP/1.1 200 OK
x-nexora-request-id: req_EXEMPLE
x-nexora-cost-micro: 1250
x-nexora-poste: turn
```

---

## Annexe A — Parcours LifeCode de bout en bout (référence)

1. Découverte : `GET /.well-known/openid-configuration` → mémorise `authorization_endpoint` et `token_endpoint`.
2. PKCE local : tire `code_verifier` (43–128 car.), calcule `code_challenge = base64url(SHA-256(verifier))`, ouvre
   `GET /oauth/authorize?…&client_id=lifecode-desktop&redirect_uri=http://127.0.0.1:PORT/callback&scope=openid%20profile%20email%20device:grant&code_challenge=…&code_challenge_method=S256&state=…`
   (ou l'alias `/v1/account/authorize`).
3. Si `302` vers `/fr/compte/connexion?next=…`, laisse l'utilisateur se connecter ; si `302` vers
   `/fr/compte/securite`, fais activer la 2FA (personnel).
4. Récupère `code=nxc_…` sur `/callback*`, puis `POST /oauth/token` (ou `/v1/account/token`) en
   `x-www-form-urlencoded` avec le même `redirect_uri`, `client_id` et `code_verifier`.
5. Avec `Bearer nxo_…`, appelle `POST /v1/account/device-grants` (`device_id`, `device_label`, …),
   **stocke aussitôt** la `key=nxk_…` retournée (affichée une seule fois).
6. Appelle la passerelle en `Bearer nxk_…` (p. ex. `POST /v1/chat/completions`), contrôle
   `x-nexora-cost-micro`, puis vérifie le débit via `GET /v1/account/balance`
   (ou `/v1/account/credit-balance`) et `GET /v1/account/usage`.
7. Rotation de préférence avant expiration : `POST …/rotate` (`grace_seconds` dans `0..300`, défaut `60`) ;
   révocation au retrait de l'appareil : `POST …/revoke` ou `DELETE …/[id]` ; l'ancienne clé doit
   ensuite être refusée en `401 api_key_revoked`.

## Annexe B — Variantes et compatibilité

- Préfixes `/v1/device-grants` ↔ `/v1/account/device-grants` : équivalents partout.
- Paires OIDC `/oauth/authorize` ↔ `/v1/account/authorize`, `/oauth/token` ↔ `/v1/account/token` : équivalentes.
- Alias historiques du site (`/api/auth/oauth2/*`, `/api/code/credits`, `/api/account/activity*`) :
  maintenus en lecture ; les intégrations neuves utilisent les routes `/v1/*` et `/oauth/*` du présent contrat.
- Champs serpent (`grant_id`, `device_id`, `spend_cap_cad`, `expires_at`, …) et chameau
  (`grantId`, `deviceId`, `spendCapCad`, `expiresAt`, …) : acceptés en entrée et redoublés en sortie
  pour les objets de grant ; les objets solde et usage privilégient le serpent.
- `recharge_url` et `topup_url` sont synonymes en `402`.

*Fin du contrat — version 2.0.0. En cas de divergence entre ce document et le comportement du site,
le site fait foi pour la sécurité (refus conservateur), et toute divergence doit être signalée
aux deux équipes avant usage en production.*
