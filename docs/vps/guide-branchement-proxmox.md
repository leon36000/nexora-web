# Guide de branchement d'un serveur Proxmox VE à Nexora

Destiné au personnel de Nexora. Ce guide ne contient que ce qu'il est **impossible d'automatiser** : tout le reste (nœud, capacité, stockages, pont réseau, image du système, gabarit) est découvert et préparé par Nexora lui-même quand vous cliquez sur **Connecter**.

:::note En bref
1. Installer **Proxmox VE 9.0 ou plus récent** et le rendre joignable.
2. Créer un compte, un rôle aux droits minimaux et un **jeton API** (une dizaine de commandes à copier-coller, section 3).
3. Réserver un **bloc d'adresses IPv4 libres** pour les VPS (section 4).
4. Activer le type de contenu **Import** sur le stockage `local` (section 5).
5. Dans Directus : module **VPS** ▸ **Connecter un serveur** (section 7).
:::

## 1. Ce que Nexora fait seul, et ce qu'il vous demande

| Étape | Qui |
|---|---|
| Installer Proxmox VE (version 9.0 ou plus) | Vous |
| Créer le compte, le rôle et le jeton API | Vous |
| Réserver le bloc d'adresses IPv4 des VPS | Vous |
| Ouvrir le port 8006 et la route vers le bloc d'adresses | Vous |
| Activer le contenu « Import » sur un stockage de type répertoire | Vous |
| Confirmer l'empreinte du certificat (premier contact) | Vous |
| Trouver le nœud, la version, le processeur, la mémoire | Nexora |
| Trouver les stockages compatibles et le pont réseau | Nexora |
| Proposer la capacité vendable et préremplir le réseau | Nexora |
| Télécharger l'image officielle Debian 12 ou Ubuntu 24.04 et vérifier sa somme de contrôle | Nexora (Proxmox télécharge) |
| Créer la VM modèle, y installer l'agent invité, la convertir en gabarit | Nexora |
| Vérifier le tout avant de déclarer le serveur « prêt » | Nexora |

## 2. Version de Proxmox VE requise

**Proxmox VE 9.0 ou plus récent** (basé sur Debian 13). Pourquoi cette version : Nexora s'appuie sur les droits `VM.GuestAgent.Audit` et `Sys.AccessNetwork` et sur le type de contenu « Import », tels que décrits par la documentation officielle de l'API de Proxmox VE 9. Les versions 8.x n'ont pas été vérifiées : le branchement les refuse avec le message « est trop ancien : la version 9.0 ou plus récente est requise ».

Autres conditions :

- Processeur x86-64 avec virtualisation (KVM) activée dans le BIOS. Les VM utilisent le type de processeur `host`.
- Environ **10 Go libres** sur le stockage d'import pour les images, plus l'espace des disques de VM.
- Pour vérifier la version : en haut à gauche de l'interface web, ou la commande `pveversion` sur le serveur.

## 3. Compte, rôle et jeton API

Nexora n'utilise **jamais** le compte `root` : il se connecte avec un compte dédié, qui n'a des droits que sur un pool de VM, les stockages utilisés, le nœud et les ponts réseau.

