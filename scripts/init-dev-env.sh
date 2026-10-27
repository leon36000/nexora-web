#!/usr/bin/env bash
# Génère .env (racine, pour les tests, les migrations et le worker) et web/.env.local (Next.js)
# à partir de deploy/.env de la pile de développement. N'affiche aucune valeur.
# Usage : scripts/init-dev-env.sh [chemin/vers/deploy/.env]
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${1:-$root/deploy/.env}"
[ -f "$src" ] || { echo "Fichier introuvable : $src" >&2; exit 1; }

get() { { grep -E "^$1=" "$src" || true; } | head -n1 | cut -d= -f2-; }
for k in POSTGRES_PASSWORD NEXORA_APP_ADMIN_TOKEN NEXORA_VAULT_MASTER_KEY; do
  [ -n "$(get "$k")" ] || { echo "Variable manquante dans $src : $k" >&2; exit 1; }
done
# Jetons Directus (créés par cms/scripts/apply.ts) : facultatifs ici, requis pour que le site lise le contenu.
directus_reader="$(get DIRECTUS_READER_TOKEN)"
directus_publisher="$(get DIRECTUS_PUBLISHER_TOKEN)"
# Secret des liens d'aperçu : valeur fournie, sinon dérivée de façon stable (développement seulement).
preview_secret="$(get NEXORA_PREVIEW_SECRET)"
if [ -z "$preview_secret" ]; then
  preview_secret="$(printf 'nexora-preview-dev' | openssl dgst -sha256 -hmac "$(get NEXORA_APP_ADMIN_TOKEN)" | awk '{print $NF}')"
fi

umask 077
{
  echo "DATABASE_URL=postgres://nexora:$(get POSTGRES_PASSWORD)@127.0.0.1:15440/app"
  echo "NEXORA_APP_ADMIN_TOKEN=$(get NEXORA_APP_ADMIN_TOKEN)"
  echo "NEXORA_VAULT_MASTER_KEY=$(get NEXORA_VAULT_MASTER_KEY)"
  echo "DIRECTUS_URL=${DIRECTUS_URL:-http://localhost:8456}"
  [ -z "$directus_reader" ] || echo "DIRECTUS_READER_TOKEN=$directus_reader"
  [ -z "$directus_publisher" ] || echo "DIRECTUS_PUBLISHER_TOKEN=$directus_publisher"
  echo "NEXORA_PREVIEW_SECRET=$preview_secret"
} > "$root/.env"
cp "$root/.env" "$root/web/.env.local"
echo "Écrit : .env et web/.env.local (variables : DATABASE_URL, NEXORA_APP_ADMIN_TOKEN, NEXORA_VAULT_MASTER_KEY, DIRECTUS_URL, DIRECTUS_READER_TOKEN, DIRECTUS_PUBLISHER_TOKEN, NEXORA_PREVIEW_SECRET)"
