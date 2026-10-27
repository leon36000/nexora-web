# Lighthouse mobile et axe — S3

Machine pc6 partagée (charge moyenne ≈ 6 pendant les mesures) : les scores de performance varient de quelques points d'une exécution à l'autre ; on consigne chaque exécution et la médiane.

Commande : lighthouse@12.8.2 (CHROME_PATH = Chromium de Playwright), `--form-factor=mobile`, site `next start` sur :3500, contenu lu dans Directus.

| Page | Performance (exécutions) | Médiane | Accessibilité | Bonnes pratiques | SEO | LCP | CLS |
|---|---|---|---|---|---|---|---|
| `/` (accueil) | 95, 93, 97, 97 | **96** | 100 | 100 (96 sur une exécution : prérécupération de `/solutions`, page pas encore publiée, 404 en console) | 100 | 2,1 à 2,8 s | 0,01 |
| `/opsys-ai` | 97, 98, 98, 98 | **98** | 100 | 100 | 100 | 2,2 à 2,6 s | 0 |
| `/contact` | 99, 98, 98, 98 | **98** | 100 | 100 | 100 | 2,1 s | 0,01 |

## axe-core (WCAG 2.2 AA + bonnes pratiques), 0 violation

`BASE_URL=http://localhost:3500 PATHS="/,/en,/opsys-ai,/en/opsys-ai,/contact,/en/contact" bun web/scripts/axe-s2.mjs`

```
OK    / @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    / @1440 : 0 violation(s), 1 à vérifier à la main, 1 h1, débordement 0px
       ? color-contrast: Elements must meet minimum color contrast ratio thresholds (7) .lg\:max-w-\[43rem\] > .font-mono.text-label.uppercase
OK    /en @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    /en @1440 : 0 violation(s), 1 à vérifier à la main, 1 h1, débordement 0px
       ? color-contrast: Elements must meet minimum color contrast ratio thresholds (7) .lg\:max-w-\[43rem\] > .font-mono.text-label.uppercase
OK    /opsys-ai @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    /opsys-ai @1440 : 0 violation(s), 1 à vérifier à la main, 1 h1, débordement 0px
       ? color-contrast: Elements must meet minimum color contrast ratio thresholds (7) .gap-2.text-accent-text.font-mono
OK    /en/opsys-ai @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    /en/opsys-ai @1440 : 0 violation(s), 1 à vérifier à la main, 1 h1, débordement 0px
       ? color-contrast: Elements must meet minimum color contrast ratio thresholds (7) .gap-2.text-accent-text.font-mono
OK    /contact @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    /contact @1440 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    /en/contact @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    /en/contact @1440 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
```

États interactifs : `bun web/scripts/axe-s3.mjs` (contact : étape 1 avec erreurs, étape 2, étape 2 avec erreurs, à 390 et 1440 px, fr et en ; sommaire mobile ouvert).

```
OK    /contact @390 étape 1 avec erreurs : 0 violation(s)
OK    /contact @390 étape 2 : 0 violation(s)
OK    /contact @390 étape 2 avec erreurs : 0 violation(s)
OK    /contact @1440 étape 1 avec erreurs : 0 violation(s)
OK    /contact @1440 étape 2 : 0 violation(s)
OK    /contact @1440 étape 2 avec erreurs : 0 violation(s)
OK    /en/contact @390 étape 1 avec erreurs : 0 violation(s)
OK    /en/contact @390 étape 2 : 0 violation(s)
OK    /en/contact @390 étape 2 avec erreurs : 0 violation(s)
OK    /en/contact @1440 étape 1 avec erreurs : 0 violation(s)
OK    /en/contact @1440 étape 2 : 0 violation(s)
OK    /en/contact @1440 étape 2 avec erreurs : 0 violation(s)
OK    /opsys-ai @390 sommaire ouvert : 0 violation(s)
OK    /en/opsys-ai @390 sommaire ouvert : 0 violation(s)
```
