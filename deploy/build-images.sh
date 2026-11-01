#!/usr/bin/env bash
# Construit les images de la pile SUR la machine de production (amd64) : outils, worker, site.
#
#   sudo bash deploy/build-images.sh [tools|worker|site|all]        (défaut : all)
#
# Prérequis du site : PostgreSQL et Directus démarrés, migrations et `cms/scripts/apply.ts` passés (Next prérend les pages avec
# leurs données). Le site est construit avec un builder BuildKit « nexora-build » rattaché au réseau interne de la pile :
# `--network host` y désigne l'espace réseau du builder, où `db` et `directus` se résolvent, sans publier aucun port sur
# l'hôte (le builder est supprimé à la fin). Le jeton Lecteur de Directus et l'URL de la base passent en SECRETS de construction (jamais dans une couche).
# À lancer en root (lecture des fichiers de secrets 0440). Variables : NEXORA_PROD_ENV (défaut /srv/nexora/deploy/prod.env).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$(cd "$here/.." && pwd)"
envf="${NEXORA_PROD_ENV:-/srv/nexora/deploy/prod.env}"
[ "$(id -u)" = 0 ] || { echo "à lancer en root (sudo)" >&2; exit 1; }
get() { grep -E "^$1=" "$envf" | head -n1 | cut -d= -f2-; }
site_url="$(get SITE_URL)"; site_env="$(get SITE_ENV)"; tag="$(get NEXORA_IMAGE_TAG)"; tag="${tag:-local}"
secrets_dir="$(get NEXORA_SECRETS_DIR)"
[ -n "$site_url" ] || { echo "SITE_URL absent de $envf" >&2; exit 1; }
what="${1:-all}"
cd "$src"

if [ "$what" = tools ] || [ "$what" = all ]; then
  docker build -f deploy/Dockerfile.web --target tools --build-arg "SITE_URL=$site_url" -t "nexora/site-tools:$tag" .
fi
if [ "$what" = worker ] || [ "$what" = all ]; then
  docker build -f deploy/Dockerfile.worker --target worker -t "nexora/worker:$tag" .
fi
if [ "$what" = site ] || [ "$what" = all ]; then
  builder=nexora-build
  # Le builder est un conteneur PRIVILÉGIÉ rattaché au réseau interne (accès à la base) : il n'existe que le temps de la
  # construction. `--keep-state` garde le cache de construction (volume) pour les suivantes.
  trap 'docker buildx rm --keep-state "$builder" > /dev/null 2>&1 || true' EXIT
  if ! docker buildx inspect "$builder" > /dev/null 2>&1; then
    docker buildx create --name "$builder" --driver docker-container --driver-opt network=nexora-internal \
      --buildkitd-flags '--allow-insecure-entitlement network.host' > /dev/null
  fi
  docker buildx inspect --bootstrap "$builder" > /dev/null
  # Le builder a besoin d'Internet (dépendances) EN PLUS du réseau interne : on le rattache aussi au pont par défaut.
  cname="buildx_buildkit_${builder}0"
  docker inspect -f '{{json .NetworkSettings.Networks}}' "$cname" | grep -q '"bridge"' || docker network connect bridge "$cname"
  docker buildx build --builder "$builder" --allow network.host --network host --load \
    --secret "id=directus_reader_token,src=$secrets_dir/directus_reader_token" \
    --secret "id=app_database_url,src=$secrets_dir/app_database_url" \
    --build-arg "SITE_URL=$site_url" --build-arg "SITE_ENV=$site_env" --build-arg "BUILD_DIRECTUS_URL=http://directus:8055" \
    -f deploy/Dockerfile.web --target site -t "nexora/site:$tag" .
fi
echo "images construites ($what) : étiquette $tag"
