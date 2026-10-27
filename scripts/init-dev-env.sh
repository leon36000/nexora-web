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

# Secret de Better Auth (S4) : repris de deploy/.env s'il y est, sinon du .env local déjà écrit
# (les sessions survivent à une réexécution), sinon généré une fois.
auth_secret="$(get BETTER_AUTH_SECRET)"
if [ -z "$auth_secret" ] && [ -f "$root/.env" ]; then
  auth_secret="$({ grep -E '^BETTER_AUTH_SECRET=' "$root/.env" || true; } | head -n1 | cut -d= -f2-)"
fi
[ -n "$auth_secret" ] || auth_secret="$(openssl rand -hex 32)"

umask 077
{
  echo "DATABASE_URL=postgres://nexora:$(get POSTGRES_PASSWORD)@127.0.0.1:15440/app"
  echo "NEXORA_APP_ADMIN_TOKEN=$(get NEXORA_APP_ADMIN_TOKEN)"
  echo "NEXORA_VAULT_MASTER_KEY=$(get NEXORA_VAULT_MASTER_KEY)"
  echo "DIRECTUS_URL=${DIRECTUS_URL:-http://localhost:8456}"
  [ -z "$directus_reader" ] || echo "DIRECTUS_READER_TOKEN=$directus_reader"
  [ -z "$directus_publisher" ] || echo "DIRECTUS_PUBLISHER_TOKEN=$directus_publisher"
  echo "NEXORA_PREVIEW_SECRET=$preview_secret"
  echo "BETTER_AUTH_SECRET=$auth_secret"
  # Paiements en développement : stripe-mock (aucune clé réelle, aucun paiement réel). Les vraies
  # clés de TEST se collent dans le Coffre (stripe.secret_key, stripe.webhook_secret), jamais ici.
  echo "STRIPE_SECRET_KEY=sk_test_stripemocklocal0123456789"
  echo "STRIPE_WEBHOOK_SECRET=whsec_local_dev_only_not_a_real_secret"
  echo "STRIPE_API_BASE_URL=http://127.0.0.1:12111"
} > "$root/.env"
cp "$root/.env" "$root/web/.env.local"
echo "Écrit : .env et web/.env.local (variables : DATABASE_URL, NEXORA_APP_ADMIN_TOKEN, NEXORA_VAULT_MASTER_KEY, DIRECTUS_*, NEXORA_PREVIEW_SECRET, BETTER_AUTH_SECRET, STRIPE_* de stripe-mock)"
