#!/usr/bin/env bash
# Construit l'extension nexora-cms et copie seulement le build (package.json + dist/) dans le dossier d'extensions monté
# par Directus. Aucun code source ni node_modules n'est copié (Directus surveille tout ce dossier).
# Usage : cms/scripts/stage-extensions.sh [dossier-cible]   (défaut : le dossier monté par le Directus partagé)
set -euo pipefail
ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
TARGET="${1:-/home/pc6/Desktop/NexoraSite/cms/extensions}"
SRC="$ROOT/cms/extensions/nexora-cms"
bun install --cwd "$SRC" --frozen-lockfile >/dev/null
bun run --cwd "$SRC" build >/dev/null
mkdir -p "$TARGET/nexora-cms/dist"
cp "$SRC/package.json" "$TARGET/nexora-cms/package.json"
cp "$SRC/dist/api.js" "$SRC/dist/app.js" "$TARGET/nexora-cms/dist/"
echo "extension nexora-cms copiée dans $TARGET/nexora-cms"
