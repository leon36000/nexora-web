# Plan d'exécution — Équipe SITE : Device Grants (`/v1/device-grants*`)

Date : 2026-11-12
Branche : `feat/device-grants-20261112`
Worktree : `/home/pc6/nexora-recherche/par/site-device-grants`

## 1. Objectif et périmètre
Implémenter dans `root/nexora-web` le flux complet de **device grants** (clés API `nxk_…` courtes durées par appareil, liées au compte Nexora et facturées sur le grand livre via la passerelle `/v1/*`), permettant à LifeCode (et Creative Studio / WorkStudio / WebPilot) de connecter un appareil en OIDC + PKCE sans jamais copier-coller de clé longue durée.

## 2. Livrables prévus
1. **Migration SQL `0035_device_grants.sql` + schéma Drizzle (`packages/db`)** :
   - Table `gateway_device_grants` (id, account_id, api_key_id, previous_api_key_id, grace_expires_at, device_id, device_label, product, scopes_json, issued_at, expires_at, rotate_after, revoked_at, created_at, updated_at) avec contraintes d'intégrité et index partiel d'unicité ou recherche rapide sur les grants actifs `(account_id, device_id, product)`.
   - Table ou support des jetons d'accès OIDC `device:grant` (ou réutilisation propre de `workstudio-oidc` étendu aux clients natifs loopback `lifecode-desktop` avec PKCE S256 RFC 7636).
2. **Authentification OIDC + PKCE pour clients natifs (`lifecode-desktop`)** :
   - Support de `client_id=lifecode-desktop` avec `redirect_uri` loopback (`http://127.0.0.1:<port>/callback`, `http://localhost:<port>/callback`) et `scope` contenant `device:grant` sur `/oauth/authorize` et `/oauth/token`.
   - Jeton d'accès OIDC signé / haché courte durée portant `sub` (userId), `account_id` et `scope` (`device:grant`), accepté en `Authorization: Bearer` sur `/v1/device-grants*` (en plus de la session Better Auth du compte et des clés d'appareil `nxk_…` selon la route).
3. **Service métier `web/src/server/gateway/device-grants.ts`** :
   - Création de grant (`POST /v1/device-grants`) : révocation atomique de tout grant actif antérieur du même `(account_id, device_id, product)`, émission d'une clé passerelle `nxk_…` courte durée (TTL 7 jours par défaut, `rotate_after` à 6 jours), aucun secret stocké en clair (SHA-256 uniquement).
   - Rotation atomique (`POST /v1/device-grants/[id]/rotate` et `POST /v1/device-grants/rotate`) : émission d'une nouvelle clé `nxk_…`, maintien d'une fenêtre de grâce de 60 s sur l'ancienne clé pour ne couper aucun appel LLM en vol, révocation immédiate des clés plus anciennes.
   - Révocation (`POST /v1/device-grants/[id]/revoke` et `DELETE /v1/device-grants/[id]`) : révocation immédiate du grant et de sa clé (ainsi que toute clé en période de grâce), vérification stricte d'appartenance au `account_id` (404/403 si autre compte).
   - Liste et introspection (`GET /v1/device-grants` et `GET /v1/device-grants/me`) : liste des appareils du compte (sans jamais exposer le secret `nxk_…`), introspection de l'appareil courant.
4. **Intégration passerelle `/v1/*` (`keys.ts`, `auth.ts`, `errors.ts`)** :
   - Validation à chaque requête `/v1/*` que si la clé `nxk_…` est liée à un `device_grant`, le grant n'est ni révoqué (`grant_revoked` 401) ni expiré (`grant_expired` 401), que le modèle demandé figure dans `scopes.models` s'il est restreint (`model_out_of_scope` 403), et que le plafond journalier `daily_cap_micros` éventuel est respecté.
   - Enrichissement 402 `insufficient_balance` avec `recharge_url` pointant vers la page de facturation du compte.
5. **UI espace client (`/fr/compte/...` & `/en/account/...`)** :
   - Section « Appareils connectés / Connected devices » (dictionnaires `fr-CA` et `en-CA`, aucun texte en dur, WCAG 2.2 AA) permettant de visualiser les appareils liés (libellé, produit, dates, dernière utilisation, statut) et de les révoquer en un clic.
6. **Tests complets (TDD) & Vérifications** :
   - Tests unitaires et d'intégration DB/routes : création -> appel `/v1` facturé -> rotation -> ancienne clé refusée après grâce (ou immédiatement selon mode) / nouvelle acceptée -> révocation -> 401 immédiat -> isolation stricte entre comptes -> jamais de secret `nxk_…` hors création/rotation -> non-régression des clés manuelles `nxk_…`.
   - `biome check`, `typecheck`, `vitest`, `check:contrast`.
7. **Documentation du contrat HTTP** :
   - `docs/CONTRAT-DEVICE-GRANTS.md` + rapport final `RAPPORT-SITE-DEVICE-GRANTS.md`.
