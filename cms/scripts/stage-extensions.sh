#!/usr/bin/env bash
# Construit l'extension nexora-cms et copie seulement le build (package.json + dist/) dans le dossier d'extensions monté
# par Directus. Aucun code source ni node_modules n'est copié (Directus surveille tout ce dossier).
# Usage : cms/scripts/stage-extensions.sh [dossier-cible]   (défaut : cms/extensions du dépôt, monté par deploy/compose.yml)
set -euo pipefail
# Racine du dépôt : Git si disponible, sinon deux dossiers au-dessus du script (copie sans .git, par exemple sur la VM de production).
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel 2> /dev/null || (cd "$HERE/../.." && pwd))"
TARGET="${1:-$ROOT/cms/extensions}"
SRC="$ROOT/cms/extensions-src/nexora-cms"
bun install --cwd "$SRC" --frozen-lockfile >/dev/null
bun run --cwd "$SRC" build >/dev/null
mkdir -p "$TARGET/nexora-cms/dist"
cp "$SRC/package.json" "$TARGET/nexora-cms/package.json"
cp "$SRC/dist/api.js" "$SRC/dist/app.js" "$TARGET/nexora-cms/dist/"
echo "extension nexora-cms copiée dans $TARGET/nexora-cms"
