# Mise en service réelle de Nexora AI sur Proxmox

État au 30/10/2026. Guide à deux lectures : le fondateur (non spécialiste) lit les encadrés « En clair » et les lignes « Exige le fondateur » ; un technicien exécute les commandes et les vérifications.

**Sources lues, sans rien modifier ni arrêter** : le dépôt du site `~/Desktop/NexoraSite` (branche `main`, dernier commit `52f31d4`), le fork `~/Desktop/NexoraCode/src` (commit `f835b6fe`), la machine pc6 (gx10-e526, arm64 : `systemctl --user`, `docker ps`, `docker stats`), la pile WorkStudio de pc1 (amd64, `~/Bureau/Nexora-Travail/nexora-workstudio/deploy`, lecture seule). Aucun build lancé, aucune base interrogée, aucun conteneur arrêté. Aucun secret n'est écrit ici : seulement des noms de variables.

Documents sources à garder sous la main : `docs/guide-operateur.md` (exploitation, §13 liste de contrôle), `docs/infra.md` (durcissement de la pile), `docs/nexora-code.md`, `docs/webpilot.md`, `docs/workstudio-integre.md`, `docs/restauration.md`, `docs/vps/guide-branchement-proxmox.md`, `docs/recette/flux-sortants.md`, `docs/recette/sauvegarde.md`, `docs/superpowers/plans/ledger.md` (journal), `docs/superpowers/specs/2026-10-30-credits-produits-design.md`. Remarque : `docs/INDEX.md` n'existe pas dans ce dépôt (il existe dans le dépôt WorkStudio) et `web/.env.example` n'existe pas non plus ; la liste des variables est dans `deploy/.env.example` et dans `docs/guide-operateur.md` §3.

## Légende des étiquettes

| Étiquette | Sens |
|---|---|
| **VÉRIFIÉ** | Lu dans un fichier (chemin cité) ou constaté sur pc6 / pc1 le 30/10/2026. |
| **DOCUMENTÉ** | Affirmé par un document du dépôt ; je ne l'ai pas revérifié. |
| **ESTIMATION À VALIDER** | Chiffre ou choix proposé par moi : ce n'est pas un fait, un technicien doit le confirmer ou le corriger. |
| **NON VÉRIFIÉ** | Je n'ai pas pu le vérifier (raison indiquée). |
| **DÉCISION** | Revient au fondateur. |
| **ÉCART** | Différence constatée entre ce que le dépôt fournit et ce qu'il faut en production. Aucun écart n'est corrigé par ce document. |

---

## 0. L'essentiel en une page

**En clair.** Aujourd'hui, tout tourne en démonstration sur pc6 et pc1, avec des simulateurs (faux Stripe, faux courriel, faux modèle d'essai) et des raccourcis réseau (tunnels SSH, Tailscale). Pour la vraie mise en service il faut : (1) choisir le domaine, le matériel et les comptes externes ; (2) installer Proxmox et trois machines virtuelles ; (3) y déployer la pile en retirant tout ce qui est de développement ; (4) brancher les vrais services (Stripe, courriel, DeepInfra) **d'abord en mode test, sur le vrai domaine** ; (5) prouver qu'une sauvegarde se restaure ; (6) seulement alors ouvrir au public. Le guide propose trois états : **fermé** (accessible par VPN seulement), **test** (testeurs invités, paiements en mode test, site non indexé), **public** (paiements réels après votre accord, site indexable).

**Ce que le dépôt ne fournit pas encore (écarts majeurs, détail au §7 et aux étapes) :**

