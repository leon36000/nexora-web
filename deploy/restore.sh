#!/usr/bin/env bash
# Restauration d'une archive produite par deploy/backup.sh.
#
#   deploy/restore.sh verifier ARCHIVE
#       Vérifie l'archive (membres, manifeste, empreintes SHA-256, signature) sans rien restaurer.
#   deploy/restore.sh essai ARCHIVE [--nom NOM] [--port PORT] [--garder]
#       Démarre un PostgreSQL JETABLE (conteneur étiqueté, 127.0.0.1 seulement), y restaure les deux bases,
#       compare le décompte de lignes de CHAQUE table au manifeste, puis supprime le conteneur (sauf --garder).
#   deploy/restore.sh detruire NOM
#       Supprime un conteneur d'essai créé par « essai --garder » (refuse tout autre conteneur).
#   deploy/restore.sh restaurer ARCHIVE --pg-container CONTENEUR [--forcer] [--directus-container CONTENEUR]
#       Restaure dans un serveur PostgreSQL existant (reprise après sinistre). Refuse d'écraser une base qui existe
#       déjà sans --forcer. Les fichiers téléversés sont recopiés dans le conteneur Directus indiqué.
#
# Variables : NEXORA_DB_USER=nexora  NEXORA_APP_DB=app  NEXORA_DIRECTUS_DB=directus  NEXORA_UPLOADS_PATH=/directus/uploads
#   NEXORA_PG_IMAGE=pgvector/pgvector:pg17 (image de l'essai ; en production, l'image épinglée de deploy/compose.yml)
#   NEXORA_BACKUP_SIGNING_KEY_FILE=  (vérifie la signature ; sinon --signature-ignoree pour accepter une archive signée)
# Après une restauration réelle : replacez NEXORA_VAULT_MASTER_KEY (conservée à part) AVANT de démarrer le site.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-lib.sh
source "$here/lib/backup-lib.sh"

DB_USER="${NEXORA_DB_USER:-nexora}"
APP_DB="${NEXORA_APP_DB:-app}"
DX_DB="${NEXORA_DIRECTUS_DB:-directus}"
UPLOADS_PATH="${NEXORA_UPLOADS_PATH:-/directus/uploads}"
PG_IMAGE="${NEXORA_PG_IMAGE:-pgvector/pgvector:pg17}"
sign_key="${NEXORA_BACKUP_SIGNING_KEY_FILE:-}"
unsigned_ok=0
LABEL="nexora.restore-sandbox=1"

usage() { sed -n 2,19p "$0"; }
[ $# -ge 1 ] || { usage; exit 2; }
cmd="$1"; shift
archive=""; name=""; port=""; keep=0; pg_container=""; force=0; dx_container=""
if [ "$cmd" != detruire ] && [ $# -ge 1 ] && [[ "$1" != --* ]]; then archive="$1"; shift; fi
if [ "$cmd" = detruire ]; then name="${1:?nom du conteneur requis}"; shift; fi
while [ $# -gt 0 ]; do
  case "$1" in
    --nom) name="${2:?}"; shift 2 ;;
    --port) port="${2:?}"; shift 2 ;;
    --garder) keep=1; shift ;;
    --pg-container) pg_container="${2:?}"; shift 2 ;;
    --directus-container) dx_container="${2:?}"; shift 2 ;;
    --forcer) force=1; shift ;;
    --signature-ignoree) unsigned_ok=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) bk_die "option inconnue : $1" ;;
  esac
done

bk_need jq; bk_need sha256sum; bk_need tar

COUNTS_SQL="SELECT table_name || E'\t' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"

tmp=""
cleanup() { [ -z "$tmp" ] || rm -rf "$tmp"; }
trap cleanup EXIT

extract() {
  [ -n "$archive" ] || bk_die "archive requise."
  tmp="$(mktemp -d)"
  chmod 700 "$tmp"
  dir="$(bk_extract_verified "$archive" "$tmp/x" "$sign_key" "$unsigned_ok")" || exit 1
}

# pg_restore_into CONTENEUR BASE FICHIER : crée la base (vide) et y restaure le dump par l'entrée standard.
pg_restore_into() {
  local c="$1" db="$2" file="$3" exists
  exists=$(docker exec "$c" psql -U "$DB_USER" -d postgres -Atc "select 1 from pg_database where datname='$db'")
  if [ -n "$exists" ]; then
    [ "$force" = 1 ] || bk_die "la base « $db » existe déjà dans $c : refus d'écraser (utilisez --forcer en connaissance de cause)."
    docker exec "$c" psql -q -U "$DB_USER" -d postgres -c "DROP DATABASE \"$db\" WITH (FORCE)" > /dev/null
  fi
  docker exec "$c" psql -q -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$db\" OWNER \"$DB_USER\"" > /dev/null
  docker exec "$c" psql -q -U "$DB_USER" -d "$db" -c "CREATE EXTENSION IF NOT EXISTS vector" > /dev/null 2>&1 || true
  docker exec -i "$c" pg_restore -U "$DB_USER" -d "$db" --no-owner --no-acl --exit-on-error < "$file" \
    2> >(grep -v 'already exists' >&2) || {
      # pg_restore signale « extension already exists » en erreur bénigne quand vector est déjà créée : on retente sans.
      bk_die "pg_restore a échoué pour « $db »."
    }
}

