#!/bin/bash
# Crée, à la première initialisation du volume seulement, un rôle et une base par service (Directus, LiteLLM, Umami).
# Chaque rôle est propriétaire de SA base, sans SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ni BYPASSRLS : une
# compromission de Directus ou de LiteLLM n'ouvre ni la base « app » (clients, grand livre, Coffre) ni le serveur.
# Mot de passe de chaque rôle : variable <BASE>_DB_PASSWORD (DIRECTUS_DB_PASSWORD, ...) ou <BASE>_DB_PASSWORD_FILE (secret
# Docker), lue par psql (\getenv) pour ne jamais figurer dans le SQL ni dans la ligne de commande. Le conteneur existant n'est pas touché par ce script :
# pour un cluster déjà initialisé, voir deploy/harden-db-roles.sh.
set -euo pipefail

psql_su() { psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname app "$@"; }

for db in $EXTRA_DATABASES; do
  var="$(printf '%s' "$db" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD"
  # Secret Docker (compose.prod.yml) : <VAR>_FILE désigne un fichier dont le contenu EST le mot de passe.
  fvar="${var}_FILE"
  if [ -z "${!var:-}" ] && [ -n "${!fvar:-}" ]; then
    export "$var=$(cat "${!fvar}")"
  fi
  if [ -z "${!var:-}" ]; then
    echo "initdb : la variable $var est obligatoire (mot de passe du rôle « $db »)" >&2
    exit 1
  fi
  psql_su -v role="$db" <<SQL
\getenv pw $var
CREATE ROLE :"role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'pw';
CREATE DATABASE :"role" OWNER :"role";
REVOKE ALL ON DATABASE :"role" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"role" TO :"role";
SQL
done

# La base « app » reste au rôle propriétaire du site ; plus personne d'autre ne s'y connecte.
psql_su <<'SQL'
REVOKE CONNECT ON DATABASE app FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS vector;
SQL
