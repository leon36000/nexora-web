#!/usr/bin/env bash
# Tests du complément de production deploy/compose.site.yml (site, worker, proxy frontal, outils), des Dockerfiles et de
# l'entrypoint à secrets. Lecture seule : `docker compose config` résout les fichiers sans rien démarrer ; jq lit le résultat.
# Usage : bash deploy/tests/site.test.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy="$(cd "$here/.." && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0
fail=0
ok() { pass=$((pass + 1)); echo "  ok    $1"; }
ko() { fail=$((fail + 1)); echo "  ECHEC $1"; }

echo "deploy/docker/entrypoint.sh : secrets lus dans des fichiers"
ep="$deploy/docker/entrypoint.sh"
printf '%s' 'valeur-un' > "$work/un"
printf '%s' 'valeur-deux' > "$work/deux"
out=$(NEXORA_FILE_ENV="A_UN B_DEUX" A_UN_FILE="$work/un" B_DEUX_FILE="$work/deux" sh "$ep" sh -c 'printf "%s|%s|%s" "$A_UN" "$B_DEUX" "${A_UN_FILE:-absent}"')
[ "$out" = "valeur-un|valeur-deux|absent" ] && ok "la valeur du fichier devient la variable, NOM_FILE disparaît" || ko "lecture des secrets : $out"
NEXORA_FILE_ENV="A_UN" A_UN=clair A_UN_FILE="$work/un" sh "$ep" true > /dev/null 2>&1
[ "$?" = 64 ] && ok "un secret défini en clair est refusé (visible par docker inspect)" || ko "un secret en clair est accepté"
NEXORA_FILE_ENV="A_UN" sh "$ep" true > /dev/null 2>&1
[ "$?" = 64 ] && ok "NOM_FILE manquant : refus" || ko "NOM_FILE manquant accepté"
NEXORA_FILE_ENV="A_UN" A_UN_FILE="$work/inexistant" sh "$ep" true > /dev/null 2>&1
[ "$?" = 66 ] && ok "fichier illisible : refus" || ko "fichier illisible accepté"
NEXORA_FILE_ENV="a;rm" sh "$ep" true > /dev/null 2>&1
[ "$?" = 64 ] && ok "nom de variable invalide : refus" || ko "nom de variable invalide accepté"
NEXORA_FILE_ENV="" sh "$ep" sh -c 'exit 7'
[ "$?" = 7 ] && ok "sans variable à charger, la commande est lancée telle quelle (code de retour conservé)" || ko "code de retour perdu"

echo
echo "Dockerfiles : images de base épinglées, aucun secret"
for f in Dockerfile.web Dockerfile.worker; do
  grep -E '^ARG (NODE_IMAGE|NODE_SLIM_IMAGE|BUN_IMAGE)=' "$deploy/$f" | grep -vqE '@sha256:[0-9a-f]{64}$' && ko "$f : image de base sans empreinte" || ok "$f : images de base épinglées par empreinte"
  grep -qiE ':latest|^FROM [a-z./-]+$' "$deploy/$f" && ko "$f : étiquette latest ou image sans version" || ok "$f : pas de latest"
  grep -qE 'bun install --frozen-lockfile' "$deploy/$f" && ok "$f : bun install --frozen-lockfile" || ko "$f : installation non figée"
  grep -qE '^USER node' "$deploy/$f" && ok "$f : exécution sous l'utilisateur non privilégié « node »" || ko "$f : exécution en root"
  grep -qE '^ARG .*(KEY|SECRET|TOKEN|PASSWORD)' "$deploy/$f" && ko "$f : un secret passe en argument de construction" || ok "$f : aucun secret en argument de construction"
done
grep -qE '^ARG LYCHEE_VERSION=[0-9.]+$' "$deploy/Dockerfile.worker" && grep -qE '^ARG LYCHEE_SHA256=[0-9a-f]{64}$' "$deploy/Dockerfile.worker" && grep -q 'sha256sum -c' "$deploy/Dockerfile.worker" && ok "Dockerfile.worker : lychee épinglé (version) et vérifié par SHA-256" || ko "Dockerfile.worker : lychee non vérifié"
grep -q 'CHROME_PATH=' "$deploy/Dockerfile.worker" && grep -q 'LYCHEE_BIN=' "$deploy/Dockerfile.worker" && grep -q 'playwright/cli.js install --with-deps chromium' "$deploy/Dockerfile.worker" && ok "Dockerfile.worker : Chromium (Playwright du bun.lock), CHROME_PATH et LYCHEE_BIN posés" || ko "Dockerfile.worker : audits SEO incomplets"

