#!/usr/bin/env bash
# Depuis pc6 (qui joint le GitLab pc4 par Tailscale) : transmet les archives d'images du paquet générique `nexora-images`
# directement vers la VM WorkStudio, SANS rien écrire sur le disque de pc6 (flux curl -> ssh). Les VM du LAN ne joignent
# pas pc4. Le jeton GitLab est lu dans un fichier et passé à curl par un fichier de configuration anonyme : il n'apparaît
# ni dans la liste des processus ni dans les journaux. Puis, sur la VM : sha256sum -c SHA256SUMS ; docker load.
# Usage : pousser-images.sh [version] (défaut integre-2026-10-29)
set -euo pipefail
ver="${1:-integre-2026-10-29}"
vm="${NEXORA_WS_VM:-nexora-workstudio}"
tok="${GITLAB_PC4_TOKEN_FILE:-$HOME/.config/nexora/gitlab-pc4.token}"
base="https://pc4.tail0c55ff.ts.net/api/v4/projects/5/packages/generic/nexora-images/$ver"
T="$(cat "$tok")"
get() { curl -fsS -K <(printf 'header = "PRIVATE-TOKEN: %s"\n' "$T") "$base/$1"; }
ssh "$vm" 'mkdir -p /srv/nexora-images'
get SHA256SUMS | ssh "$vm" 'cat > /srv/nexora-images/SHA256SUMS'
for f in $(get SHA256SUMS | awk '{print $2}'); do
  echo "$f"
  get "$f" | ssh "$vm" "cat > /srv/nexora-images/$f"
done
ssh "$vm" 'cd /srv/nexora-images && sha256sum -c SHA256SUMS && for f in $(grep x86 SHA256SUMS | awk "{print \$2}"); do docker load -i "$f"; done'
