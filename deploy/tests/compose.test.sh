#!/usr/bin/env bash
# Tests du durcissement de la pile : deploy/compose.yml (développement) et deploy/compose.prod.yml (production).
# Lecture seule : `docker compose config` résout les fichiers sans rien démarrer ; jq lit le résultat.
# Usage : bash deploy/tests/compose.test.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy="$(cd "$here/.." && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0
fail=0
ok() { pass=$((pass + 1)); echo "  ok    $1"; }
ko() { fail=$((fail + 1)); echo "  ECHEC $1"; }

if ! command -v docker > /dev/null 2>&1 || ! docker compose version > /dev/null 2>&1 || ! command -v jq > /dev/null 2>&1; then
  echo "  (Docker Compose ou jq absent : tests sautés)"
  exit 0
fi

mkdir -p "$work/d" "$work/home" "$work/secrets"
cp "$deploy/init-env.sh" "$work/d/init-env.sh"
HOME="$work/home" bash "$work/d/init-env.sh" > /dev/null 2>&1
dev="$work/d/.env"
base="$deploy/compose.yml"
prod="$deploy/compose.prod.yml"

# environnement de production d'essai : des CHEMINS de secrets, jamais de secret
for n in postgres_password directus_db_password litellm_db_password umami_db_password directus_secret directus_admin_password nexora_app_admin_token litellm_master_key litellm_salt_key; do
  printf '%s' "valeur-secrete-$n" > "$work/secrets/$n"
done
cat > "$work/prod.env" << ENV
POSTGRES_PASSWORD_FILE=$work/secrets/postgres_password
DIRECTUS_DB_PASSWORD_FILE=$work/secrets/directus_db_password
LITELLM_DB_PASSWORD_FILE=$work/secrets/litellm_db_password
UMAMI_DB_PASSWORD_FILE=$work/secrets/umami_db_password
DIRECTUS_SECRET_FILE=$work/secrets/directus_secret
DIRECTUS_ADMIN_PASSWORD_FILE=$work/secrets/directus_admin_password
NEXORA_APP_ADMIN_TOKEN_FILE=$work/secrets/nexora_app_admin_token
LITELLM_MASTER_KEY_FILE=$work/secrets/litellm_master_key
LITELLM_SALT_KEY_FILE=$work/secrets/litellm_salt_key
DIRECTUS_ADMIN_EMAIL=admin@exemple.test
DIRECTUS_PUBLIC_URL=https://cms.exemple.test
DIRECTUS_CORS_ORIGIN=https://cms.exemple.test
NEXORA_APP_INTERNAL_URL=http://site:3500
ENV

devcfg() { docker compose -p essai -f "$base" --env-file "$dev" config --format json 2> "$work/err"; }
prodcfg() { docker compose -p essai -f "$base" -f "$prod" --env-file "$work/prod.env" config --format json 2> "$work/err"; }
j() { jq -r "$1" <<< "$cfg"; }

echo "compose.yml : durcissement de Directus"
cfg=$(devcfg) && ok "configuration valide" || ko "configuration invalide : $(head -c 300 "$work/err")"
env_is() { [ "$(j ".services.directus.environment.$1")" = "$2" ] && ok "$1 = $2" || ko "$1 = $(j ".services.directus.environment.$1") (attendu $2)"; }
env_is RATE_LIMITER_ENABLED true
env_is RATE_LIMITER_STORE memory
env_is RATE_LIMITER_GLOBAL_ENABLED true
env_is RATE_LIMITER_EMAIL_ENABLED true
env_is ACCESS_TOKEN_TTL 15m
env_is REFRESH_TOKEN_TTL 1d
env_is SESSION_COOKIE_SAME_SITE Strict
env_is REFRESH_TOKEN_COOKIE_SAME_SITE Strict
env_is GRAPHQL_INTROSPECTION false
env_is HSTS_ENABLED true
env_is TELEMETRY false
env_is SESSION_COOKIE_SECURE false
env_is REFRESH_TOKEN_COOKIE_SECURE false
env_is IP_TRUST_PROXY false
env_is PASSWORD_RESET_URL_ALLOW_LIST http://localhost:8456/admin/reset-password
list=$(j '.services.directus.environment.IMPORT_IP_DENY_LIST')
for r in 0.0.0.0 127.0.0.0/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 ::1/128 fc00::/7; do
  [[ ",$list," == *",$r,"* ]] && ok "IMPORT_IP_DENY_LIST refuse $r" || ko "IMPORT_IP_DENY_LIST n'a pas $r"
