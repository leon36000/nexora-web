#!/usr/bin/env bash
# Sauvegarde de Nexora : bases « app » et « directus » (pg_dump, format custom, instantané cohérent), fichiers
# téléversés de Directus, manifeste avec empreintes SHA-256 et décompte exact des lignes de chaque table.
# La clé maîtresse du coffre (NEXORA_VAULT_MASTER_KEY) et les fichiers .env ne sont JAMAIS dans l'archive :
# elle se conserve à part (docs/guide-operateur.md). Les secrets du coffre, eux, y sont, mais chiffrés.
#
# Usage : deploy/backup.sh [--out DOSSIER] [--sans-fichiers] [--signer FICHIER_CLE] [--chiffrer FICHIER_CLE]
# Variables (défauts de la pile de développement/compose) :
#   NEXORA_DB_CONTAINER=nexorasite-db-1  NEXORA_DB_USER=nexora  NEXORA_APP_DB=app  NEXORA_DIRECTUS_DB=directus
#   NEXORA_DIRECTUS_CONTAINER=nexorasite-directus-1  NEXORA_UPLOADS_PATH=/directus/uploads
#   NEXORA_BACKUP_SIGNING_KEY_FILE=  (équivaut à --signer : signature HMAC-SHA256 du manifeste)
#   NEXORA_BACKUP_ENCRYPT_KEY_FILE=  (équivaut à --chiffrer : l'archive finale est chiffrée, .tar.enc ; elle contient des
#                                     jetons statiques Directus en clair et des secrets du coffre (chiffrés par la clé maîtresse))
# Le résultat (chemin, taille, empreinte de l'archive) est imprimé ; l'archive est en mode 0600.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-lib.sh
source "$here/lib/backup-lib.sh"

DB_CONTAINER="${NEXORA_DB_CONTAINER:-nexorasite-db-1}"
DB_USER="${NEXORA_DB_USER:-nexora}"
APP_DB="${NEXORA_APP_DB:-app}"
DX_DB="${NEXORA_DIRECTUS_DB:-directus}"
DX_CONTAINER="${NEXORA_DIRECTUS_CONTAINER:-nexorasite-directus-1}"
UPLOADS_PATH="${NEXORA_UPLOADS_PATH:-/directus/uploads}"
out="./backups"
with_files=1
sign_key="${NEXORA_BACKUP_SIGNING_KEY_FILE:-}"
enc_key="${NEXORA_BACKUP_ENCRYPT_KEY_FILE:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --out) out="${2:?--out demande un dossier}"; shift 2 ;;
    --sans-fichiers) with_files=0; shift ;;
    --signer) sign_key="${2:?--signer demande le chemin du fichier de clé}"; shift 2 ;;
    --chiffrer) enc_key="${2:?--chiffrer demande le chemin du fichier de phrase de passe}"; shift 2 ;;
    -h | --help) sed -n 2,18p "$0"; exit 0 ;;
    *) bk_die "option inconnue : $1" ;;
  esac
done

bk_need docker; bk_need jq; bk_need sha256sum; bk_need tar
docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2> /dev/null | grep -q true \
  || bk_die "le conteneur PostgreSQL « $DB_CONTAINER » n'est pas démarré (NEXORA_DB_CONTAINER)."

umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="nexora-backup-$stamp"
mkdir -p "$out"
work="$(mktemp -d "$out/.work-XXXXXX")"
trap 'rm -rf "$work"' EXIT
dir="$work/$name"
mkdir -p "$dir"

# Décompte exact de toutes les tables « public » ; sortie : « table<TAB>nombre » par ligne.
COUNTS_SQL="SELECT table_name || E'\t' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"

