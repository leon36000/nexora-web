#!/bin/sh
# Filtre le port 4000 publié par le relais : seule la VM WorkStudio (LITELLM_LAN_CLIENT) le joint.
# Idempotent. Lancé après nexora-docker-user.service (qui vide la chaîne DOCKER-USER à chaque démarrage).
set -eu
CLIENT="${LITELLM_LAN_CLIENT:-192.168.1.123}"
chk() { iptables -C DOCKER-USER "$@" 2>/dev/null; }
add() { chk "$@" || iptables -I DOCKER-USER 1 "$@"; }
# L'ordre final voulu : 1 = ACCEPT du client, 2 = DROP des autres (insertion en sens inverse).
# --ctdir ORIGINAL : seuls les paquets du client vers le relais ; les réponses du conteneur (même connexion) passent.
add -p tcp -m conntrack --ctorigdstport 4000 --ctdir ORIGINAL -j DROP
add -s "$CLIENT" -p tcp -m conntrack --ctorigdstport 4000 --ctdir ORIGINAL -j ACCEPT