if ! command -v docker > /dev/null 2>&1 || ! docker compose version > /dev/null 2>&1 || ! command -v jq > /dev/null 2>&1; then
  echo "  (Docker Compose ou jq absent : tests de configuration sautés)"
  echo; echo "$pass réussis, $fail échecs"; [ "$fail" -eq 0 ]; exit
fi

mkdir -p "$work/secrets"
for n in postgres_password directus_db_password litellm_db_password umami_db_password directus_secret directus_admin_password \
  nexora_app_admin_token litellm_master_key litellm_salt_key deepinfra_api_key openrouter_api_key app_database_url \
  nexora_vault_master_key better_auth_secret directus_reader_token directus_publisher_token directus_admin_token \
  nexora_preview_secret webpilot_browser_secret nexora_creative_service_token; do
  printf '%s' "valeur-secrete-$n" > "$work/secrets/$n"
done
cat > "$work/prod.env" << ENV
SITE_URL=https://pile.exemple.test
SITE_ENV=
DIRECTUS_PUBLIC_URL=https://pile.exemple.test:8443
DIRECTUS_CORS_ORIGIN=https://pile.exemple.test:8443
NEXORA_APP_INTERNAL_URL=http://site:3500
DIRECTUS_ADMIN_EMAIL=admin@exemple.test
NEXORA_SECRETS_DIR=$work/secrets
NEXORA_SECRETS_GID=2001
POSTGRES_PASSWORD_FILE=$work/secrets/postgres_password
DIRECTUS_DB_PASSWORD_FILE=$work/secrets/directus_db_password
LITELLM_DB_PASSWORD_FILE=$work/secrets/litellm_db_password
UMAMI_DB_PASSWORD_FILE=$work/secrets/umami_db_password
DIRECTUS_SECRET_FILE=$work/secrets/directus_secret
DIRECTUS_ADMIN_PASSWORD_FILE=$work/secrets/directus_admin_password
NEXORA_APP_ADMIN_TOKEN_FILE=$work/secrets/nexora_app_admin_token
LITELLM_MASTER_KEY_FILE=$work/secrets/litellm_master_key
LITELLM_SALT_KEY_FILE=$work/secrets/litellm_salt_key
DEEPINFRA_API_KEY_FILE=$work/secrets/deepinfra_api_key
OPENROUTER_API_KEY_FILE=$work/secrets/openrouter_api_key
DIRECTUS_EMAIL_FROM=no-reply@exemple.test
DIRECTUS_SMTP_HOST=mailpit
DIRECTUS_SMTP_PORT=1025
SITE_SMTP_URL=smtp://mailpit:1025
MAIL_FROM=no-reply@exemple.test
WORKER_SMTP_HOST=mailpit
WORKER_SMTP_PORT=1025
CONTACT_NOTIFY_TO=equipe@exemple.test
NEXORA_SECRET_HOSTS_CREATIVE=192.168.1.122
ENV
files=(-f "$deploy/compose.yml" -f "$deploy/compose.prod.yml" -f "$deploy/compose.site.yml")
cfg=$(docker compose -p essai "${files[@]}" --env-file "$work/prod.env" --profile mail-provisoire --profile webpilot-browser --profile outils config --format json 2> "$work/err") \
  && ok "configuration de production complète valide (site, worker, front, mailpit, navigateur, outils)" || { ko "configuration invalide : $(head -c 300 "$work/err")"; echo "$pass réussis, $fail échecs"; exit 1; }
j() { jq -r "$1" <<< "$cfg"; }

