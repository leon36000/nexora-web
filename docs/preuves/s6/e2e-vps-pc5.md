# Preuve de bout en bout — VPS sur le vrai Proxmox pc5 (02/11/2026)

Pile de production de la VM 201 (`nexora-pile`), site atteint par le proxy frontal (même chemin que `tailscale serve`), Proxmox VE 9.2.2 réel (nœud `pve`). **Paiements : mode test**, simulateur officiel Stripe (`stripe-mock`) et webhooks SIGNÉS avec le secret du Coffre ; aucun paiement réel. Aucun secret n'est reproduit ici. Scripts rejouables : `deploy/vps/e2e-pc5/` (phases 1 à 3).

## Ce qui est prouvé
1. **Branchement** : `POST /api/admin/vps/connect/probe` lit le certificat de pc5 ; l'empreinte SHA-256 `af59c949…0b8a55` est identique à `pvenode cert info` (épinglée). `connect` avec le jeton `proxmox.pc5` : version 9.2.2, privilèges complets (`"privileges":{"ok":true,"missing":[]}`), aucun problème bloquant.
2. **Préparation** : `setup` (Debian 12) : l'image est téléchargée par Proxmox (somme SHA-512 publiée vérifiée), le worker crée la VM, installe l'agent invité par SSH à travers le pont `vmbr1` (NAT), convertit en gabarit : `ready — Proxmox VE 9.2.2, nœud pve, 1 gabarit(s) prêt(s)` (gabarit 9001 `nexora-tpl-debian-12-ci`, étiquette `nexora-template`, dans le pool `clients-vps`).
3. **Catalogue** : application `serveur-nu` + plans `nano`, `mini`, `standard` (prix de développement) → version brouillon (diff : 3 plans, 1 application, 0 problème) → approuvée → publiée → « Publier vers Stripe » (3 produits, 6 prix, chez le simulateur).
4. **Parcours client** (3 clients de test distincts) : inscription, courriel de vérification lu dans Mailpit, connexion, `POST /api/vps/checkout` (303 vers Stripe, commande `awaiting_payment`), webhooks signés `checkout.session.completed` puis `invoice.paid` → tâche `vps.provision` → VM clonée dans le pool → cloud-init → pare-feu → démarrage → script d'installation → `active`.
5. **Résultat sur Proxmox** (VM 10000, plan nano) : `tags: client-<org>;nexora;vps`, `cores: 1`, `memory: 512`, `cpuunits: 50`, `net0: …bridge=vmbr1,firewall=1,rate=12`, `scsi0: ssd-1tb:vm-10000-disk-0,…iops_rd=3000,iops_wr=1500,mbps_rd=150,mbps_wr=75,size=5G`, `ipconfig0: ip=10.77.0.10/24,gw=10.77.0.1`.
6. **SSH** : `ssh -i <clé du client> debian@10.77.0.10` depuis la VM 201 : `nx-445279d7`, utilisateur `debian`, `sudo -n` possible, témoin `/var/lib/nexora/serveur-nu.installed`. Depuis le VPS : Internet et DNS répondent (`https-out:200`) ; SMTP sortant (25), LAN (192.168.1.1), VM 201 et hôte pc5 sont **fermés** ; depuis la VM 201 les ports 80 et 8080 du VPS sont filtrés, seul le 22 est ouvert.
7. **Panneau** `/fr/compte/vps` (connecté en client) : « État : En marche », taille, région, adresse `10.77.0.11`, abonnement, prochaine échéance, accès SSH. Actions par `POST /api/account/vps/<id>/action` : `stop` → « Arrêté » (`qm status` : stopped) ; `start` → « En marche » ; `reboot` → « En marche ». Chaque appel : 202 `{"accepted":true}`.
8. **Impayé** : `invoice.payment_failed` → `past_due` (grâce jusqu'au 10/11) ; grâce échue (échéance avancée en base) → balayage → instance `suspended`, VM `stopped`, volume `vm-10002-disk-0` (5 Go) **conservé**.
9. **Résiliation** : `customer.subscription.deleted` → `canceled`, VM arrêtée, rétention jusqu'au 10/11 (7 jours), disque conservé (`lvs` : `vm-10000-disk-0 5.00g`). Échéance avancée en base → balayage → `deleted`.
10. **La suppression libère le disque** : avant, `lvs` montrait `vm-10000-disk-0 5.00g` et `vm-10000-cloudinit 4.00m` ; après, `qm list` et `lvs | grep vm-1000` : 0 ligne ; pool `clients-vps` : `[9001]` (le gabarit seul). `deploy/vps/reconcilier.sh` : `serveur pc5 : alloué 0 vCPU / 0 Mo / 0 Go pour un plafond de 8 vCPU / 4096 Mo / 60 Go` puis `OK : la base et Proxmox concordent, aucun orphelin`.
11. **Nettoyage** : les 3 VPS de test sont supprimés, les 3 comptes de test supprimés. Restent les 3 organisations « Essai VPS pc5 » et leurs commandes/événements (journal en ajout seulement, la base refuse les suppressions). pc5 : VM 201, 202, 203, 9000, 9001 (gabarit configuré), 9100 ; un seul jeton `nexora@pve!provision` ; aucun volume `vm-1000x`.

## Bogues trouvés sur le vrai Proxmox et corrigés (le simulateur ne les montrait pas)
| Symptôme | Cause réelle | Correctif |
|---|---|---|
| Gabarit : « Parameter verification failed » sur `/cluster/nextid` | Numéro 9000 pris : Proxmox répond 400, pas 500 | `setup.ts` accepte `invalid_request` ; simulateur rendu fidèle ; test avec une VM étrangère en 9000 |
| Provisionnement : 403 `Permission check failed (/vms/10000, VM.Audit)` | Un jeton limité à un pool reçoit 403 pour une VM inexistante ou hors pool | `findConfig` traite ce 403 comme « introuvable » ; `allocateVmid` confirme avec `/cluster/nextid` |
| Suppression : 400 « Only root may use this option » | `skiplock` est réservé à root@pam | Option retirée (client, opérations, provisionnement) |
| Suppression : 400 `purge: type check ('boolean') failed - got 'true'` | En chaîne de requête, Proxmox veut `1`/`0` | Booléens sérialisés en 1/0 ; l'erreur affiche maintenant le champ refusé |
| VPS sans Internet une fois le pare-feu activé | Le NAT ne s'applique pas aux connexions « pontées » sans zone de suivi dédiée | `iptables -t raw … -i fwbr+ -j CT --zone 1` (script du pont) |
| Le pont `vmbr1` était invisible du jeton | Proxmox ne lit que `/etc/network/interfaces`, pas `interfaces.d/` | Définition déplacée dans le fichier principal |
| Image du worker sans client SSH | `openssh-client` absent | Ajouté au Dockerfile |
| Variables Proxmox/SSH non transmises aux conteneurs | `compose.site.yml` ne les passait pas | `NEXORA_SECRET_HOSTS_PROXMOX`, `NEXORA_OUTBOUND_ALLOW`, `VPS_WORKER_SSH_PUBLIC_KEY` |
| Aucun produit « serveur seul » | Une application était obligatoire | Application `serveur-nu` (script sans installation) |

## Ce qui n'est pas prouvé
Facturation horaire (le moteur est mensuel/annuel par abonnement Stripe). Vraie clé Stripe de test (le fondateur n'en a pas déposé) : le parcours utilise `stripe-mock`. Réinstallation sur le vrai Proxmox. Reprise après `invoice.paid` d'une instance suspendue. Accès depuis Internet (aucune adresse publique : voir `capacite-et-isolation-pc5.md`).
