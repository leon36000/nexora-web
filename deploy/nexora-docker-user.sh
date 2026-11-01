#!/bin/sh
# Nexora : les réseaux « egress » du navigateur WebPilot et de SearXNG ne joignent pas les réseaux privés (docs/webpilot.md).
# Les sous-réseaux sont relus à chaque démarrage (ils changent si Docker recrée les réseaux).
set -eu
iptables -N DOCKER-USER 2>/dev/null || true
iptables -F DOCKER-USER
for net in nexorasite_webpilot-browser-egress nexorasite_webpilot-egress; do
  sub=$(docker network inspect "$net" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)
  [ -n "$sub" ] || continue
  for dest in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10; do
    iptables -A DOCKER-USER -s "$sub" -d "$dest" -j REJECT --reject-with icmp-net-prohibited
  done
done
iptables -A DOCKER-USER -j RETURN
