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

Tables de S1 : `jobs` (file), `vault_secrets` (coffre), `config_versions` (versions publiées figées, D3), `processed_events` (idempotence des webhooks, D7 : `recordEventOnce(db, fournisseur, idEvenement)` renvoie `true` au premier passage seulement). Les tables clients et le grand livre arrivent avec S4 et S5.

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
