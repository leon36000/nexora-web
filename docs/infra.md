# Infrastructure applicative (jalon S1)

Espaces de travail bun à la racine : `web/` (Next.js), `worker/`, `packages/db` (`@nexora/db`, Drizzle) et `packages/log` (`@nexora/log`, journal sans secret). Conception : `docs/superpowers/specs/2026-10-26-nexora-site-design.md` (§4, D2, D7, D13).

## Démarrer

```bash
bun install
scripts/init-dev-env.sh /chemin/vers/deploy/.env   # écrit .env et web/.env.local (ignorés par git), sans rien afficher
bun run db:migrate                                  # migrations sur la base « app » (DATABASE_URL)
bun run --cwd web dev -p 3500                       # site et API
bun run worker                                      # consommateur de la file de tâches
bun run check                                       # lint (Biome) + types (tsc) + tests (Vitest)
```

Variables lues par l'app : `DATABASE_URL`, `NEXORA_APP_ADMIN_TOKEN` (32 caractères au moins), `NEXORA_VAULT_MASTER_KEY` (32 octets en base64). La pile de développement (`deploy/compose.yml`) doit tourner : les tests créent des bases jetables `nexora_test_xxxx` sur le même serveur PostgreSQL et les suppriment ; la base `app` n'est jamais touchée par les tests.

## Base `app` et migrations

Schéma dans `packages/db/src/schema.ts`, migrations SQL versionnées dans `packages/db/drizzle/`. Pour changer le schéma : modifier `schema.ts`, `bun run db:generate -- --name <nom>`, relire le SQL, `bun run db:migrate`. Ne jamais éditer une migration déjà appliquée.

Tables de S1 : `jobs` (file), `vault_secrets` (coffre), `config_versions` (versions publiées figées, D3), `processed_events` (idempotence des webhooks, D7 : `recordEventOnce(db, fournisseur, idEvenement)` renvoie `true` au premier passage seulement). Les tables clients (Better Auth), le grand livre et la facturation sont arrivées avec S4 (section « Paiements » ci-dessous) ; les clés clientes et le catalogue de la passerelle sont arrivés avec S5 (section « Passerelle de modèles » ci-dessous).

## File de tâches et worker

- Mettre en file : `enqueue(db, { type, payload, idempotencyKey?, maxAttempts?, availableAt? })`. Avec une clé d'idempotence, un deuxième appel renvoie la première tâche.
- Le worker (`worker/`) réclame avec `SELECT … FOR UPDATE SKIP LOCKED` dans une transaction, seulement les types qui ont un gestionnaire. Enregistrer un gestionnaire : `registry.register("type", async (job, ctx) => { … })` (`worker/src/handlers.ts`).
- Échec : reprise après un délai exponentiel (base 5 s, plafond 1 h), état `dead` après `maxAttempts` essais. Une tâche « en cours » dont le worker est mort est reprise après le bail (5 min) ; les gestionnaires doivent donc être idempotents et durer moins que le bail.
- Journal : une ligne JSON par événement ; la charge (`payload`) n'est jamais journalisée, les messages d'erreur sont nettoyés (jetons Bearer, clés `sk-…`, mots de passe d'URL) avant d'être journalisés ou stockés. Un gestionnaire ne doit pas mettre de secret dans un message d'erreur.
- Arrêt propre sur SIGTERM/SIGINT : plus aucune réclamation, attente des tâches en cours (30 s au plus).
- Variables facultatives : `WORKER_CONCURRENCY` (4), `WORKER_POLL_MS` (1000).

## Coffre (D2)

Module `web/src/server/vault/`. Chaque secret est chiffré en AES-256-GCM par une clé de données aléatoire ; cette clé est chiffrée par la clé maîtresse `NEXORA_VAULT_MASTER_KEY` (version `NEXORA_VAULT_MASTER_KEY_VERSION`, 1 par défaut). La référence du secret est liée au chiffrement : une ligne copiée sous une autre référence est illisible. Une valeur n'est jamais relisible par l'API ; elle est remplaçable (POST sur la même référence) ou révocable (le matériel chiffré est alors effacé).

API d'administration, authentifiée par `Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN>` (comparaison en temps constant ; 503 si le jeton n'est pas configuré) :

| Appel | Corps | Réponse |
|---|---|---|
| `POST /api/admin/vault` | `{ "ref": "^[a-z0-9._-]{3,64}$", "value": 1 à 4096 caractères, "kind": "llm_provider" \| "payment" \| "proxmox" \| "other" }` | 200 `{ ref, last4, kind, updatedAt }` ; 401 ; 422 |
| `GET /api/admin/vault` | | 200 `{ secrets: [{ ref, kind, last4, createdAt, updatedAt, revokedAt }] }` |
| `DELETE /api/admin/vault/{ref}` | | 200 `{ ref, revokedAt }` ; 404 si inconnue |

`last4` vaut `****` quand la valeur a moins de 12 caractères (4 caractères en clair révéleraient une trop grande part du secret). Pour un autre module serveur : `import { getSecret } from "@/server/vault"` ; `await getSecret("openrouter.main")` lève `VaultError` (`not_found`, `revoked`, `decrypt_failed`, `key_version`). Ne jamais journaliser, renvoyer au navigateur ni écrire dans Directus la valeur obtenue.

### Rotation de la clé maîtresse

La rotation ne réencapsule que les clés de données : les textes chiffrés ne changent pas et le service reste disponible.

1. Générer la nouvelle clé : `openssl rand -base64 32`.
2. Dans l'environnement de l'app, passer l'ancienne clé en `NEXORA_VAULT_MASTER_KEY_PREVIOUS` (avec `NEXORA_VAULT_MASTER_KEY_PREVIOUS_VERSION`, par exemple 1) ; mettre la nouvelle dans `NEXORA_VAULT_MASTER_KEY` avec `NEXORA_VAULT_MASTER_KEY_VERSION` incrémenté (2). Redémarrer le site : il lit les deux versions.
3. `bun run vault:rotate` : chaque secret actif est réencapsulé sous la version 2 (rejouable ; affiche le nombre de secrets traités).
4. Vérifier avec `GET /api/admin/vault` et une lecture réelle, puis retirer les variables `_PREVIOUS*` et redémarrer. Détruire l'ancienne clé seulement après une sauvegarde de la base restaurée avec succès sous la nouvelle clé.

Perdre la clé maîtresse rend tous les secrets illisibles : la sauvegarder séparément de la base.

## Santé

`GET /api/health` : `200 { status: "ok", service, checks: { database: "ok" }, time }` quand la base `app` répond (délai de 2 s), sinon `503` avec `database: "error"`. Aucun détail interne ni secret.

## Paiements et comptes clients (jalon S4)

Tout fonctionne en **mode test Stripe seulement** : une clé `sk_live_…` / `rk_live_…` est refusée par le code (`StripeModeError`) et un événement `livemode: true` reçu par le webhook est rejeté (400). Lever ces gardes est une décision de code à prendre avec l'accord explicite du fondateur. Développement et tests : **stripe-mock** (image officielle épinglée par empreinte, `127.0.0.1:12111`), aucune clé réelle.

```bash
docker compose -p nexorasite -f deploy/compose.yml --env-file <deploy/.env> up -d stripe-mock   # seul service touché
scripts/init-dev-env.sh <deploy/.env>   # ajoute BETTER_AUTH_SECRET (généré) et les variables STRIPE_* de stripe-mock
bun run db:migrate                       # 0001 (comptes, grand livre, facturation), 0002 (grand livre immuable)
bun run --cwd web vitest run src/server/billing/e2e   # démonstration de bout en bout (stripe-mock + Mailpit)
BASE_URL=http://localhost:3500 ACCOUNT_EMAIL=… ACCOUNT_PASSWORD=… bun web/scripts/verify-account.mjs   # axe, fr/en, 390/1440 px
```

### Variables