done
mimes=$(j '.services.directus.environment.FILES_MIME_TYPE_ALLOW_LIST')
case "$mimes" in *"*"* | *svg* | *html* | *javascript*) ko "FILES_MIME_TYPE_ALLOW_LIST trop large : $mimes" ;; *) ok "FILES_MIME_TYPE_ALLOW_LIST limitée ($mimes)" ;; esac
[[ "$mimes" == *application/pdf* && "$mimes" == *image/png* ]] && ok "rasters et PDF autorisés" || ko "rasters ou PDF manquants"
[ "$(j '.services.directus.environment.FILES_MAX_UPLOAD_SIZE')" != "null" ] && ok "FILES_MAX_UPLOAD_SIZE posé" || ko "FILES_MAX_UPLOAD_SIZE absent"
img=$(j '.services.directus.environment.CONTENT_SECURITY_POLICY_DIRECTIVES__IMG_SRC')
con=$(j '.services.directus.environment.CONTENT_SECURITY_POLICY_DIRECTIVES__CONNECT_SRC')
fon=$(j '.services.directus.environment.CONTENT_SECURITY_POLICY_DIRECTIVES__FONT_SRC')
sty=$(j '.services.directus.environment.CONTENT_SECURITY_POLICY_DIRECTIVES__STYLE_SRC')
for v in "$img" "$con" "$fon" "$sty"; do
  case "$v" in *http* | *"*"*) ko "CSP : source tierce ou joker dans « $v »" ;; "null") ko "CSP : directive absente" ;; *) ok "CSP sans origine tierce : $v" ;; esac
