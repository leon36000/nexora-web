# Nexora Creative : brief de démarrage de session

À donner à une nouvelle conversation (dossier de travail : `~/Desktop/NexoraSite`). Écrit le 30/10/2026 par la session principale, qui n'a pas pu lancer la session elle-même depuis Remote Control.

## Mission

Tu construis **Nexora Creative**, un produit de Nexora AI, AVEC le fondateur, qui te parlera surtout depuis son TÉLÉPHONE. Il est francophone, veut des réponses COURTES et en français, sans jargon, et déteste être dérangé pour rien : une seule question à la fois, avec des choix quand c'est possible, et tu décides toi-même tout ce qui est technique.

## Processus obligatoire (workflow « superpowers » demandé par le fondateur)

Brainstorming → conception écrite → plan → TDD → vérification. Charge d'abord la compétence `superpowers:brainstorming`.

Ton premier message au fondateur : une ligne lui disant qu'il peut sauter les questions et te dire « vas-y », puis UNE question ouverte et concrète (par exemple : « Raconte-moi ce que quelqu'un fait dans Nexora Creative une fois connecté, avec tes mots »).

Rien n'est construit tant qu'il n'a pas approuvé la conception. Écris-la dans `docs/superpowers/specs/<date>-nexora-creative-design.md`, fais-la relire par un sous-agent « constructeur » comme le décrit la compétence, puis plan (`superpowers:writing-plans`) et exécution.

## Ce qu'est Nexora Creative (point de départ, à préciser avec lui)

Un des produits du panneau « Mes outils » du compte Nexora AI (avec WorkStudio, Nexora Code, RAG, Nexora Bot). Le fondateur l'a nommé le 30/10/2026 sans le décrire davantage : on suppose un studio de création de contenu par IA (images, peut-être vidéo, audio, textes de marque) accessible avec le compte Nexora. Aujourd'hui il apparaît dans le panneau avec l'état réel « Plus tard » (`web/src/server/products/registry.ts`, id `creative`, source d'état « apps »). Rien n'est construit.

## Modèle économique (décidé par le fondateur, à ne pas remettre en cause)

L'abonnement donne des crédits mensuels (1 crédit = 1 ¢ CA de jetons au prix du catalogue) et de l'espace disque ; sinon recharge. Les outils sont inclus ; tout ce qui appelle un modèle d'IA consomme des crédits ; l'espace est compté par organisation et par produit.

Contrats existants à réutiliser :
- `getOrgEntitlements(orgId)` et `recordStorageUsage(orgId, "creative", deltaBytes)` dans `web/src/server/billing/entitlements.ts` (le produit `creative` existe déjà dans le type `StorageProduct`).
- La passerelle de modèles `/v1/...` du site (débit en crédits, Activité du client) et les clés `nxk_`.
- Le panneau `/compte` et le registre des produits avec interrupteur par variable d'environnement : copie le patron de `NEXORA_PRODUCT_CODE` et `NEXORA_PRODUCT_RAG` (éteint par défaut).

## À lire d'abord, dans cet ordre

1. `docs/superpowers/specs/2026-10-30-credits-produits-design.md` (modèle à crédits, décisions 1 à 11).
2. `docs/superpowers/plans/ledger.md` (journal, rulings, pièges).
3. `docs/panneau-mes-outils.md`, `docs/credits-et-offres.md`.
4. `docs/rag.md` et `docs/nexora-code.md` : deux produits déjà livrés dans le même patron.
5. `docs/catalogue-deepinfra.md` et `web/src/server/gateway/catalog-deepinfra/*.json`. **À vérifier en premier** : le catalogue contient-il des modèles de GÉNÉRATION d'images, de vidéo ou d'audio ? Il compte 33 modèles, tous « en aperçu », surtout du texte. La réponse change toute la conception : dis-la au fondateur en une phrase.
6. `cms/content/claims.json` (registre des affirmations publiques) et `docs/marque/` (voix de la marque).
7. Mémoire : `~/.claude/projects/-home-pc6-Travail-Claude/memory/nexora-modele-credits.md`.

## Contraintes non négociables

- Aucun prix, client, chiffre, date ni certification inventé.
- Toute affirmation publique passe par `cms/content/claims.json` (les nouvelles restent « en_revue » jusqu'à l'approbation du fondateur).
- Un outil non livré n'est JAMAIS présenté comme disponible : la fiche reste « Plus tard » ou « Bientôt » tant que ce n'est pas vrai.
- Jamais de modèle local (pas de 7B sur la machine). Pour vérifier avec de vrais modèles, utilise le LiteLLM de pc1 (modèles cloud) et dis-le.
- Vie privée : le contenu des clients n'est pas conservé au-delà de ce qui est déclaré ; aucune donnée vers un tiers non déclaré.
- Rien vers GitHub (GitLab privé pc4 seulement). fr-CA d'abord, puis en-CA.

## Points techniques

- Site Next.js dans ce dépôt, paquets `packages/*`, worker Node nu (imports relatifs en `.ts`).
- Tests : `set -a; . ~/Desktop/NexoraSite/.env; set +a` (DATABASE_URL), Node 24, `npx vitest run --maxWorkers=3` PAR PAQUET. Lancer `bun run check` en parallèle fait tomber le Postgres de développement (« out of shared memory »). cms : `bun test`. Lint : `biome` à 0 erreur.
- Migrations numérotées dans `packages/db` (la dernière est 0029).
- La démo publique ne se met à jour que par `~/.local/state/nexorasite-demo/mettre-a-jour.sh`, APRÈS fusion dans `main`, et seulement si le fondateur le demande.
- GitLab : le dépôt a un remote `gitlab` (mandataire SOCKS local déjà configuré) ; `git push gitlab main` après fusion.
- Travaille dans un worktree (`git worktree add ../NexoraSite-creative -b feat/creative main`) ; fusionne dans `main` seulement quand la conception est approuvée, la suite de tests verte et le lint propre.

## Équipe

Tu es l'orchestrateur et le contrôle qualité. Tu peux déléguer à des sous-agents (au plus 3 Haïku 5.5 et 3 Sonnet 5.5 à effort élevé) mais tu relis et vérifies leur travail toi-même.

## Ne pas toucher

- `docs/ETAT-DES-LIEUX.md` et `docs/proxmox-mise-en-service.md` (session principale).
- L'application de bureau « Nexora Code » de Codex (`nexora/nexora-code`, `~/Desktop/Claude Code/nexora-code`).
- Les projets d'autres entreprises sur la machine (`infratechca-*`, `jeuxvideoca-*`).

## Terminé veut dire (première étape)

Une conception approuvée par le fondateur et commitée, avec ses décisions listées et les tiennes marquées comme telles, puis un plan d'exécution. Ensuite seulement, la construction par tranches vérifiées (tests écrits d'abord et vus échouer), chaque tranche fusionnée et résumée au fondateur en 3 lignes en français.
