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

## À faire par le fondateur (cumul)
Clé Directus OIG ; acceptation de la licence MSCL et propriétaire du projet Directus ; identité légale ; prix ; clés Stripe test ; serveurs Proxmox ; domaine et HTTPS ; validations juridiques et fiscales ; publication.
