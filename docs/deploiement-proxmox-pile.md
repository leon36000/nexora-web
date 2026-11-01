# Pile du site Nexora AI sur la VM Proxmox `nexora-pile` (essai fermé)

État au 01/11/2026. Ce document décrit ce qui est réellement installé sur la VM, comment l'exploiter et ce qui reste. Il complète `docs/proxmox-mise-en-service.md` (le plan) sans le remplacer : les numéros d'étape et d'écart renvoient à ce plan. Aucun secret n'est écrit ici, seulement des noms et des chemins.

Étiquettes : **VÉRIFIÉ** = constaté sur la VM le 01/11/2026 (la preuve est dans le rapport de mise en service) ; **NON VÉRIFIÉ** = pas essayé ; **EXIGE LE FONDATEUR** = décision ou compte que personne d'autre ne peut fournir.

## 1. Ce qui est installé

| Élément | Valeur |
|---|---|
| Machine | VM `nexora-pile` (Proxmox, nœud `pve`), Ubuntu 24.04, 6 vCPU, 20 Go de RAM, 220 Go, IP du réseau local 192.168.1.121 |
| Docker | Engine 29.9.2, Compose v5.6.1 |
| Accès | `ssh nexora-pile` (utilisateur `nexora`, sudo sans mot de passe, groupe docker) |
| Code source | `/srv/nexora/src` (copie par `rsync` du dépôt, sans `.git` ni jeton GitLab) |
| Configuration | `/srv/nexora/deploy/prod.env` (chemins et réglages publics seulement) |
| Secrets | `/srv/nexora/secrets/` (voir §3) |
| Sauvegardes | `/srv/nexora/backups/` (archives chiffrées `.tar.enc`) |
| Projet Compose | `nexorasite` (`docker compose -p nexorasite …`, raccourci `deploy/pile.sh`) |

### Conteneurs (tous avec sonde de santé)

| Service | Image | Réseaux | Port sur l'hôte |
|---|---|---|---|
| `db` | `pgvector/pgvector:pg17@sha256:ac08538c…` (PostgreSQL 17 + pgvector) | internal | aucun |
| `directus` | `directus/directus:12.5.1@sha256:ef6fc027…` | internal, egress | `127.0.0.1:8456` |
| `litellm` | `ghcr.io/berriai/litellm:v1.106.2@sha256:7294b90f…` | internal, egress | aucun |
| `searxng` | `searxng/searxng:2026.10.13-…@sha256:9b61996e…` | webpilot-search, webpilot-egress | aucun |
| `webpilot-browser` | `nexora/webpilot-browser:local` (base Playwright v1.64.1 épinglée) | webpilot-browser, webpilot-browser-egress | aucun |
| `site` | `nexora/site:local` (construite sur la VM) | internal, webpilot-search, webpilot-browser, egress-site | aucun |
| `worker` | `nexora/worker:local` (construite sur la VM) | mêmes réseaux que `site` | aucun |
| `front` | `nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56a…` | internal, edge | `127.0.0.1:3500` et `0.0.0.0:80` |
| `mailpit` (PROVISOIRE) | `axllent/mailpit:v1.32.0@sha256:0790692b…` | internal | aucun |

Réseaux : `nexora-internal`, `nexora-webpilot-search` et `nexora-webpilot-browser` n'ont pas de route vers l'extérieur (`internal: true`). Les sorties passent chacune par un réseau à elles : `egress` (LiteLLM, Directus), `egress-site` (site, worker : HIBP, courriel, Stripe plus tard), `webpilot-egress` (SearXNG), `webpilot-browser-egress` (navigateur). `edge` porte seulement le proxy frontal (un port publié ne fonctionne pas sur un réseau interne). Volumes : `db`, `uploads` (Directus), `site-cache`, `cms-snapshots`.

Le site n'est joignable de l'extérieur que par `front`. Le proxy frontal refuse `/api/admin/*` et `/api/revalidate` (403), `TRACE`/`TRACK`/`CONNECT` (405), écrase `X-Forwarded-For`, limite le débit de `/api/auth`, `/api/contact`, `/api/stripe/webhook` et `/v1` (valeurs de départ : 5, 1, 20 et 30 requêtes par seconde et par adresse, à ajuster avec du trafic réel). Les en-têtes de sécurité restent ceux du site. La règle « l'en-tête `X-Forwarded-For` reçu est écrasé » est configurée mais **n'a pas été éprouvée** par un test d'usurpation.

