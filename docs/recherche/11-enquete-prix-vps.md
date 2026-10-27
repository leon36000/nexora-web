# Recherche 11 : enquête de prix VPS au Canada et au Québec

**Projet :** Nexora AI (Québec). VPS hébergés sur les serveurs Proxmox de Nexora au Québec (KVM, NVMe, IPv4 dédiée, applications préinstallées), vendus à des PME et à des développeurs.
**Date du relevé :** 27 octobre 2026. Pages officielles consultées le 27 octobre 2026. Les sources secondaires sont signalées [S].
**Devise :** $ CA par mois, hors taxes (TPS et TVQ en sus), sauf mention contraire.
**Taux de change :** 1 USD = 1,4038 CAD ; 1 EUR = 1,5643 CAD. Taux de la Banque du Canada publiés le 27 octobre 2026. La recherche 10 utilisait 1,4025 (taux du 26 octobre) ; l'écart est négligeable.
**Étiquettes :** [P] page officielle lue le 27 octobre 2026 ; [S] source secondaire à confirmer avant engagement ; [H] hypothèse de travail ; [À VÉRIFIER] information non établie.
**Suite de :** recherche 10, partie A, section 3 (proposition 19 / 35 / 55 / 99 $ CA).

---

## 1. Résumé exécutif

1. **La recherche 10 tient, avec trois corrections.** (a) OVHcloud Canada est maintenant confirmé à **Beauharnois (Québec)** par sa page officielle : « Votre VPS localisé à Beauharnois (Québec) ». (b) Les prix OVH sont exacts, mais ce sont des prix « à partir de » dont l'engagement n'est pas écrit sur la page. (c) Les marges brutes de 60 à 70 % étaient calculées sur le prix d'OVH, et non sur le coût réel de Nexora. Elles ne doivent pas servir de base.
2. **Le marché canadien est éclaté en trois bandes.** Bas : OVHcloud et EDIS, 6 à 23 $ pour 2 vCPU. Milieu : WHC, 18,50 à 123 $ pour 2 à 8 vCPU. Haut : DigitalOcean (Toronto), AWS Lightsail (Montréal) et Akamai/Linode, 34 à 270 $ pour 2 à 8 vCPU. Sur 23 offres canadiennes relevées, la médiane est de **16,4 $ par vCPU et par mois**, et l'intervalle interquartile va de 10,4 à 16,9 $.
3. **« Au Québec » ne suffit plus à justifier une prime.** Quatre fournisseurs annoncent un centre au Québec : OVHcloud (Beauharnois), EDIS (Montréal, Cologix MTL3), OperaVPS (Montréal, MTL3) et Ash Host (Beauharnois, [S]). La différence de Nexora doit venir des applications préinstallées, du soutien en français, des sauvegardes et d'un engagement de données vérifiable.
4. **Recommandation.** Mensuel sans engagement : **25 $ / 45 $ / 79 $ / 119 $**. En engagement annuel : **21 $ / 38 $ / 67 $ / 99 $ par mois**. Renouvellement au même prix que la grille affichée, sans promotion qui se transforme en hausse. Le plan Essentiel passe de 19 à 25 $, et Scale de 99 à 119 $ au mensuel (99 $ au annuel).
5. **Marge.** Avec un serveur de référence à 210 $ par mois, 36 vCPU utilisables (densité 3:1 sur 12 threads), la marge brute après 10 % de frais hors serveur est de **29 à 38 % en annuel** et de **38 à 46 % au mensuel**. Cette marge se réduit fortement si le coût serveur atteint environ 280 $ par mois (Croissance tombe alors à 8 %) ou si la densité tombe à 2:1 (Croissance devient déficitaire). **Point critique :** à 210 $, un serveur possédé coûte plus cher qu'une location équivalente chez OVHcloud (179,88 $). Il faut un devis matériel réel avant de choisir entre achat et location (section 8).

---

## 2. Méthode

- **Relevé.** Pages officielles lues quand elles étaient accessibles. Refus et erreurs notés : Vultr (403), Google Cloud (page tronquée), Planethoster (404), Hetzner (grille absente), Linode (redirection vers Akamai).
- **Normalisation.** Prix mensuel HT en $ CA, divisé par le nombre de vCPU et par le nombre de Go de RAM.
- **Gabarits.** Pour chacun des quatre gabarits demandés, on retient les offres à au plus 2 vCPU d'écart et à ±50 % de RAM. L'écart de disque est toléré et signalé.
- **Quartiles.** Méthode linéaire (type 7, celle du tableur). L'échantillon est petit (5 à 6 offres par gabarit), donc les quartiles sont **indicatifs**.
- **Marché canadien.** Offres avec un centre au Canada affiché (Beauharnois, Montréal, Toronto, ou « Canada » sans ville). Exclus : devise non précisée (OperaVPS, Unno) ; sans centre canadien (Hostinger, Hetzner, Contabo) ; prix non relevé (Vultr Toronto, GCP, Azure).
- **Prix d'engagement.** Quand la page n'indique pas l'engagement ni le prix de renouvellement, la case est marquée « non précisé ». Aucun prix n'a été inventé.

---

## 3. Statut des fournisseurs

