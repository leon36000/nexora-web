# Journal du nouveau site Nexora

Conception : `docs/superpowers/specs/2026-10-26-nexora-site-design.md`. Équipe : orchestrateur (Opus 5.5, contrôle qualité), ≤ 3 Sonnet 5.5 (effort élevé), ≤ 3 Haïku 5.5 ; Haïku de recherche non plafonnés.

## S1 Socle — terminé le 27/10/2026
- Pile de développement épinglée par empreinte (PostgreSQL 17 + pgvector, Directus 12.5.1, LiteLLM v1.106.2 interne, Mailpit) ; LiteLLM répond via le LiteLLM de pc1 (`dev/cloud-glm-5-3`).
- Infra (Sonnet) : espaces de travail bun, Biome/TS strict/Vitest, `packages/db` (jobs, vault_secrets, config_versions, processed_events), `packages/log` (journal sans secret), worker SKIP LOCKED, coffre AES-256-GCM par enveloppe avec rotation, routes `/api/admin/vault`, `/api/health`. Contrôle orchestrateur : 76 tests verts, primitives cryptographiques relues, aucun secret dans le diff.
- Design (Sonnet) : jetons de palette AA (25 paires calculées), polices OFL locales, grille de périmètre, en-tête/menu mobile accessibles, i18n natif fr-CA (`/`) / en-CA (`/en`), accueil squelette ; axe sans violation, Lighthouse mobile 95–99. Contrôle : captures revues ; à corriger en S2 : la traînée orange du héros peut se lire comme une donnée qui sort du périmètre.
- Directus (Sonnet) : 22 collections, rôles et politiques par `apply.ts`, garde de publication (`items.promote`, hash de version calculé par le serveur, approbation à usage unique, écriture directe refusée), module et endpoint Coffre, contenu initial ; essai 58/58. Contrôle : 59 tests, tsc, build d'extension.
- Ruling : sans clé Open Innovation Grant, Directus refuse les règles de permission ; le site filtre `status = published` côté serveur — coût si oublié : fuite de brouillons.
- Ruling : Environment Sync n'existe pas encore en 12.5 (RFC) ; schéma appliqué par script idempotent.
- Incident : un agent a lancé `pkill -f "next start"` et tué les lanceurs npm de deux serveurs d'autres sessions (ports 3102, 3311 ; processus next-server intacts, ports répondent). Règle ajoutée à AGENTS.md.
- Sécurité : LiteLLM de pc1 en v1.99.1 (non touché par l'incident 1.107.0) ; aucune trace du paquet piégé sur pc1 et pc6.

## S2 Tranche verticale — terminé le 27/10/2026
- Contenu (Sonnet) : accueil (10 blocs) et OPSYS-AI (12 blocs) en fr-CA/en-CA, démarche marketing documentée (`cms/content/README.md`), registre de 56 affirmations (`cms/content/claims.json`, chargées « en revue », jamais approuvées par l'agent) et 20 formulations retirées faute de preuve (dont « la réception de vos appels », toute mention de la Loi 25, « mode souverain » d'OPSYS-AI). Chargement par versions + approbations + promotion. Contrôle orchestrateur : relecture complète de l'accueil fr — ton et vérité conformes.
- Rendu (Sonnet) : lecture Directus serveur (publié seulement, statut revérifié), six blocs, texte riche en liste blanche, FAQPage par code, métadonnées et hreflang conditionnels, aperçu signé (Draft Mode, noindex), revalidation par étiquettes (`expire: 0`), instantanés en cas de panne de Directus ; traînée orange du héros inversée vers l'intérieur. Preuves : e2e de publication 25/25 (page jetable et accueil réel), axe 0 violation, Lighthouse mobile 98/100/100/100, résilience Directus coupé (200 depuis l'instantané).
- Constat du contrôle qualité (→ S3) : composition trop uniforme une fois rendue depuis Directus (sections presque toutes claires, schémas de déploiement perdus, cartes orphelines) ; ajouter des variantes de blocs.
- Ruling : l'aperçu lit les versions avec le jeton Publication (le lecteur n'y a pas accès sans licence) — coût si compromis : un jeton plus puissant côté serveur ; à remplacer par un compte « Aperçu » dès la clé OIG.
- Ruling : `partialPrefetching: false` pour obtenir un vrai 404 sur URL inconnue.
- En attente du fondateur : affirmations commerciales « en revue » (schéma des flux écrit, aucun modèle externe sans accord, non-réutilisation des données, exportation au contrat, hébergement au Québec).