### Fichiers du dépôt ajoutés ou modifiés (branche `feat/deploiement-proxmox`)

| Fichier | Rôle |
|---|---|
| `deploy/Dockerfile.web` | trois cibles : `tools` (espace de travail complet : migrations, scripts Directus, tests, build de l'extension), `build` (compilation de Next) et `site` (exécution, utilisateur `node`) |
| `deploy/Dockerfile.worker` | image du worker (Node 24 exécute le TypeScript directement) |
| `.dockerignore` | exclut `node_modules`, `.next`, `.git`, environnements, secrets et documentation (sauf `docs/vps`) |
| `deploy/docker/entrypoint.sh` | lit des secrets dans des fichiers et les exporte pour le seul processus lancé (rien dans `docker inspect`) |
| `deploy/docker/worker-health.ts` | sonde de santé du worker (processus + base) |
| `deploy/docker/vault-put.mjs`, `admin-call.mjs` | dépôt d'un secret au Coffre et appel de l'API d'administration, sans jamais afficher de valeur |
| `deploy/compose.site.yml` | site, worker, proxy frontal, Mailpit provisoire, outils, navigateur sans port |
| `deploy/front/` | configuration du proxy frontal (nginx) |
| `deploy/compose.prod.yml` | **écart n° 2 corrigé** (courriels de Directus), clés DeepInfra et OpenRouter lues par fichier |
| `deploy/litellm/config.yaml` | `dev/cloud-glm-5-3` et `PC1_UPSTREAM_*` retirés (**écart n° 7**) ; modèles internes DeepInfra et OpenRouter |
| `deploy/compose.yml`, `init-env.sh`, `.env.example` | références `PC1_UPSTREAM_*` retirées |
| `deploy/prod-init.sh` | génération des secrets de production (**écart n° 8**) |
| `deploy/prod-bootstrap.sh` | jeton statique de l'administrateur Directus (avant la 2FA) |
| `deploy/prod-stage-extension.sh` | copie de l'extension `nexora-cms` vers Directus |
| `deploy/build-images.sh` | construction des images sur la VM |
| `deploy/pile.sh` | raccourci `docker compose` de production |
| `deploy/prod.env.example` | modèle de `prod.env` |
| `deploy/tests/site.test.sh`, `compose.test.sh` | 67 et 127 contrôles statiques |
| `web/src/app/api/creative/config/route.ts`, `web/src/app/v1/models/route.ts` | `await connection()` : ces deux routes lisaient la base pendant la compilation et faisaient échouer toute compilation sans base |
| `cms/scripts/lib/directus.ts` (+ test) | délai plancher après un 429 de Directus (`Retry-After: 0`) |
| `cms/scripts/stage-extensions.sh` | fonctionne sans Git |
| `cms/node_modules`, `cms/extensions-src/nexora-cms/node_modules` | deux liens symboliques absolus vers `/home/pc6/…`, versionnés par erreur dans la fusion Creative, retirés de l'index |

## 2. Variables (`/srv/nexora/deploy/prod.env`)

Modèle complet : `deploy/prod.env.example`. Points à retenir :

- `SITE_URL=https://nexora-pile.tail0c55ff.ts.net` est **figée à la compilation** de Next : la changer exige de reconstruire l'image du site. `SITE_ENV` reste **vide** : le site envoie `noindex` partout et `robots.txt` répond `Disallow: /`.
- `DIRECTUS_PUBLIC_URL` et `DIRECTUS_CORS_ORIGIN` : `https://nexora-pile.tail0c55ff.ts.net:8443`.
- `NEXORA_APP_INTERNAL_URL=http://site:3500` (identique pour Directus, worker, outils).
- Secrets : `NEXORA_SECRETS_DIR`, `NEXORA_SECRETS_GID=2001` et les `*_FILE` de Directus, PostgreSQL, LiteLLM, DeepInfra, OpenRouter.
- Courriel PROVISOIRE : `DIRECTUS_SMTP_HOST=mailpit`, `SITE_SMTP_URL=smtp://mailpit:1025`, `WORKER_SMTP_HOST=mailpit`, `MAIL_FROM`, `CONTACT_NOTIFY_TO` (adresses en `nexora.test`, rien ne sort).
- `NEXORA_SECRET_HOSTS_CREATIVE=192.168.1.122` (VM Nexora Creative) : identique dans le site et le worker.
- `NEXORA_PROFILES="webpilot-browser mail-provisoire"` : profils Compose activés par `pile.sh`.
- Adresse de l'administrateur Directus : `admin@nexora-pile.example.com` (Directus refuse les adresses en `.test`). **À remplacer par une vraie adresse** (§9).

Non posées volontairement : `STRIPE_*` (ignorées en production de toute façon), `SMTP_PASSWORD*`, `WORKSTUDIO_*`, `NEXORA_PRODUCT_CODE`, `NEXORA_PRODUCT_RAG`, `SITE_ENV=production`, `NEXORA_OUTBOUND_ALLOW`, `NEXORA_PASSWORD_BREACH_CHECK` (la vérification HIBP reste active).

## 3. Secrets

Générés sur la VM par `sudo bash deploy/prod-init.sh` (aléatoire par `openssl rand`, jamais affichés, jamais copiés d'un poste, un fichier existant n'est jamais remplacé). Dossier `/srv/nexora/secrets` (root, groupe `nexora`, 0750). Fichiers sans retour à la ligne final.

**Écart avec la consigne « 0400 ».** Les fichiers sont en **0440, propriétaire root, groupe `nexora-secrets` (gid 2001)**, pas en 0400. Compose (hors Swarm) monte le fichier source tel quel et ignore `uid`, `gid` et `mode` d'un secret (avertissement constaté) : un fichier en 0400 root serait illisible pour les conteneurs qui ne tournent pas en root. Le groupe est ajouté (`group_add`) aux seuls conteneurs qui lisent des secrets ; l'utilisateur `nexora` de la VM ne les lit pas sans `sudo`. Exceptions : `directus_db_password`, `litellm_db_password`, `umami_db_password` appartiennent à l'uid 999 (utilisateur `postgres` de l'image : le script d'initialisation de la base s'exécute sous cet utilisateur, qui perd les groupes ajoutés) ; `backup_encrypt_key` et `backup_sign_key` restent en 0400 root.

