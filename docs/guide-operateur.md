# Guide de l'opérateur du site Nexora

Pour une personne qui n'a pas suivi le projet et qui doit **démarrer, exploiter, sauvegarder et mettre en ligne** le site. Écrit le 27/10/2026 à partir de l'état du dépôt (branche `s9-recette`). Les chemins sont relatifs à la racine du dépôt. Pour le détail technique de chaque module : `docs/infra.md`, `docs/cms.md`, `docs/seo.md`, `docs/autogestion.md` ; pour les preuves de recette : `docs/recette/`.

**Règles qui ne se négocient pas** : aucun secret dans le dépôt, dans Directus, dans le navigateur ni dans un journal ; paiements en **mode test** tant que le fondateur n'a pas autorisé les paiements réels dans l'administration (§6.4) ; aucun agent ne publie sans approbation humaine.

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

- **Node.js 22.18 ou plus récent** (ou 23.6+) sur l'hôte qui lance le worker et les migrations : `worker` (`node src/main.ts`) et `packages/db` (`node src/migrate-cli.ts`) s'appuient sur l'exécution native du TypeScript par Node. Bun 1.4 pour l'installation, les tests et le site.
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
| `NEXORA_PREVIEW_SECRET` | web | pour l'aperçu | Signe les liens d'aperçu (10 minutes) **et la session d'aperçu de 30 minutes** (cookie `nexora_preview`) : passé ce délai, ou sans ce secret, le site efface le cookie du Draft Mode et sert les pages publiées |
| `NEXORA_APP_INTERNAL_URL` | Directus, worker | oui | Adresse du site vue de Directus (revalidation, Coffre) et du worker (agents). **À poser explicitement des deux côtés, avec la même valeur** : les défauts ne valent que pour le développement (`deploy/compose.yml` : `http://host.docker.internal:3500` ; worker hors production : `http://127.0.0.1:3500`). En production, le worker refuse de démarrer sans elle (et sans `DIRECTUS_URL`) ; Directus l'accepte vide, mais journalise alors au démarrage, et à chaque publication, « revalidation ignorée » : le site n'est plus rafraîchi |
| `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY` | web (les deux), worker (adresse seule) | pour `/v1` | Sans la clé maîtresse, `/v1` répond 503. Le worker n'a pas d'adresse par défaut : sans `LITELLM_BASE_URL`, la sonde LiteLLM de l'agent Santé est notée « non configurée » dans son rapport (jamais sautée en silence) |
| `NEXORA_PASSWORD_BREACH_CHECK` | web | non | `on` / `off`. Vérification des mots de passe contre les fuites connues (HIBP « Pwned Passwords », k-anonymat : seuls 5 caractères de l'empreinte SHA-1 quittent le serveur, jamais le mot de passe). **Défaut : activée en production, coupée ailleurs.** `off` pour un serveur sans sortie Internet (la longueur de 12 caractères et la liste locale de mots de passe courants restent appliquées). Une panne du service laisse passer l'inscription (journalisée) |
| `NEXORA_OUTBOUND_ALLOW` | web | si un amont est interne | Liste (virgules) d'hôtes, adresses ou plages CIDR internes autorisés pour fournisseurs et instances WorkStudio (§8). Défaut : réseau interne refusé en production |
| `NEXORA_SECRET_HOSTS_MODEL_PROVIDER`, `NEXORA_SECRET_HOSTS_WORKSTUDIO`, `NEXORA_SECRET_HOSTS_PROXMOX` | web **et worker** (la même valeur dans les deux) | pour WorkStudio et Proxmox ; un fournisseur interne ou hors liste | **Hôtes vers lesquels une clé du Coffre peut partir**, fixés par l'opérateur et jamais modifiables dans l'administration (§8.0). Listes séparées par des virgules : hôtes exacts (`llm.interne.exemple`, `192.168.10.5`) ou `*.domaine` (sous-domaines, pas le domaine lui-même) ; `-hôte` retire un hôte par défaut. **Défaut** : fournisseurs de modèles connus en HTTPS (`openrouter.ai`, `api.openai.com`, `api.anthropic.com`, `api.mistral.ai`, `generativelanguage.googleapis.com`, `api.groq.com`, `api.together.xyz`, `api.deepseek.com`, `api.cohere.com`, `api.fireworks.ai`, `api.x.ai`, `api.perplexity.ai`, `api.cerebras.ai`, `api.deepinfra.com`, `integrate.api.nvidia.com`) ; **rien** pour WorkStudio et Proxmox (à déclarer). Hors production, la boucle locale est admise |
| `SMTP_URL`, `MAIL_FROM` | web | oui | Courriels transactionnels. **Défaut = Mailpit local** : en production, rien ne part tant que ce n'est pas réglé |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD_FILE`, `SMTP_FROM`, `CONTACT_NOTIFY_TO`, `VPS_ALERT_TO` | worker | oui | Notification des demandes de diagnostic et alertes VPS. **Mot de passe SMTP : seulement le chemin d'un secret (`SMTP_PASSWORD_FILE`)** ; une variable `SMTP_PASSWORD` en clair est refusée (le worker ne démarre pas, avec un message qui le dit : l'environnement se lit par `docker inspect`). `SMTP_SECURE=true` : TLS implicite (port 465). `SMTP_REQUIRE_TLS=true` : STARTTLS obligatoire (port 587) ; à poser avec un vrai SMTP, laissé vide avec Mailpit qui n'a pas de TLS |
| `NEXORA_ALTCHA_SECRET` | web | non | Secret des défis anti-abus (dérivé du jeton d'administration à défaut) |
| `ROBOTS_AI_TRAINING` | web | non | `disallow` refuse les robots d'entraînement ; défaut : autorisés (tout le public est ouvert, sauf `/api/`, `/v1/` et l'espace client) |
| `SITE_SAME_AS` | web | recommandé | Profils publics de l'entreprise (adresses https séparées par une virgule : réseaux sociaux, dépôt public…), émis comme `sameAs` de l'Organization. À poser seulement avec des adresses qui existent |
| `CMS_SNAPSHOT_DIR`, `CMS_TIMEOUT_MS` | web | recommandé | Instantanés du CMS (volume persistant) ; délai par requête vers Directus (4000) |
| `LOG_LEVEL` | web | non | `debug` ou `info` (défaut) |
| `WORKER_CONCURRENCY` (4), `WORKER_POLL_MS` (1000), `WORKER_SCHEDULER` | worker | non | Réglages du worker. **`WORKER_SCHEDULER=off` coupe tout le planificateur, pas seulement le SEO** : audit nocturne, indexation, santé des modèles, veille, **mais aussi `ledger.release-stale` (libération des réservations perdues, toutes les 10 minutes), `ledger.grant-tranches` (versement des douzièmes des offres annuelles, chaque heure) et `ledger.expire` (expiration quotidienne des crédits)**. À n'utiliser que pour un essai ; sans le planificateur, les réservations d'un appel interrompu restent bloquées, les clients d'une offre annuelle ne reçoivent que leur premier mois et les crédits n'expirent pas |
| `GATEWAY_*`, `BILLING_*`, `VPS_*` | web, worker | non | Limites et durées (`docs/infra.md`) |
| `WORKSTUDIO_PUBLIC_URL` | web | pour le bouton « Ouvrir WorkStudio » et le SSO | Adresse publique de WorkStudio (https). Le bouton de l'espace client y mène ; l'adresse de retour OIDC en est dérivée (`docs/workstudio-integre.md`) |
| `WORKSTUDIO_OIDC_CLIENT_ID`, `WORKSTUDIO_OIDC_CLIENT_SECRET`, `WORKSTUDIO_OIDC_TOKEN_AUTH` | web | pour la connexion unique | Client OpenID Connect de WorkStudio (identifiant 8 à 128 caractères, secret de 32 à 256 caractères, `post` ou `basic`). **Absents, le site n'est pas fournisseur OIDC** (404). Le secret en secret Docker, jamais dans Git |
| `WORKSTUDIO_GATEWAY_URL`, `WORKSTUDIO_DEFAULT_MODEL` | web | pour l'accès modèle par utilisateur | Passerelle rendue à WorkStudio (se termine par `/v1`) et modèle par défaut (défaut `nexora/deepseek-v4.1-flash-1017`). Sans passerelle, `GET /api/oauth/workstudio-access` répond 503 |
| `VPS_WORKER_SSH_PUBLIC_KEY` | worker | pour les VPS | Clé publique du worker (la privée est au Coffre) |
| `NEXT_TELEMETRY_DISABLED=1` | machine de build | oui | Désactive la télémétrie anonyme de Next.js |
| `STRIPE_*` | web | **développement seulement** | Ignorées en production : les clés Stripe sont au Coffre (§6) |

Directus (`deploy/compose.yml`) : `DIRECTUS_SECRET`, `DIRECTUS_ADMIN_EMAIL`, `DIRECTUS_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `DIRECTUS_PUBLIC_URL` (devient `PUBLIC_URL`, défaut `http://localhost:8456`), `DIRECTUS_CORS_ORIGIN` (devient `CORS_ORIGIN`, même défaut), `MARKETPLACE_REGISTRY` (posé à une adresse injoignable : la Marketplace ne contacte plus `registry.directus.io`), `TELEMETRY=false`. `deploy/init-env.sh` génère les secrets de `deploy/.env`, dont `BETTER_AUTH_SECRET` ; `deploy/.env.example` liste les variables de production (commentées). Les images sont épinglées **par empreinte** : ne jamais passer à `latest`. LiteLLM reste en `v1.106.2` (la 1.107.0 du 21/10/2026 était piégée).

Autres variables (outils et réglages fins, rarement à poser) : `DIRECTUS_ADMIN_TOKEN` (scripts `cms/scripts`, à la place du courriel et du mot de passe, `docs/cms.md`) ; `NEXORA_DB_CONTAINER`, `NEXORA_DIRECTUS_CONTAINER`, `NEXORA_PG_IMAGE` et les autres `NEXORA_*` de la sauvegarde (§10, `docs/recette/sauvegarde.md`) ; `SEO_AUDIT_BASE_URL`, `SEO_AUDIT_PERF_MAX_PAGES`, `LYCHEE_BIN`, `CHROME_PATH`, `POSTIZ_URL` (audits et diffusion, `docs/seo.md`).

## 4. Le Coffre et la rotation de la clé maîtresse

Le Coffre chiffre chaque secret (AES-256-GCM, clé de données aléatoire par secret, elle-même chiffrée par la clé maîtresse). **Une valeur n'est jamais relisible** : elle est remplaçable ou révocable.

- **Déposer un secret** : module Directus **Coffre** (« Coller une clé »), ou `POST /api/admin/vault` avec le jeton d'administration. Choisir le bon **type** : `llm_provider` (clé d'un fournisseur de modèles), `payment` (Stripe), `proxmox` (jeton Proxmox), `other` (clé d'espace WorkStudio, jetons des agents, clés SEO). Le type compte : **un secret n'est envoyé vers une adresse saisie que si son type convient** (fournisseur : `llm_provider` ; instance WorkStudio : `llm_provider` ou `other` ; Proxmox : `proxmox`). Les références `stripe.*`, `site-agent.*`, `seo.*`, `directus.*`, `vps.*` (dont la clé SSH du worker) ne peuvent jamais être utilisées comme clé de fournisseur, d'instance ou de Proxmox.
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
4. Le droit de créer la coquille d'une page (en brouillon) est accordé au seul Rédacteur par `apply.ts` (`cms/scripts/lib/access.ts`) ; rien à ajouter à la main.

En développement : `worker/scripts/dev-provision-agents.ts` fait tout cela avec des valeurs d'essai ; **ne jamais l'utiliser en production**.

## 6. Stripe : de la clé collée à la première vente

**Principe (vague 2, D1 à D4).** Tout est construit pour de vrai et s'active quand la clé Stripe est collée : aucune maquette. Le **mode test** est le mode par défaut ; la **production** (argent réel) exige un geste explicite du fondateur dans l'administration (§6.4). Tout se fait dans le module Directus **Paiements** (barre de gauche) ; les secrets, eux, se collent dans le module **Coffre**.

### 6.1 Brancher Stripe en un geste

1. Dans Stripe (mode **test** d'abord), **Développeurs → Clés API** : copier la clé secrète `sk_test_…` (ou créer une clé restreinte `rk_test_…` avec écriture sur *Webhook Endpoints*, *Produits*, *Prix*, *Coupons*, *Codes promotionnels*, *Sessions Checkout*, *Clients* et lecture sur *Compte* et *Stripe Tax*).
2. Module **Coffre** : référence `stripe.secret_key`, type **Paiement**, coller la clé. Elle est chiffrée et ne se relit jamais.
3. Module **Paiements → Stripe** : cliquer **« Vérifier et brancher Stripe »**. L'application :
   - lit la clé au Coffre et détecte le **mode** (test ou production) ;
   - interroge Stripe : **compte** (identifiant, nom), **pays** (le Canada est attendu pour la TPS et la TVQ), **Stripe Tax** (actif ou non) ;
   - **crée le point de webhook** `https://<SITE_URL>/api/stripe/webhook` avec **exactement les 12 événements gérés** (liste affichée dans le module) et range son secret `whsec_…` au Coffre (`stripe.webhook_secret`) ;
   - est **rejouable** : un second clic met le point à jour (événements, réactivation) et garde le secret. Si un point existe déjà à la même adresse sans que son secret soit connu (Stripe ne le montre qu'à la création), il est **remplacé** ; les points des autres adresses ne sont jamais touchés.
4. L'état s'affiche clairement : **Branché**, **Clé manquante** (avec l'action : coller la clé), **Clé collée, à vérifier**, ou **Erreur** (message et action : clé refusée, adresse du site non publique, secret du webhook disparu du Coffre, adresse du site changée…). Les avertissements (pays autre que le Canada, Stripe Tax inactif) n'empêchent pas le branchement mais sont à traiter.
5. Le webhook lit son secret **au Coffre en production** (la variable `STRIPE_WEBHOOK_SECRET` n'est lue qu'en développement) ; sans secret, il répond 503, ce qui est voulu.
6. Prérequis : `SITE_URL` doit être l'adresse publique **https** (sinon Stripe ne peut pas appeler le webhook : le branchement le dit). En local, utiliser la CLI Stripe (`stripe listen --forward-to localhost:3500/api/stripe/webhook`).
7. Dans le tableau de bord Stripe : activer **Stripe Tax**, ajouter les inscriptions TPS et TVQ de Nexora (numéros, adresse d'origine, catégorie « services numériques / logiciel-service ») **après validation d'un comptable**.

### 6.2 Offres d'abonnement, essai gratuit et « Publier vers Stripe »

Les offres vivent dans Directus (collection **Plans d'abonnement**). Chaque **ligne** est une période : une ligne mensuelle et, si voulu, une ligne annuelle qui partagent le champ **Offre (regroupement)** ; la page Tarifs les affiche ensemble.

1. Trois offres WorkStudio (Démarrage, Équipe, Affaires) sont préparées **en brouillon** avec un **prix suggéré** (champ non publié) : `bun run seed` les crée (rejouable, ne touche jamais une fiche existante). Aucune n'est publiée.
2. Module **Paiements → Offres** : par ligne, **« Adopter le prix suggéré »** copie le prix suggéré dans le prix (ou saisir le prix dans la fiche). Prix en cents CAD **avant taxes** ; une ligne annuelle porte le **total de l'année** et ses crédits inclus sont ceux de l'année, **versés mois par mois** (un douzième chaque mois, valable le mois en cours : tâche `ledger.grant-tranches` du worker, voir `docs/infra.md`).
3. Passer la fiche à **« Publié »** dans Directus (la garde de publication s'applique), puis **« Publier vers Stripe »** : crée ou met à jour le **produit** et le **prix** Stripe et **écrit les identifiants dans la fiche** (rejouable). Un **prix modifié** crée un **nouveau prix** Stripe et archive l'ancien (les abonnés gardent le leur). Après un changement de compte Stripe (test → production), relancer l'action : les anciens identifiants sont remplacés.
4. **Essai gratuit** : champ **Essai gratuit (jours)** de la fiche (0 = aucun), appliqué au Checkout (`subscription_data.trial_period_days`). **Carte pendant l'essai** : réglage général (module Paiements → Stripe, défaut : carte exigée) ou décision propre à l'offre. Sans carte, l'abonnement est annulé à la fin de l'essai si aucune carte n'a été ajoutée. **Un seul essai par organisation, par moyen de paiement et par courriel**, pour une famille d'offre : le webhook lit l'empreinte de la carte (`card.fingerprint` chez Stripe) et le courriel du client (alias `+étiquette` et points Gmail ignorés) ; si l'un a déjà servi pour un autre abonnement, l'essai est **résilié chez Stripe sans prélèvement** (journalisé dans `trial_denials`) et le client peut se réabonner **sans essai**. Au Checkout, un courriel déjà servi n'obtient plus d'essai. Sans carte exigée, seul le courriel limite. **Un code d'essai exige toujours une carte.** Les crédits inclus ne sont accordés qu'à la première facture **payée** (une facture à 0 $ n'en accorde pas), **proportionnellement au prix payé** (un code de 99 % ne donne que 1 % des crédits) ; une offre annuelle les verse **un douzième par mois**.
5. Une offre publiée mais pas encore poussée vers Stripe s'affiche sur la page Tarifs avec « Bientôt disponible » (jamais un bouton qui échouerait).

### 6.3 Codes promo (module Paiements → Codes promo)

- **Types** : pourcentage, montant, gratuit (100 %), essai de N jours, **personnel** (§6.5). **Portée** : abonnements, crédits, VPS. **Durée** : une fois, N mois, toujours. **Limites** : utilisations maximales, expiration, première commande seulement, un seul usage par client, montant minimum.
- **Créer un code** ou **générer un lot** (préfixe, nombre jusqu'à 5 000, longueur) ; **désactiver** / réactiver ; **statistiques** par code (utilisations, rabais accordé, mises à jour par le webhook).
- **Synchronisation avec Stripe** : par le **serveur de l'application seulement** (coupon + code de promotion, portée limitée aux produits concernés). Un code créé seul est synchronisé tout de suite ; un lot l'est par paquets (bouton **« Synchroniser avec Stripe »**). Il faut que les offres/VPS de la portée aient été **publiés vers Stripe** d'abord (sinon l'état « Erreur » le dit). Les codes d'essai et du personnel n'existent pas chez Stripe.
- **Où les clients le saisissent** : champ « Code promo » à l'achat de crédits, à la souscription et à la commande de VPS (validation côté serveur, message clair par motif) ; la page de paiement de Stripe garde son propre champ (`allow_promotion_codes`) tant qu'aucun code n'a été appliqué et que le réglage le permet. Le contrôle « un par client » ne s'applique qu'aux codes saisis chez Nexora.
- Un rabais de 100 % ne peut pas viser les crédits (ils ne donneraient rien) : utiliser un code du personnel.
- **Un code « un par client »** n'a qu'une session de paiement ouverte à la fois par client (les autres sont expirées à l'ouverture de la nouvelle). **Une organisation dont un litige de paiement est ouvert ou perdu** ne reçoit plus d'essai ni de rabais (message « ne peut pas être appliqué à votre compte ») ; un litige gagné lève la restriction. Le solde négatif d'une reprise bloque l'API tant qu'un achat ne le ramène pas à zéro.
- **Portail client Stripe** : l'application crée **une configuration restreinte** au premier usage (moyens de paiement, factures, coordonnées sauf le courriel, résiliation **en fin de période** sans prorata ; **pas de changement d'offre** depuis le portail). Pour changer d'offre : résilier puis souscrire à la nouvelle. Ne pas rouvrir ces options dans le tableau de bord de Stripe.

### 6.4 Premier test, puis production

1. En mode test, essayer le parcours complet avec la carte de test de Stripe `4242 4242 4242 4242` : inscription, souscription (ou crédits), vérifier le webhook (grand livre, abonnement), un code promo, un essai.
2. **Production (argent réel)** : réservée à l'accord écrit du fondateur et aux validations juridiques et fiscales (§13). Dans le module **Paiements → Stripe**, cocher **« Autoriser les paiements réels »** (confirmation demandée, journalisée), coller la clé **live** au Coffre sous la **même** référence, puis **« Vérifier et brancher Stripe »** (nouveau compte détecté : les objets de l'ancien sont oubliés ; relancer ensuite **« Publier vers Stripe »** pour chaque offre et le catalogue VPS, puis **« Tout resynchroniser »** pour les codes). Sans l'autorisation, une clé `sk_live_…` est refusée et un événement `livemode` est rejeté (400). Faire un paiement réel de petit montant avec remboursement, vérifier le grand livre et la facture.

### 6.5 Code administrateur gratuit (comptes du personnel)

1. Module **Paiements → Personnel et dons** : saisir le **courriel du compte client** (la personne doit être inscrite) et **« Marquer comme personnel »**.
2. Créer un code de type **Personnel** (portée au choix). Il n'est accepté **que** des comptes du personnel (les autres reçoivent « réservé à l'équipe »).
3. Utilisé dans un parcours d'achat : **abonnement offert** (statut « Offert », accès complet) et **VPS offert** (même provisionnement : il attend un serveur Proxmox prêt, affiché honnêtement) **sans passer par Stripe** ; **crédits offerts** inscrits au grand livre avec leur motif, **plafonnés par mois et par compte du personnel** (réglage « Plafond mensuel », défaut 100 $, mois civil UTC).
4. Chaque don est **journalisé** (module → Journal) et **révocable** : révoquer résilie l'abonnement ou le VPS offert (arrêt, puis rétention de 7 jours) ou reprend les crédits non utilisés.

### 6.6 Frais de recharge des crédits (facultatif)

Réglage **désactivé par défaut** (module Paiements → Stripe) : un taux (défaut 5 %) avec un minimum (défaut 1 $) **déduits des crédits accordés** (payer 100 $ donne 95 $). Annoncé au client dans l'espace client. La recharge minimale est de 20 $ (`BILLING_MIN_PURCHASE_CENTS`).

## 7. Serveurs Proxmox (VPS)

Brancher un serveur Proxmox se fait **en un seul parcours** dans Directus : vous saisissez l'adresse du serveur et son jeton API, Nexora découvre le reste (nœud, version, capacité, stockages, pont réseau, DNS), prépare lui-même le gabarit du système et ne déclare le serveur « prêt » qu'une fois tout vérifié. Seuls les prérequis impossibles à automatiser restent à faire, et ils sont tous dans un **guide PDF pour le personnel**, téléchargeable depuis le module VPS (bouton **Guide de branchement (PDF)**). Sa source est `docs/vps/guide-branchement-proxmox.md` ; le PDF (`docs/vps/guide-branchement-proxmox.pdf`) se régénère avec `bun run guide:vps`, et un test échoue s'il est plus vieux que sa source.

**Prérequis, une fois par serveur** (commandes `pveum` exactes et chemins de l'interface web dans le guide) :

1. **Proxmox VE 9.0 ou plus récent** (le branchement refuse une version plus ancienne).
2. Un compte dédié `nexora@pve`, un rôle `NexoraProvision` aux **21 privilèges** exacts, un pool `nexora`, les droits sur le pool, les stockages utilisés, le nœud et `/sdn/zones/localnetwork`, et un **jeton API** sans séparation de privilèges. Jamais `root`.
3. Un **bloc d'adresses IPv4 fixes** réservé aux VPS (plage, masque, passerelle, DNS), **hors de la plage DHCP**. Pas de DHCP : chaque VPS vendu garde une adresse stable (son pare-feu y est lié).
4. Le port **8006** ouvert depuis le worker vers Proxmox, **SSH (22)** du worker vers le bloc d'adresses, et l'accès Internet (443) de Proxmox, du bloc et du worker vers `cloud.debian.org` / `cloud-images.ubuntu.com`.
5. Le type de contenu **« Import »** activé sur un stockage de type répertoire (`local`) : sa modification exigerait un droit qui permet aussi de supprimer des volumes, elle reste donc manuelle.

**Une fois par installation** : la paire de clés SSH du worker (`ssh-keygen -t ed25519 -C nexora-worker`), clé privée au Coffre (`vps.worker_ssh_key`, type `other`), clé publique dans `VPS_WORKER_SSH_PUBLIC_KEY`. Aucune image cloud officielle ne contient l'agent invité de Proxmox : le worker l'installe dans une VM temporaire par SSH avant de la convertir en gabarit.

**Le parcours** (module **VPS** ▸ **Serveurs Proxmox** ▸ **Connecter un serveur Proxmox**) :

1. **Adresse** (`hôte[:port]`) puis **Vérifier le serveur** : Nexora lit le certificat (poignée de main TLS seulement, aucun jeton) et montre son **empreinte SHA-256**. Un certificat reconnu publiquement se vérifie normalement ; un certificat auto-signé s'**épingle** après que vous avez comparé l'empreinte à celle de Proxmox et confirmé.
2. **Jeton API** (`utilisateur@realm!nom=secret`) puis **Connecter** : le jeton va au Coffre (`proxmox.<code>`, type `proxmox`), puis Nexora se connecte en épinglant l'empreinte confirmée (le jeton ne part jamais avant la vérification du TLS) et crée la fiche en brouillon. Rejouable : même adresse et même port retombent sur la même fiche, sans doublon.
3. **Valeurs découvertes**, préremplies (nœud, stockage des disques, stockage d'import, pont, capacité vendable, masque, passerelle, DNS) ; les problèmes bloquants et les droits manquants du jeton sont listés avec **la cause et l'action à faire**. Vous saisissez le **bloc d'adresses**, choisissez les systèmes (Debian 12, Ubuntu 24.04) et validez. Un bloc incohérent est refusé avec ses raisons (passerelle hors réseau, plage qui sort du sous-réseau, adresse du réseau ou de diffusion, adresse du serveur Proxmox, chevauchement).
4. **Valider et préparer le serveur** : tâche `vps.server_setup` du worker. Pour chaque système, Proxmox télécharge **lui-même** l'image cloud officielle avec la **somme SHA-512 (Debian) ou SHA-256 (Ubuntu) publiée par l'éditeur** (lue par le worker sur HTTPS, gardes SSRF) ; le worker crée la VM en important le disque, ajoute cloud-init, active l'agent, fixe le processeur à `host`, installe l'agent invité dans la VM par SSH, nettoie la VM (clé du worker, identité), la convertit en gabarit et enregistre le gabarit. Chaque étape affiche son état réel — en attente, en cours, réussi, rien à refaire, ou **échec avec cause et action** — et le serveur ne devient « prêt » que si **toutes** les étapes réussissent (un gabarit prêt et un bloc d'adresses valide, en plus du test final). **Réessayer** reprend là où cela s'est arrêté : rien n'est retéléchargé ni recréé en double, et Nexora ne modifie ni ne supprime jamais une VM qu'il n'a pas créée.

Le formulaire « Nouveau serveur » (saisie à la main, gabarit préparé à la main, « Tester la connexion ») reste disponible pour un serveur déjà préparé autrement ; « Tester la connexion » ne rend désormais « prêt » un serveur que s'il a au moins un gabarit prêt et un bloc d'adresses valide.

**Réseau** : un Proxmox est sur le réseau de l'opérateur ; **son hôte doit être déclaré dans `NEXORA_SECRET_HOSTS_PROXMOX` (web et worker, §8.0) avant « Connecter »**, sinon le jeton n'est pas envoyé ; l'adresse est acceptée (sauf lien local et métadonnées du nuage, toujours refusés par `@nexora/net`). Le TLS est vérifié ou épinglé **avant** l'envoi du jeton ; `http://` n'est admis que sur la boucle locale (simulateur). Les références du Coffre réservées à la plateforme sont refusées comme jeton. Pare-feu par VM (SSH seulement), port 25 sortant fermé : appliqués par le moteur.

**Non vérifié à ce jour** : aucun vrai Proxmox n'a été branché ; tout le parcours (découverte, téléchargement avec somme, création de VM, agent, gabarit, étapes, reprise) est prouvé de bout en bout **sur le simulateur** de Proxmox, dont les réponses sont validées contre le schéma officiel de l'API, mais ni le téléchargement réel d'une image, ni l'installation de l'agent dans une vraie VM, ni le chemin SDN `/sdn/zones/localnetwork`, ni le comportement exact de Proxmox sur certaines erreurs n'ont été confirmés. Au premier serveur réel : suivre le guide, puis lancer le test de contrat (`PROXMOX_CONTRACT_URL`… dans `docs/infra.md`) avant d'ouvrir les ventes.

## 8. Fournisseurs de modèles, LiteLLM, WorkStudio

### 8.0 Hôtes autorisés pour les clés (R9)

Avec le jeton d'administration, on peut déclarer un fournisseur (ou une instance WorkStudio, ou un serveur Proxmox) et lui associer une clé du Coffre : « Tester », la synchronisation LiteLLM et les appels aux agents envoient alors cette clé à l'adresse saisie. Pour qu'un jeton volé ou un administrateur malveillant ne puisse pas la faire parvenir à son propre serveur, **la liste des hôtes où une clé peut partir est fixée par l'opérateur dans l'environnement du serveur** (variables `NEXORA_SECRET_HOSTS_*`, §3), pas dans l'administration :

| Type de clé | Variable | Valeurs par défaut |
|---|---|---|
| Fournisseur de modèles (`llm_provider`) | `NEXORA_SECRET_HOSTS_MODEL_PROVIDER` | les éditeurs connus, **en HTTPS seulement** (liste au §3) |
| Instance WorkStudio | `NEXORA_SECRET_HOSTS_WORKSTUDIO` | aucune : déclarer l'hôte de chaque instance |
| Serveur Proxmox (`proxmox`) | `NEXORA_SECRET_HOSTS_PROXMOX` | aucune : déclarer l'hôte de chaque serveur |

- Un fournisseur **sans clé** (Ollama local, par exemple) n'est pas concerné ; la garde d'adresses `NEXORA_OUTBOUND_ALLOW` (où le serveur peut aller) reste séparée et s'applique en plus.
- Un hôte déclaré par l'opérateur peut être en HTTP (réseau interne : `host.docker.internal`, `ws.interne`). Les hôtes par défaut ne sont admis qu'en HTTPS.
- Le contrôle s'applique à l'écriture (création et modification : la paire adresse + clé effective est vérifiée, même si on ne change que l'un des deux), puis **à chaque usage** (test, synchronisation, appel d'agent, test d'un serveur Proxmox) : une fiche écrite directement en base ou avant la règle n'envoie rien. L'adresse vue par LiteLLM (`litellmBaseUrl`) est contrôlée comme l'adresse de l'app.
- Refus : « hôte « x » non autorisé pour la clé d'un … : l'opérateur doit le déclarer dans NEXORA_SECRET_HOSTS_… » (HTTP 422, code `secret_host`, ou résumé du test). Exemple : `NEXORA_SECRET_HOSTS_WORKSTUDIO=ws.interne` ; `NEXORA_SECRET_HOSTS_PROXMOX=192.168.10.5,pve1.lan` ; `NEXORA_SECRET_HOSTS_MODEL_PROVIDER=llm.interne.exemple,*.ia.exemple.ca,-api.deepseek.com`. Redémarrer le site **et le worker** après un changement.
- Une entrée illisible ou un joker seul (`*`) est ignoré : la liste ne s'ouvre jamais par erreur.

### 8.1 Modèles

Module **Modèles** : ajouter un fournisseur (adresse, **région**, politique des données), coller sa clé au Coffre (type `llm_provider`), « Tester le fournisseur », ajouter des modèles, fixer **prix de vente et plancher de marge**, créer une **version de catalogue**, l'approuver, la publier, puis synchroniser vers LiteLLM. Un prix absent ou à 0 $ bloque la publication.

- Une clé n'est envoyée qu'à un hôte autorisé (§8.0) : un fournisseur hors de la liste par défaut (hébergement interne avec clé, passerelle de l'opérateur) se déclare dans `NEXORA_SECRET_HOSTS_MODEL_PROVIDER`.
- Le fournisseur doit être **joignable par l'app** (« Tester ») et, séparément, par **LiteLLM** (adresse `litellmBaseUrl`, vue de son réseau Docker).
- Un fournisseur ou une instance sur le **réseau interne** (Ollama de Nexora, vLLM) : lister son hôte ou sa plage dans `NEXORA_OUTBOUND_ALLOW` (par exemple `ollama.interne.ca,10.20.0.0/24`) puis redémarrer le site. Sinon : « adresse du réseau interne refusée ». Les adresses de lien local (169.254.0.0/16, dont les métadonnées du nuage) sont refusées même si elles sont listées.
- La **résidence** affichée au public est celle saisie à la fiche : la relire à chaque changement de fournisseur. Aucune bascule silencieuse vers un modèle externe n'existe dans le code ; ne pas en configurer dans LiteLLM (`fallbacks`).

### 8.1 bis Ajouter un fournisseur, un modèle, un prix (pas à pas)

Tout se fait dans le module **Modèles** de Directus (barre de gauche, icône de robot), **sans script ni ligne de commande**. Le module est réservé aux administrateurs. Cinq onglets : **Fournisseurs**, **Modèles et prix**, **Taux de change**, **Versions et synchronisation**, **Rapprochement des coûts**. Les écrans ci-dessous sont décrits dans l'ordre où on les rencontre ; les libellés entre guillemets sont ceux des boutons.

**Avant de commencer (une seule fois)**

1. Un **taux de change** approuvé (onglet *Taux de change* : saisir « 1 $ US = … $ CA », « Ajouter », puis « Approuver »). Sans lui, aucun prix de vente ne peut être calculé ni publié.
2. L'hôte du fournisseur doit être autorisé à recevoir une clé (§8.0). DeepSeek, Z.ai, MiniMax, Moonshot, DeepInfra et OpenRouter le sont déjà (DeepInfra est déjà créé, actif, par le chargement du catalogue : il reste à déposer sa clé) ; pour un autre, l'opérateur ajoute son hôte dans `NEXORA_SECRET_HOSTS_MODEL_PROVIDER` et redémarre le site (le panneau l'explique si on l'oublie).
3. Les modèles du catalogue DeepInfra (DeepInfra héberge tous les modèles de Nexora AI) sont chargés par `bun run --cwd web models:seed` (voir `docs/catalogue-deepinfra.md` et `docs/restauration.md`). Avec un taux de change approuvé, ils sont publiés **en aperçu** (visibles au catalogue public, pas encore appelables, la clé n'étant pas exigée) ; sans taux, ils restent en brouillon. L'ajout d'un modèle de plus n'a **pas** besoin de ce script.

#### A. Ajouter un fournisseur (exemple : DeepInfra)

Onglet **Fournisseurs** → bouton **« Ajouter un fournisseur »**. L'assistant a quatre étapes sur une seule page ; une pastille numérotée devient verte à mesure que chacune est faite.

1. **Adresse et identité.** Cliquer sur **« DeepInfra »** dans « Départ rapide » (autres choix : DeepSeek, Z.ai, MiniMax, Moonshot AI (Kimi), OpenRouter) : le nom, le code, le type, l'adresse de base et la **référence du Coffre** (`llm.deepinfra`) se remplissent. Pour un autre fournisseur, taper son nom (le code et la référence se déduisent), choisir le type (« Compatible OpenAI » convient à presque tous ; « OpenRouter » pour une route de secours passant par OpenRouter) et copier l'**adresse de base** de sa documentation (elle inclut déjà la version : `…/v1`, `…/v4`, `…/v1/openai`). La **région d'hébergement** reste « Autre / non précisée » tant qu'on n'est pas certain : elle est affichée aux clients. Cliquer sur **« Enregistrer le fournisseur »** : il est créé **désactivé**.
2. **Clé dans le Coffre.** Cliquer sur le lien **Coffre** (il s'ouvre dans un nouvel onglet), saisir la référence indiquée (`llm.deepinfra`), le type « Fournisseur de modèles », coller la clé et « Enregistrer dans le coffre ». Revenir à l'assistant et cliquer sur **« Revérifier »** : « Clé présente dans le Coffre » apparaît en vert. **La clé n'est jamais saisie dans l'assistant, ni affichée, ni enregistrée dans Directus.**
3. **Test de la connexion.** **« Tester la connexion »** interroge la liste des modèles du fournisseur avec la clé du Coffre (aucune requête facturée) et répond, par exemple, « Connexion réussie — HTTP 200 en 150 ms, 3 modèle(s) listé(s) ». Un refus est expliqué : « clé refusée par le fournisseur, vérifiez la clé collée dans le Coffre » (401/403), « adresse introuvable, vérifiez l'adresse de base » (404), « clé introuvable ou révoquée dans le coffre » (étape 2 non faite).
4. **Activation.** Cocher **« Fournisseur actif »**, puis **« Enregistrer les modifications »**. Le cadre bleu « Prochaine étape » indique toujours ce qu'il reste à faire (clé, test, activation).

Dans la liste des fournisseurs, chaque ligne montre la clé (« Clé présente » / « Clé absente »), la connexion (« Connexion vérifiée », « Connexion en échec », « Jamais testé »), l'état (« Actif » / « Désactivé ») et la prochaine étape ; les boutons **Modifier**, **Tester la connexion** et **Activer / Désactiver** y sont aussi.

#### B. Ajouter un modèle

Onglet **Modèles et prix** → **« Ajouter un modèle »**. Six étapes (le fil en haut permet de revenir en arrière ; les étapes 4 à 6 se débloquent une fois le brouillon enregistré). **Rien n'est visible des clients avant l'étape 6.**

1. **Identité.** Nom affiché ; **identifiant public** (proposé à partir du nom, de la forme `nexora/nom-du-modele` : c'est ce que les clients écrivent dans leurs appels ; il ne change plus ensuite) ; famille ; type (conversation ou embeddings) ; descriptions fr/en ; visibilité au catalogue ; date de retrait prévue (facultative).
2. **Fiche technique.** Date de sortie (AAAA-MM-JJ), coupure des connaissances (AAAA-MM), licence (nom, poids ouverts ou fermés, adresse https du texte), paramètres totaux et actifs (en milliards), **fenêtre de contexte** et sortie maximale (en jetons), entrées acceptées, sorties produites, capacités, notes. **Ne remplir que ce qui est lu sur une page officielle** : un champ vide reste absent de la fiche publique, rien n'est inventé. Les mesures (benchmarks) et sources déjà enregistrées sont affichées en lecture seule et **conservées** à l'enregistrement.
3. **Fournisseur.** Choisir le **fournisseur principal** (la liste dit s'il est actif et si sa clé est dans le Coffre ; un lien mène à l'onglet Fournisseurs si on doit en ajouter un). La case **« Aperçu : visible au catalogue, pas encore appelable »** permet de publier le modèle au catalogue public alors que la clé du fournisseur n'est pas encore au Coffre (voir H) ; l'assistant la suggère quand la clé manque. Saisir l'**identifiant du modèle chez ce fournisseur** (celui de sa documentation, par exemple `meta-llama/Llama-3.3-70B-Instruct`), la **région d'hébergement** affichée aux clients, et, pour OpenRouter, les consignes de routage (collecte des données : « Refuser » recommandé). **« Enregistrer et continuer vers les prix »** crée le modèle en **brouillon** ; chaque champ fautif est signalé en rouge.
4. **Prix.** Saisir les **coûts du fournisseur en dollars américains par million de jetons** : entrée, sortie, et seulement si le fournisseur les facture à part, **cache lu** et **cache écrit** (Kimi, par exemple, facture l'écriture du cache à part ; chaque poste a sa propre vente). Le tableau montre, ligne par ligne : le coût converti en dollars canadiens au taux approuvé, le **prix de vente calculé** (coût converti × (1 + marge visée)), la marge obtenue et le verdict « OK » ou « Refusé ». La **marge visée** et le **plancher de marge** sont à 10 % par défaut. Pour fixer soi-même un prix de vente, le taper dans « Prix de vente imposé » ; **sous le plancher, la ligne est refusée et le texte dit pourquoi** (« vendre à 0,30 $ CA donne 7,1 % de marge, sous le plancher de 10 %. Prix minimal : 0,462 $ CA. »), et rien ne s'enregistre. Un prix de vente à 0 $ est toujours refusé. Les **plages horaires à prix réduit** (une plage ne peut que **baisser** le prix de base ; heures en **UTC** : le Québec est à UTC−5 l'hiver, UTC−4 l'été) s'ajoutent sous le tableau. **« Enregistrer le prix »** ajoute la première version de prix ; un prix déjà enregistré ne se modifie jamais (voir C).
5. **Routes de secours.** Si le fournisseur principal échoue, la passerelle essaie les routes **dans l'ordre affiché** (boutons **Monter / Descendre**, **Désactiver**). Ajouter une route : fournisseur, identifiant du modèle chez lui, et, facultativement, **son propre coût** (entrée, sortie, cache). Pour chaque route qui a son coût, l'écran affiche le **prix plancher** — le prix de vente minimal qui garde la marge avec CE coût — et dit si vos prix de vente (de base et de chaque plage) le tiennent. Une route dont le fournisseur est désactivé ou sans clé bloque la publication : la désactiver ou régler le fournisseur.
6. **Publication.** L'état courant est affiché (Brouillon, Approuvé, Publié, Retiré). Les **contrôles préalables** sont listés avec une coche verte ou une croix rouge et la consigne pour chacun : taux de change approuvé ; prix saisi ; prix de vente valide (jamais 0 $, au-dessus du plancher) ; fournisseur principal actif ; **clé du fournisseur présente dans le Coffre** (non exigée pour un modèle en aperçu : le contrôle est vert et le dit) ; routes de secours prêtes. **« Revérifier »** les relit. **« Publier le modèle »** n'est actif que lorsque tout est vert ; il enchaîne : approuver le modèle, le publier, préparer une version du catalogue, l'approuver, la publier (et, si la case est cochée, synchroniser vers LiteLLM). Le journal des étapes et les changements publiés s'affichent. **« Garder en brouillon et fermer »** laisse le modèle non publié ; on y revient plus tard par **Modifier** (rouvre l'assistant à l'étape 1) ou par **Publier** (rouvre l'assistant directement à l'étape 6) dans la liste des modèles.

Attention : publier met en ligne **une nouvelle version du catalogue**, qui inclut aussi tout autre changement en attente (prix modifié, fournisseur changé…) ; l'onglet *Versions et synchronisation* montre ces changements avant publication.

#### C. Modifier les prix d'un modèle existant

Onglet **Modèles et prix** → ligne du modèle → **« Modifier les prix »**. Les prix sont **immuables** : on ne modifie jamais un prix, on en crée une **nouvelle version**. L'écran montre :

- **Prix en vigueur** (ventes, coûts, plancher, nombre de plages) ;
- le formulaire de saisie (le même qu'à l'étape *Prix*), prérempli avec le prix en vigueur ; un prix de vente laissé « auto » suit la marge, un prix imposé reste imposé ;
- la **comparaison ancien / nouveau**, poste par poste : coût du fournisseur, vente, **marge avant → après** (en rouge si elle passe sous le plancher) et une phrase par poste (« le prix de vente passe de 0,3542 $ CA à 0,4004 $ CA (+13 %) ; le coût amont varie de +13 % ; la marge passe de 10 % à 10 % ») ;
- **« Créer la nouvelle version de prix »** (inactif si le prix est identique ou refusé) ;
- puis, si le modèle est publié, **« Mettre en vigueur (publier une version du catalogue) »** : le nouveau prix n'atteint les clients qu'à cette étape ;
- l'**historique des versions de prix** (date, ventes, coûts, marge / plancher, écart avec la version précédente, note) avec **« Comparer »** : compare une ancienne version à celle en vigueur.

Une requête passée garde le prix de son époque. Pour répercuter la hausse d'un fournisseur : saisir le nouveau coût (la vente suit la marge), vérifier la comparaison, créer la version, la mettre en vigueur.

#### D. Rapprochement des coûts

Onglet **Rapprochement des coûts** (période de 7, 30 ou 90 jours). Une ligne par modèle : requêtes, **facturé** (dollars canadiens), **offert** (organisations « maison »), **coût calculé** avec nos prix amont, **coût rapporté** par le fournisseur (OpenRouter le rapporte ; les fournisseurs directs, non : « Non rapporté »), **écart**, **marge réalisée** (facturé ÷ coût du fournisseur converti au taux approuvé, corrigé de l'écart observé) et le verdict **Conforme** / **À vérifier** (écart au-delà de 5 %). Un modèle « À vérifier » : ses coûts enregistrés sont périmés ; ouvrir **Modifier les prix** et saisir les coûts à jour.

#### E. Retirer un modèle

**« Retirer »** (modèle publié) demande confirmation, marque le modèle « Retiré » puis publie une nouvelle version du catalogue : les clients ne peuvent plus l'appeler.

#### F. Messages courants et quoi faire

| Message | Cause | Action |
|---|---|---|
| « Aucun taux de change approuvé… » | pas de taux approuvé | onglet *Taux de change* : ajouter puis approuver |
| « Clé absente du Coffre pour la référence « llm.x » » | clé non déposée ou révoquée | module *Coffre* : même référence, type « Fournisseur de modèles », puis « Revérifier » |
| « hôte « x » non autorisé pour la clé d'un fournisseur de modèles… » | hôte hors de la liste de l'opérateur | l'opérateur ajoute l'hôte à `NEXORA_SECRET_HOSTS_MODEL_PROVIDER` (§8.0) et redémarre |
| « Adresse refusée par la garde réseau » | adresse interne ou non publique | §8.1 (`NEXORA_OUTBOUND_ALLOW`) |
| « vendre à … donne … % de marge, sous le plancher » | prix de vente trop bas pour le coût converti | augmenter le prix, ou laisser « auto » |
| « Refusé par la garde de publication » (liste) | un contrôle préalable est rouge | suivre la consigne affichée sous chaque ligne |
| « Cet élément existe déjà » | code de fournisseur ou identifiant public déjà pris | changer le code / l'identifiant |
| « Le modèle ne peut pas passer en service » (clé absente du Coffre) | « Passer en service » applique la garde complète | déposer la clé (`llm.deepinfra`…), « Revérifier », puis relancer « Passer en service » |
| Un client reçoit 404 `model_not_available` | le modèle est en aperçu | normal : « Passer en service » quand la clé est prête (H) |

#### H. Aperçu et passage en service

Un modèle **en aperçu** est publié au catalogue public (page `/modeles`, fiche, prix, mesures sourcées) **sans que la clé de son fournisseur soit au Coffre**, mais il n'est **pas appelable** : il n'est pas listé dans `GET /v1/models`, LiteLLM ne le reçoit pas, et un appel reçoit un 404 `model_not_available` (« Ce modèle est en aperçu : il n'est pas encore disponible à l'appel. »), sans réservation ni facturation. Le taux de change approuvé, un prix valide et un fournisseur actif restent exigés.

- **Publier un modèle en aperçu** : à l'étape 3 de l'assistant, cocher **« Aperçu : visible au catalogue, pas encore appelable »**, puis suivre les étapes comme d'habitude ; à l'étape 6 le contrôle de la clé est vert (« non exigée en aperçu »). Dans la liste des modèles, une pastille **Aperçu** (ou **En service**) accompagne l'état.
- **Passer en service** : déposer la clé du fournisseur au Coffre (A, étape 2), « Tester la connexion », puis, dans la liste des modèles (ou à l'étape 6 de l'assistant), cliquer sur **« Passer en service »** et confirmer. Les contrôles complets s'appliquent (clé du fournisseur et des routes de secours comprises) ; s'ils échouent, le modèle reste en aperçu et la liste dit pourquoi. S'ils passent, une **nouvelle version du catalogue** est publiée (et synchronisée vers LiteLLM si l'app est reliée) : le modèle devient appelable. Décocher la case de l'assistant puis enregistrer demande la même chose, sans publier la version : préférer le bouton.
- **Revenir à l'aperçu** : cocher la case à nouveau, enregistrer, puis publier une nouvelle version (« Publier » à l'étape 6).
- Le chargement du catalogue DeepInfra (`bun run --cwd web models:seed`) met tous ses modèles en aperçu ; détails, décisions provisoires et marche à suivre avant le lancement : `docs/catalogue-deepinfra.md`.

#### G. Décisions provisoires, modifiables par le fondateur

- **Marge visée et plancher : 10 %** par défaut (constante `DEFAULT_MARGIN_BPS` du serveur, proposée par les assistants ; le plancher de chaque prix est celui enregistré avec sa version).
- **Prix de vente explicites** : l'assistant envoie toujours les montants de vente qu'il a affichés (aperçu = enregistré) ; l'aperçu reproduit exactement le calcul du serveur (essai de parité sur des milliers de cas).
- **Effet immédiat** : une nouvelle version de prix prend effet tout de suite (pas de date future dans l'écran) ; le catalogue servi ne change qu'à la publication d'une version.
- **Heures des plages en UTC**, comme le serveur.
- **Types de fournisseur proposés** : « Compatible OpenAI » et « OpenRouter ». Un fournisseur déjà enregistré avec un autre type (vLLM, Ollama, LiteLLM amont) garde son type.
- **Région par défaut « Autre / non précisée »** et **modalités et capacités décochées par défaut** : aucune affirmation n'est faite sans qu'on l'ait choisie.
- **Seuil d'alerte du rapprochement : 5 %** d'écart entre le coût rapporté et le coût calculé.
- **Retirer un modèle publie tout de suite** une nouvelle version du catalogue.
- **Aperçu** : la case est décochée par défaut dans l'assistant (un nouveau modèle est en service) ; le chargement DeepInfra, lui, met tout le lot en aperçu.
- **Adresses de base proposées** (départ rapide) : celles de la documentation des fournisseurs ; les relire avant usage. Aucun prix n'est prérempli.

### 8.2 WorkStudio (agents hébergés et bulle)

1. Dans WorkStudio : Réglages, Clés d'API Nexora, créer une **clé d'espace** avec « Agents publiés ».
2. **Déclarer l'hôte de l'instance** dans `NEXORA_SECRET_HOSTS_WORKSTUDIO` (§8.0) et redémarrer. Module **Agents hébergés** : créer l'instance (adresse interne, ou publique en https), coller la clé au Coffre (type `other`), « Tester », « Découvrir » (les agents arrivent en brouillon), compléter chacun (description, **prix**), publier.
3. Côté WorkStudio, avant publication : **`NEXORA_EMBED_ORIGINS=https://<domaine du site>`**. Vide, l'instance accepte toutes les origines pour la bulle.
4. Bulle `/embed.js` : réglage dans le module (pages choisies) ; la CSP n'ouvre alors que l'origine configurée, sur ces pages seulement.
5. Limites : la réservation d'un appel est calculée sur `run_token_cap` (32 000 jetons par défaut), mais le règlement est au coût réel (un dépassement est facturé et peut rendre le solde négatif) ; renommer un agent dans WorkStudio change son identifiant amont `agent:<nom>` (le ressaisir dans le module) ; le coût amont de WorkStudio n'est pas suivi.

### 8.3 WorkStudio intégré : connexion unique et accès modèle par utilisateur

Le site est le fournisseur OpenID Connect de WorkStudio : les utilisateurs du site ouvrent WorkStudio avec le même compte, chacun avec sa clé de modèle (celle de son organisation, facturée à son portefeuille ; l'organisation « maison » est gratuite). Variables : §3 (`WORKSTUDIO_*`). Mise en service, sécurité, essai en local et dépannage : **`docs/workstudio-integre.md`**.

1. Migration `0021_s12_sso_workstudio_oidc` (`bun run db:migrate`) avant de démarrer la nouvelle version.
2. Poser `WORKSTUDIO_PUBLIC_URL`, `WORKSTUDIO_OIDC_CLIENT_ID`, `WORKSTUDIO_OIDC_CLIENT_SECRET`, `WORKSTUDIO_GATEWAY_URL` ; les trois mêmes valeurs d'identité (`NEXORA_OIDC_ISSUER=${SITE_URL}/api/auth`, `NEXORA_OIDC_CLIENT_ID`, `NEXORA_OIDC_CLIENT_SECRET`) côté WorkStudio, qui doit demander les portées `openid profile email workstudio:model` et PKCE.
3. Redémarrer le site : un seul avertissement au démarrage si une variable est invalide (il nomme la variable, jamais la valeur).
4. Changer l'identifiant ou le secret annule l'ancien client (désactivé au premier appel OAuth) : redémarrer le site et WorkStudio avec les nouvelles valeurs.
5. Sauvegarder `BETTER_AUTH_SECRET` comme la clé maîtresse du Coffre : il chiffre la clé privée de signature des jetons d'identité.

## 9. Proxy frontal (HTTPS)

Le site ne gère pas le TLS. Un proxy (nginx, Caddy…) termine HTTPS et transmet à `localhost:3500`. Obligations :

- **Écraser** `X-Forwarded-For` par l'adresse réelle du client (`proxy_set_header X-Forwarded-For $remote_addr;`), sinon la limitation de débit se contourne.
- **Ne pas publier** `/api/admin/*` ni `/api/revalidate` : ils ne doivent être joignables que depuis le réseau de Directus et du worker (`location ~ ^/api/(admin|revalidate) { deny all; }` côté public, ou écoute sur une interface interne distincte). C'est la mesure qui limite la portée du jeton d'administration.
- Ne pas publier Directus tel quel sans réfléchir : son panneau d'administration est une surface d'attaque ; le placer derrière un accès restreint (VPN, liste d'adresses) ; le site n'appelle Directus que depuis le serveur.
- Les en-têtes de sécurité (CSP, HSTS, `nosniff`, `frame-ancestors`) sont posés par le site : ne pas les retirer. HSTS sans `includeSubDomains` ni `preload` : à ajouter par l'opérateur quand le domaine est stabilisé.
- Redirection HTTP vers HTTPS, certificat renouvelé automatiquement.
- **Refuser les méthodes `TRACE` et `TRACK`** (`if ($request_method ~ ^(TRACE|TRACK|CONNECT)$) { return 405; }`) : Next.js y répond par un 500 sans en-têtes de sécurité (aucun écho de la requête, mais une réponse bruyante, constatée aux essais d'intrusion). **L'application répond aussi 405 (avec `Allow`) à `TRACE` et à toute méthode inconnue avant Next.js** (garde installée par `instrumentation.ts`) et refuse `PUT`, `PATCH` et `DELETE` sur les pages ; la consigne au proxy reste la première barrière.
- Retirer l'en-tête `X-Powered-By` de **Directus** (non réglable par variable) ; ne pas exposer `/api/auth` en dehors du site lui-même.
- Limiter le débit au proxy (par adresse) sur `/api/auth/*`, `/api/contact`, `/api/stripe/webhook` et `/v1/*` : les limites du site sont par processus ou par compte ; le proxy est la première ligne contre les rafales anonymes.
- Un WAF (règles OWASP CRS) devant le site est recommandé ; ce n'est pas fourni par le dépôt (§14).

## 10. Sauvegarde et restauration

Détail et preuves : `docs/recette/sauvegarde.md`.

```bash
# Tous les jours (exemple de crontab). Le chiffrement est OBLIGATOIRE (sans clé de chiffrement, backup.sh refuse de travailler).
# Les clés sont dans /etc/nexora/ (mode 0400). Poser aussi les noms des conteneurs : sans eux, backup.sh retombe sur les
# noms de la pile de développement (nexorasite-db-1, nexorasite-directus-1) et sauvegarderait le mauvais serveur, ou rien.
17 3 * * * NEXORA_DB_CONTAINER=<conteneur PostgreSQL> NEXORA_DIRECTUS_CONTAINER=<conteneur Directus> NEXORA_BACKUP_SIGNING_KEY_FILE=/etc/nexora/backup-sign.key NEXORA_BACKUP_ENCRYPT_KEY_FILE=/etc/nexora/backup-enc.key bash /opt/nexora/deploy/backup.sh --out /var/backups/nexora

# Les commandes suivantes lisent les mêmes deux clés : une archive .tar.enc ne s'ouvre pas sans NEXORA_BACKUP_ENCRYPT_KEY_FILE,
# une archive signée ne se vérifie pas sans NEXORA_BACKUP_SIGNING_KEY_FILE (ou --signature-ignoree, à éviter).
export NEXORA_BACKUP_ENCRYPT_KEY_FILE=/etc/nexora/backup-enc.key NEXORA_BACKUP_SIGNING_KEY_FILE=/etc/nexora/backup-sign.key

# Vérifier une archive sans rien restaurer
bash deploy/restore.sh verifier /var/backups/nexora/nexora-backup-….tar.enc

# Essai de restauration dans un PostgreSQL jetable (à faire au moins chaque trimestre)
bash deploy/restore.sh essai /var/backups/nexora/nexora-backup-….tar.enc

# Reprise après sinistre dans un PostgreSQL existant
bash deploy/restore.sh restaurer ARCHIVE --pg-container <conteneur> --directus-container <conteneur Directus>
```

- Copier chaque archive **hors du serveur** (autre machine, autre site) ; noter son SHA-256 (affiché) ailleurs. Rotation des archives : à la charge de l'opérateur.
- **Conserver séparément** : clé maîtresse du Coffre, phrase de passe de chiffrement, clé de signature. Sans la clé maîtresse, les secrets de l'archive sont illisibles.
- L'archive contient les jetons statiques Directus en clair : **le chiffrement est obligatoire** (`--chiffrer FICHIER` ou `NEXORA_BACKUP_ENCRYPT_KEY_FILE`). Seul un essai jetable peut le refuser, explicitement, avec `--sans-chiffrement` (avertissement affiché ; détruire l'archive après l'essai).
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
| `/api/auth/.well-known/openid-configuration` répond 404 | Fournisseur OIDC de WorkStudio inactif (variables `WORKSTUDIO_OIDC_*` ou `WORKSTUDIO_PUBLIC_URL` absentes ou invalides) | Avertissement au démarrage ; §8.3 et `docs/workstudio-integre.md` |
| `GET /api/oauth/workstudio-access` répond 503 | `WORKSTUDIO_GATEWAY_URL` absent ou mal formé | Variable (https, se termine par `/v1`) |
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
- [ ] Prix des plans, des modèles et des agents fixés par le fondateur ; aucun prix inventé (les prix des offres WorkStudio et des 4 plans VPS préparés sont des **suggestions** de l'étude : à confirmer, §6.2 ; un plan VPS dont le prix n'est que suggéré ne peut pas être approuvé).
- [ ] **Robots d'entraînement** : décision d'affaires du 29/10/2026 (par défaut autorisés, comme les robots de recherche et de réponse) ; poser `ROBOTS_AI_TRAINING=disallow` si le fondateur change d'avis. Revue trimestrielle (`docs/marketing/audit-seo-geo.md`, section 3).
- [ ] **Profils publics** : poser `SITE_SAME_AS` quand les comptes de l'entreprise existent (LinkedIn, dépôt public…) ; ils nourrissent l'identité de l'entreprise pour les moteurs.
- [ ] Stripe : accord explicite pour passer en production (§6.4) ; comptable consulté pour TPS/TVQ.

**Données de développement à retirer**

- [ ] **Plans VPS « [DEV] »** (`dev-essai-1`, `dev-essai-2`, `dev-essai-4`) et le serveur simulé `dev-simule` désactivés ou supprimés (module VPS) : ils sont commandables en développement avec un badge visible.
- [ ] Modèle et fournisseur de développement (`nexora/glm-5-3`, fournisseur `dev-litellm`, LiteLLM de pc1) retirés du catalogue publié ; **aucun crédit de test** (`dev_test_credit`) en base de production.
- [ ] Comptes et clés d'essai, agents provisionnés par `dev-provision-agents.ts`, mots de passe d'essai supprimés ; Mailpit et stripe-mock absents de la pile de production.
- [ ] Les dix départements d'OPSYS-AI affichés « En pilote » (choix prudent) et l'affirmation CL-12 (« offres en libre-service pas encore ouvertes **à la vente** », corrigée le 27/10/2026 pour dire que les parcours ne fonctionnent qu'en mode test) : l'approuver, ou la réviser le jour où une offre ouvre.

**Configuration**

- [ ] `SITE_URL` (https), `SITE_ENV=production`, `NODE_ENV=production`, site lancé avec `-H localhost`, proxy HTTPS en place (§9) ; `/api/admin/*` et `/api/revalidate` **non publiés**.
- [ ] Tous les secrets au Coffre ou en secrets Docker ; **aucun** secret de développement réutilisé ; clé maîtresse du Coffre et jeton d'administration régénérés pour la production.
- [ ] `NEXORA_EMBED_ORIGINS=https://<domaine>` posé côté WorkStudio ; `NEXORA_OUTBOUND_ALLOW` limité au strict nécessaire.
- [ ] WorkStudio intégré : `WORKSTUDIO_PUBLIC_URL`, `WORKSTUDIO_OIDC_CLIENT_ID`, `WORKSTUDIO_OIDC_CLIENT_SECRET` (secret Docker, 32 caractères ou plus), `WORKSTUDIO_GATEWAY_URL` posés ; migration 0021 appliquée ; découverte OIDC répond 200 ; WorkStudio demande PKCE et la portée `workstudio:model` (§8.3).
- [ ] SMTP réel testé (vérification de courriel, diagnostic) ; SPF/DKIM.
- [ ] `MARKETPLACE_REGISTRY` de Directus : posé à une adresse injoignable dans `deploy/compose.yml` (écart E3 de `docs/recette/flux-sortants.md`, fermé) ; ne pas le retirer, ne jamais poser `MARKETPLACE_TRUST=all` ; `TELEMETRY=false` conservé ; `NEXT_TELEMETRY_DISABLED=1` sur la machine de build.
- [ ] Domaine, DNS, certificat ; liste des sous-traitants et lieu d'hébergement documentés (Stripe, SMTP, fournisseurs de modèles, outils SEO activés).
- [ ] Serveur(s) Proxmox réel(s) branché(s) et **test de contrat** passé avant d'ouvrir les ventes de VPS.

**Preuves à refaire sur l'environnement final**

- [ ] `bun run check` vert ; `bun run e2e` sur une base dédiée ; `check-guards.ts` et `audit-flux.ts` contre l'adresse réelle ; accessibilité et Lighthouse page par page (recette de l'orchestrateur) ; `lychee` sans lien cassé.
- [ ] Une sauvegarde chiffrée **et sa restauration d'essai** réussies ; la clé maîtresse retrouvée dans le gestionnaire de mots de passe.
- [ ] `bun audit --prod` sans avis ; balayage `gitleaks` de l'historique sans alerte réelle.
- [ ] Revue indépendante de bout en bout (sécurité, paiements, isolation des clés) sans point bloquant ni important ouvert.

## 14. Sécurité du compte, double authentification et durcissement (vague 2)

Détail des constats, preuves et correctifs : `docs/recette/securite-vague2.md`.

- **Double authentification (TOTP + 10 codes de secours)** pour tout compte client : page `/compte/securite` (QR, clé, codes de secours affichés une seule fois). Elle est **obligatoire pour les comptes « personnel »** : tant qu'elle n'est pas activée, un compte du personnel est redirigé vers cette page, ne peut utiliser aucun code `staff` ni accorder aucun don (abonnement, crédits, VPS), et il ne peut pas la désactiver. Après avoir posé le drapeau « personnel » (module Paiements), prévenir la personne : elle doit l'activer à sa prochaine connexion. Un code TOTP ne sert qu'une fois ; « se souvenir de cet appareil » est refusé volontairement ; le secret et les codes de secours sont chiffrés en base avec `BETTER_AUTH_SECRET` (**perdre ce secret rend les seconds facteurs inutilisables**, le sauvegarder comme la clé du Coffre).
- **Perte du téléphone et des codes de secours** : il n'existe pas de bouton de récupération (voulu). Procédure d'urgence par l'opérateur, après vérification d'identité hors bande : `DELETE FROM two_factors WHERE user_id = '<id>'; UPDATE users SET two_factor_enabled = false WHERE id = '<id>';` puis informer la personne de réactiver la double authentification.
- **Mots de passe** : 12 caractères au moins (128 au plus), refus des mots de passe courants, des suites évidentes et de ceux bâtis sur le courriel ou le nom, vérification HIBP en production (§3). **Verrouillage progressif** : 5 échecs de suite sur un courriel → 1 min, puis 2, 4… jusqu'à 30 min (même réponse pour un courriel sans compte) ; la table `auth_lockouts` ne contient que des empreintes. Un courriel « Nouvelle connexion » part quand une session s'ouvre depuis une adresse jamais vue sur le compte.
- **Directus** : `cms/scripts/apply.ts` exige la 2FA des rôles humains (Éditeur, Relecteur, Administrateur) et pose une politique de mot de passe de 12 caractères ; `CMS_ENFORCE_TFA=0` la désactive en développement. **Avant d'activer la 2FA de l'administrateur**, créer son jeton statique (`DIRECTUS_ADMIN_TOKEN`). Rôles PostgreSQL séparés, conteneurs durcis, `compose.prod.yml`, secrets de fichiers : `docs/infra.md` (« Durcissement de la pile »), avec la procédure de migration du cluster existant (`deploy/harden-db-roles.sh`).
- **API d'administration** : au-delà de 10 jetons faux en 5 minutes depuis une même adresse, les nouveaux jetons faux reçoivent 429 (un jeton valide passe toujours). Cela ne remplace pas de ne pas publier `/api/admin/*` (§9).
- **Paiements** : sessions Stripe de 30 minutes ; le champ « code promo » de la page Stripe est retiré tant qu'un code « un par client » est actif.
- **Rejouer les contrôles** : `BASE_URL=http://localhost:<port> bun web/scripts/check-guards.ts` (gardes + en-têtes sur chaque type de réponse), `bun web/scripts/pentest-securite.ts` (essais d'intrusion ; **local seulement**, refuse toute autre adresse ; lancer le site avec `NEXORA_PASSWORD_BREACH_CHECK=off` pour qu'aucun service externe ne soit appelé), `bun web/scripts/e2e-2fa.ts` (parcours navigateur).
- **Migration de base 0014** (tables `two_factors`, `auth_lockouts`, colonne `users.two_factor_enabled`) : appliquer `bun run db:migrate` avant de démarrer la nouvelle version.
