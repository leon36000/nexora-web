#!/usr/bin/env bash
# Fonctions communes de deploy/backup.sh et deploy/restore.sh : manifeste, empreintes SHA-256, signature facultative.
# Aucune dépendance à Docker ici (testable seul : deploy/tests/manifest.test.sh). Dépendances : bash, jq, sha256sum, tar, openssl.
# Ne lit, ne copie et n'écrit JAMAIS la clé maîtresse du coffre (NEXORA_VAULT_MASTER_KEY) ni aucun .env.

BK_FORMAT=1
# Fichiers de données d'une archive, dans l'ordre. Le manifeste et les empreintes les décrivent.
BK_DATA_FILES=(app.dump directus.dump directus-uploads.tar)

bk_die() { echo "ERREUR : $*" >&2; exit 1; }
bk_need() { command -v "$1" > /dev/null 2>&1 || bk_die "outil requis introuvable : $1"; }

bk_sha256() { sha256sum "$1" | cut -d' ' -f1; }

# bk_manifest_write DIR CREATED_AT EXTRA_JSON
# Écrit DIR/manifest.json et DIR/SHA256SUMS pour les fichiers de données présents dans DIR.
# EXTRA_JSON : objet JSON fusionné tel quel (versions, décomptes de tables, etc.) ; ne doit contenir aucun secret.
bk_manifest_write() {
  local empty='{}' dir="$1" created="$2" extra="${3:-$empty}" f entries="[]" bytes sum
  for f in "${BK_DATA_FILES[@]}"; do
    [ -f "$dir/$f" ] || continue
    bytes=$(stat -c %s "$dir/$f")
    sum=$(bk_sha256 "$dir/$f")
    entries=$(jq -c --arg n "$f" --argjson b "$bytes" --arg s "$sum" '. + [{name:$n,bytes:$b,sha256:$s}]' <<< "$entries")
  done
  jq -n --argjson format "$BK_FORMAT" --arg created "$created" --argjson files "$entries" --argjson extra "$extra" \
    '{format:$format, created_at:$created, files:$files,
      secrets: "Ni la clé maîtresse du coffre (NEXORA_VAULT_MASTER_KEY), ni aucun fichier .env ne sont dans cette archive. Elle se conserve à part."}
     + $extra' > "$dir/manifest.json"
  ( cd "$dir" && for f in "${BK_DATA_FILES[@]}"; do [ -f "$f" ] && sha256sum "$f"; done > SHA256SUMS ) || true
}

# bk_sign DIR KEYFILE : signature HMAC-SHA256 du manifeste (facultative, recommandée : sans elle, qui peut
# modifier l'archive peut aussi réécrire le manifeste et les empreintes).
bk_sign() {
  local dir="$1" keyfile="$2"
  [ -s "$keyfile" ] || bk_die "clé de signature introuvable ou vide : $keyfile"
  openssl dgst -sha256 -hmac "$(tr -d '\n' < "$keyfile")" -r "$dir/manifest.json" | cut -d' ' -f1 > "$dir/manifest.sig"
}

# bk_verify_dir DIR [KEYFILE] [UNSIGNED_OK]
# Refuse (code 1, message en français) si : manifeste absent ou mal formé, fichier manquant, fichier en trop,
# empreinte différente, SHA256SUMS incohérent, signature absente/invalide quand une clé est fournie,
# signature présente sans clé (sauf UNSIGNED_OK=1).
bk_verify_dir() {
  local dir="$1" keyfile="${2:-}" unsigned_ok="${3:-0}" f want got listed extra
  [ -f "$dir/manifest.json" ] || { echo "Archive refusée : manifest.json absent." >&2; return 1; }
  jq -e --argjson fmt "$BK_FORMAT" '.format == $fmt and (.files | type == "array" and length > 0)' "$dir/manifest.json" > /dev/null 2>&1 \
    || { echo "Archive refusée : manifeste illisible ou de format inconnu." >&2; return 1; }

  if [ -n "$keyfile" ]; then
    [ -f "$dir/manifest.sig" ] || { echo "Archive refusée : signature absente alors qu'une clé est fournie." >&2; return 1; }
    want=$(openssl dgst -sha256 -hmac "$(tr -d '\n' < "$keyfile")" -r "$dir/manifest.json" | cut -d' ' -f1)
    got=$(tr -d '\n' < "$dir/manifest.sig")
    [ "$want" = "$got" ] || { echo "Archive refusée : la signature du manifeste ne correspond pas (archive ou manifeste modifié)." >&2; return 1; }
  elif [ -f "$dir/manifest.sig" ] && [ "$unsigned_ok" != 1 ]; then
    echo "Archive refusée : elle est signée, mais aucune clé de signature n'est fournie (NEXORA_BACKUP_SIGNING_KEY_FILE)." >&2
    return 1
  fi

  while IFS=$'\t' read -r f want; do
    [ -f "$dir/$f" ] || { echo "Archive refusée : fichier manquant ($f)." >&2; return 1; }
    got=$(bk_sha256 "$dir/$f")
    [ "$got" = "$want" ] || { echo "Archive refusée : empreinte SHA-256 différente pour $f (fichier altéré ou tronqué)." >&2; return 1; }
  done < <(jq -r '.files[] | [.name, .sha256] | @tsv' "$dir/manifest.json")

  listed=$(jq -r '.files[].name' "$dir/manifest.json" | sort)
  extra=$(cd "$dir" && find . -maxdepth 1 -type f -printf '%f\n' | grep -vxE 'manifest\.json|manifest\.sig|SHA256SUMS' | sort | comm -13 <(printf '%s\n' "$listed") - || true)
  [ -z "$extra" ] || { echo "Archive refusée : fichier non déclaré au manifeste ($extra)." >&2; return 1; }

  if [ -f "$dir/SHA256SUMS" ]; then
    ( cd "$dir" && sha256sum --quiet -c SHA256SUMS > /dev/null 2>&1 ) \
      || { echo "Archive refusée : SHA256SUMS ne correspond pas aux fichiers." >&2; return 1; }
  fi
  return 0
}

