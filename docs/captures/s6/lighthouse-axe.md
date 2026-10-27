# Lighthouse mobile et axe — S6 (VPS), 27/10/2026

Site `next start` sur :3500 (arrêté ensuite par son PID), base de développement avec les trois plans « [DEV] » publiés et les huit applications (`bun run --cwd web vps:seed -- --dev --stripe`). Machine pc6 partagée : chaque page mesurée trois fois (Lighthouse 13.5, `--form-factor=mobile`, Chromium de Playwright).

| Page | Performance (3 exécutions) | Accessibilité | Bonnes pratiques | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| `/vps` | 96, 96, 97 | 100 | 100 | 66 * | 2,4 s | 0,01 |
| `/en/vps` | 96, 97, 97 | 100 | 100 | 66 * | 2,4 à 2,6 s | 0,01 |
| `/vps/ollama-anythingllm` | 95, 98, 98 | 100 | 100 | 66 * | 2,3 à 2,8 s | 0,006 |

\* Le SEO à 66 vient du seul audit « page bloquée à l'indexation » : le site entier répond `x-robots-tag: noindex, nofollow` avant publication (l'accueil aussi). Hors de la zone S6.

## axe-core (WCAG 2.2 AA + bonnes pratiques), 0 violation

`BASE_URL=http://localhost:3500 bun web/scripts/axe-s6.mjs` : `/vps`, `/en/vps`, `/vps/ollama-anythingllm`, `/en/vps/hermes-agent`, `/vps/n8n` à 390 et 1440 px, sans défilement horizontal, plus le configurateur avec une clé SSH refusée : 0 violation.

`BASE_URL=http://localhost:3500 bun web/scripts/verify-account-vps.ts` : inscription réelle d'un client de test (Mailpit), deux VPS d'essai (actif, suspendu), `/compte/vps` et `/en/compte/vps` à 390 et 1440 px : 0 violation. Le rendu réel avait trouvé deux défauts, corrigés : contraste du badge « En marche » (vert sur sable 4,31:1) et régions « Opérations » en double.

Non mesuré : Lighthouse de `/compte/vps` (page dynamique derrière session).