| Fournisseur | Centre canadien ou québécois | Statut du relevé |
|---|---|---|
| **OVHcloud VPS** | **Beauharnois, Québec** (page fr-ca) [P] | Grille relevée. Engagement et renouvellement non précisés. |
| OVHcloud Advance (dédié) | Canada (Beauharnois attendu, non écrit sur la page) | Grille relevée. Localisation [À VÉRIFIER]. |
| **DigitalOcean** | **Toronto (TOR1)**, Ontario | Grille Basic relevée. Prix par région non précisés sur la page. |
| Vultr | Toronto : région signalée par des sources [S] | Page officielle 403. Prix Toronto non relevés [À VÉRIFIER]. |
| **Akamai / Linode** | Toronto : non confirmé sur la page | Grille relevée (page redirigée). Régionalité [À VÉRIFIER]. |
| **AWS Lightsail** | **ca-central-1, Montréal** (connaissance de la région AWS) | Grille relevée. Page ne mentionne pas de majoration pour le Canada. |
| Google Cloud | northamerica-northeast1, Montréal | Non relevé : page tronquée. |
| Microsoft Azure | Canada East (Québec) et Canada Central (Toronto) | Non relevé sur la page officielle. Calculateur [S] : B2s environ 39,71 $ par mois, devise et date incertaines. |
| Kamatera | Toronto (stockage bloc seulement, [S]) | [S] seulement. Plans Basic 4 $ / Standard 25 $ / Pro 39 $ (sans localisation confirmée). |
| Contabo | Aucun Canada (UE, Royaume-Uni, États-Unis, Singapour, Japon, Inde, Australie) | Exclu. |
| Hetzner | Aucun Canada (Allemagne, Finlande, États-Unis, Singapour) | Référence européenne. « À partir de » 6,49 € (Regular Performance). |
| Hostinger | Aucun Canada (10 centres, dont aucun au Canada) | Référence pour le renouvellement. |
| **WHC (Web Hosting Canada)** | Canada, ville non précisée (siège à Montréal) | Grille officielle relevée. Cloud et VPS canadiens. |
| **EDIS Global** | **Montréal, Cologix MTL3** | Grille relevée (prix en euros HT). |
| **OperaVPS** | **Montréal, Cologix MTL3** | Grille relevée. Devise non précisée. |
| Unno | « Canada » ; Québec dans le marketing | Grille relevée (3 plans). Devise non précisée. |
| Planethoster | Montréal selon des annuaires | Page officielle 404. Pas de prix officiel trouvé [À VÉRIFIER]. |
| Ash Host | Beauharnois selon un annuaire [S] | Prix non relevé. |
| HostPapa | Canada | Promotion seulement, [S]. Exclu. |
| LeoHub, Vianet | — | Aucun résultat. Non trouvés. |
| Server Room, Cogeco / Q9 | — | Non recherchés dans cette passe. |
| Canadian Web Hosting | Vancouver, Toronto | VPS « à partir de 7,95 $ CAD » [S], non relevé sur le site officiel. |

---

## 4. Offres relevées (tableau de référence)

Prix en $ CA par mois, hors taxes. Colonne « Prix publié » : devise et mention d'origine.