# bk_extract_verified ARCHIVE DESTDIR [KEYFILE] [UNSIGNED_OK] : extrait une archive .tar dans DESTDIR (vide) après
# avoir vérifié la liste de ses membres (aucun chemin hors du dossier racine, aucun lien, aucun nom inattendu),
# puis vérifie le manifeste. Imprime le dossier extrait sur la sortie standard.
bk_extract_verified() {
  local archive="$1" dest="$2" keyfile="${3:-}" unsigned_ok="${4:-0}" root names bad
  [ -f "$archive" ] || bk_die "archive introuvable : $archive"
  mkdir -p "$dest"
  names=$(tar -tf "$archive" 2> /dev/null) || { echo "Archive refusée : fichier tar illisible." >&2; return 1; }
  root=$(printf '%s\n' "$names" | head -n1 | cut -d/ -f1)
  [[ "$root" =~ ^nexora-backup-[0-9]{8}T[0-9]{6}Z$ ]] || { echo "Archive refusée : dossier racine inattendu." >&2; return 1; }
  bad=$(printf '%s\n' "$names" | grep -vE "^${root}/?$|^${root}/(app\.dump|directus\.dump|directus-uploads\.tar|manifest\.json|manifest\.sig|SHA256SUMS)$" || true)
  [ -z "$bad" ] || { echo "Archive refusée : membre inattendu ($(printf '%s' "$bad" | head -n1))." >&2; return 1; }
  if tar -tvf "$archive" | cut -c1 | grep -qvE '^[-d]$'; then
    echo "Archive refusée : elle contient un lien ou un fichier spécial." >&2
    return 1
  fi
  tar -xf "$archive" -C "$dest" --no-same-owner --no-same-permissions
  bk_verify_dir "$dest/$root" "$keyfile" "$unsigned_ok" || return 1
  printf '%s\n' "$dest/$root"
}

# bk_encrypt IN OUT KEYFILE : chiffre l'archive (AES-256-CBC, PBKDF2 600 000 itérations, sel aléatoire) avec la phrase de
# passe contenue dans KEYFILE. L'archive contient des jetons statiques Directus en clair : à chiffrer dès qu'elle quitte le serveur.
bk_encrypt() {
  local in="$1" out="$2" keyfile="$3"
  [ -s "$keyfile" ] || bk_die "clé de chiffrement introuvable ou vide : $keyfile"
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in "$in" -out "$out" -pass "file:$keyfile" || bk_die "chiffrement impossible."
}

# bk_decrypt IN OUT KEYFILE : déchiffre ; code 1 avec un message clair si la clé est mauvaise ou le fichier altéré.
bk_decrypt() {
  local in="$1" out="$2" keyfile="$3"
  [ -s "$keyfile" ] || { echo "Archive refusée : clé de chiffrement introuvable ou vide ($keyfile)." >&2; return 1; }
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$in" -out "$out" -pass "file:$keyfile" 2> /dev/null \
    || { echo "Archive refusée : déchiffrement impossible (mauvaise clé ou fichier altéré)." >&2; return 1; }
  tar -tf "$out" > /dev/null 2>&1 || { echo "Archive refusée : après déchiffrement, ce n'est pas une archive valide (mauvaise clé ou fichier altéré)." >&2; return 1; }
}
