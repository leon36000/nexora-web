# WorkStudio intégré au site : connexion unique et accès modèle par utilisateur

**Principe** : les utilisateurs du site ouvrent WorkStudio avec le MÊME compte (connexion unique), chacun avec SA configuration. Une seule instance WorkStudio, multi-utilisateurs, pas de VPS par client. Le site est le **fournisseur d'identité OpenID Connect** de WorkStudio et lui remet, pour chaque utilisateur, la clé de modèle de SON organisation : les jetons consommés sont facturés à son portefeuille ; l'organisation « maison » de l'administrateur reste gratuite (voir `docs/facturation-workstudio.md`).

```
Navigateur ──► WorkStudio ──(1) redirige──► Site /api/auth/oauth2/authorize   (PKCE, portées)
                                              │ session du site ? sinon page de connexion du site (+ 2FA)
Navigateur ◄── WorkStudio /api/auth/oauth2/callback/nexora-oidc?code=…  ◄──(2)── code à usage unique
WorkStudio ──(3) serveur à serveur──► Site /api/auth/oauth2/token      (code + code_verifier + secret du client)
WorkStudio ──(4)──► Site /api/auth/oauth2/userinfo                     (sub, name, email, email_verified, organization_id)
WorkStudio ──(5)──► Site /api/oauth/workstudio-access   Bearer <jeton d'accès>  →  { url, model, key }
```

