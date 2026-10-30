# Nexora Code : connexion par le compte Nexora et environnement hébergé (chantier F)

Côté SITE de Nexora Code (branche `feat/code`, pas encore fusionnée dans `main`). L'agent de code lui-même (fork d'OpenCode v2.2.3, dépôt `root/nexora-code`, `~/Desktop/NexoraCode`) parle au site selon le contrat du § 1. Conception : `docs/superpowers/specs/2026-10-30-credits-produits-design.md` (décisions 4, 5, 8 et 10). Panneau : `docs/panneau-mes-outils.md`. Crédits et espace : `docs/credits-et-offres.md`. Clés par personne : même modèle que WorkStudio (`docs/workstudio-integre.md`).

**Les routes sont NEUTRES** : elles valent pour n'importe quel client Nexora qui parle ce contrat (le CLI, l'application de bureau « Nexora Code » développée à part). Rien ici n'est propre à l'un d'eux.

**État honnête.** Tout le code est livré et testé sur une base PostgreSQL jetable. La connexion par code d'appareil a été essayée **de bout en bout avec le vrai CLI** (voir § 7). **Aucun vrai conteneur n'a été lancé** et aucune image n'a été construite (disque tendu) : le pilote Docker est testé avec un faux client et un « essai à blanc » qui imprime les commandes. Le mandataire est testé contre un faux serveur HTTP, pas contre le vrai serveur de Nexora Code. Les **WebSocket** (terminal de l'interface web) ne passent pas par une route Next (§ 5).

## 1. Contrat HTTP (connexion de l'appareil)

Toutes les réponses : JSON, `Cache-Control: no-store`. Erreurs au format OpenAI : `{ "error": { "code", "message" } }` (messages en français).

| Route | Qui | Rôle |
|---|---|---|
| `POST /api/code/device/start` | personne (sans authentification), limitée par adresse | `{ client, client_version, device_name }` → `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in: 600, interval: 5 }` |
| `POST /api/code/device/poll` | le CLI (sans authentification) | `{ device_code }` → toujours `200 { status }` : `pending`, `slow_down`, `denied`, `expired`, `approved` (+ `api_key`, `key_prefix`, `organization_name`, `user_email`, `default_model`). Code inconnu ou mal formé : `400 invalid_device_code`. |
| `POST /api/code/device/approve` | la page du site (session) | `{ user_code, decision?: "approve" \| "deny" }` → `200 { ok: true, decision }` ; `400 invalid_code`, `401`, `403`, `409 key_limit`, `429` |
| `GET /api/code/credits` | le CLI, `Authorization: Bearer nxk_…` | `{ credits: { subscription, refill, total }, can_use_models, plan_code, organization_name }` ; `401 invalid_api_key` (clé inconnue, révoquée, expirée ou mal formée : la même réponse) |
| page `/code/device` (`/en/code/device`) | la personne | saisie ou confirmation du code, nom de l'appareil, organisation, ce que la clé permet, Autoriser / Refuser |