| Fichier | Usage |
|---|---|
| `postgres_password`, `directus_db_password`, `litellm_db_password`, `umami_db_password` | mots de passe PostgreSQL (rôle `nexora`, rôles `directus`, `litellm`, `umami`) |
| `app_database_url` | `DATABASE_URL` de la base `app` (site, worker, outils) |
| `directus_secret`, `directus_admin_password`, `directus_admin_token` | Directus (le **mot de passe administrateur** est dans `directus_admin_password`) |
| `directus_reader_token`, `directus_publisher_token` | jetons Lecteur et Publication, générés puis affectés par `cms/scripts/apply.ts` |
| `nexora_app_admin_token` | jeton d'administration du site et de Directus |
| `nexora_vault_master_key` | clé maîtresse du Coffre (base64, 32 octets) |
| `better_auth_secret`, `nexora_preview_secret` | sessions et aperçus du site |
| `litellm_master_key`, `litellm_salt_key` | LiteLLM |
| `webpilot_browser_secret` | secret partagé site, worker, navigateur |
| `nexora_creative_service_token` | `NEXORA_CREATIVE_SERVICE_TOKEN` (service Nexora Creative) |
| `deepinfra_api_key`, `openrouter_api_key` | clés des fournisseurs, fournies par le fondateur (propriétaire root, groupe 2001, 0440) |
| `backup_encrypt_key`, `backup_sign_key` | chiffrement et signature des sauvegardes |

**À copier hors de la VM (EXIGE LE FONDATEUR)** : `nexora_vault_master_key`, `better_auth_secret`, `directus_secret`, `litellm_salt_key`, `backup_encrypt_key`, `backup_sign_key`. Les perdre rend les données chiffrées ou les sauvegardes illisibles (plan §4, étape 4). Aucune copie hors serveur n'existe aujourd'hui.

