#!/usr/bin/env bash
# Raccourci d'exploitation de la pile WorkStudio : docker compose avec la surcouche Proxmox et le fichier d'environnement
# de pile (secrets sous /srv/nexora/secrets-workstudio, jamais dans le dépôt). Exemples :
#   ws.sh ps        ws.sh up -d --no-build        ws.sh logs -f workstudio        ws.sh down   (sans -v : volumes conservés)
set -euo pipefail
root="${NEXORA_WS_ROOT:-/srv/nexora/workstudio}"
envf="${NEXORA_WS_ENV:-/srv/nexora/secrets-workstudio/pile.env}"
[ -r "$envf" ] || { echo "fichier d'environnement illisible : $envf" >&2; exit 1; }
exec docker compose -p nexora -f "$root/deploy/compose.yml" -f "$root/deploy/compose.proxmox.yml" --env-file "$envf" "$@"