Déroulement : le CLI demande un code → affiche `user_code` et ouvre `verification_uri_complete` → la personne se connecte (la page la renvoie à la connexion puis ici : `?next=` n'admet que `/code/device`, voir `lib/safe-next.ts`) → autorise → au sondage suivant le CLI reçoit sa clé UNE fois.

`default_model` : `NEXORA_CODE_DEFAULT_MODEL`, sinon `WORKSTUDIO_DEFAULT_MODEL`, sinon le modèle par défaut de WorkStudio.

## 2. Sécurité de la connexion (toutes ces propriétés sont testées)

- **Code d'utilisateur** `NXC-XXXX-XXXX` : 8 symboles tirés sans biais (`crypto.randomInt`) dans un alphabet de 28 sans voyelle ni `0`, `1`, `L` (≈ 38 bits), accepté en minuscules, sans tirets, avec ou sans préfixe. Le code d'appareil (secret du CLI) : 256 bits.
- **Rien en clair au repos** : les deux codes ne sont conservés que par empreinte SHA-256 (`code_device_codes`). La clé `nxk_` n'est PAS rangée : elle est créée **au moment de la remise** (premier `poll` après l'approbation), dans la transaction qui marque la demande « remise » ; elle n'existe donc qu'une fois, dans la réponse. Un second `poll` répond `expired`. Deux `poll` simultanés ne créent qu'une clé. Seule l'empreinte existe ensuite dans `api_keys`, comme les autres clés.
- **Jamais journalisée** : le journal ne reçoit que des identifiants (clé, organisation, personne). Un test vérifie que ni la clé, ni le code d'appareil, ni le code d'utilisateur n'y paraissent.
- **Expiration** de 10 minutes ; les demandes expirées depuis plus d'un jour sont supprimées à chaque `start`.
- **Limites de débit** (table `api_rate_limits`) : `start` 10/min et 60/h par adresse (429) ; `poll` 20/min par code et 300/min par adresse, **répondu par `slow_down` avec un statut 200** (le CLI traite tout statut ≠ 200 comme un échec définitif) ; essais de code (approbation ET lecture de la page) 20/min par personne et 120/min par adresse (429). Un `poll` plus rapide que 3,5 s reçoit aussi `slow_down`.
- **Pas de fuite d'existence** : `approve` répond la même chose (`400 invalid_code`) pour un code inconnu, expiré, déjà approuvé ou mal formé ; la page `/code/device` montre le même message.
- **Un code ne s'approuve qu'une fois**, même en parallèle (verrou de ligne).
- **Approbation** : session du site obligatoire (`401`), contrôle d'origine (`403 invalid_origin`, même règle que les routes de facturation), courriel vérifié (`403 email_not_verified`), 2FA du personnel (`403 two_factor_required`, comme `/api/oauth/workstudio-access`). L'organisation et la personne viennent TOUJOURS de la session, jamais du corps.
- **La clé** : « Nexora Code (nom de l'appareil) » dans l'organisation de la personne, permission de modèles seulement (WebPilot et RAG restent des cases à cocher dans « Modèles et clés »), révocable depuis « Modèles et clés ». Se reconnecter depuis le même appareil **renouvelle** la clé (l'ancienne est révoquée) ; deux appareils gardent chacun la leur. Plafond de 25 clés actives par organisation : `409 key_limit` dès l'approbation, avec un message clair.
- **Aucune écriture ne dépend du solde ni du quota** : la clé existe même avec 0 crédit (le CLI affiche alors « Crédits épuisés ») ; c'est la passerelle qui refuse les appels de modèle (`402 insufficient_quota`).
- Le nom de l'appareil est nettoyé (caractères de contrôle, chevrons, guillemets retirés ; 60 caractères) et échappé à l'affichage.

## 3. Environnement hébergé

Un conteneur `nexora/code-workspace` (image de `deploy/Dockerfile.workspace` du dépôt Nexora Code) **par personne et par organisation**, sur le serveur qui porte Docker. Il lance `nexora-code serve` sur le volume `/workspace`.

```
panneau (/compte/code) ──► CodeWorkspaceService (web/src/server/code/workspace-service.ts)
                              │  table code_workspaces ; mot de passe au Coffre ; clé nxk_ dédiée ; quota d'espace
                              ▼
                        WorkspaceDriver (packages/code) ──► pilote Docker (client injectable)
worker : tâche code.sweep (toutes les 5 min) ──► arrêt après inactivité + mesure de l'espace des volumes
navigateur / appli ──► /code/ws/<id>/… (mandataire du site) ──► 127.0.0.1:<port> du conteneur
```

- **`WorkspaceDriver`** (`packages/code/src/driver.ts`) : `create`, `start`, `stop`, `remove` (avec ou sans le volume), `state`, `volumeBytes`. Le **pilote Docker** (`docker.ts`) ne passe que par un tableau d'arguments (jamais un shell), valide chaque nom (conteneur, volume, image sans tiret en tête, variables, limites) et applique le durcissement de `deploy/README.md` : système de fichiers en lecture seule, `/tmp` en tmpfs `noexec`, `--cap-drop ALL`, `no-new-privileges`, 1 CPU, 2 Go sans swap, 512 processus, port lié à `127.0.0.1`, volume `/workspace`, `--restart no`. **Les secrets (`NEXORA_API_KEY`, `NEXORA_CODE_PASSWORD`) ne figurent jamais dans la commande** : seul leur nom y est (`-e NEXORA_API_KEY`), la valeur passe par l'environnement du processus `docker`. Le **client Docker est injectable** : `execDockerClient` (le vrai), `dryRunDockerClient` (essai à blanc), ou un faux dans les tests. Un échec de Docker devient une erreur à code court (`docker_failed`, `docker_unreachable`…) : le texte de Docker n'est jamais repris. Un pilote qui parlera au module VPS (Proxmox) remplacera celui-ci sans toucher au service (décision 10).
- **Essai à blanc** (`NEXORA_CODE_DRIVER=docker-dry-run`) : le site imprime dans son journal chaque commande `docker …` qu'il aurait lancée (valeurs des secrets remplacées par `***`) et simule en mémoire un parc de conteneurs (création → démarrage → « sain » après 2 s → arrêt). L'état simulé vit dans le processus du site : le balayage du worker est désactivé dans ce mode.
- **Données** (migration `0029_code_heberge`) : `code_workspaces` (un par organisation et personne ; `proxy_id` opaque pour l'adresse ; noms du conteneur et du volume ; port ; `desired_status` ; `accounted_bytes` ; `quota_blocked` ; activité) et `code_device_codes`. Le mot de passe du serveur est rangé **chiffré au Coffre** (`code-workspace-password.<id>`, type « other »), jamais dans la ligne. La clé `nxk_` de l'environnement (« Nexora Code (environnement hébergé) », distincte de celle du CLI) n'est qu'une ligne de `api_keys` ; elle est **recréée** à chaque création du conteneur, et si la personne la révoque, le démarrage suivant recrée le conteneur (le volume reste) avec une clé neuve.
- **Démarrage** (`start`, sérialisé par personne) : espace d'abord (§ 4), ligne et port libre de la plage (`NEXORA_CODE_PORT_MIN`–`MAX`), clé, `create` puis `start`. Idempotent : déjà en marche, rien n'est refait. Un échec du pilote → `unavailable` (code court gardé dans `last_error`), clé révoquée, espace réservé rendu ; la personne peut réessayer.
- **État** : `stopped` (arrêté voulu), `starting` (démarrage ou sonde de santé pas encore bonne), `ready` (sain ; l'adresse d'ouverture est celle du mandataire), `error` (sonde « unhealthy », arrêté alors qu'il devait tourner, pilote injoignable).
- **Solde nul** : l'environnement démarre (il n'appelle aucun modèle) ; c'est la passerelle qui refuse les appels de modèle.
- **Arrêt automatique** : la tâche `code.sweep` du worker arrête tout environnement sans activité depuis `NEXORA_CODE_IDLE_MINUTES` (30 par défaut ; le mandataire note l'activité, au plus une écriture par 30 s). Les données restent.
- **Suppression** (`DELETE /api/account/code/workspace`, 204) : retire conteneur et volume, révoque la clé et le mot de passe, libère l'espace compté. C'est le geste qui permet de « libérer de l'espace » quand le démarrage répond `quota_exceeded`.

## 4. Espace (quota)

Le volume compte au produit `code` du quota de l'organisation (`recordStorageUsage`, `docs/credits-et-offres.md`).

- Un environnement **neuf** réserve 64 Mo (`RESERVE_BYTES`) au démarrage ; sans espace (ou sans offre : quota 0) → `quota_exceeded` (HTTP 402) et **rien n'est créé**. Un environnement existant exige la même marge pour redémarrer.
- La tâche `code.sweep` **mesure** le volume (`docker run --rm --network none … du -sb /workspace`, avec la même image) : toutes les 10 minutes pour un environnement en marche, une fois après l'arrêt pour un environnement arrêté. L'écart avec l'espace déjà compté est transmis au site par `POST /api/admin/code/usage` (jeton `NEXORA_APP_ADMIN_TOKEN`, comme `rag.index`), qui appelle `recordStorageUsage`.
- Si le volume a grandi **au-delà** du quota, l'espace est compté quand même (il est occupé), la réponse dit `overQuota`, et le worker **arrête** l'environnement et le marque `quota_blocked` : le service refuse de le redémarrer tant que l'organisation n'a pas d'espace (achat de Go supplémentaires, suppression d'autres contenus, ou suppression de l'environnement).

## 5. Mandataire : `/code/ws/<id>/…`

`web/src/server/code/workspace-proxy.ts`, route `app/code/ws/[id]/[[...path]]/route.ts`. `proxy.ts` laisse passer toutes les méthodes sur ce préfixe (sans langue ni CSP de page).

- **Accès** : session du site de la personne **propriétaire** seulement. Sans session `401` ; courriel non vérifié ou personnel sans 2FA `403` ; environnement d'une autre personne, identifiant inconnu ou mal formé : **la même 404** ; personne retirée de l'organisation : 404 ; environnement arrêté : `409 workspace_stopped`. Méthodes qui modifient : même origine exigée (`403 invalid_origin`), avant toute transmission.
- **Transmission** : le mot de passe du serveur (Coffre, gardé 60 s en mémoire) est ajouté en `Authorization: Basic opencode:<mot de passe>` côté serveur ; il n'atteint jamais le navigateur. Cookies, `Authorization`, `Origin`, `Referer`, `X-Forwarded-*` de la personne ne sont **pas** transmis ; les `Set-Cookie`, `WWW-Authenticate` et en-têtes CORS de l'environnement ne sont pas relayés ; les redirections sont ramenées sous le préfixe (ou retirées si elles sortent) ; le cache est rendu privé. Corps et réponses sont en flux : **le SSE passe au fil de l'eau** (testé). Chemins refusés : `..`, antislash, NUL (même encodés). Environnement injoignable : `502`, sans détail.
- **Pas de page HTML depuis l'origine du site** : un script servi par l'environnement s'exécuterait avec la session de la personne (et pourrait appeler les routes du compte). Les réponses `text/html`, SVG et XML et les navigations (`Sec-Fetch-Dest: document`) reçoivent `403 dedicated_origin_required`. Le réglage `NEXORA_CODE_ALLOW_SAME_ORIGIN_UI=1` lève ce refus **pour le développement seulement** (jamais en production). L'**interface web dans le navigateur** exige donc une origine dédiée (sous-domaine joint par un billet à usage court posé en cookie propre à cet hôte) : **non livrée** (§ 8). Le mandataire sert l'API (HTTP, SSE) à l'application de bureau et au CLI en mode serveur distant.
- **WebSocket** (terminal PTY, appairage) : une route Next ne peut pas faire la mise à niveau ; le serveur Next referme la connexion (et la route répond `426 websocket_unsupported` si l'en-tête `Upgrade` lui parvient). **Solution de remplacement** : un mandataire de bordure devant le site porte `/code/ws/*` et demande l'autorisation à `GET /api/code/ws-auth?id=<proxy_id>` (le cookie de session suit) ; la réponse `204` porte `X-Nexora-Upstream` (hôte:port) et `X-Nexora-Authorization` (Basic) à recopier vers l'environnement. Exemple Caddy, **non vérifié** :

  ```
  @code path_regexp code ^/code/ws/([0-9a-f]{32})(/.*)?$
  handle @code {
    forward_auth 127.0.0.1:3500 {
      uri /api/code/ws-auth?id={re.code.1}
      copy_headers X-Nexora-Authorization>Authorization X-Nexora-Upstream
    }
    uri strip_prefix /code/ws/{re.code.1}
    reverse_proxy {http.request.header.X-Nexora-Upstream}   # WebSocket compris
  }
  ```

  `ws-auth` ne doit être joignable que par ce mandataire (réseau interne). Même limite d'origine que ci-dessus pour les pages HTML.

## 6. Variables d'environnement

Site (`web`) : voir aussi `docs/workstudio-integre.md` pour `SITE_URL`, `BETTER_AUTH_SECRET`, `NEXORA_VAULT_MASTER_KEY`.

| Variable | Obligatoire | Rôle |
|---|---|---|
| `NEXORA_PRODUCT_CODE` | oui, pour allumer | `1`, `true`, `on`, `oui`, `yes` ; tout le reste éteint (défaut) |
| `NEXORA_CODE_DRIVER` | oui, pour allumer | `docker` ou `docker-dry-run` (essai à blanc) ; absent : la page dit « indisponible » |
| `NEXORA_CODE_IMAGE` | avec le pilote | `nexora/code-workspace@sha256:…` ; **en production l'empreinte est exigée** (règle du dépôt) ; une étiquette locale est admise en développement |
| `NEXORA_CODE_GATEWAY_URL` | non | passerelle vue du conteneur (`NEXORA_API_URL`, se termine par `/v1`) ; défaut `${SITE_URL}/v1` |
| `NEXORA_CODE_DEFAULT_MODEL` | non | modèle par défaut du CLI et de l'environnement (sinon `WORKSTUDIO_DEFAULT_MODEL`) |
| `NEXORA_CODE_CPUS`, `_MEMORY`, `_PIDS`, `_TMP_SIZE` | non | limites par conteneur (défauts `1.0`, `2g`, `512`, `256m`) |
| `NEXORA_CODE_PORT_MIN`, `_PORT_MAX` | non | plage des ports publiés sur 127.0.0.1 (20000–29999) |
| `NEXORA_CODE_UPSTREAM_HOST` | non | hôte des ports vus du site (127.0.0.1 : site et Docker sur la même machine) |
| `NEXORA_CODE_DOCKER_HOST`, `_DOCKER_BIN` | non | `DOCKER_HOST` (`unix://`, `ssh://`) et binaire |
| `NEXORA_CODE_IDLE_MINUTES` | non | inactivité avant l'arrêt (30) |
| `NEXORA_CODE_INSTALL_COMMAND` | non | commande d'installation du CLI affichée au panneau ; absente : « sera publiée ici à la sortie » |
| `NEXORA_CODE_ALLOW_SAME_ORIGIN_UI` | non | développement seulement (§ 5) |

Worker : `NEXORA_CODE_DRIVER=docker` et les mêmes `NEXORA_CODE_*`, plus `NEXORA_APP_INTERNAL_URL` et `NEXORA_APP_ADMIN_TOKEN` (déjà utilisés par le RAG). Sans eux, le balayage est désactivé (un avertissement le dit) : les environnements ne s'arrêtent pas seuls et leur espace n'est pas mesuré.

## 7. Preuve de bout en bout et tests

Essai du 30/10/2026 (serveur de développement sur le port 3722, base jetable, `HOME` et répertoires XDG jetables) avec le **vrai CLI** lancé depuis ses sources (`bun run packages/cli/src/index.ts login --no-browser`) :

1. `login` affiche l'adresse et le code, attend ; la page `/en/code/device?user_code=…` (session de test) montre « Authorize Nexora Code on “gx10-e526”? », l'organisation, ce que la clé permet ; sans session elle renvoie à la connexion avec retour ; un faux code montre le message commun.
2. Approbation refusée depuis une origine étrangère (403) et sans session (401) ; acceptée par la session de test ; une seconde fois : `invalid_code`.
3. Le CLI affiche « Connecté : … » et range la clé (fichier et dossier en 0600 / 0700). `credits` : « 0 crédit » (la clé existe sans solde), puis « 1 000 crédits » après versement dans le grand livre ; `GET /api/code/credits` avec une clé fausse : 401.
4. La clé révoquée depuis les routes du compte : `credits` répond « Clé Nexora refusée ».
5. Panneau en essai à blanc : sans espace `402 quota_exceeded` ; avec 1 Go `202 starting` puis `ready` avec l'adresse du mandataire ; commandes `docker create/start` imprimées sans aucun `nxk_` ; mandataire devant un faux serveur : GET et PATCH transmis avec `Authorization: Basic` et sans cookie, origine étrangère 403, navigation de document 403, identifiant inconnu 404 ; `DELETE` libère l'espace et révoque la clé.

Tests (base jetable) : `packages/db/src/code.test.ts`, `packages/code/src/*.test.ts` (pilote, essai à blanc, réglages), `web/src/server/code/*.test.ts` (codes d'appareil, crédits, service, mandataire, comptage), `web/src/components/code/device-page-view.test.tsx`, `web/src/lib/safe-next.test.ts`, `web/src/server/products/code-composition.test.ts` (panneau + vrai service + essai à blanc), `worker/src/code/handlers.test.ts`. Commande : `set -a; . ~/Desktop/NexoraSite/.env; set +a` puis `npx vitest run` (Node 24).

## 8. Pour allumer Nexora Code (à faire par le fondateur)

1. **Construire l'image** `nexora/code-workspace` depuis le dépôt Nexora Code (`docker build -f deploy/Dockerfile.workspace …` : **jamais faite**, première construction à surveiller : taille, `vite build`, ouverture d'un projet par défaut) et relever son empreinte `sha256`.
2. Poser les variables du § 6 sur le site **et** sur le worker (`NEXORA_CODE_DRIVER=docker`, `NEXORA_CODE_IMAGE=…@sha256:…`) et donner à ces processus l'accès au démon Docker de la machine.
3. Régler l'**origine de l'interface web** (§ 5) : tant qu'elle n'existe pas, le bouton « Ouvrir Nexora Code » mène à une réponse `403 dedicated_origin_required` en production (l'API et le CLI fonctionnent).
4. Allumer `NEXORA_PRODUCT_CODE=1`.
5. Passer l'état de la fiche `code` à « disponible » dans `web/src/i18n/apps.ts` et compléter ses listes « ce qui est prêt » (fr et en : un test exige du livré pour « disponible »), puis mettre à jour CL-AP06 de `cms/content/claims.json` (son texte parle au futur). **Je ne l'ai pas fait** : c'est le geste du fondateur, après avoir vu un vrai environnement tourner.
6. Rien d'autre à publier côté CLI : la commande d'installation (`NEXORA_CODE_INSTALL_COMMAND`) attend la publication des binaires (non compilés à ce jour).

## 9. Décisions (Ruling : décision — pourquoi — coût si faux)

- Ruling : **la clé `nxk_` est créée au premier `poll` qui suit l'approbation**, pas à l'approbation — aucun clair n'est jamais rangé (ni chiffré, ni haché à récupérer) et « une seule fois » est garanti par la transaction — le contrat du CLI n'y voit aucune différence — coût si faux : une clé non récupérée n'existe simplement pas (rien à nettoyer).
- Ruling : **un `poll` trop fréquent répond `slow_down` en 200, jamais 429** — le CLI échoue sur tout statut ≠ 200 — coût si faux : un CLI plus tolérant ne profiterait pas d'un 429.
- Ruling : **tout membre de l'organisation peut autoriser un appareil** (comme WorkStudio intégré, et contrairement à la création de clés de `/api/account/api-keys`, réservée au propriétaire) — « un environnement par personne », la clé est « Nexora Code (appareil) » et se révoque dans « Modèles et clés » — coût si faux : ajouter `role === "owner"` dans `handleDeviceApprove`.
- Ruling : **le code d'utilisateur fait 8 symboles (≈ 38 bits)**, pas les 4 de l'exemple du contrat — avec 20 essais par minute et par personne, énumérer en 10 minutes est impossible — coût si faux : allonger `USER_CODE_LENGTH` (le CLI affiche la chaîne reçue).
- Ruling : **le mandataire ne sert pas les pages HTML de l'environnement depuis l'origine du site** — sinon un script de l'environnement (injection d'invite, dépôt malveillant) agirait avec la session de la personne — coût si faux : l'interface web du navigateur attend une origine dédiée ; un réglage de développement la rend possible en attendant.
- Ruling : **un volume qui dépasse le quota est compté et l'environnement arrêté**, plutôt que refusé à l'écriture — on ne peut pas limiter un volume Docker au disque sans quota de système de fichiers — coût si faux : un quota XFS par volume rendrait la limite stricte.
- Ruling : **`remove` (DELETE) est la seule façon de libérer l'espace depuis le panneau** quand le démarrage est refusé — sans mode « nettoyage » en lecture seule (non fait) — coût si faux : ajouter un démarrage restreint.
- Ruling : **un conteneur par personne et par organisation, port publié sur 127.0.0.1** (plage configurable) — le site et Docker sur la même machine pour la v1 — coût si faux : `NEXORA_CODE_UPSTREAM_HOST` et un pilote pour un autre hôte.
- Ruling : **tâche `code.sweep` du worker plutôt que dans le site** — le site (Next) n'a pas de tâche périodique fiable — coût si faux : aucun, le comptage passe par une route d'administration.

## 10. Ce qui n'est PAS fait ou PAS vérifié

- **Aucun vrai conteneur lancé, aucune image construite.** Le durcissement et les limites de `deploy/README.md` sont dans la commande mais n'ont pas été exécutés ; la sonde de santé (`HEALTHCHECK` de l'image) est supposée.
- **Interface web dans le navigateur** : origine dédiée (sous-domaine, billet signé, cookie par hôte) non faite ; `Ouvrir Nexora Code` ne marche en production que pour l'API.
- **WebSocket** : non pris en charge par Next ; l'exemple Caddy ci-dessus n'a pas été essayé.
- **Mandataire** : testé devant un faux serveur seulement ; pas devant `nexora-code serve`. Le comportement du serveur derrière un préfixe (`/code/ws/<id>/`) n'est pas connu (les applications absolues de l'interface web exigent une origine dédiée de toute façon).
- **Pas de bouton « Supprimer mon environnement »** dans le panneau (la route existe) ; pas de bouton « Arrêter » (l'arrêt est automatique) ; pas de démarrage en mode nettoyage quand l'espace est dépassé.
- **Pilote Proxmox / module VPS** : l'interface le prévoit, rien n'est écrit.
- **Plusieurs serveurs Docker**, répartition de charge, reprise sur incident du serveur : hors périmètre v1.
- **Balayage du worker contre un vrai Docker** : testé avec un faux pilote seulement ; l'essai à blanc ne l'alimente pas.
