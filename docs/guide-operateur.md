# Guide de l'opérateur du site Nexora

Pour une personne qui n'a pas suivi le projet et qui doit **démarrer, exploiter, sauvegarder et mettre en ligne** le site. Écrit le 27/10/2026 à partir de l'état du dépôt (branche `s9-recette`). Les chemins sont relatifs à la racine du dépôt. Pour le détail technique de chaque module : `docs/infra.md`, `docs/cms.md`, `docs/seo.md`, `docs/autogestion.md` ; pour les preuves de recette : `docs/recette/`.

**Règles qui ne se négocient pas** : aucun secret dans le dépôt, dans Directus, dans le navigateur ni dans un journal ; paiements en **mode test** tant que le fondateur n'a pas donné son accord explicite ; aucun agent ne publie sans approbation humaine.

## 1. Vue d'ensemble

```
Visiteurs ─▶ proxy HTTPS ─▶ site Next.js (web/, port 3500)  ─▶ PostgreSQL « app »  (comptes, crédits, clés, VPS, catalogues)
                                   │         │                 └▶ LiteLLM (interne) ─▶ fournisseurs de modèles
                                   │         └▶ Directus (contenu, approbations) ─▶ PostgreSQL « directus » + fichiers téléversés
 worker (worker/) : tâches (courriels, provisionnement VPS, agents du site, audits, indexation)
```

| Composant | Rôle | Port de développement |
|---|---|---|
| `web/` Next.js 16 | Pages publiques fr-CA et en-CA, espace client, API (`/v1` facturée, `/api/admin/*`, webhooks) | 3500 |
| `worker/` | File de tâches PostgreSQL ; aucun port | — |
| Directus 12.5.1 | Contenu, rôles, approbations, modules d'administration (Coffre, Modèles, VPS, Agents…) | 8456 |
| PostgreSQL 17 + pgvector | Bases `app`, `directus`, `litellm`, `umami` | 15440 |
| LiteLLM `v1.106.2` | Passerelle vers les modèles, **réseau interne seulement** | 4400 |
| Mailpit | Courriels de développement uniquement | 8026 (interface), 1026 (SMTP) |
| stripe-mock | Simulateur Stripe, développement uniquement | 12111 |

Décision de conception à retenir (D4) : **ce qui porte un identifiant client ou un montant vit dans la base `app`, jamais dans Directus**. Directus ne contient que le contenu et des configurations publiées.

## 2. Démarrer

### 2.1 Développement (poste de travail)

```bash
bash deploy/init-env.sh                                   # crée deploy/.env avec des secrets aléatoires (ne remplace jamais un fichier existant)
docker compose -p nexorasite -f deploy/compose.yml --env-file deploy/.env up -d
bun install
bash scripts/init-dev-env.sh deploy/.env                  # écrit .env et web/.env.local (ignorés par git), sans rien afficher
bun run db:migrate                                        # migrations Drizzle sur la base « app »
export NEXORA_ENV_FILE=$PWD/deploy/.env DIRECTUS_URL=http://localhost:8456
bun run cms/scripts/apply.ts                              # une seule fois : schéma, rôles, politiques, jetons Lecteur et Publication (docs/cms.md §1)
bash cms/scripts/stage-extensions.sh                      # construit l'extension « nexora-cms » (Coffre, Modèles, VPS, Agents…)
bun run cms/scripts/seed.ts                               # contenu initial, jamais d'écrasement
# pages et articles : cms/content/README.md (cms/scripts/load-content.ts ; contenus chargés « en revue », approuvés par une personne)
bun run --cwd web dev -p 3500                             # le site
bun run worker                                            # le worker, dans un autre terminal
bun run check                                             # lint + types + tests (à lancer avant tout dépôt)
bun run e2e                                               # parcours de bout en bout regroupés (§12.1)
```

### 2.2 Production du site (build puis démarrage)

```bash
bun run --cwd web build                                   # le script pose déjà NEXT_TELEMETRY_DISABLED=1
bun run --cwd web start -H localhost -p 3500              # écoute sur localhost (voir l'avertissement ci-dessous)
```

