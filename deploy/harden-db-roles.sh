#!/usr/bin/env bash
# Migre un cluster PostgreSQL EXISTANT vers « un rôle par base, sans droit de superutilisateur ».
#
# Pourquoi : deploy/initdb/01-databases.sh ne s'exécute qu'à l'initialisation d'un volume NEUF. Un cluster déjà en
# service a ses bases (directus, litellm, umami) détenues par le superutilisateur « nexora », avec lequel Directus et
# LiteLLM se connectent : leur compromission donne tout le serveur, dont la base « app » (clients, grand livre, Coffre).
#
# Ce que fait le script (idempotent, rejouable sans effet de bord) :
#   1. ajoute à l'env les mots de passe manquants (DIRECTUS_DB_PASSWORD, LITELLM_DB_PASSWORD, UMAMI_DB_PASSWORD), générés
#      au hasard, jamais affichés, fichier laissé en mode 0600 ;
#   2. crée les rôles directus, litellm, umami (LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS) ;
#   3. ALTER DATABASE … OWNER TO le rôle de la base, puis transfère UN À UN les objets (schémas, tables, séquences,
#      vues, types, fonctions) : PAS de REASSIGN OWNED, qui déplacerait aussi les objets PARTAGÉS, donc la base « app » ;
#   4. REVOKE CONNECT ON DATABASE app FROM PUBLIC (et sur chaque base de service) puis GRANT CONNECT à son seul rôle.
# Il NE redémarre RIEN et ne change aucune variable de Directus ou de LiteLLM : voir « Étapes suivantes » en fin de sortie
# et docs/infra.md. La base « app » garde son propriétaire (le rôle du site).
#
# Usage : bash deploy/harden-db-roles.sh [--env-file F] [--container C] [--superuser U] [--dry-run | --env-only | --check]
#   --dry-run   affiche le SQL (sans mot de passe) et n'écrit ni n'exécute rien
#   --env-only  ajoute seulement les mots de passe manquants à l'env
#   --check     vérifie l'état du cluster (lecture seule) ; code de retour 1 si un rôle est trop puissant ou absent
set -euo pipefail

here="$(dirname "$(readlink -f "$0")")"
env_file="$here/.env"
container="${NEXORA_DB_CONTAINER:-nexorasite-db-1}"
superuser="nexora"
mode="apply"
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) env_file="$2"; shift 2 ;;
    --container) container="$2"; shift 2 ;;
    --superuser) superuser="$2"; shift 2 ;;
    --dry-run) mode="dry-run"; shift ;;
    --env-only) mode="env-only"; shift ;;
    --check) mode="check"; shift ;;
    -h | --help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done

SERVICE_DBS="directus litellm umami"
pwvar() { printf '%s_DB_PASSWORD' "$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"; }
envval() { grep -E "^$1=" "$env_file" 2> /dev/null | head -n1 | cut -d= -f2-; }

ensure_env() {
  [ -f "$env_file" ] || { echo "fichier d'environnement introuvable : $env_file" >&2; exit 1; }
  local db var added=0
  for db in $SERVICE_DBS; do
    var="$(pwvar "$db")"
    [ -n "$(envval "$var")" ] && continue
    sed -i "/^$var=\$/d" "$env_file"
    [ -z "$(tail -c1 "$env_file")" ] || echo >> "$env_file"
    echo "$var=$(openssl rand -hex 24)" >> "$env_file"
    added=$((added + 1))
  done
  echo "env : $added mot(s) de passe ajouté(s) à $env_file (valeurs non affichées)"
}

# SQL d'une base de service ; $1 = nom de la base (= nom du rôle).
sql_service_db() {
  local db="$1" var
  var="$(pwvar "$db")"
  cat << SQL

-- ===== $db =====
\\set role $db
\\getenv pw $var
SELECT format('CREATE ROLE %I LOGIN', :'role') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \\gexec
ALTER ROLE :"role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'pw';
SELECT format('CREATE DATABASE %I OWNER %I', :'role', :'role') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'role') \\gexec
ALTER DATABASE :"role" OWNER TO :"role";
REVOKE ALL ON DATABASE :"role" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"role" TO :"role";
\\connect :"role"
-- Objets des schémas non système, hors objets d'extensions, détenus par un autre rôle (typiquement le superutilisateur).
SELECT format('ALTER SCHEMA %I OWNER TO %I', n.nspname, :'role') FROM pg_namespace n
  WHERE n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_'
    AND pg_get_userbyid(n.nspowner) NOT IN (:'role', 'pg_database_owner')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_namespace'::regclass AND d.objid = n.oid AND d.deptype = 'e') \\gexec
