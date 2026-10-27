#!/usr/bin/env bash
# Tests des rôles PostgreSQL par base (Directus, LiteLLM, Umami) : initdb/01-databases.sh, harden-db-roles.sh,
# init-env.sh et compose.yml. Sans PostgreSQL ni conteneur : un faux `psql` capte le SQL, `docker compose config`
# valide la configuration sans rien démarrer. Usage : bash deploy/tests/db-roles.test.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy="$(cd "$here/.." && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0
fail=0
ok() { pass=$((pass + 1)); echo "  ok    $1"; }
ko() { fail=$((fail + 1)); echo "  ECHEC $1"; }
has() { grep -qF -- "$2" "$1"; }

# ---------- init-env.sh : un mot de passe par base ----------
echo "deploy/init-env.sh"
mkdir -p "$work/d" "$work/home"
cp "$deploy/init-env.sh" "$work/d/init-env.sh"
HOME="$work/home" bash "$work/d/init-env.sh" > /dev/null 2>&1
envf="$work/d/.env"
pg=$(grep -E '^POSTGRES_PASSWORD=' "$envf" | cut -d= -f2-)
seen=""
for k in DIRECTUS_DB_PASSWORD LITELLM_DB_PASSWORD UMAMI_DB_PASSWORD; do
  v=$(grep -E "^$k=" "$envf" | head -n1 | cut -d= -f2-)
  if [ "${#v}" -ge 32 ]; then ok "$k généré (${#v} caractères)"; else ko "$k absent ou trop court"; fi
  if [ -n "$v" ] && [ "$v" != "$pg" ] && [[ " $seen " != *" $v "* ]]; then ok "$k distinct des autres mots de passe"; else ko "$k identique à un autre mot de passe"; fi
  seen="$seen $v"
done

echo
echo "deploy/.env.example"
for k in DIRECTUS_DB_PASSWORD LITELLM_DB_PASSWORD UMAMI_DB_PASSWORD; do
  grep -qE "^#? ?$k=" "$deploy/.env.example" && ok "$k documenté" || ko "$k absent de .env.example"
done

# ---------- initdb/01-databases.sh ----------
echo
echo "deploy/initdb/01-databases.sh (faux psql)"
mkdir -p "$work/bin"
cat > "$work/bin/psql" << 'FAKE'
#!/usr/bin/env bash
{ printf 'ARGS: %s\n' "$*"; cat; printf -- '-----\n'; } >> "$PSQL_LOG"
printf 'DIRECTUS=%s LITELLM=%s UMAMI=%s\n' "${DIRECTUS_DB_PASSWORD-}" "${LITELLM_DB_PASSWORD-}" "${UMAMI_DB_PASSWORD-}" >> "$PSQL_LOG.env"
FAKE
chmod +x "$work/bin/psql"
run_init() { # run_init LOG [VAR=valeur ...]
  local log="$1"
  shift
  : > "$log"
  env PATH="$work/bin:$PATH" PSQL_LOG="$log" POSTGRES_USER=nexora POSTGRES_DB=app EXTRA_DATABASES="directus litellm umami" "$@" bash "$deploy/initdb/01-databases.sh" < /dev/null > "$work/init.out" 2>&1
}
log="$work/psql.log"
run_init "$log" DIRECTUS_DB_PASSWORD=secret-d-1 LITELLM_DB_PASSWORD=secret-l-2 UMAMI_DB_PASSWORD=secret-u-3 \
  && ok "le script réussit quand les trois mots de passe sont fournis" || ko "le script échoue avec les trois mots de passe : $(head -c 200 "$work/init.out")"
for r in directus litellm umami; do
  has "$log" "-v role=$r" && ok "rôle $r créé" || ko "rôle $r non créé"