1. **Le site et le worker n'ont aucun Dockerfile ni fichier de production** : ils tournent aujourd'hui par `systemctl --user` (`next start`, `node src/main.ts`). `deploy/compose.prod.yml` suppose qu'ils rejoignent des réseaux Docker internes qui n'existent que s'ils sont conteneurisés (`docs/infra.md`, « Non fait ou à décider »). C'est le premier chantier technique.
2. **Directus enverrait ses courriels vers Mailpit en production** : `deploy/compose.yml` fixe `EMAIL_SMTP_HOST: mailpit` et `EMAIL_FROM: no-reply@nexora.test`, `deploy/compose.prod.yml` ne les remplace pas, et Mailpit passe au profil `dev` (donc absent).
3. **Nexora Code est incompatible tel quel avec un site conteneurisé** : le pilote Docker publie chaque environnement sur `127.0.0.1:<port>` de l'hôte (`packages/code/src/docker.ts`, ligne 131) ; un site dans un conteneur ne peut pas atteindre ce port. Il exige aussi l'accès au démon Docker pour le site et le worker (équivalent à root sur l'hôte). La v1 suppose « site et Docker sur la même machine ». Aucune image `nexora/code-workspace` n'a jamais été construite.
4. **Les sauvegardes actuelles couvrent peu** : `deploy/backup.sh` ne sauvegarde que les bases `app` et `directus` et les fichiers de Directus. Ni la base `litellm`, ni les volumes des environnements Nexora Code, ni la pile WorkStudio, ni GitLab pc4, ni les secrets (§5).
5. **Les images de pc6 sont arm64** ; Proxmox VE exige un processeur x86-64 (`docs/vps/guide-branchement-proxmox.md` §2). Tout est à reconstruire ou à reprendre en amd64 (pc1). La compilation de WorkStudio demande plus de 28 Go de mémoire (`docs/restauration.md` du dépôt WorkStudio) : elle ne se fait pas sur le serveur de production.
6. **Le domaine est figé à la compilation** : `SITE_URL` doit être posé avant `next build` (`docs/guide-operateur.md` §2.2). Pas de domaine, pas de site de production.

**Les 5 décisions du fondateur avant de commencer** (détail au §2.8) : (1) domaine et DNS ; (2) matériel, nombre de serveurs et lieu physique (Québec ?) ; (3) comptes externes : Stripe, courriel (SMTP), DeepInfra, clé Directus Open Innovation Grant ; (4) où vit le code source déployé (registre d'images, accès à GitLab pc4) ; (5) le périmètre du premier jour : avec ou sans Nexora Code, WorkStudio, RAG, VPS.

---

## 1. Inventaire des composants

Toutes les valeurs d'images, ports et limites viennent de `deploy/compose.yml`, `deploy/compose.prod.yml`, `services/webpilot-browser/Dockerfile`, de l'unité systemd de pc6 et du `compose.yml` de WorkStudio sur pc1. Les secrets sont désignés par leur **nom** seulement.

### 1.1 Site Next.js (`web/`)

- **Rôle** : pages publiques fr-CA et en-CA, espace client, API `/v1/*` (passerelle compatible OpenAI, facturée), `/api/admin/*`, webhooks Stripe, fournisseur OpenID Connect pour WorkStudio, mandataire de Nexora Code, bibliothèques Privacy Router (`packages/privacy`) et RAG (`packages/rag`) exécutées dans le même processus (aucun service séparé pour ces deux-là).
- **Commande** : `bun run --cwd web build` puis `next start -H localhost -p 3500` (jamais `-H 127.0.0.1`, `docs/guide-operateur.md` §2.2). Sur pc6 : `nexorasite-demo.service` (port 3590, `NODE_ENV=production`). **ÉCART** : aucun Dockerfile ni unité de production dans le dépôt (`find` : seul `services/webpilot-browser/Dockerfile` existe).
- **Port** : 3500 (développement). Version observée : `next-server` 16.4.3 ; Node v24.22.0 et Bun 1.4.2 sur pc6 (`packageManager: bun@1.4.2` dans `package.json`).
- **Dépend de** : PostgreSQL `app`, Directus, LiteLLM, SearXNG, service navigateur WebPilot, SMTP, Stripe, DeepInfra (via LiteLLM), HIBP (`api.pwnedpasswords.com`), démon Docker (Nexora Code seulement).
- **Volumes** : `CMS_SNAPSHOT_DIR` (instantanés de secours, reconstructibles : ne pas sauvegarder, mais le monter sur un volume persistant).
- **Secrets (noms)** : `DATABASE_URL`, `NEXORA_APP_ADMIN_TOKEN`, `NEXORA_VAULT_MASTER_KEY` (+ `_VERSION`, `_PREVIOUS*`), `BETTER_AUTH_SECRET`, `DIRECTUS_READER_TOKEN`, `DIRECTUS_PUBLISHER_TOKEN`, `NEXORA_PREVIEW_SECRET`, `LITELLM_MASTER_KEY`, `WORKSTUDIO_OIDC_CLIENT_SECRET`, `WEBPILOT_BROWSER_SECRET` (ou `_FILE`), facultatifs `NEXORA_CODE_TICKET_SECRET`, `NEXORA_ALTCHA_SECRET`. Seules `SMTP_PASSWORD_FILE` et `WEBPILOT_BROWSER_SECRET_FILE` ont une variante fichier (liste des variables lues, relevée par `grep process.env`) : **les autres arrivent par l'environnement du processus** (voir étape 4).
- **Architecture** : JavaScript, mais `node_modules` contient des modules natifs : installer et compiler sur la machine cible (amd64).

### 1.2 Worker (`worker/`)

- **Rôle** : file de tâches PostgreSQL (courriels, grand livre : `ledger.release-stale`, `ledger.grant-tranches`, `ledger.expire`, provisionnement VPS, agents du site, audits SEO, indexation RAG `rag.index`, balayage Nexora Code `code.sweep`, WebPilot `webpilot.crawl` / `purge` / `sessions.sweep`). Aucun port.
- **Commande** : `node src/main.ts` (Node 22.18 ou plus récent ; `nexorasite-worker.service` sur pc6). Ne jamais le couper avec `WORKER_SCHEDULER=off` en production (`docs/guide-operateur.md` §3).
- **Dépend de** : PostgreSQL, Directus (`DIRECTUS_URL`), l'adresse interne du site (`NEXORA_APP_INTERNAL_URL`), LiteLLM (sonde), SMTP, SearXNG et navigateur WebPilot, Proxmox + SSH vers les VPS (si le produit VPS est ouvert), démon Docker (`code.sweep`), Chromium + Lighthouse + `lychee` pour les audits nocturnes (`CHROME_PATH`, `LYCHEE_BIN`).
- **Secrets (noms)** : `DATABASE_URL`, `NEXORA_VAULT_MASTER_KEY`, `NEXORA_APP_ADMIN_TOKEN`, `SMTP_PASSWORD_FILE` (une variable `SMTP_PASSWORD` en clair est refusée), `WEBPILOT_BROWSER_SECRET`. La clé privée SSH du worker est **dans le Coffre** (`vps.worker_ssh_key`), la publique dans `VPS_WORKER_SSH_PUBLIC_KEY`.
- **Volumes** : aucun à sauvegarder n'a été identifié (**NON VÉRIFIÉ** : l'emplacement exact des fichiers d'audit n'a pas été relevé).

### 1.3 PostgreSQL 17 + pgvector

- **Image** : `pgvector/pgvector:pg17@sha256:ac08538c…` (index multi-architecture, dit le commentaire de `compose.yml`). Service `db`, conteneur `nexorasite-db-1` sur pc6.
- **Bases** : `app` (propriétaire `nexora`, superutilisateur : utilisé par le site, le worker, les sauvegardes), `directus`, `litellm`, `umami` (rôle et base créés par `deploy/initdb/01-databases.sh`, **mais aucun service Umami n'existe** dans le compose ; la conception dit « aucune mesure d'audience » : ne rien déployer). Un rôle par base, sans SUPERUSER ; extension `vector` créée par l'initialisation (migration 0028 en dépend).
- **Port** : 5432 interne ; **aucun port publié en production** (`compose.prod.yml` : `ports: !reset []`).
- **Volume à sauvegarder** : `db` (`/var/lib/postgresql/data`) ; en pratique par `pg_dump`, pas par copie du volume (§5).
- **Secrets** : `POSTGRES_PASSWORD_FILE`, `DIRECTUS_DB_PASSWORD_FILE`, `LITELLM_DB_PASSWORD_FILE`, `UMAMI_DB_PASSWORD_FILE` (fichiers montés sous `/run/secrets/`).
- **Limites** : `mem_limit` 2 Go (`NEXORA_DB_MEM_LIMIT`), 300 processus. **Non réglé** : aucun paramétrage PostgreSQL (mémoire partagée, connexions) n'est versionné.
- **ÉCART déjà documenté** : le site se connecte en superutilisateur ; un rôle `app` non privilégié est « la suite logique » (`docs/infra.md`).
- **Observation pc6** : 199 MiB au repos. Le Postgres de développement « lâche » (`out of shared memory`) quand tous les paquets lancent leurs tests en parallèle (`ledger.md`) : réglage à faire en production, **NON VÉRIFIÉ**.

### 1.4 Directus 12.5.1 (contenu et administration)

- **Image** : `directus/directus:12.5.1@sha256:ef6fc027…`, utilisateur 1000, système de fichiers en lecture seule, `mem_limit` 1 Go.
- **Port** : 8055 dans le conteneur ; `127.0.0.1:${DIRECTUS_HOST_PORT:-8456}` sur l'hôte (le proxy HTTPS de l'hôte le joint).
- **Dépend de** : PostgreSQL `directus`, l'adresse interne du site (`NEXORA_APP_INTERNAL_URL`, revalidation et module Coffre), SMTP (**ÉCART n° 2**).
- **Volumes** : `uploads` (`/directus/uploads`, sauvegardé par `backup.sh`) ; `cms/extensions` monté en lecture seule (dans Git, construit par `cms/scripts/stage-extensions.sh`).
- **Secrets** : `DIRECTUS_SECRET_FILE`, `DIRECTUS_ADMIN_PASSWORD_FILE`, `DIRECTUS_DB_PASSWORD_FILE`, `NEXORA_APP_ADMIN_TOKEN_FILE`, plus les jetons statiques que `cms/scripts/apply.ts` crée (`DIRECTUS_READER_TOKEN`, `DIRECTUS_PUBLISHER_TOKEN`) et ceux des cinq agents du site (au Coffre, `site-agent.<agent>.directus`).
- **Licence** : sans clé Open Innovation Grant, Directus est au palier Core : 3 sièges, **25 collections (le schéma en utilise déjà 25 : aucune marge)**, 5 flows, et toute permission avec règle personnalisée est refusée (`docs/cms.md` §2). La clé se pose dans `LICENSE_KEY` ; le fondateur doit aussi accepter (ou non) la licence MSCL-1.0-GPL et désigner le propriétaire du projet (aucun agent ne l'a fait).
- **Observation pc6** : 305 MiB au repos.

### 1.5 LiteLLM v1.106.2 (passerelle vers les fournisseurs de modèles)

- **Image** : `ghcr.io/berriai/litellm:v1.106.2@sha256:7294b90f…` (jamais `latest` : incident de la 1.107.0 du 21/10/2026). Utilisateur 65532, lecture seule, `mem_limit` 2 Go.
- **Port** : 4000 interne, aucun port publié en production. Config : `deploy/litellm/config.yaml` (`turn_off_message_logging: true`, `store_prompts_in_spend_logs: false`, `drop_params: true`), `STORE_MODEL_IN_DB=True`.
- **Dépend de** : PostgreSQL `litellm` ; Internet (DeepInfra, `api.deepinfra.com`) ; le Coffre du site pour les clés, **poussées par la synchronisation** « Synchroniser » du catalogue (donc la base `litellm` finit par contenir les clés des fournisseurs, chiffrées par `LITELLM_SALT_KEY` : inférence à partir de W5 de `flux-sortants.md`, **NON VÉRIFIÉ** dans la base).
- **Secrets** : `LITELLM_MASTER_KEY_FILE` (doit commencer par `sk-`, comme le génère `deploy/init-env.sh`), `LITELLM_SALT_KEY_FILE`, `LITELLM_DB_PASSWORD_FILE`.
- **ÉCART n° 7** : `deploy/litellm/config.yaml` déclare encore le modèle de développement `dev/cloud-glm-5-3` (amont = LiteLLM de pc1 via `PC1_UPSTREAM_URL` / `PC1_UPSTREAM_KEY`). À retirer du fichier avant la production ; si LiteLLM démarre proprement avec cette ligne et sans ces variables, **NON VÉRIFIÉ**.
- **Observation pc6** : 522 MiB au repos.

### 1.6 SearXNG (recherche de WebPilot)

- **Image** : `searxng/searxng:2026.10.13-22c64b8d3@sha256:9b61996e…`, 512 Mo, `cap_drop: ALL`. Config : `deploy/searxng/settings.yml` (instance interne, `limiter: false`, `public_instance: false`). Tourne sur pc6 (`127.0.0.1:8890`).
- **Réseaux** : `nexora-webpilot-search` (interne, sans route vers l'extérieur ; le site et le worker le rejoignent) et `webpilot-egress` (vers les moteurs publics). Aucun port publié en production.
- **Secrets** : aucun (facultatif `SEARXNG_SECRET`). **Volumes** : aucun. Durcissement `read_only` non posé (**NON VÉRIFIÉ** au démarrage réel).

### 1.7 Service navigateur WebPilot (`services/webpilot-browser`)

- **Image** : construite localement `nexora/webpilot-browser:local` à partir de `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd…` (index amd64 et arm64, dit le Dockerfile) ; profil Compose `webpilot-browser` (ne démarre pas avec la pile ordinaire). **Absent de `docker ps` sur pc6 aujourd'hui.**
- **Port** : 8700. **Limites** : 2 Go, 2 CPU, 1024 processus, `/tmp` 768 Mo, `init: true`, utilisateur 1001, lecture seule. Chromium sans bac à sable (documenté, `docs/webpilot.md` §6).
- **Secrets** : `WEBPILOT_BROWSER_SECRET` (32 caractères au moins, la même valeur pour le site, le worker et le service). `WEBPILOT_CONTACT` (adresse publique du robot) à renseigner avant ouverture.
- **Réseaux** : `nexora-webpilot-browser` (interne) et `webpilot-browser-egress`. Défense en profondeur recommandée, **non appliquée** : règle `DOCKER-USER` interdisant à ce réseau de joindre les plages privées.

### 1.8 Coffre de secrets (dans le site, table `vault_secrets`)

- **Comment les clés fournisseurs sont stockées** (`packages/vault/src/crypto.ts`, `store.ts`) : chiffrement par enveloppe, AES-256-GCM ; une clé de données aléatoire par secret, elle-même chiffrée par la clé maîtresse `NEXORA_VAULT_MASTER_KEY` (32 octets en base64, version portée par `…_VERSION`) ; la référence du secret est liée au chiffrement. Une valeur n'est **jamais relisible**, seulement remplaçable ou révocable. Dépôt par le module Directus « Coffre » ou `POST /api/admin/vault`, avec un **type** (`llm_provider`, `payment`, `proxmox`, `other`) qui limite où la clé peut partir.
- **Références usuelles** : `llm.deepinfra` (type `llm_provider`), `llm.openrouter` (route de secours, désactivée), `stripe.secret_key`, `stripe.webhook_secret`, `proxmox.<code>`, `vps.worker_ssh_key`, `site-agent.<agent>.directus` / `.gateway`, `code-workspace-password.<id>`, clés SEO.
- **La clé maîtresse n'est dans aucune sauvegarde** ; sa perte rend tous les secrets illisibles (à ressaisir). Hôtes où une clé peut partir : `NEXORA_SECRET_HOSTS_MODEL_PROVIDER` (défaut : éditeurs connus en HTTPS dont `api.deepinfra.com`), `NEXORA_SECRET_HOSTS_WORKSTUDIO`, `NEXORA_SECRET_HOSTS_PROXMOX` (aucun par défaut).

### 1.9 WorkStudio (fork de Sim, sans `ee/`) et ses services

Pile Compose **séparée** du site (projet `nexora`, `deploy/compose.yml` du dépôt `root/nexora-workstudio`, projet GitLab 5). Observée sur pc1 (amd64, `nexora-x86-*`).

| Service | Image | Port (hôte) | Rôle / remarques |
|---|---|---|---|
| `workstudio` | `nexora/workstudio:local` | 3000 | application (Next) ; observé 924 MiB au repos ; volume `workstudio-uploads` |
| `workstudio-realtime` | `nexora/workstudio-realtime:local` | 3002 | WebSocket (socket.io) |
| `workstudio-migrations` | `nexora/workstudio-migrations:local` | — | migrations, démarrage unique |
| `cron` | `nexora/cron:local` | — | tâches planifiées |
| `postgres` | `pgvector/pgvector:pg17` | 5432 interne | base **propre** à WorkStudio (base `nexora`), volume `postgres-data` |
| `redis`, `nexora-api-redis` | `redis:7-alpine` | interne | volumes `redis-data`, `nexora-api-redis-data` |
| `nexora-api` | `nexora/api:local` (fork d'OpenGateLLM) | 8000 | passerelle interne de WorkStudio ; **exige `NEXORA_UPSTREAM_URL` et `NEXORA_UPSTREAM_MODEL`** et attend qu'Ollama soit sain au démarrage |
| `nexora-bootstrap` | même image | — | démarrage unique, volume `bootstrap` (contient des secrets) |
| `nexora-connect` | `nexora/connect:local` (OpenConnector) | 3000 → 8400 | connecteurs ; volume `connect-data` |
| `ollama` | `ollama/ollama:0.12.6` | 11434 interne | **toujours présent** : embeddings de la base de connaissances (`bge-m3`), CPU ; volume `ollama-data`. **Aucun modèle de conversation local n'est voulu** (décision du fondateur) |
| profil `search` | `searxng/searxng:2026.10.17-1c10abe2d` | interne | recherche de WorkStudio |
| profil `code` | `nexora/code:local` (« code-sandbox ») | interne | interpréteur Python ; **monte le socket Docker**, tourne en root, seul avec WorkStudio sur un réseau `code` interne |
| profil `https` | `caddy:2.8.4-alpine` | 80, 443 | `deploy/caddy/Caddyfile` : domaine principal, `connect.<domaine>`, `api.<domaine>` |
| profil `voice` | `speaches 0.8.3-cpu`, `nexora/diarize:local` | interne | transcription, voix (modèle téléchargé une fois, volume `whisper-models`) |
| profil `pii` | `nexora/pii:local` | interne | Presidio, limite 1 Go |

- **Secrets (noms)** : `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `INTERNAL_API_SECRET`, `ENCRYPTION_KEY`, `API_ENCRYPTION_KEY`, `CRON_SECRET`, `NEXORA_API_REDIS_PASSWORD`, `NEXORA_API_SECRET_KEY`, `NEXORA_API_ADMIN_PASSWORD`, `NEXORA_CONNECT_ENCRYPTION_KEY`, `NEXORA_CONNECT_RUNTIME_TOKEN`, `NEXORA_CONNECT_ADMIN_TOKEN`, `NEXORA_CONNECT_TOKEN`, `NEXORA_CODE_SANDBOX_TOKEN`, `NEXORA_UPSTREAM_KEY`, `NEXORA_OIDC_CLIENT_SECRET`, `RESEND_API_KEY` / `NEXORA_SMTP_*` (courriel). `scripts/init-env.sh` du dépôt WorkStudio les génère ; **perdre `ENCRYPTION_KEY` ou `NEXORA_CONNECT_ENCRYPTION_KEY` rend illisibles les données chiffrées** (`docs/restauration.md` de WorkStudio).
- **Architecture** : images `nexora/*:local` construites sur place, **sans empreinte** (exemptées par `deploy/tests/env.test.sh`). Les images **x86** vérifiées sont dans le registre de paquets de GitLab pc4 : paquet générique `nexora-images`, version `integre-2026-10-29`, 9 archives + `SHA256SUMS`, 2,5 Go (`docs/restauration.md` de WorkStudio, **DOCUMENTÉ**). Les images arm64 de pc6 ne servent pas sur Proxmox.
- **Mémoire de compilation** : plus de 28 Go (DOCUMENTÉ) ; sur pc1, toujours `NEXORA_BUILD_CPUS=8` et la pile arrêtée (un build non borné a coïncidé avec un redémarrage de pc1).
- **NON VÉRIFIÉ** : si les images déjà construites peuvent servir sous un autre domaine (les variables `NEXT_PUBLIC_*` sont figées à la compilation, d'après la mémoire du projet) ; quel amont de modèle l'instance WorkStudio doit viser en production (le mode intégré remet à chaque utilisateur l'adresse de la passerelle du site, mais `nexora-api` exige quand même un amont au démarrage).

### 1.10 Image `nexora/code-workspace` (Nexora Code hébergé)

- **Rôle** : un conteneur par personne et par organisation, `nexora-code serve` sur le volume `/workspace`. Fichiers : `~/Desktop/NexoraCode/src/deploy/Dockerfile.workspace`, `workspace-entrypoint.sh`, `README.md`.
- **Construction** : `docker build -f deploy/Dockerfile.workspace -t nexora/code-workspace:<étiquette> .` depuis la racine du fork. **Jamais construite** (disque de pc6 tendu) ; seuls une analyse du Dockerfile et un essai à blanc de l'entrée ont été faits. Taille, `vite build` et ouverture d'un projet par défaut : **NON VÉRIFIÉS**. **ÉCART** : la base `oven/bun:1.4.4` est une étiquette, non une empreinte (règle du dépôt : images épinglées par empreinte).
- **Lancement par le site** (`packages/code/src/docker.ts`) : `--read-only`, `/tmp` tmpfs `noexec`, `--cap-drop ALL`, `no-new-privileges`, 1 CPU, 2 Go sans swap, 512 processus, volume `nexora-code-vol-<id>`, conteneur `nexora-code-<id>`, étiquette `nexora.code.workspace=1`, port `127.0.0.1:<20000–29999>:4096`, `--restart no`. Réseau Docker par défaut (pont) : aucun cloisonnement vers la passerelle seulement.
- **Secrets** : `NEXORA_API_KEY` (clé `nxk_` propre à l'environnement), `NEXORA_CODE_PASSWORD` (au Coffre) ; passés par l'environnement du processus `docker`, jamais dans la ligne de commande.
- **Volumes à sauvegarder** : un volume `nexora-code-vol-*` par personne (données des clients).
- **Architecture** : construire en amd64 sur la cible de production ou à partir de pc1.

### 1.11 Relais, ponts et proxy frontal

- **Aujourd'hui (développement)** : `nexorasite-admin-pont.service` (socat `172.17.0.1:3500` vers `127.0.0.1:3590`), `litellm-pc1-pont.service` (SSH, LiteLLM de pc1 vers `172.17.0.1:18090`), `workstudio-pont.service` (SSH, WorkStudio de pc1 vers `127.0.0.1:3305`, exposé par Tailscale Serve `:3443`), Tailscale Funnel `:10000`. **Rien de cela ne se reproduit** (§3).
- **En production** : un proxy HTTPS **n'existe pas dans le dépôt du site** (`docs/guide-operateur.md` §9 le décrit en prose : nginx ou Caddy). WorkStudio a son `Caddyfile` (profil `https`). **ÉCART** : à écrire (étape 3).

### 1.12 Courriel

- Quatre endroits distincts à régler : le **site** (`SMTP_URL`, `MAIL_FROM` : vérification d'adresse, réinitialisation), le **worker** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD_FILE`, `SMTP_FROM`, `CONTACT_NOTIFY_TO`, `VPS_ALERT_TO`), **Directus** (`EMAIL_*`, **ÉCART n° 2**), **WorkStudio** (`NEXORA_SMTP_HOST`, `NEXORA_SMTP_PORT`, `NEXORA_SMTP_USER`, `NEXORA_SMTP_PASS`, `NEXORA_EMAIL_FROM`). Le fournisseur SMTP n'est pas choisi (**DÉCISION**).
- Le défaut du site est Mailpit : en production rien ne part tant que `SMTP_URL` n'est pas réglé.

### 1.13 Paiement (Stripe)

- Les clés vivent **au Coffre** en production (`stripe.secret_key`, `stripe.webhook_secret`) ; les variables `STRIPE_*` sont ignorées hors développement (`web/src/server/stripe/client.ts`). Le **mode test** est le défaut ; l'argent réel exige un geste explicite du fondateur dans le module Paiements (« Autoriser les paiements réels ») et une clé `sk_live_…`. Le webhook se crée tout seul par « Vérifier et brancher Stripe » à l'adresse `https://<SITE_URL>/api/stripe/webhook` (il faut donc un site public en https). Stripe Tax et les inscriptions TPS/TVQ sont à valider avec un comptable.

### 1.14 Fournisseur de modèles

- Décision du fondateur (29/10/2026) : **DeepInfra héberge tous les modèles** ; clé `llm.deepinfra` au Coffre ; chargement par `bun run --cwd web models:seed` (tous en « aperçu » tant que la clé n'est pas posée) ; taux de change USD→CAD à faire **approuver** dans le module Modèles. OpenRouter n'est qu'une route de secours désactivée. Le fondateur fixe lui-même les prix (marge visée 10 %, plancher 10 %).

### 1.15 Produit VPS (Proxmox client)

- Le worker parle à l'API d'un serveur Proxmox (port 8006) avec un jeton `nexora@pve!…` (21 privilèges, pool `nexora`), puis installe l'application par SSH dans un bloc d'adresses IPv4 fixes. **Jamais essayé contre un vrai Proxmox** (`docs/guide-operateur.md` §7) ; test de contrat prêt (`PROXMOX_CONTRACT_URL`…). Les offres en libre-service ne sont « pas ouvertes à la vente » (affirmation CL-12).

### 1.16 Hors périmètre d'exécution mais à connaître

- **GitLab pc4** (`https://pc4.tail0c55ff.ts.net`, privé, projets 5 `nexora-workstudio`, 6 `nexora-web`, 19 `nexora-code-agent`) : source de vérité du code et registre de paquets ; CI de sécurité commune (gitleaks, Semgrep, Trivy, SonarQube, runner k3s `pc4-k3s-local`). Joint par le réseau Tailscale seulement ; **pas d'accès SSH à pc4**, donc sa configuration et ses sauvegardes sont **NON VÉRIFIÉES**.
- **Tailscale sur pc6** : `tailscaled` en mode « userspace-networking » avec un mandataire SOCKS5 sur `127.0.0.1:1055` et un mandataire HTTP sur `127.0.0.1:1056` (**VÉRIFIÉ** par `ps`). Outil de développement.
- **Autres conteneurs de pc6** (`infratechca-*`, `jeuxvideoca-*`, `agent-forge-*`) : sans rapport avec Nexora, à ne pas confondre.

---

## 2. Topologie proposée sur Proxmox

**En clair.** On sépare ce qui est exposé à Internet, ce qui garde les données, et ce qui exécute du code d'autrui. Trois machines virtuelles au départ, un pare-feu qui refuse tout par défaut, et un seul point d'entrée public (le proxy HTTPS).

### 2.1 Machine virtuelle ou conteneur LXC

**Proposition (ESTIMATION À VALIDER)** : des **machines virtuelles** pour tout ce qui exécute Docker. La documentation officielle de Proxmox recommande de faire tourner les conteneurs d'application (Docker) dans une VM plutôt que dans un LXC (citée de mémoire, à relire dans le guide d'administration de Proxmox VE) ; ici s'ajoutent Chromium sans bac à sable (§1.7), le socket Docker (WorkStudio `code-sandbox`, Nexora Code) et du code d'utilisateurs : l'isolation d'un noyau distinct vaut le surcoût. Un LXC reste acceptable pour un service sans Docker (par exemple un serveur de sauvegarde ou un relais), au choix du technicien. Système invité : Debian 12 ou Ubuntu 24.04 (ce sont ceux que le dépôt connaît, `docs/vps/guide-branchement-proxmox.md`) ; choix **ESTIMATION À VALIDER**.

### 2.2 Machines proposées

| VM | Contenu | Réseau | Pourquoi |
|---|---|---|---|
| **`pile`** | proxy HTTPS (Caddy ou nginx), site, worker, PostgreSQL, Directus, LiteLLM, SearXNG, service navigateur WebPilot (tous sauf WorkStudio et Nexora Code) | VLAN applicatif ; seule la VM porte l'entrée Internet (80/443) | reprend exactement `deploy/compose.yml` + `compose.prod.yml` + deux fichiers à écrire pour le site et le worker |
| **`workstudio`** | pile WorkStudio complète (§1.9) | VLAN applicatif, aucune entrée directe : tout passe par le proxy | pile Compose indépendante, base propre, socket Docker du `code-sandbox` en root, empreinte mémoire élevée, cycle de mise à jour distinct |
| **`sauvegarde`** (ou Proxmox Backup Server, ou machine externe) | cible des sauvegardes de VM et des archives chiffrées | VLAN de sauvegarde, accessible en écriture seule depuis les autres | une sauvegarde sur la machine qui tombe ne sert à rien (**DÉCISION** : où, §2.8) |
| **`code`** (phase 3, optionnelle) | démon Docker dédié aux environnements Nexora Code | VLAN isolé, sortie limitée à la passerelle | le code d'utilisateurs ne doit pas partager le noyau de la base ; **exige un changement de code** (ÉCART n° 3, §7) |
| **Proxmox du produit VPS** (phase 3, optionnelle) | VM vendues aux clients | VLAN clients, bloc d'adresses fixes | ne pas vendre des VM sur l'hyperviseur qui porte l'infrastructure interne ; un autre nœud, ou au minimum un autre pool, un autre VLAN et une capacité réservée |

Pourquoi `code` n'est pas en phase 1 : Nexora Code n'a jamais lancé un vrai conteneur (`docs/nexora-code.md` §10), la décision du fondateur du 30/10 dit que l'on attend de voir un vrai environnement tourner avant de l'allumer, et il reste éteint par défaut (`NEXORA_PRODUCT_CODE`). On met donc le site en service **sans** Nexora Code, puis on décide de son hébergement à l'étape 15.

### 2.3 Schéma

```
Internet ──80/443──▶ [ proxy HTTPS sur VM « pile » ] ───────────────────────────────┐
                        │  /, /v1, /api/*, /compte      ──▶ site :3500 (réseau nexora-internal)
                        │  cms.<domaine>   (accès restreint VPN/liste) ──▶ Directus 127.0.0.1:8456
                        │  studio.<domaine> ─────────────▶ VM « workstudio » : WorkStudio :3000, realtime :3002
                        │  *.code.<domaine> (phase 3)    ──▶ site (origine dédiée Nexora Code)
                        ▼
   VM « pile », réseau Docker nexora-internal (sans route vers l'extérieur) :
        site ◀──▶ PostgreSQL ◀──▶ Directus ◀──▶ worker ◀──▶ LiteLLM
        site/worker ──▶ nexora-webpilot-search (SearXNG) ; nexora-webpilot-browser (navigateur)
   Sorties contrôlées (réseaux « egress ») : LiteLLM ──▶ DeepInfra ; site/worker ──▶ Stripe, SMTP, HIBP ;
        Directus ──▶ SMTP ; SearXNG et navigateur ──▶ Web public (adresses privées interdites)
   VM « sauvegarde » ◀── archives chiffrées + sauvegardes de VM (écriture seule)
   VLAN gestion : interface Proxmox :8006 et SSH, accessibles par VPN seulement
```

### 2.4 Réseaux et VLAN (proposition, ESTIMATION À VALIDER)

| Réseau | Contenu | Règle d'entrée | Règle de sortie |
|---|---|---|---|
| **Public / DMZ** | l'adresse IP publique du proxy | 80 et 443 seulement | — |
| **Applicatif** | VM `pile`, `workstudio`, (`code`) | depuis le proxy seulement | liste blanche (§2.6) |
| **Données** | PostgreSQL (si séparé plus tard) | depuis l'applicatif, port 5432 | aucune |
| **Sauvegarde** | VM `sauvegarde` | écriture depuis l'applicatif | aucune vers l'applicatif |
| **Gestion** | Proxmox :8006, SSH d'administration | VPN d'administration | mises à jour |
| **Clients VPS** (phase 3) | bloc IPv4 fixe des VM vendues | pare-feu Proxmox par VM (SSH seulement) | port 25 sortant fermé ; aucune route vers les autres réseaux |

Les trois couches de pare-feu de Proxmox (centre de données, nœud, VM) existent et se combinent ; le technicien pose « refuser par défaut » aux trois niveaux. **NON VÉRIFIÉ ici** (aucun Proxmox installé).

### 2.5 Qui parle à qui (ports)

| De | Vers | Port | Remarque |
|---|---|---|---|
| Internet | proxy | 80, 443 | seul point d'entrée |
| proxy | site | 3500 | écrase `X-Forwarded-For` ; ne publie **pas** `/api/admin/*` ni `/api/revalidate` |
| proxy | Directus | 8456 (hôte) → 8055 | réservé à une liste d'adresses ou au VPN |
| proxy | WorkStudio / realtime | 3000 / 3002 | `/socket.io/*` vers 3002 (`Caddyfile` de WorkStudio), flux non tamponné pour `/v1` |
| site, worker | PostgreSQL | 5432 | base `app` (rôle `nexora`) |
| Directus | PostgreSQL | 5432 | base `directus` (rôle `directus`) |
| LiteLLM | PostgreSQL | 5432 | base `litellm` (rôle `litellm`) |
| Directus | site | 3500 | `NEXORA_APP_INTERNAL_URL` (revalidation, Coffre) avec `NEXORA_APP_ADMIN_TOKEN` |
| worker | site | 3500 | agents du site, RAG (`/api/admin/rag/index`), Nexora Code (`/api/admin/code/usage`) |
| site, worker | Directus | 8055 | `DIRECTUS_URL`, jetons statiques |
| site, worker | LiteLLM | 4000 | `LITELLM_BASE_URL` ; le site a `LITELLM_MASTER_KEY`, le worker l'adresse seule |
| site, worker | SearXNG | 8080 | `WEBPILOT_SEARCH_URL` |
| site, worker | navigateur WebPilot | 8700 | `WEBPILOT_BROWSER_URL` + secret partagé |
| LiteLLM | DeepInfra | 443 | `api.deepinfra.com` |
| site | Stripe | 443 | `api.stripe.com` ; Stripe appelle le webhook en entrée |
| site, worker, Directus | SMTP | 587 ou 465 | fournisseur à choisir |
| site | HIBP | 443 | `api.pwnedpasswords.com` (5 caractères d'empreinte seulement) ; `NEXORA_PASSWORD_BREACH_CHECK=off` pour couper |
| worker | IndexNow, Bing | 443 | `api.indexnow.org`, `ssl.bing.com`, seulement quand `SITE_ENV=production` |
| WorkStudio | site | 443 | OIDC (`/api/auth/*`), `/api/oauth/workstudio-access`, passerelle `/v1` |
| site | WorkStudio | 443 | agents hébergés (adresse de l'instance) |
| worker | Proxmox (VPS) | 8006 | seulement si le produit VPS est ouvert |
| worker | VM clientes | 22 | installation des applications |

### 2.6 Pare-feu : sorties autorisées (liste blanche proposée)

Hôtes nommés dans `docs/recette/flux-sortants.md` et le code : `api.stripe.com`, `api.deepinfra.com`, le serveur SMTP choisi, `api.pwnedpasswords.com`, `api.indexnow.org`, `ssl.bing.com`, les autres adaptateurs SEO activés (`api.dataforseo.com`, `www.googleapis.com`, `oauth2.googleapis.com`), `acme-v02.api.letsencrypt.org` (certificats), les registres d'images (`docker.io`, `ghcr.io`, `mcr.microsoft.com`) **pendant les mises à jour seulement**, et le dépôt de paquets du système. Le service navigateur et SearXNG, eux, doivent pouvoir joindre le Web public : ils restent sur leurs réseaux `egress` dédiés avec la règle `DOCKER-USER` qui leur interdit les plages privées (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, `docs/webpilot.md`). L'audit des liens nocturne (lychee) contacte **tous les hôtes liés** par les pages : à restreindre ou à accepter en connaissance de cause (K6 de `flux-sortants.md`).

### 2.7 Dimensionnement indicatif — ESTIMATION À VALIDER

**Le matériel n'est pas connu et aucune mesure de charge n'a été faite.** Les chiffres ci-dessous sont des formules tirées des limites réellement posées dans les fichiers Compose, pas des mesures de production.

**Mesures au repos (VÉRIFIÉ, `docker stats`, 30/10/2026, pc6 sans trafic réel)** : PostgreSQL 199 MiB, Directus 305 MiB, LiteLLM 522 MiB, SearXNG 113 MiB ; processus worker environ 286 Mio, `next-server` 16.4.3 entre 130 et 270 Mio (deux instances vues, attribution non vérifiée) ; WorkStudio (pc1) : application 924 MiB, temps réel 36 MiB, le reste au repos sous 30 MiB chacun. **Aucune de ces valeurs ne représente une charge client.**

**Plafonds posés dans les fichiers** : base 2 Go, Directus 1 Go, LiteLLM 2 Go, SearXNG 512 Mo, navigateur 2 Go et 2 CPU (+ `/tmp` 768 Mo), environnement Nexora Code 2 Go et 1 CPU **par personne active**, Presidio (`pii`) 1 Go.

| VM | Mémoire (formule) | Proposition de départ | Disque (formule) |
|---|---|---|---|
| `pile` | somme des plafonds (2 + 1 + 2 + 0,5 + 2 = 7,5 Go) + site + worker (réserve 2 Go chacun, à mesurer) + système et cache disque (4 Go) | **16 Go**, 4 à 6 vCPU | système 40 Go + base (croissance inconnue) + fichiers Directus + journaux ; départ **150 à 250 Go** |
| `workstudio` | application ~1 Go + base + redis + Connect + Ollama (embeddings) + `pii` 1 Go + voix (modèle ~500 Mo) | **16 Go**, 4 à 8 vCPU | système 40 Go + volumes (dépôts de documents des clients) ; départ **150 Go** |
| `code` (phase 3) | **2 Go × nombre d'environnements actifs en même temps** + 4 Go | à fixer avec le fondateur | **somme des Go vendus × facteur de sur-souscription** + marge |
| `sauvegarde` | 4 Go | — | volumes de données × nombre de copies conservées (§5) |

Règle d'espace disque produit (VÉRIFIÉ dans `docs/credits-et-offres.md`) : l'offre « Nexora Base » suggérée donne 1 Go, « Pro » 10 Go, « Équipe » 50 Go (prix **suggérés**, non publiés). Le disque à prévoir pour Nexora Code, RAG et WorkStudio dépend du nombre de clients espéré : **inconnu**. Le RAG ne compte pas ses index (HNSW, plein texte) dans l'espace facturé : à mesurer avant de fixer un prix (`docs/rag.md`).

**Compilation** : ne jamais compiler WorkStudio sur la VM de production (plus de 28 Go de mémoire). Compiler sur pc1 (45 Go de RAM, amd64) ou sur un poste de build dédié, puis charger les images.

### 2.8 À décider avant de commencer

1. **Domaine et DNS (bloquant).** Nom de domaine, registraire, fournisseur DNS. Le certificat joker `*.code.<domaine>` de Nexora Code exige le défi DNS (ACME DNS-01) : il faut un fournisseur DNS dont l'API est utilisable par le proxy (**NON VÉRIFIÉ** : fournisseur inconnu). Le dépôt donne comme exemples `www.exemple.ca`, `cms.exemple.ca`, `studio.exemple.ca` (`deploy/.env.example`) : ce sont des **exemples**, pas des noms décidés.
2. **Matériel, nombre de serveurs et lieu.** Combien de serveurs Proxmox (un seul = pas de reprise automatique ; deux ou plus = grappe, ou serveur de secours) ; processeur **x86-64 avec virtualisation** (exigé) ; type de disques (SSD NVMe conseillé, ESTIMATION) ; **lieu physique au Québec ?** Les affirmations CL-02, CL-13, CL-81 et CL-E02 en dépendent (§6.3).
3. **Adresse IP publique.** Une adresse fixe pour le proxy ; un bloc d'adresses distinct pour le produit VPS (phase 3, adresses fixes, hors DHCP). Connexion Internet (débit, double lien ?) : inconnu.
4. **Comptes externes** : Stripe (compte et pays Canada, Stripe Tax, TPS/TVQ), fournisseur SMTP, DeepInfra (clé, plafond de dépense), clé **Open Innovation Grant** de Directus (délai de réponse inconnu), registre d'images.
5. **Stockage et sauvegarde** : où sont les copies hors site (au Québec ?), combien de temps on conserve, quelle perte de données on tolère (RPO) et quel arrêt (RTO).
6. **Source du code déployé** : les VM doivent-elles joindre GitLab pc4 (par Tailscale) ou ne recevoir que des images d'un registre ? Je recommande de **ne jamais mettre le code source ni les jetons GitLab sur les serveurs de production** : construire sur pc1, pousser dans un registre privé, les VM ne font que `docker pull` (**ESTIMATION À VALIDER**). Où est ce registre : **NON VÉRIFIÉ** (le registre de paquets génériques du projet 5 est utilisé ; le registre d'images de conteneurs de pc4 n'a pas été vérifié).
7. **Périmètre du premier jour** : site + passerelle + WorkStudio ; avec ou sans RAG ; Nexora Code, WebPilot et VPS plus tard.
8. **Où tourne le site** : conteneur (conforme à `compose.prod.yml`, recommandé, deux Dockerfiles à écrire) ou service systemd sur l'hôte (chemin éprouvé sur pc6, mais PostgreSQL et SearXNG doivent alors être publiés sur la boucle locale, ce qui affaiblit l'isolation prévue). Voir §7, ÉCART n° 1.

### 2.9 Évolution en phases

- **Phase 1** : VM `pile` + VM `workstudio` + sauvegardes. Site fermé puis test.
- **Phase 2** : ouverture publique, paiements réels après accord, RAG si les modèles d'embedding sont « en service ».
- **Phase 3** : VM `code` (Nexora Code), Proxmox séparé pour le produit VPS, PostgreSQL sur sa propre VM si la charge le justifie.

---

## 3. Éléments de développement à NE PAS reproduire en production

Tout ce qui suit existe aujourd'hui sur pc6 ou pc1 (VÉRIFIÉ sauf mention).

| Élément | Où il se trouve | Pourquoi ne pas le reproduire | Remplacement en production |
|---|---|---|---|
| **stripe-mock** | service `stripe-mock` de `deploy/compose.yml` (passe au profil `dev` avec `compose.prod.yml`) ; variables `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_API_BASE_URL` des fichiers `.env` | simulateur, aucun paiement réel ; ces variables sont **ignorées** hors développement | Stripe réel : clé `stripe.secret_key` et `stripe.webhook_secret` au **Coffre**, « Vérifier et brancher Stripe ». Mode test d'abord, sur le vrai domaine |
| **Mailpit** | service `mailpit` (profil `dev` en production) ; `SMTP_HOST` de `.env` | boîte de courrier factice | SMTP réel : `SMTP_URL` + `MAIL_FROM` (site), `SMTP_*` + `SMTP_PASSWORD_FILE` (worker), `EMAIL_*` (Directus, **ÉCART n° 2**), `NEXORA_SMTP_*` (WorkStudio) ; SPF, DKIM, DMARC du domaine |
| **Modèle `nexora/essai-dev`**, fournisseur `dev-litellm`, référence `litellm.dev-upstream`, taux de change 1,40, modèle `nexora/glm-5-3`, `dev/cloud-glm-5-3` de `deploy/litellm/config.yaml`, `PC1_UPSTREAM_URL` / `PC1_UPSTREAM_KEY`, écritures `dev_test_credit` | base `app_demo` de la démo, `deploy/litellm/config.yaml`, `deploy/.env` (`docs/restauration.md` « Données d'essai de la démo ») | prix fictifs, amont = LiteLLM de pc1 | Fournisseur **DeepInfra** (`llm.deepinfra`), taux de change approuvé, `models:seed`, « Passer en service » ; retirer la ligne de `config.yaml` ; **aucun crédit de test** en base de production |
| **Mandataire SOCKS de Tailscale** | `tailscaled --tun=userspace-networking --socks5-server=127.0.0.1:1055 --outbound-http-proxy-listen=127.0.0.1:1056` sur pc6 | contournement d'une machine sans interface réseau Tailscale ; sert à joindre `pc4.tail0c55ff.ts.net` | un vrai réseau ; le code n'a pas besoin d'atteindre le tailnet en production (§2.8, point 6). Utilisation par le code du site : aucune trouvée par `grep` (**NON VÉRIFIÉ** pour les scripts personnels) |
| **Tailscale Funnel / Serve** | `https://gx10-e526.tail0c55ff.ts.net:10000` (Funnel, public), ports 3402, 3443, 3400, 18881 (Serve, tailnet) | adresse de démonstration ; `SITE_URL` de la démo en dépend ; `/api/admin` et `/api/revalidate` y sont bloqués à la main (DOCUMENTÉ) | proxy HTTPS de l'étape 3 avec certificat Let's Encrypt (ou équivalent) et les règles de `docs/guide-operateur.md` §9 |
| **Ponts SSH et relais** | `litellm-pc1-pont.service`, `workstudio-pont.service`, `nexorasite-admin-pont.service` (socat `172.17.0.1:3500`), `compose.pc1.yml` (réseau `agentos-litellm_backend`) | ponts vers pc1 et vers l'adresse de la passerelle Docker de pc6 | adresses internes stables : `NEXORA_APP_INTERNAL_URL=http://<service du site>:3500`, `LITELLM_BASE_URL=http://litellm:4000`, WorkStudio par son adresse https ; plus de `host.docker.internal` (`compose.prod.yml` retire `extra_hosts`) |
| **Jetons et comptes de développement** | `deploy/.env` généré par `deploy/init-env.sh` (`DIRECTUS_ADMIN_EMAIL=admin@example.com`, `DIRECTUS_EDITOR_*`, `DIRECTUS_REVIEWER_*`, `DIRECTUS_ADMIN_TOKEN`), `worker/scripts/dev-provision-agents.ts`, compte `essai-sso@nexora.test`, `admin@nexora.test` (WorkStudio), clés `nxk_` d'essai, `scripts/dev/.secrets` | secrets réutilisés ou de valeur connue | **tout régénérer** sur la machine cible ; ne copier aucun fichier `.env` de pc6 ; comptes de service des agents créés à la main (guide §5) |
| **Unités systemd de démonstration** | `~/.config/systemd/user/nexorasite-demo.service.d/base.conf` et `workstudio.conf` | elles portent des **secrets en clair dans l'unité** (mot de passe de base de données dans `DATABASE_URL`, secret du client OIDC) : lisibles par `systemctl show` | `EnvironmentFile=` en mode 0600 (ou secrets Docker), jamais de secret dans l'unité |
| **`NEXORA_OUTBOUND_ALLOW=127.0.0.0/8`**, `NEXORA_SECRET_HOSTS_MODEL_PROVIDER=127.0.0.1` | `workstudio.conf` de la démo | ouvrent la boucle locale aux fournisseurs et aux clés | ne pas poser `NEXORA_OUTBOUND_ALLOW` (ou y mettre le strict nécessaire : l'hôte interne de WorkStudio) ; `NEXORA_SECRET_HOSTS_WORKSTUDIO=<hôte de WorkStudio>` ; `NEXORA_SECRET_HOSTS_PROXMOX=<hôte Proxmox>` seulement si le produit VPS est ouvert |
| **Variables de démo** | `WORKSTUDIO_REQUIRE_SUBSCRIPTION=false` (ancien nom de `WORKSTUDIO_REQUIRE_CREDITS=false`), `WORKSTUDIO_DEFAULT_MODEL=nexora/essai-dev`, `WEBPILOT_SEARCH_URL=http://127.0.0.1:8890`, `SITE_URL` du Funnel, `NEXORA_CODE_DRIVER=docker-dry-run`, `NEXORA_CODE_ALLOW_SAME_ORIGIN_UI`, `NEXORA_PASSWORD_BREACH_CHECK=off`, `CMS_ENFORCE_TFA=0`, `DIRECTUS_COOKIE_SECURE=false`, `E2E_ALLOW_APP=1` | coupent des protections | crédits exigés (défaut), modèle réel, URL internes, pilote `docker` seulement en phase 3, vérification des fuites **active**, 2FA exigée, témoins `Secure` |
| **Ports publiés de `compose.yml`** | `127.0.0.1:15440` (base), `:4400` (LiteLLM), `:8456`, `:8890`, `:8700`, `:12111`, `:1026`, `:8026` | exposition inutile | `compose.prod.yml` retire ceux de la base et de LiteLLM et de SearXNG ; **à vérifier** : `webpilot-browser` garde `127.0.0.1:8700` (non réinitialisé) |
| **Données de démonstration** | plans VPS `[DEV]` (`dev-essai-1`, `-2`, `-4`), serveur simulé `dev-simule`, simulateur Proxmox, bases `app_demo`, `app_s9`, `nexora_test_*` | ne doivent pas exister en production ; la garde de publication refuse un plan de développement si `NODE_ENV=production` | partir d'une base **neuve** ; ne jamais restaurer la base de la démo |
| **Pile WorkStudio de pc1** | `nexora-x86-*`, `agentos-litellm-*` | pile de vérification | pile WorkStudio neuve avec secrets neufs (`scripts/init-env.sh`) |
| **Images `:local` sans empreinte** | `nexora/workstudio:local`, etc., `nexora/webpilot-browser:local` | non vérifiables | registre privé, étiquettes de version, empreintes notées ; `deploy/tests/env.test.sh` exempte déjà ces noms |
| **Accès aux dépôts par Tailscale** | `pc4.tail0c55ff.ts.net` | les serveurs de production n'ont pas à joindre GitLab | images prêtes depuis un registre (§2.8, point 6) |
| **Directus : licence non posée** | aucune clé OIG | palier Core : 3 sièges, 25 collections, pas de règles de permission | clé OIG (`LICENSE_KEY`), puis relancer `cms/scripts/apply.ts` ; le site filtre toujours `status = published` |

---

## 4. Ordre de mise en service

Chaque étape donne : ce qu'on fait, **comment savoir que c'est bon**, le **retour arrière**, et ce qui **exige le fondateur**. Les commandes viennent des scripts du dépôt ; celles que je propose sans qu'elles existent sont marquées « à écrire ».

**Trois états du site** : **fermé** (étapes 1 à 12 : accès par VPN ou liste d'adresses au proxy, `SITE_ENV` non posé donc `noindex`), **test** (étapes 13 à 18 : testeurs invités, Stripe en mode test), **public** (étape 20 : `SITE_ENV=production`, paiements réels après votre accord).

### Étape 1 — Décisions et comptes (fondateur)

- **Actions** : trancher les points du §2.8 ; ouvrir les comptes (domaine, DNS, Stripe, SMTP, DeepInfra) ; demander la clé Open Innovation Grant de Directus (https://directus.com/oig, moins de 5 M$ de revenus et moins de 50 employés, selon `docs/guide-operateur.md` §13).
- **Vérification** : un fichier de décisions daté, signé du fondateur, listant domaine, matériel, lieu, fournisseurs.
- **Retour arrière** : sans objet.
- **Exige le fondateur** : tout.

### Étape 2 — Installer Proxmox et préparer le réseau (technicien)

- **Actions** : Proxmox VE 9.0 ou plus récent sur le matériel retenu (version minimale exigée par le branchement VPS) ; ponts et VLAN du §2.4 ; stockage ; comptes d'administration nominatifs avec double authentification (§6) ; pare-feu « refuser par défaut » aux trois niveaux ; dépôts de mises à jour ; cible de sauvegarde.
- **Vérification** : `pveversion` ≥ 9.0 ; depuis Internet, seuls 80 et 443 de l'adresse du proxy répondent (`nmap` depuis l'extérieur) ; l'interface :8006 ne répond pas depuis Internet ; une VM de test se sauvegarde puis se restaure.
- **Retour arrière** : réinstaller (aucune donnée de production à ce stade).
- **Exige le fondateur** : choix de l'abonnement Proxmox (dépôt « enterprise » payant ou « no-subscription » gratuit : coût inconnu, **DÉCISION**).

### Étape 3 — Créer les VM, le système, Docker et le proxy HTTPS (technicien)

- **Actions** : VM `pile` et `workstudio` (§2.7) ; Debian 12 ou Ubuntu 24.04 ; **Docker Engine avec Compose v5.2 ou plus récent** (le paquet Ubuntu 2.40 échoue sur les variables « requises » de `compose.yml` : `docs/restauration.md` ; pc6 a Docker 29.6.2 et Compose v5.2.0) ; Node 24 et Bun 1.4.2 seulement sur la machine qui fait les migrations ; mises à jour automatiques de sécurité ; synchronisation de l'heure. Proxy HTTPS (**à écrire**, `docs/guide-operateur.md` §9) : redirection http vers https ; certificat renouvelé automatiquement ; **écraser** `X-Forwarded-For` ; **ne pas publier** `/api/admin/*` ni `/api/revalidate` ; Directus derrière une liste d'adresses ou le VPN ; refuser `TRACE`, `TRACK`, `CONNECT` ; limiter le débit sur `/api/auth/*`, `/api/contact`, `/api/stripe/webhook`, `/v1/*` ; retirer `X-Powered-By` pour Directus ; ne pas retirer les en-têtes de sécurité du site. Commencer avec le certificat **de test** de l'autorité (staging), puis le vrai.
- **Vérification** : `docker version`, `docker compose version` (≥ v5.2) ; `curl -I https://<domaine>` renvoie une page d'erreur propre, certificat valide ; depuis Internet, `/api/admin/` renvoie un refus du proxy.
- **Retour arrière** : supprimer la VM (rien de précieux dedans).
- **Exige le fondateur** : le domaine et l'accès DNS de l'étape 1.

### Étape 4 — Secrets de production (technicien, présence du fondateur pour la copie hors ligne)

- **Actions** : créer `/etc/nexora/secrets/` (dossier 0700, propriétaire root) ; y écrire **sans retour à la ligne final** (`printf '%s' "$(openssl rand -hex 24)" > fichier`) : `postgres_password`, `directus_db_password`, `litellm_db_password`, `umami_db_password`, `directus_secret`, `directus_admin_password`, `nexora_app_admin_token` (32 caractères au moins), `litellm_salt_key`, et `litellm_master_key` (préfixe `sk-`) ; valeurs hexadécimales (le mot de passe de la base est inséré dans une URL de connexion par l'entrypoint de LiteLLM). Générer `NEXORA_VAULT_MASTER_KEY` (`openssl rand -base64 32`) et `BETTER_AUTH_SECRET` ; `WEBPILOT_BROWSER_SECRET` (`openssl rand -hex 32`). Fichiers en 0444 dans un dossier 0700 (les lecteurs ont des utilisateurs différents : `docs/infra.md`). Écrire `deploy/prod.env` (**chemins** et réglages publics seulement : `DIRECTUS_PUBLIC_URL`, `DIRECTUS_CORS_ORIGIN`, `DIRECTUS_ADMIN_EMAIL`, `NEXORA_APP_INTERNAL_URL`, `*_FILE`). **N'utiliser ni `deploy/init-env.sh` ni aucun fichier de pc6** : ce script de développement écrit les secrets dans `deploy/.env` et la clé du LiteLLM de pc1. Un script de génération de production **n'existe pas** (à écrire).
- **Valeurs qui ne peuvent jamais être perdues** : `NEXORA_VAULT_MASTER_KEY`, `BETTER_AUTH_SECRET` (chiffre aussi les seconds facteurs et la clé de signature OIDC), `DIRECTUS_SECRET`, `LITELLM_SALT_KEY`, les clés de sauvegarde (chiffrement et signature). **Copie hors serveur** dans un gestionnaire de mots de passe d'équipe, avec le fondateur.
- **Vérification** : `ls -l /etc/nexora/secrets` (modes) ; `git status` du dépôt cloné : rien de suivi ; après le démarrage, `docker inspect` ne montre aucune valeur secrète pour `db`, `directus`, `litellm` (propriété vérifiée par le dépôt).
- **Retour arrière** : régénérer **avant** toute donnée ; après, une valeur perdue = donnée perdue (§5).
- **Exige le fondateur** : conserver sa copie de la clé maîtresse du Coffre.

### Étape 5 — Pile de données : PostgreSQL, Directus, LiteLLM, SearXNG (technicien)

- **Prérequis dépôt** : corriger l'**ÉCART n° 2** (courriel de Directus) et l'**ÉCART n° 7** (modèle de développement de LiteLLM) avant de démarrer.
- **Actions** : charger les images (par empreinte ; images multi-architecture, tirer pour amd64) ; `bun run --cwd deploy test` (tests statiques du compose, 38 pour l'environnement) ; `docker compose -p nexorasite -f deploy/compose.yml -f deploy/compose.prod.yml --env-file deploy/prod.env up -d`.
- **Vérification** : `docker compose ps` : `db`, `directus`, `litellm` « healthy » ; `GET /server/ping` de Directus ; `GET /health/liveliness` de LiteLLM ; `bash deploy/harden-db-roles.sh --check --container <conteneur db>` renvoie 0 (rôles sans privilège, `PUBLIC` ne se connecte plus à `app`) ; `docker port` : aucun port publié pour `db` et `litellm`.
- **Retour arrière** : `docker compose … down` ; volume `db` à supprimer seulement si aucune donnée n'a été saisie.
- **Exige le fondateur** : rien.

### Étape 6 — Directus : licence, schéma, comptes, contenu (technicien, fondateur pour la licence)

- **Actions** : poser `LICENSE_KEY` si la clé OIG est arrivée ; première connexion de l'administrateur : **« Ignorer » ou « Rappeler plus tard » pour la licence MSCL**, tant que le fondateur n'a pas décidé ; `bun run cms/scripts/apply.ts` (schéma, rôles, jetons Lecteur et Publication ; **créer d'abord un `DIRECTUS_ADMIN_TOKEN`** avant d'activer la 2FA de l'administrateur) ; `bash cms/scripts/stage-extensions.sh` puis redémarrer Directus ; `bun run cms/scripts/seed.ts` ; `cms/scripts/load-content.ts` (contenus chargés « en revue » : rien n'est publié sans approbation humaine) ; comptes Éditeur et Relecteur avec 2FA ; comptes de service des cinq agents et leurs jetons déposés au Coffre (guide §5).
- **Vérification** : `GET /license` de Directus (palier attendu : sans clé, 25 collections) ; connexion de l'Éditeur avec 2FA ; le site lit une page publiée ; `essai-garde.ts` (garde de publication) si le technicien l'a prévu (59/59 constaté en recette).
- **Retour arrière** : restaurer la sauvegarde de la base `directus` (étape 17). Sans données, recréer.
- **Exige le fondateur** : demande et acceptation de la licence (OIG, MSCL-1.0-GPL, propriétaire du projet), approbation des textes.

### Étape 7 — Migrations de la base `app` (technicien)

- **Actions** : sur une machine avec Node 24 et Bun 1.4.2 et accès à PostgreSQL : `DATABASE_URL=… bun run db:migrate` (`packages/db/src/migrate-cli.ts`). **30 migrations** (0000 à 0029) dans `packages/db/drizzle/` ; la 0028 crée l'extension `vector` (superutilisateur requis).
- **Vérification** : la table `__drizzle_migrations` (ou équivalent) compte 30 lignes ; `CREATE EXTENSION vector` déjà présente ; `GET /api/health` (étape 8) répond 200.
- **Retour arrière** : restaurer la sauvegarde d'avant migration (faire un `pg_dump` avant, toujours). Ne jamais éditer une migration appliquée.
- **Exige le fondateur** : rien.

### Étape 8 — Site et worker en production fermée (technicien)

- **Prérequis dépôt (ÉCART n° 1)** : deux Dockerfiles (site, worker) et un fichier Compose qui les rattache à `nexora-internal`, `nexora-webpilot-search`, `nexora-webpilot-browser` et à un réseau de sortie, avec le patron « entrypoint qui lit `/run/secrets/…` » de `compose.prod.yml` pour les secrets que le site lit en variable. **À écrire**. Alternative éprouvée : services systemd sur l'hôte, avec les compromis du §2.8 point 8.
- **Actions** : `SITE_URL=https://<domaine>` **avant** `next build` ; `NEXT_TELEMETRY_DISABLED=1` ; variables obligatoires (§1.1, `docs/guide-operateur.md` §3) : `DATABASE_URL`, `NEXORA_APP_ADMIN_TOKEN`, `NEXORA_VAULT_MASTER_KEY`, `BETTER_AUTH_SECRET`, `DIRECTUS_URL`, `DIRECTUS_READER_TOKEN`, `DIRECTUS_PUBLISHER_TOKEN`, `NEXORA_APP_INTERNAL_URL`, `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY`, `CMS_SNAPSHOT_DIR` (volume persistant), `NODE_ENV=production` ; **ne pas poser `SITE_ENV=production`** (site non indexable) ; écoute `-H localhost` (hôte) ou `0.0.0.0` (conteneur), jamais `127.0.0.1`. Worker : mêmes `DATABASE_URL`, `NEXORA_VAULT_MASTER_KEY`, `DIRECTUS_URL`, `NEXORA_APP_INTERNAL_URL`, `SITE_URL`, `SMTP_*`. Hôtes autorisés pour les clés : `NEXORA_SECRET_HOSTS_*` identiques dans le site **et** le worker.
- **Vérification** : `GET /api/health` → 200 (503 si la base ne répond pas) ; `BASE_URL=https://<domaine> bun web/scripts/check-guards.ts` (gardes d'accès et en-têtes) ; `BASE_URL=https://<domaine> bun web/scripts/audit-flux.ts` (aucune requête hors origine) ; `curl -s https://<domaine>/robots.txt` doit afficher `Disallow: /` ; pages fr-CA sans boucle de redirection ; `/api/admin/` inaccessible de l'extérieur ; journaux JSON sur la sortie standard sans secret.
- **Retour arrière** : arrêter le site et le worker d'abord, puis Directus, puis PostgreSQL (ordre d'arrêt du guide). Remettre l'image précédente.
- **Exige le fondateur** : rien.

### Étape 9 — Le Coffre, DeepInfra, le catalogue (fondateur + technicien)

- **Actions** : déposer au Coffre (module Directus « Coffre » ou `POST /api/admin/vault`) : `llm.deepinfra` (type `llm_provider`) ; module **Modèles** : fournisseur DeepInfra, **« Tester le fournisseur »**, activation, **taux de change USD→CAD approuvé** ; `bun run --cwd web models:seed` ; `bun run --cwd web house:org` (organisation « maison » gratuite) ; « Passer en service » pour chaque modèle retenu ; publier une version du catalogue (synchronisation vers LiteLLM) ; vérifier la **résidence** affichée de chaque modèle (déclaration saisie dans la fiche).
- **Vérification** : « Tester le fournisseur » réussit ; `GET /v1/models` avec une clé de test liste le modèle ; un appel `POST /v1/chat/completions` d'un compte de test débite le grand livre (`usage_events` sans contenu) ; `docker logs` de LiteLLM ne contient aucun contenu de requête.
- **Retour arrière** : désactiver le fournisseur (aucun appel ne part) ; retirer un modèle publie tout de suite une nouvelle version du catalogue. Révoquer la clé chez DeepInfra si elle a fui.
- **Exige le fondateur** : la clé DeepInfra, les **prix de vente** (aucun prix inventé), l'approbation du taux de change, la décision « maison ».

### Étape 10 — Courriel réel (technicien + fondateur)

- **Actions** : SMTP du fournisseur choisi sur les quatre points du §1.12 ; enregistrements **SPF, DKIM, DMARC** du domaine d'envoi.
- **Vérification** : une inscription de test reçoit le courriel de vérification ; une demande du formulaire de diagnostic arrive à `CONTACT_NOTIFY_TO` ; une réinitialisation de mot de passe de **Directus** arrive aussi (c'est la preuve que l'ÉCART n° 2 est corrigé) ; l'en-tête du message passe SPF et DKIM chez un destinataire de test.
- **Retour arrière** : revenir à un compte de messagerie de test.
- **Exige le fondateur** : choix et ouverture du compte SMTP.

### Étape 11 — WebPilot : recherche et navigateur (technicien)

- **Actions** : pile `searxng` (déjà dans la pile) ; construire `nexora/webpilot-browser` en amd64 (`docker compose --profile webpilot-browser build webpilot-browser`) ; poser `WEBPILOT_SEARCH_URL`, `WEBPILOT_BROWSER_URL`, `WEBPILOT_BROWSER_SECRET` (même valeur côté site, worker, service), `WEBPILOT_CONTACT` ; règle `DOCKER-USER` qui interdit au réseau `webpilot-browser-egress` les plages privées ; publier la feuille de prix (`bun run --cwd web webpilot:prix`) ; attention : le service garde `127.0.0.1:8700` publié (§3).
- **Vérification** : `search`, `scrape` d'un site public, session de navigateur : OK ; une adresse privée ou `169.254.169.254` demandée dans une session est **refusée** ; aucune connexion du conteneur navigateur vers `nexora-internal` (tester avec `docker exec … nc -vz db 5432`, doit échouer) ; robots d'exploration identifiés dans `User-Agent`.
- **Retour arrière** : retirer les deux variables d'adresse : `search` et le rendu navigateur répondent 503 `webpilot_unavailable`, rien d'autre ne casse.
- **Exige le fondateur** : valider avec un avocat la position sur `robots.txt` des sessions (décision O-2 / S-6) avant d'ouvrir ; la page d'information du robot (`WEBPILOT_CONTACT`).

### Étape 12 — WorkStudio sur sa VM (technicien)

- **Actions** : charger les 9 images **x86** (paquet `nexora-images` `integre-2026-10-29` du projet GitLab 5, sommes vérifiées avec `sha256sum -c`) ; `scripts/init-env.sh` du dépôt WorkStudio pour des secrets **neufs** ; régler `NEXORA_PUBLIC_URL`, `NEXORA_DOMAIN`, l'organisation et le courriel ; amont de modèle (**NON VÉRIFIÉ**, voir §1.9) ; `docker compose -f deploy/compose.yml --env-file deploy/.env up -d --no-build` avec les profils voulus (au minimum `https` ou le proxy commun ; `search`, `code`, `pii`, `voice` selon le périmètre) ; **`NEXORA_EMBED_ORIGINS=https://<domaine du site>`** (vide, l'instance accepte toutes les origines pour la bulle) ; connexion unique : mêmes valeurs des deux côtés (`WORKSTUDIO_PUBLIC_URL`, `WORKSTUDIO_OIDC_CLIENT_ID`, `WORKSTUDIO_OIDC_CLIENT_SECRET`, `WORKSTUDIO_GATEWAY_URL` côté site ; `NEXORA_OIDC_ISSUER=${SITE_URL}/api/auth`, `NEXORA_OIDC_CLIENT_ID`, `NEXORA_OIDC_CLIENT_SECRET` côté WorkStudio), portées `openid profile email workstudio:model` et PKCE ; `NEXORA_SECRET_HOSTS_WORKSTUDIO=<hôte WorkStudio>` ; redémarrer site **et** worker.
- **Vérification** : `curl -s https://<domaine>/api/auth/.well-known/openid-configuration` → 200 ; `docker compose ps` : tout « healthy » ; un compte de test crédité ouvre WorkStudio depuis le panneau `/compte` ; un compte **sans** crédit reçoit `403 credits_required` ; `GET /api/oauth/workstudio-access` répond 200 avec un jeton valide ; la bulle `/embed.js` ne charge que l'origine configurée. Pour une pile neuve, la fumée du dépôt WorkStudio (`scripts/verification/fumee-*.sh`) est le contrôle fourni (44/44 constatés en développement selon le journal du projet, **à relancer dans le vrai environnement**).
- **Retour arrière** : `docker compose down` (sans `-v`) ; images précédentes conservées ; la connexion unique se coupe en retirant les variables `WORKSTUDIO_OIDC_*` du site (le fournisseur OIDC répond alors 404).
- **Exige le fondateur** : confirmer la présence d'Ollama (embeddings sur CPU) ou son remplacement ; décider des profils `voice` et `pii`.

### Étape 13 — Passer en état « test » : Stripe en mode test sur le vrai domaine (fondateur)

- **Actions** : coller `sk_test_…` au Coffre (`stripe.secret_key`) ; module Paiements → **« Vérifier et brancher Stripe »** (crée le webhook avec ses 12 événements et range `stripe.webhook_secret`) ; préparer les offres (`bun run seed`, « Adopter le prix suggéré » ou fixer les prix), les publier dans Directus, puis **« Publier vers Stripe »** ; essai avec la carte de test.
- **Vérification** : le module affiche « Branché » ; le webhook répond (un événement `livemode` serait rejeté en 400 : normal en test) ; abonnement de test → grand livre crédité (`credit_entries`) ; recharge de test ; code promo ; remboursement ; `trial_denials` ; `GET /api/oauth/workstudio-access` après paiement.
- **Retour arrière** : retirer la clé du Coffre (le webhook répond 503, voulu) ; supprimer le point de webhook chez Stripe.
- **Exige le fondateur** : le compte Stripe, la validation fiscale (Stripe Tax, TPS/TVQ) par un comptable ; **aucun paiement réel**.

### Étape 14 — RAG (facultatif au premier jour)

- **Actions** : mettre les modèles d'embedding (Qwen3 Embedding 8B par défaut) et de reclassement **en service** dans le catalogue ; `NEXORA_PRODUCT_RAG=1` ; fiche `rag` à « disponible » dans `web/src/i18n/apps.ts` et liste « ce qui est prêt » ; mettre à jour l'affirmation CL-AP07 ; variables `NEXORA_APP_INTERNAL_URL` et `NEXORA_APP_ADMIN_TOKEN` pour le worker.
- **Vérification** : `/compte/rag` permet de créer une base ; un document déposé passe de « en file » à indexé ; `rag_search` du MCP renvoie un extrait ; refus `507 quota_exceeded` sans espace dans l'offre ; **mesurer** `pg_total_relation_size('rag_chunks')` contre l'espace compté.
- **Retour arrière** : `NEXORA_PRODUCT_RAG` vide (page cachée ; les données restent).
- **Exige le fondateur** : texte de CL-AP07, prix de l'espace.

### Étape 15 — Nexora Code hébergé (phase 3, après décision)

- **Actions** : **construire l'image** `nexora/code-workspace` en amd64 depuis `~/Desktop/NexoraCode/src` (surveiller taille, `vite build`, ouverture d'un projet par défaut) ; relever l'**empreinte** `sha256` ; choisir l'hébergement du démon Docker (même VM que le site avec le site sur l'hôte, ou VM `code` après changement de code : ÉCART n° 3) ; poser sur le site **et** le worker `NEXORA_CODE_DRIVER=docker`, `NEXORA_CODE_IMAGE=nexora/code-workspace@sha256:…` (l'empreinte est exigée en production), limites `NEXORA_CODE_*`, `NEXORA_CODE_IDLE_MINUTES` ; DNS joker `*.code.<domaine>` et certificat joker (défi DNS) vers le site ; `NEXORA_CODE_HOST_SUFFIX=code.<domaine>` ; `NEXORA_CODE_TICKET_SECRET` (32 caractères au moins) ; **WebSocket** (terminal) : mandataire de bordure décrit, jamais essayé, `ws-auth` ne lit pas le cookie de l'hôte dédié → le terminal web ne marchera pas sans développement ; puis `NEXORA_PRODUCT_CODE=1`, fiche `code` « disponible », CL-AP06.
- **Vérification** : sans espace dans l'offre, le démarrage répond `402 quota_exceeded` et **rien n'est créé** ; avec 1 Go, un environnement passe `starting` puis `ready` ; `docker inspect nexora-code-<id>` confirme lecture seule, aucune capacité, 1 CPU, 2 Go, 512 processus, port sur 127.0.0.1 ; aucune valeur de `nxk_` dans `docker inspect` ni dans la ligne de commande ; arrêt après 30 minutes d'inactivité ; mesure du volume par `code.sweep` ; `GET /api/code/credits` avec la clé ; `DELETE /api/account/code/workspace` libère l'espace ; connexion du CLI par `nexora-code login` (code d'appareil).
- **Retour arrière** : `NEXORA_PRODUCT_CODE` vide ; `docker rm -f` des conteneurs `nexora.code.workspace=1` (les volumes restent) ; ne **pas** supprimer les volumes sans accord.
- **Exige le fondateur** : « maintenant » (décision du 30/10 : voir un vrai environnement tourner d'abord) ; choix de la forme « bureau » et de la chaîne de publication du binaire (non faite).

### Étape 16 — Produit VPS (phase 3, après décision)

- **Actions** : Proxmox séparé ou pool/VLAN dédiés ; suivre `docs/vps/guide-branchement-proxmox.md` (rôle `NexoraProvision` de 21 privilèges, pool `nexora`, jeton **sans** séparation de privilèges, bloc d'adresses IPv4 fixes hors DHCP, contenu « Import » sur `local`, 8006 depuis le worker, SSH 22 vers le bloc, port 25 sortant fermé) ; paire SSH du worker (clé privée au Coffre `vps.worker_ssh_key`, publique dans `VPS_WORKER_SSH_PUBLIC_KEY`) ; `NEXORA_SECRET_HOSTS_PROXMOX` ; module VPS ▸ Connecter un serveur ; **supprimer** plans `[DEV]` et serveur `dev-simule` ; **test de contrat** `PROXMOX_CONTRACT_URL=… PROXMOX_CONTRACT_MUTATE=1` avant d'ouvrir les ventes.
- **Vérification** : toutes les étapes de préparation du serveur passent (jamais testé contre un vrai Proxmox : prévoir des échecs réels) ; une VM de test se provisionne, s'installe et se supprime ; une commande payée en mode test mène à une instance active.
- **Retour arrière** : serveur en « maintenance » ou « hors ligne » ; Nexora ne modifie ni ne supprime jamais une VM qu'il n'a pas créée.
- **Exige le fondateur** : décision de vendre des VPS, prix des plans (les 4 plans préparés ont des prix **suggérés** qui ne peuvent pas être approuvés tels quels).

### Étape 17 — Sauvegardes et essai de restauration (avant l'ouverture au public)

Voir §5. **Vérification obligatoire** : une archive complète restaurée sur une VM jetable, avec le site qui démarre dessus et affiche le solde d'un compte de test.

### Étape 18 — Sécurité et recette dans le vrai environnement

- **Actions** : §6 ; `bun audit --prod` ; balayage `gitleaks` de l'historique ; `BASE_URL=https://<domaine> bun web/scripts/check-guards.ts` et `audit-flux.ts` ; `EXPECT_ENV=staging bun web/scripts/check-seo.ts` ; accessibilité et Lighthouse page par page ; `lychee` sans lien cassé ; revue indépendante (sécurité, paiements, isolation des clés).
- **Vérification** : `docs/guide-operateur.md` §13, tous les cadres « Preuves à refaire sur l'environnement final » cochés.
- **Retour arrière** : sans objet (aucun changement de production).
- **Exige le fondateur** : lire le rapport et accepter les risques résiduels.

### Étape 19 — Affirmations, textes juridiques, identité (fondateur)

- **Actions** : traiter les affirmations « [À COMPLÉTER PAR LE FONDATEUR] » (CL-A01 à CL-A18), relire et **approuver une à une** les affirmations du registre `cms/content/claims.json` (au relevé du 30/10/2026 : 192 affirmations `en_revue` et 18 `brouillon`, aucune approuvée) ; faire relire par un avocat québécois les pages légales et le guide Loi 25 ; saisir l'identité légale (raison sociale, NEQ, TPS, TVQ).
- **Vérification** : chaque affirmation publiée est `approuvée` par une personne nommée ; la page « Centre de confiance » ne dit rien qui soit contredit par le §6.3.
- **Retour arrière** : repasser l'affirmation « en revue » (la page cesse de l'afficher).
- **Exige le fondateur** : tout (aucun agent n'approuve).

### Étape 20 — Passer en état « public »

- **Actions** : `SITE_ENV=production` (rend le site indexable ; reconstruction et redémarrage) ; retirer la restriction d'accès du proxy ; **si et seulement si le fondateur le donne par écrit** : « Autoriser les paiements réels », clé `sk_live_…` au Coffre sous la **même** référence, « Vérifier et brancher Stripe », « Publier vers Stripe » pour chaque offre, « Tout resynchroniser » pour les codes, **un paiement réel de petit montant puis remboursement** ; mettre à jour l'affirmation CL-12 (« offres en libre-service pas encore ouvertes à la vente ») le jour où une offre ouvre ; soumettre le sitemap.
- **Vérification** : `robots.txt` autorise l'exploration ; `check-seo.ts` vert ; un paiement réel apparaît dans le grand livre et la facture ; alerte de surveillance de `GET /api/health` chaque minute.
- **Retour arrière** : remettre `SITE_ENV` hors `production` (le site redevient `noindex`, mais les moteurs auront peut-être déjà indexé) ; couper les paiements en retirant la clé du Coffre ; rembourser depuis Stripe (jamais automatique).
- **Exige le fondateur** : l'accord de passer au public et en paiement réel.

---

## 5. Sauvegardes et reprise

**En clair.** Une sauvegarde qui n'a jamais été restaurée n'est pas une sauvegarde. On sauvegarde trois choses : les données (bases, fichiers, volumes), les **secrets** (clés qu'on ne peut pas régénérer) et les **machines** (images de VM). On teste la restauration régulièrement, et on garde des copies hors du serveur.

### 5.1 Ce qui existe, ce qui manque

| Donnée | Où | Couvert aujourd'hui ? | Méthode proposée |
|---|---|---|---|
| Base `app` (comptes, grand livre, clés API, Coffre chiffré, catalogues, RAG) | PostgreSQL | **Oui** : `deploy/backup.sh` (`pg_dump -Fc` dans un instantané cohérent) | quotidien |
| Base `directus` (pages, versions, approbations, utilisateurs, jetons statiques **en clair**) | PostgreSQL | **Oui** : `backup.sh` | quotidien, archive **chiffrée obligatoire** |
| Fichiers de Directus (`uploads`) | volume `uploads` | **Oui** : `backup.sh` (`docker cp`) | avec l'archive |
| Base `litellm` (modèles, clés poussées, historique de dépenses de LiteLLM) | PostgreSQL | **Non** | ajouter un `pg_dump -Fc litellm` (changement à écrire dans `backup.sh`) ; sinon se reconstruit par « Synchroniser » (le grand livre fait foi dans `app`, DOCUMENTÉ) |
| Base `umami` | PostgreSQL | sans objet (aucun service) | rien |
| Volumes Nexora Code `nexora-code-vol-*` | démon Docker de la VM | **Non** | sauvegarde de la VM entière (instantané) **et**, pour une reprise par personne, `docker run --rm -v <volume>:/data:ro -v <dest>:/out busybox tar czf /out/<volume>.tgz -C /data .` (à écrire en script) |
| Pile WorkStudio : base `nexora`, `workstudio-uploads`, `connect-data`, `bootstrap`, fichier d'environnement | VM `workstudio` | **Oui, mais séparément** : `deploy/nexora-cli.sh backup` du dépôt WorkStudio (membres chiffrés AES-256-CBC, 7 jours conservés, phrase de passe en fichier 0600). **Aucune sauvegarde n'est en place sur pc6 aujourd'hui** (`docs/restauration.md` de WorkStudio) | planifier sur la VM `workstudio` |
| Secrets de production (`/etc/nexora/secrets/*`, fichier d'environnement du site, du worker, de WorkStudio) | VM | **Non** (jamais dans les archives, voulu) | copie hors ligne dans un gestionnaire de mots de passe d'équipe, **séparée** des archives |
| `NEXORA_VAULT_MASTER_KEY` (+ `_PREVIOUS*`), `BETTER_AUTH_SECRET`, `DIRECTUS_SECRET`, `LITELLM_SALT_KEY`, `ENCRYPTION_KEY`, `NEXORA_CONNECT_ENCRYPTION_KEY`, clés de chiffrement et de signature des sauvegardes | secrets | **Non** | idem, avec le fondateur ; **perdre l'une d'elles = données chiffrées perdues** |
| Images de VM | Proxmox | à faire | sauvegardes de VM (Proxmox Backup Server ou équivalent, **ESTIMATION À VALIDER**) |
| Configuration de Proxmox | `/etc/pve` | à faire | copie de la configuration après chaque changement |
| Dépôts de code (GitLab pc4 : projets 5, 6, 19) | pc4 | **NON VÉRIFIÉ** (pas d'accès SSH) ; miroirs nus existants sur pc1 (`~/Bureau/NexoraAI/depots/NexoraSite.git`, `NexoraStudio.git`) **plus alimentés d'office** depuis le 28/10 | sauvegarde de GitLab (instance entière, y compris le secret de configuration) vers une copie hors pc4 ; relancer `git push` vers un miroir à chaque version livrée ; conserver le paquet `nexora-images` |
| Code source du fork Nexora Code | `root/nexora-code-agent` (projet 19) | même remarque | idem |
| Instantanés du CMS | `CMS_SNAPSHOT_DIR` | non (reconstructible) | rien |

### 5.2 Fréquences proposées — DÉCISION et ESTIMATION À VALIDER

| Quoi | Fréquence proposée | Conservation proposée |
|---|---|---|
| `backup.sh` (bases + fichiers Directus), chiffré et signé | quotidien (exemple du guide : 03 h 17) | 14 jours en local + hebdomadaire hors site, à décider |
| Sauvegarde WorkStudio (`nexora-cli.sh backup`) | quotidien | 7 jours (valeur du script) + copie hors site |
| Images de VM | hebdomadaire (et avant chaque mise à jour importante) | 4 à 8 copies |
| Volumes Nexora Code | quotidien si le produit est ouvert | à décider avec le prix de l'espace |
| Copie hors site | hebdomadaire | à décider ; **au Québec** si l'on veut maintenir CL-E02 |

Un RPO (perte de données tolérée) et un RTO (durée d'arrêt tolérée) **ne sont décidés nulle part dans le dépôt** : le fondateur doit les fixer ; les fréquences ci-dessus en découlent.

### 5.3 Commandes (dépôt)

```bash
# Sauvegarde chiffrée et signée (le chiffrement est obligatoire ; noms de conteneurs de la production, pas ceux du développement)
NEXORA_DB_CONTAINER=<conteneur PostgreSQL> NEXORA_DIRECTUS_CONTAINER=<conteneur Directus> \
NEXORA_BACKUP_SIGNING_KEY_FILE=/etc/nexora/backup-sign.key NEXORA_BACKUP_ENCRYPT_KEY_FILE=/etc/nexora/backup-enc.key \
bash deploy/backup.sh --out /var/backups/nexora

# Vérifier une archive sans rien restaurer
bash deploy/restore.sh verifier ARCHIVE.tar.enc
# Essai dans un PostgreSQL jetable (au moins chaque trimestre)
bash deploy/restore.sh essai ARCHIVE.tar.enc
# Reprise après sinistre dans un PostgreSQL existant (refuse d'écraser sans --forcer)
bash deploy/restore.sh restaurer ARCHIVE.tar.enc --pg-container <conteneur> --directus-container <conteneur Directus>
```

`backup.sh` retombe sur les noms de conteneurs de **développement** (`nexorasite-db-1`, `nexorasite-directus-1`) si les variables `NEXORA_DB_CONTAINER` / `NEXORA_DIRECTUS_CONTAINER` manquent : en production, les poser explicitement, sinon il sauvegarde le mauvais serveur ou rien (`docs/guide-operateur.md` §10).

### 5.4 Reprise après sinistre (ordre)

1. Reconstruire la VM `pile` (image de VM ou machine neuve, §4 étapes 3 à 5). 2. PostgreSQL et Directus démarrés. 3. `restore.sh restaurer`. 4. **Remettre les mêmes** `NEXORA_VAULT_MASTER_KEY`, `DIRECTUS_SECRET`, `BETTER_AUTH_SECRET`, `LITELLM_SALT_KEY` qu'à l'origine. 5. **Rejouer `bash deploy/harden-db-roles.sh`** (la restauration se fait avec `--no-owner` : tout redevient propriété de `nexora`). 6. Démarrer Directus puis le site et le worker. 7. Relancer « Synchroniser » du catalogue vers LiteLLM. 8. Vérifier `GET /api/health` et la connexion d'un client ; WorkStudio : si `BETTER_AUTH_SECRET` du site diffère, les jetons d'identité ne se vérifient plus (vider `jwks` fait recréer des clés et reconnecter les sessions OIDC).

### 5.5 Comment tester

| Test | Fréquence proposée | Preuve à conserver |
|---|---|---|
| `restore.sh verifier` sur la dernière archive | à chaque sauvegarde (automatique) | sortie de la commande |
| `restore.sh essai` (base jetable, comptage exact de chaque table) | chaque trimestre | sortie « RESTAURATION EXACTE » (comme `docs/recette/sauvegarde.md`) |
| Restauration complète sur une VM jetable, site démarré sur la base restaurée : connexion, solde, clé API (`web/scripts/restore-proof.ts seed` puis `check`) | avant l'ouverture au public, puis chaque semestre | rapport daté, signé |
| Restauration d'une VM depuis son image, démarrage, vérification des services | chaque semestre | rapport |
| Restauration d'un volume Nexora Code dans un conteneur jetable, ouverture du projet | à la mise en service de Nexora Code, puis chaque semestre | rapport |
| Sauvegarde de WorkStudio restaurée sur une pile neuve (`nexora-cli.sh`) | à la mise en service, puis chaque semestre | rapport |
| Reconstruction de GitLab ou, au minimum, `git clone` d'un miroir hors pc4 | chaque semestre | rapport |
| La clé maîtresse du Coffre retrouvée dans le gestionnaire de mots de passe, **par une autre personne que celle qui l'a déposée** | à la mise en service | note datée |

Rotation de la clé maîtresse : conserver l'ancienne tant qu'une archive plus ancienne existe (`docs/guide-operateur.md` §4).

---

## 6. Sécurité de base et page confiance

### 6.1 Comptes, double authentification, secrets

- **Proxmox** : ne pas utiliser `root@pam` au quotidien ; comptes nominatifs avec double authentification (TOTP ou WebAuthn, fonction de Proxmox) ; accès à l'interface et à SSH par VPN seulement ; SSH par clé, mot de passe désactivé. Jeton API de Nexora : **uniquement** `nexora@pve!…` avec le rôle `NexoraProvision` (jamais `root`), seulement si le produit VPS est ouvert.
- **Directus** : 2FA exigée des rôles humains (Éditeur, Relecteur, Administrateur) par `cms/scripts/apply.ts` (`CMS_ENFORCE_TFA` activée par défaut) ; politique de mot de passe de 12 caractères ; créer d'abord `DIRECTUS_ADMIN_TOKEN` avant d'activer la 2FA de l'administrateur ; jetons de session courts (15 min / 1 jour / 8 h) ; témoins `Secure` (`DIRECTUS_COOKIE_SECURE=true`, déjà le défaut de la production) ; `MARKETPLACE_REGISTRY` injoignable, `TELEMETRY=false` (à ne pas retirer).
- **Site** : 2FA **obligatoire** pour les comptes du personnel (`/compte/securite`) ; 12 caractères au moins pour les mots de passe, refus des mots de passe courants, vérification HIBP active en production, verrouillage progressif ; perte du téléphone = procédure d'urgence de l'opérateur (`docs/guide-operateur.md` §14).
- **Secrets** : jamais dans Git, Directus, le navigateur, un journal ; fichiers 0400/0444 dans un dossier 0700 ; clé maîtresse du Coffre et `BETTER_AUTH_SECRET` sauvegardés comme des clés de coffre-fort ; rotation du jeton d'administration à chaque départ d'une personne ayant eu accès (site **et** Directus, redémarrer).
- **Comptes de service** des cinq agents du site : un compte par agent, jeton au Coffre, budget mensuel fixé, jamais le droit de publier.

### 6.2 Pare-feu, mises à jour, surveillance

- **Pare-feu** : trois niveaux Proxmox + pare-feu de l'hôte (`nftables`) refusant par défaut ; réseaux Docker `internal: true` (déjà dans `compose.prod.yml`) ; règle `DOCKER-USER` du navigateur WebPilot (§2.6) ; Proxmox par VM pour le produit VPS (déjà géré par le moteur : politique d'entrée DROP, port 25 sortant fermé).
- **Mises à jour** : système invité avec mises à jour de sécurité automatiques ; Proxmox à jour dans une fenêtre de maintenance ; images Docker **épinglées par empreinte** et mises à jour par modification versionnée (jamais `latest`, LiteLLM reste en `v1.106.2` tant que le fondateur ne dit pas le contraire) ; `bun audit --prod` avant chaque version ; chaîne CI de pc4 (gitleaks, Semgrep, Trivy, SonarQube) conservée ; avis Next.js à suivre (la montée de version de Next.js figure parmi les restes du fondateur côté WorkStudio).
- **Surveillance** : `GET /api/health` toutes les minutes ; `docker logs`/journal vers un emplacement central ; tâches `dead` dans `jobs` ; solde et budgets des agents ; alertes de capacité VPS (`VPS_ALERT_TO`). **Aucun outil de supervision ni WAF n'est fourni par le dépôt** (`docs/guide-operateur.md` §9, §14) : **DÉCISION** et travail à prévoir.
- **Journal d'accès du personnel** (bastion, historique SSH) : à prévoir si l'on veut soutenir l'engagement « un journal d'accès » du centre de confiance (§6.3).

### 6.3 Points de la page confiance qui deviennent vrais seulement une fois ceci fait

Aucune affirmation n'est approuvée par ce document ; chacune est au registre `cms/content/claims.json` et ne devient publiable qu'après approbation d'une personne. Textes cités depuis ce registre (192 `en_revue` et 18 `brouillon` lors du relevé ; aucune approuvée).

| Affirmation | Devient vraie quand… | Preuve à produire |
|---|---|---|
| **CL-02, CL-13, CL-81** (infrastructure hébergée au Québec), **CL-E02** (données et sauvegardes au Québec, sauf services activés explicitement) | les serveurs Proxmox sont **physiquement au Québec** et les **copies hors site aussi** (étapes 2 et 17) | adresse du site, contrat avec clause de localisation, lieu des sauvegardes et des journaux (CL-A05, CL-A11 à compléter) ; **lieu inconnu aujourd'hui** |
| **CL-73** (lieu d'hébergement, de sauvegarde, des journaux et liste des sous-traitants précisés par écrit avant la mise en service), **CL-E06** (contrat de traitement, registre des sous-traitants, journal d'accès), **CL-87** (documents types « en préparation ») | le registre des sous-traitants existe : Stripe, fournisseur SMTP, DeepInfra (et OpenRouter s'il est activé), hébergeur, GitLab ; contrat type et entente de traitement rédigés | documents signés ; le texte dit encore « en préparation » : ne pas le changer avant |
| **CL-E05** (données envoyées à un fournisseur externe seulement si activé) et **CL-M06** (Privacy Router avant tout appel) | la politique de confidentialité par organisation est active (« standard » par défaut) et le **catalogue n'a que des modèles dont la résidence et la politique de données sont saisies à la fiche** ; DeepInfra est un tiers : son lieu de traitement doit figurer à la fiche | pages de fiche des modèles ; `docs/privacy-router.md` ; la politique ne prouve pas la résidence (ce document le dit) |
| **CL-S02** (événements d'usage : métadonnées seulement) et **CL-07** (jamais d'entraînement sur les données) | LiteLLM garde `turn_off_message_logging: true` et `store_prompts_in_spend_logs: false` (`deploy/litellm/config.yaml`) **et** le contrat avec DeepInfra le permet | configuration en place ; contrat du fournisseur (non lu ici) |
| **CL-M09**, **CL-X04**, **CL-X05** (OpenRouter) | seulement si OpenRouter est réactivé comme route de secours ; aujourd'hui désactivé | — |
| **CL-S05** (valeur d'une clé affichée une fois, empreinte conservée) | vrai par le code ; à rejouer dans le vrai environnement | `check-guards.ts`, tests |
| **CL-22, CL-113** (journal d'audit, identifiants de connecteurs chiffrés) | WorkStudio en production avec `AUDIT_LOGS_ENABLED` actif et `NEXORA_CONNECT_ENCRYPTION_KEY` **sauvegardée** | pile WorkStudio en place (étape 12) |
| **CL-77** (flux sortants listés avant la mise en service) | `docs/recette/flux-sortants.md` est refait avec la **liste réelle** de sorties du pare-feu de production | document daté, remis au client |
| **CL-86** (aucun niveau de service annoncé) | reste vrai tant qu'aucune surveillance ni astreinte n'existe ; ne pas le modifier | — |
| **CL-12** (offres en libre-service non ouvertes à la vente) | devient fausse le jour du premier paiement réel : la mettre à jour avant (étape 20) | texte révisé et approuvé |
| **CL-AP06** (Nexora Code) et **CL-AP07** (RAG), qui parlent au futur | l'interrupteur est allumé **et** un vrai environnement a tourné (étapes 14 et 15) | essai daté |
| **CL-M11** (accès VPS par clé SSH) | le produit VPS est ouvert (étape 16) | essai sur un vrai Proxmox |
| **Centre de confiance : « Un journal d'accès »** (qui accède à quoi) | journalisation des accès du personnel au système hébergé en place | journaux conservés, durée fixée |
| **CL-L05, CL-75, CL-E09** (aucune conformité automatique, aucune immunité juridique) | toujours vraies : ne rien promettre de plus sans avocat | validation d'un avocat québécois (CL-A10) |

Tant que ces conditions ne sont pas réunies, l'état « en revue » doit rester ; le site doit continuer à écrire ce qui est « prévu » comme prévu (règle du dépôt : aucune affirmation sans preuve).

---

## 7. Inconnues, hypothèses et écarts à combler

### 7.1 Écarts entre le dépôt et la production (aucun n'est corrigé par ce document)

| N° | Écart | Constat | Où |
|---|---|---|---|
| 1 | Pas de conteneur ni d'unité de production pour le site et le worker | VÉRIFIÉ : un seul Dockerfile dans le dépôt ; `docs/infra.md` : « leur rattachement à `nexora-internal` et leur propre durcissement restent à écrire » | `deploy/` |
| 2 | Courriel de Directus | VÉRIFIÉ : `EMAIL_SMTP_HOST: mailpit`, `EMAIL_FROM: no-reply@nexora.test` en dur ; non remplacés par `compose.prod.yml` | `deploy/compose.yml`, `deploy/compose.prod.yml` |
| 3 | Nexora Code et conteneurs | VÉRIFIÉ : liaison `127.0.0.1:<port>` fixe ; site et démon Docker supposés sur la même machine ; le site/worker auraient le socket Docker ; image jamais construite | `packages/code/src/docker.ts`, `docs/nexora-code.md` §9, §10 |
| 4 | Sauvegardes incomplètes | VÉRIFIÉ : `backup.sh` ne couvre que `app`, `directus`, `uploads` ; WorkStudio, Code, litellm, secrets, GitLab sont hors périmètre ; WorkStudio sur pc6 sans sauvegarde | §5 |
| 5 | Architecture | VÉRIFIÉ : pc6 est arm64 ; Proxmox exige x86-64 ; WorkStudio exige une machine x86 avec plus de 28 Go pour compiler | §1.9 |
| 6 | Pas de proxy frontal pour le site, pas de WAF, pas de supervision | DOCUMENTÉ (`guide-operateur.md` §9, §14) | — |
| 7 | Modèle de développement dans `deploy/litellm/config.yaml` | VÉRIFIÉ | §1.5 |
| 8 | Aucun script de génération des secrets de **production** | VÉRIFIÉ : `deploy/init-env.sh` est un script de développement | §4 étape 4 |
| 9 | Base de `code-workspace` non épinglée par empreinte | VÉRIFIÉ : `FROM oven/bun:${BUN_VERSION}` | `Dockerfile.workspace` |
| 10 | Rôle `app` toujours superutilisateur | DOCUMENTÉ (`docs/infra.md`) | — |
| 11 | `webpilot-browser` garde `127.0.0.1:8700` publié en production | lecture de `compose.yml` : `compose.prod.yml` ne le réinitialise pas | `deploy/compose.yml` |
| 12 | `umami` : base et rôle créés, aucun service | VÉRIFIÉ | `deploy/initdb/01-databases.sh` |
| 13 | Directus : 25 collections sur 25, pas de licence | VÉRIFIÉ dans `docs/cms.md` | §1.4 |
| 14 | Terminal web de Nexora Code (WebSocket) non pris en charge | DOCUMENTÉ | `docs/nexora-code.md` §5 |

### 7.2 Choses que je n'ai pas pu vérifier

- **NON VÉRIFIÉ** : comportement réel de tout ce qui touche à Proxmox (aucun serveur disponible) : pare-feu, VLAN, `vzdump`, Proxmox Backup Server, recommandation Docker en VM, VPN.
- **NON VÉRIFIÉ** : aucun conteneur Nexora Code n'a jamais tourné ; l'interface web d'OpenCode rebrandée derrière un mandataire n'a pas été essayée ; image jamais construite.
- **NON VÉRIFIÉ** : le service navigateur WebPilot sur amd64 et en production ; SearXNG avec `read_only`.
- **NON VÉRIFIÉ** : si LiteLLM démarre proprement avec `dev/cloud-glm-5-3` sans `PC1_UPSTREAM_*` ; si `webpilot-browser` fonctionne avec un système de fichiers conforme sur amd64 ; réglages PostgreSQL de production.
- **NON VÉRIFIÉ** : si les images WorkStudio actuelles fonctionnent sous un autre domaine (variables figées à la compilation) ; l'amont de modèle de `nexora-api` en production ; la place d'Ollama (embeddings) dans l'offre.
- **NON VÉRIFIÉ** : GitLab pc4 (sauvegardes, registre d'images de conteneurs, disponibilité de la CI) ; accès de la production à GitLab.
- **NON VÉRIFIÉ** : besoin en mémoire et en CPU du site (`next start`) et du worker sous charge réelle ; taille des volumes en production ; aucune mesure de charge.
- **NON VÉRIFIÉ** : écoute de `next start` en `0.0.0.0` sur l'hôte (documenté seulement pour un conteneur) ; certificats joker avec le fournisseur DNS choisi.
- **NON VÉRIFIÉ** : conformité juridique de toute affirmation ; l'état d'approbation final des affirmations (192 `en_revue` et 18 `brouillon` au relevé du `claims.json`, aucune `approuvée`).
- **NON VÉRIFIÉ** : le contenu des données de la base de pc6 (volontairement non interrogée) ; la liste des affirmations du centre de confiance dans Directus (je n'ai lu que les fichiers `cms/content`).

### 7.3 Hypothèses retenues

- Proxmox VE 9.x sur un matériel x86-64 avec virtualisation (exigence du dépôt).
- Le site est hébergé au Québec et la page confiance le dit (CL-02) : tant que ce n'est pas vrai, ne pas approuver ces affirmations.
- Le périmètre du premier jour exclut Nexora Code et le produit VPS.
- Les images sont construites sur pc1 (amd64) et déployées depuis un registre privé ; les VM de production n'ont pas accès au code source.
- Les volumes de départ sont faibles ; toutes les valeurs du §2.7 sont des **formules** à remplacer par des mesures après le premier mois d'essai.
- Les noms de domaine, d'hôte et de service de ce guide (`<domaine>`, `cms.`, `studio.`, `*.code.`) sont des **gabarits**, sauf ceux explicitement lus dans le dépôt.

### 7.4 Ce que le fondateur doit confirmer par écrit

1. Le domaine, le DNS, le lieu physique et le matériel.
2. Les comptes Stripe, SMTP, DeepInfra, la clé Directus OIG.
3. Le RPO, le RTO, l'emplacement des copies hors site.
4. Le périmètre du premier jour et le calendrier des phases 2 et 3.
5. L'autorisation des paiements réels, et l'approbation de chaque affirmation du centre de confiance.