SELECT format('ALTER TABLE %I.%I OWNER TO %I', n.nspname, c.relname, :'role') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_' AND pg_get_userbyid(c.relowner) <> :'role'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e') \\gexec
-- Les séquences liées à une colonne (serial, identité) suivent leur table ; seules les séquences libres sont déplacées ici.
SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I', n.nspname, c.relname, :'role') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'S' AND n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_' AND pg_get_userbyid(c.relowner) <> :'role'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i', 'e')) \\gexec
SELECT format('ALTER VIEW %I.%I OWNER TO %I', n.nspname, c.relname, :'role') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'v' AND n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_' AND pg_get_userbyid(c.relowner) <> :'role'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e') \\gexec
SELECT format('ALTER MATERIALIZED VIEW %I.%I OWNER TO %I', n.nspname, c.relname, :'role') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'm' AND n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_' AND pg_get_userbyid(c.relowner) <> :'role'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e') \\gexec
SELECT format('ALTER TYPE %I.%I OWNER TO %I', n.nspname, t.typname, :'role') FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE t.typtype IN ('e', 'r', 'm') AND n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_' AND pg_get_userbyid(t.typowner) <> :'role'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e') \\gexec
SELECT format('ALTER DOMAIN %I.%I OWNER TO %I', n.nspname, t.typname, :'role') FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE t.typtype = 'd' AND n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_' AND pg_get_userbyid(t.typowner) <> :'role'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e') \\gexec
SELECT format('ALTER %s %s OWNER TO %I', CASE p.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END, p.oid::regprocedure, :'role')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_' AND pg_get_userbyid(p.proowner) <> :'role'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e') \\gexec
\\connect app
SQL
}

sql_all() {
  cat << 'SQL'
-- Migration « un rôle par base » (deploy/harden-db-roles.sh). Idempotente. La base app n'est jamais réaffectée.
\set ON_ERROR_STOP on
\connect app
REVOKE CONNECT ON DATABASE app FROM PUBLIC;
SQL
  local db
  for db in $SERVICE_DBS; do sql_service_db "$db"; done
  cat << 'SQL'

\echo '--- Rôles de service (attendu : toutes les colonnes à f) ---'
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname IN ('directus', 'litellm', 'umami') ORDER BY 1;
\echo '--- Propriétaire de chaque base ---'
SELECT datname, pg_get_userbyid(datdba) AS proprietaire FROM pg_database WHERE datname IN ('app', 'directus', 'litellm', 'umami') ORDER BY 1;
SQL
}

run_psql() { # run_psql [options psql...] ; le SQL arrive par l'entrée standard
  local db var
  for db in $SERVICE_DBS; do
    var="$(pwvar "$db")"
    export "$var=$(envval "$var")"
  done
  export PGPASSWORD="$(envval POSTGRES_PASSWORD)"
  docker exec -i -e PGPASSWORD -e DIRECTUS_DB_PASSWORD -e LITELLM_DB_PASSWORD -e UMAMI_DB_PASSWORD \
    "$container" psql -X -q -v ON_ERROR_STOP=1 -U "$superuser" -d postgres "$@"
}

check() {
  local bad=0 db row
  export PGPASSWORD="$(envval POSTGRES_PASSWORD)"
  for db in $SERVICE_DBS; do
    row="$(docker exec -e PGPASSWORD "$container" psql -X -At -U "$superuser" -d postgres -c \
      "select concat(r.rolsuper::int, r.rolcreatedb::int, r.rolcreaterole::int, r.rolreplication::int, r.rolbypassrls::int, '|', pg_get_userbyid(d.datdba)) from pg_roles r, pg_database d where r.rolname = '$db' and d.datname = '$db'")" || row=""
    if [ "$row" = "00000|$db" ]; then
      echo "  ok    $db : rôle sans privilège, propriétaire de sa base"
    else
      echo "  ECHEC $db : ${row:-rôle ou base absent} (attendu 00000|$db)"
      bad=1
    fi
  done
  if [ "$(docker exec -e PGPASSWORD "$container" psql -X -At -U "$superuser" -d postgres -c "select has_database_privilege('public', 'app', 'CONNECT')" 2> /dev/null)" = "f" ]; then
    echo "  ok    app : CONNECT retiré à PUBLIC"
  else
    echo "  ECHEC app : PUBLIC peut encore s'y connecter"
    bad=1
  fi
  return $bad
}

case "$mode" in
  dry-run) sql_all ;;
  env-only) ensure_env ;;
  check) check ;;
  apply)
    ensure_env
    sql_all | run_psql -f -
    cat << NEXT

Étapes suivantes (rien n'a été redémarré) :
  1. Vérifier : bash deploy/harden-db-roles.sh --check
  2. Mettre la pile à jour (compose.yml : Directus se connecte avec DB_USER=directus, LiteLLM avec le rôle litellm)
     puis recréer SEULEMENT ces deux services :
       docker compose -p nexorasite -f deploy/compose.yml --env-file deploy/.env up -d directus litellm
  3. Vérifier GET /server/health de Directus et la santé de LiteLLM, puis une publication d'essai.
  4. Après une restauration (deploy/restore.sh), rejouer ce script : pg_restore --no-owner rend « nexora » propriétaire.
NEXT
    ;;
esac
