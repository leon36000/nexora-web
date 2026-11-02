# WorkStudio sur la VM Proxmox `nexora-workstudio` (essai fermé, réseau local)

État au 01/11/2026. Ce document décrit ce qui est réellement installé sur la VM 203, comment l'exploiter et ce qui reste à faire. Il complète `docs/proxmox-mise-en-service.md` (§1.9 et étape 12) et `docs/deploiement-proxmox-pile.md` (VM 201) sans les remplacer. Aucun secret n'est écrit ici, seulement des noms et des chemins.

Étiquettes : **VÉRIFIÉ** = constaté sur la VM le 01/11/2026 ; **NON VÉRIFIÉ** = pas essayé ; **EXIGE LE FONDATEUR** = décision, achat ou compte que personne d'autre ne peut fournir.

## 1. Ce qui est installé

| Élément | Valeur |
|---|---|
| Machine | VM 203 `nexora-workstudio` (nœud `pve`), Ubuntu 24.04 (gabarit 9000), 8 vCPU, 20 Go de RAM (sans ballon), disque 150 Go (`ssd-1tb`, 23 Go utilisés après installation), IP du réseau local **192.168.1.123**, démarrage automatique (`onboot`), agent QEMU actif |
| Accès | `ssh nexora-workstudio` (alias de pc6, utilisateur `nexora`, clé `~/.ssh/id_ed25519_nexora_vm`, sudo sans mot de passe, groupe docker) |
| Docker | Engine 29.9.2, Compose v5.6.1 (dépôt officiel Docker) |
| Pile | projet Compose `nexora`, dossier `/srv/nexora/workstudio` (copie du dépôt GitLab `root/nexora-workstudio` : `deploy/`, `scripts/`) |
| Environnement | `/srv/nexora/secrets-workstudio/pile.env` (0600) : secrets **et** réglages |
| Images | `/srv/nexora-images/` (archives vérifiées, 2,3 Go ; peuvent être supprimées après chargement) |
| Raccourci | `/srv/nexora/workstudio/ws.sh` (compose avec la surcouche Proxmox et `pile.env`) |

Création de la VM, copie exacte de la méthode de 201 et 202 : `qm clone 9000 203 --full` sur `ssd-1tb`, cloud-init (`ciuser nexora`, clé de déploiement, `ipconfig0 ip=192.168.1.123/24,gw=192.168.1.1`, DNS `192.168.1.1 1.1.1.1`), `cpu host`, `balloon 0`, `agent 1`, `vga serial0`, `onboot 1`, disque agrandi à 150 Go (`qm resize`, le système invité agrandit sa partition au premier démarrage).

### Conteneurs (14 en marche, tous sains ; `cron` et `searxng` n'ont pas de sonde propre dans le compose amont)