## S4 Comptes et paiements — terminé le 27/10/2026
- Sonnet : Better Auth 1.7.14 (courriel vérifié, organisations, CSRF forcé, limitation de débit), grand livre en micro-unités CAD (écritures immuables par déclencheur, contrainte SQL anti-découvert, réservation sous verrou, idempotence, `config_version`, expiration 12 mois), Stripe en mode test (Checkout crédits et abonnements séparés, Stripe Tax, portail, webhook signé idempotent dans la même transaction, 10 événements, `sk_live_`/`livemode` refusés), `/compte` fr/en, stripe-mock épinglé. Preuves : e2e inscription → achat → webhook → crédit, rejeu sans double crédit, remboursement, 20 réservations concurrentes sans dépassement.
- Contrôle orchestrateur : 504 tests verts après fusion, signature et garde livemode relues, contraintes SQL relues ; conflit `init-dev-env.sh` résolu ; `subscription_plans` appliquée à Directus (24/25 collections).
- Décisions de l'agent retenues (à confirmer par le fondateur) : crédits = montant avant taxes ; délai de grâce 7 jours ; seul le propriétaire achète. Non livré : invitations de membres, expiration planifiée par le worker.
- Ruling D14 : catalogues commerciaux et infrastructure dans l'app, administrés par modules Directus (limite de 25 collections sans licence).

## S3 (composition et parcours) — fusionné le 27/10/2026
- Sonnet : champs `tone`/`layout`/`visual`/`anchor_id` (+ `label`, `status` de carte), rendu varié (bandes sombre/clair/sable, schémas de périmètre, liste, étapes, modules, sommaire collant), navigation et pied de page depuis Directus (45 entrées), sélecteur par slug traduit, formulaire de diagnostic (Altcha auto-hébergé, `leads` 0003, file de tâches, Mailpit). Preuves : axe 0, Lighthouse 96–98, e2e contact 17/17.
- Contrôle orchestrateur : captures relues — composition riche retrouvée ; 605 tests verts après fusion.
- Ruling : les dix départements OPSYS-AI affichés « En pilote » (choix prudent quand le rapport 07 mêle disponible/pilote) — à confirmer par le fondateur.

## S5 Passerelle de modèles — terminé le 27/10/2026
- Sonnet : tables `model_providers`, `models`, `model_prices` (immuables), `fx_rates`, `api_keys`, `usage_events` (0004/0005) ; catalogue versionné (publié seulement ; refus prix absent/0 $, sous plancher, taux non approuvé, clé absente du coffre) ; `/api/admin/catalog/*` ; `/v1/models|chat/completions|embeddings` avec réservation au grand livre, 402 au format OpenAI, clé maîtresse jamais exposée, aucun contenu journalisé ; `/modeles`, fiches, `/docs/api`, clés et usage dans `/compte` ; module Directus « Modèles ». Preuves : e2e réel GLM 5.3 (débits exacts 42/40 µCAD, révocation → 401), 20 appels concurrents sans dépassement, axe 0, Lighthouse /modeles médiane 95 (machine chargée).
- Contrôle orchestrateur : 704 tests verts, clé maîtresse lue en un seul point serveur, aucun secret ; module ajouté à la barre Directus par `apply.ts`.
- À faire : bascule multi-fournisseurs, libération des réservations perdues par le worker, rapprochement périodique LiteLLM ↔ grand livre, entrée « Modèles » dans la navigation.