done
has "$log" "NOSUPERUSER" && has "$log" "NOCREATEDB" && has "$log" "NOCREATEROLE" && ok "rôles sans SUPERUSER, CREATEDB ni CREATEROLE" || ko "les rôles ne sont pas restreints"
has "$log" "NOREPLICATION" && has "$log" "NOBYPASSRLS" && ok "rôles sans REPLICATION ni BYPASSRLS" || ko "REPLICATION ou BYPASSRLS non exclus"
has "$log" "REVOKE CONNECT ON DATABASE app FROM PUBLIC" && ok "REVOKE CONNECT sur app pour PUBLIC" || ko "REVOKE CONNECT ON DATABASE app FROM PUBLIC absent"
grep -E 'CREATE DATABASE' "$log" | grep -qiE 'OWNER[^;]*(nexora|POSTGRES_USER)' && ko "une base reste détenue par le superutilisateur" || ok "aucune base supplémentaire n'est détenue par le superutilisateur"
grep -qE 'secret-[dlu]-[123]' "$log" && ko "un mot de passe apparaît dans le SQL ou les arguments de psql" || ok "aucun mot de passe dans le SQL ni dans les arguments (lu par \\getenv)"
# secrets Docker : <VAR>_FILE (production, compose.prod.yml)
printf 'depuis-fichier-d' > "$work/sd"
printf 'depuis-fichier-l' > "$work/sl"
printf 'depuis-fichier-u' > "$work/su"
rm -f "$work/psql3.log.env"
run_init "$work/psql3.log" DIRECTUS_DB_PASSWORD_FILE="$work/sd" LITELLM_DB_PASSWORD_FILE="$work/sl" UMAMI_DB_PASSWORD_FILE="$work/su" \
  && ok "le script accepte <VAR>_FILE (secrets Docker)" || ko "le script refuse <VAR>_FILE : $(head -c 200 "$work/init.out")"
grep -q 'DIRECTUS=depuis-fichier-d LITELLM=depuis-fichier-l UMAMI=depuis-fichier-u' "$work/psql3.log.env" 2> /dev/null && ok "le mot de passe lu dans le fichier parvient à psql (\\getenv)" || ko "le mot de passe du fichier n'est pas transmis à psql"
grep -qE 'depuis-fichier' "$work/psql3.log" && ko "un mot de passe lu dans un fichier apparaît dans le SQL" || ok "aucun mot de passe de fichier dans le SQL"
run_init "$work/psql2.log" DIRECTUS_DB_PASSWORD=x LITELLM_DB_PASSWORD=y && ko "le script réussit sans UMAMI_DB_PASSWORD" || ok "refus clair quand un mot de passe manque"
grep -q 'UMAMI_DB_PASSWORD' "$work/init.out" && ok "le message nomme la variable manquante" || ko "le message ne nomme pas la variable manquante"

# ---------- harden-db-roles.sh ----------
echo
echo "deploy/harden-db-roles.sh"
hard="$deploy/harden-db-roles.sh"
[ -x "$hard" ] && ok "script exécutable" || ko "harden-db-roles.sh absent ou non exécutable"
sql=$(bash "$hard" --dry-run < /dev/null 2> /dev/null)
grep -qF "NOSUPERUSER" <<< "$sql" && ok "dry-run : rôles NOSUPERUSER" || ko "dry-run : SQL sans NOSUPERUSER"
grep -qF "ALTER DATABASE" <<< "$sql" && grep -qF "OWNER TO" <<< "$sql" && ok "dry-run : propriété des bases transférée" || ko "dry-run : ALTER DATABASE … OWNER TO absent"
grep -qF "REVOKE CONNECT ON DATABASE app FROM PUBLIC" <<< "$sql" && ok "dry-run : REVOKE CONNECT sur app" || ko "dry-run : REVOKE CONNECT absent"
grep -q 'REASSIGN OWNED' <<< "$sql" && ko "REASSIGN OWNED est interdit (il déplacerait aussi la base app, objet partagé)" || ok "pas de REASSIGN OWNED (il déplacerait la base app)"
grep -qF 'ALTER TABLE' <<< "$sql" && grep -qF 'ALTER SEQUENCE' <<< "$sql" && ok "dry-run : tables et séquences transférées une à une" || ko "dry-run : transfert des objets absent"
grep -qE 'ALTER DATABASE "?app"? OWNER' <<< "$sql" && ko "la base app change de propriétaire" || ok "la base app garde son propriétaire"
cp "$deploy/.env.example" "$work/e1"
printf 'POSTGRES_PASSWORD=abc\n' > "$work/e1"
chmod 600 "$work/e1"
bash "$hard" --env-only --env-file "$work/e1" > "$work/env-only.out" 2>&1 && ok "--env-only réussit" || ko "--env-only échoue : $(head -c 200 "$work/env-only.out")"
for k in DIRECTUS_DB_PASSWORD LITELLM_DB_PASSWORD UMAMI_DB_PASSWORD; do
  v=$(grep -E "^$k=" "$work/e1" | head -n1 | cut -d= -f2-)
  [ "${#v}" -ge 32 ] && ok "$k ajouté à l'env (${#v} caractères)" || ko "$k non ajouté"
  grep -qF "$v" "$work/env-only.out" && ko "$k affiché dans la sortie" || ok "$k non affiché"
