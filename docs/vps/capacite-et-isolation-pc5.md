# Capacité et isolation des VPS clients sur pc5 (Proxmox VE 9.2, nœud `pve`)

État au 02/11/2026, mesuré sur le serveur (`pvesh`, `free`, `lvs`). Chaque Go est compté : les plafonds ci-dessous protègent d'abord les VM de Nexora (201 `nexora-pile`, 202 `nexora-creative`, 203 `nexora-workstudio`).

## 1. Ce que pc5 peut donner aux clients

| Ressource | Total | Déjà promis aux VM de Nexora et à l'hôte | Plafond vendable aux clients | Pourquoi |
|---|---|---|---|---|
| Mémoire | 62,5 Gio | 20 + 12 + 20 Gio (201 à 203) + 5 Gio (VM 9100, qui n'est pas à Nexora) = 57 Gio au maximum ; l'hôte en garde 3 à 4 ; 5,3 Gio de swap déjà utilisés | **4 Gio** | En comptant chaque VM à son maximum, 57 + 4 = 61 Gio sur 62,5 : c'est la limite. Au repos, 202 n'utilise que 6 de ses 12 Gio, mais on ne vend pas sur du « au repos ». Pour vendre plus : réduire la mémoire de 202 ou de 9100, ou ajouter de la RAM. |
| vCPU | 24 fils (i9-12900KS) | 6 + 8 + 8 + 4 = 26 vCPU déjà alloués | **8 vCPU** | Le processeur se partage bien : chaque VM client a un poids d'ordonnancement bas (`cpuunits=50` contre 100 par défaut), donc les VM de Nexora passent avant. |
| Disque (`ssd-1tb`, LVM mince, 912 Gio) | 912 Gio | 780 Gio déjà provisionnés (dont 250 Gio d'archives), 123 Gio réellement écrits (13 %) | **60 Gio virtuels** + environ 3 Gio par gabarit d'OS | 780 + 63 = 843 Gio < 912 : la réserve mince n'est jamais sur-promise, même si tous les disques se remplissaient. |

Ces plafonds sont inscrits dans la fiche du serveur (« capacité vendable » : 8 vCPU, 4096 Mo, 60 Go) ; le placement refuse toute commande qui les dépasserait. Proxmox n'a pas de quota dur par pool : le plafond dur est celui du placement de Nexora, contrôlé par `deploy/vps/reconcilier.sh`, qui compare l'alloué réel du pool au plafond.

Plans publiés (prix de DÉVELOPPEMENT, Stripe en mode test, à fixer par le fondateur) : `nano` 1 vCPU / 512 Mo / 5 Go ; `mini` 1 vCPU / 1 Go / 8 Go ; `standard` 2 vCPU / 2 Go / 12 Go. Au plafond : 8 nano, ou 4 mini, ou 2 standard, ou un mélange. Disques minces : ce qui n'est pas écrit ne consomme rien, la suppression d'un VPS libère le volume (`purge` et disques non référencés).

## 2. Isolation

- **Pool** `clients-vps` : toutes les VM de clients et les gabarits de Nexora s'y trouvent. Le compte `nexora@pve` n'a de droits que sur ce pool, le stockage `ssd-1tb`, le stockage d'import `local`, le nœud et le seul pont `vmbr1` (`/sdn/zones/localnetwork/vmbr1`). Il ne voit pas les VM 201, 202, 203, 9000 et 9100 (vérifié : 403). Jamais `root@pam`. Rôle `NexoraProvision` (21 privilèges).
- **Nom et étiquettes** : VM `nx-<commande>` ; étiquettes `nexora;vps;client-<id de l'organisation>` ; les gabarits portent `nexora-template`. Les numéros de VM clients commencent à 10000 (ceux de Nexora sont sous 9200).
- **Pont séparé** `vmbr1` : réseau privé `10.77.0.0/24`, passerelle `10.77.0.1` sur pc5, aucun port physique. Script `/usr/local/sbin/nexora-vps-net.sh` (appelé par `post-up` de `vmbr1` dans `/etc/network/interfaces`) :
  - NAT (MASQUERADE) vers `vmbr0` pour les sorties vers Internet seulement ;
  - aucune route des VPS vers le LAN (10/8, 172.16/12, 192.168/16), le tailnet (100.64/10), le lien local, ni vers l'hôte pc5 (seul le ping de la passerelle est permis), ni d'un VPS à l'autre ;
  - entrées : SSH (22) seulement, depuis le worker (192.168.1.121), le LAN et le tailnet (pilote) ;
  - zone de suivi de connexion `CT --zone 1` sur `fwbr+` : sans elle, le NAT ne s'applique plus dès que le pare-feu Proxmox est actif (constaté : les VPS perdaient Internet).
- **Pare-feu Proxmox par VM** (posé par le moteur, appliqué parce que le pare-feu du centre de données est activé avec `policy_in ACCEPT` et `policy_out ACCEPT` : l'hôte reste ouvert comme avant) : entrée SSH et ping seulement, antiusurpation d'adresse IP et MAC, port 25 sortant fermé, sorties vers les réseaux privés fermées, DNS permis vers les résolveurs du réservoir (1.1.1.1 et 9.9.9.9).
- **Limites par VM** (module `packages/vps/src/limits.ts`) : poids CPU 50, disque 150 Mo/s en lecture et 75 Mo/s en écriture, 3000 et 1500 opérations/s, réseau 12 Mo/s (environ 100 Mbit/s).
- **Clé SSH** du client injectée par cloud-init (`sshkeys`), jamais de mot de passe ; le worker ajoute sa propre clé le temps de l'installation puis la retire.
- **Suppression** : arrêt, puis `DELETE` avec `purge` et `destroy-unreferenced-disks` : le volume `vm-<id>-disk-0` disparaît de `lvs` (prouvé, voir `docs/preuves/s6/e2e-vps-pc5.md`).

## 3. « Bare metal » : ce que cela veut dire ici

- pc5 est déjà un serveur nu (bare metal) avec Proxmox VE installé dessus : les VPS sont des machines virtuelles KVM sur ce métal. Il n'y a rien de plus « nu » à installer.
- Un service de VPS pour de vrais clients exige plus que ce serveur : plusieurs nœuds, un **bloc d'adresses IPv4 publiques** routé vers les VM, une liaison de **centre de données ou de colocation** avec une bonne bande passante, de l'alimentation et du réseau redondants, et un support. Une connexion résidentielle avec une seule adresse publique ne peut honnêtement pas héberger des clients payants à l'échelle.
- **Mode pilote qui fonctionne aujourd'hui** : réseau privé en NAT (`10.77.0.0/24`), accès par SSH depuis le LAN, le tailnet ou en rebond (`ssh -J pc5-proxmox debian@10.77.0.x`). Aucune adresse publique par VPS, aucun service exposé à Internet. Convient à l'essai fermé, pas à la vente.
- **Production** : Proxmox dans un centre de données avec un bloc IPv4 public (ou IPv6), le pont `vmbr0` ou un VLAN dédié portant ce bloc, le pare-feu de Nexora inchangé (il lie déjà le pare-feu à l'adresse), la plage saisie dans la fiche du serveur, `NEXORA_OUTBOUND_ALLOW` ajusté. Les prix restent à décider par le fondateur ; aucun chiffre de marché n'est avancé ici.