## S8 Autogestion IA et SEO — terminé le 27/10/2026
- Livré : SEO technique natif (sitemap multilingue, robots, JSON-LD, Open Graph, llms.txt, IndexNow) ; audits planifiés (structure, lychee, axe, Lighthouse) ; agents du site (Rédacteur, Traducteur, SEO, Veille, Santé) débités au grand livre par la passerelle, écriture par `create_draft` seulement ; modules Directus « Agents du site » et « SEO » ; paquets `@nexora/seo` et `@nexora/vault`.
- Preuves : brouillon réel par le Rédacteur (coût = règlement du grand livre), test d'injection (rien publié, rien supprimé, 0 secret), arrêt sur budget, audit nocturne (0 violation axe, Lighthouse 94–98).
- Contrôle orchestrateur : 883 tests verts ; client Directus des agents à liste fermée (ni PATCH, ni DELETE, ni promote) ; la garde force « en attente » sur toute approbation créée par un non-administrateur.
- Ruling : diff `s8-cms-agents` repris pour les droits (`id` à la création d'approbation, `create` sur `pages` et `pages_translations` pour le Rédacteur seul), SANS les comptes de service dans `apply.ts` — `apply.ts` régénérerait des jetons hors du Coffre et rendrait périmés ceux déjà déposés ; les comptes restent créés par l'opérateur (script de développement, ou Directus puis Coffre en production). Coût si faux : une étape manuelle de plus au déploiement.
- Écart connu : 313 liens internes cassés vers des pages pas encore publiées (attendu avant S3 contenu).
- À faire : agent Diffusion (Postiz), maillage interne par embeddings, Umami, écritures réelles Search Console/DataForSEO (clés du fondateur) ; décision d'affaires sur le blocage des robots d'entraînement (bloqués par défaut).

## S6 VPS et provisionnement — terminé le 27/10/2026
- Livré : migration `0007_s6_vps` (plans, applications, serveurs Proxmox, gabarits, commandes, instances, journal en ajout seul) ; paquet `@nexora/vps` (client Proxmox à TLS vérifié ou empreinte épinglée, simulateur dérivé de l'apidoc officiel, machine à états reprenable, compensation sans remboursement automatique, suspension après 7 jours de grâce, rétention 7 jours, pare-feu par VM, port 25 sortant fermé) ; `/vps`, `/vps/<application>`, `/compte/vps`, API d'administration, module Directus « VPS » ; applications Hermes Agent, OpenClaw durci, Ollama + AnythingLLM, AnythingLLM, LibreChat (n8n, Open WebUI, Dify en fiches guide).
- Preuves : parcours de bout en bout (coffre, simulateur, stripe-mock, Mailpit, webhooks signés, vrai worker) jusqu'à la suppression après rétention ; 10 workers concurrents → un seul clone ; axe 0 violation ; Lighthouse 95–98.
- Contrôle orchestrateur : 1 180 tests verts ; actions client limitées à l'organisation (réinstaller et résilier réservés au propriétaire) ; variables des scripts échappées ; clé SSH du worker en dossier temporaire 0600 effacé. Module « VPS » ouvert dans le vrai Directus : données réelles par le relais (serveur simulé, jeton présent au Coffre, applications).
- Ajout orchestrateur : fiches `/vps/<application>` publiées dans le sitemap, datées par la publication du catalogue VPS (test RED→GREEN), titre et description de `/vps` tirés du dictionnaire.
- Non vérifié : aucun vrai Proxmox ni vraie VM (test de contrat prêt, `PROXMOX_CONTRACT_URL`) ; pas de TLS ni domaine par VPS (applications en 127.0.0.1, tunnel SSH) ; commande sans application impossible alors que les guides n8n/Open WebUI/Dify l'évoquent (renvoi au contact).
- Ruling (S6) : plans « [DEV] » commandables en développement, badge visible — à désactiver avant publication.

## S7 Agents hébergés — terminé le 27/10/2026
- Livré : migration `0008_s7_agents_heberges` (instances WorkStudio, agents, prix immuables, réglage de la bulle, `usage_events.run_fee_micro`) ; `agent/<slug>` dans `/v1/chat/completions` et `/v1/models` (réservation plafonnée par exécution, règlement exact, repli sans usage, 402, 401, 404, 503 propre) ; découverte `GET /v1/models` de WorkStudio (brouillons seulement) ; `/agents` et fiches fr/en ; consommation par agent dans `/compte` ; module Directus « Agents hébergés » ; bulle `/embed.js` administrable avec CSP limitée à l'origine configurée.
- Preuves : `docs/captures/s7/` (appels réels GLM 5.3 via WorkStudio, flux et non-flux, débit = règlement ; axe 0 ; bulle sans erreur de CSP).
- Correctif S5 au passage : un paquet SSE entièrement masqué (usage non demandé) laissait la lecture en attente.
- Non fait : prix réels ; rapprochement avec la consommation WorkStudio ; coût amont WorkStudio non suivi (pas de plancher de marge).
- Contrôle orchestrateur : 1 290 tests verts ; CSP posée seulement sur les pages de la bulle (cache 10 s, aucune en cas d'erreur) ; boucle SSE terminée à la fin de l'amont, règlement avant `[DONE]` ; migration 0008 appliquée sur `app` ; module « Agents hébergés » ouvert dans le vrai Directus (données réelles par le relais).
- Rulings (S7) : réservation plafonnée à `run_token_cap` (32 000 jetons par défaut) — trop bas, Nexora absorbe le dépassement ; identifiant amont `agent:<nom>` faute d'identifiant de workflow dans `/v1/models` — renommer l'agent dans WorkStudio le casse tant que l'admin n'a pas saisi `agent:<id>` ; CSP avec `'unsafe-inline'` pour les scripts de Next sur les pages de la bulle.
- À poser côté WorkStudio avant publication : `NEXORA_EMBED_ORIGINS=https://<domaine du site>` (vide aujourd'hui = toutes origines).

## S3 Contenu vitrine — terminé le 27/10/2026
- Livré (Sonnet) : 25 pages fr-CA/en-CA rédigées ; 20 publiées par la chaîne officielle (souveraineté, hub et 6 solutions, services ×2, déploiement ×2, méthode, WorkStudio, suite, entreprise, centre de confiance, FAQ) ; guide Loi 25 et 4 pages juridiques en brouillon `noindex` avec marqueurs « À COMPLÉTER PAR LE FONDATEUR ». `load-content.ts` découvre les pages et ne promeut jamais un `draft`. Registre : +76 affirmations `en_revue` (dont CL-A01 à CL-A14 pour le fondateur), 16 formulations retirées (R-21 à R-36).
- Contrôle orchestrateur : 1 647 tests verts ; 44 liens internes du contenu → 200 ; captures 1440/390 de 4 pages relues (composition variée, rien de cassé) ; rendu public fr 22 / en 22 pages, brouillons en 404.
- Correctif orchestrateur : la navigation masque tout lien interne vers une page ni publiée ni route de l'application (`targetExists`, test RED→GREEN) — Tarifs, Ressources, Loi 25 et mentions légales réapparaîtront à leur publication ; aucun masquage si Directus est muet sans instantané. Lien `/en/models/` de l'accueil corrigé en `/en/modeles/` et republié par approbation.
- À confirmer par le fondateur : numéros d'articles de la Loi 25 cités de mémoire (CL-L01, L02, L04) ; FAQ publiée qui mentionne la Loi 25 sans se dire conforme ; engagements de service CL-05 à CL-08, CL-72, CL-73, CL-76, CL-128 ; pas de page Tarifs ni Ressources (prix non fixés).
- Avant publication : les mentions légales doivent être publiées (le pied de page n'a aucun lien légal tant qu'elles sont en brouillon).

## S9 Recette — en cours (27/10/2026)
- Recette des pages (orchestrateur, `docs/recette/pages.md`) : build de production, audit du produit sur 44 pages — structure 0, liens 0 sur 3 218, axe 0 (390/1440), Lighthouse mobile médiane 97. Corrigés : contraste du badge « Disponible », liens de navigation vers des pages absentes, `/en/models/`, routes de l'application perdues hors du répertoire `web/`.
- S9a (Sonnet, fusionné `1af8d1b`) : flux sortants (`flux-sortants.md`, 0 requête tierce mesurée, écarts E1–E9), sécurité (`securite.md` : 31 routes gardées, 43 sondes, gitleaks, `bun audit --prod` sans avis ; rulings R1–R13), CMS indisponible (56/56 pages servies, 404 conservé), sauvegarde/restauration isolées (`deploy/backup.sh`, `restore.sh`, manifeste SHA-256, chiffrement facultatif ; restauration prouvée jusqu'au solde affiché), `bun run e2e` (7 parcours, 1 sauté), `docs/guide-operateur.md`.
- Corrigés par S9a (test d'abord) : en-têtes de sécurité et CSP sans origine tierce ; garde SSRF `@nexora/net` (IPv4 inscrite en IPv6, métadonnées du nuage) sur toute adresse saisie, exceptions `NEXORA_OUTBOUND_ALLOW` ; portée des secrets du Coffre (un secret Stripe ne part plus vers une adresse saisie) ; jeton Google verrouillé sur Google ; 404 conservé Directus en panne ; télémétrie Next coupée.
- Contrôle orchestrateur : 1 730 tests verts après fusion ; CSP relue (aperçu Directus par lien signé, pas de cadre : `frame-ancestors 'none'` sans effet de bord ; bulle : origine ajoutée à `script-src`, `frame-src`, `connect-src` seulement) ; console du navigateur sans erreur sur `/contact` (ALTCHA).
- Ruling : le serveur Next de production écoute sur `localhost` ou `0.0.0.0`, jamais `127.0.0.1`/`::1` (Next 16.4.3 renomme la boucle locale dans la réécriture du proxy → boucle 308 sur les pages françaises) ; consigné au guide. Coût si oublié : site français inaccessible.
- Ouverts : `MARKETPLACE_REGISTRY` de Directus non posé (E3) ; affirmation CL-12 (« libre-service non ouvert ») contredite en mode test (E7) ; archive de sauvegarde avec jetons Directus en clair sans `--chiffrer` ; base `app_s9` laissée (données de test).

### Revue indépendante finale (Opus, 27/10) et passe de correction
- Verdict de la revue : 2 bloquants, 5 importants, 5 mineurs. Tous les bloquants et importants corrigés, chacun par un test vu échouer puis passer :
  - **B1** : règlement plafonné à la réservation et réservation sous-estimable (images, texte non ASCII). Corrigé : règlement au coût réel par une écriture `overage` idempotente dans la même transaction (le solde peut devenir négatif, puis 402) ; 1 600 jetons par image ou clip audio ; 1 jeton par octet non ASCII ; agents hébergés réglés de même. Migration 0009.
  - **B2** : flux SSE coupé avant l'usage = appels d'outils gratuits. Corrigé : arguments d'outils et `reasoning` comptés ; invite estimée facturée au minimum dès un 200 amont ; règlement de flux réessayé.
  - **I1** : réservations jamais libérées et crédits jamais expirés. Corrigé : tâches `ledger.release-stale` (10 min ; délai = max(30 min, délai de flux + 15 min)) et `ledger.expire` (quotidienne) ; un règlement tardif est facturé au réel.
  - **I2** : crédits d'abonnement gardés après remboursement ou litige. Corrigé : octrois reliés à la facture et au paiement (`invoice_payment.paid`), débit proportionnel ; course entre deux remboursements fermée par verrou. Migration 0010.
  - **I3** : VPS payé après expiration jamais livré. Corrigé : commande reprise, ou `late_payment` avec alerte opérateur, sans remboursement automatique ; `checkout.session.expired` fait foi. Migration 0011.
  - **I4** : installation longue relancée par un second worker. Corrigé : baux de tâche et d'instance renouvelés pendant les étapes longues.
  - **I5** : clé SSH du worker envoyable vers une adresse saisie. Corrigé : références `vps.*` réservées.
  - **M5**, reclassé important : une fiche de modèle à point (`gpt-4.1`) échappait au proxy. Corrigé.
- Corrigés aussi : M1 (empreinte de clé d'hôte remontée), M2 (plafond de clé dans la transaction du grand livre), M4 (aucun crédit sur facture à 0 $).
- Rulings de la passe :
  - Ruling S7 « Nexora absorbe le dépassement de `run_token_cap` » **abandonné** : le dépassement réel est facturé.
  - Nouveaux événements Stripe à configurer sur l'endpoint : `invoice_payment.paid`, `checkout.session.expired`.
  - Octrois de crédits d'abonnement antérieurs à 0010 non reliés : sans effet en mode test.
  - Une erreur déclarée par l'amont dans le flux avant toute livraison reste à coût 0.
- Mineur reporté : M3 (`checkPrice` ne contrôle pas le prix « cache » quand le coût amont du cache est nul).
- Contrôle orchestrateur : migrations 0009 à 0011 renumérotées et régénérées par Drizzle (contenu SQL identique) ; conflit `docs/infra.md` résolu (liste d'événements réunie) ; 1 805 tests verts sur main ; migrations appliquées sur `app` et `app_s9`.
- Parcours de bout en bout après correctifs (`bun run e2e`, `E2E_STRICT=1`, base `app_s9`, build de production) : **8 réussis sur 8, aucun sauté** — y compris l'appel réel GLM 5.3 avec débit exact (règlement au coût réel) et l'agent WorkStudio hébergé (`docs/recette/e2e.md`). Un premier passage avait échoué sur 3 parcours : le `.env` racine de main datait d'avant l'ajout de SMTP et LiteLLM à `scripts/init-dev-env.sh` ; régénéré (ajouts seulement, aucun secret modifié), tout passe.

## À faire par le fondateur (cumul)
Clé Directus OIG ; acceptation de la licence MSCL et propriétaire du projet Directus ; identité légale ; prix ; clés Stripe test ; serveurs Proxmox ; domaine et HTTPS ; validations juridiques et fiscales ; publication.
