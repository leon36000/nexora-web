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

Tables de S1 : `jobs` (file), `vault_secrets` (coffre), `config_versions` (versions publiées figées, D3), `processed_events` (idempotence des webhooks, D7 : `recordEventOnce(db, fournisseur, idEvenement)` renvoie `true` au premier passage seulement). Les tables clients (Better Auth), le grand livre et la facturation sont arrivées avec S4 (section « Paiements » ci-dessous) ; les clés clientes de la passerelle arriveront avec S5.

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
| `settleReservation` | − solde du coût réel (plafonné au montant réservé, surplus noté en métadonnées), − réservé du montant entier ; une seule fois |
| `releaseReservation` | − réservé ; idempotent ; `releaseStaleReservations` libère les réservations perdues |
| `debit` (`refund`, `dispute`) | − solde ; **seul chemin qui peut rendre le solde négatif** : `blocked: true`, plus aucune réservation, API bloquée |
| `expireDue` | retire la part non consommée des lots échus (12 mois par défaut) ; la consommation est imputée aux lots dans l'ordre d'échéance ; n'entame jamais le réservé |

Garde-fous en base : contraintes de signe par type d'écriture et `credit_entries_no_overdraft_check` (une réservation ou une expiration ne peut jamais laisser un disponible négatif, même si le code était contourné). Tests : 20 réservations concurrentes (identiques et de montants inégaux), rejeux concurrents d'une même clé, précision au-delà de 2^53, mutation du verrou détectée.

### Stripe

- **Achat de crédits** (`POST /api/billing/checkout/credits`, champ `amount` en dollars) : Checkout en **paiement unique**, `automatic_tax` (Stripe Tax), adresse de facturation exigée, prix hors taxes, `tax_id_collection`, facture créée. Les crédits accordés valent le **montant avant taxes** ; les taxes sont à la charge du client en sus (D7, à faire confirmer par un comptable). **Abonnements** (`/api/billing/checkout/subscription`, champ `plan`) : session `subscription` distincte, prix Stripe du plan **publié** dans Directus. **Portail** (`/api/billing/portal`). Réponse : 303 vers Stripe (formulaire) ou JSON `{ url }` (`Accept: application/json`).
- **Webhook** `POST /api/stripe/webhook` : signature vérifiée sur le corps brut (tolérance 5 min), `processed_events` dans la **même transaction** que les effets (un échec annule tout, Stripe renvoie), rejeu → `duplicate` sans effet. Événements : `checkout.session.completed` et `…async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created` (et `.closed` : un litige gagné restitue les crédits), `customer.subscription.created|updated|deleted`. Les autres types sont ignorés (200) sans être enregistrés. Configurer l'endpoint Stripe avec exactement cette liste.
- **Remboursement** : débit proportionnel à la fraction du total payé (taxes comprises) remboursée, cumulatif et idempotent (plusieurs remboursements partiels), arrondi en faveur du client ; **litige** : débit des crédits contestés. Crédits dépensés → solde négatif → compte bloqué jusqu'à recharge.
- **Crédits d'abonnement** : à chaque `invoice.paid` de motif `subscription_create` ou `subscription_cycle`, `includedCreditsCents` du plan, valables jusqu'à la fin de la période payée (clé `sub-credit:<facture>`). Un plan archivé dans Directus n'accorde plus de crédits : le garder publié tant qu'il a des abonnés.

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

1. Dans le tableau de bord Stripe (mode test) : **Developers → API keys**, créer une clé restreinte ou copier `sk_test_…`, et **Developers → Webhooks** : créer l'endpoint `https://<site>/api/stripe/webhook` avec les 10 événements ci-dessus ; copier son secret `whsec_…`.
2. Coller les deux valeurs **dans le Coffre** de l'administration (`stripe.secret_key`, `stripe.webhook_secret`, type `payment`), jamais dans le chat ni dans un fichier.
3. Activer **Stripe Tax** et ajouter les **inscriptions fiscales** de Nexora (TPS et TVQ du Québec, avec les numéros d'inscription ; adresse d'origine et catégorie de produit « services numériques / logiciel-service ») ; renseigner l'identité de l'entreprise pour les factures. Faire valider par un comptable (TVQ à déclarer par Nexora ; lieu de fourniture des services électroniques).
4. Activer le **portail client** (Settings → Billing → Customer portal : factures, moyens de paiement, résiliation).
5. En local avec la CLI : `stripe listen --forward-to localhost:3500/api/stripe/webhook` (affiche un `whsec_…` local à mettre dans `STRIPE_WEBHOOK_SECRET`), puis `stripe trigger checkout.session.completed` ; vérification de bout en bout avec `stripe-mock` : voir `web/src/server/billing/e2e.test.ts`.

### Limites connues (non livrées)

Invitation de membres (API désactivée, pas de page) ; planificateur d'expiration des crédits et de libération des réservations perdues (les fonctions existent, le worker ne les appelle pas encore) ; remboursement d'une charge d'abonnement (n'agit pas sur les crédits accordés) ; un `charge.refunded` reçu avant `checkout.session.completed` est ignoré (journalisé) ; redirection de `/compte` sans session faite en flux (200 puis redirection) parce que `proxy.ts` n'est pas dans cette zone ; les paiements réels (interdits tant que le fondateur n'a pas donné son accord).