| Fournisseur et plan | Centre | vCPU | RAM (Go) | Stockage (Go) | Trafic | IPv4 | Sauvegarde | Prix publié | **Prix CAD / mois** | Engagement / renouvellement |
|---|---|---|---|---|---|---|---|---|---|---|
| OVH VPS-1 | Beauharnois QC | 2 | 4 | 40 NVMe | illimité, 500 Mb/s | 1 | quotidienne, 1 jour [P] | 6,20 $ « à partir de » | **6,20** | non précisé / non affiché [P] |
| OVH VPS-2 | Beauharnois QC | 4 | 8 | 75 NVMe | illimité, 1 Gb/s | 1 | idem | 11,64 $ | **11,64** | idem |
| OVH VPS-3 | Beauharnois QC | 6 | 12 | 100 NVMe | illimité, 2 Gb/s | 1 | idem | 16,83 $ | **16,83** | idem |
| OVH VPS-4 | Beauharnois QC | 8 | 24 | 200 NVMe | illimité, 3 Gb/s | 1 | idem | 32,21 $ | **32,21** | idem |
| WHC 2G (autogéré) | Canada | 2 | 2 | 25 SSD | usage normal | 1 partagée | externe, en option | 18,50 $ C (barré 22,50) | **18,50** | non affiché [P] |
| WHC Edge (cPanel/WHM) | Canada | 4 | 4 | 50 SSD | usage normal | 1 partagée | externe, en option | 56,48 $ C (barré 60,48) | **56,48** | non affiché [P] |
| WHC Power | Canada | 6 | 8 | 100 SSD | usage normal | 1 partagée | externe, en option | 85,48 $ C (barré 92,98) | **85,48** | non affiché [P] |
| WHC Ultra | Canada | 8 | 16 | 200 SSD | usage normal | 1 partagée | externe, en option | 123,48 $ C (barré 131,48) | **123,48** | non affiché [P] |
| EDIS KVM Smart | Montréal MTL3 | 1 | 1 | 15 SSD | 1 To | 1 statique | non | 4,99 € HT | **7,81** | non visible [P] |
| EDIS KVM Starter | Montréal MTL3 | 1 | 2 | 20 SSD | 2 To | 1 statique | non | 8,49 € HT | **13,28** | non visible [P] |
| EDIS KVM Basic | Montréal MTL3 | 1 | 4 | 45 SSD | 4 To | 1 statique | non | 10,49 € HT | **16,41** | non visible [P] |
| EDIS KVM Basic Plus | Montréal MTL3 | 2 | 4 | 45 SSD | 4 To | 1 statique | non | 14,69 € HT | **22,98** | non visible. vCPU à confirmer (incohérence de la page) |
| EDIS, IPv4 supplémentaire | Montréal MTL3 | — | — | — | — | +1 | — | 5 € HT par IP | **7,82** | [P] |
| OperaVPS Linux 2048 | Montréal MTL3 | 3 | 2 | 30 NVMe/SSD | illimité | IPv4 + IPv6 | non détaillée | 17,99 $ (mensuel, devise non précisée) | 25,25 si USD [À VÉRIFIER] | non précisé [P] |
| OperaVPS Linux 4096 | Montréal MTL3 | 4 | 4 | 40 | illimité | IPv4 + IPv6 | non détaillée | 29,99 $ | 42,09 si USD [À VÉRIFIER] | non précisé [P] |
| OperaVPS Linux 8192 | Montréal MTL3 | 8 | 8 | 100 | illimité | IPv4 + IPv6 | non détaillée | 69,99 $ | 98,25 si USD [À VÉRIFIER] | non précisé [P] |
| Unno Starter | Canada | 1 | 1 | 10 SSD | non précisé | non précisé | option | 5 $ | 5 (devise [À VÉRIFIER]) | non précisé [P] |
| Unno Pro | Canada | 2 | 2 | 20 SSD | non précisé | non précisé | option | 10 $ | 10 (devise [À VÉRIFIER]) | non précisé [P] |
| Unno Business | Canada | 4 | 4 | 40 SSD | non précisé | non précisé | option | 15 $ | 15 (devise [À VÉRIFIER]) | non précisé [P] |
| DigitalOcean Basic 1/2 | Toronto TOR1 | 1 | 2 | 50 | 2 000 Gio | 1 | +20 % du prix | 12 $ US | **16,85** | mensuel, sans engagement [P] |
| DigitalOcean Basic 2/4 | Toronto TOR1 | 2 | 4 | 80 | 4 000 Gio | 1 | +20 % | 24 $ US | **33,69** | idem |
| DigitalOcean Basic 4/8 | Toronto TOR1 | 4 | 8 | 160 | 5 000 Gio | 1 | +20 % | 48 $ US | **67,38** | idem |
| DigitalOcean Basic 8/16 | Toronto TOR1 | 8 | 16 | 320 | 6 000 Gio | 1 | +20 % | 96 $ US | **134,76** | idem |
| Linode 4 Go (Shared) | Toronto : non confirmé | 2 | 4 | 80 | 4 To | non précisé | non précisé | 24 $ US | **33,69** | mensuel [P] |
| Linode 8 Go (Shared) | idem | 4 | 8 | 160 | 5 To | non précisé | non précisé | 48 $ US | **67,38** | mensuel [P] |
| Linode 16 Go (Shared) | idem | 6 | 16 | 320 | 8 To | non précisé | non précisé | 96 $ US | **134,76** | mensuel [P] |
| Linode 32 Go (Shared) | idem | 8 | 32 | 640 | 16 To | non précisé | non précisé | 192 $ US | **269,53** | mensuel [P] |
| AWS Lightsail 2/4 | Montréal ca-central-1 | 2 | 4 | 80 SSD | 4 To | publique incluse | non détaillée | 24 $ US | **33,69** | mensuel [P] |
| AWS Lightsail 2/8 | Montréal | 2 | 8 | 160 SSD | 5 To | publique incluse | non détaillée | 44 $ US | **61,77** | mensuel [P] |
| AWS Lightsail 4/16 | Montréal | 4 | 16 | 320 SSD | 6 To | publique incluse | non détaillée | 84 $ US | **117,92** | mensuel [P] |
| AWS Lightsail 8/32 | Montréal | 8 | 32 | 640 SSD | 7 To | publique incluse | non détaillée | 164 $ US | **230,23** | mensuel [P] |
| Hostinger KVM 1 (renouvellement) | Hors Canada | 1 | 4 | 50 NVMe | 4 To | non précisé | 30 jours de remboursement | 11,99 $ US | 16,83 (référence) | 24 mois, promo 6,49 $ US [P] |
| Hostinger KVM 2 (renouvellement) | Hors Canada | 2 | 8 | 100 NVMe | 8 To | non précisé | idem | 14,99 $ US | 21,04 (référence) | idem |
| Hostinger KVM 4 (renouvellement) | Hors Canada | 4 | 16 | 200 NVMe | 16 To | non précisé | idem | 28,99 $ US | 40,70 (référence) | idem |
| Hostinger KVM 8 (renouvellement) | Hors Canada | 8 | 32 | 400 NVMe | 32 To | non précisé | idem | 49,99 $ US | 70,17 (référence) | idem |
| Hetzner « à partir de » | Europe, hors Canada | — | — | — | — | — | — | 6,49 € HT | 10,15 (référence) | plan non précisé [À VÉRIFIER] |
| Azure Standard B2s (calculateur) | Canada East | 2 | 4 | disque non inclus | — | — | — | environ 39,71 (devise incertaine) | non retenu | [S] seulement |

**Dédié (référence de coût).**

| Offre | Centre | CPU | RAM | Stockage | Prix publié | **Prix CAD / mois** | Installation |
|---|---|---|---|---|---|---|---|
| OVHcloud Advance-1 (variante la moins chère) | Gamme « Canada » (Beauharnois non écrit sur la page dédiée) | AMD EPYC 4244P, 6 cœurs / 12 threads | 32 à 192 Go | NVMe 2 × 960 Go à 4 × 7,68 To | 114,99 € HT (137,99 € TTC) | **179,88** | 114,99 € HT (179,88 $) |
| OVHcloud Advance-1 (variantes suivantes) | idem | idem | idem | idem | 123,99 € HT | **193,98** | idem |

Source : [P] ovhcloud.com/fr/bare-metal/dedicated-server-canada/ (lu le 27 octobre 2026). Engagement non visible sur la page.

---

## 5. Normalisation et quartiles par gabarit

### 5.1 Principe

Les offres comparables sont listées avec leur écart. Les prix sont ceux du tableau 4, en $ CA mensuels HT.