# dump_db BASE FICHIER : pg_dump et décompte pris dans le MÊME instantané (pg_export_snapshot), donc exacts même
# si le site écrit pendant la sauvegarde. Écrit le décompte en JSON dans « $FICHIER.counts.json ».
dump_db() {
  local db="$1" file="$2" snap line counts=""
  coproc PSQL { docker exec -i "$DB_CONTAINER" psql -q -At -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$db"; }
  local to=${PSQL[1]} from=${PSQL[0]}
  printf '%s\n' "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" "SELECT pg_export_snapshot();" >&"$to"
  IFS= read -r -t 60 -u "$from" snap || bk_die "instantané indisponible pour la base « $db »."
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$db" -Fc --no-owner --no-acl --snapshot="$snap" > "$file" \
    || bk_die "pg_dump a échoué pour la base « $db »."
  printf '%s\n' "$COUNTS_SQL" "SELECT '--FIN--';" >&"$to"
  while IFS= read -r -t 120 -u "$from" line; do
    [ "$line" = "--FIN--" ] && break
    counts+="$line"$'\n'
  done
  printf '%s\n' "COMMIT;" >&"$to"
  eval "exec ${to}>&-"
  wait "$PSQL_PID" || true
  printf '%s' "$counts" | jq -R -s -c 'split("\n") | map(select(length>0) | split("\t") | {(.[0]): (.[1]|tonumber)}) | add // {}' > "$file.counts.json"
  [ -s "$file" ] || bk_die "dump vide pour la base « $db »."
}

echo "Sauvegarde de la base « $APP_DB »…"
dump_db "$APP_DB" "$dir/app.dump"
echo "Sauvegarde de la base « $DX_DB »…"
dump_db "$DX_DB" "$dir/directus.dump"

upload_files=0
if [ "$with_files" = 1 ]; then
  echo "Copie des fichiers téléversés de Directus ($DX_CONTAINER:$UPLOADS_PATH)…"
  docker inspect -f '{{.State.Status}}' "$DX_CONTAINER" > /dev/null 2>&1 \
    || bk_die "conteneur Directus « $DX_CONTAINER » introuvable (NEXORA_DIRECTUS_CONTAINER, ou --sans-fichiers)."
  docker cp "$DX_CONTAINER:$UPLOADS_PATH/." - > "$dir/directus-uploads.tar" \
    || bk_die "copie des fichiers téléversés impossible."
  upload_files=$(tar -tf "$dir/directus-uploads.tar" | grep -vc '/$' || true)
fi

pg_version="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$APP_DB" -Atc 'show server_version')"
extra="$(jq -n \
  --arg pg "$pg_version" --arg app "$APP_DB" --arg dx "$DX_DB" --argjson uploads "$upload_files" \
  --slurpfile ta "$dir/app.dump.counts.json" --slurpfile td "$dir/directus.dump.counts.json" \
  '{postgres_version:$pg, databases:{app:$app, directus:$dx}, uploads_files:$uploads, tables:{app:$ta[0], directus:$td[0]}}')"
rm -f "$dir/app.dump.counts.json" "$dir/directus.dump.counts.json"

bk_manifest_write "$dir" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$extra"
[ -z "$sign_key" ] || { bk_sign "$dir" "$sign_key"; echo "Manifeste signé (HMAC-SHA256)."; }
# Garde-fou : la vérification passe sur ce qu'on vient d'écrire avant de livrer l'archive.
bk_verify_dir "$dir" "$sign_key" 0

archive="$out/$name.tar"
tar -cf "$archive" -C "$work" "$name"
if [ -n "$enc_key" ]; then
  bk_encrypt "$archive" "$archive.enc" "$enc_key"
  rm -f "$archive"
  archive="$archive.enc"
  echo "Archive chiffrée (AES-256, PBKDF2) : la phrase de passe se conserve à part, comme la clé maîtresse du coffre."
fi
chmod 600 "$archive"
echo
echo "Archive : $archive"
echo "Taille  : $(stat -c %s "$archive") octets"
echo "SHA-256 : $(bk_sha256 "$archive")   (à noter ailleurs que dans l'archive)"
echo "Tables  : app=$(jq '.tables.app | length' "$dir/manifest.json"), directus=$(jq '.tables.directus | length' "$dir/manifest.json") ; fichiers téléversés : $upload_files"
echo "Rappel  : la clé maîtresse du coffre n'est pas dans l'archive ; conservez-la séparément."
