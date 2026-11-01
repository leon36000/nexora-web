#!/usr/bin/env bash
# Raccourci d'exploitation de la pile de PRODUCTION : docker compose avec les trois fichiers, le fichier d'environnement
# de production et les profils voulus.
#
#   bash deploy/pile.sh up -d --build        démarre (et construit les images du site et du worker)
#   bash deploy/pile.sh ps                   état et santé
#   bash deploy/pile.sh logs -f site         journaux
#   bash deploy/pile.sh run --rm tools <cmd> outils (migrations, scripts Directus, tests)
#   bash deploy/pile.sh down                 arrête (sans -v : les volumes restent)
#
# Variables : NEXORA_PROD_ENV (défaut /srv/nexora/deploy/prod.env). Profils : NEXORA_PROFILES dans ce fichier
# (par exemple « webpilot-browser mail-provisoire »), « outils » s'ajoute pour `run … tools`.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
envf="${NEXORA_PROD_ENV:-/srv/nexora/deploy/prod.env}"
[ -r "$envf" ] || { echo "fichier d'environnement illisible : $envf (NEXORA_PROD_ENV)" >&2; exit 1; }
profiles=()
for p in $(grep -E '^NEXORA_PROFILES=' "$envf" | head -n1 | cut -d= -f2- | tr -d "\"'"); do profiles+=(--profile "$p"); done
for a in "$@"; do
  if [ "$a" = tools ]; then profiles+=(--profile outils); fi
done
exec docker compose -p nexorasite \
  -f "$here/compose.yml" -f "$here/compose.prod.yml" -f "$here/compose.site.yml" \
  --env-file "$envf" "${profiles[@]}" "$@"