### 5.2 Gabarit G1 : 2 vCPU / 4 Go / 80 Go

| Offre | vCPU | RAM | Disque | Prix CAD | $ / vCPU | $ / Go |
|---|---|---|---|---|---|---|
| OVH VPS-1 | 2 | 4 | 40 (écart disque) | 6,20 | 3,10 | 1,55 |
| WHC 2G | 2 | 2 (écart RAM) | 25 (écart disque) | 18,50 | 9,25 | 9,25 |
| EDIS KVM Basic Plus | 2 | 4 | 45 (écart disque) | 22,98 | 11,49 | 5,75 |
| DigitalOcean 2/4 | 2 | 4 | 80 | 33,69 | 16,85 | 8,42 |
| AWS Lightsail 2/4 | 2 | 4 | 80 | 33,69 | 16,85 | 8,42 |
| Linode 4 Go | 2 | 4 | 80 | 33,69 | 16,85 | 8,42 |

**Quartiles (n = 6) :** Q1 = **19,62 $** ; médiane = **28,34 $** ; Q3 = **33,69 $**. Par vCPU : médiane 14,17 $ (Q1 9,81 ; Q3 16,85). Par Go de RAM : médiane 7,09 $.

### 5.3 Gabarit G2 : 4 vCPU / 8 Go / 160 Go

| Offre | vCPU | RAM | Disque | Prix CAD | $ / vCPU | $ / Go |
|---|---|---|---|---|---|---|
| OVH VPS-2 | 4 | 8 | 75 (écart disque) | 11,64 | 2,91 | 1,46 |
| WHC Edge | 4 | 4 (écart RAM) | 50 (écart disque) | 56,48 | 14,12 | 14,12 |
| AWS Lightsail 2/8 | 2 (écart vCPU) | 8 | 160 | 61,77 | 30,88 | 7,72 |
| DigitalOcean 4/8 | 4 | 8 | 160 | 67,38 | 16,85 | 8,42 |
| Linode 8 Go | 4 | 8 | 160 | 67,38 | 16,85 | 8,42 |

**Quartiles (n = 5) :** Q1 = **56,48 $** ; médiane = **61,77 $** ; Q3 = **67,38 $**. Par vCPU : médiane 15,44 $. Par Go : médiane 7,72 $.
**Lecture.** Le marché est bimodal : OVH à 11,64 $ d'un côté, un groupe à 56–67 $ de l'autre. La médiane reflète surtout le second groupe.

### 5.4 Gabarit G3 : 8 vCPU / 16 Go / 320 Go

| Offre | vCPU | RAM | Disque | Prix CAD | $ / vCPU | $ / Go |
|---|---|---|---|---|---|---|
| OVH VPS-3 | 6 (écart vCPU) | 12 | 100 (écart disque) | 16,83 | 2,81 | 1,40 |
| OVH VPS-4 | 8 | 24 | 200 | 32,21 | 4,03 | 1,34 |
| AWS Lightsail 4/16 | 4 (écart vCPU) | 16 | 320 | 117,92 | 29,48 | 7,37 |
| WHC Ultra | 8 | 16 | 200 | 123,48 | 15,44 | 7,72 |
| DigitalOcean 8/16 | 8 | 16 | 320 | 134,76 | 16,85 | 8,42 |
| Linode 16 Go | 6 (écart vCPU) | 16 | 320 | 134,76 | 22,46 | 8,42 |

**Quartiles (n = 6) :** Q1 = **53,64 $** ; médiane = **120,70 $** ; Q3 = **131,94 $**. Par vCPU : médiane 15,09 $. Par Go : médiane 7,54 $.
**Lecture.** Même bimodalité : OVH (17 à 32 $) contre le groupe à 117–135 $.

### 5.5 Gabarit G4 : 12 à 16 vCPU / 32 Go / 640 Go

**Données insuffisantes pour un quartile.** Seules deux offres se rapprochent : Lightsail 8 vCPU / 32 Go / 640 Go à 230,23 $, et Linode 8 vCPU / 32 Go / 640 Go à 269,53 $. Par interpolation indicative, à partir d'un coût de 28 à 34 $ par vCPU pour ces offres à 8 vCPU, un gabarit de 12 vCPU / 32 Go se situerait entre **340 et 400 $ par mois** (n = 2, extrapolation [H]). Cette estimation n'est pas une médiane.

### 5.6 Synthèse : prix par vCPU, tous gabarits canadiens confondus

Sur 23 offres canadiennes relevées : **Q1 = 10,4 $ ; médiane = 16,4 $ ; Q3 = 16,9 $ par vCPU et par mois.** Répartition : 4 offres OVH (2,8 à 4 $) ; 4 offres EDIS (7,8 à 16,4 $) ; WHC entre 9 et 15,5 $ ; DigitalOcean, Linode et Lightsail entre 17 et 34 $.

---

## 6. Valeur ajoutée Nexora et prime justifiée

### 6.1 Primes observées sur le marché

| Comparaison | Référence basse | Offre premium | Prime | Ce qui la justifie |
|---|---|---|---|---|
| OVH VPS-1 face à EDIS KVM Basic Plus | 6,20 $ (2 vCPU / 4 Go / 40 Go, Beauharnois) | 22,98 $ (2 vCPU / 4 Go / 45 Go, Montréal Tier III) | **× 3,7** | Centre de données Tier III à Montréal, uplink 2 × 10 Gb/s, trafic de 4 To, root. |
| OVH VPS-2 face à WHC Edge | 11,64 $ (4 vCPU / 8 Go / 75 Go) | 56,48 $ (4 vCPU / 4 Go / 50 Go, cPanel/WHM, Sitejet) | **× 4,9** | Gestion incluse, cPanel, support canadien. Le prix est inférieur à 4 Go de RAM près. |
| Hébergé n8n Cloud face à VPS autogéré | 6 à 12 $ (VPS OVH ou EDIS, n8n installé soi-même) | 34 $ (n8n Cloud Starter, 2 500 exécutions, [P] doc 10) | **× 3 à 5** | Application prête, mises à jour, support. Prime d'« application gérée ». |
| OVH VPS-2 face à DigitalOcean 4/8 | 11,64 $ | 67,38 $ | **× 5,8** | Marque et écosystème, réseau mondial, dont l'effet sur le prix n'est pas quantifié ici. |

