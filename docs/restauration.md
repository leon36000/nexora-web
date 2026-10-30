# Reconstruire le site depuis GitLab seul

Dépôt : `https://pc4.tail0c55ff.ts.net/root/nexora-web` (privé, branche `main`). Tout le code, les migrations, les scripts et la documentation y sont. **Rien d'autre n'est nécessaire** pour remettre le site en place, sauf ce qui suit.

## Ce qui n'est PAS dans Git (et pourquoi)

| Quoi | Où | Que faire |
|---|---|---|
| Secrets de développement (`deploy/.env`, `.env`, `web/.env.local`) | ignorés par Git | se régénèrent : `deploy/init-env.sh` puis `scripts/init-dev-env.sh` |
| **Clé maîtresse du coffre** `NEXORA_VAULT_MASTER_KEY` | `deploy/.env` | **à garder hors ligne** (gestionnaire de mots de passe). Sans elle, les clés de fournisseurs déjà saisies dans le coffre sont illisibles : il faut les ressaisir |
| Clés des fournisseurs (DeepSeek, Z.ai, MiniMax, Moonshot…) | coffre (base de données, chiffrées) | à ressaisir dans le module « Coffre » si la base est perdue |
| Données (bases `app` et `directus`, fichiers Directus) | volumes Docker | `deploy/backup.sh` / `deploy/restore.sh` (voir `docs/guide-operateur.md` §10) |

Au 29/10/2026 le site n'est hébergé que pour des essais (démo sur gx10) : aucune donnée client n'existe encore. Reconstruire revient donc à refaire le code et les secrets, puis à recharger le catalogue de modèles.

## Prérequis (vérifiés)

- **Docker Compose v5.2 ou plus récent.** Le paquet Ubuntu `docker-compose-v2` 2.40 évalue d'avance les variables « requises » de `deploy/compose.yml` et échoue (« required variable …_FILE is missing »). Binaire officiel : image `docker/compose-bin:v5.2.0` (`docker create --name c docker/compose-bin:v5.2.0 /docker-compose && docker cp c:/docker-compose ./docker-compose`).
- **Bun 1.4.2** pour installer les dépendances (`bun install --frozen-lockfile`).
- **Node 24** pour lancer les tests (`npx vitest run`). Sous le moteur de Bun, la bibliothèque `zod` ne se charge pas dans Vitest et une quarantaine de fichiers de tests échouent à l'import.
- Un jeton GitLab (compte `agent-nexora-workstudio-web` ou autre) pour cloner.

## Procédure (essai du 28/10/2026 sur pc1 : environ une minute, hors téléchargements)

```bash
git clone https://pc4.tail0c55ff.ts.net/root/nexora-web.git && cd nexora-web
bash deploy/init-env.sh                                   # génère deploy/.env (secrets aléatoires, droits 0600)
bash scripts/init-dev-env.sh                              # génère .env et web/.env.local
docker compose -p nexorasite -f deploy/compose.yml --env-file deploy/.env up -d db   # base prête en ~6 s
bun install --frozen-lockfile
bun packages/db/src/migrate-cli.ts                        # applique les 28 migrations (0000 à 0027)
(cd web && npx vitest run)                                # environ 1 970 tests ; les paquets (db, privacy, webpilot, net) et le worker ont leurs propres suites : `npx vitest run` dans chaque dossier ; le CMS : `bun test` dans cms/
```

Pile complète (Directus, LiteLLM, simulateur Stripe, Mailpit) : retirer `db` de la commande `up`, puis `docs/guide-operateur.md` §2.

## Recharger le catalogue de modèles

```bash
bun run --cwd web models:seed     # fournisseurs (DeepInfra actif, OpenRouter désactivé) + modèles du dossier catalog-deepinfra/, en aperçu (voir docs/catalogue-deepinfra.md)
bun run --cwd web house:org       # organisation « maison » (accès gratuit) ; ajouter --key FICHIER pour créer sa clé
```

Prérequis du chargement : un taux de change USD→CAD approuvé (module « Modèles »), sinon les modèles sont chargés en brouillon sans prix. Les modèles sont publiés **en aperçu** (visibles, pas appelables) sans clé ; pour les rendre appelables, saisir la clé de DeepInfra dans le Coffre (`llm.deepinfra`, type `llm_provider`) puis « Passer en service » (guide de l'opérateur §8.1 bis, H).

## Reprise après sinistre avec des données

1. Cloner et générer les secrets comme ci-dessus **sauf** `NEXORA_VAULT_MASTER_KEY` : remettre celle d'origine dans `deploy/.env` avant de démarrer le site.
2. `deploy/restore.sh verifier ARCHIVE`, puis `deploy/restore.sh restaurer ARCHIVE --pg-container nexorasite-db-1` (voir l'en-tête du script).

## Ce qui s'ajoute depuis le 29/10/2026

- **Paquets partagés** : `packages/privacy` (Privacy Router : site et worker) et `packages/webpilot` (moteur WebPilot). Le worker tourne sous Node nu : les imports relatifs de ces paquets portent leur extension `.ts`.
- **Service navigateur de WebPilot** (`services/webpilot-browser/`, hors workspace bun, image propre : `npm ci` dans son dossier avant ses tests ; profil Compose `webpilot-browser`). SearXNG (`searxng`) pour la recherche. Aucun des deux n'est nécessaire pour redémarrer le site ; sans eux, `search` et le rendu navigateur répondent `503 webpilot_unavailable`.
- **Administration** : le panneau Directus relaie vers le site (`NEXORA_APP_INTERNAL_URL`, `NEXORA_APP_ADMIN_TOKEN`) ; après `cms/scripts/stage-extensions.sh`, `docker restart` du conteneur Directus suffit.
- **WorkStudio intégré** : variables `WORKSTUDIO_*` du site et `NEXORA_OIDC_*` / `NEXORA_GATEWAY_URL` de WorkStudio : `docs/workstudio-integre.md`.
- **Compte administrateur gratuit** : créer le compte sur le site, puis passer son organisation en mode « maison » (`bun run --cwd web house:org` pour l'organisation « Nexora — maison », ou `setBillingMode`).

## Données d'essai de la démo à retirer avant la mise en service

La base `app_demo` (démo sur gx10) contient des éléments d'essai posés le 29/10/2026 pour prouver WorkStudio intégré de bout en bout. Ils ne sont pas dans Git. À retirer avant d'ouvrir à de vrais clients :

- le modèle `nexora/essai-dev` (non listé, **prix fictifs**), le fournisseur `dev-litellm`, sa référence du Coffre `litellm.dev-upstream` et le taux de change de développement (1,40) : les remplacer par les vraies clés de fournisseurs et un taux approuvé (panneau Directus, module « Modèles ») ;
- la variable `WORKSTUDIO_DEFAULT_MODEL=nexora/essai-dev` et `WORKSTUDIO_REQUIRE_SUBSCRIPTION=false` (ancien nom de `WORKSTUDIO_REQUIRE_CREDITS=false`) du drop-in `~/.config/systemd/user/nexorasite-demo.service.d/workstudio.conf` (en production : modèle réel, crédits exigés : solde supérieur à zéro) ;
- le compte `essai-sso@nexora.test`, son organisation et son crédit de test de 5 $ (écriture `dev_test_credit`), et les usages de test.
