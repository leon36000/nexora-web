# Lighthouse mobile et axe — S2

Commande : lighthouse@12.8.2 (CHROME_PATH = Chromium de Playwright), --form-factor=mobile, site `next start` sur :3500, contenu lu dans Directus.

- home-fr : {'performance': 98, 'accessibility': 100, 'best-practices': 100, 'seo': 100} ; LCP 2.3 s, TBT 40 ms, CLS 0.01
- opsys-fr : {'performance': 98, 'accessibility': 100, 'best-practices': 100, 'seo': 100} ; LCP 2.3 s, TBT 40 ms, CLS 0
OK    / @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    / @1440 : 0 violation(s), 1 à vérifier à la main, 1 h1, débordement 0px
       ? color-contrast: Elements must meet minimum color contrast ratio thresholds (12) .lg\:max-w-\[43rem\] > .font-mono.text-label.uppercase
OK    /en @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    /en @1440 : 0 violation(s), 1 à vérifier à la main, 1 h1, débordement 0px
       ? color-contrast: Elements must meet minimum color contrast ratio thresholds (7) .lg\:max-w-\[43rem\] > .font-mono.text-label.uppercase
OK    /opsys-ai @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    /opsys-ai @1440 : 0 violation(s), 1 à vérifier à la main, 1 h1, débordement 0px
       ? color-contrast: Elements must meet minimum color contrast ratio thresholds (12) .lg\:max-w-\[43rem\] > .font-mono.text-label.uppercase
OK    /en/opsys-ai @390 : 0 violation(s), 0 à vérifier à la main, 1 h1, débordement 0px
OK    /en/opsys-ai @1440 : 0 violation(s), 1 à vérifier à la main, 1 h1, débordement 0px
       ? color-contrast: Elements must meet minimum color contrast ratio thresholds (12) .lg\:max-w-\[43rem\] > .font-mono.text-label.uppercase

