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

## À faire par le fondateur (cumul)
Clé Directus OIG ; acceptation de la licence MSCL et propriétaire du projet Directus ; identité légale ; prix ; clés Stripe test ; serveurs Proxmox ; domaine et HTTPS ; validations juridiques et fiscales ; publication.
