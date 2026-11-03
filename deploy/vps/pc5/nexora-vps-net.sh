#!/bin/bash
# Réseau des VPS clients (pilote) : pont vmbr1 en NAT privé, aucune route vers le LAN ni le tailnet.
# Idempotent. Appelé par /etc/network/interfaces.d/vmbr1-vps (post-up).
BR=vmbr1; NET=10.77.0.0/24; WAN=vmbr0; WORKER=192.168.1.121
sysctl -qw net.ipv4.ip_forward=1
for t in filter:NEXORA-VPS-FWD filter:NEXORA-VPS-IN nat:NEXORA-VPS-NAT; do
  tb=${t%%:*}; ch=${t##*:}
  iptables -t $tb -N $ch 2>/dev/null || iptables -t $tb -F $ch
done
# FORWARD : sorties des VPS vers Internet seulement ; jamais vers le LAN, le tailnet ni un autre VPS
iptables -A NEXORA-VPS-FWD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A NEXORA-VPS-FWD -i $BR -o $BR -j DROP
iptables -A NEXORA-VPS-FWD -o $BR -p tcp --dport 22 -s $WORKER -j ACCEPT
iptables -A NEXORA-VPS-FWD -o $BR -p tcp --dport 22 -s 192.168.1.0/24 -j ACCEPT
iptables -A NEXORA-VPS-FWD -o $BR -p tcp --dport 22 -s 100.64.0.0/10 -j ACCEPT
iptables -A NEXORA-VPS-FWD -o $BR -p icmp -s $WORKER -j ACCEPT
for d in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 224.0.0.0/4; do
  iptables -A NEXORA-VPS-FWD -i $BR -d $d -j DROP
done
iptables -A NEXORA-VPS-FWD -i $BR -o $WAN -j ACCEPT
iptables -A NEXORA-VPS-FWD -i $BR -j DROP
iptables -A NEXORA-VPS-FWD -o $BR -j DROP
# INPUT : un VPS ne parle pas à l hôte Proxmox (sauf ping de la passerelle)
iptables -A NEXORA-VPS-IN -i $BR -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A NEXORA-VPS-IN -i $BR -p icmp --icmp-type echo-request -j ACCEPT
iptables -A NEXORA-VPS-IN -i $BR -j DROP
iptables -t nat -A NEXORA-VPS-NAT -s $NET -o $WAN -j MASQUERADE
for j in "filter FORWARD NEXORA-VPS-FWD" "filter INPUT NEXORA-VPS-IN" "nat POSTROUTING NEXORA-VPS-NAT"; do
  set -- $j; iptables -t $1 -C $2 -j $3 2>/dev/null || iptables -t $1 -I $2 1 -j $3
done
# NAT et pare-feu Proxmox : sans zone de suivi de connexion dédiée aux ponts des VM (fwbr+), la première traversée
# « pontée » fige la connexion sans traduction et la VM n atteint plus Internet (doc Proxmox, section NAT).
iptables -t raw -C PREROUTING -i fwbr+ -j CT --zone 1 2>/dev/null || iptables -t raw -I PREROUTING -i fwbr+ -j CT --zone 1
