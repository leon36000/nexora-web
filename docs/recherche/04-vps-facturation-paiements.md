# Recherche 04 : VPS, provisionnement, facturation et paiements

**Projet :** site Nexora, hébergement d'agents et d'outils IA sur des serveurs au Québec, avec abonnements, paiements et administration dans Directus.
**Date du relevé :** 26 octobre 2026.
**Périmètre :** hébergement VPS, provisionnement, facturation, paiements, TPS et TVQ. Les volets vitrine, base de connaissances et Mistral ne sont traités qu'aux points de contact.

---

## 0. Méthode, fiabilité et limites

- **Étiquettes.** [P] : vérifié dans la source primaire (fichier LICENSE brut ou métadonnées GitHub, page officielle, documentation d'API). [S] : source secondaire (agrégateur, blog, forum, extrait de moteur de recherche) à confirmer avant tout engagement.
- **Dépôts GitHub.** Métadonnées lues via l'API GitHub non authentifiée le 26 octobre 2026. Le quota a été atteint pendant le relevé ; les licences ont alors été lues directement dans les fichiers LICENSE bruts. « Dernier push » désigne le champ `pushed_at` (dernier envoi de commits). « Dernière version » désigne la dernière release GitHub publiée.
- **Non vérifié ou bloqué.**
  - Page Revenu Québec : HTTP 403. Les taux de TVQ et de TPS ont été confirmés par des extraits de recherche officiels.
  - Helcim : page protégée par Cloudflare. Ses tarifs sont [S].
  - Fichier de licence propriétaire de Dokploy : 404 à l'URL testée.
  - Dépôt `btcpayserver-docker` : quota atteint, seul le README a pu être lu.
  - Catalogue d'applications CapRover : fichiers testés en 404, présence des applications non confirmée.
  - Tarifs Square et Moneris : sources contradictoires.
  - Intégrations Stripe, Lago et Kill Bill avec Next.js : non vérifiées.
- **Hygiène.** Aucune installation, aucun clone de dépôt, aucune lecture de secret ni de clé. Un fichier temporaire (copie de l'API Proxmox) a été créé puis supprimé dans le dossier personnel ; les autres fichiers temporaires sont dans le scratchpad.

---

## 1. Résumé exécutif

- **Noyau recommandé.** Proxmox VE comme hyperviseur (AGPL-3.0 ou ultérieure [P]). Un client d'API TypeScript maison dans Next.js, car les bibliothèques npm Proxmox sont anciennes : `proxmox-api` 1.1.1, dernière publication le 11 septembre 2024, licence GPL-3.0 [P]. Stripe Billing et Stripe Tax pour les abonnements et la TPS/TVQ. Directus comme source de vérité pour les offres, serveurs, modèles et moyens de paiement, sans aucun secret. Coolify (Apache-2.0 [P]) pour installer les applications.
- **Panneaux de facturation libres.** Paymenter (MIT [P]) et FOSSBilling (Apache-2.0 [P]) sont les seules options libres sérieuses. Convoy, panneau de VM sur Proxmox, n'est pas libre : son EULA interdit l'usage commercial sans licence payante [P].
- **Panneaux propriétaires.** WHMCS de 34,95 $/mois (250 clients) à 84,95 $/mois (1 000 clients) [P]. Blesta à partir de 17,95 $/mois [P]. HostBill en licence perpétuelle de 599 $ à 5 999 $ [P].
- **Hostinger.** Plan d'entrée KVM 1 à 6,49 $/mois en promotion, renouvelé à 11,99 $/mois, payé 24 mois d'avance [P]. Le sélecteur de localisation visible ne montre aucun centre de données canadien : c'est l'argument à exploiter pour Nexora.
- **Agents IA.** Hermes Agent (MIT [P]) et OpenClaw (MIT [P]) s'installent par script. Coolify propose déjà des modèles pour les deux, ainsi que pour n8n, Ollama + Open WebUI, LibreChat et Directus [P]. OpenClaw a des vulnérabilités critiques publiées en 2026 [S] : isolation obligatoire.
- **Licences à risque pour une revente.** n8n (Sustainable Use License : pas de mise à disposition payante à des tiers [P]). Open WebUI (clause de marque au-delà de 50 utilisateurs finaux sur 30 jours [P]). Dify (interdiction du multi-locataire sans accord écrit et retrait du logo interdit [P]). Flowise est archivé et en fin de vie le 31 août 2026 : à écarter [P].
- **Paiements.** Stripe Canada : 2,9 % + 0,30 $ CA par transaction carte domestique [P]. PayPal : 2,90 % + 0,30 $ [S]. Moneris est en cours de vente à Francisco Partners, annoncée le 10 août 2026 [S]. Interac Online a été fermé le 31 octobre 2024 [S].
- **Taxes.** TPS 5 % et TVQ 9,975 % [S]. Seuil de petit fournisseur : 30 000 $ [S]. Stripe Tax facture 0,5 % par transaction en intégration sans code, ou 0,50 $ CA en API, pour les territoires où l'entreprise est inscrite [P].

---

## 2. Étude de la page VPS de Hostinger

Source : https://www.hostinger.com/vps-hosting, lue le 26 octobre 2026 [P]. La page est en promotion « Black Friday ». La devise n'est pas indiquée (symbole $).

### 2.1 Offre affichée

| Plan | vCPU | RAM | NVMe | Bande passante | Prix promo / mois | Prix barré | Renouvellement / mois | Total 24 mois payé d'avance |
|---|---|---|---|---|---|---|---|---|
| KVM 1 | 1 | 4 Go | 50 Go | 4 To | 6,49 $ | 19,49 $ | 11,99 $ | 155,76 $ |
| KVM 2 (« Most popular ») | 2 | 8 Go | 100 Go | 8 To | 8,79 $ | 24,49 $ | 14,99 $ | 210,96 $ |
| KVM 4 | 4 | 16 Go | 200 Go | 16 To | 12,99 $ | 42,99 $ | 28,99 $ | 311,76 $ |
| KVM 8 | 8 | 32 Go | 400 Go | 32 To | 25,99 $ | 73,99 $ | 49,99 $ | 623,76 $ |

Inclus dans chaque plan : processeurs AMD EPYC, NVMe, sauvegardes hebdomadaires gratuites, pare-feu géré, API publique, 1 Gbit/s, domaine offert pendant un an, terminal web avec commandes en langage naturel. Garantie de remboursement de 30 jours. Tous les plans sont payés d'avance. Protection DDoS Wanguard, gestionnaire Docker et accès root sont listés séparément.

### 2.2 Structure de la page, dans l'ordre

1. **Bandeau promotionnel** : remise jusqu'à 70 %, garantie de 30 jours, support 24/7.
2. **Héros** : « VPS hosting », prix barré et prix d'appel (de 19,49 $ à 6,49 $/mois), bouton « Claim deal ».
3. **Trois arguments** : processeurs AMD EPYC et NVMe, sauvegardes hebdomadaires, commandes en langage naturel.
4. **Preuve sociale** : 4,6/5 sur 73 472 avis Trustpilot.
5. **Grille des plans** : quatre cartes, avec badge « Most popular » sur KVM 2 et badge « Special offer ».
6. **Liste de fonctionnalités** répétée deux fois.
7. **Cas d'usage** : agents IA et automatisation, auto-hébergement d'applications, applications et API, bases de données, sites à fort trafic. Chaque cas a trois puces « Recommended » et un bouton.
8. **Catalogue de déploiement en un clic** : 20 applications populaires, dont Hermes Agent, OpenClaw, n8n, Dify, Agent Zero, Buzz, 9router et Paperclip. Piles Docker + Traefik et OpenLiteSpeed + Node.js. Systèmes d'exploitation (AlmaLinux, Debian, Ubuntu, Alpine, Arch, Fedora, NixOS et autres). Panneaux (CloudPanel, Coolify, Dokploy, Cosmos, CyberPanel, Plesk, cPanel, etc.).
9. **Localisation** : « 10 centres de données sur 4 continents », sélection automatique selon la position. Liste visible : France, États-Unis, Inde, Brésil, Malaisie, Lituanie. Énergie annoncée à 100 % renouvelable.
10. **Assistance IA** : « Hostinger Agent » pour le dépannage, l'installation, le déploiement et la sécurité, et « Hostinger Connector » pour brancher des outils de code IA.
11. **Témoignages** : plusieurs clients citent la fiabilité du service ; deux mentionnent n8n.
12. **FAQ** de sept questions : définition d'un VPS, KVM, sécurité, logiciels personnalisés, prix, choix du plan, démarrage.
13. **Consentement aux cookies** avec option de refus, et répétition des boutons d'action.

### 2.3 Éléments qui convertissent

- **Ancrage de prix** : prix barré, prix mensuel et total pour 24 mois. Le total est clair, mais l'engagement de 24 mois et le renouvellement à 11,99 $ n'apparaissent qu'en petit texte sous le bouton. À éviter ou à déclarer clairement (voir section 10 sur la Loi sur la protection du consommateur).
- **Cartes de plans lisibles** : quatre chiffres par plan (vCPU, RAM, NVMe, bande passante), un plan mis en avant.
- **Segmentation par usage** : « agents IA » et « auto-hébergement » parlent directement à la cible de Nexora. C'est le point le plus transférable.
- **Catalogue d'applications** : réduit le risque technique perçu par un non-spécialiste.
- **Preuve sociale chiffrée** : 73 472 avis, et des témoignages qui citent des usages précis.
- **Réassurance** : garantie de 30 jours, sauvegardes hebdomadaires, support 24/7, pare-feu.
- **FAQ anti-objection** : elle répond aux questions de prix, de sécurité et de choix de plan avant que le visiteur ne les pose.
- **Assistant IA intégré** : argument d'accompagnement, présenté comme différenciateur.

### 2.4 Ce qu'il faut faire autrement pour Nexora

- **Localisation québécoise visible** : le sélecteur de Hostinger ne propose aucun centre canadien. Nexora doit afficher « Québec » comme argument principal, avec la résidence des données et le support en français.
- **Prix en dollars canadiens** : indiquer si les taxes sont incluses ou en sus, et afficher la TPS et la TVQ au paiement (section 8).
- **Transparence sur le renouvellement** : montrer le prix de renouvellement au même niveau que le prix d'appel.
- **Mention de la protection des renseignements personnels** (Loi 25) à côté des garanties.
- **Plans dimensionnés pour les agents** : les tailles de plan doivent être validées par des tests de charge sur Hermes, OpenClaw, n8n et Ollama. Aucune exigence matérielle n'a été vérifiée dans ce relevé.

---

## 3. Panneaux d'hébergement et de facturation

### 3.1 Tableau comparatif

| Projet | Licence [P] | Étoiles | Dernier push | Dernière version | Apport | Maturité | Intégration Docker / Next.js / Directus | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Paymenter** (github.com/Paymenter/Paymenter) | MIT | 2 804 | 2026-10-24 | v1.5.9 (2026-10-02) | Webshop et facturation pour hébergeurs, portail client, extensions | Active, 561 forks, version 1.x | Image Docker `ghcr.io/paymenter/paymenter` [S]. Stack PHP 8.3+ / Laravel [S]. Next.js et Directus : non vérifiés | **À évaluer** |
| **FOSSBilling** (github.com/FOSSBilling/FOSSBilling) | Apache-2.0 | 1 724 | 2026-10-26 | 0.8.9 (2026-10-23) | Facturation et gestion clients en PHP | Active, version 0.x | Non vérifiée | **À évaluer** |
| **Convoy** (github.com/ConvoyPanel/Panel) | EULA propriétaire, usage commercial payant [P] | 527 | 2026-10-23 | v4.6.2 (2026-10-23) | Panneau de VM Proxmox : réinstallation, alimentation, IP, ISO | Active | Proxmox ; modules WHMCS et Blesta par des tiers [S] | **Écarter** pour un usage commercial sans licence écrite |
| **WHMCS** (propriétaire) | Logiciel commercial, abonnement [P] | n/a | n/a | n/a | Référence de l'industrie, nombreux modules | Très mature | Modules Proxmox et autres via l'écosystème | **Écarter** comme cœur (coût récurrent, fermé) |
| **Blesta** (propriétaire) | Logiciel commercial [P] | n/a | n/a | n/a | Clients illimités, licence Branded ou Owned | Mature | Non vérifiée | **À évaluer** si un panneau propriétaire est retenu |
| **HostBill** (propriétaire) | Logiciel commercial, licence perpétuelle [P] | n/a | n/a | n/a | Licence unique, mises à jour d'un an | Mature | Non vérifiée | **À évaluer** si un panneau propriétaire est retenu |
| **Lago** (github.com/getlago/lago) | AGPL-3.0 [P] | 10 714 | 2026-10-26 | v1.55.0 (2026-10-07) | Facturation à l'usage, métrage et abonnements, API | Mature | Docker et Stripe non vérifiés ici | **À évaluer** (AGPL : publication des modifications si le service est offert en réseau) |
| **Kill Bill** (github.com/killbill/killbill) | Apache-2.0 [P] | 5 822 | 2026-10-23 | killbill-0.24.22 (2026-09-29) | Moteur d'abonnements et de paiements, complet et complexe | Mature, lourd pour une PME | Non vérifiée | **À évaluer** plus tard, **écarter** pour le MVP |
| **Stripe Billing** (service SaaS) | Service commercial | n/a | n/a | n/a | Abonnements, factures, relances, taxes | Très mature | SDK `stripe` 23.0.1, licence MIT, publié le 2026-10-22 [P] | **Adopter** |

### 3.2 Notes par projet

**Paymenter.** Panneau libre pour hébergeurs, sous licence MIT [P], avec un dépôt actif. Une extension Proxmox existe sur la place de marché officielle au prix de 24,99 $, pour les invités QEMU/KVM uniquement, avec Proxmox 8.4 ou plus [S]. Elle permet la création automatique, la réinstallation par le client, les graphiques d'usage, les sauvegardes et une console VNC [S]. Les avis relevés signalent des manques : pas de LXC, pas de gestionnaire de clés SSH, pas de bouton de réinitialisation du mot de passe, et une limite sur le CIDR cloud-init [S]. L'extension est payante et fermée : elle dépend d'un éditeur tiers. Paymenter reste l'option la plus rapide pour un portail client prêt à l'emploi.

**FOSSBilling.** Apache-2.0 [P], dépôt actif (dernier push le 26 octobre 2026). Version 0.8.9 publiée le 23 octobre 2026. Écosystème de modules serveur non vérifié pour Proxmox.

**Convoy.** Le dépôt ConvoyPanel/Panel n'est pas libre au sens de l'OSI. Son fichier LICENSE.md est une « Convoy Software End User License Agreement » (effective le 3 mars 2024, mise à jour le 7 juillet 2026) [P]. Elle autorise un usage personnel et non commercial, y compris le homelab. Tout usage commercial exige une licence payante, dont les frais peuvent dépendre du nombre de nœuds [P]. Les sous-licences et les forks commerciaux sont interdits sans accord [P]. Des résultats de recherche le décrivaient comme « Business Source License » : c'est inexact, et le texte [P] prévaut. Utile comme référence de fonctionnalités (réinstallation, alimentation, IP, ISO), pas comme brique à intégrer.

**WHMCS.** Tarifs officiels lus le 26 octobre 2026 [P] : version auto-hébergée Plus à 34,95 $/mois (250 clients), Professional à 54,95 $/mois (500 clients), Business à 84,95 $/mois (1 000 clients), hors taxes. Version cloud : Starter à 9,99 $/mois (25 clients), Growth à 25,00 $/mois (100 clients), Expansion à 75,00 $/mois (300 clients). Une hausse de prix est entrée en vigueur le 1er janvier 2026 [S]. Devise non précisée sur la page (probablement USD).

**Blesta.** Annonce officielle du 1er novembre 2025, lue le 26 octobre 2026 [P] : licences mensuelles Branded à 17,95 $/mois, Unbranded à 20,95 $/mois, Flex à 23,95 $/mois, support et mises à jour inclus. Licences Owned : Branded 350 $, Unbranded 425 $, Flex 500 $, avec un an de support puis 62 $/an. Hausse effective pour les nouveaux achats au 1er novembre 2025, et pour les abonnés existants au 1er janvier 2026 [P]. Clients illimités.

**HostBill.** Page officielle lue le 26 octobre 2026 [P] : licences perpétuelles en USD. Startup 599 $, Enterprise 999 $, Data Center 1 599 $, All-Inclusive 5 999 $. Mises à jour incluses un an, puis 125 $/an en option. Garantie de remboursement de 30 jours, pas d'essai gratuit annoncé. Les prix en PLN ou en abonnement trouvés ailleurs sont incohérents et ne sont pas retenus.

**Lago.** Dépôt principal getlago/lago, sous licence AGPL-3.0 [P], 10 714 étoiles, version 1.55.0. Le dépôt getlago/lago-api, également AGPL-3.0 [P], compte 443 étoiles. Un comparatif indique à tort une licence MIT [S]. L'AGPL impose de publier le code modifié si Lago est proposé comme service réseau : à prendre en compte si Nexora modifie Lago. Intégration Stripe non vérifiée.

**Kill Bill.** Apache-2.0 [P], 5 822 étoiles, dernière version killbill-0.24.22 publiée le 29 septembre 2026. Moteur complet pour abonnements et paiements, plus lourd que le besoin d'une PME au démarrage [S, comparatifs].

**Stripe Billing.** Facturation à l'usage de 0,7 % du volume facturé, en paiement à la carte ; plan annuel à partir de 770 CA$/mois sur un contrat d'un an, selon le volume [P, page Stripe Canada lue le 26 octobre 2026]. Les factures ponctuelles sont exclues de ce calcul.

### 3.3 Lecture : quel panneau pour Nexora

- **Option A (recommandée) : portail maison Next.js + Stripe Billing + Directus.** Contrôle total, intégration directe avec Directus et le provisionnement, coût de développement initial. Aucune licence de panneau à payer.
- **Option B : Paymenter (MIT) + extension Proxmox payante.** Portail client prêt à l'emploi, mais extension fermée à 24,99 $, dépendance à un éditeur tiers, et intégration Next.js et Directus à construire autour.
- **Option C : WHMCS, Blesta ou HostBill.** Propriétaires, coût récurrent ou licence à payer, moins de contrôle sur le code. Pertinent seulement si l'équipe ne peut pas construire le portail.

Pour un prototype jetable, Option B réduit le délai. Pour la production, Option A évite les licences de revente et garde Directus comme seul panneau d'administration.

---

## 4. Virtualisation et API

### 4.1 Proxmox VE

- **Licence.** AGPL-3.0 ou ultérieure, « AGPL-3+ » dans le fichier debian/copyright du dépôt miroir proxmox/pve-manager [P]. Utilisation commerciale permise. Toute modification distribuée, ou exposée en réseau, doit être publiée.
- **Authentification de l'API** (documentation officielle lue le 26 octobre 2026 [P]) :
  - Jeton d'API : en-tête `Authorization: PVEAPIToken=USER@REALM!TOKENID=UUID`. Pas de jeton CSRF nécessaire pour les écritures.
  - Ticket : `POST https://<serveur>:8006/api2/json/access/ticket` avec utilisateur et mot de passe. Le ticket dure 2 heures. Les écritures exigent alors l'en-tête `CSRFPreventionToken`.
  - Recommandation : jeton dédié au provisionnement, droits restreints à un pool ou à une liste de nœuds, valeurs stockées côté serveur uniquement.
- **Chemins d'API vérifiés** dans le visualiseur officiel (apidoc.js, lu le 26 octobre 2026 [P]) : `/nodes/{node}/qemu/{vmid}/clone`, `/nodes/{node}/qemu/{vmid}/config`, `/nodes/{node}/qemu/{vmid}/status/current`, `/status/start`, `/status/stop`, `/status/shutdown`, `/status/reboot`, `/status/reset`, `/status/suspend`, `/status/resume`.
- **Non vérifié.** Le paramètre `newid` du clone n'a pas pu être confirmé dans le visualiseur ; à valider. Les paramètres cloud-init (`ciuser`, `sshkeys`, `ipconfig0`, `nameserver`) et le suivi des tâches asynchrones (identifiant UPID) sont à confirmer dans le visualiseur.
- **Cloud-init.** Des forums rapportent des démarrages qui bouclent lorsque des clones sont configurés par API à partir d'un modèle [S]. Les procédures officielles de création de modèle cloud-init sont à lire avant tout test.

### 4.2 Incus (alternative)

- **Licence.** Apache-2.0 [P]. Dépôt lxc/incus : 6 497 étoiles, 512 forks, dernier push le 26 octobre 2026, version v7.0.2 publiée le 16 octobre 2026 [P].
- **Apport.** Conteneurs et machines virtuelles. Gestion par API REST, interface canonique. Accès distant en TLS, accès local par socket Unix [S, extraits de documentation].
- **Cloud-init.** Les données utilisateur doivent être définies avant le premier démarrage, donc créer avec `init` puis démarrer. Les machines virtuelles exigent un agent fonctionnel ou un disque cloud-init [S].
- **Actions d'état.** Le démarrage et l'arrêt passent par une requête PUT sur l'état de l'instance avec une action. Le schéma exact n'a pas été confirmé ; à vérifier dans la référence REST avant usage.
- **Verdict : à évaluer.** Aucun module de facturation prêt à l'emploi n'a été identifié pour Incus.

### 4.3 Piloter un VPS depuis Next.js

Principe : le serveur Next.js (routes de l'API, actions serveur ou worker) appelle Proxmox. Aucun jeton n'est jamais envoyé au navigateur. Les appels longs (clonage, démarrage) passent par une file de tâches.

| Action | Requête (Proxmox VE) | Statut |
|---|---|---|
| Lire la configuration | GET `/nodes/{node}/qemu/{vmid}/config` | [P] chemin confirmé |
| Cloner le modèle vers une nouvelle VM | POST `/nodes/{node}/qemu/{vmid}/clone` (paramètre `newid`) | [P] chemin, paramètre à confirmer |
| Configurer cloud-init (utilisateur, clé SSH, IP, DNS, CPU, RAM) | PUT `/nodes/{node}/qemu/{vmid}/config` | [P] chemin, paramètres à confirmer |
| Démarrer | POST `/nodes/{node}/qemu/{vmid}/status/start` | [P] |
| Arrêter proprement | POST `.../status/shutdown` | [P] |
| Arrêter de force | POST `.../status/stop` | [P] |
| Redémarrer | POST `.../status/reboot` | [P] |
| Suspendre, reprendre | POST `.../status/suspend`, `.../status/resume` | [P] |
| Lire l'état | GET `.../status/current` | [P] |
| Réinstaller | Arrêter, supprimer la VM, recloner le modèle, démarrer | Suppression à confirmer dans le visualiseur |

### 4.4 Bibliothèques npm

- `proxmox-api` 1.1.1 : GPL-3.0 [P], dernière publication le 11 septembre 2024. Peu entretenue ; licence GPL-3.0 (copyleft fort) à examiner avant tout usage.
- `node-proxmox` 0.1.2 : GPL-2.0 [P], dernière publication le 21 juin 2022. Obsolète.
- **Verdict : écarter.** Écrire un petit client typé avec `fetch`, limité aux chemins utilisés, testé contre une instance de test.

---

## 5. Applications en un clic et agents IA

### 5.1 Plateformes de déploiement

| Projet | Licence [P] | Étoiles | Dernier push | Dernière version | Apport | Maturité | Intégration | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Coolify** (coollabsio/coolify) | Apache-2.0 | 64 959 | 2026-10-26 | v4.5.0 (2026-10-23) | PaaS auto-hébergé, plus de 360 services annoncés, API v1 | Très mature | Docker ; API REST, Bearer ; 352 modèles de services vérifiés dans `templates/service-templates.json` | **Adopter** |
| **Dokploy** (Dokploy/dokploy) | Apache-2.0 pour le noyau ; dossier `/proprietary` sous licence séparée [P] | 38 058 | 2026-10-26 | v0.30.10 (2026-10-22) | PaaS auto-hébergé, alternative à Coolify | Mature | Docker ; API par en-tête `X-API-Key` [S] ; routes tRPC `/api/application.deploy` [S] | **À évaluer** |
| **CapRover** (caprover/caprover) | Apache-2.0 [P] | 15 192 | 2026-10-26 | v1.15.5 (2026-10-23) | PaaS basé sur Docker et nginx | Mature | Docker ; catalogue d'applications non vérifié | **À évaluer** |

**Coolify.** Trois points vérifiés. Le catalogue inclut `hermes-agent` (avec et sans interface web), `openclaw`, `n8n` (trois variantes), `ollama-with-open-webui`, `open-webui`, `flowise`, `librechat`, `paymenter` et `directus` [P]. Aucun modèle Dify n'a été trouvé [P]. L'API v1 se trouve sous `https://<domaine>/api/v1`, avec un jeton Bearer. Le déploiement se lance par `POST /api/v1/deploy?uuid=...&force=...` [P, extrait de la documentation officielle]. Les jetons peuvent être limités à une équipe et à une durée. L'accès API se configure dans les réglages, avec une liste d'IP autorisées.

**Dokploy.** Clé d'API créée dans les réglages, envoyée dans l'en-tête `X-API-Key`. Un skill tiers indique que `Authorization: Bearer` est rejeté en 401 [S]. Le format exact du corps de requête n'est pas confirmé : à tester sur une instance de test. Sources contradictoires sur le nombre de points d'accès (449 à 546 selon les sources) [S].

**CapRover.** Dépôt caprover/caprover sous Apache-2.0 [P], version 1.15.5. Le dépôt caprover/one-click-apps existe (branche `master`), mais les fichiers testés pour n8n, Ollama, Open WebUI, Dify, Flowise, LibreChat, Hermes, OpenClaw et Paymenter renvoient 404. Le catalogue n'est donc pas confirmé.

### 5.2 Agents et applications IA

| Projet | Licence [P] | Étoiles | Dernier push | Dernière version | Apport | Installation | Intégration | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Hermes Agent** (NousResearch/hermes-agent) | MIT, « Copyright (c) 2025 Nous Research » | 257 419 | 2026-10-27 | v0.22.5 (2026-10-23) | Agent qui apprend, multi-canal, sous-agents | Script `curl -fsSL https://hermes-agent.nousresearch.com/install.sh \| bash` ; PowerShell `install.ps1` | Modèle Coolify `hermes-agent` et `hermes-agent-with-webui` [P] ; un one-click chez Hostinger [P] | **Adopter**, avec durcissement |
| **OpenClaw** (openclaw/openclaw) | MIT, « Copyright (c) 2026 OpenClaw Foundation » | 393 160 | 2026-10-27 | 2026.10.7 (2026-10-24) | Assistant personnel multi-canal | Script `curl -fsSL https://openclaw.ai/install.sh \| bash`, ou `npm install -g openclaw@latest`, puis `openclaw onboard --install-daemon` | Modèle Coolify `openclaw` [P] ; un one-click chez Hostinger [P] | **À évaluer**, sandbox obligatoire |
| **n8n** (n8n-io/n8n) | Sustainable Use License (fair-code, pas OSI) [P] | 208 678 | 2026-10-27 | n8n@2.44.7 (2026-10-26) | Automatisation de workflows, plus de 400 intégrations | Docker | Modèles Coolify (trois variantes) [P] | **À évaluer** (licence) |
| **Ollama** (ollama/ollama) | MIT [P] | 184 900 | 2026-10-27 | v0.40.11 (2026-10-24) | Exécution de modèles locaux | Docker | Tag `:ollama` d'Open WebUI [P] | **Adopter** (usage réel exige un GPU) |
| **Open WebUI** (open-webui/open-webui) | Open WebUI License, clause de marque [P] | 156 857 | 2026-10-27 | v0.12.4 (2026-10-25) | Interface de chat multi-modèles | `docker run ... ghcr.io/open-webui/open-webui:main` [P] | Modèles Coolify [P] ; tags `:ollama` et `:cuda` [P] | **À évaluer** (licence) |
| **Dify** (langgenius/dify) | Apache 2.0 modifiée, avec restrictions [P] | 159 632 | 2026-10-27 | 1.18.0 (2026-10-23) | Applications LLM, RAG, agents | Docker | Pas de modèle Coolify [P] | **À évaluer** (licence) |
| **Flowise** (FlowiseAI/Flowise) | Apache-2.0 pour le noyau ; dossier enterprise sous licence distincte [P] | 55 531 | Archivé le 2026-08-13 [P] | Dernier état avant archivage | Constructeur visuel d'agents | Docker, npm | Modèles Coolify (obsolètes) | **Écarter** |
| **LibreChat** (LibreChat-AI/LibreChat) | MIT [P] | 46 357 | 2026-10-26 | Pas de release GitHub | Assistant multi-fournisseurs | Docker Compose | Modèle Coolify `librechat` [P] | **Adopter** |
| **Directus** (directus/directus) | Monospace Sustainable Core License 1.0 (MSCL-1.0-GPL) [P] | 38 640 | 2026-10-26 | v12.5.1 (2026-10-23) | Administration et API headless | Docker | Modèle Coolify `directus` [P] ; SDK `@directus/sdk` 27.0.0, MIT, publié le 2026-10-07 [P] | **Adopter** pour l'administration interne |

**Hermes Agent.** Installation : script `install.sh` pour Linux, macOS, WSL2 et Termux ; `install.ps1` pour Windows natif [P]. L'installeur installe Python 3.14, Node.js, ripgrep et FFmpeg [P]. Six backends de terminal (local, Docker, SSH, Modal, Daytona, Vercel Sandbox) [P]. Un script `curl | bash` s'exécute sans relecture : le lire avant de l'exécuter sur un serveur client.

**OpenClaw.** Installation : script `install.sh`, ou npm, puis onboarding avec `openclaw onboard --install-daemon` [P]. Le dépôt est un espace de travail pnpm, et `npm install` à la racine n'est pas supporté [P].

Vulnérabilités 2026 [S, bulletin AhnLab et agrégateur CVE, à vérifier dans NVD et les avis GitHub] :
- CVE-2026-28466 : exécution de code à distance par contournement d'une approbation de nœud, CVSS 9,9, corrigée avant 2026.2.14.
- CVE-2026-28391 : injection de commande via un contournement d'analyse de cmd.exe, CVSS 9,8, corrigée avant 2026.2.2.
- CVE-2026-30741 : non corrigée au moment du bulletin AhnLab.
- Un bulletin couvre des contournements d'authentification, des élévations de privilèges et des évasions de bac à sable.

Conséquence : un VPS par client, pare-feu strict, aucune exposition publique du tableau de bord, mises à jour suivies.

**n8n.** Sustainable Use License [P] : usage interne ou non commercial ; distribution ou mise à disposition à des tiers uniquement gratuite et à usage non commercial. Les fichiers contenant `.ee.` sont hors licence. Nexora ne peut donc pas facturer n8n à des clients sans accord commercial avec n8n. Pour les clients qui l'installent eux-mêmes sur leur propre VPS, la question est à faire trancher juridiquement.

**Open WebUI.** Licence [P] : la clause de marque interdit de retirer ou modifier la marque « Open WebUI », sauf si le déploiement compte au plus 50 utilisateurs finaux sur 30 jours glissants, ou avec une autorisation écrite, ou une licence entreprise. Une PME qui dépasse 50 utilisateurs sur une même instance impose donc une licence entreprise ou le maintien de la marque.

**Dify.** Licence [P] : Apache 2.0 modifiée. Interdiction d'utiliser le code pour exploiter un environnement multi-locataire sans accord écrit, un locataire correspondant à un espace de travail. Interdiction de retirer le logo et le copyright de l'interface. Un VPS dédié par client est compatible ; une instance partagée entre clients ne l'est pas.

**Flowise.** Annonce officielle [P] : gel du code le 29 juillet 2026, archivage du dépôt le 10 août 2026 selon l'annonce (le dépôt est archivé dans l'API depuis le 13 août), fin de vie le 31 août 2026. Aucun successeur. Le projet encourage à forker [P]. Un rapport tiers signale six avis de sécurité élevés ou critiques pour les versions 3.1.4 et antérieures, publiés le 10 septembre 2026 sans correctif [S]. Le dossier enterprise est sous licence distincte [P].

**Directus.** Licence MSCL-1.0-GPL [P] : usage interne et accès permis ; fourniture de services professionnels à un client, y compris le déploiement ou l'hébergement pour le client, permise ; mise à disposition qui concurrence l'offre commerciale de Directus, facturée, interdite (« Competing Use »). La licence passe sous GPL-3.0 quatre ans après sa publication. GitHub affiche « NOASSERTION » car le fichier n'est pas standard. Pour Nexora, l'usage est clairement permis : l'administration interne. La revente d'une instance Directus à un client est à faire valider juridiquement.

**LibreChat.** Licence MIT [P], « Copyright (c) 2026 LibreChat ». Le dépôt a déménagé de danny-avila/LibreChat à LibreChat-AI/LibreChat ; la redirection est vérifiée [P].

### 5.3 Matrice « peut-on revendre ? »

| Projet | Un VPS dédié à un client | Plusieurs clients payants sur une même instance | Clauses à respecter | Décision |
|---|---|---|---|---|
| Hermes Agent (MIT) | Oui | Oui | Conserver la notice de copyright | Libre |
| OpenClaw (MIT) | Oui | Oui | Mises à jour de sécurité, isolation | Libre, sous réserve de la sécurité |
| Coolify (Apache-2.0) | Oui | Oui | Conserver les notices | Libre |
| Dokploy (Apache-2.0 + dossier propriétaire) | Oui | À vérifier pour le dossier `/proprietary` | Ne pas utiliser les fonctions propriétaires sans licence | À évaluer |
| n8n (SUL) | À valider | Non sans accord | Usage interne ou non commercial | Accord commercial requis |
| Ollama (MIT) | Oui | Oui | Conserver la notice | Libre |
| Open WebUI | Oui si moins de 50 utilisateurs | Non sans licence entreprise si plus de 50 | Garder la marque | Licence à négocier |
| Dify | Oui | Non (multi-locataire) | Garder le logo | Par client seulement |
| LibreChat (MIT) | Oui | Oui | Conserver la notice | Libre |
| Directus (MSCL) | Interne : oui | Services professionnels : oui ; revente concurrente : non | Pas de concurrence avec l'offre commerciale | Interne : libre ; revente à valider |
| Flowise | Non | Non | Archivé | Écarter |
| Convoy | Non sans licence | Non sans licence | EULA payante | Écarter |

Cette matrice n'est pas un avis juridique. Elle résume les textes lus le 26 octobre 2026.

---

## 6. Moteurs d'abonnement et de facturation

| Moteur | Licence / modèle | Coût | Usage conseillé pour Nexora |
|---|---|---|---|
| **Stripe Billing** | Service commercial | 0,7 % du volume facturé (à l'usage), ou abonnement annuel à partir de 770 CA$/mois [P] | Abonnements mensuels, relances, factures, portail client |
| **Lago** | AGPL-3.0 [P] | Auto-hébergé, sans coût de licence ; AGPL à respecter | Facturation à l'usage, si Nexora mesure des consommations (jetons, heures) |
| **Kill Bill** | Apache-2.0 [P] | Auto-hébergé ; complexité élevée | Plus tard, pour de gros volumes |
| **FOSSBilling** | Apache-2.0 [P] | Auto-hébergé | Alternative si le portail doit être libre et prêt à l'emploi |
| **Paymenter** | MIT [P] | Auto-hébergé ; extension Proxmox à 24,99 $ [S] | Portail prêt à l'emploi (option B) |

**Recommandation.** Stripe Billing pour les abonnements et les paiements. Lago seulement si la facturation à l'usage devient un besoin. Kill Bill écarté pour le MVP.

---

## 7. Moyens de paiement pour le Québec et le Canada

| Moyen | Frais publics | Autres éléments | Statut et risques | Verdict |
|---|---|---|---|---|
| **Stripe (Canada)** | Standard : 2,9 % + 0,30 $ CA par transaction carte domestique ; +0,5 % saisie manuelle ; +0,8 % carte internationale ; +2 % si conversion de devise [P] | Terminal : 0,15 $ CA par transaction Interac en personne [P] ; litige reçu : 15 $ CA [P] ; factures : 0,4 % par facture payée [P] ; Stripe Tax : 0,5 % par transaction en intégration sans code ou 0,50 $ CA en API, une fois inscrit [P] | Pas de frais d'installation ni mensuels [P] | **Adopter** |
| **PayPal (Canada)** | Commerce standard : 2,90 % + 0,30 $ CA [S] ; QR : 1,90 % ou 2,40 % selon le montant [S] | Surcharge international : +0,80 % (États-Unis) ou +1,00 % (autres) [S] | Chiffres de comparateurs tiers divergents (2,99 % ; +1,5 %) ; la page officielle fait foi [S] | **À évaluer** (complément) |
| **Square (Canada)** | En ligne : 2,9 % + 0,30 $ [S] ; en personne : 2,5 % à 2,65 % selon la source [S] ; saisie : 3,3 % à 3,4 % + 0,15 $ [S] ; Interac débit : 0,75 % + 0,07 $ (ancien tarif officiel) [S] | Terminal ; frais internationaux depuis le 3 mars 2026 [S] | Chiffres contradictoires, à confirmer sur la page officielle | **À évaluer** (surtout terminal) |
| **Moneris** | Chiffres d'un comparateur (Helcim) : 2,65 % + 0,10 $ en personne ; 2,85 % + 0,30 $ saisie ou en ligne [S] | Vente annoncée le 10 août 2026 : RBC et BMO vendent Moneris à Francisco Partners pour environ 2 milliards CA ; clôture visée à la fin du premier trimestre de l'exercice 2027, sous réserve d'approbations [S] ; environ un tiers des transactions carte au Canada [S] | Grille non confirmée ; contrats de 3 à 4 ans selon un consultant [S] | **À évaluer** après la clôture de la vente |
| **Helcim** | Interchange plus : 0,35 % + 0,07 $ en personne, 0,45 % + 0,20 $ sans carte présente (palier de 50 001 à 100 000 $/mois) [S] ; Interac débit : 0,09 $ (puce et NIP) [S] | Divulgation datée du 2 février 2026, en vigueur le 1er avril 2026 [S] | Page officielle protégée, tarifs [S] | **À évaluer** |
| **Interac e-Transfer** | Frais fixés par chaque banque ; Scotiabank : 1,00 $ par virement pour les comptes d'affaires de moins de 20 virements par mois [S] | Interac Online a été fermé le 31 octobre 2024 [S] | Virement manuel, pas un processeur de paiement en ligne | **À évaluer** (paiement manuel de factures) |
| **BTCPay Server** (btcpayserver/btcpayserver) | MIT [P], version 2.4.6 (2026-10-26), 7 858 étoiles | Déploiement Docker officiel (dépôt `btcpayserver-docker`, README lu [P]) ; paiements en bitcoin | Niche ; ne règle pas la facturation en dollars canadiens | **À évaluer** (option) |

**Notes.**
- Stripe couvre à la fois le paiement, les abonnements, les factures et les taxes : c'est le choix principal.
- PayPal et Square complètent le paiement, mais ajoutent de la complexité de réconciliation.
- Moneris ne doit pas être choisi tant que la vente n'est pas close et que les conditions ne sont pas écrites.
- Interac ne sert pas à un checkout en ligne. Il peut servir au paiement manuel de factures.
- BTCPay n'est utile que si Nexora accepte le bitcoin. Il n'est pas prioritaire.

---

## 8. TPS, TVQ et factures conformes

### 8.1 Taux et seuils

- **TPS** : 5 % [S, Revenu Québec, via extraits de recherche].
- **TVQ** : 9,975 % [S, Revenu Québec, via extraits de recherche].
- **Calcul en deux étapes** : TPS de 5 % sur le prix, puis TVQ de 9,975 % sur le même prix. **Calcul en une étape** : taux combiné de 14,975 %. Une tolérance d'arrondi existe à 9,97 % (deux étapes) ou 14,97 % (une étape) si la caisse ne gère pas trois décimales [S].
- **Petit fournisseur** : chiffre d'affaires taxable de 30 000 $ ou moins sur un trimestre civil ou sur les quatre trimestres précédents [S]. Le statut prend fin après quatre trimestres consécutifs au-dessus du seuil [S].
- **Inscription obligatoire** au-delà du seuil, dès que l'activité s'exerce au Québec [S].
- **Vérification à faire** : la page Revenu Québec sur le petit fournisseur a renvoyé 403. Les taux et seuils sont donc issus d'extraits. À confirmer sur le site officiel avant la mise en production.

### 8.2 Taxes et paiement

- **Stripe Tax** calcule la taxe selon l'adresse du client et l'inscription de l'entreprise. Une fois inscrit, il facture 0,5 % par transaction (intégration Billing, Checkout, factures) ou 0,50 $ CA par transaction (API) [P].
- **Taxe harmonisée** (TVH) dans les provinces harmonisées : à calculer selon la province du client, Stripe Tax sait le faire [P, fonctionnalité annoncée].
- **Lieu de fourniture des services électroniques** : règles spécifiques pour les services numériques vendus à des clients hors Québec : à faire confirmer par un comptable avant lancement.

### 8.3 Factures

Mentions à prévoir (à faire valider) :
- raison sociale et numéros d'inscription TPS et TVQ ;
- description du service, période, prix hors taxes, TPS et TVQ séparés, total ;
- devise (CAD) et date ;
- conservation des registres (durée généralement de six ans au Québec, à confirmer).

Stripe Invoicing génère les factures PDF à partir des abonnements. Les numéros d'inscription se paramétrent dans Stripe. Ce point est à confirmer avec le comptable.

---

## 9. Architecture VPS et facturation recommandée

### 9.1 Composants

| Composant | Rôle | Technologie | Remarque |
|---|---|---|---|
| Site public et espace client | Catalogue, panier, paiement, suivi du service, accès SSH | Next.js (App Router, routes serveur) | Aucun secret côté navigateur |
| Administration | Offres, serveurs physiques, modèles, moyens de paiement, commandes | Directus | Seule source de configuration |
| Paiement et facturation | Abonnements, factures, taxes, relances | Stripe Billing, Stripe Tax, Stripe Invoicing | Webhooks Stripe signés |
| Worker de provisionnement | Clonage, démarrage, suspension, réinstallation | Next.js ou service Node dédié, file de tâches | Appels longs, reprise en cas d'échec |
| Hyperviseurs | Machines virtuelles par client | Proxmox VE sur serveurs au Québec | Modèles cloud-init, pare-feu par VM |
| Applications | Installation d'Hermes, OpenClaw, n8n, Ollama + Open WebUI, LibreChat | Coolify (API v1) sur chaque VM, ou central | Modèles existants vérifiés |
| Sauvegardes | Sauvegarde des VM | À évaluer (Proxmox Backup Server non recherché ici) | Politique de rétention à définir |
| Journalisation | Trace des actions de provisionnement | Table Directus ou base dédiée | Pas de jeton dans les journaux |

### 9.2 Flux commande, paiement, provisionnement, accès

```
Visiteur
  -> Next.js : choisit une offre publiée dans Directus (prix en CAD)
  -> Stripe Checkout ou Payment Element : taxes calculées par Stripe Tax (TPS, TVQ, TVH)
  -> Webhook Stripe signé (checkout.session.completed, invoice.paid)
  -> Next.js : crée la commande et le service dans Directus, état « payé »
  -> Worker : choisit un serveur Proxmox disponible dans la région Québec (capacité, pool d'IP)
  -> Proxmox : clone du modèle -> config cloud-init (clé SSH du client, IP, DNS) -> start
  -> Attente de l'IP et de l'agent (tâches asynchrones)
  -> Coolify : installation de l'application choisie (modèle), via l'API v1
  -> Directus : service « actif », IP et accès enregistrés
  -> Email au client, accès au tableau de bord du service
```

Renouvellement : webhook `invoice.paid` -> service maintenu. Échec de paiement -> période de grâce, puis suspension par arrêt de la VM via l'API. Résiliation -> suppression de la VM après délai et sauvegarde.

Accès client : clé SSH (jamais de mot de passe en clair), tableau de bord avec état, bouton de redémarrage, réinstallation par appel API. La console passe par un proxy côté Nexora ; l'interface Proxmox n'est jamais exposée aux clients.

### 9.3 Ce qui se configure dans Directus

| Collection | Champs principaux | Visibilité |
|---|---|---|
| **Offres** (plans) | code, nom, vCPU, RAM, disque NVMe, bande passante, prix mensuel CAD, prix annuel CAD, identifiant de prix Stripe (référence, pas un secret), modèle Proxmox, applications incluses, publiée (oui/non) | Publique en lecture pour les offres publiées |
| **Serveurs physiques** | nom d'hôte, nœud Proxmox, région (Québec), ville et centre de données, capacité CPU, RAM et disque, pool d'IP, statut (prêt, maintenance, hors service), URL de l'API, référence du secret (nom de la variable d'environnement, jamais la valeur) | Administration seulement |
| **Modèles OS** | nom, système, version cloud-init, identifiant de modèle par nœud (VMID), somme de contrôle, statut | Administration seulement |
| **Moyens de paiement** | fournisseur, mode (test ou production), activé, ordre d'affichage, devises, frais affichés (texte), identifiants publics seulement | Administration seulement |
| **Taxes** | TPS, TVQ, TVH, numéros d'inscription (publics), date d'entrée en vigueur | Lecture pour le site |
| **Applications** | nom, identifiant de modèle Coolify, licence, avertissement de licence, supplément de prix, statut | Lecture pour le site |
| **Commandes et services** | client (référence), offre, serveur, VMID, IP, état (payé, provisionnement, actif, suspendu, résilié), journal | Lecture seule pour les opérateurs ; écrit par le worker |

**Règle de sécurité.** Les clés secrètes (Stripe, jeton Proxmox, jeton Coolify) ne sont jamais enregistrées dans Directus. Elles restent dans les variables d'environnement ou dans un gestionnaire de secrets. Directus ne contient que leurs noms et leur état. Cela évite qu'un compte d'éditeur ne lise un secret.

**Brancher un serveur physique (procédure).** Ajouter la fiche serveur dans Directus, installer Proxmox, créer un jeton d'API limité, en placer la valeur dans le gestionnaire de secrets, lancer un test de connexion par le worker, puis passer le statut à « prêt » et ajouter le pool d'IP.

**Publier une offre.** Créer la fiche dans Directus, créer le prix correspondant dans Stripe (identifiant copié dans la fiche), vérifier le modèle Proxmox, passer « publiée » à oui.

### 9.4 Cycle de vie

- **Création** : clonage, cloud-init, démarrage, installation de l'application, email.
- **Arrêt et démarrage** : appels API sur `status/shutdown`, `status/stop`, `status/start`.
- **Réinstallation** : arrêt, suppression, nouveau clonage du modèle, démarrage. Les données doivent être sauvegardées avant.
- **Suspension** : après non-paiement, arrêt de la VM, conservation des données pendant une période de grâce à définir.
- **Résiliation** : suppression après délai, selon la politique à définir.

### 9.5 Décisions à prendre

1. Portail maison Next.js (Option A) ou Paymenter (Option B) pour le prototype.
2. Coolify installé sur chaque VM ou central piloté par API.
3. Sauvegardes : Proxmox Backup Server ou autre solution.
4. Accord commercial à demander à n8n avant toute offre payante.
5. Licence entreprise à négocier pour Open WebUI si une instance dépasse 50 utilisateurs.
6. Dify limité aux instances dédiées par client.
7. Choix du processeur de paiement principal (Stripe) et des secondaires (PayPal, Square).

---

## 10. Risques et points à faire valider

**Juridique.**
- n8n : pas de mise à disposition payante à des tiers sans accord.
- Open WebUI : clause de marque.
- Dify : multi-locataire et logo.
- Directus : revente concurrente interdite ; usage interne permis.
- Convoy : EULA payante pour tout usage commercial.
- AGPL (Proxmox, Lago) : publication du code modifié si offert en réseau.

**Fiscal.** TPS, TVQ et TVH (taux, seuil, inscription), lieu de fourniture des services électroniques, mentions obligatoires des factures, conservation des registres. Un comptable doit valider.

**Consommateur (Québec).** Affichage des prix, taxes et renouvellements automatiques : à vérifier au regard de la Loi sur la protection du consommateur. Protection des renseignements personnels : Loi 25, à vérifier.

**Sécurité.** OpenClaw : vulnérabilités critiques publiées en 2026 [S]. Scripts `curl | bash` à relire avant exécution. Un VPS par client, pare-feu strict, pas de tableau de bord exposé, jetons à droits minimaux.

**Dépendances commerciales.**
- Flowise archivé et en fin de vie.
- Interac Online fermé.
- Moneris en cours de vente.
- Coût de WHMCS en hausse depuis le 1er janvier 2026 [S].
- Convoy dépend d'une licence commerciale d'un éditeur unique.

**Vérifications restantes.**
- Paramètre `newid` du clonage Proxmox et suivi des tâches.
- Schéma exact des actions d'état Incus.
- Format des requêtes Dokploy.
- Catalogue CapRover.
- Tarifs Square et Moneris sur les pages officielles.
- Tarifs Helcim sur la page officielle.
- Intégrations Stripe, Lago et Kill Bill avec Next.js.
- Taux TPS et TVQ et seuil sur la page officielle de Revenu Québec.

---

## 11. Sources

**Dépôts GitHub (métadonnées et licences lues le 26 octobre 2026)**
- https://github.com/Paymenter/Paymenter
- https://github.com/FOSSBilling/FOSSBilling
- https://github.com/ConvoyPanel/Panel
- https://github.com/getlago/lago
- https://github.com/getlago/lago-api
- https://github.com/killbill/killbill
- https://github.com/lxc/incus
- https://github.com/coollabsio/coolify
- https://github.com/Dokploy/dokploy
- https://github.com/caprover/caprover
- https://github.com/NousResearch/hermes-agent
- https://github.com/openclaw/openclaw
- https://github.com/n8n-io/n8n
- https://github.com/ollama/ollama
- https://github.com/open-webui/open-webui
- https://github.com/langgenius/dify
- https://github.com/FlowiseAI/Flowise
- https://github.com/LibreChat-AI/LibreChat
- https://github.com/directus/directus
- https://github.com/btcpayserver/btcpayserver
- https://github.com/btcpayserver/btcpayserver-docker
- https://github.com/coollabsio/coolify (fichier `templates/service-templates.json`, branche principale)
- https://github.com/caprover/one-click-apps (branche `master`, fichiers testés en 404)
- https://github.com/proxmox/pve-manager (miroir ; fichier `debian/copyright` lu)
- https://registry.npmjs.org/proxmox-api, https://registry.npmjs.org/node-proxmox, https://registry.npmjs.org/@directus/sdk, https://registry.npmjs.org/stripe

**Pages officielles**
- https://www.hostinger.com/vps-hosting
- https://stripe.com/en-ca/pricing
- https://www.whmcs.com/pricing/
- https://www.hostbillapp.com/pricing/
- https://blesta.com/2025/11/01/blesta-2026-price-adjustment/
- https://flowiseai.com/sunset
- https://pve.proxmox.com/wiki/Proxmox_VE_API
- https://pve.proxmox.com/pve-docs/api-viewer/ (apidoc.js)
- https://linuxcontainers.org/incus/docs/main/rest-api/ (référencée, non lue directement)
- https://coolify.io/docs/api/overview (extraits de recherche)
- https://www.mintlify.com/Dokploy/dokploy/api-reference/authentication (extrait de recherche)
- https://hermes-agent.nousresearch.com/install.sh et https://openclaw.ai/install.sh (lus à travers les README)
- https://legal.helcim.com/ca/fee-disclosures/ (bloquée)
- https://www.revenuquebec.ca/fr/entreprises/taxes/tpstvh-et-tvq/ (403 ; extraits de recherche)

**Sources secondaires [S]**
- https://paymenter.org/marketplace/66657-paymenter-proxmox et https://builtbybit.com/resources/paymenter-proxmox.66657/
- https://lowendspirit.com (hausse WHMCS)
- https://pep.paypal.com/ca/webapps/mpp/merchant-fees (PayPal, extraits)
- https://squareup.com/ca/en/payments/our-fees et https://www.square.com/ca/en/payments/our-fees (Square, extraits)
- https://www.bnnbloomberg.ca/business/company-news/2026/08/10/rbc-bmo-to-sell-moneris-to-francisco-partners-in-2-billion-deal, https://newsroom.bmo.com/2026-08-10-BMO-Announces-Sale-of-Moneris (Moneris, extraits)
- https://en.wikipedia.org/wiki/Interac (fermeture d'Interac Online)
- https://asec.ahnlab.com/en/93268/ (bulletin AhnLab sur OpenClaw)
- https://cve-dev.imfht.com (agrégateur CVE, à recouper avec NVD)
- https://wise.com/ca/blog/interac-online-alternatives (frais e-Transfer, secondaire)
