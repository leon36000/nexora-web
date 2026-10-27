#!/usr/bin/env bash
# Tests de la configuration de déploiement : deploy/init-env.sh, deploy/.env.example et deploy/compose.yml.
# Sans rien démarrer : un dossier temporaire, et `docker compose config` (validation seule) si Docker est présent.
# Usage : bash deploy/tests/env.test.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy="$(cd "$here/.." && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0
fail=0
ok() { pass=$((pass + 1)); echo "  ok    $1"; }
ko() { fail=$((fail + 1)); echo "  ECHEC $1"; }

echo "deploy/init-env.sh"
mkdir -p "$work/d" "$work/home"
cp "$deploy/init-env.sh" "$work/d/init-env.sh"
HOME="$work/home" bash "$work/d/init-env.sh" > /dev/null 2>&1
envf="$work/d/.env"
[ -f "$envf" ] && ok ".env créé" || ko ".env non créé"
[ "$(stat -c %a "$envf")" = "600" ] && ok ".env en mode 0600" || ko ".env lisible par d'autres ($(stat -c %a "$envf"))"
for k in POSTGRES_PASSWORD DIRECTUS_SECRET DIRECTUS_ADMIN_PASSWORD LITELLM_MASTER_KEY LITELLM_SALT_KEY NEXORA_APP_ADMIN_TOKEN NEXORA_VAULT_MASTER_KEY BETTER_AUTH_SECRET; do
  v=$(grep -E "^$k=" "$envf" | head -n1 | cut -d= -f2-)
  if [ -n "$v" ]; then ok "$k généré"; else ko "$k absent ou vide (le site refuse de démarrer sans BETTER_AUTH_SECRET)"; fi
done
v=$(grep -E '^BETTER_AUTH_SECRET=' "$envf" | head -n1 | cut -d= -f2-)
[ "${#v}" -ge 32 ] && ok "BETTER_AUTH_SECRET d'au moins 32 caractères (${#v})" || ko "BETTER_AUTH_SECRET trop court (${#v})"
[ "$(grep -cE '^BETTER_AUTH_SECRET=' "$envf")" = 1 ] && ok "BETTER_AUTH_SECRET une seule fois" || ko "BETTER_AUTH_SECRET en double"
cp "$envf" "$work/avant"
HOME="$work/home" bash "$work/d/init-env.sh" > /dev/null 2>&1
cmp -s "$envf" "$work/avant" && ok "une deuxième exécution ne change rien" || ko "un .env existant a été modifié"

echo
echo "deploy/.env.example : les variables exigées par le guide de l'opérateur y figurent (décommentées ou non)"
for k in BETTER_AUTH_SECRET DATABASE_URL SITE_URL SITE_ENV SMTP_URL MAIL_FROM NEXORA_APP_INTERNAL_URL CMS_SNAPSHOT_DIR LITELLM_BASE_URL SMTP_REQUIRE_TLS DIRECTUS_PUBLIC_URL DIRECTUS_CORS_ORIGIN NEXORA_DB_CONTAINER NEXORA_DIRECTUS_CONTAINER; do
  if grep -qE "^#? ?$k=" "$deploy/.env.example"; then ok "$k"; else ko "$k absent de .env.example"; fi
done
if grep -qE '^SMTP_PASSWORD=' "$deploy/.env.example"; then ko "SMTP_PASSWORD (en clair) figure dans .env.example"; else ok "aucun SMTP_PASSWORD en clair (SMTP_PASSWORD_FILE seulement)"; fi

echo
echo "deploy/compose.yml"
compose="$deploy/compose.yml"
if grep -E '^\s+image:' "$compose" | grep -vq '@sha256:[0-9a-f]\{64\}'; then ko "une image n'est pas épinglée par empreinte"; else ok "toutes les images sont épinglées par empreinte"; fi
grep -qE '^\s+MARKETPLACE_REGISTRY:\s*\S+' "$compose" && ok "Directus : MARKETPLACE_REGISTRY posé (la Marketplace n'appelle plus registry.directus.io)" || ko "Directus : MARKETPLACE_REGISTRY absent (E3)"
grep -E 'MARKETPLACE_REGISTRY' "$compose" | grep -q 'directus\.io' && ko "MARKETPLACE_REGISTRY pointe vers directus.io" || ok "MARKETPLACE_REGISTRY ne vise pas directus.io"
grep -E '^\s+PUBLIC_URL:' "$compose" | grep -q 'DIRECTUS_PUBLIC_URL' && ok "PUBLIC_URL de Directus réglable (DIRECTUS_PUBLIC_URL)" || ko "PUBLIC_URL de Directus codé en dur"
grep -E '^\s+CORS_ORIGIN:' "$compose" | grep -q 'DIRECTUS_CORS_ORIGIN' && ok "CORS_ORIGIN de Directus réglable (DIRECTUS_CORS_ORIGIN)" || ko "CORS_ORIGIN de Directus codé en dur"
grep -qE '^\s+TELEMETRY:\s*"false"' "$compose" && ok "TELEMETRY=false conservé" || ko "TELEMETRY=false absent"
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
  cfg=$(docker compose -p essai -f "$compose" --env-file "$envf" config 2> "$work/cfg.err") && ok "docker compose config valide (rien n'est démarré)" || ko "docker compose config : $(head -c 200 "$work/cfg.err")"
  echo "$cfg" | grep -E '^\s+MARKETPLACE_REGISTRY:' | grep -q . && ok "MARKETPLACE_REGISTRY présent dans la configuration résolue" || ko "MARKETPLACE_REGISTRY absent de la configuration résolue"
  echo "$cfg" | grep -E '^\s+PUBLIC_URL:' | grep -q 'http://localhost:8456' && ok "PUBLIC_URL par défaut : http://localhost:8456" || ko "PUBLIC_URL par défaut inattendue"
  DIRECTUS_PUBLIC_URL=https://cms.exemple.test DIRECTUS_CORS_ORIGIN=https://cms.exemple.test docker compose -p essai -f "$compose" --env-file "$envf" config 2> /dev/null | grep -E '^\s+(PUBLIC_URL|CORS_ORIGIN):' | grep -c 'cms.exemple.test' | grep -qx 2 && ok "PUBLIC_URL et CORS_ORIGIN suivent DIRECTUS_PUBLIC_URL / DIRECTUS_CORS_ORIGIN" || ko "PUBLIC_URL / CORS_ORIGIN ne suivent pas les variables"
else
  echo "  (Docker absent : validation de compose.yml sautée)"
fi

echo
echo "$pass réussis, $fail échecs"
[ "$fail" -eq 0 ]