## 4. LiteLLM et fournisseurs de modèles

- **DeepInfra** (fournisseur de production). Deux usages : (1) le Coffre du site contient `llm.deepinfra` (type `llm_provider`) et le fournisseur `deepinfra` du catalogue est actif ; « Tester la connexion » répond `HTTP 200, 173 modèle(s) listé(s)` ; (2) `deploy/litellm/config.yaml` déclare le modèle interne `nexora-sonde-deepinfra` (Mistral Small 3.2 24B, petit et peu coûteux) pour vérifier la route sans dépendre du catalogue.
- **OpenRouter** (second fournisseur) : modèle interne `nexora-creative-assistant` → `openrouter/z-ai/glm-5.3`. Identifiant relevé le 01/11/2026 dans `GET https://openrouter.ai/api/v1/models` ; c'est le GLM de la famille 5.3 utilisé par le catalogue (`nexora/glm-5.3`). `z-ai/glm-5.3-prime` existe aussi (plus cher) ; le choix du modèle de l'assistant est à confirmer. La clé OpenRouter n'est **pas** au Coffre du site : elle est lue par LiteLLM seulement. Le fournisseur `openrouter` du catalogue (créé par `models:seed`) reste désactivé.
- Les clés passent par des secrets Docker lus par l'entrypoint de LiteLLM : aucune valeur dans `docker inspect` ni dans le dépôt.
- **Catalogue** : `models:seed` a créé 36 modèles DeepInfra **en brouillon, sans prix** : aucun taux de change USD→CAD n'est approuvé. **EXIGE LE FONDATEUR** : approuver le taux (module Modèles), fixer ou adopter les prix, puis « Passer en service » et « Synchroniser vers LiteLLM ». Aucun crédit de test n'existe en base (0 écriture au grand livre) ; l'organisation « maison » (`house:org`) n'a pas été créée.

## 5. Exploitation

Toutes les commandes se lancent sur la VM (`ssh nexora-pile`) depuis `/srv/nexora/src`.

```bash
cd /srv/nexora/src
bash deploy/pile.sh ps                     # état et santé
bash deploy/pile.sh up -d                  # démarre ou met à jour (images existantes)
bash deploy/pile.sh down                   # arrête (sans -v : volumes conservés)
bash deploy/pile.sh logs -f site           # journaux (site, worker, directus, litellm, front…)
```

Ordre d'arrêt recommandé : `site` et `worker`, puis `directus`, puis `db`. Après un redémarrage de la VM, les conteneurs reviennent seuls (`restart: unless-stopped`).

### Mettre à jour le code (depuis pc6)

```bash
# 1. copier les sources (sans node_modules, .next, .git)
rsync -a --delete --exclude=node_modules --exclude=.next --exclude=.git --include='.env.example' --exclude='.env' --exclude='.env.*' \
  --exclude='cms/extensions/nexora-cms' /home/pc6/Desktop/NexoraSite-proxmox/ nexora-pile:/srv/nexora/src/
# 2. sur la VM
ssh nexora-pile
cd /srv/nexora/src
sudo bash deploy/build-images.sh tools                                     # image outils
bash deploy/pile.sh run --rm -T tools bash -c 'cd /app && bun run db:migrate'   # migrations de la base app
bash deploy/pile.sh run --rm -T tools bash -c 'cd /app && : > /tmp/cms.env && NEXORA_ENV_FILE=/tmp/cms.env bun run cms/scripts/apply.ts'   # schéma Directus (idempotent)
bash deploy/prod-stage-extension.sh                                        # extension nexora-cms (si elle a changé)
sudo bash deploy/build-images.sh site                                      # site (Directus et base doivent tourner)
sudo bash deploy/build-images.sh worker
bash deploy/pile.sh up -d                                                  # recrée site et worker
```

Les builds se font **sur la VM** (amd64), jamais sur pc6 (arm64). La compilation du site prérend les pages avec Directus et la base `app` : `build-images.sh` crée pour cela un builder BuildKit éphémère rattaché au réseau interne (aucun port de base publié), lui passe le jeton Lecteur et l'URL de la base en **secrets de construction**, puis le supprime. Vérifié : aucune des valeurs de secret n'est dans l'image `nexora/site:local`.