| Service | Image | Rôle | Port sur l'hôte |
|---|---|---|---|
| `front` | `nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56a…` | proxy frontal (surcouche Proxmox) | **0.0.0.0:80** |
| `workstudio` | `nexora/workstudio:local` | application (Next) | 127.0.0.1:3000 |
| `workstudio-realtime` | `nexora/workstudio-realtime:local` | WebSocket (socket.io) | 127.0.0.1:3002 |
| `workstudio-migrations` | `nexora/workstudio-migrations:local` | migrations (démarrage unique, terminé) | — |
| `cron` | `nexora/cron:local` | tâches planifiées | — |
| `postgres` | `pgvector/pgvector:pg17` | base **propre** (bases `nexora` et `nexora_api`, extension `vector`) | aucun |
| `redis`, `nexora-api-redis` | `redis:7-alpine` | cache de l'application, cache de la passerelle | aucun |
| `nexora-api` + `nexora-bootstrap` | `nexora/api:local` (fork d'OpenGateLLM) | passerelle de modèles interne ; l'amorçage (démarrage unique, terminé) enregistre le modèle et la clé | 127.0.0.1:8000 |
| `nexora-connect` | `nexora/connect:local` (OpenConnector) | connecteurs | 127.0.0.1:8400 |
| `ollama` | `ollama/ollama:0.12.6` | embeddings `bge-m3` (CPU), **aucun modèle de conversation local** | aucun |
| `searxng` (profil `search`) | `searxng/searxng:2026.10.17-1c10abe2d` | recherche web de WorkStudio | aucun |
| `code-sandbox` (profil `code`) | `nexora/code:local` | interpréteur Python (monte le socket Docker, voir §6) | aucun |
| `pii` (profil `pii`) | `nexora/pii:local` | détection de données personnelles (Presidio) | aucun |
| `mailpit` (profil `mail-provisoire`) | `axllent/mailpit:v1.32.0` | courrier factice PROVISOIRE (SMTP interne `mailpit:1025`) | aucun |

Aucun port de base, de Redis, d'Ollama, de SearXNG ou du bac à sable n'est publié. Les ports en 127.0.0.1 sont ceux du compose amont (boucle locale de la VM seulement). **Hors périmètre volontaire** : le profil `voice` (Whisper, synthèse vocale, diarisation) : l'image `nexora/diarize:local` est chargée, Whisper (`ghcr.io/speaches-ai/speaches`) et ses modèles (~500 Mo) ne sont pas tirés.

### Fichiers du dépôt du site ajoutés (branche `feat/deploiement-workstudio`)

| Fichier | Rôle |
|---|---|
| `deploy/workstudio/compose.proxmox.yml` | surcouche Compose : `front` (nginx) et `mailpit`, à poser à côté de `deploy/compose.yml` de WorkStudio (non modifié) |
| `deploy/workstudio/front/default.conf.template` | proxy frontal : `studio.${NEXORA_DOMAINE}` et hôte par défaut (accès par adresse IP) ; `/socket.io/` vers le temps réel ; `/v1` sans tampon ; limitation de débit sur `/api/auth/` ; `TRACE`/`TRACK`/`CONNECT` refusés ; `X-Forwarded-For` écrasé |
| `deploy/workstudio/configurer-env.sh` | pose les réglages non secrets dans `pile.env` à partir d'**une** variable de domaine |
| `deploy/workstudio/ws.sh` | raccourci d'exploitation |
| `deploy/workstudio/pousser-images.sh` | transfert des images depuis GitLab pc4 par pc6, sans disque intermédiaire |
| `deploy/workstudio/nexora-ws-pare-feu.{sh,service}` | règles `DOCKER-USER` de la VM 203 (port 80 réservé au réseau local) |
| `deploy/litellm-lan/` | relais LAN vers LiteLLM, **installé sur la VM 201** (voir §3) |

## 2. Domaine : une seule variable

`NEXORA_DOMAINE` (domaine racine, **sans** `studio.`) est la seule valeur à changer. Aujourd'hui `nexora.ai`. `configurer-env.sh` en déduit, par interpolation de Compose dans `pile.env` : `NEXORA_DOMAIN=studio.${NEXORA_DOMAINE}`, `NEXORA_PUBLIC_URL=https://studio.${NEXORA_DOMAINE}` (qui devient `NEXT_PUBLIC_APP_URL` et `BETTER_AUTH_URL`) et `NEXORA_PUBLIC_REALTIME_URL`. Le modèle `front` lit la même variable pour `server_name`. Piège : Compose lit `.env` dans l'ordre, `NEXORA_DOMAINE=` doit donc rester **en tête** du fichier (le script l'y remet).

**`NEXT_PUBLIC_*` : pas de reconstruction nécessaire (VÉRIFIÉ).** L'image `nexora/workstudio:local` a été compilée avec `NEXT_PUBLIC_APP_URL=http://localhost:3000` (argument de construction par défaut), mais l'application relit ces valeurs à l'exécution (`window.__ENV` injecté par `RuntimePublicEnvScript`, `workstudio/apps/sim/lib/core/config/env.ts`) : la page de connexion servie contient `https://studio.nexora.ai` et aucune occurrence de `localhost:3000`. Changer de domaine = modifier `NEXORA_DOMAINE` puis `ws.sh up -d` (recrée `workstudio`, `workstudio-realtime`, `front`). **Aucune compilation, donc rien à demander à pc1.** Réserve : le CSP et les liens générés côté serveur suivent aussi l'environnement, mais seul le rendu de `/login` a été inspecté.

Changer de domaine :

```bash
ssh nexora-workstudio
cd /srv/nexora/workstudio
./configurer-env.sh /srv/nexora/secrets-workstudio/pile.env nexora.ai   # ou le domaine définitif
./ws.sh up -d --no-build
```

## 3. Modèle d'IA : nexora-api → LiteLLM de la VM 201 → DeepInfra

Aucun modèle de conversation local. `nexora-api` exige un amont (`NEXORA_UPSTREAM_URL`, `NEXORA_UPSTREAM_MODEL`, `NEXORA_UPSTREAM_KEY`) :

- **Voie retenue : relais LAN dédié sur la VM 201**, et non le `/v1` du site. Le `/v1` du site est la passerelle facturée (clés `nxk_`, crédits, catalogue encore en brouillon, taux de change non approuvé) : ce n'est pas un amont technique pour l'instance. LiteLLM n'est publié nulle part ; le publier aurait exigé de recréer son conteneur (interdit : la pile du site n'est pas redémarrée).
- **Relais** (`/srv/nexora/litellm-lan/` sur 201, projet Compose `nexora-litellm-lan`, sans lien avec le projet `nexorasite`) : un nginx sans privilège, sur le réseau interne `nexora-internal` (pour joindre `litellm:4000`) et sur un réseau à lui (nécessaire pour publier un port), publié **uniquement sur `192.168.1.121:4000`**. Il ne laisse passer que `POST /v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/responses` et `GET /v1/models` ; tout le reste (`/key/*`, `/user/*`, `/config`, `/ui`…) répond 404 (VÉRIFIÉ : 404 sur `/key/list` et `/ui` avec la clé du client).
- **Filtre de source** : un port publié par Docker contourne ufw. La règle est dans `DOCKER-USER` (`nexora-litellm-lan.sh`) : ACCEPT depuis 192.168.1.123, DROP des autres, **seulement pour le sens aller** (`--ctdir ORIGINAL` ; sans cela le DROP attrapait aussi les réponses du conteneur, erreur trouvée et corrigée pendant l'installation). Une règle ufw équivalente a été ajoutée (sans effet sur le chemin Docker, gardée par prudence). VÉRIFIÉ : depuis pc6, le port est fermé (délai dépassé) ; depuis la VM 203, il répond.
- **Persistance** : l'unité `nexora-litellm-lan.service` (démarrage après `nexora-docker-user.service`, qui vide `DOCKER-USER` à chaque démarrage) repose la règle puis lance le relais. **À savoir pour l'autre intervenant sur 201** : si `nexora-docker-user.sh` est relancé à la main, il efface cette règle ; relancer ensuite `sudo systemctl restart nexora-litellm-lan`.
- **Clé** : clé virtuelle LiteLLM dédiée (alias `workstudio-vm203`), créée par l'API d'administration avec la clé maîtresse lue dans le fichier de secrets de 201 (jamais affichée), **limitée au seul modèle `nexora-sonde-deepinfra`** et à **25 USD par 30 jours**. Sur 203 : `/srv/nexora/secrets-workstudio/litellm_virtual_key` (0400) et `NEXORA_UPSTREAM_KEY` dans `pile.env`. Rotation : régénérer sur 201 (`/key/generate`, puis `/key/delete`), remplacer les deux, `ws.sh up -d`.
- **Modèle** : `nexora-sonde-deepinfra` = Mistral Small 3.2 24B chez DeepInfra (déclaré dans `deploy/litellm/config.yaml` du site). C'est le seul modèle DeepInfra déclaré en dur dans LiteLLM ; les modèles du catalogue public ne sont pas encore synchronisés (brouillons). **À remplacer** par un modèle de production dès que le catalogue est en service : changer `NEXORA_UPSTREAM_MODEL` (et l'autorisation de la clé), puis `ws.sh up -d`. `nexora-api` l'expose aussi sous l'alias `nexora-default` (celui que WorkStudio utilise).

## 4. Secrets

Générés sur la VM par `scripts/init-env.sh` du dépôt WorkStudio (aléatoire `openssl rand`, jamais affichés ni copiés d'un poste), déplacés de `deploy/.env` vers `/srv/nexora/secrets-workstudio/pile.env` (dossier 0700, fichier 0600, propriétaire `nexora`). Dans ce dossier aussi : `litellm_virtual_key` (0400) et `compte_test_admin_mdp` (0400, mot de passe du compte de test, voir §5). Le dépôt n'en contient aucun.

**À copier hors de la VM (EXIGE LE FONDATEUR)** : tout `pile.env`, surtout `ENCRYPTION_KEY`, `API_ENCRYPTION_KEY`, `NEXORA_CONNECT_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`. Perdre `ENCRYPTION_KEY` ou `NEXORA_CONNECT_ENCRYPTION_KEY` rend illisibles les données chiffrées (`docs/restauration.md` de WorkStudio). Les sauvegardes `vzdump` contiennent ce fichier (elles sont donc sensibles), mais aucune copie hors du Proxmox n'existe aujourd'hui.

## 5. Preuves (01/11/2026)

| Contrôle | Résultat |
|---|---|
| `docker ps` | 14 conteneurs en marche, tous « healthy » sauf `cron` et `searxng` (sans sonde, « Up ») ; `workstudio-migrations` et `nexora-bootstrap` terminés (voulu) |
| Page de connexion | `curl -H "Host: studio.nexora.ai" http://127.0.0.1/login` : **200**, titre « Connexion \| Nexora WorkStudio » ; idem par `http://192.168.1.123/login` (hôte par défaut) ; `/front-sante` : 200 |
| Migrations | 449 migrations Drizzle dans `drizzle.__drizzle_migrations` ; journal « Script migration 0035 applied » ; base `nexora_api` créée, extension `vector` présente |
| Compte administrateur local | création par `POST /api/auth/sign-up/email` (inscription ouverte, SSO non configuré) : `essai-admin@nexora.test`, **propriétaire** de l'organisation « Nexora AI » (premier compte = propriétaire) ; connexion puis `get-session` et `/workspace` : 200. Mot de passe dans `compte_test_admin_mdp`. **Compte de test à supprimer avant toute ouverture** |
| Appel de modèle de bout en bout | depuis le conteneur `workstudio`, `nexora-api:8000/v1/chat/completions` (modèle `nexora-default`) → relais → LiteLLM → DeepInfra : réponse « Salut ! » (18 jetons) ; la dépense de la clé `workstudio-vm203` côté LiteLLM est passée à une valeur non nulle |
| Embeddings | `bge-m3` téléchargé une fois (1,2 Go), `POST ollama:11434/api/embed` : 1 vecteur de **1024** dimensions |
| Recherche web | `searxng:8080/search?format=json` : 200 |
| Interpréteur de code | création d'un bac à sable, `print(sum(range(10)))` → `45`, code de sortie 0, 42 ms, bac détruit (204) |
| Pare-feu | ufw : refus par défaut en entrée ; 22 et 80 depuis 192.168.1.0/24 seulement ; `DOCKER-USER` : port 80 réservé au réseau local |
| Mémoire au repos | ~4,4 Go utilisés sur 20 Go (Ollama 1,4 Go, application 1,2 Go) |
| Sauvegarde | `vzdump` réel réussi (12,0 Go, 61 s) ; VM 203 ajoutée à `nexora-nightly` (§7) |
| Redémarrage de la VM 203 | après `systemctl reboot` : retour en ~20 s, les 14 conteneurs reviennent seuls, règle `DOCKER-USER` reposée, `bge-m3` conservé, `/login` : 200 depuis pc6. Le redémarrage de la VM 201 (pour le relais) n'a **pas** été essayé (NON VÉRIFIÉ) |

## 6. Exposition et sécurité

- **Réseau local seulement.** `front` écoute sur le port 80 de la VM (HTTP). ufw n'autorise que `192.168.1.0/24` sur 22 et 80, et la règle `DOCKER-USER` fait de même pour le port publié par Docker. **Pas de HTTPS** sur cette VM tant que le domaine n'est pas acheté : `front` conserve `X-Forwarded-Proto` s'il vient d'un proxy public, sinon le schéma de la connexion. Les cookies de session sont `Secure` (adresse publique en `https://`) : **un navigateur sur `http://192.168.1.123` ne gardera pas la session**. Pour essayer à la main avant le domaine : passer par un proxy HTTPS (Tailscale Serve sur 203, comme pour 201) ou régler `NEXORA_DOMAINE` sur un nom résolu localement avec HTTPS.
- **Interpréteur de code** : le conteneur `code-sandbox` monte le socket Docker et tourne en root (conception amont : réseau interne `code` partagé avec WorkStudio seulement, racine en lecture seule, aucune capacité, bacs jetables sans réseau, 1 Go / 1 cœur / 120 s). Une évasion de ce conteneur donne root sur la VM 203, qui ne porte rien d'autre que WorkStudio. gVisor (`NEXORA_CODE_RUNTIME=runsc`) n'est pas installé.
- **Inscription ouverte** (`NEXORA_REGISTRATION_DISABLED=false`, aucune liste de domaines) : acceptable sur un réseau local fermé, **pas** en ligne. La fermeture passe par le SSO du site (§8), qui, selon le compose, ferme l'inscription par mot de passe.
- **Sortie réseau** : les réseaux Docker de la pile ne sont pas filtrés vers le réseau local (nécessaire pour `192.168.1.121:4000`). SearXNG sort vers Internet (voulu).
- **Garde SSRF des blocs API/HTTP** : le produit refuse toute adresse interne qui n'est pas dans `EGRESS_ALLOWED_HOSTS` (garde conservée, non affaiblie). La surcouche `compose.proxmox.yml` n'y ajoute que `mailpit` (en plus de `nexora-api,nexora-connect,searxng`) pour la démonstration d'envoi factice ; appliquer par `ws.sh up -d --no-build` (02/11/2026). Pour envoyer un courriel de démonstration, préférer le **bloc SMTP** (`mailpit:1025`, sécurité « None », identifiants factices exigés par le bloc) : le bloc API envoie un corps JSON où le texte d'un agent (sauts de ligne) casse le JSON, et Mailpit répond 400.
- **Reprise après validation humaine (vérifiée le 02/11/2026)** : sur « Tri du courrier entrant », exécution en pause, clic « Reprendre l'exécution » sur `/resume/<workflow>/<exécution>` (corps `{input:{submission:{envoyer:true}}}`), reprise, condition, envoi SMTP vers Mailpit : `paused_executions = fully_resumed`, journal `completed`, 1 courriel reçu. Aucun défaut de reprise reproduit sur la voie utilisée par l'interface ; le point d'accès v2 (`/api/v2/workflows/<id>/runs/<run>/resume`, clé d'API) exige `contextId` dans le corps (message « expected string, received undefined » s'il manque), et la voie historique le prend dans l'URL.
- Mises à jour de sécurité automatiques du système invité : paquet `unattended-upgrades` installé (valeurs par défaut d'Ubuntu).

## 7. Sauvegarde

- **Tâche nocturne `nexora-nightly`** (03:30, `backup-nvme0`, zstd, mode snapshot, garde 7 jours + 4 semaines) : `vmid` passé de `201,202` à **`201,202,203`** (`pvesh set /cluster/backup/nexora-nightly --vmid 201,202,203`, VÉRIFIÉ par relecture).
- **Essai réel** : `vzdump 203 --storage backup-nvme0 --mode snapshot --compress zstd` lancé à la main le 01/11/2026 ; **réussi** : instantané avec gel du système de fichiers par l'agent QEMU (`fs-freeze`/`fs-thaw`), archive `vzdump-qemu-203-2026_11_01-17_05_28.vma.zst` de **12,0 Go** (disque de 150 Go), 61 s, élagage 7 jours + 4 semaines appliqué sans suppression. Fichiers dans `/mnt/nexora-backups/dump/` (stockage `backup-nvme0`).
- `vzdump` capture la VM entière (volumes Docker, `pile.env`, images). Il est cohérent au niveau du système de fichiers (agent QEMU), pas au niveau de PostgreSQL : en cas de restauration, PostgreSQL rejoue son journal (comme après une coupure de courant). La sauvegarde propre au produit, `deploy/nexora-cli.sh backup` (archives chiffrées AES-256, 7 jours), n'est **pas** planifiée : **à faire** (voir §9). La restauration d'une VM vers une pile neuve n'a pas été éprouvée (**NON VÉRIFIÉ**).

## 8. Brancher la connexion unique (OIDC) avec le site, une fois le domaine connu

Valeurs (domaine racine `D`, par exemple `nexora.ai` ; WorkStudio sur `https://studio.D`, site sur `https://D`).

**URL de rappel à déclarer** (calculée par le site à partir de `WORKSTUDIO_PUBLIC_URL`, aucune saisie ailleurs) : `https://studio.D/api/auth/oauth2/callback/nexora-oidc`. Découverte : `https://D/api/auth/.well-known/openid-configuration`.

Côté **site** (VM 201, `prod.env` du site et du worker ; `SITE_URL` devra être `https://D`, ce qui **exige de reconstruire l'image du site**, voir `docs/deploiement-proxmox-pile.md` §5) :

| Variable | Valeur |
|---|---|
| `WORKSTUDIO_PUBLIC_URL` | `https://studio.D` |
| `WORKSTUDIO_OIDC_CLIENT_ID` | identifiant au choix (8 à 128 caractères) |
| `WORKSTUDIO_OIDC_CLIENT_SECRET` | secret de 48 caractères (`openssl rand -base64 48 \| tr -d '/+=' \| head -c 48`), à garder identique des deux côtés |
| `WORKSTUDIO_GATEWAY_URL` | `https://D/v1` |
| `NEXORA_SECRET_HOSTS_WORKSTUDIO` | `studio.D` |
| `WORKSTUDIO_REQUIRE_CREDITS`, `WORKSTUDIO_DEFAULT_MODEL` | à fixer selon le catalogue (défauts dans `docs/workstudio-integre.md`) |

Puis redémarrer **site et worker**.

Côté **WorkStudio** (`pile.env` de la VM 203, puis `ws.sh up -d`) :

| Variable | Valeur |
|---|---|
| `NEXORA_OIDC_ISSUER` | `https://D/api/auth` |
| `NEXORA_OIDC_CLIENT_ID`, `NEXORA_OIDC_CLIENT_SECRET` | les mêmes valeurs que côté site |
| `NEXORA_OIDC_NAME` | libellé du bouton (par exemple « Nexora AI ») |
| `NEXORA_GATEWAY_URL` | `https://D/v1` (mode intégré : chaque personne reçoit sa clé et son portefeuille à la première connexion) |
| `NEXORA_ORGANIZATION_OWNER_EMAIL` | courriel du propriétaire (obligatoire dans ce mode) |
| `NEXORA_EMBED_ORIGINS` | `https://D` (vide = toutes les origines) |
| `NEXORA_REGISTRATION_DISABLED` | **laisser `false`** (le SSO crée les comptes) |

Le site doit être joignable en HTTPS depuis la VM 203 (`D` doit se résoudre depuis 203) ; la portée `workstudio:model` est demandée par WorkStudio. Le relais LiteLLM et la clé `workstudio-vm203` restent l'amont technique de `nexora-api` (modèle par défaut de l'instance) ; en mode intégré, les modèles des utilisateurs passent par la passerelle du site.

## 9. Ce qui reste

| Reste | Qui |
|---|---|
| Acheter `nexora.ai`, DNS de `studio.D` vers l'entrée publique, **HTTPS** (le port 80 de la VM n'est pas terminé en TLS) | **EXIGE LE FONDATEUR** |
| Recréer l'image du site avec `SITE_URL=https://D` (hors périmètre ici), puis §8 | pile du site |
| Courriel réel : `NEXORA_SMTP_HOST/PORT/USER/PASS` et `NEXORA_EMAIL_FROM` (Mailpit est provisoire, rien ne sort) ; retirer `mail-provisoire` de `COMPOSE_PROFILES` | **EXIGE LE FONDATEUR** (SMTP) |
| Supprimer le compte de test `essai-admin@nexora.test` et le fichier `compte_test_admin_mdp`, créer le vrai propriétaire, restreindre l'inscription | à l'ouverture |
| Remplacer le modèle `nexora-sonde-deepinfra` par un modèle de production (catalogue approuvé et synchronisé) | **EXIGE LE FONDATEUR** (taux de change, prix) |
| Copie hors VM de `pile.env` ; planifier `nexora-cli.sh backup` ; essai de restauration | à faire |
| Profil `voice` (Whisper, voix, diarisation) si voulu ; gVisor pour l'interpréteur | optionnel |
| Version de WorkStudio : `integre-2026-10-29` ; toute nouvelle version = nouvelles archives dans le paquet `nexora-images` puis `pousser-images.sh <version>` et `ws.sh up -d --no-build` (les VM n'atteignent pas pc4) | selon les versions |

## 10. Exploitation

```bash
ssh nexora-workstudio
cd /srv/nexora/workstudio
./ws.sh ps                     # état et santé
./ws.sh logs -f workstudio     # journaux (nexora-api, ollama, front, postgres…)
./ws.sh up -d --no-build       # démarre ou applique un changement de pile.env
./ws.sh down                   # arrête (sans -v : les volumes restent)
```

Redémarrage de la VM : tous les conteneurs reviennent seuls (`restart: unless-stopped`), la règle `DOCKER-USER` est reposée par `nexora-ws-pare-feu.service`. Sur 201, le relais revient par `nexora-litellm-lan.service`.

Installer ou refaire la VM depuis rien : cloner 9000 (§1), installer Docker et ufw, `rsync` de `deploy/` et `scripts/` de `root/nexora-workstudio` vers `/srv/nexora/workstudio`, copier `deploy/workstudio/*` de ce dépôt (`compose.proxmox.yml` dans `deploy/`, `default.conf.template` dans `deploy/workstudio-front/`, `ws.sh` et `configurer-env.sh` à la racine), `pousser-images.sh` depuis pc6, `bash scripts/init-env.sh` puis déplacer `deploy/.env` vers `pile.env`, `configurer-env.sh`, `NEXORA_UPSTREAM_KEY`, règles de pare-feu, `ws.sh up -d --no-build`, `ollama pull bge-m3`.
