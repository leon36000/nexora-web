# Audit nocturne exécuté une fois (S8) — 27/10/2026

Déclenché par le **planificateur** (`worker/scripts/dev-run-nightly.ts` appelle `tickScheduler` avec l'horloge fixée à 03 h 05, heure de Toronto : même code que la production), exécuté par le worker sur le site en production locale (`next build` + `next start`, port 3530, `SITE_ENV=production`).

audit 4dbe73d2-ce61-4fae-833f-2d01ec24ce1b | all | succeeded | schedule | 12 pages | 316 constats | 66 s

Résumé par volet (table `seo_audits.summary`) :

- **Accessibilité (axe, 390 et 1440 px, 12 pages)** : 0 violation.
- **Performance (Lighthouse mobile, 6 pages)** : accueil 98, /en 97, OPSYS-AI 94 (**avertissement** sous 95), /contact 95, /modeles 95, /en/opsys-ai 98 ; accessibilité 100, bonnes pratiques 100, SEO 100 partout ; LCP 2,3 à 3,0 s, CLS ≤ 0,01.
- **Structure SEO (12 pages)** : 0 erreur, 2 avertissements (titre de `/docs/api` en fr et en : 12 caractères, minimum 15).
- **Liens (lychee)** : 313 liens cassés, tous **internes** (404) : la navigation et les cartes pointent vers des pages pas encore publiées (`/solutions/…`, `/tarifs`, `/vps`, `/en/workstudio`…). C'est l'état réel du site de développement ; ils se résolvent au fil des publications (les constats passent alors à « résolu »).

Résultats en base (`seo_issues`, ouverts) : links error=313, perf warning=1, structure warning=2.
Le module « SEO » de Directus affiche ces constats, les adaptateurs et leur état.