Changer `SITE_URL` ou `SITE_ENV` : modifier `prod.env`, puis `sudo bash deploy/build-images.sh site` et `bash deploy/pile.sh up -d`.

### Directus, Coffre, catalogue

```bash
# Déposer un secret au Coffre (la valeur vient d'un fichier, elle n'est jamais affichée)
bash deploy/pile.sh run --rm -T tools node deploy/docker/vault-put.mjs llm.deepinfra llm_provider /run/secrets/deepinfra_api_key
# Appeler l'API d'administration (réseau interne, jeton d'administration)
bash deploy/pile.sh run --rm -T tools node deploy/docker/admin-call.mjs GET /api/admin/payments
bash deploy/pile.sh run --rm -T tools bash -c 'cd /app && bun run --cwd web models:seed'   # catalogue (rejouable)
```

`/api/admin/*` n'est volontairement pas joignable par le proxy frontal. Le module Coffre de Directus y accède par le réseau interne.

### Courriel provisoire (Mailpit)

Mailpit n'a aucun port ni interface exposés. Lire les messages depuis la VM :

```bash
ip=$(docker inspect -f '{{(index .NetworkSettings.Networks "nexora-internal").IPAddress}}' nexorasite-mailpit-1)
curl -s http://$ip:8025/api/v1/messages | jq '.messages[] | {Subject, To}'
# ou, depuis pc6 : ssh -L 8025:$ip:8025 nexora-pile   puis http://localhost:8025
```

Mailpit garde ses messages en mémoire (perdus au redémarrage). **À retirer** dès qu'un vrai SMTP existe : voir §9.

### Sauvegarder, vérifier, restaurer (plan §5, étape 17)

```bash
cd /srv/nexora/src
export NEXORA_DB_CONTAINER=nexorasite-db-1 NEXORA_DIRECTUS_CONTAINER=nexorasite-directus-1 \
  NEXORA_BACKUP_SIGNING_KEY_FILE=/srv/nexora/secrets/backup_sign_key NEXORA_BACKUP_ENCRYPT_KEY_FILE=/srv/nexora/secrets/backup_encrypt_key \
  NEXORA_PG_IMAGE=pgvector/pgvector:pg17@sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d
sudo -E bash deploy/backup.sh --out /srv/nexora/backups          # archive chiffrée et signée
sudo -E bash deploy/restore.sh verifier /srv/nexora/backups/nexora-backup-….tar.enc
sudo -E bash deploy/restore.sh essai /srv/nexora/backups/nexora-backup-….tar.enc    # PostgreSQL jetable, décompte exact de chaque table
# Reprise après sinistre (refuse d'écraser sans --forcer) :
sudo -E bash deploy/restore.sh restaurer ARCHIVE --pg-container nexorasite-db-1 --directus-container nexorasite-directus-1
# puis : remettre les MÊMES secrets, rejouer deploy/harden-db-roles.sh --container nexorasite-db-1, redémarrer Directus, site, worker
```

Les noms de conteneurs de production sont obligatoires : sans les variables, les scripts retombent sur les noms de développement. **Aucune sauvegarde planifiée n'existe** (pas de cron ni de minuterie) : une archive d'essai a été faite à la main le 01/11/2026. `backup.sh` ne couvre ni la base `litellm`, ni les secrets, ni la configuration de la VM (plan §5.1).

### Tests

```bash
bash deploy/pile.sh run --rm -T tools bash -c 'cd /app/deploy && bash tests/site.test.sh'   # contrôles statiques (sans démarrer)
```

La suite complète (`vitest`, `bun test`) a été lancée dans l'image `tools` contre un **PostgreSQL jetable** (jamais la base de production) ; elle crée des bases `nexora_test_*` et n'est pas à lancer sur la base de production.

### Tailscale et pare-feu

