# Sauvegarde et restauration isolées

Recette S9, daté du 27/10/2026. Scripts : `deploy/backup.sh`, `deploy/restore.sh`, bibliothèque `deploy/lib/backup-lib.sh`, tests `deploy/tests/manifest.test.sh` (exécutés par `bun run check` via l'espace de travail `@nexora/deploy`). Dépendances sur la machine : `bash`, `docker`, `jq`, `sha256sum`, `tar`, `openssl`.

## Ce que fait la sauvegarde

`deploy/backup.sh --out DOSSIER [--signer CLE] [--chiffrer CLE] [--sans-fichiers]` produit **une archive** `nexora-backup-<UTC>.tar` (ou `.tar.enc`), en mode 0600, qui contient :

| Fichier | Contenu |
|---|---|
| `app.dump` | Base `app` (comptes, grand livre, clés API, commandes VPS, coffre **chiffré**, catalogues, tâches…), `pg_dump -Fc --no-owner --no-acl` |
| `directus.dump` | Base `directus` (pages, blocs, versions, approbations, utilisateurs et rôles) |
| `directus-uploads.tar` | Fichiers téléversés de Directus (`/directus/uploads`, par `docker cp`) |
| `manifest.json` | Format, date, version de PostgreSQL, **empreinte SHA-256 et taille de chaque fichier**, **décompte exact de lignes de chaque table** des deux bases, nombre de fichiers téléversés |
| `SHA256SUMS` | Les mêmes empreintes, au format de `sha256sum -c` |
| `manifest.sig` | (facultatif) HMAC-SHA256 du manifeste avec une clé de signature |

Cohérence : le dump et le décompte d'une base sont pris dans le **même instantané transactionnel** (`pg_export_snapshot`), donc le décompte est exact même si le site écrit pendant la sauvegarde.

**Jamais dans l'archive** : la clé maîtresse du coffre (`NEXORA_VAULT_MASTER_KEY`, jamais lue par les scripts), les fichiers `.env`, la clé de signature, la phrase de passe de chiffrement. Vérifié : `pg_restore` des deux dumps en texte, recherche de la valeur réelle de la clé maîtresse et du jeton d'administration : **0 occurrence** ; la ligne `secrets` du manifeste le rappelle. Les secrets du coffre y sont, **chiffrés** par cette clé maîtresse : sans elle, ils sont illisibles (voir « Instructions séparées »).

**Attention** : `directus.dump` contient les **jetons statiques des comptes de service** Directus **en clair** (5 lignes `directus_users.token`, non hachées) et les hachages des mots de passe. L'archive est donc sensible : chiffrez-la dès qu'elle quitte le serveur (`--chiffrer`, AES-256-CBC, PBKDF2 600 000 itérations) et stockez-la hors du serveur.

## Ce que fait la restauration

| Commande | Effet |
|---|---|
| `deploy/restore.sh verifier ARCHIVE` | Vérifie sans rien restaurer : liste des membres du tar (aucun chemin hors du dossier racine, aucun lien, aucun fichier inattendu), manifeste, empreintes, signature |
| `deploy/restore.sh essai ARCHIVE [--garder]` | Démarre un **PostgreSQL jetable** (conteneur étiqueté `nexora.restore-sandbox=1`, `127.0.0.1` seulement, image de `deploy/compose.yml`), restaure les deux bases, compare **chaque table** au manifeste, supprime le conteneur (et son volume) à la fin, sauf `--garder` |
| `deploy/restore.sh detruire NOM` | Supprime un conteneur d'essai ; **refuse tout conteneur sans l'étiquette** |
| `deploy/restore.sh restaurer ARCHIVE --pg-container C [--directus-container D] [--forcer]` | Reprise après sinistre dans un PostgreSQL existant ; **refuse d'écraser** une base qui existe déjà sans `--forcer` ; recopie les fichiers téléversés dans le conteneur Directus indiqué |

Dans tous les cas, **l'archive est vérifiée avant toute action** : une archive altérée ne démarre aucun conteneur.

## Preuves

### 1. Données réelles de développement (base `app` partagée, lecture seule)

Commande : `deploy/backup.sh --out … && deploy/restore.sh essai …`. Sortie du 27/10/2026 :

```
Archive : …/nexora-backup-20261027T105043Z.tar   Taille : 1341440 octets
SHA-256 : 11a45698e82e8fec8a74172b27dbeb6151342dd0eca7445caf06dca9d86dfc40
Tables  : app=45, directus=57 ; fichiers téléversés : 0
  table (app)                           manifeste   restaurée
  credit_entries                               63           63      (grand livre)
  api_keys                                     11           11      (clés API)
  vps_orders                                    6            6      (commandes VPS)
  vps_instances                                 6            6
  users                                         6            6
  organizations                                 8            8
  vault_secrets                                 9            9
  models                                        1            1
  → 45 table(s) comparée(s), 0 écart(s).
  table (directus)                      manifeste   restaurée
  pages                                        34           34      (pages)
  directus_files                                0            0
  directus_users                                8            8
  → 57 table(s) comparée(s), 0 écart(s).
RESTAURATION EXACTE : tous les décomptes concordent.
Conteneur « nexorasite-s9-restore-… » supprimé à la fin.
```

(La liste complète compare les 45 tables de `app` et les 57 de `directus`, pas seulement celles montrées.)

### 2. Le site démarre sur la base restaurée et affiche le solde et le catalogue

Base source : `app_s9` (base de recette). `web/scripts/restore-proof.ts seed` inscrit un client de test sur un site de production (courriel vérifié par Mailpit), le crédite (crédit de TEST du grand livre : 7,25 $) et lui crée une clé `nxk_`. Sauvegarde **signée** de `app_s9` + `directus`, avec un conteneur Directus de substitution contenant 3 fichiers téléversés (`logo.png`, `photo.jpg`, `sous-dossier/note.txt`, dont un dans un sous-dossier) : `Tables : app=45, directus=57 ; fichiers téléversés : 3`. Restauration d'essai (`--garder`, port 15461), décomptes : 45 tables sans écart pour `app_s9` (grand livre 21/21, clés API 5/5, utilisateurs 1/1…) et 57 sans écart pour `directus` (pages 34/34), fichiers téléversés 3 = 3.

Puis un **autre serveur Next.js de production** (port 3747, `DATABASE_URL=postgres://nexora@127.0.0.1:15461/app`, la base restaurée) et `restore-proof.ts check` :

```
OK    le même client se connecte sur le site branché sur la base restaurée
OK    le solde affiché dans /compte est celui d'avant la sauvegarde — affiché « 7,25 $ », attendu 7.25 $
OK    la clé API du client est listée (préfixe) — nxk_88sLCMg
OK    le catalogue /modeles affiche le modèle publié
OK    la clé du client est acceptée par /v1/models (empreinte lue dans la base restaurée) — HTTP 200
OK    une clé altérée reste refusée — HTTP 401
```

Le conteneur d'essai a ensuite été supprimé (`restore.sh detruire`), de même que le conteneur de substitution et le serveur de la preuve.

### 3. Une archive altérée est refusée

| Essai | Résultat |
|---|---|
| Un octet changé dans `app.dump` | `Archive refusée : empreinte SHA-256 différente pour app.dump (fichier altéré ou tronqué).` code 1 ; **aucun conteneur créé** |
| Archive signée, aucune clé de signature fournie | `Archive refusée : elle est signée, mais aucune clé de signature n'est fournie.` |
| Archive signée, bonne clé | `Archive valide : … 3 fichier(s), empreintes et manifeste concordants.` |
| Archive chiffrée sans la clé | `Archive refusée : clé de chiffrement introuvable ou vide.` |

Tests automatisés (`deploy/tests/manifest.test.sh`, 20 contrôles, sans Docker ni base) : archive intacte acceptée ; octet modifié, fichier tronqué, fichier manquant, fichier non déclaré, lien symbolique, chemin `../` hors du dossier racine : **refusés** ; manifeste réécrit avec de fausses empreintes cohérentes : passe **sans** signature (attendu, d'où la signature recommandée) et est **refusé** avec signature ; signature absente, signature d'une autre clé : refusées ; chiffrement : aller-retour identique, mauvaise clé refusée, fichier chiffré altéré refusé, contenu illisible.

## Instructions séparées : la clé maîtresse et les phrases de passe

L'archive ne sert à rien sans trois éléments conservés **ailleurs que dans l'archive et ailleurs que sur le serveur de sauvegarde** :

1. **`NEXORA_VAULT_MASTER_KEY`** (et, après une rotation, la version précédente tant qu'une archive plus ancienne existe). Sans elle, `vault_secrets` est illisible : le site démarre mais ne peut plus appeler Stripe, les fournisseurs de modèles ni Proxmox, et les clés doivent être recollées dans le Coffre. Conservez-la dans un gestionnaire de mots de passe ou un coffre papier, avec la date de sa dernière rotation.
2. La **phrase de passe de chiffrement** de l'archive (`--chiffrer`).
3. La **clé de signature** du manifeste (`--signer`).

Après une restauration réelle : remettre `NEXORA_VAULT_MASTER_KEY` **avant** de démarrer le site et le worker ; démarrer Directus avec le même `SECRET` ; restaurer ensuite les fichiers téléversés (`--directus-container`). Le détail est dans `docs/guide-operateur.md`.

## Limites connues

- LiteLLM (base `litellm`) n'est pas sauvegardée : elle ne contient que l'état reconstruit par la synchronisation du catalogue ; relancer la synchronisation après une restauration.
- La base `umami` (non utilisée) et les volumes de Mailpit ne sont pas sauvegardés.
- Les instantanés du CMS (`CMS_SNAPSHOT_DIR`) ne le sont pas non plus : ils se reconstruisent à la première visite des pages.
- Pas de planification : à lancer par `cron` ou par un minuteur systemd (exemple dans le guide opérateur) ; pas de rotation des archives (à faire par l'opérateur).
- Sauvegarde en ligne cohérente par base, mais **non simultanée entre `app` et `directus`** (deux instantanés distincts, à quelques secondes d'écart) : sans conséquence, car les deux bases ne partagent aucune clé étrangère (D4).