done
cfg=$(DIRECTUS_COOKIE_SECURE=true DIRECTUS_PUBLIC_URL=https://cms.exemple.test DIRECTUS_TRUST_PROXY=uniquelocal docker compose -p essai -f "$base" --env-file "$dev" config --format json 2> /dev/null)
env_is SESSION_COOKIE_SECURE true
env_is REFRESH_TOKEN_COOKIE_SECURE true
env_is IP_TRUST_PROXY uniquelocal
env_is PASSWORD_RESET_URL_ALLOW_LIST https://cms.exemple.test/admin/reset-password

echo
echo "compose.yml : durcissement des conteneurs"
cfg=$(devcfg)
for svc in db directus litellm; do
  [ "$(j ".services.$svc.security_opt | index(\"no-new-privileges:true\") != null")" = true ] && ok "$svc : no-new-privileges" || ko "$svc : no-new-privileges absent"
  [ "$(j ".services.$svc.cap_drop | index(\"ALL\") != null")" = true ] && ok "$svc : cap_drop ALL" || ko "$svc : cap_drop ALL absent"
  [ "$(j ".services.$svc.mem_limit")" != "null" ] && ok "$svc : mem_limit" || ko "$svc : mem_limit absent"
  [ "$(j ".services.$svc.pids_limit")" != "null" ] && ok "$svc : pids_limit" || ko "$svc : pids_limit absent"
  [ "$(j ".services.$svc.privileged")" = "null" ] && ok "$svc : pas de mode privilégié" || ko "$svc : mode privilégié"
done
caps=$(j '.services.db.cap_add | sort | join(" ")')
[ "$caps" = "CHOWN DAC_OVERRIDE FOWNER SETGID SETUID" ] && ok "db : capacités limitées à l'initialisation du volume ($caps)" || ko "db : capacités inattendues ($caps)"
[ "$(j '.services.directus.cap_add')" = "null" ] && [ "$(j '.services.litellm.cap_add')" = "null" ] && ok "directus et litellm : aucune capacité ajoutée" || ko "capacité ajoutée à directus ou litellm"
for svc in directus litellm; do
  u=$(j ".services.$svc.user")
  case "$u" in "" | null | 0 | 0:* | root*) ko "$svc : exécuté en root ($u)" ;; *) ok "$svc : utilisateur non root ($u)" ;; esac
  [ "$(j ".services.$svc.read_only")" = true ] && ok "$svc : système de fichiers en lecture seule" || ko "$svc : read_only absent"
  [ "$(j ".services.$svc.tmpfs | length")" -ge 1 ] && ok "$svc : tmpfs pour les écritures nécessaires" || ko "$svc : aucun tmpfs"
  [ "$(j ".services.$svc.healthcheck.test | length")" -ge 2 ] && ok "$svc : healthcheck" || ko "$svc : healthcheck absent"
done
[ "$(j '.services.db.healthcheck.test | length')" -ge 2 ] && ok "db : healthcheck" || ko "db : healthcheck absent"

echo
echo "compose.prod.yml : réseau, ports, secrets"
cfg=$(prodcfg) && ok "configuration de production valide" || ko "configuration de production invalide : $(head -c 300 "$work/err")"
[ "$(j '.services.db.ports')" = "null" ] && ok "PostgreSQL ne publie aucun port" || ko "PostgreSQL publie des ports"
[ "$(j '.services.litellm.ports')" = "null" ] && ok "LiteLLM ne publie aucun port" || ko "LiteLLM publie des ports"
[ "$(j '[.services.directus.ports[].host_ip] | unique | join(",")')" = "127.0.0.1" ] && ok "Directus : boucle locale seulement" || ko "Directus publié sur une autre interface"
[ "$(j '.networks.internal.internal')" = true ] && ok "le réseau interne est « internal: true »" || ko "le réseau interne n'est pas internal"
[ "$(j '.networks.internal.name')" = "nexora-internal" ] && ok "réseau nommé nexora-internal (le site et le worker le rejoignent)" || ko "nom du réseau interne inattendu"
[ "$(j '.networks.egress.internal')" = "null" ] && ok "le réseau de sortie existe sans être interne" || ko "réseau de sortie inattendu"
[ "$(j '.services.db.networks | keys | join(",")')" = "internal" ] && ok "PostgreSQL : réseau interne seulement (aucune sortie)" || ko "PostgreSQL a une sortie réseau"
for svc in directus litellm; do
  [ "$(j ".services.$svc.networks | keys | join(\",\")")" = "egress,internal" ] && ok "$svc : réseaux interne et de sortie" || ko "$svc : réseaux inattendus"
done
[ "$(j '.services | has("mailpit") or has("stripe-mock")')" = false ] && ok "Mailpit et stripe-mock ne démarrent pas en production" || ko "un service de développement démarre en production"
for k in SECRET DB_PASSWORD ADMIN_PASSWORD NEXORA_APP_ADMIN_TOKEN; do
  [ "$(j ".services.directus.environment.$k")" = "null" ] && ok "directus : $k absent de l'environnement" || ko "directus : $k en clair dans l'environnement"
done
for k in SECRET_FILE DB_PASSWORD_FILE ADMIN_PASSWORD_FILE; do
  v=$(j ".services.directus.environment.$k")
  [[ "$v" == /run/secrets/* ]] && ok "directus : $k = $v" || ko "directus : $k inattendu ($v)"
done
for k in LITELLM_MASTER_KEY LITELLM_SALT_KEY DATABASE_URL; do
  [ "$(j ".services.litellm.environment.$k")" = "null" ] && ok "litellm : $k absent de l'environnement" || ko "litellm : $k en clair dans l'environnement"
done
for k in POSTGRES_PASSWORD DIRECTUS_DB_PASSWORD LITELLM_DB_PASSWORD UMAMI_DB_PASSWORD; do
  [ "$(j ".services.db.environment.$k")" = "null" ] && [ "$(j ".services.db.environment.${k}_FILE")" != "null" ] && ok "db : $k lu dans un fichier (${k}_FILE)" || ko "db : $k en clair"
done
grep -q 'valeur-secrete' <<< "$cfg" && ko "la valeur d'un secret apparaît dans la configuration résolue" || ok "aucune valeur de secret dans la configuration résolue (seulement des chemins)"
n=$(j '[.secrets[].file] | length')
[ "$n" -eq 9 ] && ok "9 secrets Docker déclarés" || ko "$n secrets Docker (attendu 9)"
[ "$(j '.services.directus.environment.SESSION_COOKIE_SECURE')" = true ] && [ "$(j '.services.directus.environment.REFRESH_TOKEN_COOKIE_SECURE')" = true ] && ok "témoins Directus « Secure » par défaut en production" || ko "témoins non Secure en production"
[ "$(j '.services.directus.environment.IP_TRUST_PROXY')" = "uniquelocal" ] && ok "IP_TRUST_PROXY = uniquelocal (proxy HTTPS de l'hôte)" || ko "IP_TRUST_PROXY inattendu"
[ "$(j '.services.directus.environment.PUBLIC_URL')" = "https://cms.exemple.test" ] && ok "PUBLIC_URL https posée" || ko "PUBLIC_URL inattendue"
[ "$(j '.services.directus.volumes[] | select(.target=="/directus/extensions") | .read_only')" = true ] && ok "extensions montées en lecture seule" || ko "extensions en écriture"
[ "$(j '.services.directus.extra_hosts')" = "null" ] && [ "$(j '.services.litellm.extra_hosts')" = "null" ] && ok "host.docker.internal retiré" || ko "host.docker.internal subsiste"
for k in RATE_LIMITER_ENABLED GRAPHQL_INTROSPECTION FILES_MIME_TYPE_ALLOW_LIST IMPORT_IP_DENY_LIST HSTS_ENABLED SESSION_COOKIE_SAME_SITE; do
  a=$(devcfg | jq -r ".services.directus.environment.$k")
  [ "$(j ".services.directus.environment.$k")" = "$a" ] && ok "production : $k identique au développement" || ko "production : $k diffère du développement"
done
for var in DIRECTUS_PUBLIC_URL POSTGRES_PASSWORD_FILE DIRECTUS_SECRET_FILE; do
  grep -v "^$var=" "$work/prod.env" > "$work/prod-sans.env"
  docker compose -p essai -f "$base" -f "$prod" --env-file "$work/prod-sans.env" config > /dev/null 2>&1 && ko "la production accepte l'absence de $var" || ok "la production refuse l'absence de $var"
done

echo
echo ".env.example : les réglages de durcissement sont documentés"
for k in DIRECTUS_COOKIE_SECURE DIRECTUS_TRUST_PROXY DIRECTUS_MAX_UPLOAD_SIZE CMS_ENFORCE_TFA NEXORA_DB_MEM_LIMIT POSTGRES_PASSWORD_FILE NEXORA_APP_ADMIN_TOKEN_FILE; do
  grep -qE "^#? ?$k=" "$deploy/.env.example" && ok "$k" || ko "$k absent de .env.example"
done

echo
echo "$pass réussis, $fail échecs"
[ "$fail" -eq 0 ]