### 6.2 Ce que Nexora peut revendiquer

1. **Applications préinstallées** (Hermes Agent, OpenClaw, n8n, Ollama + Open WebUI, LibreChat) : une prime « application gérée » comparable à n8n Cloud (× 3 à 5 par rapport à un VPS nu), sous réserve d'un vrai gain de temps pour le client.
2. **Soutien en français, sur un VPS québécois** : comparable à la prime de WHC (× 4,9) pour un service géré.
3. **Sauvegardes incluses** : OVH inclut une sauvegarde quotidienne d'un jour ; DigitalOcean et Vultr facturent +20 %. Une sauvegarde de 7 à 30 jours incluse est un argument concret.
4. **Engagement de données** (recherche 10, partie B) : une clause « vos données restent au Québec » est un argument, à condition qu'elle soit exacte pour chaque sous-traitant.

### 6.3 Ce que Nexora ne peut pas revendiquer seul

- Le « Québec » en soi n'est plus rare : OVH, EDIS, OperaVPS et Ash Host sont déjà à Beauharnois ou à Montréal, à des prix de 6 à 23 $ pour 2 vCPU.
- La performance brute n'est pas un différenciateur : les VPS OVH et EDIS offrent 2 Gb/s ou 10 Gb/s d'uplink.

### 6.4 Conclusion sur la prime

Une prime de **× 3,7 à × 4,9** par rapport au plancher canadien (OVH) est cohérente avec les primes observées (EDIS, WHC, n8n Cloud). Nexora peut donc viser environ **× 4** sur OVH et se situer sous les offres DigitalOcean, Linode et Lightsail pour les gabarits moyens. C'est la logique de la recommandation de la section 7.

---

## 7. Recommandation : quatre plans

### 7.1 Grille proposée

| Plan | vCPU | RAM | NVMe | Trafic inclus | IPv4 | Sauvegardes incluses | **Mensuel** (sans engagement) | **Annuel** (par mois) | Total annuel | Renouvellement |
|---|---|---|---|---|---|---|---|---|---|---|
| **Essentiel** | 2 | 4 Go | 80 Go | 4 To | 1 | hebdomadaire, conservée 7 jours | **25 $** | **21 $** | 252 $ | 21 $ par mois, au même prix que la grille annuelle. Aucune hausse. |
| **Croissance** | 4 | 8 Go | 160 Go | 6 To | 1 | quotidienne, conservée 7 jours | **45 $** | **38 $** | 456 $ | 38 $ par mois, idem. |
| **Pro** | 6 | 12 Go | 240 Go | 8 To | 1 | quotidienne, conservée 14 jours | **79 $** | **67 $** | 804 $ | 67 $ par mois, idem. |
| **Scale** | 8 | 24 Go | 320 Go | 12 To | 1 (+1 en option à 7,82 $) | quotidienne, conservée 30 jours | **119 $** | **99 $** | 1 188 $ | 99 $ par mois, idem. |

**Économie de l'annuel :** Essentiel 48 $ par an (16 %) ; Croissance 84 $ (16 %) ; Pro 144 $ (15 %) ; Scale 240 $ (17 %).

**Règle de renouvellement.** Le prix de renouvellement est celui de la grille en vigueur à la date de renouvellement, avec un préavis écrit de 30 jours en cas de hausse. Pas de promotion qui cache le prix régulier (la recherche 10, section 5.3, le déconseille).

**Trafic au-delà.** Non défini ici. Références : Vultr 0,01 $ US par Go de dépassement [S, résultat de recherche] ; Kamatera 0,01 $ par Go [S]. À décider selon le coût réel de la bande passante Nexora.

**Applications par plan (proposition).**
- Essentiel : n8n ou LibreChat.
- Croissance : une application de plus (Hermes Agent ou OpenClaw).
- Pro : Ollama et Open WebUI, car Ollama demande plus de RAM que 4 Go.
- Scale : toutes les applications, et une installation assistée.

**Soutien (proposition).** Essentiel : courriel en 2 jours ouvrables. Croissance : courriel en 1 jour ouvrable. Pro : courriel en 4 heures ouvrables. Scale : 4 heures ouvrables et installation assistée.

### 7.2 Position par rapport aux quartiles

| Plan | Prix mensuel | Gabarit de référence | Quartiles du gabarit (Q1 / médiane / Q3) | Nexora : $ par vCPU | Médiane $ par vCPU du gabarit | Écart | Prime sur OVH le plus proche |
|---|---|---|---|---|---|---|---|
| Essentiel | 25 $ | G1 (2 / 4 / 80) | 19,6 / 28,3 / 33,7 | 12,5 | 14,2 | **−12 %** : entre le Q1 et la médiane | × 4,0 (OVH VPS-1, 6,20 $) |
| Croissance | 45 $ | G2 (4 / 8 / 160) | 56,5 / 61,8 / 67,4 | 11,3 | 15,4 | **−27 %** : sous le Q1 | × 3,9 (OVH VPS-2, 11,64 $) |
| Pro | 79 $ | G3 (6–8 / 12–16 / 240–320) | 53,6 / 120,7 / 131,9 | 13,2 | 15,1 | **−13 %** : sous la médiane | × 4,7 (OVH VPS-3, 16,83 $) |
| Scale | 119 $ | G3 (8 / 24 / 320) | voir G3 | 14,9 | 15,1 | **−1 %** : à la médiane | × 3,7 (OVH VPS-4, 32,21 $) |