done
[ "$(stat -c %a "$work/e1")" = "600" ] && ok "le fichier env reste en mode 0600" || ko "mode du fichier env modifié"
cp "$work/e1" "$work/e1.avant"
bash "$hard" --env-only --env-file "$work/e1" > /dev/null 2>&1
cmp -s "$work/e1" "$work/e1.avant" && ok "idempotent : une deuxième exécution ne change rien" || ko "un mot de passe existant a été remplacé"

# ---------- compose.yml ----------
echo
echo "deploy/compose.yml"
compose="$deploy/compose.yml"
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1 && command -v jq > /dev/null 2>&1; then
  cfg=$(docker compose -p essai -f "$compose" --env-file "$envf" config --format json 2> "$work/cfg.err") && ok "docker compose config valide" || ko "docker compose config : $(head -c 300 "$work/cfg.err")"
  su=$(echo "$cfg" | jq -r '.services.db.environment.POSTGRES_USER')
  du=$(echo "$cfg" | jq -r '.services.directus.environment.DB_USER')
  [ -n "$du" ] && [ "$du" != "null" ] && [ "$du" != "$su" ] && ok "Directus ne se connecte pas avec le superutilisateur ($du ≠ $su)" || ko "Directus se connecte avec POSTGRES_USER ($du)"
  [ "$(echo "$cfg" | jq -r '.services.directus.environment.DB_PASSWORD')" != "$pg" ] && ok "Directus n'utilise pas POSTGRES_PASSWORD" || ko "Directus utilise POSTGRES_PASSWORD"
  ldb=$(echo "$cfg" | jq -r '.services.litellm.environment.DATABASE_URL')
  case "$ldb" in "postgresql://$su:"*) ko "LiteLLM se connecte avec le superutilisateur" ;; postgresql://litellm:*) ok "LiteLLM se connecte avec le rôle litellm" ;; *) ko "DATABASE_URL de LiteLLM inattendue" ;; esac
  case "$ldb" in *"$pg"*) ko "LiteLLM utilise POSTGRES_PASSWORD" ;; *) ok "LiteLLM n'utilise pas POSTGRES_PASSWORD" ;; esac
  for k in DIRECTUS_DB_PASSWORD LITELLM_DB_PASSWORD UMAMI_DB_PASSWORD; do
    [ "$(echo "$cfg" | jq -r ".services.db.environment.$k")" != "null" ] && ok "le conteneur db reçoit $k (initdb)" || ko "db ne reçoit pas $k"
  done
  grep -v '^DIRECTUS_DB_PASSWORD=' "$envf" > "$work/env-sans"
  docker compose -p essai -f "$compose" --env-file "$work/env-sans" config > /dev/null 2> "$work/cfg2.err" && ko "compose accepte l'absence de DIRECTUS_DB_PASSWORD (repli silencieux sur le superutilisateur ?)" || ok "compose refuse l'absence de DIRECTUS_DB_PASSWORD"
  grep -q 'harden-db-roles' "$work/cfg2.err" && ok "le message d'erreur indique harden-db-roles.sh" || ko "le message d'erreur n'indique pas harden-db-roles.sh"
else
  echo "  (Docker ou jq absent : validation de compose.yml sautée)"
fi

echo
echo "$pass réussis, $fail échecs"
[ "$fail" -eq 0 ]