- La VM n'est **pas encore dans le tailnet** : `tailscale status` répond « Logged out » avec un lien de connexion. **EXIGE LE FONDATEUR** : approuver `nexora-pile` (ouvrir le lien affiché par `sudo tailscale status`), activer les certificats HTTPS du tailnet dans la console d'administration si ce n'est pas fait.
- Une fois approuvée : `sudo tailscale serve --bg --https=443 http://127.0.0.1:3500` (site) puis `sudo tailscale serve --bg --https=8443 http://127.0.0.1:8456` (Directus). Pas de Funnel (public). Adresses attendues : `https://nexora-pile.tail0c55ff.ts.net` et `https://nexora-pile.tail0c55ff.ts.net:8443`. **NON VÉRIFIÉ** (tailnet non joint).
- `ufw` actif : entrée refusée par défaut ; SSH (22/tcp) seulement depuis 192.168.1.0/24 ; 80, 443 et 8443 ouverts ; **sorties non restreintes** (à restreindre plus tard avec la liste blanche du plan §2.6). Docker publie ses ports en contournant `ufw` (règles `FORWARD`) : la protection réelle des ports publiés vient de leur liaison (`127.0.0.1` pour le site et Directus) et du seul port 80 du proxy frontal.

## 6. Reconstruire de zéro (ordre)

1. Docker et Compose installés ; groupe `nexora-secrets` et fichiers : `sudo bash deploy/prod-init.sh` (les clés `deepinfra_api_key` et `openrouter_api_key` doivent déjà être dans `/srv/nexora/secrets`).
2. `/srv/nexora/deploy/prod.env` depuis `deploy/prod.env.example`.
3. `sudo bash deploy/build-images.sh tools` et `worker`.
4. `bash deploy/pile.sh up -d db directus litellm searxng mailpit` ; attendre « healthy ».
5. `sudo DIRECTUS_ADMIN_EMAIL=… bash deploy/prod-bootstrap.sh` (jeton administrateur), migrations, `apply.ts`, `seed.ts`, `prod-stage-extension.sh`.
6. `sudo bash deploy/build-images.sh site`, puis `bash deploy/pile.sh up -d`.
7. Dépôt de `llm.deepinfra` au Coffre, `models:seed`, « Tester la connexion ».

## 7. Vérifié le 01/11/2026