# compare_counts CONTENEUR BASE CLE_MANIFESTE : compare chaque table au manifeste ; imprime un tableau ; code 1 si écart.
compare_counts() {
  local c="$1" db="$2" key="$3" bad=0 t want got total=0
  declare -A have=()
  while IFS=$'\t' read -r t got; do have["$t"]="$got"; done < <(docker exec "$c" psql -q -At -X -U "$DB_USER" -d "$db" -c "$COUNTS_SQL")
  printf '  %-34s %12s %12s\n' "table ($db)" "manifeste" "restaurée"
  while IFS=$'\t' read -r t want; do
    got="${have[$t]:-ABSENTE}"
    total=$((total + 1))
    if [ "$got" != "$want" ]; then bad=$((bad + 1)); printf '  %-34s %12s %12s  <-- ÉCART\n' "$t" "$want" "$got"; fi
  done < <(jq -r --arg k "$key" '.tables[$k] | to_entries[] | [.key, (.value|tostring)] | @tsv' "$dir/manifest.json")
  # tables clés toujours affichées
  for t in credit_entries api_keys vps_orders vps_instances users organizations vault_secrets models pages directus_files directus_users; do
    want=$(jq -r --arg k "$key" --arg t "$t" '.tables[$k][$t] // empty' "$dir/manifest.json")
    [ -n "$want" ] && printf '  %-34s %12s %12s\n' "$t" "$want" "${have[$t]:-ABSENTE}"
  done
  echo "  → $total table(s) comparée(s), $bad écart(s)."
  [ "$bad" -eq 0 ]
}

case "$cmd" in
  verifier)
    extract
    echo "Archive valide : $(jq -r '.created_at' "$dir/manifest.json"), $(jq '.files | length' "$dir/manifest.json") fichier(s), empreintes et manifeste concordants."
    ;;

  essai)
    bk_need docker
    extract
    ts="$(date -u +%Y%m%dT%H%M%SZ)"
    name="${name:-nexorasite-s9-restore-$ts}"
    port="${port:-$((15460 + RANDOM % 30))}"
    echo "Démarrage du PostgreSQL jetable « $name » (127.0.0.1:$port)…"
    docker run -d --name "$name" --label "$LABEL" -e POSTGRES_USER="$DB_USER" -e POSTGRES_DB=postgres \
      -e POSTGRES_HOST_AUTH_METHOD=trust -p "127.0.0.1:$port:5432" "$PG_IMAGE" > /dev/null
    fail=0
    if [ "$keep" = 0 ]; then
      trap 'docker rm -fv "$name" > /dev/null 2>&1 || true; cleanup' EXIT
    fi
    for _ in $(seq 1 60); do
      docker exec "$name" pg_isready -q -U "$DB_USER" -d postgres 2> /dev/null && sleep 1 && docker exec "$name" pg_isready -q -U "$DB_USER" -d postgres 2> /dev/null && break
      sleep 1
    done
    docker exec "$name" pg_isready -q -U "$DB_USER" -d postgres || bk_die "le PostgreSQL jetable ne démarre pas."
    pg_restore_into "$name" "$APP_DB" "$dir/app.dump"
    pg_restore_into "$name" "$DX_DB" "$dir/directus.dump"
    echo "Comparaison du décompte de lignes avec le manifeste :"
    compare_counts "$name" "$APP_DB" app || fail=1
    compare_counts "$name" "$DX_DB" directus || fail=1
    if [ -f "$dir/directus-uploads.tar" ]; then
      n=$(tar -tf "$dir/directus-uploads.tar" | grep -vc '/$' || true)
      want=$(jq -r '.uploads_files // 0' "$dir/manifest.json")
      echo "  fichiers téléversés : manifeste $want, archive $n"
      [ "$n" = "$want" ] || fail=1
    fi
    if [ "$fail" = 0 ]; then
      echo "RESTAURATION EXACTE : tous les décomptes concordent."
    else
      echo "RESTAURATION INCOMPLÈTE : voir les écarts ci-dessus." >&2
    fi
    if [ "$keep" = 1 ]; then
      echo "Conteneur conservé : $name — DATABASE_URL=postgres://$DB_USER@127.0.0.1:$port/$APP_DB (authentification « trust », boucle locale)."
      echo "Suppression : deploy/restore.sh detruire $name"
    else
      echo "Conteneur « $name » supprimé à la fin."
    fi
    exit "$fail"
    ;;

  detruire)
    bk_need docker
    docker inspect -f '{{index .Config.Labels "nexora.restore-sandbox"}}' "$name" 2> /dev/null | grep -qx 1 \
      || bk_die "« $name » n'est pas un conteneur d'essai créé par ce script (étiquette absente) : refus."
    docker rm -fv "$name" > /dev/null
    echo "Conteneur « $name » et son volume supprimés."
    ;;

  restaurer)
    bk_need docker
    [ -n "$pg_container" ] || bk_die "--pg-container requis."
    extract
    pg_restore_into "$pg_container" "$APP_DB" "$dir/app.dump"
    pg_restore_into "$pg_container" "$DX_DB" "$dir/directus.dump"
    echo "Comparaison du décompte de lignes avec le manifeste :"
    fail=0
    compare_counts "$pg_container" "$APP_DB" app || fail=1
    compare_counts "$pg_container" "$DX_DB" directus || fail=1
    if [ -n "$dx_container" ] && [ -f "$dir/directus-uploads.tar" ]; then
      docker cp - "$dx_container:$UPLOADS_PATH/" < "$dir/directus-uploads.tar"
      echo "Fichiers téléversés recopiés dans $dx_container:$UPLOADS_PATH."
    fi
    echo "Étape suivante : remettre NEXORA_VAULT_MASTER_KEY (conservée à part), puis démarrer Directus et le site."
    exit "$fail"
    ;;

  *) usage; exit 2 ;;
esac
