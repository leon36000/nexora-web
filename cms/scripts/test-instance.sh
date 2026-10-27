#!/usr/bin/env bash
# Instance Directus jetable pour tester le schéma et les extensions sans toucher au Directus partagé.
# Même image épinglée que deploy/compose.yml, base dédiée « directus_cmstest » dans le PostgreSQL du projet « nexorasite ».
# Usage : cms/scripts/test-instance.sh up|down|reset   (aucun secret n'est affiché)
#   ENV_FILE  fichier .env source (défaut : /home/pc6/Desktop/NexoraSite/deploy/.env)
#   EXT_DIR   dossier d'extensions monté (défaut : <dépôt>/cms/extensions)
#   STUB_URL  adresse du service de l'app vue depuis le conteneur (défaut : http://host.docker.internal:3599)
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
ENV_FILE="${ENV_FILE:-/home/pc6/Desktop/NexoraSite/deploy/.env}"
EXT_DIR="${EXT_DIR:-$ROOT/cms/extensions}"
STUB_URL="${STUB_URL:-http://host.docker.internal:3599}"
NAME="nexora-cms-test"
DB="directus_cmstest"
PORT="${TEST_PORT:-8466}"
IMAGE="directus/directus:12.5.1@sha256:ef6fc027605ea659a972356e0c35fd7f88b02118b0b3a322dafbec3cc709fdab"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

psql_admin() {
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" nexorasite-db-1 psql -U nexora -d postgres -v ON_ERROR_STOP=1 -tA -c "$1"
}

down() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}

up() {
  down
  if [ "$(psql_admin "select 1 from pg_database where datname='$DB'")" != "1" ]; then
    psql_admin "create database $DB" >/dev/null
  fi
  docker run -d --name "$NAME" --network nexorasite_default \
    --add-host host.docker.internal:host-gateway \
    -p "127.0.0.1:${PORT}:8055" \
    -e SECRET="$DIRECTUS_SECRET" \
    -e DB_CLIENT=pg -e DB_HOST=db -e DB_PORT=5432 -e DB_DATABASE="$DB" -e DB_USER=nexora -e DB_PASSWORD="$POSTGRES_PASSWORD" \
    -e ADMIN_EMAIL="$DIRECTUS_ADMIN_EMAIL" -e ADMIN_PASSWORD="$DIRECTUS_ADMIN_PASSWORD" \
    -e PUBLIC_URL="http://localhost:${PORT}" -e TELEMETRY=false -e EXTENSIONS_AUTO_RELOAD=true \
    -e NEXORA_APP_INTERNAL_URL="$STUB_URL" -e NEXORA_APP_ADMIN_TOKEN="${STUB_ADMIN_TOKEN:-jeton-bouchon-de-test-0123456789abcdef}" \
    -v "$EXT_DIR:/directus/extensions" \
    "$IMAGE" >/dev/null
  for _ in $(seq 1 60); do
    if curl -fs "http://localhost:${PORT}/server/ping" >/dev/null 2>&1; then echo "instance de test prête sur http://localhost:${PORT}"; return 0; fi
    sleep 1
  done
  echo "l'instance de test ne répond pas" >&2
  docker logs --tail 20 "$NAME" >&2 || true
  return 1
}

reset() {
  down
  psql_admin "drop database if exists $DB with (force)" >/dev/null
  up
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  reset) reset ;;
  *) echo "usage : $0 up|down|reset" >&2; exit 2 ;;
esac