Résumé (preuves et sorties dans le rapport de mise en service) : tous les conteneurs « healthy » ; accueil, `/apps/creative` (page et vidéo `creative-bande-annonce.mp4` servie en 200), `/api/health` en 200 ; `/api/admin/*` et `/api/revalidate` en 403 par le proxy ; requête réelle LiteLLM → DeepInfra et LiteLLM → OpenRouter (GLM 5.3) ; connexion DeepInfra testée depuis le site (173 modèles) ; Directus joignable, licence **Core**, 2FA exigée de l'administrateur ; migrations 0000 à 0030 (31) ; schéma Directus idempotent (733 éléments inchangés au second passage) ; aucun port de base ni de LiteLLM sur l'hôte ; 22 fichiers de secrets absents de `docker inspect` des 9 conteneurs ; inscription d'essai → courriel de vérification dans Mailpit (compte d'essai supprimé ensuite, 0 crédit) ; sauvegarde → vérification → essai de restauration « RESTAURATION EXACTE » (85 + 58 tables) ; web 2537 tests réussis (24 ignorés), 9 paquets réussis (`packages/vault` n'a aucun test), worker réussi (seul le dossier `vps-guide` lit `docs/` : il passe quand la documentation est montée, l'image l'exclut), cms 1644 sur 1645.

Défauts constatés non liés au déploiement : (1) `cms/content/content.test.ts` « tableau des affirmations du README » dépend de l'ordre de `readdirSync` (non trié) : il réussit sur pc6 (ext4) et échoue dans un conteneur (overlayfs) ; (2) la fusion Creative avait versionné deux liens `node_modules` absolus (retirés) et deux routes qui lisaient la base à la compilation (corrigées).

## 8. Écarts restants avec le plan

| Plan | État |
|---|---|
| Écart n° 1 (site et worker sans Dockerfile) | **corrigé** (§1) |
| Écart n° 2 (courriel de Directus vers Mailpit) | **corrigé** dans `compose.prod.yml` ; en essai fermé Directus pointe vers Mailpit **par réglage**, pas en dur |
| Écart n° 7 (modèle de développement de LiteLLM) | **corrigé** ; LiteLLM démarre proprement sans `PC1_UPSTREAM_*` |
| Écart n° 8 (génération des secrets de production) | **corrigé** (`prod-init.sh`) |
| Écart n° 11 (navigateur WebPilot publié sur 8700) | **corrigé** (aucun port) |
| Écart n° 3, 14 (Nexora Code) | inchangés : Nexora Code reste éteint |
| Écart n° 4 (sauvegardes incomplètes) | **inchangé** : ni `litellm`, ni secrets, ni WorkStudio ; aucune sauvegarde planifiée ; aucune copie hors de la VM |
| Écart n° 6 (proxy HTTPS, WAF, supervision) | proxy frontal local posé ; **TLS** par `tailscale serve` (non encore actif) ; ni WAF ni supervision |
| Écart n° 10 (rôle `app` superutilisateur) | inchangé : le site et le worker se connectent en `nexora` (superutilisateur) |
| Écart n° 12 (`umami`) | inchangé : base et rôle créés, aucun service |
| Écart n° 13 (Directus 25 collections sur 25, pas de licence) | inchangé : palier **Core** ; permissions sans règles personnalisées (le jeton Lecteur voit aussi les brouillons, le site filtre `status = published`) |
| Pare-feu `DOCKER-USER` pour le navigateur (plan §1.7, §2.6) | **non appliqué** : depuis le conteneur du navigateur, une connexion TCP brute vers 192.168.1.1:80 aboutit (le service refuse les adresses privées par son propre mandataire, mais la défense en profondeur de l'hôte manque) |
| Sorties de la VM | non restreintes (`ufw` autorise tout en sortie) |
| Audit nocturne (performance, liens, accessibilité) | **corrigé** (branche `feat/worker-audits`, voir la mise à jour « Audits SEO du worker » plus bas) |
| Mailpit | PROVISOIRE |
| Stripe | aucune clé : état `no_key`, paiements réels non autorisés |
| WorkStudio, RAG, Nexora Code, VPS | non déployés |
| Pages publiées de Directus | **aucune** : la page d'accueil répond 200 avec le texte de repli du site ; `load-content.ts` n'a pas été lancé (il approuve et publie : décision du fondateur, plan §4 étape 19) ; 62 éléments `seed.ts` (navigation, offres et recharges **en brouillon**) sont chargés |
| Variables `NEXORA_CREATIVE_SERVICE_TOKEN` et `NEXORA_SECRET_HOSTS_CREATIVE` | posées ; la route `/api/creative/config` répond `{"configured":false}` avec le jeton de service et 401 sans lui ; le jeton d'administration n'ouvre pas cette route |

Licence : la page `/apps/creative` sert la bande-annonce (`creative-bande-annonce.mp4`, 11,9 Mo). Le message du commit de la fiche Creative signale « Licence H3 V.4 : visibilité mondiale de la vidéo à valider avant déploiement » : la VM est fermée (réseau local, puis tailnet), mais **rien ne doit être ouvert au public avant cette validation** (EXIGE LE FONDATEUR). Ce document ne tranche aucune question juridique.

## 9. Ce qui exige le fondateur

1. **Approuver la VM dans le tailnet**, puis lancer les deux commandes `tailscale serve` du §5 (ou me le redemander). Pas de Funnel sans accord.
2. **Nom de domaine** : sans lui, `SITE_URL` reste l'adresse `ts.net`.
3. **SMTP réel** (fournisseur, identifiants, SPF/DKIM/DMARC) : retirer Mailpit, régler `DIRECTUS_SMTP_*`, `SITE_SMTP_URL`, `WORKER_SMTP_*`, `MAIL_FROM`, `CONTACT_NOTIFY_TO` (plan, étape 10). Les adresses actuelles en `nexora.test` n'existent pas.
4. **Stripe** : compte, clé de test au Coffre, « Vérifier et brancher Stripe » (plan, étape 13). Aucun paiement réel sans accord écrit.
5. **Clé Directus Open Innovation Grant** (`LICENSE_KEY`) et décision sur la licence MSCL-1.0-GPL ; sans elle, Core (3 sièges, 25 collections).
6. **Catalogue** : taux de change USD→CAD à approuver, prix de vente, « Passer en service », choix du modèle de l'assistant Creative.
7. **Copie hors de la VM** des secrets listés au §3 et décision sur le lieu des sauvegardes, la fréquence, le RPO et le RTO.
8. **Compte administrateur Directus** : remplacer `admin@nexora-pile.example.com` par une vraie adresse, ouvrir une session (mot de passe dans `directus_admin_password`) et activer la 2FA ; le jeton statique n'est pas concerné.
9. **Contenu** : approuver les affirmations et publier les pages (plan, étape 19) ; la décision sur la vidéo Creative (§8).
10. **Accès public** : `SITE_ENV=production`, retrait des restrictions, proxy HTTPS public : après les points ci-dessus seulement.

## Mise à jour du 01/11/2026 : règle DOCKER-USER posée et éprouvée
Le navigateur WebPilot et SearXNG ne joignent plus les réseaux privés. Script `deploy/nexora-docker-user.sh` (relit les sous-réseaux des réseaux `nexorasite_webpilot-browser-egress` et `nexorasite_webpilot-egress`, rejette 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10) et unité `deploy/nexora-docker-user.service` (installés dans `/usr/local/sbin/` et `/etc/systemd/system/` de la VM, activée au démarrage). **Éprouvé** depuis le conteneur du navigateur : 192.168.1.1:80 et 192.168.1.11:22 bloqués (`ENETUNREACH`), 1.1.1.1:443 et example.com:443 accessibles.
Sauvegarde : les VM 201 et 202 sont sauvegardées chaque nuit à 03 h 30 par Proxmox (stockage `backup-nvme0`) ; essai réel de la VM 201 : 2 min 22. `tailscale serve` pour le site doit viser le proxy nginx (`http://127.0.0.1:80`) et non le site directement (3500), pour garder le blocage de `/api/admin/*` et `/api/revalidate`.

## Mise à jour du 01/11/2026 : audits SEO du worker (Chromium, Lighthouse, lychee)
L'image `nexora/worker` embarque désormais ce que l'audit nocturne (`seo.audit`, 03 h) exige : **Chromium** de Playwright 1.64.1 (la version du `bun.lock`, installée avec le CLI du dépôt sous `/opt/ms-playwright`, `CHROME_PATH=/usr/local/bin/nexora-chromium`, Chrome for Testing 156.0.8078.4), **Lighthouse 13.5.0** (dépendance du dépôt) et **lychee 0.24.2** (binaire musl officiel, SHA-256 vérifié à la construction, `LYCHEE_BIN=/usr/local/bin/lychee`). Le conteneur reste durci (utilisateur `node`, `cap_drop: ALL`, `no-new-privileges`, lecture seule) ; Chromium tourne sans bac à sable, comme le code du worker le prévoit (`--no-sandbox`). Changements de `deploy/compose.site.yml` : `shm_size: 512m` (les 64 Mo par défaut font planter Chromium) et `mem_limit` du worker porté de 2 à **3 Go** (pic mesuré 1,48 Go pendant un audit complet).
Reconstruire seulement le worker : `sudo bash deploy/build-images.sh worker` puis `bash deploy/pile.sh up -d --no-deps worker`. Mettre à jour lychee : changer `LYCHEE_VERSION` et `LYCHEE_SHA256` en tête de `deploy/Dockerfile.worker` (empreinte du fichier `lychee-x86_64-unknown-linux-musl.tar.gz` de la publication).
**Vérifié** : un audit `all` déclenché à la main (ligne dans `seo_audits` + tâche `seo.audit` dans `jobs`) contre `http://site:3500` : statut `succeeded` en 82 s, 36 pages, les quatre volets `ok` (structure, liens 2 994 vérifiés par lychee, accessibilité 36 pages sur 2 largeurs, Lighthouse 6 pages en profil mobile). Les constats sont réels et propres à l'état actuel du site : liens vers des pages sans contenu publié (404), `noindex` du sitemap (essai fermé, `SITE_ENV` vide), score SEO Lighthouse de 66 pour la même raison.
