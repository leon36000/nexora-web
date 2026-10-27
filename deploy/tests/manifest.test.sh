#!/usr/bin/env bash
# Tests du manifeste de sauvegarde : une archive intacte passe, toute altération est refusée.
# Sans Docker ni base : de faux fichiers suffisent. Usage : bash deploy/tests/manifest.test.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/backup-lib.sh
source "$here/../lib/backup-lib.sh"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0
fail=0
ok() { pass=$((pass + 1)); echo "  ok    $1"; }
ko() { fail=$((fail + 1)); echo "  ECHEC $1"; }

ROOT=nexora-backup-20261027T120000Z
build() { # build NAME [signkey] : fabrique une archive saine dans $work/NAME.tar
  local name="$1" key="${2:-}" d
  d="$work/$name-src/$ROOT"
  rm -rf "$work/$name-src"
  mkdir -p "$d"
  head -c 4096 /dev/urandom > "$d/app.dump"
  head -c 2048 /dev/urandom > "$d/directus.dump"
  printf 'uploads' > "$d/directus-uploads.tar"
  bk_manifest_write "$d" "2026-10-27T12:00:00Z" '{"tables":{"app":{"credit_entries":3}}}'
  [ -z "$key" ] || bk_sign "$d" "$key"
  tar -cf "$work/$name.tar" -C "$work/$name-src" "$ROOT"
}
verify() { # verify NAME [key] [unsigned_ok] ; code de retour de bk_extract_verified
  rm -rf "$work/out-$1"
  bk_extract_verified "$work/$1.tar" "$work/out-$1" "${2:-}" "${3:-0}" > /dev/null 2> "$work/err-$1"
}
retar() { tar -cf "$work/$1.tar" -C "$work/$1-src" "$ROOT"; }

printf 'secret-de-signature-de-test' > "$work/signing.key"

echo "Manifeste de sauvegarde"
build intacte
verify intacte && ok "archive intacte acceptée" || ko "archive intacte refusée : $(cat "$work/err-intacte")"

# la clé maîtresse du coffre n'est jamais écrite par la bibliothèque
if tar -xOf "$work/intacte.tar" | grep -aq "NEXORA_VAULT_MASTER_KEY="; then ko "le manifeste contient une affectation de la clé maîtresse"; else ok "aucune affectation NEXORA_VAULT_MASTER_KEY= dans l'archive"; fi

build octet
printf 'X' | dd of="$work/octet-src/$ROOT/app.dump" bs=1 seek=100 conv=notrunc 2> /dev/null
retar octet
verify octet && ko "octet modifié accepté" || ok "un octet modifié dans app.dump est refusé ($(head -c 70 "$work/err-octet"))"

build tronque
truncate -s 1000 "$work/tronque-src/$ROOT/directus.dump"
retar tronque
verify tronque && ko "fichier tronqué accepté" || ok "un fichier tronqué est refusé"

build manquant
rm "$work/manquant-src/$ROOT/directus-uploads.tar"
retar manquant
verify manquant && ko "fichier manquant accepté" || ok "un fichier manquant est refusé"

build enplus
printf 'x' > "$work/enplus-src/$ROOT/intrus.sql"
retar enplus
verify enplus && ko "fichier en trop accepté" || ok "un fichier non déclaré est refusé"

build lien
ln -s /etc/passwd "$work/lien-src/$ROOT/directus.dump.lnk"
retar lien
verify lien && ko "lien symbolique accepté" || ok "un lien symbolique est refusé"

build chemin
python3 -I - "$work/chemin.tar" "$ROOT" << 'PY'
import io, sys, tarfile
out, root = sys.argv[1], sys.argv[2]
with tarfile.open(out, "w") as t:
    for name in (f"{root}/../evil", f"{root}/app.dump"):
        info = tarfile.TarInfo(name)
        info.size = 1
        t.addfile(info, io.BytesIO(b"x"))
PY
verify chemin && ko "chemin hors du dossier accepté" || ok "un chemin hors du dossier racine est refusé"

# manifeste réécrit avec de fausses empreintes cohérentes : sans signature, il passe ; avec signature, il est refusé
build forge
d="$work/forge-src/$ROOT"
printf 'FALSIFIE' > "$d/app.dump"
bk_manifest_write "$d" "2026-10-27T12:00:00Z" '{}'
retar forge
verify forge && ok "(attendu) sans clé de signature, un manifeste réécrit de façon cohérente passe : d'où la signature recommandée" || ko "manifeste cohérent refusé sans signature"

build signee "$work/signing.key"
verify signee "$work/signing.key" && ok "archive signée acceptée avec la bonne clé" || ko "archive signée refusée : $(cat "$work/err-signee")"
verify signee "" && ko "archive signée acceptée sans clé" || ok "archive signée refusée quand aucune clé n'est fournie"
verify signee "" 1 && ok "archive signée acceptée sans clé avec l'option explicite --signature-ignorée" || ko "option signature ignorée sans effet"
printf 'autre-cle' > "$work/autre.key"
verify signee "$work/autre.key" && ko "mauvaise clé acceptée" || ok "archive signée refusée avec une autre clé"

build signee2 "$work/signing.key"
d="$work/signee2-src/$ROOT"
printf 'FALSIFIE' > "$d/app.dump"
bk_manifest_write "$d" "2026-10-27T12:00:00Z" '{}'
retar signee2
verify signee2 "$work/signing.key" && ko "manifeste réécrit accepté malgré la signature" || ok "manifeste réécrit refusé par la signature"

build sansig "$work/signing.key"
rm "$work/sansig-src/$ROOT/manifest.sig"
retar sansig
verify sansig "$work/signing.key" && ko "signature retirée acceptée" || ok "signature retirée refusée quand une clé est fournie"

echo
echo "$pass réussis, $fail échecs"
[ "$fail" -eq 0 ]
