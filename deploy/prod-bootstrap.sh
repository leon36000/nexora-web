#!/usr/bin/env bash
# Après le PREMIER démarrage de Directus : crée le jeton statique de l'administrateur (secret `directus_admin_token`),
# AVANT que cms/scripts/apply.ts n'exige la double authentification (une session par mot de passe demanderait alors un code
# à usage unique ; le jeton, lui, ne dépend ni du mot de passe ni du code). Rejouable : ne fait rien si le fichier existe.
#
#   sudo bash deploy/prod-bootstrap.sh [DOSSIER_SECRETS] [URL_DIRECTUS]     (défauts : /srv/nexora/secrets, http://127.0.0.1:8456)
#
# Variables : DIRECTUS_ADMIN_EMAIL (adresse du compte créé au premier démarrage). Aucune valeur secrète n'est affichée ni
# placée dans une ligne de commande : les en-têtes et corps passent par des fichiers temporaires 0600.
set -euo pipefail
dir="${1:-/srv/nexora/secrets}"
url="${2:-http://127.0.0.1:8456}"
gid="${NEXORA_SECRETS_GID:-2001}"
email="${DIRECTUS_ADMIN_EMAIL:?définir DIRECTUS_ADMIN_EMAIL}"
[ "$(id -u)" = 0 ] || { echo "à lancer en root (sudo)" >&2; exit 1; }
if [ -e "$dir/directus_admin_token" ]; then echo "directus_admin_token existe déjà : rien à faire."; exit 0; fi
for c in curl jq openssl; do command -v "$c" > /dev/null || { echo "$c absent" >&2; exit 1; }; done
umask 077
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

jq -n --arg e "$email" --rawfile p "$dir/directus_admin_password" '{email:$e,password:$p}' > "$tmp/login.json"
curl -fsS -X POST "$url/auth/login" -H 'content-type: application/json' --data-binary "@$tmp/login.json" -o "$tmp/login.out" \
  || { echo "connexion refusée par Directus (adresse, mot de passe ou 2FA déjà exigée)" >&2; exit 1; }
printf 'authorization: Bearer %s\n' "$(jq -r '.data.access_token' "$tmp/login.out")" > "$tmp/auth.hdr"

printf '%s' "$(openssl rand -hex 32)" > "$tmp/token"
jq -n --rawfile t "$tmp/token" '{token:$t}' > "$tmp/patch.json"
curl -fsS -X PATCH "$url/users/me" -H "@$tmp/auth.hdr" -H 'content-type: application/json' --data-binary "@$tmp/patch.json" -o /dev/null \
  || { echo "création du jeton impossible" >&2; exit 1; }
# Vérifie que le jeton ouvre bien le compte avant de le ranger.
printf 'authorization: Bearer %s\n' "$(cat "$tmp/token")" > "$tmp/tok.hdr"
curl -fsS "$url/users/me?fields=email" -H "@$tmp/tok.hdr" -o /dev/null || { echo "le jeton créé ne fonctionne pas" >&2; exit 1; }
install -m 0440 -o 0 -g "$gid" "$tmp/token" "$dir/directus_admin_token"
echo "directus_admin_token créé dans $dir (valeur non affichée)."