echo
echo "compose.site.yml : réseaux et ports"
for s in site worker; do
  [ "$(j ".services.$s.networks | has(\"internal\")")" = true ] && ok "$s : sur le réseau nexora-internal" || ko "$s : hors du réseau interne"
  [ "$(j ".services.$s.networks | has(\"egress-site\")")" = true ] && [ "$(j ".services.$s.networks | has(\"egress\")")" = false ] && ok "$s : sorties par egress-site (pas par le réseau de LiteLLM et de Directus)" || ko "$s : réseau de sortie inattendu"
  [ "$(j ".services.$s.ports // [] | length")" = 0 ] && ok "$s : aucun port publié" || ko "$s : port publié"
done
[ "$(j '[.services | to_entries[] | select((.value.ports // []) | length > 0) | .key] | sort | join(",")')" = "directus,front" ] && ok "seuls front et directus publient un port" || ko "ports publiés : $(j '[.services | to_entries[] | select((.value.ports // []) | length > 0) | .key] | join(",")')"
[ "$(j '[.services.front.ports[].host_ip] | sort | join(",")')" = ",127.0.0.1" ] && ok "front : boucle locale (site) et réseau (port 80)" || ko "front : liaisons inattendues"
[ "$(j '.services["webpilot-browser"].ports // [] | length')" = 0 ] && ok "navigateur WebPilot : aucun port publié (écart n° 11 corrigé)" || ko "navigateur WebPilot publié"
[ "$(j '.services.mailpit.networks | keys | join(",")')" = "internal" ] && [ "$(j '.services.mailpit.ports // [] | length')" = 0 ] && ok "Mailpit provisoire : réseau interne seulement, aucun port" || ko "Mailpit exposé"
[ "$(j '.services.mailpit.profiles | join(",")')" = "mail-provisoire" ] && ok "Mailpit : profil mail-provisoire (absent par défaut)" || ko "profil de Mailpit inattendu"
j '.services.front.image' | grep -qE '@sha256:[0-9a-f]{64}$' && ok "front : image épinglée par empreinte" || ko "front : image non épinglée"

echo
echo "compose.site.yml : durcissement et secrets"
for s in site worker front; do
  [ "$(j ".services.$s.cap_drop | join(\",\")")" = "ALL" ] && ok "$s : aucune capacité" || ko "$s : capacités"
  [ "$(j ".services.$s.read_only")" = true ] && ok "$s : système de fichiers en lecture seule" || ko "$s : écriture permise"
  [ "$(j ".services.$s.security_opt | join(\",\")")" = "no-new-privileges:true" ] && ok "$s : no-new-privileges" || ko "$s : no-new-privileges absent"
done
for k in DATABASE_URL NEXORA_APP_ADMIN_TOKEN NEXORA_VAULT_MASTER_KEY BETTER_AUTH_SECRET DIRECTUS_READER_TOKEN DIRECTUS_PUBLISHER_TOKEN LITELLM_MASTER_KEY WEBPILOT_BROWSER_SECRET NEXORA_CREATIVE_SERVICE_TOKEN; do
  [ "$(j ".services.site.environment.$k")" = "null" ] && [ "$(j ".services.site.environment.${k}_FILE")" != "null" ] && ok "site : $k lu dans un fichier (${k}_FILE)" || ko "site : $k en clair dans l'environnement"
done
for k in DATABASE_URL NEXORA_VAULT_MASTER_KEY NEXORA_APP_ADMIN_TOKEN WEBPILOT_BROWSER_SECRET SMTP_PASSWORD; do
  [ "$(j ".services.worker.environment.$k")" = "null" ] && ok "worker : $k absent de l'environnement déclaré" || ko "worker : $k en clair"
done
grep -q 'valeur-secrete' <<< "$cfg" && ko "la valeur d'un secret apparaît dans la configuration résolue" || ok "aucune valeur de secret dans la configuration résolue (seulement des chemins)"
[ "$(j '.services.site.environment.NEXORA_SECRET_HOSTS_CREATIVE')" = "192.168.1.122" ] && [ "$(j '.services.worker.environment.NEXORA_SECRET_HOSTS_CREATIVE')" = "192.168.1.122" ] && ok "NEXORA_SECRET_HOSTS_CREATIVE identique dans le site et le worker" || ko "NEXORA_SECRET_HOSTS_CREATIVE"
for s in directus litellm site worker webpilot-browser; do
  [ "$(j ".services.\"$s\".group_add | join(\",\")")" = "2001" ] && ok "$s : groupe des secrets ajouté" || ko "$s : groupe des secrets absent"
done
[ "$(j '.services.site.environment.NODE_ENV')" = production ] && ok "site : NODE_ENV=production" || ko "site : NODE_ENV"
[ -z "$(j '.services.site.environment.SITE_ENV')" ] && ok "site : SITE_ENV vide (non indexable)" || ko "site : SITE_ENV posé"
grep -rqE 'PC1_UPSTREAM|dev/cloud-glm|:latest' "$deploy/compose.yml" "$deploy/compose.prod.yml" "$deploy/compose.site.yml" "$deploy/litellm/config.yaml" && ko "référence de développement ou étiquette latest dans les fichiers Compose" || ok "aucun PC1_UPSTREAM, dev/cloud-glm ni latest dans les fichiers de production"

for var in SITE_URL NEXORA_SECRETS_GID NEXORA_SECRETS_DIR CONTACT_NOTIFY_TO WORKER_SMTP_HOST; do
  grep -v "^$var=" "$work/prod.env" > "$work/sans.env"
  docker compose -p essai "${files[@]}" --env-file "$work/sans.env" config > /dev/null 2>&1 && ko "la production accepte l'absence de $var" || ok "la production refuse l'absence de $var"
done

echo
echo "$pass réussis, $fail échecs"
[ "$fail" -eq 0 ]
