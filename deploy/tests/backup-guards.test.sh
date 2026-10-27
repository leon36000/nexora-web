#!/usr/bin/env bash
# Garde-fous de deploy/backup.sh et deploy/restore.sh qui ne demandent ni Docker démarré ni base :
# chiffrement obligatoire (l'archive contient des jetons statiques Directus en clair), clés absentes, conteneur fautif.
# Usage : bash deploy/tests/backup-guards.test.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy="$(cd "$here/.." && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0
fail=0
ok() { pass=$((pass + 1)); echo "  ok    $1"; }
ko() { fail=$((fail + 1)); echo "  ECHEC $1"; }

printf 'phrase-de-passe-de-test-assez-longue' > "$work/enc.key"
: > "$work/vide.key"
# Conteneurs inexistants : si une garde manque, le script s'arrête de toute façon sur « conteneur non démarré » et le
# test le voit (message différent). Aucun conteneur réel n'est jamais touché.
export NEXORA_DB_CONTAINER=conteneur-inexistant-pour-essai NEXORA_DIRECTUS_CONTAINER=conteneur-inexistant-pour-essai
unset NEXORA_BACKUP_ENCRYPT_KEY_FILE NEXORA_BACKUP_SIGNING_KEY_FILE

echo "deploy/backup.sh : chiffrement obligatoire"
out=$(bash "$deploy/backup.sh" --out "$work/o1" 2>&1); code=$?
[ "$code" -ne 0 ] && ok "sans clé de chiffrement : refus (code $code)" || ko "sans clé de chiffrement : accepté"
echo "$out" | grep -q -- "--chiffrer" && ok "le message indique --chiffrer / NEXORA_BACKUP_ENCRYPT_KEY_FILE" || ko "message sans indication : $out"
echo "$out" | grep -q "pas démarré" && ko "la garde de chiffrement passe après la vérification du conteneur" || ok "la garde passe avant tout accès à Docker"
[ ! -e "$work/o1" ] && ok "rien n'est créé quand l'appel est refusé" || ko "dossier de sortie créé malgré le refus"

out=$(bash "$deploy/backup.sh" --out "$work/o2" --chiffrer "$work/absente.key" 2>&1); code=$?
[ "$code" -ne 0 ] && echo "$out" | grep -q "absente.key" && ok "fichier de clé absent : refus avant toute sauvegarde" || ko "fichier de clé absent non refusé : $out"
out=$(bash "$deploy/backup.sh" --out "$work/o3" --chiffrer "$work/vide.key" 2>&1); code=$?
[ "$code" -ne 0 ] && echo "$out" | grep -qi "vide" && ok "fichier de clé vide : refus avant toute sauvegarde" || ko "fichier de clé vide non refusé : $out"

out=$(bash "$deploy/backup.sh" --out "$work/o4" --chiffrer "$work/enc.key" 2>&1); code=$?
echo "$out" | grep -q "pas démarré" && ok "avec une clé valide, la garde laisse passer (arrêt ensuite sur le conteneur inexistant)" || ko "clé valide mais refus inattendu : $out"

out=$(NEXORA_BACKUP_ENCRYPT_KEY_FILE="$work/enc.key" bash "$deploy/backup.sh" --out "$work/o5" 2>&1)
echo "$out" | grep -q "pas démarré" && ok "NEXORA_BACKUP_ENCRYPT_KEY_FILE équivaut à --chiffrer" || ko "variable d'environnement sans effet : $out"

out=$(bash "$deploy/backup.sh" --out "$work/o6" --sans-chiffrement 2>&1); code=$?
echo "$out" | grep -q "pas démarré" && ok "--sans-chiffrement existe (essais jetables), la garde laisse passer" || ko "--sans-chiffrement non reconnu : $out"
echo "$out" | grep -qi "ATTENTION" && ok "--sans-chiffrement avertit en clair que l'archive contiendra des jetons" || ko "aucun avertissement avec --sans-chiffrement"

echo
echo "deploy/restore.sh : une archive chiffrée exige la clé"
head -c 64 /dev/urandom > "$work/faux.tar.enc"
out=$(bash "$deploy/restore.sh" verifier "$work/faux.tar.enc" 2>&1); code=$?
[ "$code" -ne 0 ] && echo "$out" | grep -q "clé de chiffrement" && ok "archive .enc sans NEXORA_BACKUP_ENCRYPT_KEY_FILE : refus explicite" || ko "archive .enc sans clé non refusée : $out"

echo
echo "$pass réussis, $fail échecs"
[ "$fail" -eq 0 ]