:::attention À exécuter une seule fois, en tant que root sur le serveur Proxmox
Ouvrir une console (interface web : nœud ▸ **Shell**, ou connexion SSH), puis copier-coller les commandes ci-dessous. Remplacer `pve` par le **nom de votre nœud** (visible dans l'arborescence de gauche, sous « Centre de données » ; commande `hostname`) et `local-lvm` / `local` par vos stockages si leurs noms diffèrent.
:::

### 3.1 Le rôle aux droits minimaux

Le rôle `NexoraProvision` contient exactement les 21 privilèges utilisés par Nexora (la commande tient sur plusieurs lignes grâce aux barres obliques inverses `\` : la copier en entier) :

```bash
pveum role add NexoraProvision --privs "\
Datastore.AllocateSpace Datastore.AllocateTemplate Datastore.Audit SDN.Use \
Sys.AccessNetwork Sys.Audit VM.Allocate VM.Audit VM.Clone VM.Config.CDROM \
VM.Config.CPU VM.Config.Cloudinit VM.Config.Disk VM.Config.HWType \
VM.Config.Memory VM.Config.Network VM.Config.Options VM.GuestAgent.Audit \
VM.PowerMgmt VM.Snapshot VM.Snapshot.Rollback"
```

Dans l'interface web : **Centre de données ▸ Permissions ▸ Rôles ▸ Créer**, nom `NexoraProvision`, puis cocher les mêmes privilèges.

### 3.2 Le pool, le compte et les droits

Le pool `nexora` regroupe toutes les VM de Nexora : le compte ne voit et ne touche **aucune autre VM** du serveur.

```bash
pveum pool add nexora --comment "VPS vendus par Nexora"
pveum user add nexora@pve --comment "Compte de provisionnement Nexora"
pveum acl modify /pool/nexora --users nexora@pve --roles NexoraProvision
pveum acl modify /storage/local-lvm --users nexora@pve --roles NexoraProvision
pveum acl modify /storage/local --users nexora@pve --roles NexoraProvision
pveum acl modify /nodes/pve --users nexora@pve --roles NexoraProvision
pveum acl modify /sdn/zones/localnetwork --users nexora@pve --roles NexoraProvision
```

Dans l'interface web : **Centre de données ▸ Permissions ▸ Utilisateurs ▸ Ajouter** (domaine « Proxmox VE authentication server »), **Centre de données ▸ Pool ▸ Créer**, puis **Permissions ▸ Ajouter ▸ Permission d'utilisateur** pour chacun des cinq chemins ci-dessous.

| Chemin | Rôle | À quoi il sert |
|---|---|---|
| `/pool/nexora` | `NexoraProvision` | Créer, configurer, démarrer, sauvegarder et supprimer les VM du pool |
| `/storage/local-lvm` | `NexoraProvision` | Créer les disques des VM (stockage des disques) |
| `/storage/local` | `NexoraProvision` | Télécharger et lire les images à importer (stockage d'import) |
| `/nodes/pve` | `NexoraProvision` | Lire l'état du nœud, les tâches, et faire télécharger l'image par le nœud |
| `/sdn/zones/localnetwork` | `NexoraProvision` | Brancher les VM sur le pont réseau (`vmbr0`…) |

### 3.3 Le jeton API

```bash
pveum user token add nexora@pve provision --privsep 0 --comment "Jeton Nexora"
```

Dans l'interface web : **Centre de données ▸ Permissions ▸ Jetons d'API ▸ Ajouter**, utilisateur `nexora@pve`, identifiant `provision`, **décocher « Séparation des privilèges »**.

:::important Le secret n'est affiché qu'une fois
Proxmox affiche `full-tokenid` (par exemple `nexora@pve!provision`) et `value` (un identifiant à rallonge). Le jeton à coller dans Nexora est les deux assemblés : `nexora@pve!provision=` suivi de la valeur, sans espace. Le copier tout de suite dans un gestionnaire de mots de passe ; ne jamais l'écrire dans un courriel ni un message. Si le secret est perdu, supprimer le jeton et en créer un autre.
:::

La séparation des privilèges est désactivée pour que les droits du jeton soient ceux du compte `nexora@pve`, déjà limités par les ACL ci-dessus (un seul endroit à gérer).

## 4. Réseau et bloc d'adresses

### 4.1 Pont réseau

Le nœud doit avoir un pont réseau relié à sa carte réseau (installation standard : `vmbr0`). Nexora le trouve seul ; s'il n'y en a aucun, le message est « Le nœud n'a aucun pont réseau » : créer un pont Linux (nœud ▸ **Système ▸ Réseau ▸ Créer ▸ Linux Bridge**, port du pont = la carte réseau).

### 4.2 Bloc d'adresses IPv4 des VPS

Chaque VPS vendu reçoit **une adresse IPv4 dédiée, fixe**. Il faut donc réserver, auprès de la personne qui gère le réseau, un bloc d'adresses :

| Information | Exemple | Remarque |
|---|---|---|
| Plage d'adresses libres | `192.168.1.100 - 192.168.1.150` | Contiguës, **hors de la plage DHCP** et jamais utilisées ailleurs |
| Masque (préfixe) | `24` (= 255.255.255.0) | Celui du réseau du pont |
| Passerelle | `192.168.1.1` | Doit être dans le même réseau que les adresses |
| Serveurs DNS | `192.168.1.1, 1.1.1.1` | Au moins un |

:::attention Pas de DHCP
Nexora n'attribue pas les adresses par DHCP : une adresse qui change couperait la VM (son pare-feu est lié à son adresse) et casserait l'accès du client. Si le réseau est géré par DHCP, **réserver un bloc à Nexora en dehors de la plage DHCP**.
:::

Une adresse du bloc sert aussi, quelques minutes, à la VM de préparation du gabarit. Prévoir donc au moins une adresse de plus que le nombre de VPS à vendre.

### 4.3 Flux à ouvrir

| De | Vers | Port | Pourquoi |
|---|---|---|---|
| Le worker de Nexora | Le serveur Proxmox | 8006/TCP (HTTPS) | API de Proxmox |
| Le worker de Nexora | Le bloc d'adresses des VPS | 22/TCP (SSH) | Préparer le gabarit et installer les applications |
| Le serveur Proxmox | `cloud.debian.org`, `cloud-images.ubuntu.com` | 443/TCP | Télécharger l'image du système |
| Le bloc d'adresses des VPS | Internet | 80 et 443/TCP, DNS | Installer des paquets pendant la préparation et par les applications |
| Le worker de Nexora | `cloud.debian.org`, `cloud-images.ubuntu.com` | 443/TCP | Lire les sommes de contrôle publiées |

Sur un réseau avec pare-feu, ouvrir ces flux avant de lancer le branchement. Test rapide depuis la machine du worker : `curl -k https://ADRESSE:8006/` doit répondre (une page ou du JSON).

### 4.4 Certificat de Proxmox

Une installation neuve de Proxmox a un certificat **auto-signé**. Nexora l'épingle : au premier contact, il affiche l'**empreinte SHA-256** du certificat, que vous comparez à celle de Proxmox avant de confirmer. Où la trouver : nœud ▸ **Système ▸ Certificats** (ligne `pve-ssl.pem`, colonne « Fingerprint »), ou la commande `pvenode cert info` sur le serveur. Si le serveur a un certificat reconnu publiquement (par exemple Let's Encrypt), la vérification classique suffit et rien n'est à épingler.

## 5. Stockage

Il faut **deux** capacités de stockage ; elles peuvent être sur le même stockage ou sur deux :

| Besoin | Type de contenu | Exemple | À faire |
|---|---|---|---|
| Disques des VM | « Disk image » (`images`) | `local-lvm` | Rien : présent par défaut |
| Images à importer | « **Import** » (`import`) | `local` | Activer (ci-dessous) |

Le contenu « Import » doit être porté par un stockage de type **répertoire** (comme `local`). Dans l'interface web : **Centre de données ▸ Stockage ▸ local ▸ Modifier ▸ Contenu**, ajouter **Import**, **OK**. En console :

```bash
grep -A4 '^dir: local' /etc/pve/storage.cfg
pvesm set local --content iso,vztmpl,backup,import
```

La première commande affiche le contenu actuel ; la seconde doit **reprendre ce contenu en y ajoutant `import`** (adapter la liste si elle diffère). Si « Import » y figure déjà, il n'y a rien à faire. Message affiché sinon : « Aucun stockage n'a le type de contenu « Import » ».

:::note Pourquoi pas automatique ?
Modifier la configuration d'un stockage demande le droit `Datastore.Allocate`, qui permet aussi de supprimer des volumes. Pour garder le jeton aux droits minimaux, cette étape reste manuelle.
:::

## 6. Côté Nexora : la clé SSH du worker (une seule fois par installation)

Aucune image cloud officielle ne contient l'agent invité de Proxmox, dont Nexora a besoin. Le worker prépare donc le gabarit en se connectant en SSH à une VM temporaire. Il faut qu'il ait sa clé :

```bash
ssh-keygen -t ed25519 -C nexora-worker -f nexora-worker -N ""
```

Dans Directus, module **Coffre** : ajouter le contenu du fichier `nexora-worker` (clé privée) sous la référence `vps.worker_ssh_key` (type « Autre »). Mettre la clé publique (`nexora-worker.pub`) dans la variable d'environnement `VPS_WORKER_SSH_PUBLIC_KEY` du worker, puis redémarrer le worker. Supprimer ensuite le fichier de clé privée du poste.

Sans cette clé, le branchement s'arrête à la première étape avec le message « La clé SSH publique du worker n'est pas configurée ».

## 7. Connecter le serveur dans l'administration

Dans Directus : module **VPS** ▸ onglet **Serveurs Proxmox** ▸ bloc **Connecter un serveur Proxmox**.

1. **Adresse du serveur** : nom ou adresse IP, avec le port si ce n'est pas 8006 (`pve.exemple.ca:8006`). Libellé et région sont facultatifs. Cliquer **Vérifier le serveur**.
2. **Empreinte du certificat** : Nexora affiche l'empreinte SHA-256, le sujet, l'émetteur et la validité. Comparer l'empreinte à celle de Proxmox (section 4.4), cocher **« J'ai comparé cette empreinte… »**. Rien n'est envoyé à Proxmox avant cette confirmation : seule la poignée de main TLS a eu lieu, sans jeton.
3. **Jeton API** : coller le jeton `utilisateur@realm!nom=secret` (section 3.3). Il est envoyé au Coffre (type « Proxmox ») puis effacé du formulaire ; il ne part vers Proxmox qu'avec l'empreinte épinglée. Cliquer **Connecter**.
4. **Valeurs découvertes** : Nexora affiche ce qu'il a trouvé et le préremplit : nœud, stockage des disques, stockage d'import, pont réseau, capacité vendable (vCPU, mémoire, disque), masque, passerelle et DNS. Les **problèmes bloquants** (en rouge) disent quoi faire ; corriger puis recliquer **Connecter** (rejouable, sans doublon). Les droits manquants du jeton sont listés un par un.
5. **Bloc d'adresses** : saisir la plage (une par ligne) ; le masque, la passerelle et les DNS sont déjà proposés. Nexora refuse un bloc incohérent et dit pourquoi (passerelle hors réseau, plage qui sort du réseau, adresse de diffusion, adresse du serveur Proxmox, chevauchement).
6. **Systèmes à préparer** : Debian 12 est coché ; Ubuntu 24.04 en option.
7. **Valider et préparer le serveur** : le worker travaille en arrière-plan (de quelques minutes à plus d'une demi-heure selon la vitesse de téléchargement). La page affiche l'état de chaque étape.

:::astuce Premier serveur réel
Nexora a été validé contre un **simulateur** de Proxmox, pas encore contre un vrai serveur. Au premier branchement réel, suivre les étapes une par une, ne pas modifier le serveur pendant la préparation, et signaler au développeur tout écart (message inattendu, étape bloquée) avec le texte exact affiché.
:::

## 8. Comprendre les états

| État | Signification |
|---|---|
| en attente | L'étape n'a pas commencé |
| en cours | Elle s'exécute en ce moment |
| réussi | Elle est terminée et vérifiée |
| rien à refaire | Déjà faite lors d'un essai précédent : rien n'est recréé |
| échec | Elle s'est arrêtée : la **cause** et l'**action à faire** sont écrites sous l'étape |

Étapes : **Connexion, version de Proxmox et droits du jeton** ▸ **Image** (téléchargement par Proxmox, somme vérifiée) ▸ **Gabarit** (VM de préparation, agent invité, conversion) ▸ **Vérification finale**. Le serveur ne passe à **prêt** que si **toutes** les étapes sont réussies. En cas d'échec, corriger la cause puis cliquer **Réessayer** : l'opération reprend, sans doublon (rien n'est retéléchargé ni recréé inutilement).

Ce que fait le gabarit, pour mémoire : image cloud officielle (Debian 12 « genericcloud », Ubuntu 24.04 « cloudimg ») dont la somme SHA-512 (Debian) ou SHA-256 (Ubuntu) est celle **publiée par l'éditeur** ; disque importé en `virtio-scsi`, processeur `host`, lecteur cloud-init, agent invité activé, console série ; numéro de VM à partir de 9000 ; nom `nexora-tpl-…`, étiquette `nexora-template`. Nexora ne modifie ni ne supprime jamais une VM qu'il n'a pas créée.

## 9. Dépannage

Les messages ci-dessous sont affichés tels quels par Nexora.

| Message affiché | Cause | Quoi faire |
|---|---|---|
| « Proxmox a refusé le jeton » | Identifiant ou secret incorrect, jeton expiré ou supprimé | Recréer le jeton (section 3.3) et le coller de nouveau |
| « Le serveur Proxmox n'est pas joignable depuis l'application » | Mauvaise adresse, serveur éteint, port 8006 fermé | Vérifier l'adresse et le pare-feu (section 4.3) |
| « Le serveur Proxmox ne répond pas dans le délai prévu » | Serveur surchargé ou réseau lent | Réessayer ; vérifier la charge du serveur |
| « le serveur ne parle pas TLS sur ce port » | L'adresse ou le port ne sont pas ceux de l'interface web de Proxmox | Utiliser le port 8006 |
| « serveur injoignable » | Connexion refusée à la vérification du certificat | Vérifier l'adresse et le pare-feu |
| « Le certificat présenté par le serveur ne correspond pas à l'empreinte confirmée » | Certificat renouvelé ou mauvais serveur | Relancer « Vérifier le serveur » et confirmer la nouvelle empreinte, après comparaison |
| « Le jeton n'est pas au Coffre » | Jeton non enregistré ou révoqué | Coller de nouveau le jeton |
| « Un autre serveur porte déjà cet identifiant. » | Identifiant déjà pris par un autre serveur | Choisir un autre identifiant |
| « est trop ancien : la version 9.0 ou plus récente est requise » | Proxmox VE 8 ou plus ancien | Mettre à jour Proxmox VE (section 2) |
| « Aucun nœud n'est visible avec ce jeton. » | Le jeton n'a pas `Sys.Audit` sur le nœud | Refaire l'ACL `/nodes/<nœud>` (section 3.2) |
| « n'existe pas sur ce serveur (nœuds : » | Nom de nœud inexact | Choisir un nœud de la liste |
| « Aucun stockage actif n'accepte les disques de VM » | Aucun stockage « Disk image » visible par le jeton | Donner l'ACL `/storage/<stockage>` (section 3.2) |
| « Aucun stockage n'a le type de contenu « Import » » | Contenu « Import » non activé | Section 5 |
| « Le nœud n'a aucun pont réseau » | Pas de pont `vmbr` | Section 4.1 |
| « Le jeton n'a pas tous les droits nécessaires » | Un droit manque (la liste complète est affichée) | Refaire le rôle et les ACL (section 3) |
| « Le jeton n'a pas un droit nécessaire » | Proxmox a refusé une opération faute de droit | Même action |
| « sort du réseau » | Une plage dépasse le réseau de la passerelle | Corriger les plages ou le masque |
| « contient l'adresse du réseau » | La plage commence à l'adresse du réseau (`.0`) | Commencer à `.1` ou plus |
| « contient l'adresse de diffusion » | La plage finit à l'adresse de diffusion (`.255`) | Finir avant |
| « déjà utilisée par le serveur Proxmox » | La plage contient l'adresse du serveur | Exclure cette adresse |
| « se chevauchent » | Deux plages ont des adresses communes | Fusionner ou séparer les plages |
| « adresses utilisables » | Moins de 5 adresses (simple avertissement) | Agrandir le bloc si besoin |
| « n'est pas le réseau du pont » | Le bloc n'est pas dans le réseau du pont (avertissement) | Normal seulement avec un VLAN ou un routage prévu |
| « La clé SSH publique du worker n'est pas configurée » | Section 6 non faite | Faire la section 6 |
| « Aucune adresse du bloc n'est libre » | Bloc épuisé ou trop petit | Agrandir le bloc |
| « La somme de contrôle publiée par l'éditeur est introuvable » | Le worker n'accède pas au site de l'éditeur | Ouvrir le port 443 vers `cloud.debian.org` / `cloud-images.ubuntu.com` |
| « La somme de l'image téléchargée ne correspond pas » | Fichier corrompu ou modifié, ou nouvelle version publiée entre-temps | Réessayer ; si cela se répète, **ne rien contourner** et prévenir le développeur |
| « n'a pas pu télécharger l'image » | Le serveur Proxmox n'accède pas à Internet | Vérifier DNS et passerelle du serveur Proxmox, port 443 |
| « Le téléchargement de l'image est trop long » | Connexion trop lente | Vérifier le débit, puis réessayer |
| « porte déjà le nom » | Une VM étrangère a le nom du gabarit | La renommer ou la supprimer dans Proxmox, puis réessayer |
| « n'a pas l'agent invité ou le lecteur cloud-init » | Gabarit existant modifié à la main | Le supprimer (il a été créé par Nexora) puis réessayer |
| « Aucun numéro de VM libre pour le gabarit » | Les numéros 9000 à 9049 sont tous pris | En libérer un |
| « n'est pas joignable en SSH depuis le worker » | Routage ou pare-feu entre le worker et le bloc d'adresses | Ouvrir le port 22 vers le bloc (section 4.3) |
| « La préparation à l'intérieur de la VM a échoué » | La VM de préparation n'accède pas à Internet | Vérifier passerelle et DNS du bloc |
| « ne répond pas à Proxmox » | L'agent invité ne démarre pas | Vérifier le droit `VM.GuestAgent.Audit` |
| « Le gabarit fabriqué n'est pas conforme » | Gabarit incomplet après conversion | Réessayer ; sinon consulter la VM dans Proxmox |
| « Le Coffre a refusé le jeton. » | Le Coffre n'a pas pu enregistrer le secret | Vérifier le module Coffre de Directus |
| « Le PDF du guide n'a pas été généré » | Le fichier PDF est absent du dépôt | Lancer `bun run guide:vps` |

Dans tous les cas, consulter aussi l'**historique des tâches** de Proxmox (nœud ▸ **Historique des tâches** en bas de l'interface web) : il donne le détail technique de l'opération qui a échoué.

## 10. Entretien

- **Remplacer un jeton** (rotation) : créer un nouveau jeton (section 3.3), puis dans Directus, **Modifier** le serveur ▸ **Coller le jeton Proxmox**. L'ancien jeton peut ensuite être supprimé dans Proxmox.
- **Ajouter un système** (par exemple Ubuntu après Debian) : refaire **Connecter** puis **Valider et préparer** en cochant le système voulu. Les gabarits déjà prêts ne sont pas refaits.
- **Mettre l'image à jour** : un nouveau branchement détecte la nouvelle somme publiée et télécharge la nouvelle version de l'image ; supprimer l'ancien gabarit dans Proxmox (VM `nexora-tpl-…`) pour qu'il soit refait.
- **Retirer un serveur** : le passer en « maintenance » ou « hors ligne » dans Directus (aucun VPS client n'y sera plus créé), puis seulement après migration de ses VPS, le supprimer de Proxmox.