**Liaison de l'écoute : toujours `-H localhost`, ou `0.0.0.0` dans un conteneur, jamais `127.0.0.1` ni `::1`.** Avec `127.0.0.1`, Next 16.4.3 renomme l'hôte en « localhost » lors de la réécriture de `proxy.ts` (`/x` vers `/fr/x`) ; l'origine ne correspond plus, la requête est traitée comme une réécriture externe, la règle `/fr/…` vers `/…` renvoie 308 et **toutes les pages françaises bouclent** (l'anglais répond 200). Symptôme : redirections infinies sur `/`.

Autres exigences du démarrage :

- `NODE_ENV=production`. Dans ce mode, les clés Stripe de développement sont ignorées (§6).
- `SITE_URL=https://<domaine>` **avant** le build et le démarrage : sert aux canoniques, aux hreflang, au sitemap, aux liens des courriels, au contrôle d'origine (CSRF) et à l'attribut `Secure` du témoin de session. Oublié, il vaut `http://localhost:3500` : les pages annoncent localhost et les connexions échouent.
- `SITE_ENV=production` : **seule** valeur qui rend le site indexable (sinon `Disallow: /` et `noindex` partout, voulu en préproduction).
- `CMS_SNAPSHOT_DIR=<volume persistant>` : instantanés servis quand Directus est en panne (§11.3).
- Le worker : `bun run worker` avec les mêmes `DATABASE_URL`, `NEXORA_VAULT_MASTER_KEY`, `DIRECTUS_URL`, `NEXORA_APP_INTERNAL_URL`, `SITE_URL`, `SITE_ENV`, `SMTP_*`.

Ordre d'arrêt : le site et le worker d'abord, puis Directus, puis PostgreSQL. Ne jamais arrêter un processus « par motif » (`pkill -f`) sur une machine partagée : noter le PID de ce que l'on lance.

## 3. Variables d'environnement

Jamais dans le dépôt : `.env*` est ignoré par git sauf `deploy/.env.example`. En production, les secrets passent par des **secrets Docker** ou le gestionnaire de l'hébergeur ; les clés de fournisseurs passent par le **Coffre** (§4).

