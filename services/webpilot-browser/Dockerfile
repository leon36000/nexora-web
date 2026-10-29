# Service de navigateur de Nexora WebPilot (rendu de pages et sessions). Image officielle Playwright, épinglée par
# l'empreinte de l'index multi-architectures (amd64 et arm64) de la balise v1.64.1-noble : navigateurs et dépendances
# système y sont déjà. La version de playwright-core (package.json) DOIT être celle de la balise.
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea

FROM ${PLAYWRIGHT_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Pas de script d'installation : le navigateur vient de l'image, rien n'est téléchargé.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${PLAYWRIGHT_IMAGE}
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    HOME=/tmp \
    PORT=8700
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# Utilisateur non privilégié fourni par l'image (pwuser). Aucun secret dans l'image : il vient de l'environnement.
USER pwuser
EXPOSE 8700
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8700/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "src/main.ts"]
