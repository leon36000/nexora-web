#!/usr/bin/env bash
# Copie l'extension Directus « nexora-cms » (Coffre, Modèles, VPS, Agents…), construite dans l'image outils, vers le dossier
# cms/extensions du dépôt de la machine de production (monté en lecture seule dans Directus), puis redémarre Directus.
#
#   bash deploy/prod-stage-extension.sh            (après `sudo bash deploy/build-images.sh tools`)
#
# Équivalent de cms/scripts/stage-extensions.sh, sans Git ni Bun sur l'hôte.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$(cd "$here/.." && pwd)"
tag="$(grep -E '^NEXORA_IMAGE_TAG=' "${NEXORA_PROD_ENV:-/srv/nexora/deploy/prod.env}" | head -n1 | cut -d= -f2-)"
image="nexora/site-tools:${tag:-local}"
target="$src/cms/extensions/nexora-cms"
id="$(docker create "$image")"
trap 'docker rm -f "$id" > /dev/null' EXIT
mkdir -p "$target/dist"
docker cp "$id:/app/cms/extensions-src/nexora-cms/package.json" "$target/package.json"
docker cp "$id:/app/cms/extensions-src/nexora-cms/dist/api.js" "$target/dist/api.js"
docker cp "$id:/app/cms/extensions-src/nexora-cms/dist/app.js" "$target/dist/app.js"
echo "extension nexora-cms copiée dans $target"
bash "$here/pile.sh" restart directus