**Lecture.**
- **Essentiel à 25 $.** Le prix est entre le Q1 (19,6 $) et la médiane (28,3 $). Il est nettement au-dessus de l'offre OVH de 6,20 $, ce qui est justifié par l'application et le soutien. Il reste sous DigitalOcean, Linode et Lightsail (33,69 $). Le prix de 19 $ de la recherche 10 aurait été sous le Q1 ; il ne reste défendable qu'en lancement.
- **Croissance à 45 $.** C'est la décision la plus discutable. Le prix est 20 % sous le Q1 du gabarit G2, qui regroupe DigitalOcean, Linode, Lightsail et WHC. Il est au-dessus de l'offre OVH (11,64 $). Le prix de 35 $ de la recherche 10 aurait été à 38 % sous le Q1 et à seulement 1,5 fois le coût de revient ; c'est trop bas (section 8).
- **Pro à 79 $.** C'est sous la médiane de G3 (120,7 $). Il vise les PME qui veulent un serveur plus puissant que Croissance sans payer le prix des hyperscalers.
- **Scale à 119 $.** C'est à la médiane de G3 en $ par vCPU. Il est sous Lightsail 8/32 (230 $) et Linode 8/32 (270 $) : il offre 24 Go de RAM et des applications, à un prix inférieur à celui des grands fournisseurs.

### 7.3 Comparaison avec la proposition de la recherche 10

| Plan | Recherche 10 (mensuel / annuel) | Recommandation (mensuel / annuel) | Écart | Motif |
|---|---|---|---|---|
| Essentiel | 19 $ / 16 $ | 25 $ / 21 $ | + 6 $ / + 5 $ | 19 $ est sous le Q1 de G1. Marge réduite à environ 34 % au annuel. |
| Croissance | 35 $ / 29 $ | 45 $ / 38 $ | + 10 $ / + 9 $ | 35 $ donne 10,9 $ de marge au annuel, soit 29 % après frais. Trop mince si le serveur coûte plus de 210 $. |
| Pro | 55 $ / 45 $ | 79 $ / 67 $ | + 24 $ / + 22 $ | 55 $ est à 54 % sous la médiane G3 et ne couvre pas les sauvegardes 14 jours. |
| Scale | 99 $ / 89 $ | 119 $ / 99 $ | + 20 $ / + 10 $ | 99 $ est sous la médiane G3. Le plan inclut 30 jours de sauvegarde et une installation assistée. |

**Option de repli.** Si le marché refuse un Croissance à 45 $, passer à 39 $ (annuel 33 $) et vérifier la marge au coût réel. Ne pas descendre sous 35 $ sans devis serveur.

---

## 8. Coût de revient et marge

### 8.1 Hypothèses

| Paramètre | Valeur retenue | Statut |
|---|---|---|
| Serveur de référence | 6 cœurs / 12 threads, 128 Go RAM, 2 × 3,84 To NVMe (classe OVH Advance-1) | [H] conception |
| Coût d'achat | 5 000 $ CA, amorti sur 36 mois, soit 139 $ par mois | [H] à remplacer par un devis |
| Colocation, énergie, réseau au Québec | 60 $ par mois | [H] à obtenir d'un hébergeur de colocation |
| IPv4 et divers | 10 $ par mois | [H] |
| **Coût total du serveur** | **environ 210 $ par mois** (fourchette 150 à 280 $) | [H] |
| Référence de location | OVH Advance-1 (Canada) : 179,88 $ par mois + installation 179,88 $ | [P] |
| Densité | CPU : 3 vCPU par thread, soit 36 vCPU ; RAM utile : 120 Go (8 Go pour l'hôte) | [H] |
| Frais hors serveur | 10 % du prix (sauvegardes, supervision, paiement, soutien) | [H] ; frais de paiement [À VÉRIFIER] |

**Attention.** Avec ces hypothèses, un serveur acheté coûte 210 $ par mois, soit plus que la location équivalente chez OVHcloud (179,88 $). Face à la location à 179,88 $, l'achat n'est rentable que si le matériel coûte moins d'environ 4 000 $ (avec 70 $ par mois de colocation et d'IP), ou si la densité est plus élevée. **Avant la mise en vente, obtenir un devis matériel et un devis de colocation.** Une option de lancement sûre est de louer chez OVHcloud Advance-1 (179,88 $) pour le premier serveur, puis de passer à du matériel propre quand le volume le justifie.

### 8.2 Nombre de plans par serveur et coût par plan

| Plan | Limite CPU (36 vCPU) | Limite RAM (120 Go) | Unités par serveur | Coût par plan (210 $) | Coût par plan (150 $) | Coût par plan (280 $) |
|---|---|---|---|---|---|---|
| Essentiel (2 / 4) | 18 | 30 | **18** | 11,67 $ | 8,33 $ | 15,56 $ |
| Croissance (4 / 8) | 9 | 15 | **9** | 23,33 $ | 16,67 $ | 31,11 $ |
| Pro (6 / 12) | 6 | 10 | **6** | 35,00 $ | 25,00 $ | 46,67 $ |
| Scale (8 / 24) | 4,5 | 5 | **4** | 52,50 $ | 37,50 $ | 70,00 $ |