| Variable | Rôle |
|---|---|
| `BETTER_AUTH_SECRET` | 32 caractères au moins ; signe témoins et jetons (secret Docker en production). Obligatoire. |
| `SITE_URL` | Adresse publique (origine de confiance de Better Auth, liens des courriels, retours de Stripe). |
| `SMTP_URL`, `MAIL_FROM` | Courriels transactionnels ; défaut : Mailpit `smtp://127.0.0.1:1026`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_API_BASE_URL` | **Développement seulement** (ignorées si `NODE_ENV=production`) : clé factice pour stripe-mock, secret de signature local, adresse du simulateur (boucle locale uniquement). |
| `BILLING_CREDIT_EXPIRY_MONTHS` (12), `BILLING_MIN_PURCHASE_CENTS` (1000), `BILLING_MAX_PURCHASE_CENTS` (500000), `BILLING_GRACE_DAYS` (7) | Paramètres de facturation ; leur empreinte (`cfg_…`) est enregistrée sur chaque écriture du grand livre (D3). |
| `DIRECTUS_URL`, `DIRECTUS_READER_TOKEN` | Lecture des plans publiés (sans le jeton, la page d'abonnements affiche « offres indisponibles »). |

Secrets Stripe en production et pour les vraies clés de test : **dans le Coffre**, références `stripe.secret_key` et `stripe.webhook_secret` (type `payment`). `getSecret()` les lit ; elles ne sont jamais écrites dans Directus, le navigateur ou un journal.

### Authentification (Better Auth 1.7.14, épinglée)

`web/src/server/auth/` : courriel + mot de passe (10 caractères au moins), **courriel vérifié obligatoire** avant toute session, réinitialisation par lien (1 h, usage unique, ferme les autres sessions), sessions de 14 jours. Tables `users`, `sessions`, `accounts`, `verifications`, `organizations`, `members`, `invitations`, `auth_rate_limits` (un test compare ces tables Drizzle écrites à la main au schéma que Better Auth attend).

- **Une organisation par compte**, créée à l'inscription (nom = entreprise saisie, sinon « Organisation de <nom> »), propriétaire = créateur, compte de crédits ouvert. Rôles : `owner` et `member` seulement. Pas de création, de suppression ni d'invitation d'organisation par l'API (non livré : pas de page d'acceptation).
- **Gardes** (`guards.ts`) : `requireOrgMember(db, userId, orgId, rôles?)` et `resolveOrgContext` ; l'organisation d'une requête vient de la session confrontée aux adhésions, jamais d'un champ du formulaire. Un membre ne lit pas une autre organisation (testé sur l'API de Better Auth et sur nos routes) ; seul le propriétaire achète, souscrit ou ouvre le portail.
- **CSRF** : contrôle d'origine de Better Auth forcé actif (il s'éteint tout seul en environnement de test) + témoins HttpOnly/SameSite=Lax ; nos routes `/api/billing/*` appliquent `isSameOriginRequest` (Origin, sinon Referer, sinon `Sec-Fetch-Site`).
- **Débit** : connexion et inscription 5/min, réinitialisation 3/min, par adresse (table `auth_rate_limits`) ; routes de facturation 10/min et par utilisateur (`api_rate_limits`, une instruction SQL atomique). L'adresse vient de `x-forwarded-for` : **le proxy frontal doit l'écraser**.
- Courriels dans la langue d'inscription (fr/en), envoyés sans attendre le SMTP (le temps de réponse ne révèle pas l'existence d'un compte).

### Grand livre de crédits (D1/D7) — `packages/db/src/ledger.ts`

Montants en **micro-unités CAD entières** (`bigint`, 1 CAD = 1 000 000). `credit_entries` est **immuable** (déclencheur SQL : UPDATE, DELETE et TRUNCATE refusés) ; chaque écriture porte une variation du solde et une variation des montants réservés, la clé d'idempotence (unique, globale), la `config_version` et un instantané du solde après. `credit_accounts` (solde et réservé) est mis à jour **dans la même transaction**, sous verrou de ligne (`FOR UPDATE`) : les écritures d'une organisation sont sérialisées, la réservation est atomique. `deriveBalance` recalcule le solde depuis les écritures (contrôle de cohérence, testé).

| Opération | Effet |
|---|---|
| `credit` | + solde (achat, crédits d'abonnement, restitution d'un litige gagné), avec échéance facultative |
| `reserve` | + réservé si disponible (solde − réservé) ≥ montant ; sinon `insufficient_funds`, ou `blocked` si le solde est négatif ; rien n'est écrit |
| `settleReservation` | − solde du **coût réel** : une écriture `settle` jusqu'au montant réservé (− réservé du montant entier), puis une écriture `overage` pour le dépassement (même transaction, clé `overage:<réservation>`), qui peut rendre le solde négatif ; une seule fois. Réservation déjà libérée (libération périodique) : le coût réel est débité en entier par `overage`. Met aussi à jour `api_keys.spent_micro` (coût réel) |
| `releaseReservation` | − réservé ; idempotent ; `releaseStaleReservations` libère les réservations perdues |
| `debit` (`refund`, `dispute`) et `overage` | − solde ; **seuls chemins qui peuvent rendre le solde négatif** : `blocked: true`, plus aucune réservation, API bloquée (402 `account_blocked`) |
| `expireDue` | retire la part non consommée des lots échus (12 mois par défaut) ; la consommation est imputée aux lots dans l'ordre d'échéance ; n'entame jamais le réservé |

Garde-fous en base : contraintes de signe par type d'écriture et `credit_entries_no_overdraft_check` (une réservation ou une expiration ne peut jamais laisser un disponible négatif, même si le code était contourné). Tests : 20 réservations concurrentes (identiques et de montants inégaux), rejeux concurrents d'une même clé, précision au-delà de 2^53, mutation du verrou détectée.

### Stripe

- **Achat de crédits** (`POST /api/billing/checkout/credits`, champ `amount` en dollars) : Checkout en **paiement unique**, `automatic_tax` (Stripe Tax), adresse de facturation exigée, prix hors taxes, `tax_id_collection`, facture créée. Les crédits accordés valent le **montant avant taxes** ; les taxes sont à la charge du client en sus (D7, à faire confirmer par un comptable). **Abonnements** (`/api/billing/checkout/subscription`, champ `plan`) : session `subscription` distincte, prix Stripe du plan **publié** dans Directus. **Portail** (`/api/billing/portal`). Réponse : 303 vers Stripe (formulaire) ou JSON `{ url }` (`Accept: application/json`).
- **Webhook** `POST /api/stripe/webhook` : signature vérifiée sur le corps brut (tolérance 5 min), `processed_events` dans la **même transaction** que les effets (un échec annule tout, Stripe renvoie), rejeu → `duplicate` sans effet. Événements : `checkout.session.completed` et `…async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `invoice_payment.paid` (relie une facture à son paiement ; sans lui, un remboursement d'abonnement ne reprend pas les crédits inclus), `charge.refunded`, `charge.dispute.created` (et `.closed` : un litige gagné restitue les crédits), `customer.subscription.created|updated|deleted`. Les autres types sont ignorés (200) sans être enregistrés. Configurer l'endpoint Stripe avec exactement cette liste.
- **Remboursement** : débit proportionnel à la fraction du total payé (taxes comprises) remboursée, cumulatif et idempotent (plusieurs remboursements partiels), arrondi en faveur du client ; **litige** : débit des crédits contestés. Crédits dépensés → solde négatif → compte bloqué jusqu'à recharge.
- **Crédits d'abonnement** : à chaque `invoice.paid` de motif `subscription_create` ou `subscription_cycle` ET de montant encaissé `amount_paid` supérieur à 0 (une facture à 0 $ — solde client, rabais total — n'accorde rien : annuler puis se réabonner ne redonne pas de crédits gratuits), `includedCreditsCents` du plan, valables jusqu'à la fin de la période payée (clé `sub-credit:<facture>`). Chaque octroi est relié à sa facture (`subscription_credit_grants`) et, par `invoice_payment.paid`, à son PaymentIntent ou sa charge (`stripe_invoice_payments`) : `charge.refunded` et les litiges (`charge.dispute.created`, restitution si gagné) débitent les crédits inclus au prorata du montant payé, taxes comprises, comme pour un achat de crédits (le solde peut devenir négatif, D7). Un plan archivé dans Directus n'accorde plus de crédits : le garder publié tant qu'il a des abonnés.

#### Machine à états des abonnements (`billing/subscription-state.ts`)

```
incomplete ──invoice.paid──▶ active ──invoice.payment_failed──▶ past_due (grâce : BILLING_GRACE_DAYS, fixée à la 1re défaillance)
trialing ───(Stripe)───────▶ active                                │  ▲
active/past_due ──(Stripe : unpaid)──▶ unpaid ──invoice.paid──────┘  │ invoice.paid : grâce effacée
tout état ──customer.subscription.deleted──▶ canceled (terminal)      └──────────────────────────────
```

`canceled` et `incomplete_expired` sont terminaux (une facture tardive ne réactive rien) ; un événement plus ancien que le dernier appliqué (`created`) est ignoré ; `customer.subscription.updated` fait foi sur le statut. Niveau d'accès dérivé (`accessLevel`) : `full` (active, trialing), `grace` (past_due avant la fin de grâce), `suspended` (past_due après la grâce, unpaid, paused), `none`. C'est lui que le provisionnement VPS (S6) consultera pour suspendre un service.

#### « Publier vers Stripe »

`POST /api/admin/stripe/publish-plan` `{ "code": "workstudio-pro" }` avec `Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN>` : lit le plan **publié** dans Directus, crée ou met à jour le produit et le prix Stripe (prix hors taxes, clés d'idempotence dérivées du contenu ; un prix Stripe étant immuable, un changement de montant crée un nouveau prix et archive l'ancien) et renvoie `{ stripeProductId, stripePriceId, productCreated, priceCreated, previousPriceArchived, appliedAt }` à écrire dans la fiche. Un prix absent, nul ou non entier : 422, jamais 0 $. La collection Directus `subscription_plans` n'existe pas encore : diff proposé dans `docs/propositions/s4-cms-subscription-plans.diff` (24 collections au total, limite 25).

### Quand le fondateur aura donné ses clés de test

1. Dans le tableau de bord Stripe (mode test) : **Developers → API keys**, créer une clé restreinte ou copier `sk_test_…`, et **Developers → Webhooks** : créer l'endpoint `https://<site>/api/stripe/webhook` avec les 11 événements ci-dessus ; copier son secret `whsec_…`.
2. Coller les deux valeurs **dans le Coffre** de l'administration (`stripe.secret_key`, `stripe.webhook_secret`, type `payment`), jamais dans le chat ni dans un fichier.
3. Activer **Stripe Tax** et ajouter les **inscriptions fiscales** de Nexora (TPS et TVQ du Québec, avec les numéros d'inscription ; adresse d'origine et catégorie de produit « services numériques / logiciel-service ») ; renseigner l'identité de l'entreprise pour les factures. Faire valider par un comptable (TVQ à déclarer par Nexora ; lieu de fourniture des services électroniques).
4. Activer le **portail client** (Settings → Billing → Customer portal : factures, moyens de paiement, résiliation).
5. En local avec la CLI : `stripe listen --forward-to localhost:3500/api/stripe/webhook` (affiche un `whsec_…` local à mettre dans `STRIPE_WEBHOOK_SECRET`), puis `stripe trigger checkout.session.completed` ; vérification de bout en bout avec `stripe-mock` : voir `web/src/server/billing/e2e.test.ts`.

### Limites connues (non livrées)

Invitation de membres (API désactivée, pas de page) ; (planificateur d'expiration des crédits et de libération des réservations perdues : fait, voir « Tâches périodiques du grand livre ») ; remboursement d'une charge d'abonnement (n'agit pas sur les crédits accordés) ; un `charge.refunded` reçu avant `checkout.session.completed` est ignoré (journalisé) ; redirection de `/compte` sans session faite en flux (200 puis redirection) parce que `proxy.ts` n'est pas dans cette zone ; les paiements réels (interdits tant que le fondateur n'a pas donné son accord).

## Formulaire de contact et de diagnostic (S3)

Pages `/contact` et `/en/contact` (route de l'application, pas une page Directus) : deux étapes (besoin, secteur, mode de déploiement envisagé ; puis nom, courriel, entreprise, message facultatif, consentement marketing séparé et décoché). `?sujet=demonstration` ou `?sujet=etude-deploiement` présélectionne le besoin.

- **Flux.** `POST /api/contact` (JSON) : type de contenu, taille (16 Ko), limitation de débit (5 envois par client et par 10 min, en mémoire, clé = empreinte de l'adresse), champ piège (`website`), validation zod (`422` avec un code par champ ; la preuve Altcha reste utilisable), preuve ALTCHA (`403`), enregistrement unique. Le client est `x-forwarded-for` : derrière un proxy, le proxy doit réécrire cet en-tête.
- **Altcha auto-hébergé** (`altcha-lib` v2 côté serveur, widget `altcha` v3 côté navigateur, chargé seulement à l'étape 2) : `GET /api/contact/challenge` émet un défi PBKDF2 signé par HMAC (30 par minute et par client) ; la preuve est vérifiée sans service tiers et ne sert qu'une fois (registre dans `processed_events`, fournisseur `altcha`). Secret : `NEXORA_ALTCHA_SECRET` (32 caractères au moins) ou, à défaut, dérivé de `NEXORA_APP_ADMIN_TOKEN` ; sans l'un ni l'autre le formulaire reste fermé (`503`). Les lignes `altcha` de `processed_events` peuvent être purgées après 10 minutes.
- **Enregistrement.** Table `leads` (migration `0003_s3_leads`) ; empreinte SHA-256 du courriel et du contenu normalisé (le consentement marketing n'en fait pas partie) ; une demande identique dans les 24 h n'est ni réenregistrée ni renotifiée (`already_recorded`) ; verrou consultatif par empreinte (envois simultanés). La demande et la tâche `contact.notify` sont créées dans **la même transaction**. La charge de la tâche ne contient que l'identifiant.
- **Notification.** Le worker (`worker/src/contact-notify.ts`) envoie le courriel à `CONTACT_NOTIFY_TO` par SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD_FILE`, `SMTP_FROM` ; développement : Mailpit 127.0.0.1:1026) puis renseigne `leads.notified_at`. Échec d'envoi : la demande reste en base, la tâche est reprise (8 essais, délais exponentiels) ; au-delà, la tâche est `dead` et `SELECT … FROM leads WHERE notified_at IS NULL` retrouve les demandes à traiter (remettre la tâche en `pending`). Envoi au moins une fois (un doublon est possible si le worker meurt entre l'envoi et l'écriture de `notified_at`).
- **Vie privée.** Aucune adresse IP ni agent utilisateur n'est stocké ; aucun renseignement personnel dans les journaux ni dans la file.
- **Preuve.** `web/scripts/e2e-contact.ts` (navigateur réel, base, worker, Mailpit) : `docs/captures/s3/e2e-contact.md`.


## Passerelle de modèles (jalon S5)

Conception : §9 et D1, D2, D3, D4, D14 de `docs/superpowers/specs/2026-10-26-nexora-site-design.md`. Preuve de bout en bout : `docs/captures/s5/e2e-gateway.md`. Code : `web/src/server/gateway/`, `packages/db/src/schema-gateway.ts`, routes `web/src/app/v1/*`, `web/src/app/api/admin/catalog/*`, `web/src/app/api/account/api-keys/*`, pages `/modeles`, `/modeles/<id>`, `/docs/api`, section « Clés API » de `/compte`, module Directus `cms/extensions-src/nexora-cms/src/catalog/`.

```
client ──Bearer nxk_…──▶ /v1/* (Next.js) ──Bearer clé maîtresse──▶ LiteLLM (réseau interne) ──▶ fournisseur
                           │  empreinte SHA-256, révocation, expiration, modèles autorisés, RPM/TPM
                           │  réservation atomique (grand livre) → règlement au coût réel → libération du reste
                           └─ usage_events (métadonnées seulement)
```

### Variables

| Variable | Rôle |
|---|---|
| `LITELLM_MASTER_KEY` | Clé maîtresse de LiteLLM. **Variable serveur**, jamais exposée (secret Docker en production). Sans elle, `/v1` répond 503. Ajoutée par `scripts/init-dev-env.sh`. |
| `LITELLM_BASE_URL` | Adresse de LiteLLM (défaut `http://127.0.0.1:4400`). |
| `GATEWAY_DEFAULT_RPM` (120), `GATEWAY_DEFAULT_TPM` (400000) | Limites par minute d'une clé sans limite propre. |
| `GATEWAY_MAX_BODY_BYTES` (8000000), `GATEWAY_DEFAULT_MAX_OUTPUT_TOKENS` (4096) | Taille maximale d'un corps ; plafond de sortie d'un modèle sans plafond déclaré. |
| `GATEWAY_UPSTREAM_TIMEOUT_MS` (300000), `GATEWAY_STREAM_TIMEOUT_MS` (900000) | Délais d'un appel et d'un flux. |
| `SITE_URL` | Doit être l'origine réelle de service : elle sert aux URL des exemples, aux canoniques et au contrôle d'origine des routes de compte. |

### Tables (base `app`, migrations 0004 et 0005)

`model_providers` (type, adresses, **référence** du coffre, région, politique de données, priorité, état et dernier contrôle), `models` (identifiant public stable `espace/nom`, statut brouillon → approuvé → publié → retiré, résidence, visibilité, fin de vie), `model_prices` (par million de jetons : coût amont en micro-USD, prix de vente en micro-CAD, marge visée, **plancher de marge**, date d'effet ; lignes **immuables** par déclencheur SQL), `fx_rates` (USD → CAD ; utilisable seulement une fois approuvé ; seule l'approbation est permise après coup), `api_keys` (empreinte SHA-256 de 256 bits aléatoires ; préfixe affiché ; modèles autorisés, plafond de dépense, RPM/TPM, expiration, révocation), `usage_events` (idempotent par `request_id`, **ajout seulement**, jamais de contenu). `config_versions` reçoit un statut (`draft`, `approved`, `published`, `superseded`), `approved_at`, `applied_at/status/detail` ; son contenu et son hash sont figés par déclencheur. La collection `model_catalog` / `main` y porte le catalogue.

### Versions de catalogue (D3, D14)

Les tables de travail se modifient librement ; **seule une version publiée** sert à la facturation (`/v1`) et à la synchronisation. `POST /versions` photographie les modèles au statut « publié » avec leur prix en vigueur et le taux approuvé, calcule le hash (contenu + version parente) et renvoie l'aperçu des différences et les problèmes. Garde de publication (à l'approbation **et** à la publication, sur le contenu figé) : taux de change approuvé, prix présent, prix > 0 (sortie exigée pour un modèle de conversation), prix ≥ coût amont converti × (1 + plancher), fournisseur actif, clé présente et non révoquée dans le coffre. Un brouillon construit sur une version devenue obsolète est refusé (`stale_version`). Une seule version est publiée à la fois (verrou consultatif).

### API d'administration `/api/admin/catalog/*`

`Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN>` (temps constant, 503 si non configuré). Montants en micro-unités entières (chaînes dans les réponses).

| Appel | Rôle |
|---|---|
| `GET /` | Vue d'ensemble (fournisseurs, modèles avec prix actuel, taux, versions, version publiée et état « appliqué »). |
| `GET/POST /providers`, `GET/PATCH /providers/{id}` | Fournisseurs (types `openrouter`, `openai_compatible`, `litellm_upstream`, `vllm`, `ollama`). |
| `POST /providers/{id}/test` | « Tester le fournisseur » : liste des modèles avec la clé du coffre ; écrit état, date et résumé (jamais la réponse). |
| `GET/POST /models`, `GET/PATCH /models/{id}` | Modèles ; passer à `approved`/`published` exige un prix valide. |
| `GET/POST /models/{id}/prices` | Historique et ajout d'un prix (vente explicite, ou calculée avec `marginBps` au taux approuvé). |
| `GET/POST /fx-rates`, `POST /fx-rates/{id}/approve` | Taux de change. |
| `GET/POST /versions`, `GET /versions/{id}`, `POST /versions/{id}/approve`, `POST /versions/{id}/publish` | Brouillon → approuvé → publié. La publication revalide l'étiquette de cache `model-catalog` (pages publiques). |
| `POST /sync-litellm` | Pousse le catalogue **publié** dans LiteLLM : crédentials `nexora-prov-<code>` (clé tirée du coffre), puis modèles `nxm-<id>` (`/model/new` ou `/model/update`), retire ce que Nexora gère et qui n'est plus publié ; ne touche jamais aux modèles du fichier de configuration. Écrit « appliqué » + date (ou « échec » + code) sur la version. Rejouable. |

Codes d'erreur : 401, 404, 405, 409 (`conflict`, `invalid_transition`, `stale_version`, `no_published_catalog`), 422 (`invalid_request`, `publication_refused` avec `issues`), 502/503 (LiteLLM).

### Couche publique `/v1/*` (compatible OpenAI)

`GET /v1/models` (sans clé : catalogue public ; avec clé : ses modèles), `POST /v1/chat/completions` (JSON ou SSE), `POST /v1/embeddings`. Pour chaque appel : clé (empreinte, révocation, expiration, modèle autorisé ; un modèle `private` exige d'être listé dans `allowed_models`) → RPM puis TPM (table `api_rate_limits`) → estimation prudente (ASCII : 1 jeton par 3 octets ; texte non ASCII : 1 jeton par octet UTF-8 ; **1 600 jetons forfaitaires par image ou clip audio**, l'adresse ne compte pas) + `max_tokens` **borné et toujours transmis** × prix publié = coût maximal → **réservation** au grand livre, avec le plafond de la clé retenu dans la même transaction (402 `insufficient_quota` / `account_blocked`, avant tout appel) → LiteLLM avec la clé maîtresse → **règlement au coût réel** (`usage` de l'amont ; `stream_options.include_usage` forcé) **facturé en entier** : le reste de la réservation est libéré, et un dépassement est débité en plus (le solde peut devenir négatif, l'appel suivant répond 402 `account_blocked`) ; un avertissement sans contenu est journalisé quand le coût dépasse le double de la réservation → `usage_events` dans la même transaction. Seuls les paramètres OpenAI connus sont transmis (`api_base`, `api_key`, `metadata`, `mock_response`… sont ignorés). La réponse est nettoyée (`provider`, `usage.cost*` retirés ; `model` = identifiant public). En flux, le règlement a lieu **avant** l'envoi de `[DONE]` ; un client qui ferme la connexion coupe l'amont et paie ce qui a été livré (estimé : texte, raisonnement, arguments d'appels d'outils) et **au minimum l'invite estimée** dès que l'amont a répondu 200, même si rien n'a été reçu. Échec de l'amont avant le flux, ou erreur déclarée dans le flux avant toute livraison : réservation libérée, rien débité (événement `error`). En-têtes : `x-request-id`, `x-nexora-model`, `x-nexora-residency`, `x-nexora-catalog-version`, `x-nexora-cost-micro` (réponse complète), `x-ratelimit-*`, `Retry-After`. Aucun contenu n'est journalisé ni stocké (test : ni le prompt, ni la réponse, ni la clé client, ni la clé maîtresse, ni la clé du fournisseur dans les journaux et les événements). Le journal masque aussi `nxk_…` (`@nexora/log`).

### Espace client

`/compte` : section « Clés API » (création par `POST /api/account/api-keys`, valeur affichée **une seule fois** ; révocation par `DELETE /api/account/api-keys/{id}` ; usage par jour et par modèle sur 30 jours). **Propriétaire seulement** (une clé dépense les crédits) ; organisation tirée de la session ; contrôle d'origine ; 20 opérations par minute et par utilisateur. Crédit de TEST pour le développement : `grantTestCredit` (`web/src/server/gateway/dev-credit.ts`, refusé si `NODE_ENV=production`).

### Module Directus « Modèles » (D14)

Dans le bundle `nexora-cms` : endpoint `/nexora-catalog` (administrateurs Directus seulement ; liste fermée de méthodes et chemins relayés vers `/api/admin/catalog/*` avec `NEXORA_APP_ADMIN_TOKEN` ; rien n'est persisté, seul « méthode chemin : statut » est journalisé) et module « Modèles » (fournisseurs avec « coller la clé » → Coffre `llm_provider`, modèles et prix, taux de change, versions avec aperçu des différences, boutons Approuver / Publier / Synchroniser / Tester). Construction : `cms/scripts/stage-extensions.sh`. **Pour que le module apparaisse dans la barre de Directus**, `nexora-models` doit être ajouté à `module_bar` (comme `nexora-vault` dans `cms/scripts/apply.ts`) : non fait ici, par consigne.

### Limites connues (non livrées)

Un seul fournisseur par modèle (pas de bascule automatique selon la priorité) ; estimation d'entrée prudente mais sans tokenizer (si l'amont rapporte plus que le maximum réservé, le dépassement est facturé en entier) ; images et audio en entrée estimés au forfait, sans test contre un vrai fournisseur ; limites RPM/TPM par clé seulement (pas par organisation ni par adresse) ; rapprochement périodique de la dépense LiteLLM avec le grand livre (contrôle de dérive) non écrit ; pas de tableau de bord d'administration de l'usage global ; entrée « Modèles » du menu à ajouter dans la navigation Directus ; pages `/modeles`, `/docs/api` : si le CMS publie une page de même chemin, la route statique la masque.

**Tâches périodiques du grand livre** (worker, déclarées par le planificateur, idempotentes par occurrence) : `ledger.release-stale` toutes les 10 minutes (clé `ledger-release-stale:<tranche>`) libère les réservations ouvertes depuis plus de `max(30 min, GATEWAY_STREAM_TIMEOUT_MS + 15 min)` (le délai dépasse toujours la durée maximale d'un flux) et rend la part retenue sur le plafond de la clé API ; `ledger.expire` une fois par jour à partir de 2 h, heure de Toronto (clé `ledger-expire:<date>`), expire les crédits échus et non consommés de toutes les organisations (`expireAllDue`). Un règlement qui arrive après la libération n'échoue pas : il est facturé au coût réel par une écriture `overage` (un seul débit, rejeu sans effet). Migration `0009_s5_reglement_reel` : type d'écriture `overage`, colonnes `credit_reservations.api_key_id` et `key_spend_held` (la réservation retient la clé pour la lui rendre).

## Agents hébergés (jalon S7)

Les agents publiés dans **Nexora WorkStudio** sont vendus par la passerelle sous `agent/<slug>`, avec la clé `nxk_` du client, la réservation au grand livre avant l'appel et le règlement sur l'usage réel (D1). Catalogue dans la base `app` (migration `0008_s7_agents_heberges`), administré par le module Directus « Agents hébergés » (D14) : aucune collection Directus ajoutée.

### Tables
- `hosted_agent_instances` : instance WorkStudio (adresse interne, **référence** du coffre de la clé d'espace `sk-nexora-…`, hébergement déclaré, état du dernier test). Jamais la clé en base.
- `hosted_agents` : slug public, identifiant amont (`agent:<id du workflow>` ou `agent:<nom>`), noms et descriptions fr/en, catégorie, statut (brouillon, publié, retiré), visibilité (public, non listé, privé), plafond de jetons par exécution.
- `hosted_agent_prices` : prix **immuables** (déclencheur SQL) en micro-CAD : par million de jetons (entrée, sortie) et/ou par exécution ; jamais 0 $ ; `is_trial` (vrai par défaut) marque une valeur d'essai.
- `workstudio_embed_settings` : réglage de la bulle (une ligne `main`).
- `usage_events.run_fee_micro` : part du coût facturée par exécution (0 pour un modèle).

### Clé WorkStudio et découverte
1. Dans WorkStudio : Réglages › Clés d'API Nexora, créer une clé d'espace avec « Agents publiés » autorisés.
2. Module Coffre : la déposer sous une référence (type « autre »), par exemple `workstudio.mon-instance`.
3. Module « Agents hébergés » › Instances : ajouter l'instance (adresse sans `/v1`, référence), « Tester la connexion », « Découvrir les agents ».
La découverte lit `GET /v1/models` et crée un **brouillon** par agent inconnu (français prérempli, anglais vide) ; elle ne publie ni ne retire jamais. `GET /v1/models` ne donne que `agent:<nom>` : pour un identifiant stable, remplacer l'identifiant amont par `agent:<id du workflow>` (bouton « Code » de l'agent dans WorkStudio) ; la découverte retrouve l'agent par son nom.
Publication (garde) : noms et descriptions fr/en, prix en vigueur, instance active avec une clé.

### Appel `POST /v1/chat/completions` avec `model: "agent/<slug>"`
- Même authentification `nxk_`, mêmes limites (requêtes et jetons par minute, plafond de dépense de la clé), même 402 (`insufficient_quota`) avant tout appel amont ; clé révoquée 401 ; agent absent, retiré, brouillon ou interdit à la clé : 404 `model_not_found` ; clé WorkStudio absente ou révoquée du coffre : 503 `agent_unavailable` (aucune réservation, rien de la référence ni de la clé dans la réponse ni les journaux) ; refus de l'instance (clé d'espace refusée, agent introuvable) : 502 `agent_upstream_refused`.
- **Réservation** = prix par exécution + `run_token_cap` jetons au plus élevé des deux prix par million (par défaut 32 000). WorkStudio ne borne pas la sortie et un agent consomme bien plus que le message reçu (consignes, connaissances, outils) : le plafond borne le montant **réservé**, mais le règlement est au coût réel : un dépassement du plafond est facturé au client (le ruling S7 « Nexora absorbe le dépassement » est abandonné).
- **Règlement** = jetons réels × prix + frais par exécution, d'après l'`usage` de WorkStudio (non diffusé et diffusé). Aucun frais si l'exécution échoue avant de livrer quoi que ce soit (réservation libérée).
- **Règle de repli** quand l'usage manque : usage absent, ou à zéro alors qu'une réponse a été livrée → entrée estimée (3 octets par jeton) + réponse livrée estimée ; un usage explicitement à zéro avec une réponse vide ne coûte que les frais par exécution.
- Les messages `system` et `developer` de l'appelant sont **ignorés** (retirés avant l'appel : l'agent garde ses consignes) ; texte seulement ; seuls `messages` et `stream` sont transmis (température, outils, `max_tokens`… sans effet). Aucun en-tête CORS.
- `GET /v1/models` ajoute les agents accessibles à la clé (`type: "agent"`, `residency`, `pricing.per_run`, `pricing.trial`), même règle d'accès que les modèles.
- Un agent est appelable tant qu'il est publié, que son instance est active et qu'un prix est en vigueur ; « non listé » : appelable, absent de `/agents` ; « privé » : seulement une clé dont la liste explicite l'inclut.

### API d'administration `/api/admin/hosted-agents/*` (jeton `NEXORA_APP_ADMIN_TOKEN`)
`GET /` ; `GET|POST /instances`, `GET|PATCH /instances/{id}`, `POST /instances/{id}/test|discover` ; `GET /agents`, `GET|PATCH /agents/{id}`, `GET|POST /agents/{id}/prices` ; `GET|PATCH /embed`. Module Directus « Agents hébergés » : relais à liste fermée `/nexora-hosted-agents` (administrateurs seulement). Diff de la barre des modules : `docs/propositions/s7-cms-modules.diff`.

### Pages publiques et espace client
`/agents`, `/agents/<slug>` (et `/en/…`) : agents publiés et publics, prix (marqués « essai » tant que `is_trial`), exemples cURL, Python (`openai`) et TypeScript, garde-fous, lien vers la création de clé ; sitemap daté par la dernière publication. `/compte` : tableau « Consommation des agents » (lecture de `usage_events`, lignes `agent/…`) à côté de celui des modèles.

### Bulle WorkStudio sur le site
Réglage `workstudio_embed_settings` (module › « Bulle sur le site ») : origine publique de l'instance (https ; `http` seulement pour `localhost`), identifiant du chat public de l'agent, pages (une par ligne, sans la langue), côté, couleur, libellés. Le composant charge `/embed.js` après l'événement `load` puis au repos du navigateur, seulement sur ces pages, et retire la bulle quand on les quitte. Le proxy ajoute sur ces pages seulement une CSP qui n'ouvre que l'origine configurée (`script-src` avec `'unsafe-inline'` pour les scripts de démarrage de Next.js, `frame-src`, `connect-src`, `object-src 'none'`, `base-uri 'self'`) ; sans bulle, aucun en-tête. Le réglage est relu avec un cache de 10 s.
Côté WorkStudio (à poser par l'exploitant, non modifié ici) : `NEXORA_EMBED_ORIGINS=https://<domaine du site>` (en développement, ajouter `http://localhost:3541` ou le port du site). L'agent du chat doit être « Accessible sans compte (lien public) », sinon le cadre reste vide.

### Limites connues (non livrées)
- Prix : valeurs d'essai seulement ; aucun prix public n'est fixé. Le coût amont de WorkStudio n'est pas suivi (`upstream_cost_usd_micro` = 0) : pas de plancher de marge.
- Pas de rapprochement avec la consommation côté WorkStudio ; pas de pièces jointes ni d'outils côté appelant ; une instance par clé d'espace.
- Le module Directus n'a pas été vu dans un navigateur connecté (voir `docs/captures/s7/module-directus-api.txt` pour la preuve par le relais).

## Autogestion IA et SEO (jalon S8)

Détail : `docs/autogestion.md` (agents du site, injection, budget, passerelle) et `docs/seo.md` (SEO technique, audits, indexation, adaptateurs). Tables de la migration 0006 : `seo_audits`, `seo_issues`, `seo_settings`, `seo_adapters`, `sitemap_snapshots`, `indexing_submissions`, `site_agents`, `site_agent_runs`. Le chiffrement et la lecture du Coffre vivent désormais dans `packages/vault` (`@nexora/vault`), réexportés par `web/src/server/vault/` : le worker lit les clés des agents avec le même code et la même clé maîtresse.

Tâches du worker : `site-agent.run` { runId }, `seo.audit` { auditId }, `seo.index` { trigger, dryRun? }, `seo.adapter-check` { key }. Le planificateur (`worker/src/scheduler.ts`) crée l'audit de 03 h, le filet d'indexation de 04 h, la santé horaire et la veille du lundi ; `WORKER_SCHEDULER=off` le coupe. Les tâches longues renouvellent leur bail (`worker/src/keepalive.ts`).

| Variable | Où | Rôle |
|---|---|---|
| `SITE_ENV` | site, worker | `production` rend le site indexable ; toute autre valeur : `Disallow: /`, `X-Robots-Tag: noindex`, aucune soumission aux moteurs |
| `ROBOTS_AI_TRAINING` | site | `allow` ou `disallow` (défaut) pour les robots d'entraînement (GPTBot, ClaudeBot…) |
| `NEXORA_APP_INTERNAL_URL` | worker | adresse du site vue du worker : passerelle `/v1` des agents, sitemap de l'audit et de l'indexation |
| `SEO_AUDIT_BASE_URL`, `SEO_AUDIT_PERF_MAX_PAGES` | worker | adresse interrogée par l'audit (défaut : `NEXORA_APP_INTERNAL_URL`), pages mesurées par Lighthouse (6) |
| `LYCHEE_BIN` | worker | chemin de lychee (défaut `~/.local/bin/lychee`) |
| `POSTIZ_URL` | worker | instance Postiz (vérification de la clé `seo.postiz.api_key`) |
| `DIRECTUS_URL`, `LITELLM_BASE_URL` | worker | écritures de brouillons (jeton de l'agent, dans le Coffre) ; sonde de vivacité de LiteLLM |

Chromium : audits (axe, Lighthouse) utilisent le Chromium de Playwright (`bunx playwright install chromium`) ; `CHROME_PATH` le remplace.

## VPS (jalon S6)

Conception : §10, §11, §15 (S6) et D2, D3, D4, D7, D8, D13, D14 de `docs/superpowers/specs/2026-10-26-nexora-site-design.md` ; recherche `docs/recherche/04-vps-facturation-paiements.md`. Preuve de bout en bout : `docs/captures/s6/e2e-vps.md`. Code : `packages/vps` (`@nexora/vps` : client Proxmox, simulateur, catalogue, commandes, moteur), `packages/vault` (`@nexora/vault` : chiffrement et lecture du Coffre, désormais partagés par le site et le worker ; `web/src/server/vault/{crypto,store}.ts` ne sont plus que des réexportations), `packages/db/src/schema-vps.ts` (migrations 0006 et 0007), `worker/src/vps-handlers.ts`, `web/src/server/vps/`, `web/src/server/stripe/vps-checkout.ts`, pages `/vps`, `/vps/<application>`, `/compte/vps`, module Directus `cms/extensions-src/nexora-cms/src/vps/`.

```
client ──▶ /vps (configurateur) ──▶ POST /api/vps/checkout ──▶ commande « awaiting_payment » + Checkout (abonnement)
Stripe ──▶ webhook signé ──▶ vps_orders « paid » + tâche vps.provision (clé vps-provision:<commande>, unique)
worker ──▶ placement → clone → configure → firewall → start → await_agent → install → verify ──▶ instance « active »
                 └─ Proxmox VE (API REST, jeton du Coffre)         └─ script versionné, SHA-256 vérifié, exécuté par SSH
```

### Variables

| Variable | Rôle |
|---|---|
| `NEXORA_VAULT_MASTER_KEY` (+ `_VERSION`) | **Aussi pour le worker** : il lit le jeton Proxmox et la clé SSH d'installation dans le Coffre. Sans elle, le worker désactive les tâches VPS (avertissement au démarrage). |
| `VPS_WORKER_SSH_PUBLIC_KEY` | Clé publique du worker, ajoutée à cloud-init le temps de l'installation puis retirée (authorized_keys et configuration). La clé privée est dans le Coffre : référence `vps.worker_ssh_key` (type `other`). |
| `VPS_MAX_PER_ORG` (5) | Plafond de VPS par organisation (anti-abus). |
| `VPS_RETENTION_DAYS` (7) | Rétention après résiliation et d'une ancienne VM de réinstallation. |
| `VPS_AGENT_TIMEOUT_MS` (600000), `VPS_INSTALL_TIMEOUT_MS` (900000) | Délais d'attente de l'agent invité et de l'installation. |
| `VPS_ALERT_TO` (à défaut `CONTACT_NOTIFY_TO`) | Destinataire du courriel d'intervention (échec de provisionnement, manque de capacité). SMTP comme `contact.notify`. |
| `PROXMOX_CONTRACT_URL`, `PROXMOX_CONTRACT_TOKEN`, `PROXMOX_CONTRACT_NODE`, `PROXMOX_CONTRACT_FINGERPRINT`, `PROXMOX_CONTRACT_TEMPLATE_VMID`, `PROXMOX_CONTRACT_MUTATE=1` | Test de contrat contre un VRAI Proxmox (voir plus bas). Sans `PROXMOX_CONTRACT_URL` : ignoré, avec un avertissement. |

### Tables (base `app`)

`vps_plans` (taille, prix mensuel et annuel en **cents CAD** avant taxes, gabarit, statut `draft → approved → published → retired`, `is_dev_sample`), `vps_apps` (application ou fiche guide, version épinglée, licence SPDX + URL, avertissements, ports, script d'installation versionné et **somme SHA-256 contrainte en base** : `sha256(script)` doit égaler la colonne), `proxmox_servers` (hôte, nœud, région, capacité, pool d'adresses, **référence** du jeton dans le Coffre, TLS `verify` ou `pinned` + empreinte, état `draft/ready/maintenance/offline`, dernier contrôle), `os_templates` (gabarit cloud-init par serveur : vmid, utilisateur), `vps_orders` (clé d'idempotence fournie par le formulaire, prix et version de catalogue figés, clé SSH publique, ids Stripe), `vps_instances` (serveur, vmid, IP, état, étape, bail d'exécution, ancienne VM gardée), `vps_events` (journal **en ajout seulement**, déclencheur SQL). Les plans et applications se publient par version de catalogue (`config_versions`, collection `vps_catalog`, même flux que les modèles : brouillon → approuvé → publié, contenu figé, aperçu des différences). La version publiée « appliquée » porte les prix Stripe (`applied_detail.stripe`) : une commande n'utilise jamais qu'un prix de la version publiée ; ajouter une application conserve les prix, en changer un exige de relancer « Publier vers Stripe ».

**Garde de publication** : prix présent et > 0 (jamais 0 $), annuel < 12 mois, gabarit prêt sur un serveur prêt de la région, plan de développement refusé si `NODE_ENV=production`, application installable = licence permissive (MIT, Apache-2.0, BSD, ISC), script présent avec somme exacte, version épinglée, jamais n8n / Open WebUI / Dify (fiches guide seulement avec avertissement de licence, D8).

### Applications du catalogue (licences vérifiées le 27/10/2026 sur les dépôts officiels)

| Code | Licence | Version | Image (version + empreinte) |
|---|---|---|---|
| `hermes-agent` | MIT (Nous Research) | v0.22.5 | `nousresearch/hermes-agent:v0.22.5@sha256:9c556157…238d` |
| `openclaw` (durci : 1 port en 127.0.0.1, jeton, `cap_drop ALL`, pas de socket Docker) | MIT (OpenClaw Foundation) | 2026.10.7 | `ghcr.io/openclaw/openclaw:2026.10.7@sha256:fb26f084…1afa` |
| `ollama-anythingllm` | MIT / MIT | 0.40.11 / 1.19.0 | Ollama en réseau interne seulement (aucune authentification) |
| `anythingllm` | MIT (Mintplex Labs) | 1.19.0 | `mintplexlabs/anythingllm:1.19.0@sha256:daf5a6ae…833e` |
| `librechat` | MIT | v0.8.8 | + MongoDB 8.0.20 ; **sans** le service `admin-panel` du compose officiel (AGPL-3.0) |

Guides (jamais installés ni revendus) : `n8n` (Sustainable Use License), `open-webui` (clause de marque), `dify` (multi-locataire et logo). Les applications sont chargées en **brouillon** (`bun run --cwd web vps:seed`) ; le fondateur les approuve et les publie. Tous les ports d'application sont en `127.0.0.1` (accès par **tunnel SSH**) : le moteur sait ouvrir un port `public` au pare-feu, mais aucune application du catalogue n'en déclare (pas de TLS par VPS). Le client trouve ses accès générés dans `~/nexora-acces.txt` (0600). **Les scripts n'ont pas été exécutés sur une vraie VM** : syntaxe vérifiée (`bash -n`) et exécution à blanc avec Docker simulé (tests `packages/vps/src/seed/scripts.test.ts`) ; à éprouver sur la première VM réelle. `shellcheck` n'est pas installé sur pc6. Non vérifié : mémoire minimale réelle d'Ollama et de LibreChat ; avis NVD (seulement GHSA GitHub) ; OpenClaw a 722 avis GHSA en 2026 — la version proposée est postérieure à tous les correctifs publiés, VPS dédié obligatoire.

### Client Proxmox, simulateur et test de contrat

- **Client** (`packages/vps/src/proxmox/`) : `fetch`-like sur `node:https`, jeton `Authorization: PVEAPIToken=…` lu du Coffre à chaque appel (jamais gardé ni journalisé ; les messages d'erreur sont courts et nettoyés). TLS : `verify` (chaîne du système) ou `pinned` (certificat auto-signé accepté seulement avec l'empreinte SHA-256 enregistrée ; la connexion est vérifiée **avant** d'écrire l'en-tête d'autorisation) ; HTTP en clair refusé hors boucle locale. Opérations : `nextid`, clone complet (`newid`, `name`, `description`, `storage`, `pool`), configuration cloud-init par `PUT /config` (synchrone chez Proxmox : `ciuser`, `sshkeys` URL-encodées, `ipconfig0`, `nameserver`, jamais de `cipassword`), redimensionnement, démarrage / arrêt propre / arrêt forcé / redémarrage, suppression (`purge`), instantanés, pare-feu (options, règles, ipset anti-usurpation), agent invité (adresse IPv4), suivi des tâches par **UPID**.
- **Simulateur** (`proxmox/simulator.ts`) : serveur HTTP local en mémoire. **Source : `apidoc.js` officiel** de https://pve.proxmox.com/pve-docs/api-viewer/ (en-tête `Last-Modified` du 24/09/2026, somme SHA-256 de la source enregistrée ; Proxmox ne publie pas de numéro de version dans ce fichier — la version simulée répond « 9.0.3 » à titre indicatif). 27 chemins en sont extraits par `bun run --cwd packages/vps apidoc` vers `apidoc-subset.json`. Chaque requête est validée contre ce schéma (propriétés inconnues refusées, obligatoires, types, bornes, énumérations, propriétés à indice `ipconfig[n]`), comme le fait Proxmox (400) ; les réponses sont validées contre `returns` dans les tests (cela a déjà détecté des champs manquants). Le schéma ne décrit pas : messages d'erreur d'exécution, verrous (`clone`, `snapshot`), délai de l'agent, démarrer une VM déjà démarrée — reproduits de mémoire, **à confirmer par le test de contrat**.
- **Test de contrat** (`proxmox/contract.test.ts`) : la même suite tourne toujours contre le simulateur et, si `PROXMOX_CONTRACT_URL` est défini, contre un vrai serveur (lectures seules ; le cycle de vie complet — clone d'un gabarit, cloud-init, démarrage, instantané, suppression d'une VM `nexora-contract-*` — seulement avec `PROXMOX_CONTRACT_MUTATE=1`). Non exécuté contre un vrai Proxmox à ce jour.

### Brancher un serveur Proxmox (administration)

1. Dans Proxmox : créer un utilisateur/jeton API dédié (ex. `nexora@pve!provision`) à droits restreints au pool ou au nœud (clone, configuration, alimentation, instantanés, pare-feu, stockage — liste exacte à confirmer par le test de contrat), avec le certificat du serveur (ou son empreinte SHA-256 si auto-signé).
2. Préparer un **gabarit cloud-init** (image Debian 12 ou Ubuntu 24.04 avec agent invité `qemu-guest-agent`, disque `scsi0`, lecteur cloud-init) et noter son vmid ; le VM doit exposer AVX2 (type de CPU `host`) pour AnythingLLM.
3. Dans Directus, module **VPS** : créer le serveur (hôte, nœud, capacité allouable, pool d'adresses, stockage), « Coller le jeton Proxmox » (→ Coffre, référence `proxmox.<code>`, type `proxmox`), ajouter le gabarit, **« Tester la connexion »** : le serveur passe à « prêt » si Proxmox répond, que le nœud existe et (pour chaque gabarit) que la VM modèle existe avec `template: 1`.
4. Générer la paire de clés SSH du worker (`ssh-keygen -t ed25519 -C nexora-worker`), coller la clé privée dans le Coffre (`vps.worker_ssh_key`, type `other`) et mettre la clé publique dans `VPS_WORKER_SSH_PUBLIC_KEY`.

### Machine à états du provisionnement (`packages/vps/src/provision.ts`)

`placement → clone → configure → firewall → start → await_agent → install → verify → done` (réinstallation : `snapshot` à la place de `placement`). Idempotente et reprenable à chaque étape :
- **Un seul worker par instance** : bail d'exécution en base (`lease_until`, temps de la base) ; un second worker reçoit « occupé » (testé avec 10 workers concurrents : un clone, une installation).
- **Clé de commande → vmid** : le vmid est réservé en base (verrou consultatif par serveur, index unique) avant tout appel ; la VM est reconnue à son **nom** (`nx-<commande>`) : à la reprise, un clone existant n'est pas recréé (testé : plantage entre le clonage et la suite). Une VM étrangère sur le vmid réservé fait passer au vmid suivant.
- **Placement** : serveur prêt de la région, avec gabarit prêt, capacité (vCPU, RAM, disque déclarés moins les instances vivantes) et adresse libre ; sinon la commande **attend** (reprise toutes les 5 min, un courriel à l'opérateur une seule fois, échec après 24 h).
- **Budget d'exécution** (150 s, sous le bail de 5 min de la file) : au-delà, ou quand l'agent tarde, l'exécution rend la main et une tâche de continuation (`vps-provision:<commande>:c<n>`) reprend à l'étape.
- **Compensation** : à la dernière tentative ou sur échec définitif (somme du script incorrecte, application retirée) : VM partielle supprimée (seulement si elle porte notre nom), adresse libérée, commande et instance « failed », événement `provision_failed`, courriel à l'opérateur (`vps.alert`). **Aucun remboursement automatique** : l'opérateur décide dans Stripe.
- **Installation** : script de la version de catalogue de la commande, SHA-256 recalculé avant exécution, envoyé sur l'entrée standard de `bash -s` par SSH (`sudo -n`), clé d'hôte enregistrée à la première connexion ; la clé du worker est ensuite retirée d'`authorized_keys` et de cloud-init.
- **Pare-feu Proxmox par VM** : politique d'entrée DROP, SSH (22) + ICMP + ports d'application déclarés publics ; **port 25 sortant fermé** ; `ipfilter` (ipset de l'adresse attribuée) et `macfilter`, pas de DHCP ni d'annonces de routeur ; règles marquées `nexora:` (rejouables, jamais de règle manuelle touchée). Limites d'abus : plafond par organisation, limitation de débit des routes, un VPS isolé par client.

### Cycle de vie et abonnement (D7)

Le webhook S4 appelle `reconcileVpsSubscription` dans la **même transaction** après chaque transition d'abonnement (`web/src/server/billing/webhook.ts`) : première facture payée → commande « paid » + tâche de provisionnement unique ; la métadonnée `vps_order_id` relie la commande même si la facture précède la fin de session ; un abonnement VPS ne consulte ni Directus ni les crédits inclus. Règles (`lifecycle.ts`, testées) : `past_due` dans le délai de grâce (7 jours, S4) = service intact ; grâce écoulée, `unpaid` ou `paused` = **suspension** (arrêt propre, données gardées) ; retour à `active` = **reprise** ; `canceled` = **résiliation** (VM arrêtée, rétention de 7 jours, puis suppression). Aucun événement Stripe ne marque la fin d'une grâce ni d'une rétention : le **balayage** `vps.sweep` (toutes les minutes, se replanifie, premier balayage au démarrage du worker) met en file les suspensions et suppressions dues, reprend les provisionnements abandonnés et fait expirer les commandes impayées de plus de 24 h. Chaque tâche revérifie l'état courant avant d'agir. **Réinstallation** : instantané `avant-reinstall-…` de l'ancienne VM, arrêt, renommage `<nom>-old`, carte réseau retirée, conservation 7 jours (supprimée ensuite par le balayage), nouvelle VM clonée avec la **même adresse**. Le client « résilie » à la fin de la période payée (`cancel_at_period_end` chez Stripe).

### API

Administration (`Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN>`) `/api/admin/vps/*` : `GET /` ; `GET|POST /servers`, `GET|PATCH /servers/{id}`, `POST /servers/{id}/test`, `GET|POST /servers/{id}/templates`, `PATCH /templates/{id}` ; `GET|POST /plans`, `GET|PATCH /plans/{id}` ; `GET|POST /apps`, `GET|PATCH /apps/{id}` ; `GET|POST /versions`, `GET /versions/{id}`, `POST /versions/{id}/approve|publish` ; `POST /stripe/publish` (« Publier vers Stripe » : produit et prix mensuel/annuel hors taxes par plan publié, réutilise `publishPlanToStripe`) ; lectures seules `GET /orders`, `/instances`, `/events?instanceId=` (identifiants techniques seulement : ni clé SSH, ni courriel, ni nom d'organisation). L'état « prêt » d'un serveur ne se modifie pas à la main. Client (session, origine contrôlée, organisation tirée de la session) : `POST /api/vps/checkout` (propriétaire ; `plan`, `app`, `term`, `sshKey`, `requestId`, `lang`), `POST /api/account/vps/{id}/action` (`start|stop|reboot` : tout membre ; `reinstall|cancel` : propriétaire + `confirm: true`).

### Module Directus « VPS » (D14)

Dans le bundle `nexora-cms` : endpoint relais `nexora-vps` (administrateurs Directus seulement, liste fermée de chemins, rien de persisté) et module « VPS » (serveurs avec « Coller le jeton Proxmox » → Coffre et « Tester la connexion », gabarits, plans et applications avec Approuver / Publier / Retirer, versions avec aperçu des différences et « Publier vers Stripe », vue en lecture seule des commandes, instances et journal). **Pour qu'il apparaisse dans la barre de Directus** : appliquer `docs/propositions/s6-cms-module-vps.diff` (ajoute `nexora-vps` à `module_bar` de `cms/scripts/apply.ts`) puis `apply.ts` — non fait ici, par consigne. Le composant Vue n'a pas été ouvert dans un Directus réel.

### Preuve et vérifications

`WRITE_CAPTURE=1 bun run --cwd web vitest run src/server/vps/e2e.test.ts` (pile de développement requise : PostgreSQL, Mailpit, stripe-mock) rejoue tout le parcours avec le vrai worker, le simulateur, des webhooks signés et une horloge simulée ; compte rendu : `docs/captures/s6/e2e-vps.md`. Tests de concurrence : `packages/vps/src/engine.test.ts` (10 workers, une seule VM), `worker/src/vps-handlers.test.ts` (deux workers réels, tâches de continuation).

### Limites connues (non livrées)

Aucun serveur Proxmox réel branché : client, simulateur et scripts d'installation n'ont jamais parlé à un vrai Proxmox ni à une vraie VM (le test de contrat est prêt) ; pas de TLS ni de domaine par VPS (accès aux applications par tunnel SSH) ; pas de console web ni de sauvegardes en libre-service (la récupération d'une ancienne VM de réinstallation passe par l'opérateur) ; pas de remboursement automatique (par conception) ; pas de limitation de bande passante ni de quota mensuel appliqué (`bandwidthGb` est informatif) ; un seul serveur par commande, pas de migration entre serveurs ; l'application « Aucune application » (VPS vierge) n'existe pas — les guides n8n / Open WebUI / Dify renvoient au contact ; Postfix/courriel sortant autre que le port 25 non filtré ; Coolify non utilisé ; entrée « VPS » de la navigation et URL du sitemap à ajouter (voir le compte rendu) ; les prix, la garantie, les SLA, l'adresse légale restent au fondateur.

## Sécurité et exploitation (jalon S9)

Recette et preuves : `docs/recette/` ; mode d'emploi : `docs/guide-operateur.md`. Ajouts qui touchent la configuration :

- **En-têtes** : `web/src/lib/security-headers.ts` (CSP sans origine tierce, HSTS, `nosniff`, `frame-ancestors 'none'`), posés par `next.config.ts` et `proxy.ts`.
- **Adresses saisies en administration** (fournisseurs, instances WorkStudio, serveurs Proxmox) : garde `@nexora/net`. En production, le réseau interne est refusé sauf liste `NEXORA_OUTBOUND_ALLOW` (hôtes, adresses ou plages CIDR, séparés par des virgules) ; lien local et métadonnées du nuage toujours refusés.
- **Portée des secrets** : `@nexora/vault/scope` ; un secret ne part vers une adresse saisie que si son type convient.
- **Sauvegarde** : `deploy/backup.sh`, `deploy/restore.sh` ; **e2e regroupés** : `bun run e2e`.
- **Écoute du serveur** : `next start -H localhost` (ou `0.0.0.0` en conteneur), jamais `127.0.0.1`.