| Variable | Où | Obligatoire | Rôle |
|---|---|---|---|
| `DATABASE_URL` | web, worker, migrations | oui | Base `app` |
| `NEXORA_APP_ADMIN_TOKEN` | web, Directus | oui | Jeton d'administration (32 caractères au moins). Donne accès à `/api/admin/*` et `/api/revalidate`. **Ne jamais exposer ces routes à Internet** (§9) |
| `NEXORA_VAULT_MASTER_KEY` (+ `_VERSION`, `_PREVIOUS`, `_PREVIOUS_VERSION`) | web, worker | oui | Clé maîtresse du Coffre, 32 octets en base64. Sa perte rend tous les secrets illisibles (§4) |
| `BETTER_AUTH_SECRET` | web | oui | 32 caractères au moins ; signe sessions et jetons |
| `SITE_URL`, `SITE_ENV` | web, worker | oui | Voir §2.2 |
| `DIRECTUS_URL` | web, worker | oui | Adresse interne de Directus |
| `DIRECTUS_READER_TOKEN`, `DIRECTUS_PUBLISHER_TOKEN` | web | oui | Jetons « Lecteur site » (lecture) et « Publication » (aperçu seulement), créés par `cms/scripts/apply.ts` |
| `NEXORA_PREVIEW_SECRET` | web | pour l'aperçu | Signe les liens d'aperçu |
| `NEXORA_APP_INTERNAL_URL` | Directus, worker | oui | Adresse du site vue de Directus (revalidation, Coffre) et du worker (agents) |
| `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY` | web, worker | pour `/v1` | Sans la clé maîtresse, `/v1` répond 503 |
| `NEXORA_OUTBOUND_ALLOW` | web | si un amont est interne | Liste (virgules) d'hôtes, adresses ou plages CIDR internes autorisés pour fournisseurs et instances WorkStudio (§8). Défaut : réseau interne refusé en production |
| `SMTP_URL`, `MAIL_FROM` | web | oui | Courriels transactionnels. **Défaut = Mailpit local** : en production, rien ne part tant que ce n'est pas réglé |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD_FILE`, `SMTP_FROM`, `CONTACT_NOTIFY_TO`, `VPS_ALERT_TO` | worker | oui | Notification des demandes de diagnostic et alertes VPS. Mot de passe SMTP : chemin d'un secret Docker, jamais la valeur |
| `NEXORA_ALTCHA_SECRET` | web | non | Secret des défis anti-abus (dérivé du jeton d'administration à défaut) |
| `ROBOTS_AI_TRAINING` | web | non | `allow` autorise les robots d'entraînement ; défaut : refusés |
| `CMS_SNAPSHOT_DIR`, `CMS_TIMEOUT_MS` | web | recommandé | Instantanés du CMS (volume persistant) ; délai par requête vers Directus (4000) |
| `LOG_LEVEL` | web | non | `debug` ou `info` (défaut) |
| `WORKER_CONCURRENCY` (4), `WORKER_POLL_MS` (1000), `WORKER_SCHEDULER` | worker | non | Réglages du worker |
| `GATEWAY_*`, `BILLING_*`, `VPS_*` | web, worker | non | Limites et durées (`docs/infra.md`) |
| `VPS_WORKER_SSH_PUBLIC_KEY` | worker | pour les VPS | Clé publique du worker (la privée est au Coffre) |
| `NEXT_TELEMETRY_DISABLED=1` | machine de build | oui | Désactive la télémétrie anonyme de Next.js |
| `STRIPE_*` | web | **développement seulement** | Ignorées en production : les clés Stripe sont au Coffre (§6) |

Directus (`deploy/compose.yml`) : `DIRECTUS_SECRET`, `DIRECTUS_ADMIN_EMAIL`, `DIRECTUS_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `PUBLIC_URL`, `CORS_ORIGIN`, `TELEMETRY=false`. Les images sont épinglées **par empreinte** : ne jamais passer à `latest`. LiteLLM reste en `v1.106.2` (la 1.107.0 du 21/10/2026 était piégée).

## 4. Le Coffre et la rotation de la clé maîtresse

Le Coffre chiffre chaque secret (AES-256-GCM, clé de données aléatoire par secret, elle-même chiffrée par la clé maîtresse). **Une valeur n'est jamais relisible** : elle est remplaçable ou révocable.

- **Déposer un secret** : module Directus **Coffre** (« Coller une clé »), ou `POST /api/admin/vault` avec le jeton d'administration. Choisir le bon **type** : `llm_provider` (clé d'un fournisseur de modèles), `payment` (Stripe), `proxmox` (jeton Proxmox), `other` (clé d'espace WorkStudio, jetons des agents, clés SEO). Le type compte : **un secret n'est envoyé vers une adresse saisie que si son type convient** (fournisseur : `llm_provider` ; instance WorkStudio : `llm_provider` ou `other` ; Proxmox : `proxmox`). Les références `stripe.*`, `site-agent.*`, `seo.*`, `directus.*` ne peuvent jamais être utilisées comme clé de fournisseur, d'instance ou de Proxmox.
- **Références usuelles** : `stripe.secret_key`, `stripe.webhook_secret`, `proxmox.<code du serveur>`, `vps.worker_ssh_key`, `site-agent.<agent>.directus` et `.gateway`, `seo.bing.api_key`, `seo.searchconsole.credentials`, `seo.dataforseo.credentials`, `seo.postiz.api_key`.
- **Où garder la clé maîtresse** : dans un secret Docker ou le gestionnaire de l'hébergeur, **et** une copie hors serveur (gestionnaire de mots de passe d'équipe). Elle n'est jamais dans une sauvegarde de la base.

### Rotation (service ininterrompu)

1. `openssl rand -base64 32` : la nouvelle clé.
2. Environnement du site **et du worker** : ancienne clé en `NEXORA_VAULT_MASTER_KEY_PREVIOUS` (+ `_PREVIOUS_VERSION`, par exemple 1) ; nouvelle clé en `NEXORA_VAULT_MASTER_KEY` avec `NEXORA_VAULT_MASTER_KEY_VERSION=2`. Redémarrer les deux.
3. `bun run vault:rotate` : chaque secret actif est réencapsulé sous la version 2 (rejouable).
4. Vérifier : `GET /api/admin/vault` (liste sans valeurs) et une lecture réelle (« Tester le fournisseur »).
5. **Garder l'ancienne clé tant qu'une sauvegarde plus ancienne existe** : une archive faite avant la rotation exige l'ancienne clé. Ne retirer les variables `_PREVIOUS*` qu'après une restauration d'essai réussie sous la nouvelle clé (§10).

Rotation du **jeton d'administration** : changer `NEXORA_APP_ADMIN_TOKEN` dans le site **et** dans Directus (variables d'environnement du conteneur), redémarrer les deux. À faire à chaque départ d'une personne ayant eu accès au serveur.

## 5. Comptes de service Directus des agents du site

Cinq agents du site (Rédacteur, Traducteur, SEO on-page, Veille, Santé) ; chacun agit dans Directus avec **son propre compte de service**, qui ne peut que créer des brouillons (jamais publier, supprimer, ni toucher aux secrets). **`cms/scripts/apply.ts` ne crée pas ces comptes** : il créerait de nouveaux jetons hors du Coffre et rendrait périmés ceux déjà déposés. Procédure en production :

1. Dans Directus, créer un utilisateur par agent (courriel de service, par exemple `agent-redacteur@…`), rôle correspondant (« Agent Rédacteur », « Agent Traducteur », « Agent SEO on-page »…, créés par `apply.ts`), puis générer son **jeton statique**.
2. Module **Coffre** : coller le jeton sous `site-agent.<agent>.directus` (type `other`). Ne jamais le laisser dans un champ de Directus.
3. Module **Agents du site** : « Générer la clé de la passerelle » (clé Nexora de l'agent), « Allouer du crédit » à l'organisation interne, fixer **modèle et budget mensuel**, activer. Le budget est vérifié avant chaque appel ; l'arrêt est immédiat (désactiver l'agent).
4. Droits supplémentaires nécessaires au Rédacteur (créer la coquille d'une page) : voir `docs/propositions/s8-cms-agents.diff`.

En développement : `worker/scripts/dev-provision-agents.ts` fait tout cela avec des valeurs d'essai ; **ne jamais l'utiliser en production**.

## 6. Stripe : du mode test à la production

**État actuel : mode test seulement, imposé par le code.** Une clé `sk_live_…` ou `rk_live_…` est refusée (`StripeModeError`) et un événement `livemode: true` est rejeté (400).

### 6.1 Mode test (aujourd'hui)

1. Créer un compte Stripe, rester en mode test.
2. Module **Coffre** : `stripe.secret_key` (clé `sk_test_…` ou `rk_test_…`, type `payment`) et `stripe.webhook_secret` (`whsec_…` du point d'accès webhook, type `payment`).
3. Dans Stripe, point d'accès webhook : `https://<domaine>/api/stripe/webhook`, avec les 10 événements gérés (`docs/infra.md`, section Stripe). Sans les secrets au Coffre, le webhook répond 503 : voulu.
4. Module **Paiements/Modèles/VPS** : « Publier vers Stripe » pour les plans (crée produits et prix Stripe, écrit leurs identifiants).
5. Activer Stripe Tax (TPS, TVQ) et saisir les numéros d'inscription de Nexora **après validation d'un comptable**.

### 6.2 Passage en production

**Ne le faire qu'avec l'accord écrit du fondateur** et après les validations juridiques et fiscales (liste de contrôle, §13). Il faut une **modification de code** assumée, car la garde est voulue :

1. Lever la garde de clé dans `web/src/server/stripe/client.ts` (`assertTestModeKey`) et le refus de `livemode` dans `web/src/server/stripe/webhook-route.ts`, avec leurs tests ; relire par une seconde personne.
2. Déposer les clés **live** au Coffre sous les mêmes références, **après** avoir sauvegardé et révoqué les clés de test.
3. Créer le point d'accès webhook live et son secret ; republier les plans vers Stripe en mode live.
4. Faire un paiement réel de petit montant avec remboursement, vérifier le grand livre (`credit_entries`) et la facture.
5. Retirer les plans « [DEV] » (§13).

## 7. Serveurs Proxmox (VPS)

1. Dans Proxmox : utilisateur et jeton API dédiés (par exemple `nexora@pve!provision`), droits limités au pool ou au nœud ; certificat valide ou **empreinte SHA-256** du certificat auto-signé.
2. Préparer un gabarit cloud-init (Debian 12 ou Ubuntu 24.04, agent invité, CPU `host` pour AVX2) et noter son vmid.
3. Dans Directus, module **VPS** : créer le serveur (hôte, port, nœud, capacité, pool d'adresses, stockage), « Coller le jeton Proxmox » (type `proxmox`, référence `proxmox.<code>`), ajouter le gabarit, **« Tester la connexion »** : le serveur passe à « prêt » si Proxmox répond, que le nœud existe et que le gabarit est un modèle.
4. Clé SSH du worker : `ssh-keygen -t ed25519 -C nexora-worker` ; clé privée au Coffre (`vps.worker_ssh_key`, type `other`), clé publique dans `VPS_WORKER_SSH_PUBLIC_KEY`.
5. **Réseau** : un Proxmox est sur le réseau de l'opérateur ; l'adresse est acceptée (sauf lien local et métadonnées du nuage, toujours refusés). Le TLS est vérifié ou épinglé **avant** l'envoi du jeton ; `http://` n'est admis que sur la boucle locale (simulateur).
6. Pare-feu par VM (SSH seulement), port 25 sortant fermé : appliqués par le moteur.

Non vérifié à ce jour : aucun vrai Proxmox n'a été branché (le simulateur couvre le parcours). Dès qu'un serveur réel existe : lancer le test de contrat (`PROXMOX_CONTRACT_URL`… dans `docs/infra.md`) avant d'ouvrir les ventes.

## 8. Fournisseurs de modèles, LiteLLM, WorkStudio

### 8.1 Modèles

Module **Modèles** : ajouter un fournisseur (adresse, **région**, politique des données), coller sa clé au Coffre (type `llm_provider`), « Tester le fournisseur », ajouter des modèles, fixer **prix de vente et plancher de marge**, créer une **version de catalogue**, l'approuver, la publier, puis synchroniser vers LiteLLM. Un prix absent ou à 0 $ bloque la publication.

- Le fournisseur doit être **joignable par l'app** (« Tester ») et, séparément, par **LiteLLM** (adresse `litellmBaseUrl`, vue de son réseau Docker).
- Un fournisseur ou une instance sur le **réseau interne** (Ollama de Nexora, vLLM) : lister son hôte ou sa plage dans `NEXORA_OUTBOUND_ALLOW` (par exemple `ollama.interne.ca,10.20.0.0/24`) puis redémarrer le site. Sinon : « adresse du réseau interne refusée ». Les adresses de lien local (169.254.0.0/16, dont les métadonnées du nuage) sont refusées même si elles sont listées.
- La **résidence** affichée au public est celle saisie à la fiche : la relire à chaque changement de fournisseur. Aucune bascule silencieuse vers un modèle externe n'existe dans le code ; ne pas en configurer dans LiteLLM (`fallbacks`).

### 8.2 WorkStudio (agents hébergés et bulle)

1. Dans WorkStudio : Réglages, Clés d'API Nexora, créer une **clé d'espace** avec « Agents publiés ».
2. Module **Agents hébergés** : créer l'instance (adresse interne, ou publique en https), coller la clé au Coffre (type `other`), « Tester », « Découvrir » (les agents arrivent en brouillon), compléter chacun (description, **prix**), publier.
3. Côté WorkStudio, avant publication : **`NEXORA_EMBED_ORIGINS=https://<domaine du site>`**. Vide, l'instance accepte toutes les origines pour la bulle.
4. Bulle `/embed.js` : réglage dans le module (pages choisies) ; la CSP n'ouvre alors que l'origine configurée, sur ces pages seulement.
5. Limites : la réservation d'un appel est calculée sur `run_token_cap` (32 000 jetons par défaut), mais le règlement est au coût réel (un dépassement est facturé et peut rendre le solde négatif) ; renommer un agent dans WorkStudio change son identifiant amont `agent:<nom>` (le ressaisir dans le module) ; le coût amont de WorkStudio n'est pas suivi.

## 9. Proxy frontal (HTTPS)

Le site ne gère pas le TLS. Un proxy (nginx, Caddy…) termine HTTPS et transmet à `localhost:3500`. Obligations :

- **Écraser** `X-Forwarded-For` par l'adresse réelle du client (`proxy_set_header X-Forwarded-For $remote_addr;`), sinon la limitation de débit se contourne.
- **Ne pas publier** `/api/admin/*` ni `/api/revalidate` : ils ne doivent être joignables que depuis le réseau de Directus et du worker (`location ~ ^/api/(admin|revalidate) { deny all; }` côté public, ou écoute sur une interface interne distincte). C'est la mesure qui limite la portée du jeton d'administration.
- Ne pas publier Directus tel quel sans réfléchir : son panneau d'administration est une surface d'attaque ; le placer derrière un accès restreint (VPN, liste d'adresses) ; le site n'appelle Directus que depuis le serveur.
- Les en-têtes de sécurité (CSP, HSTS, `nosniff`, `frame-ancestors`) sont posés par le site : ne pas les retirer. HSTS sans `includeSubDomains` ni `preload` : à ajouter par l'opérateur quand le domaine est stabilisé.
- Redirection HTTP vers HTTPS, certificat renouvelé automatiquement.

## 10. Sauvegarde et restauration

Détail et preuves : `docs/recette/sauvegarde.md`.

```bash
# Tous les jours (exemple de crontab) ; l'archive est signée et chiffrée, les clés sont dans /etc/nexora/ (mode 0400)
17 3 * * * NEXORA_BACKUP_SIGNING_KEY_FILE=/etc/nexora/backup-sign.key NEXORA_BACKUP_ENCRYPT_KEY_FILE=/etc/nexora/backup-enc.key bash /opt/nexora/deploy/backup.sh --out /var/backups/nexora

# Vérifier une archive sans rien restaurer
bash deploy/restore.sh verifier /var/backups/nexora/nexora-backup-….tar.enc

# Essai de restauration dans un PostgreSQL jetable (à faire au moins chaque trimestre)
bash deploy/restore.sh essai /var/backups/nexora/nexora-backup-….tar.enc

# Reprise après sinistre dans un PostgreSQL existant
bash deploy/restore.sh restaurer ARCHIVE --pg-container <conteneur> --directus-container <conteneur Directus>
```

- Copier chaque archive **hors du serveur** (autre machine, autre site) ; noter son SHA-256 (affiché) ailleurs. Rotation des archives : à la charge de l'opérateur.
- **Conserver séparément** : clé maîtresse du Coffre, phrase de passe de chiffrement, clé de signature. Sans la clé maîtresse, les secrets de l'archive sont illisibles.
- L'archive contient les jetons statiques Directus en clair : toujours la chiffrer.
- Reprise après sinistre : (1) PostgreSQL et Directus démarrés, (2) `restaurer`, (3) **remettre `NEXORA_VAULT_MASTER_KEY` et `DIRECTUS_SECRET`** identiques à ceux d'origine, (4) démarrer Directus puis le site et le worker, (5) relancer « Synchroniser » du catalogue vers LiteLLM, (6) vérifier avec `GET /api/health` et la connexion d'un client.

## 11. Journaux et surveillance

### 11.1 Où et comment

- Site, worker : **une ligne JSON par événement sur la sortie standard** (`ts`, `level`, `name`, `msg`, champs). Les jetons Bearer, clés `sk-…` et mots de passe d'URL sont masqués ; aucun contenu de requête de modèle n'est journalisé. À rediriger vers le gestionnaire de journaux de l'hôte.
- Services Docker : `docker logs <conteneur>`. Directus : `docker logs nexorasite-directus-1` (la garde de publication y écrit « revalidation envoyée pour pages/<id> »).
- Santé : `GET /api/health` (200 si la base répond ; 503 sinon). À sonder chaque minute.
- Tâches : table `jobs` (colonnes `type`, `status`, `attempts`, `last_error`). Les tâches `dead` sont celles qui ont épuisé leurs essais : `SELECT type, last_error, finished_at FROM jobs WHERE status = 'dead' ORDER BY updated_at DESC;`.
- Usage des modèles : `usage_events` (métadonnées seulement). Grand livre : `credit_entries` (immuable, par déclencheur SQL).

### 11.2 Filtres utiles

```bash
docker logs nexorasite-directus-1 --since 1h | grep -E "revalidation|garde"
jq -c 'select(.level=="error")' site.log          # erreurs du site
jq -c 'select(.msg|test("Directus indisponible"))' site.log
```

### 11.3 Si Directus tombe

Le site continue : les pages déjà vues sont servies depuis les instantanés de `CMS_SNAPSHOT_DIR` ; une adresse inconnue répond 404 ; la passerelle, les comptes et les paiements ne dépendent pas de Directus. Ce qui s'arrête : publication, aperçu, modules d'administration, plans d'abonnement. **Sans volume persistant pour `CMS_SNAPSHOT_DIR`, un redémarrage pendant la panne perd les instantanés** (`docs/recette/cms-indisponible.md`).

## 12. Vérifier que tout marche

### 12.1 Commandes

```bash
bun run check              # lint, types, ~1 100 tests
bun run e2e                # inscription → crédits → clé → modèle ; commande VPS → simulateur → actif ; publication ;
                           # contact ; agent hébergé (sauté sans WORKSTUDIO_KEY_FILE) ; agents du site ; gardes et flux
                           # exige une base dédiée (jamais « app ») : E2E_ALLOW_APP=1 pour passer outre ; compte rendu : docs/recette/e2e.md
BASE_URL=https://<domaine> bun web/scripts/check-guards.ts     # gardes d'accès et en-têtes sur le site réel
BASE_URL=https://<domaine> bun web/scripts/audit-flux.ts       # aucune requête hors origine (navigateur réel)
bun web/scripts/check-seo.ts                                    # sitemap, hreflang, JSON-LD (EXPECT_ENV=staging en préproduction)
bun audit --prod                                                # dépendances de production
```

### 12.2 Incidents courants

| Symptôme | Cause probable | Action |
|---|---|---|
| Les pages françaises bouclent (308), l'anglais répond | Site lancé avec `-H 127.0.0.1` ou `::1` | Relancer avec `-H localhost` (ou `0.0.0.0` en conteneur) |
| Pages et sitemap pointent vers `localhost:3500`, connexions refusées (« Invalid origin ») | `SITE_URL` absent au build et au démarrage | Définir `SITE_URL=https://<domaine>`, reconstruire, redémarrer |
| `noindex` partout, `robots.txt` = `Disallow: /` | `SITE_ENV` différent de `production` | Voulu hors production ; poser `SITE_ENV=production` à la mise en ligne |
| `/v1/*` répond 503 | `LITELLM_MASTER_KEY` absent ou LiteLLM injoignable | Variable, `docker ps`, `LITELLM_BASE_URL` |
| `/v1/*` répond 402 `insufficient_quota` | Crédit du client épuisé (ou solde négatif après remboursement) | Normal ; le client recharge |
| `/v1/*` répond 502 `upstream_unavailable` | Fournisseur de modèle injoignable | « Tester le fournisseur » ; état de LiteLLM ; clé du Coffre |
| Webhook Stripe en 503 | Secrets Stripe absents du Coffre (en production les variables `STRIPE_*` sont ignorées) | Déposer `stripe.secret_key` et `stripe.webhook_secret` |
| Aucun courriel de vérification | `SMTP_URL` par défaut (Mailpit local) | Régler `SMTP_URL`, `MAIL_FROM` ; vérifier SPF/DKIM du domaine |
| Notification de diagnostic non reçue | Variables `SMTP_*` / `CONTACT_NOTIFY_TO` du worker | Corriger ; la tâche `contact.notify` reprend toute seule (demande déjà en base) |
| « adresse du réseau interne refusée » (422 ou test échoué) | Amont interne non autorisé | `NEXORA_OUTBOUND_ALLOW`, redémarrer (§8.1) |
| 422 `secret_scope` | Secret du mauvais type ou référence réservée | Redéposer sous un type adapté (§4) |
| Une page publiée n'apparaît pas | Revalidation non reçue | `docker logs` de Directus ; `NEXORA_APP_INTERNAL_URL` joignable depuis Directus ; jeton d'administration identique des deux côtés |
| Formulaire de contact : « trop de demandes » (429) | Limite de 5 par 10 minutes par adresse | Attendre ; vérifier que le proxy transmet la bonne adresse (§9) |
| Tâches `dead` dans `jobs` | Service amont indisponible durablement | Lire `last_error`, corriger, remettre `status = 'pending'` et `attempts = 0` |
| Directus tombé | — | §11.3 : le site sert ses instantanés |
| Image LiteLLM suspecte | Incident 1.107.0 (21/10/2026) | Rester sur `v1.106.2` par empreinte ; ne jamais `latest` |
| Disque presque plein sur la machine de développement | Caches de build Docker | `docker builder prune -af` après un build ; ne supprimer que ses propres images |

## 13. Liste de contrôle avant publication

Cocher dans l'ordre. Une case non cochée bloque la mise en ligne.

**Décisions du fondateur** (rien de tout cela n'est du ressort d'un agent)

- [ ] **Licence Directus** : clé *Open Innovation Grant* demandée sur https://directus.com/oig (moins de 5 M$ de revenus et moins de 50 employés) ; licence MSCL acceptée et propriétaire du projet identifié. Sans la clé : 3 sièges, 25 collections, 5 flows, et les règles de permission sont refusées (le jeton lecteur voit les brouillons ; le site filtre `status = published`, ne jamais l'oublier).
- [ ] Identité légale (raison sociale, NEQ, TPS, TVQ, adresse) saisie ; mentions légales, confidentialité, conditions, utilisation acceptable **relues par un avocat québécois**.
- [ ] Registre des affirmations (`claims`) : chaque affirmation relue et **approuvée par une personne** ; les « à compléter » (CL-A01 à CL-A14) traités ; aucune affirmation de conformité à la Loi 25 sans validation.
- [ ] Prix des plans, des modèles et des agents fixés par le fondateur ; aucun prix inventé.
- [ ] **Robots d'entraînement** : décision d'affaires (par défaut refusés par `robots.txt`) ; poser `ROBOTS_AI_TRAINING=allow` seulement si le fondateur le décide.
- [ ] Stripe : accord explicite pour passer en production (§6.2) ; comptable consulté pour TPS/TVQ.

**Données de développement à retirer**

- [ ] **Plans VPS « [DEV] »** (`dev-essai-1`, `dev-essai-2`, `dev-essai-4`) et le serveur simulé `dev-simule` désactivés ou supprimés (module VPS) : ils sont commandables en développement avec un badge visible.
- [ ] Modèle et fournisseur de développement (`nexora/glm-5-3`, fournisseur `dev-litellm`, LiteLLM de pc1) retirés du catalogue publié ; **aucun crédit de test** (`dev_test_credit`) en base de production.
- [ ] Comptes et clés d'essai, agents provisionnés par `dev-provision-agents.ts`, mots de passe d'essai supprimés ; Mailpit et stripe-mock absents de la pile de production.
- [ ] Les dix départements d'OPSYS-AI affichés « En pilote » (choix prudent) et l'affirmation CL-12 (« offres en libre-service pas encore ouvertes ») : confirmer ou corriger.

**Configuration**

- [ ] `SITE_URL` (https), `SITE_ENV=production`, `NODE_ENV=production`, site lancé avec `-H localhost`, proxy HTTPS en place (§9) ; `/api/admin/*` et `/api/revalidate` **non publiés**.
- [ ] Tous les secrets au Coffre ou en secrets Docker ; **aucun** secret de développement réutilisé ; clé maîtresse du Coffre et jeton d'administration régénérés pour la production.
- [ ] `NEXORA_EMBED_ORIGINS=https://<domaine>` posé côté WorkStudio ; `NEXORA_OUTBOUND_ALLOW` limité au strict nécessaire.
- [ ] SMTP réel testé (vérification de courriel, diagnostic) ; SPF/DKIM.
- [ ] `MARKETPLACE_REGISTRY` de Directus pointé vers une adresse inatteignable (la Marketplace appelle `registry.directus.io` par défaut : écart E3 de `docs/recette/flux-sortants.md`) ; `TELEMETRY=false` conservé ; `NEXT_TELEMETRY_DISABLED=1` sur la machine de build.
- [ ] Domaine, DNS, certificat ; liste des sous-traitants et lieu d'hébergement documentés (Stripe, SMTP, fournisseurs de modèles, outils SEO activés).
- [ ] Serveur(s) Proxmox réel(s) branché(s) et **test de contrat** passé avant d'ouvrir les ventes de VPS.

**Preuves à refaire sur l'environnement final**

- [ ] `bun run check` vert ; `bun run e2e` sur une base dédiée ; `check-guards.ts` et `audit-flux.ts` contre l'adresse réelle ; accessibilité et Lighthouse page par page (recette de l'orchestrateur) ; `lychee` sans lien cassé.
- [ ] Une sauvegarde chiffrée **et sa restauration d'essai** réussies ; la clé maîtresse retrouvée dans le gestionnaire de mots de passe.
- [ ] `bun audit --prod` sans avis ; balayage `gitleaks` de l'historique sans alerte réelle.
- [ ] Revue indépendante de bout en bout (sécurité, paiements, isolation des clés) sans point bloquant ni important ouvert.