### 8.3 Marge brute par plan (serveur à 210 $, frais hors serveur de 10 %)

| Plan | Prix mensuel | Marge mensuelle | Marge % | Prix annuel (par mois) | Marge annuelle | Marge % |
|---|---|---|---|---|---|---|
| Essentiel | 25 $ | 10,83 $ | 43 % | 21 $ | 7,23 $ | **34 %** |
| Croissance | 45 $ | 17,17 $ | 38 % | 38 $ | 10,87 $ | **29 %** |
| Pro | 79 $ | 36,10 $ | 46 % | 67 $ | 25,30 $ | **38 %** |
| Scale | 119 $ | 54,60 $ | 46 % | 99 $ | 36,60 $ | **37 %** |

### 8.4 Sensibilité

Marge annuelle après frais hors serveur, par coût de serveur :

| Plan | Serveur à 150 $ | Serveur à 210 $ | Serveur à 280 $ |
|---|---|---|---|
| Essentiel (21 $) | 10,57 $ (50 %) | 7,23 $ (34 %) | 3,34 $ (16 %) |
| Croissance (38 $) | 17,53 $ (46 %) | 10,87 $ (29 %) | **3,09 $ (8 %)** |
| Pro (67 $) | 35,30 $ (53 %) | 25,30 $ (38 %) | 13,63 $ (20 %) |
| Scale (99 $) | 51,60 $ (52 %) | 36,60 $ (37 %) | 19,10 $ (19 %) |

Sensibilité à la densité (serveur à 210 $) :

| Densité (vCPU par thread) | Essentiel, annuel | Croissance, annuel | Pro, annuel | Scale, annuel |
|---|---|---|---|---|
| 2:1 (24 vCPU) | 1,40 $ (7 %) | **−0,80 $** | 7,80 $ | 19,10 $ |
| 3:1 (36 vCPU), retenu | 7,23 $ (34 %) | 10,87 $ (29 %) | 25,30 $ (38 %) | 36,60 $ (37 %) |
| 4:1 (48 vCPU) | 10,15 $ (48 %) | 16,70 $ (44 %) | 34,05 $ (51 %) | 47,10 $ (48 %) |

**Seuils à respecter avant la vente :**
- Densité CPU minimale de 3:1 sur les serveurs de la grille.
- Coût serveur total inférieur à 230 $ par mois. Au-delà, relever le prix annuel de Croissance à au moins 42 $.
- Si la densité ou le coût ne sont pas atteints, relever Essentiel à 25 $ au annuel et Croissance à 45 $ au annuel, et réviser la grille.

---

## 9. Vérification de la recherche 10

| Élément de la recherche 10 | Vérification du 27 octobre 2026 | Verdict |
|---|---|---|
| OVHcloud Beauharnois « attendu » | Page fr-ca : « Votre VPS localisé à Beauharnois (Québec) » ; article OVH sur le campus de Beauharnois, ouvert en janvier 2012 | **Confirmé** |
| OVH VPS-1 à VPS-4 : 6,20 / 11,64 / 16,83 / 32,21 $ | Prix exacts sur la page officielle, « à partir de » | **Confirmé**, mais sans engagement précisé |
| OVH engagement de 12 mois | Non écrit sur la page. Paramètre « pricing=upfront12 » dans les liens | **Non confirmé** |
| OVH sauvegarde quotidienne incluse | Page : sauvegarde automatisée, 1 jour (une autre lecture indique 7 jours glissants) | **Partiellement confirmé**. Vérifier dans l'espace client. |
| OVH plan Essentiel = 40 Go | Le plan VPS-1 a 40 Go, pas 80 Go | **Écart de gabarit** à signaler |
| Hostinger : aucun centre au Canada | Page : 10 centres, aucun au Canada cité | **Confirmé** (liste complète non publiée) |
| Hostinger KVM 1 : 6,49 $ promo, 11,99 $ au renouvellement | Confirmé | **Confirmé** |
| DigitalOcean Toronto (TOR1) | Toronto cité sur la page. Prix régionaux non précisés | **Partiellement confirmé** |
| Vultr Toronto, Regular dès 2,50 $ | Prix d'appel confirmé par des sources [S] ; page officielle 403 | **Partiellement confirmé** |
| Hetzner CPX22 à 19,99 € (source secondaire) | La page officielle indique « à partir de 6,49 € » (Regular Performance) ; CPX22 non lu | **Non confirmé**. Ne pas utiliser sans vérification. |
| Marges brutes de 60 à 70 % | Calculées sur le prix d'OVH, non sur un coût Nexora | **À remplacer** par les marges de la section 8 |
| Taux de change 1,4025 | Banque du Canada, 27 octobre 2026 : 1,4038 | **Mise à jour** |
| Prix Essentiel 19 $ | Sous le Q1 de G1 (19,6 $) ; marge annuelle réduite à 34 % | **Remplacé** par 25 $ / 21 $ |
| Prix Croissance 35 $ | 38 % sous le Q1 de G2 (56,5 $) ; marge de 29 % | **Remplacé** par 45 $ / 38 $ |
| Prix Pro 55 $ | Sous la médiane G3 de 54 % ; sauvegarde 14 jours non couverte | **Remplacé** par 79 $ / 67 $ |
| Prix Scale 99 $ | Sous la médiane G3 ; installation assistée non couverte | **Remplacé** par 119 $ / 99 $ |

---

## 10. Limites et prochaines étapes