**Panneau client** : la page `/compte/workstudio` montre le branchement sur un modèle (modèle par défaut, clé automatique « WorkStudio (automatique) » avec préfixe et dernier usage, solde du portefeuille ou « accès gratuit », lien vers l'activité de cette clé) et l'aperçu `/compte` résume l'état (« Branché », « Pas encore ouvert », « Abonnement requis »…). Un client ordinaire ouvre WorkStudio avec un abonnement actif ; l'organisation « maison » (administrateur, mode `house`) l'ouvre sans abonnement. La clé se crée à la première ouverture (`/api/oauth/workstudio-access`).

## 1. Variables d'environnement

### Côté site (web)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `WORKSTUDIO_PUBLIC_URL` | pour le bouton et pour le SSO | Adresse publique de WorkStudio (https ; `http://localhost:…` seulement hors production). Le bouton « Ouvrir WorkStudio » de l'espace client y mène (elle l'emporte sur l'adresse de l'instance déjà enregistrée dans l'administration, réglage de la bulle) ; l'adresse de retour OIDC en est dérivée : `${WORKSTUDIO_PUBLIC_URL}/api/auth/oauth2/callback/nexora-oidc` |
| `WORKSTUDIO_OIDC_CLIENT_ID` | pour le SSO | Identifiant du client WorkStudio : 8 à 128 caractères parmi `A-Z a-z 0-9 . _ -` |
| `WORKSTUDIO_OIDC_CLIENT_SECRET` | pour le SSO | Secret du client : 32 à 256 caractères, sans espace (`openssl rand -base64 48 \| tr -d '/+=' \| head -c 48`). Secret Docker ou gestionnaire de l'hébergeur ; **jamais dans Git**. En base, seule son empreinte (SHA-256) est rangée |
| `WORKSTUDIO_OIDC_TOKEN_AUTH` | non | `post` (défaut : secret dans le corps de la requête, ce que fait Better Auth par défaut) ou `basic` (en-tête `Authorization: Basic`). Le client n'accepte QU'UNE méthode : elle doit être celle de WorkStudio |
| `WORKSTUDIO_GATEWAY_URL` | pour l'accès modèle | Passerelle `/v1` que WorkStudio appellera (se termine par `/v1`, https ; http sur la boucle locale hors production). Absente : la route d'accès modèle répond 503 |
| `WORKSTUDIO_REQUIRE_CREDITS` | non | `true` par défaut : tout ce qui appelle un modèle consomme des crédits, donc sans solde de crédits supérieur à zéro (abonnement OU recharge) ni accès « maison », la route d'accès modèle répond `403 credits_required` (message en français, `recharge_url`, `plans_url`) et aucune clé n'est créée. `false` coupe l'exigence (essais, démonstrations). L'ancien nom `WORKSTUDIO_REQUIRE_SUBSCRIPTION=false` est encore lu. La règle est `canUseModels` de `web/src/server/billing/entitlements.ts` (`docs/credits-et-offres.md`) |
| `WORKSTUDIO_DEFAULT_MODEL` | non | Modèle par défaut rendu à WorkStudio (identifiant public du catalogue). Défaut : `nexora/deepseek-v4.1-flash-1017` |

Déjà requises ailleurs : `BETTER_AUTH_SECRET` (signe aussi les liens d'autorisation et chiffre la clé privée de signature des jetons d'identité), `SITE_URL` (l'émetteur est `${SITE_URL}/api/auth`), `NEXORA_VAULT_MASTER_KEY` (les clés de modèle rangées par `ensureModelAccess`).

**Échec fermé** : si `WORKSTUDIO_OIDC_CLIENT_ID` et `WORKSTUDIO_OIDC_CLIENT_SECRET` sont absents, le fournisseur n'est pas monté (`/api/auth/oauth2/*`, `/api/auth/jwks` et la découverte répondent 404, la route d'accès modèle aussi). S'ils sont incomplets ou invalides, il reste inactif et le site écrit UN avertissement qui nomme la variable en cause (jamais sa valeur).

### Côté WorkStudio

`NEXORA_OIDC_ISSUER=${SITE_URL}/api/auth`, `NEXORA_OIDC_CLIENT_ID` et `NEXORA_OIDC_CLIENT_SECRET` (les mêmes valeurs que ci-dessus). Découverte : `<émetteur>/.well-known/openid-configuration`. **WorkStudio doit demander les quatre portées** `openid profile email workstudio:model` (la dernière ouvre la route d'accès modèle ; sans elle : 403 `insufficient_scope`).

## 2. Ce que le site fournit à WorkStudio

- **Découverte** `GET /api/auth/.well-known/openid-configuration` ; **clés publiques** `GET /api/auth/jwks` (RS256, les jetons d'identité sont signés avec).
- **Un seul client** « Nexora WorkStudio », de première partie : consentement sauté, **PKCE (S256) obligatoire**, flux « code » seulement, adresse de retour unique et exacte. Aucun jeton de rafraîchissement, aucune inscription dynamique de client.
- **Jetons courts** : jeton d'accès et jeton d'identité 10 minutes ; code d'autorisation 5 minutes (le paquet donne la même durée au lien signé de connexion : il couvre donc la connexion et la double authentification). Un jeton d'accès cesse de servir quand la session du site est fermée (ou supprimée) ou que le client est désactivé.
- **`userinfo`** (`GET /api/auth/oauth2/userinfo`, jeton Bearer) : `sub` (identifiant de l'utilisateur), `name`, `email`, `email_verified`, `organization_id` (organisation de travail de l'utilisateur), et `given_name` / `family_name` (déduits du nom, ajoutés par le paquet avec la portée `profile`).
- **Accès modèle** `GET /api/oauth/workstudio-access`, en-tête `Authorization: Bearer <jeton d'accès>` → `200 { "url": …, "model": …, "key": … }`, soit `NEXORA_UPSTREAM_URL`, `NEXORA_UPSTREAM_MODEL`, `NEXORA_UPSTREAM_KEY` de l'organisation de l'utilisateur du jeton. `Cache-Control: no-store`.
  - Le site retrouve l'organisation de l'utilisateur, appelle `ensureModelAccess` (crée la clé de la passerelle de l'organisation, la range chiffrée au Coffre, la relit ensuite ; une clé révoquée est remplacée ; deux appels simultanés ne créent qu'une clé) et rend les trois réglages. Les jetons consommés avec cette clé apparaissent dans l'Activité du client.
  - Le jeton est vérifié par l'introspection du paquet au nom du client WorkStudio (actif, non expiré, non révoqué, session du site vivante) puis le client et la portée sont revérifiés : le jeton d'un autre client ne sert pas.
  - Erreurs : `401` jeton absent, inconnu, expiré ou d'un autre client (`WWW-Authenticate: Bearer`) · `403` portée manquante (`insufficient_scope`), courriel non vérifié, compte du personnel sans double authentification (`two_factor_required`), plus de crédits (`credits_required`) · `404` fournisseur inactif · `405` autre méthode que GET · `429` trop d'appels (30 par minute et par utilisateur, 600 par minute et par adresse) · `503` passerelle non configurée ou panne.
  - **Le journal ne reçoit jamais la clé, le jeton ni le secret** : seulement l'utilisateur, l'organisation et si la clé vient d'être créée.
  - À appeler à la connexion de l'utilisateur (le jeton dure 10 minutes), pas en boucle.

## 3. Sécurité

- **Liste blanche des routes OAuth** : `authorize`, `token`, `userinfo`, `introspect`, `revoke`. Tout le reste du plugin (création et gestion de clients, ressources, consentements, `GET /token` du plugin `jwt`) répond 404. Par défaut le paquet laisse tout utilisateur connecté créer ses propres clients OAuth : ici c'est refusé deux fois (liste blanche et `clientPrivileges`/`resourcePrivileges` qui refusent tout).
- **Secret** : empreinte SHA-256 en base, comparaison à temps constant. Changer `WORKSTUDIO_OIDC_CLIENT_SECRET` (ou l'identifiant) et redémarrer **annule l'ancien** : au premier appel OAuth, le site met à jour le client et **désactive tout autre client** ; les jetons de l'ancien cessent de servir. Rotation : nouvelle valeur côté site ET côté WorkStudio, puis redémarrer les deux.
- **Adresse de retour** : correspondance exacte (le paquet tolère autrement un autre port sur la boucle locale). Une adresse inconnue n'est jamais redirigée avec un code.
- **Double authentification du personnel** : un compte du personnel sans double authentification n'obtient aucun code (renvoyé vers `/compte/securite`) ni aucune clé de modèle, comme partout ailleurs sur le site. Les connexions suivent les règles du site : verrouillage après échecs, avertissement de connexion inhabituelle, courriel vérifié obligatoire.
- **Limites de débit** (Better Auth, en base) : `authorize` 60/min, `token`, `userinfo` et `introspect` 300/min par adresse (le serveur de WorkStudio est une seule adresse pour tous ses utilisateurs). Contrôle d'origine (CSRF) inchangé.
- **Données en base** : jetons d'accès et codes en empreinte ; clé privée de signature chiffrée avec `BETTER_AUTH_SECRET` (le perdre rend les jetons d'identité invérifiables : le sauvegarder comme la clé du Coffre). Les jetons d'accès sont supprimés avec leur session du site (clé étrangère `ON DELETE CASCADE`, écart voulu avec le paquet qui y met NULL).
- La déconnexion du site révoque les jetons d'accès mais **ne ferme pas la session de WorkStudio** (déconnexion unique par canal arrière non configurée).

## 4. Dépendance ajoutée

`@better-auth/oauth-provider` **1.7.14, version exacte** (pas de plage `^`), ajoutée à `web/package.json`. Le plugin `oidcProvider` du paquet `better-auth` n'existe plus depuis la 1.7 ; ce paquet en est le successeur officiel (licence MIT, dépôt `better-auth/better-auth`, publié par GitHub Actions, même attestation de provenance que `better-auth@1.7.14`). Dépendances : `jose` et `zod`, déjà au verrou via `better-auth`.

**Publié le 2026-10-26 (3 jours avant l'ajout, le 2026-10-29) : la règle des 14 jours d'ancienneté a été levée pour ce seul paquet, sur décision documentée du coordinateur**, au motif que `better-auth@1.7.14` (déjà installé) a été publié la même minute, par la même chaîne, avec la même provenance. À revérifier à chaque montée de version (le paquet et `better-auth` doivent rester sur la même version).

## 5. Ce que le paquet ne permet pas (contournements assumés)

1. **`skip_consent` ne peut pas être posé par l'API** (interdit à l'inscription dynamique, y compris par l'administration) : le client de confiance est écrit directement en base (`ensureWorkstudioClient`), depuis l'environnement, au premier appel OAuth du processus.
2. **Aucun client déclaré par la configuration** : tout client vit en base ; d'où la désactivation des autres clients au démarrage.
3. **Une seule durée pour le code et le lien signé** (`codeExpiresIn`) : 5 minutes pour les deux.
4. **Une seule méthode d'authentification du client** (`post` ou `basic`), pas les deux : variable `WORKSTUDIO_OIDC_TOKEN_AUTH`.
5. **La portée `workstudio:model` n'est pas ajoutée d'office** : le client doit la demander. Elle ne demande aucun contournement côté site ; elle en demande un côté WorkStudio (une portée de plus dans sa configuration).
6. **Reprise de l'autorisation après la connexion** : faite le 29/10/2026. `oauthProviderClient()` est dans `web/src/lib/auth-client.ts` : quand la page de connexion est ouverte par le fournisseur (adresse signée `?client_id=…&sig=…`), la connexion (et la validation du deuxième facteur) joint cette adresse, le serveur reprend l'autorisation et répond `{ redirect: true, url }` ; le client quitte la page vers WorkStudio. Les formulaires n'envoient pas en plus l'utilisateur vers /compte (`web/src/lib/oauth-resume.ts`). Vérifié en vrai avec un WorkStudio à part entière (voir l'essai de bout en bout dans le registre).
7. **Découverte RFC 8414 à la racine** (`/.well-known/oauth-authorization-server`) : non servie ; la découverte OpenID Connect sous l'émetteur suffit à WorkStudio.

## 6. L'essayer en local

1. Générer un secret (jamais dans Git) et poser les variables dans `web/.env.local` (ignoré par Git) :
   ```
   WORKSTUDIO_OIDC_CLIENT_ID=workstudio-local
   WORKSTUDIO_OIDC_CLIENT_SECRET=<48 caractères aléatoires>
   WORKSTUDIO_PUBLIC_URL=http://localhost:3200
   WORKSTUDIO_GATEWAY_URL=http://localhost:3500/v1
   ```
2. `bun run db:migrate` (migration `0021_s12_sso_workstudio_oidc` : tables `jwks` et `oauth_*`), puis `bun run --cwd web dev` (site sur le port 3500).
3. Vérifier : `curl -s http://localhost:3500/api/auth/.well-known/openid-configuration` (émetteur `http://localhost:3500/api/auth`) et `…/api/auth/jwks`.
4. Dans WorkStudio : `NEXORA_OIDC_ISSUER=http://localhost:3500/api/auth`, `NEXORA_OIDC_CLIENT_ID`, `NEXORA_OIDC_CLIENT_SECRET`, et la portée `workstudio:model` en plus des trois autres. Se connecter au site (compte vérifié), puis le bouton de connexion Nexora de WorkStudio.
5. Sans WorkStudio, on joue le client à la main : ouvrir dans le navigateur (session du site ouverte) `http://localhost:3500/api/auth/oauth2/authorize?response_type=code&client_id=<id>&redirect_uri=<adresse de retour, encodée>&scope=openid%20profile%20email%20workstudio%3Amodel&state=x&nonce=y&code_challenge=<S256 du vérificateur>&code_challenge_method=S256`, relever `code` dans l'adresse de retour (la page de WorkStudio n'a pas besoin d'exister), puis `curl -X POST …/api/auth/oauth2/token` avec `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier` ; ensuite `curl -H "authorization: Bearer <access_token>" …/api/auth/oauth2/userinfo` et `…/api/oauth/workstudio-access`.
6. En développement seulement, `WORKSTUDIO_PUBLIC_URL` peut être en `http://localhost:<port>` (et `WORKSTUDIO_GATEWAY_URL` aussi) ; en production, https exigé.

**Tests** (Node, base d'essai) : `cd web && npx --no-install vitest run src/server/auth/workstudio-oidc.test.ts src/server/auth/workstudio-oidc-config.test.ts src/server/auth/workstudio-access.test.ts src/server/auth/schema.test.ts src/server/gateway/provision.test.ts`. Ils jouent un client OIDC simulé sur le vrai gestionnaire de Better Auth : découverte, PKCE, jeton, jeton d'identité vérifié avec les clés publiées, `userinfo`, puis les refus (mauvais secret, mauvaise adresse de retour, code rejoué, PKCE, portées, session fermée, jeton d'un autre client), le personnel, la rotation, l'isolation des organisations et l'absence de la clé dans les journaux.

## 7. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `/api/auth/.well-known/openid-configuration` répond 404 | Fournisseur inactif (variables absentes ou invalides) | Regarder l'avertissement « fournisseur OIDC de WorkStudio inactif » au démarrage : il nomme la variable |
| WorkStudio : `invalid_client` à l'échange du code | Mauvais secret, ou méthode d'authentification différente de `WORKSTUDIO_OIDC_TOKEN_AUTH` | Même secret des deux côtés ; `post` (défaut) ou `basic` |
| `invalid_redirect` / retour vers la page d'erreur du site | `WORKSTUDIO_PUBLIC_URL` ne correspond pas exactement à l'adresse publique de WorkStudio (schéma, port, préfixe) | Corriger la variable et redémarrer |
| `invalid_scope` | WorkStudio demande une portée hors `openid profile email workstudio:model` (`offline_access` par exemple) | Retirer la portée |
| `invalid_request` « pkce is required » | WorkStudio n'envoie pas `code_challenge` (S256) | Activer PKCE côté WorkStudio |
| `/api/oauth/workstudio-access` : 403 `insufficient_scope` | WorkStudio n'a pas demandé `workstudio:model` | Ajouter la portée |
| … : 403 `two_factor_required` | Compte du personnel sans double authentification | Activer la double authentification (`/compte/securite`) |
| … : 503 | `WORKSTUDIO_GATEWAY_URL` absent ou mal formé (doit se terminer par `/v1`, en https) | Corriger la variable |
| Les jetons d'identité ne se vérifient plus après une restauration | `BETTER_AUTH_SECRET` différent : la clé privée de signature ne se déchiffre plus | Restaurer le secret (ou vider `jwks` : de nouvelles clés se créent et les sessions OIDC en cours doivent se reconnecter) |
