#!/bin/sh
# VM WorkStudio : un port publié par Docker contourne ufw (filtrage en FORWARD, pas en INPUT). Cette règle réserve le
# port 80 (proxy frontal) au réseau local. Idempotent. Lancé après docker.service (unité nexora-ws-pare-feu.service).
set -eu
LAN="${NEXORA_LAN:-192.168.1.0/24}"
iptables -N DOCKER-USER 2>/dev/null || true
chk() { iptables -C DOCKER-USER "$@" 2>/dev/null; }
add() { chk "$@" || iptables -I DOCKER-USER 1 "$@"; }
add -p tcp -m conntrack --ctorigdstport 80 --ctdir ORIGINAL -j DROP
add -s "$LAN" -p tcp -m conntrack --ctorigdstport 80 --ctdir ORIGINAL -j ACCEPT