1. **Échantillon petit.** Cinq à six offres par gabarit. Les quartiles sont indicatifs.
2. **Prix « à partir de » et promotions.** Les prix OVH et les prix de lancement sont souvent des offres d'appel. Il faut relever le prix réel dans le configurateur de chaque fournisseur avant la publication.
3. **Devises non précisées.** OperaVPS et Unno n'indiquent pas la devise. Ils sont exclus des quartiles. Si OperaVPS est en USD, ses prix sont proches de ceux de EDIS.
4. **Vultr, Google Cloud, Azure non relevés.** Il faut les relever dans leur calculateur, région Toronto ou Montréal, avant toute comparaison finale.
5. **Akamai / Linode : régionalité.** La page ne précise pas de prix par région. Les prix sont ceux de la grille générale.
6. **Coût serveur.** Les hypothèses de la section 8 doivent être remplacées par un devis matériel et un devis de colocation. C'est la décision la plus importante avant la vente.
7. **Frais de paiement.** Les frais de paiement (Stripe Canada) n'ont pas été relevés. Ils sont inclus dans les 10 % de frais hors serveur, à vérifier.
8. **Taxes.** Prix hors TPS et TVQ. Traitement dans le fichier 04.
9. **Non recherchés dans cette passe :** Server Room, Cogeco / Q9, LeoHub (aucun résultat), Vianet (aucun résultat), Planethoster (page officielle 404), Ash Host (prix non relevé).

**Prochaines étapes proposées :**
1. Obtenir deux devis : serveur 6 cœurs / 12 threads, 128 Go, 2 × NVMe 3,84 To (matériel) et colocation à Montréal ou au Québec.
2. Relever les prix réels de Vultr Toronto, Azure Canada East et Google Cloud Montréal dans leur calculateur, avec capture datée.
3. Relever le prix d'engagement et de renouvellement d'OVH VPS dans le configurateur fr-ca.
4. Décider entre location (OVH Advance-1 au lancement) et achat, selon les devis.
5. Valider la grille avec 5 à 10 PME et développeurs avant la publication.

---

## 11. Sources

### Pages officielles lues le 27 octobre 2026

- [P] OVHcloud, VPS : https://www.ovhcloud.com/fr-ca/vps/
- [P] OVHcloud, VPS Canada (localisation Beauharnois) : https://www.ovhcloud.com/fr-ca/vps/vps-canada/
- [P] OVHcloud, serveurs dédiés hébergés au Canada : https://www.ovhcloud.com/fr/bare-metal/dedicated-server-canada/
- [P] OVHcloud, article 10 ans au Canada (campus de Beauharnois, ouverture janvier 2012, projet Toronto) : https://corporate.ovhcloud.com/en/newsroom/news/ovhcloud-10-year-anniversary-canada/
- [P] DigitalOcean, Droplets : https://www.digitalocean.com/pricing/droplets
- [P] Hostinger, VPS : https://www.hostinger.com/vps-hosting
- [P] Akamai (anciennement Linode), tarifs : https://www.akamai.com/cloud/pricing/cpu (redirection depuis https://www.linode.com/pricing/)
- [P] AWS, Lightsail : https://aws.amazon.com/lightsail/pricing/
- [P] WHC, VPS canadiens : https://www.whc.ca/canadian-virtual-private-servers
- [P] EDIS Global, VPS Montréal : https://www.edisglobal.com/vps-hosting/canada-montreal
- [P] OperaVPS, Canada : https://operavps.com/canada-vps/
- [P] Unno, VPS : https://vps.unno.ca/en/
- [P] Contabo, VPS : https://www.contabo.com/en/vps/ (contrôle des régions)
- [P] Hetzner, Cloud : https://www.hetzner.com/cloud/
- [P] Hetzner, dédié (page sans grille) : https://www.hetzner.com/dedicated-rootserver/
- [P] Banque du Canada, taux de change du 27 octobre 2026 : https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/
- [P] Vultr, Regular Performance (produit) : https://www.vultr.com/products/regular-performance-compute/ (prix d'appel par les résultats de recherche ; page tarifs 403 : https://www.vultr.com/pricing/)

### Pages officielles non lues ou inaccessibles

- Google Cloud, tarifs VM : https://cloud.google.com/compute/vm-instance-pricing (page tronquée, non relevé)
- Azure, tarifs VM : https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/ (page tronquée, non relevé)
- Planethoster, VPS : https://www.planethoster.com/fr/hebergement-vps (erreur 404)
- Vultr, grille tarifaire : https://www.vultr.com/pricing/ (erreur 403)

### Sources secondaires [S] (à confirmer)

- Calculateur Azure B2s : https://costcalc.cloudoptimo.com/azure-pricing-calculator/vm/Standard-B2s
- Kamatera, tarifs 2026 : https://cybernews.com/best-web-hosting/kamatera-review/kamatera-pricing/
- Ash Host, KVM (Beauharnois, prix non relevé) : https://www.serverhunter.com/offer/ash-host-canada-kvm-vps/ (erreur 403)
- Planethoster, offre OpenStack (Montréal) : https://www.openstack.org/marketplace/hosted-private-clouds/planethoster/private-cloud-by-planethoster
- Canadian Web Hosting, VPS à partir de 7,95 $ CAD (résultat de recherche, non lu) : https://canadianwebhosting.com/hosting/compare-our-products

### Sources reprises de la recherche 10

- [P] n8n, tarifs (Starter 24 $ US) : https://n8n.io/pricing/ (lu le 27 octobre 2026, via la recherche 10)
- [P] Hostinger, renouvellements KVM 1 à KVM 8 : https://www.hostinger.com/vps-hosting (lu le 27 octobre 2026)
- Recherche 10 : /home/pc6/Desktop/NexoraSite/docs/recherche/10-prix-et-engagements-donnees.md
- Recherche 04 : /home/pc6/Desktop/NexoraSite/docs/recherche/04-vps-facturation-paiements.md
