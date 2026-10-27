# OPSYS-AI : couverture du dépôt, registre des capacités et limites de la page phare

**Date :** 26 octobre 2026

**Dépôt analysé :** `leon36000/OPSYS-AI`, branche `main`, commit `54d89d355555ba29c51a05828bb2ee9b8abbfc1d` (21 oct. 2026, 23:18 UTC, « Fusionner PR623 : restructuration OPSYS-AI et continuité métier »). Clone local en lecture seule : `/home/pc6/Desktop/NexoraSite-wt/_sources/OPSYS-AI`, arbre propre.

**Référence :** brief §7 (`/home/pc6/Desktop/NexoraWeb/PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md`) et annexe (`/home/pc6/Desktop/NexoraWeb/ANNEXE_OPSYS_AI_SOURCES_ET_MARKETING.md`).

**Usage :** document de travail interne pour l'agent qui rédige la page. Ce n'est pas un texte publiable.

Sauf mention contraire, les chemins de ce rapport sont relatifs à la racine du dépôt (`/home/pc6/Desktop/NexoraSite-wt/_sources/OPSYS-AI`).

---

## 0. Synthèse

- **Le produit existe et il est volumineux.** Le dépôt suit 44 019 fichiers, dont 36 446 dans `core/` (fork d'OpenClaw, plateforme amont). Les dix départements totalisent environ 105 000 lignes de code source (`departments/*/src`) et 188 000 lignes de tests. Ces tests ne certifient rien : aucun n'a été exécuté ici, et les statuts CI n'ont pas pu être lus.
- **Capacités disponibles** (chemin réel et test non trivial, dans une instance) : approbations humaines bloquantes, registre chaîné par hachage, bus d'événements, estimation déterministe avec refus de chiffrer sans information suffisante, soumission PDF marquée BROUILLON et filtrée des coûts internes, facture brouillon déclenchée par la fin de chantier, comptes à recevoir, vue exécutive, paquet de contexte mémoire, console web authentifiée.
- **La plupart des promesses de bout en bout sont au stade pilote.** La chaîne existe côté serveur, mais avec saisie manuelle, données fictives, ou sans application mobile vérifiée.
- **Non livré (prévu) :** tout envoi réel au client (courriel, SMS, soumission, facture), connexions bancaires et comptables, paiements, publication sur réseaux sociaux, OCR de factures, mesure à partir de photos, GPS en direct, notifications push, profil client sur mobile, téléphonie vocale temps réel, rétention de la paie (retenues QC).
- **« Mode souverain » : absent du code et des docs produit.** Le fichier d'exemple d'environnement liste des clés de neuf fournisseurs d'IA cloud, et l'instance passe par une passerelle LiteLLM. La promesse de souveraineté ne peut pas être publiée en l'état.
- **Scénario « Travaux terminés » :** réel côté serveur jusqu'aux brouillons (facture, variance, propositions de contenus). Son entrée terrain est en partie simulée : pointage avec position factice, file hors ligne jamais testée contre un serveur, écran employé d'accueil vide.
- **CTA cohérent avec l'état :** démonstration sur données fictives, étude de déploiement ou pilote qualifié. Pas d'essai gratuit ni de souscription.

---

## 1. Méthode, critères et limites

**Méthode.** Chaque zone a été remontée de la définition (`docs/produit/DEFINITION-PRODUIT.md`, `docs/produit/PERIMETRE-MODULES.md`, `docs/architecture/DEPARTEMENTS.md`, `docs/architecture/ROLES.md`) vers la déclaration (`department.yaml`, `contracts/`, outils MCP, routes console, écrans mobiles), puis vers l'implémentation (`src`) et les tests. Douze lectures par zone ont été conduites en parallèle : neuf lectures couvrant les dix départements (M8 et M9 ensemble), la mobile, la plateforme `src/opsys` et la console avec la persistance. Leurs conclusions ont ensuite été recoupées par des vérifications directes sur le dépôt : consommateurs de `m4.travaux_termines`, publication du WCT, liste `CANAUX`, écran d'accueil employé, position factice au pointage, déclencheurs des workflows CI, imports réseau par zone, valeurs par défaut des variables d'environnement, adaptateur météo, en-têtes de licence et déclencheurs des hooks. Les autres références sont données par zone et restent à relire avant publication.

**Ce qui n'a pas été fait.** Aucun code du dépôt n'a été exécuté, aucun paquet installé, aucun secret affiché. Les fichiers contenant des clés sont signalés par chemin seulement.

**Preuve d'exécution.** Aucune exécution locale. Le statut des runs GitHub Actions du commit n'a pas pu être lu (API GitHub limitée, `gh` non authentifié). Les chiffres de tests cités dans les documents du dépôt sont rapportés par leurs auteurs et ne sont pas repris ici comme preuve.

**Classes de preuve :**
- **A** : joignable et testée (chemin réel depuis un point d'entrée, test non trivial qui exerce le comportement).
- **B** : présente mais non testée, ou testée seulement sur une fonction isolée.
- **C** : simulation ou démonstration (données fictives, stub, faux serveur, valeur en dur, adaptateur non déployé).
- **D** : document ou intention seulement.
- **E** : branche morte (code non appelé, non routé, désactivé ou remplacé).

**Statut proposé :** *disponible* = A sans lacune bloquante ; *pilote* = A partiel, ou B avec chemin réel, ou dépendance externe non prouvée ; *prévu* = C, D ou E.

**Sources datées.** `docs/produit/DEFINITION-PRODUIT.md` §11 (état « juin 2026, à revérifier ») et la matrice `docs/research/REPRISE-2026-10-05/conceptions/LOT7-MATRICE-CAPACITES-r1.md` ne servent pas de preuve d'état. Le README racine (« produit en consolidation ») est pris comme déclaration.

**Consignes trouvées dans le dépôt.** `AGENTS.md`, `CLAUDE.md`, `00-DIGEST.md`, les `SOUL.md` et les skills contiennent des consignes destinées à des agents. Elles ont été traitées comme sources, non appliquées. `.claude/settings.json` déclare des hooks Claude Code : `SessionStart` (`cat 00-DIGEST.md`), `UserPromptSubmit` (`.claude/hooks/inject_digest.sh`) et `PreToolUse` sur Bash (`.claude/hooks/guard_forbidden.sh`). Ils s'exécuteraient sur la machine de quiconque ouvre le dépôt avec Claude Code. Non exécutés ici, à signaler à l'équipe.

---

## 2. Matrice de couverture

Les décomptes proviennent des inventaires fichier par fichier produits pendant l'audit (un par zone). « Entier » : lu en entier, par fenêtres successives pour les gros fichiers. « Extrait » : plages lues et recherches ciblées. « Classé » : classé sans lecture (généré, dépendance, test non ouvert, hors périmètre). « Non examiné » : vu par nom ou par grep seulement, lacune déclarée.

| Zone | Fichiers (inventoriés) | Entier / extrait / classé / non examiné | Rôle | Capacités couvertes | Lus en entier (exemples clés) | Statut global | Lacune principale |
|---|---|---|---|---|---|---|---|
| `departments/m01-front-office/` + transverses réception (`src/opsys/reception_sms_*.py`, `canaux.py`, `console/voicemail_ui.py`, `console/reception_digest_ui.py`, `console/formulaire_recepteur.py`) | 134 | 42 / 45 / 38 / 9 | Réception | M1 | `src/m1_front_office/outils.py` (2 538 l., 8 fenêtres), `voicemail_stt.py`, `transferts.py`, `registre.py`, `reception.py`, `consentement.py` | pilote (moteur A, transport C) | Pas de transport SMS observé ; 9 tests racine non relus |
| `departments/m02-revenue-crm/` + `src/opsys/readiness_m2.py` | 114 | 40 / 38 / 11 / 25 | CRM | M2 | `src/m2_revenue_crm/outils.py` (2 310 l.), `statuts.py`, `acces.py`, `readiness.py`, `ingestion.py`, `doublons.py`, `suggestions.py` | pilote | 21 tests M2 non ouverts |
| `departments/m03-estimation/` | 152 | 17 / 49 / 83 / 3 | Estimation | M3 | `soumission.py`, `soumission_pdf.py`, `estimation.py`, `blocage_prix.py`, `qualite_photos.py`, `monte_carlo.py`, `plancher.py`, `estime_vs_reel.py`, `revue_devis.py` | disponible (calcul, PDF brouillon) ; pilote (reste) | `outils.py` 1110-1530 non lu ; mesure photo absente |
| `departments/m04-field-ops/` + `src/opsys/appareils.py`, `approbations_completion_m4.py`, `equipes.py`, `meteo.py` | 177 | 24 / 48 / 80 / 25 | Terrain | M4 | `etats.py`, `pointage.py`, `consentement.py`, `retention.py`, `preuves.py`, `distances_osrm.py` ; `outbox.py` (extraits) | pilote | `preparation.py`, `meteo_creneaux.py`, `sources_revue_completion.py` (476 l.), `contrats.py` non lus ; corps de la plupart des tests non ouverts |
| `departments/m05-financecore/` + `src/opsys/fusion_*.py`, `intentions_obligations_m5.py`, `agent_cfo_grants.py`, `console/finance_ui.py`, `cfo_ui.py`, `paie_ui.py`, `banque_*.py` | 233 | 20 / 64 / 149 / 0 | Finance | M5 | `facturation.py`, `cash_libre.py`, `comptes_a_payer.py`, `brut_regulier.py`, `taxes.py`, `reconciliation_bancaire_csv.py`, `dossier_decision_cfo.py` | pilote (facture brouillon : A) | `outils.py` (5 848 l.) lu par extraits ; 149 fichiers classés (tests, BMAD) |
| `departments/m06-material-control/` + `src/opsys/contrats_variance_m6.py`, `preuves_photo_bridge.py` | 176 | 39 / 42 / 5 / 90 | Matériel | M6 | `bons_commande.py`, `reception.py`, `fournisseurs.py`, `livre_prix.py`, `variance_chantier.py`, `frontieres.py` (partiel) | pilote (réservation et variance en quantités : disponible) | 90 non examinés (modules de lecture « appareil », tests) |
| `departments/m07-marketing/` + `src/opsys/console/marketing_*.py`, `calendrier_marketing_ui.py`, `frontoffice_marketing.py`, `couts_marketing.py` | 213 | 65 / 46 / 102 / 0 | Marketing | M7 | `usine/service.py` (1 730 l., fenêtres), `usine/chantier.py`, `content/contenu_public.py`, `reputation/inbox.py`, `reputation/demande_avis.py`, `performance_campagnes.py`, `outils.py` (1 593 l.) | disponible (usine, après configuration de la marque) ; pilote ; prévu | Aucune publication ni OAuth (vérifié par recherche) |
| `departments/m08-analytics/` + `departments/m09-strategic-intelligence/` + `src/opsys/tableau_de_bord.py` | 180 | 51 / 51 / 18 / 60 | Analytique, stratégie | M8, M9 | M8 : `outils.py` (1 485 l.), `mesures_chantier.py`, `vue_executive.py`, `cash_libre.py`. M9 : `outils.py` (1 261 l., dont 220-360), `briefing_matin.py`, `suivi_decisions.py`, `etat_consolide.py` | pilote (vue exécutive et briefing : disponible) | 58 tests non ouverts ; dossiers de direction partiels |
| `departments/m10-memoire/` + `src/opsys/memoire/`, `memoire_consolidation.py`, `postflight_runtime.py`, `console/memoire_*.py` | 166 | 38 / 26 / 30 / 72 | Mémoire | M10 | `src/opsys/memoire/store.py` (1 497 l.), `memoire/outils.py`, `registre.py`, `decisions.py`, `paquets.py`, `consolidation.py`, `developpement.py` (1-1503) | disponible (registres, paquet) ; pilote (recherche d'entreprise) | 11 modules du domaine non ouverts ; `developpement.py` 1504-1783 non lu |
| `mobile/` hors `vendor/` (238 fichiers de test Jest et un script de test) | 553 | 87 / 23 / 327 / 179 | Application mobile | Profils, hors ligne, terrain, approbations | `src/outbox/vidangeur.ts` (1-484), `src/roles/garde.ts`, `src/m4/pointage.ts` (extrait), `src/approbations/*`, `app/(employee)/job/[id]/complete.tsx` (1-210), `app/(employee)/employee.tsx` (23 l.) | pilote ; prévu (client, push, GPS) | Écrans M1-M10 vus par nom ; `materials.tsx` non lu ; resynchronisation jamais testée contre un serveur |
| `mobile/vendor/` (node-forge, braces) | 63 | 0 / 0 / 63 / 0 | Dépendances vendorisées (hors OPSYS) | n.a. | `PROVENANCE.json` (en-tête) | non OPSYS | Aucun import dans `src/` ni `app/` ; rien à revendiquer |
| `src/opsys/` hors console, stockage, évènements, garde-fou et hors modules rattachés aux départements | 82 | 31 / 23 / 23 / 5 | Plateforme transverse | Approbations, agents, budgets, MCP, idempotence, CLI, canaux | `capacites.py` (1 768 l.), `serveur_mcp.py` (1 287 l.), `approbations.py`, `agents.py`, `agents_declencheurs.py`, `agents_cron_autorite.py`, `jetons.py`, `admission_agents.py`, `exportation.py`, `cli.py`, `idempotence.py`, `canaux.py`, `connecteurs.py` ; `openclaw.py` par extraits | disponible (approbations, idempotence, MCP) ; pilote | `openclaw.py` (1 198 l.) par extraits ; environ 250 tests racine échantillonnés |
| `src/opsys/console/` (47 fichiers, environ 20 300 l.), `stockage/` (36), `evenements/` (23), `garde_fou_texte/` (6) | 118 | 35 / 25 / 58 / 0 | Console, persistance, bus, garde-fous | Console K1 à K18 | `application.py` (1 208 l.), `pages.py`, `securite.py`, `metier.py`, `ressources.py`, `schema.py`, `moteur.py`, `bus.py`, `repartiteur.py`, `garde_fou_texte/*` | disponible (authentification, approbations console, bus SQLite) ; pilote | 16 modules console classés par grep ; 23 migrations classées par docstring |
| `core/` (OpenClaw 2026.9.6 modifié) | 36 446 | extraits ponctuels ; reste classé | Plateforme amont | Points d'intégration OPSYS (506 fichiers) ; canaux amont | aucun | non revendicable en l'état | Canaux amont non raccordés (section 6) ; workflow et planificateur du core non audités |
| `tests/` (racine) | 347 | échantillon (environ 250 `test_*.py` non ouverts un par un) | Tests transversaux | Budgets, audit, approbations, agents, reprise, sécurité, MCP | aucun | non certifiant | Aucun test exécuté |
| `docs/` | 5 233 | partiel (index, documents produit) ; `research/` (4 783) classé | Documentation et rapports d'auteurs | n.a. | `docs/README.md` ; `DEFINITION-PRODUIT.md` (§0, 1, 6, 9.7, 10, 11) ; ADR-0010 ; ADR-0011 | informatif | Documents périmés (section 6) ; `reprise/`, `grs/`, `programme/` non lus |
| `deploy/` (23) et `install/` (4) | 27 | partiel | Déploiement | Compose : postgres (pgvector), valkey (cache LiteLLM), litellm, openclaw-gateway, opsys, caddy, ollama (optionnel) | `docker-compose.yml`, `.env.example` (noms de variables seulement), `backup.sh`, `restore.sh` | pilote | `install.sh` (908 l.), `Dockerfile`, `entrypoint.sh`, `readiness*.py`, `permissions.py` non lus ; installation réelle non testée |
| `.github/` (26) | 26 | partiel | CI | `ci.yml` : déclencheurs et jobs | `ci.yml` ; `core.yml`, `e2e-core.yml`, `installateur.yml` (structure) | informatif | Statut des runs non lu |
| Racine et outillage (`README.md`, `00-DIGEST.md`, `.claude/`, `LICENSE`, `pyproject.toml`, verrous, `scripts/`, `outils/`) | environ 20 | partiel ; verrous classés | Outillage, règles de développement | n.a. | `README.md`, `00-DIGEST.md`, `.claude/settings.json`, en-tête de `LICENSE` | informatif | `AGENTS.md`, `CLAUDE.md`, `CODEOWNERS`, `outils/fork/elaguer_core.py`, `scripts/ci/*` non lus ; licence contradictoire |

**Secrets : présence signalée seulement.** `core/.env.example` et `deploy/.env.example` (modèles, valeurs non affichées). `core/test/fixtures/state-corpus/2026.9.2/state/config-journal-fingerprint.key` et `core/test/fixtures/state-corpus/2026.9.3-95f3ed9/state/config-journal-fingerprint.key` (fichiers de clé de fixture, contenu non lu). Mots de passe de test fictifs dans des tests de M3 et de la console. Aucune clé réelle identifiée.

---

## 3. Registre des capacités par département

Les statuts sont ceux de la section 1. Une lacune est à reporter sur la page, sous forme de statut ou de précision. Les chemins renvoient au dépôt ; les noms de tests sont donnés sans préfixe répété.

### M1 Réception

| Capacité | Statut | Classe | Preuve | Lacune à reporter |
|---|---|---|---|---|
| Qualification de demandes (conversation, questions, score, prochaine action, transfert) | pilote (disponible à configurer) | A | `departments/m01-front-office/src/m1_front_office/outils.py`, `qualification.py` ; `test_canal_sms_bout_en_bout` (SQLite, M2 réel) | Vocabulaire et services à configurer par entreprise |
| Registre anti-perte chaîné par hachage | disponible | A | `registre.py` ; `test_registre_durable` | Pas d'ancrage externe |
| Appels manqués saisis par un humain | disponible | A | `outils.py:200-224, 385-544` ; `test_import_appels_durable` | Aucun rappel ni SMS sortant |
| Messagerie vocale (WAV téléversé, transcription) | pilote | A client / C transcription | `voicemail_stt.py` ; `test_voicemail_stt` (faux serveur local) | Import manuel ; transcription souveraine « à écrire » (`docs/departements/M1-canaux.md:200`) |
| Transferts humains, plaintes, urgences | disponible | A | `transferts.py`, `plaintes.py` ; `test_outils_transfert` | Destinataires à configurer |
| Résumé de réception (console) | disponible | A | `console/reception_digest_ui.py` ; `test_console_reception_digest` | Le cron de 7 h n'est pas exécuté par le déploiement |
| Suivi des rappels | pilote | A | `test_console_suivi_rappel` | Aucun planificateur ni alerte |
| Retrait STOP | pilote | A | `test_stop_retire_consentement_marketing` | SMS seul |
| Envoi réel au client après approbation | prévu | C | `adaptateurs.py:76-83` ; l'approbation N4 est réelle, l'envoi produit un hachage | Ne pas écrire « envoyé » |
| Formulaire du site vers M1 (signature HMAC) | pilote (pont) ; prévu (page HTML) | A test / E lancement | `formulaire_recepteur.py` ; `console/application.py` | Pont non activé par `opsys-console` (réponse 503) ; page HTML non signée |
| Agent vocal temps réel, courriel, webchat, réseaux | prévu | D | `phases_voix.py` (journal d'état seul) | Pas de SIP ni de STT en flux |

### M2 Relation client et ventes

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Ingestion de leads (bus M1, outil, unicité, prix et dates refusés) | disponible | A | `ingestion.py` ; `test_ingestion` ; `tests/test_cascade_relances` (M1 réel) | Formulaire public non connecté |
| Transitions d'état contrôlées (9 transitions, motifs requis) | pilote | A | `statuts.py` ; `test_statuts` | Aucun écran ; les consommateurs M3 et M4 font `qualifie→converti` sans personne (`outils.py:1581`, `1305-1318`) |
| Readiness pour l'estimation (M3) | disponible | A | `readiness.py` ; `test_readiness` ; `tests/e2e/test_readiness_m2_m3_concurrente` (PostgreSQL 17, ignoré par défaut) | Signature SHA-256 sans clé |
| Prochaine action suggérée (10 règles) | disponible | A | `suggestions.py` ; `test_suggestions` | Ni score ni valeur |
| Réception des soumissions M3 et des fins de chantier M4 (bus) | disponible | A | `outils.py:1352-1441, 994-1337` ; `test_consommer_devis_accepte` | Pas de montant de soumission |
| Client 360 | pilote | A | `clients.py` | Agrège le registre M2 seulement (pas de devis, facture, chantier) |
| Dédoublonnage, relances, consentements, segments | pilote | A | `doublons.py`, `relances.py`, `segments.py` | Aucune relance configurée par défaut ; aucun écran |
| UTM et source d'acquisition | pilote | A (réception) | `contrats.py` ; `test_utm_derive_m2` | Pas d'attribution calculée |
| Adaptateurs CRM tiers ; kanban ; scoring ; SLA | prévu | E / D | `adaptateurs.py` non importé | Ne pas annoncer |

### M3 Estimation

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Estimation déterministe avec garde anti-précision | disponible | A | `estimation.py`, `blocage_prix.py`, `qualite_photos.py` ; `test_estimation_stockage`, `test_estimation_risquee` | Quantités, barème et prix saisis par l'appelant ; aucun catalogue livré |
| Monte Carlo et plancher de rentabilité | disponible (portée limitée) | A | `monte_carlo.py`, `plancher.py` | Incertitude sur le coût unitaire seulement ; pas d'incertitude de mesure |
| Soumission PDF BROUILLON filtrée des coûts et marges | disponible | A | `soumission.py:50-78` (liste blanche) ; `soumission_pdf.py` ; `test_soumission_pdf_outil` (texte relu par pypdf) | Contenu minimal : ni exclusions, ni délai, ni taxes, ni en-tête d'entreprise |
| Revue en 11 critères et approbation N4 avant envoi | disponible (interne) | A | `revue_devis.py`, `outils.py:1819-1875` ; `test_envoi_devis_capacites` | Le statut `envoye` est interne ; l'envoi au client n'existe pas |
| Scénarios et alerte rouge | pilote | A | `scenarios.py` ; test avec manifeste jetable | Vides à la livraison |
| Mesure à partir de photos, vision, géospatial | prévu | C / E | `mesure_plan.py` sans appelant ; `test_mesure_plan` (images synthétiques) | Photos = métadonnées déclarées |
| Estimé contre réel (minutes) et calibration gouvernée | pilote | A | `estime_vs_reel.py`, `calibration_versions.py` ; `test_calibration_promotion_sdk` | Données fictives ; compare des minutes, pas des dollars |
| Relance de devis sans réponse | pilote | A | `outils.py:1538-1563` ; `test_estimation_stockage` | Délai fixé à la main ; planification non prouvée |
| Digest des estimations bloquées | prévu | E | `digest.py` importé par un seul test | Aucun outil ne lit le registre |

### M4 Field Operations (terrain)

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Intervention « à planifier » née d'un devis accepté | disponible | A | `etats.py`, `outils.py:2677-2713` ; `test_consommer_devis_accepte` | Dépend de M3 |
| Fin de chantier côté serveur (WCT), publiée dans la même transaction | disponible (serveur) | A | `outils.py:882-899` ; `m4_completer_intervention` (`outils.py:1701`) ; `test_evenements_m4` | Issue toujours `completed_pending_review` |
| Cédule par tournées et assignation | pilote | A | `cedule.py`, `cedule_tournees.py` ; `test_cedule_tournees_outils` | Aucun écran ; profil d'équipes absent |
| Distances | disponible (distance bridée) | A | `distances.py` | Ne pas écrire « itinéraire exact » |
| Routage OSRM | prévu | E / C | `distances_osrm.py` appelé sans fournisseur (`src/opsys/departements.py:141`) | Jamais testé contre un vrai OSRM |
| Pointage (heure serveur) | pilote | A serveur / C application | `pointage.py` ; `test_pointage` | Application : position factice (section 4) |
| Géolocalisation au pointage | prévu côté application | A serveur / C application | `consentement.py`, `retention.py` ; `mobile/src/m4/contextePointageProvisoire.ts:46-70` (position 0,0, rayon 20 000 km) | `expo-location` absent ; attestation d'appareil `fictif` |
| Preuves : photos après, signature, checklist | pilote | A serveur / B application | `preuves.py`, `fichiers.py` ; `test_outils_fichiers` | Photos avant et pendant non envoyées |
| Clôture contrôlée : revue N4 et variance M6 | pilote | A partiel | `outbox.py`, `sources_revue_completion.py`, `approbations_completion_m4.py` | Pas de notification à l'admin ; aucune facturation ni clôture |
| Retards, reports, incidents | pilote | B | `retards.py` ; `retards_outil` (non ouvert) | Aucun écran pour signaler un incident |
| Météo des créneaux | pilote | A logique | `meteo.py`, `meteo_fournisseurs.py` | Open-Meteo fermé sans forfait commercial et décision du propriétaire (`meteo_open_meteo.py`) |
| Temps vers la paie (brouillon, heures régulières) | pilote | B | `temps.py`, `heures_regulieres.py` | Minutes par technicien ; validation M5 |
| Dispatch par date, ETA client, message client, score d'équipe | prévu | D / C | `outils.py:918-933` (message fixe non envoyé) | Absents |

### M5 FinanceCore (préparation financière)

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Facture brouillon après travaux terminés (M3 et M4 vers M5) | disponible (interne) | A | `facturation.py:278-390`, `outils.py:704-804` ; `tests/test_cascade_travaux_termines.py:367-462` (fictif) | Aucun PDF, aucun numéro séquentiel, aucun envoi |
| Envoi et paiement de facture (statuts, N4 et N5) | pilote | A statut | `outils.py:3268-3334`, `outils.py:4863-4870` | Aucun courriel réel ; montant saisi à la main |
| Comptes à recevoir et âge | disponible | A | `facturation.py:523-670` ; `test_comptes_a_recevoir` | Pas de relance ni de lien de paiement |
| Comptes à payer (saisie humaine, correction, rapprochement proposé) | disponible | A | `comptes_a_payer.py` ; `test_comptes_a_payer_outils` | OCR fermé par défaut ; aucun paiement fournisseur |
| Calculs monétaires exacts (`Decimal`) | disponible | A | `test_conformite.py:265-310` (garde statique) | Taux de main-d'œuvre non datés (section 6) |
| Cash libre et prévision de flux (26 semaines au plus) | pilote | A | `cash_libre.py`, `prevision.py` ; `test_cash_libre_outils`, `test_prevision_outils` | Registre interne, pas la banque ; paies et DAS dans un YAML non livré |
| Calendrier TPS et TVQ | pilote | A | `calendrier_fiscal.py` ; `test_calendrier_fiscal` | Années 2025-2026 seulement ; « A_VALIDER CPA » |
| Coût réel et rentabilité par chantier | pilote | A | `cout_reel.py` ; `test_cout_reel_cascade` | Taux horaire absent du manifeste livré |
| Brut régulier et dossier WebRAS (préparation) | pilote | A | `brut_regulier.py` ; `test_console_paie` | Ni retenues, ni net, ni DAS |
| Retenues QC (RRQ, RQAP, AE, impôt) | prévu | E | `paie_qc_preparatoire.py` et 4 modules : aucun appelant hors tests | Ne pas présenter de calcul de paie |
| Rapprochement bancaire par CSV (aperçu) | pilote | A | `reconciliation_bancaire_csv.py` ; `test_console_rapprochement_bancaire` | Aucune connexion bancaire |
| Dossier CFO et décision de capital | pilote | A composition | `dossier_decision_cfo.py`, `decision_capital.py` ; `test_dossier_decision_cfo` | Scénarios et recommandation « INCONNU » |
| Connecteurs QuickBooks, CCube, Stripe, Plaid, grand livre, T4 et RL-1 | prévu | D | aucun code | Gates listés dans `DEFINITION-PRODUIT.md` §10 |

### M6 Material Control (matériel)

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Fournisseurs et livre de prix (saisie interne) | disponible | A | `fournisseurs.py`, `livre_prix.py` ; `test_fournisseurs`, `test_livre_prix` | Aucune API fournisseur ; pas de fiabilité |
| Besoins prévus à partir des devis acceptés (M3 vers M6) | disponible | A | `besoins_prevus.py` ; `test_cascade_besoins_materiaux` | Facteur de perte conservé mais non appliqué |
| Réservation et disponibilité | disponible | A | `reservations.py` ; `test_reservation_outils` | Pas d'ajustement si l'estimation change |
| Variance estimé et réel, en quantités | disponible | A | `variance_chantier.py` ; `test_variance_chantier`, `test_cascade_travaux_termines` | Prix absents ; écarts non critiques |
| Bon de commande brouillon, approbation N3 | pilote | A | `bons_commande.py:114-345` ; `test_outils_po` | Aucun écran |
| Envoi d'un bon de commande | prévu (statut seulement) | D | `bons_commande.py:375-441` ; `m6_marquer_po_envoye` | Aucun courriel émis |
| Réception partielle, sorties, retours, pertes, bris | pilote | A | `reception.py`, `materiel.py` ; `test_reception_cumulee_outils` | Réception sans bon non idempotente ; aucun écran |
| Preuves de pertes et photos | pilote | A partiel | `preuves_pertes_bris.py` ; `test_preuves_m6_appareil_atomiques` | Pont photo inactif sans jeton |
| Emplacements et transferts | pilote | A | `emplacements.py` ; `test_emplacements` | Sorties et réceptions non localisées |
| Paiements | exclus dans le code | A | `frontieres.py`, `conformite.py` | À dire : M6 ne paie rien |
| Catalogue de matériaux, codes SKU | prévu | C | `catalogue.py` (argument libre) | Aucun catalogue persistant |

### M7 Marketing et croissance

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Chantier terminé vers des propositions de contenus, décision humaine, export manuel | disponible après configuration de la marque | A | `usine/chantier.py`, `usine/service.py`, `usine/paquet.py` ; `test_service_usine` (SQLite, fictif) | Rien sans profil de marque ; export à copier-coller |
| Consentement vérifié avant contenu ou média | disponible | A | `content/contenu_public.py:58-75` ; `test_sans_consentement_du_tout_rien` | La preuve vient de M4 ; témoignages : aucun contrôle |
| Retrait STOP propagé depuis M1 | pilote | A | `usine/retrait.py` ; `tests/test_stop_retire_consentement_marketing.py` | SMS injecté dans le test |
| Inbox d'avis (import manuel, réponse exportée) | disponible (saisie) | A | `reputation/inbox.py` ; `test_inbox_durable` | Aucune API Google ou Facebook ; plaintes non exportées |
| Demande d'avis | pilote (brouillon) | A brouillon | `reputation/demande_avis.py` ; `test_demande_avis` | Aucun envoi, aucun destinataire |
| Marque, calendrier de remise, SEO et AEO locaux | disponible | A | `brand/registre.py` ; `seo/seo_audit.py` ; `test_calendrier_durable` | Chaîne de hachage, pas de signature |
| Attribution lead vers devis vers marge (M2, M3, M5) | pilote | A | `performance_campagnes.py` ; `test_performance_campagnes` | Coût publicitaire et ROI à null |
| Publication sur réseaux sociaux, OAuth | prévu | C | `social/postiz_adapter.py` en simulation (dry-run) | Connecteurs « à construire » (`console/connecteurs_ui.py:34`) |
| ROI, CPL par plateforme, floutage automatique | prévu | C / E | `roi`, `moderation/detection.py` (détecteur par défaut qui lève toujours) | Fixtures fictives |

### M8 Business Truth et analytique

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Collecte par le bus (11 types d'évènements) | disponible | A | `outils.py:408-615` ; `test_m9_snapshots_chantier_bus`, `test_cascade_mesure_m8_m9` | Aucune collecte hors bus |
| Vue exécutive (entonnoir, contenus, marge) | disponible | A | `vue_executive.py`, `entonnoir.py` ; `e2e/test_admin_appareil` | Sans période ; écran mobile non vérifié |
| Mesures de chantier, « non calculable » quand une donnée manque | pilote | A | `mesures_chantier.py:323-453` ; `test_cascade_mesure_m8_m9` | Seuils d'alerte vides |
| Alertes de qualité et de fraîcheur, dictionnaire, XmR, digest | pilote | B | `qualite.py`, `dictionnaire.py`, `xmr.py` | Aucun appelant automatique ; dictionnaire seulement pour M7 et M8 |
| Wallboard, score de santé, copilote, pont BI, prévisions | prévu | D | aucun code | KPI déclarés non calculés |

### M9 Strategic Intelligence

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Consommation des snapshots chantier de M8 | pilote | A | `outils.py:224-293` ; `test_m9_snapshots_chantier_bus` | Producteur non authentifié : le bus accepte tout nom de producteur non vide (`bus.py:81`) |
| Briefing du matin et lecture stratégique | disponible | A | `briefing_matin.py`, `lecture_strategique.py` ; `e2e/test_briefing_admin_appareil` | Le cron dépend d'OpenClaw, non prouvé ; ce n'est pas un conseil |
| Suivi de décision sous approbation du propriétaire | pilote | A | `suivi_decisions.py` ; `test_suivi_decisions` | N'exécute rien, ne crée aucune tâche |
| État consolidé et dossier de direction | pilote | A / B | `etat_consolide.py`, `dossier_direction.py` | Toujours NON_VALIDE, rapport incomplet |
| Conseil d'agents, scénarios, priorités, OKR, orchestrateur | prévu | D | aucun code | Le SOUL interdit de les produire |

### M10 Mémoire

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Registres chaînés par hachage (décisions, événements, affaires) | disponible | A | `departments/m10-memoire/src/m10_memoire/registre.py:42-94` ; `test_registre_durable` | Pas d'ancrage externe ni de purge |
| Consommation des évènements M1 à M6 | disponible | A | `outils.py:208-374` ; `test_cascade_amont_m10` | Producteurs hors zone |
| Paquet de contexte à quatre couches, filtre de confidentialité | disponible | A | `paquets.py`, `confidentialite.py` ; `test_outils_agent` | Budget de 4 000 caractères |
| Décisions motivées et preflight structurel | disponible (limité) | A | `decisions.py`, `contexte.py` | `validee` posable hors mode ombre (`paquets.py:142-147` relaie ce statut aux agents) |
| Recherche d'affaire littérale | disponible | A | `recherche_affaire.py` ; `test_recherche_affaire_appareil` | Ni sémantique ni relations |
| Mémoire d'entreprise hybride (plein texte et vecteurs) | pilote | A conditionnel | `src/opsys/memoire/store.py` ; `test_memoire_store` (PostgreSQL réel) | PostgreSQL requis ; désactivée par défaut ; embeddings via un point configuré |
| Rétention et effacement (mémoire d'entreprise) | pilote | A | `src/opsys/memoire/store.py:1243-1364` ; `test_memoire_store:180-248` | Registres hors champ ; boucle de purge non testée |
| Mémoire de développement (console, CLI) | pilote, hors offre client | A | `developpement.py` ; `test_developpement` | Usage interne |
| Consolidation de développement sous grant humain | pilote | A | `consolidation_developpement.py` ; `test_consolidation_developpement` | SQLite seul ; cron non lancé |
| Graphe de relations, notes employé ou vendeur, banc d'évaluation | prévu | D / C | `evaluation.py` (9 questions fictives) | ADR-0010 annonce SQLite FTS5 et Graphiti : aucun code correspondant |

### Transversal (plateforme et console)

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Approbations bloquantes N0 à N5 | disponible | A | `capacites.py:1490-1549`, `approbations.py:116-341` ; `test_capacites_jetons`, `test_approbations_identite` | N5 : attestation saisie en texte ; l'agent n'est pas repris |
| Idempotence des mutations d'appareil | disponible | A | `idempotence.py` ; `test_idempotence_appareil` | Effets externes non garantis |
| Serveur MCP : jeton porteur, transport HTTP | disponible | A | `serveur_mcp.py` ; `test_serveur_mcp_http` (uvicorn réel) | Identité transmise en clair dans `_meta` ; non publié hors réseau Compose |
| Agents configurables (profils, budgets, déclencheurs) | pilote | A | `agents.py`, `openclaw.py:943-1004` ; `test_agents_configurables` | Pas de portée de données, pas d'escalade |
| Budgets de tokens avant appel fournisseur | pilote | A / C | `admission_agents.py`, `jetons.py` ; `test_admission_agents`, `test_serveur_mcp_http` | En tokens, pas en dollars ; départements en mode natif non comptés |
| Audit | pilote | A partiel | `etat.py`, table `journal` (`schema.py:229-238`) | Pas de chaîne de hachage sur `journal` |
| Cron des profils | pilote | A registre | `agents_declencheurs.py`, `agents_cron_autorite.py` ; `test_cron_operateur_http` | Exécution par le planificateur du core non prouvée |
| Cron des manifestes (`automatisations.sh`) | prévu | B | `openclaw.py:921-939` | Aucun installateur ni entrypoint ne l'exécute |
| Canal SMS, connecteur STT, passerelle LiteLLM | pilote | C | `canaux.py` (`CANAUX` ne contient que le SMS), `connecteurs.py`, `passerelle.py` ; `test_openclaw_canaux` (fictif) | Aucun fournisseur réel appelé en test |
| Plugin Hermes | prévu | E | `hermes_plugin.py` | Hors chemin par défaut, retrait prévu |
| Export et restauration | pilote | A | `exportation.py` ; `test_exportation` | SQLite local ; archive non chiffrée |
| Console : authentification (personne, mot de passe scrypt, cookie HMAC, CSRF, CSP) | disponible | A | `securite.py`, `application.py` ; `test_console` (SQLite réelle) | Pas de MFA ; limitation de débit seulement via fail2ban sur l'hôte |
| Console : approbations, modes, budgets, connecteurs (lecture) | disponible (configuration) | A | `application.py` ; `test_console`, `test_console_connecteurs` | Appels aux fournisseurs non prouvés |
| Console : pages par département (M1 à M10) | pilote | A | `console/*_ui.py` ; 196 routes | Plusieurs actions qualifiées SQLite seulement |
| Bus d'évènements persistant | disponible | A | `evenements/bus.py`, `repartiteur.py` ; `test_evenements`, `test_cascade_devis_accepte` | Au moins une tentative ; effets externes non garantis ; ordre non garanti ; M1 n'a aucun consommateur |
| Garde-fou de texte | disponible (filtre) | A | `garde_fou_texte/` ; `test_garde_fou_texte` | N'est pas appliqué aux devis M3, factures M5 ni briefings M9 |
| Sauvegarde et restauration | pilote | A logique / skip réel | `deploy/backup.sh`, `deploy/restore.sh` ; `test_deploy_backup_restore` | Restauration Docker non exécutée (rapporté par les auteurs) ; `.env` exclu |

### Application mobile

| Capacité | Statut | Classe | Preuve | Lacune |
|---|---|---|---|---|
| Appairage par code et approbation du propriétaire | pilote | B | `appairage/client.ts`, `app/pairing/index.tsx` | Jamais joint à une passerelle ; code saisi à la main |
| Profil confirmé par le serveur | pilote | B | `identite/contrat.ts`, `identite/hooks.ts` | Contrepartie serveur jamais testée avec l'application |
| Garde d'accès par rôle | pilote | A fonction pure | `roles/garde.ts` ; `garde.test.ts` (matrice 4 × 4) | L'autorité réelle est côté serveur |
| File sortante hors ligne (SQLite local) | pilote | A module | `outbox/depot.sqlite.ts` ; `depot.sqlite.test` | Pont SQLite d'Expo non qualifié |
| Resynchronisation, idempotence, rejets | pilote | B | `outbox/vidangeur.ts` ; `vidangeur.test.ts` (faux fetch) | Jamais contre un serveur ; envoi seulement au premier plan ou au retour du réseau |
| Capture terrain : photos, checklist, signature, « Terminer » | pilote | B | `photos/service.ts`, `checklist/`, `signature/`, `app/(employee)/job/[id]/complete.tsx` | Photos avant et pendant non envoyées ; caméra non qualifiée |
| Matériaux utilisés | pilote | B | `app/(employee)/job/[id]/materials.tsx` (non lu) | Écran non examiné |
| Pointage et consentement GPS | prévu | C | `m4/contextePointageProvisoire.ts` | Position 0,0 ; fenêtre 2000-2999 ; GPS non lu |
| Accueil de l'employé | prévu (minimal) | n.a. | `app/(employee)/employee.tsx` (23 lignes ; « aucun écran métier ici ») | Aucun lien vers la cédule ou le pointage |
| Profil client (suivi, liens tokenisés) | prévu | E | `app/(client)/client.tsx` ; `identite/contrat.ts` exclut le rôle `client` | Un titre seulement |
| Notifications push, scan, GPS en arrière-plan | prévu | D / E | aucun code (`outbox/types.ts:39-43` : types morts) | MOBILE.md : « pas de notifications push » |
| Approbations (admin) | pilote | B | `approbations/*`, `app/(admin)/approvals.tsx` | Liste en ligne seulement |
| Vendeur : leads, fiche, notes, devis (lecture) | pilote | B | `vendeur/service.ts`, `app/(seller)/` | Ni estimation, ni marge, ni photos |
| Écrans admin M1 à M10 | pilote | B | `app/(admin)/*.tsx` appellent des outils réels (85 noms) | Présence des outils vérifiée par nom seulement |

---

## 4. Démonstration centrale et scénario « Travaux terminés »

### 4.1 Démonstration centrale, maillon par maillon

Quatre états sont distingués pour chaque action : **préparée** (le système a produit le contenu), **approuvée** (une personne habilitée a décidé), **envoyée** (le message ou le document a quitté le système), **acquittée** (le destinataire ou le tiers a confirmé). Un maillon sans code d'envoi n'est jamais « envoyé ».

| # | Maillon | Ce que le code fait | Réel, simulé ou cible | Préparée / approuvée / envoyée / acquittée | Statut |
|---|---|---|---|---|---|
| 1 | Demande reçue | Moteur de réception SMS testé de bout en bout (M1, M2 réel, SQLite) ; import manuel d'appel manqué | Réel pour le moteur ; transport SMS et téléphonie simulés (Twilio non observé en production) | Préparée : résumé. Envoyée : sans objet (entrée) | pilote |
| 2 | Qualification | Score, questions, prochaine action, transfert humain | Réel, réglages à configurer | Préparée | disponible (à configurer) |
| 3 | Dossier client | Lead ingéré depuis l'évènement `m1.lead_qualifie` ; pipeline | Réel | Préparé | disponible (création) ; pilote (suivi) |
| 4 | Estimation | Calcul déterministe, garde anti-précision, PDF BROUILLON | Réel ; entrées saisies (quantités, prix) ; photos non mesurées | Préparée : brouillon | disponible (calcul) ; prévu (mesure photo) |
| 5 | Soumission approuvée | Revue en 11 critères ; approbation N4 réelle ; statut interne `envoye` | Réel jusqu'à l'approbation | Préparée : oui. Approuvée : oui. Envoyée : non (aucun code d'envoi client). Acquittée : non | approbation disponible ; envoi prévu |
| 6 | Planification et matériel | Intervention à planifier ; cédule ; réservation ; bon de commande brouillon approuvé N3 | Réel côté serveur, sans écran | Bon : préparé et approuvé. Envoyé : non (statut seulement, aucun courriel). Acquitté : non | pilote |
| 7 | Exécution | Pointage (position factice), capture terrain, « Terminer » qui publie le WCT | Serveur réel ; application simulée en partie | Préparée : fin de chantier | pilote |
| 8 | Clôture contrôlée | WCT `completed_pending_review` ; revue N4 ; variance M6 en quantités | Réel côté serveur ; alerte admin sur téléphone non prouvée (pas de push) | Approuvée si écart | pilote |
| 9 | Facture brouillon | Facture BROUILLON créée après travaux terminés ; TPS et TVQ calculées | Réel en interne | Préparée : oui. Envoyée : non. Acquittée : non (paiement N5 saisi à la main) | disponible (interne) |
| 10 | Analyse et apprentissage | Vue exécutive (M8), briefing (M9), journal de décisions et paquet de contexte (M10), calibration des minutes (M3) | Réel sur données fictives | Sans objet | pilote (disponible pour le briefing et le journal) |

**Cible seulement :** conseil stratégique multi-agents (M9), apprentissage sur données réelles, avatars, fusion opérationnelle, prévisions. Ces éléments ne figurent pas dans la démonstration centrale.

### 4.2 Scénario signature « Travaux terminés »

| Étape | Ce qui se passe | Réel, simulé ou cible | Statut |
|---|---|---|---|
| Checklist, photos après, temps, matériaux | La checklist est locale ; les photos après sont en file d'attente ; le pointage utilise une position factice ; l'écran matériaux n'a pas été lu | Simulé en partie côté application | pilote |
| Anomalie | La fin de chantier passe en `completed_pending_review` et exige une revue N4 | Réel côté serveur | pilote |
| M6 | Compare les quantités estimées et réelles ; enregistre les sorties ; signale le stock bas | Réel en quantités ; prix absents ; alerte admin sur téléphone non prouvée | disponible (quantités) |
| M5 | Crée la facture brouillon et met à jour la rentabilité | Réel en interne ; aucun document ni envoi | disponible (brouillon) |
| M2 | Marque le chantier terminé, écrit l'activité | Réel ; la prochaine action est une suggestion | pilote |
| M7 | Propose des contenus ; demande un avis | Contenus : réel après configuration de la marque, décision humaine, export manuel. Avis : brouillon uniquement | disponible (contenus) ; pilote (avis) |
| M3 | Compare estimé et réel (minutes) | Réel, données fictives | pilote |
| M8 | Expose les résultats | Vue exécutive réelle ; mesures de chantier en pilote | disponible / pilote |
| M9 | Exploite les informations | Briefing réel ; suivi de décision sous approbation | disponible / pilote |
| M10 | Conserve l'évènement et ses sources | Journal chaîné par hachage, écrit par le bus | disponible |

Le titre proposé dans l'annexe (« Le chantier se termine. Le suivi ne s'arrête pas. ») n'est acceptable que si chaque étape ci-dessus garde son statut visible. Sans cela, il promet la continuité d'un suivi client qui n'est pas livré.

### 4.3 Boucle des matériaux

| Étape | Statut |
|---|---|
| Besoins estimés à partir du devis accepté | disponible |
| Disponibilité et réservations | disponible |
| Commande brouillon et approbation N3 | disponible / pilote |
| Communication au fournisseur | **prévu** : aucun envoi |
| Réception partielle ou complète | pilote |
| Utilisation sur le terrain, retours, pertes, bris | pilote |
| Coût de chantier | pilote (partiel : taux de main-d'œuvre absent) |
| Révision des hypothèses | non automatisée |

---

## 5. Ce que la page peut affirmer, et ce qui est interdit

### 5.1 Affirmations permises (avec la formulation à utiliser)

| Affirmation | Preuve | Formulation recommandée |
|---|---|---|
| Dix départements qui échangent des évènements sur un même dossier | Bus réel (A), consommateurs dans M2 à M10, tests de cascade | « Dix départements échangent des évènements sur un bus interne. Leur niveau de disponibilité est indiqué pour chacun. » |
| Approbation humaine des actions engageantes | Approbations N0 à N5 (A) | « Les actions engageantes (envoi, paiement, décision financière) demandent une approbation. » Ne pas dire « toute transition ». |
| Estimation qui refuse de chiffrer sans information | M3 (A) | « Une estimation indique ce qui manque et refuse de chiffrer quand l'information est insuffisante. » |
| Soumission brouillon séparée des coûts internes | M3 (A) | « La soumission générée est un brouillon, filtré de vos coûts et marges internes. » Ne pas dire « envoyée ». |
| Facture brouillon après travaux terminés | M5 (A, interne) | « Une facture brouillon est préparée à la fin des travaux, à valider avant tout envoi. » |
| Journal chaîné par hachage | M1, M10 (A) | « Un journal qui détecte les modifications. » Ne pas dire « immuable » ni « inviolable ». |
| Console web authentifiée | Console (A) | « Une console protégée par authentification, avec approbations et budgets. » |
| Installation sur un serveur ou VPS que vous contrôlez | Compose et scripts d'installation (pilote) | « Installable sur votre serveur ou VPS ; procédure à qualifier avec nous. » |
| Préparation de la paie, sans calcul de paie | M5 (pilote) | « Préparation des heures et du brut pour votre comptable. » |
| Rapprochement bancaire à partir de relevés CSV | M5 (pilote) | « Rapprochement à partir de relevés exportés. » |
| Suivi du lead au devis puis à la marge | M2, M3, M5 (pilote) | « Suivi du lead au devis et à la marge, sans coût publicitaire pour l'instant. » |
| Contenus marketing soumis à approbation, consentement vérifié | M7 (A, après configuration) | « Des propositions de contenus, soumises à votre approbation, et qui vérifient le consentement. » |
| Demandes d'avis | M7 (brouillon) | Ne pas l'affirmer comme envoi. |
| Mémoire de décisions avec sources | M10 (A, décisions ; pilote, connaissances) | « Les décisions sont journalisées avec leur contexte. » |

### 5.2 Affirmations interdites faute de preuve

| Formulation à éviter | Pourquoi | Ce qu'il faut dire à la place |
|---|---|---|
| « Votre entreprise fonctionne seule » ; « Plus aucun appel ou client perdu » | Contredit par les statuts et déjà refusé par le brief | « Centralisez les demandes et rendez les suivis visibles. » |
| Envoi automatique de soumissions, factures, SMS, courriels, avis | Aucun envoi réel au client (prévu) | « Préparé, approuvé, puis transmis par votre équipe. » |
| QuickBooks, Stripe, Plaid, banque, Google Ads, Meta, LinkedIn, TikTok, Search Console | Gates ou prévus (`DEFINITION-PRODUIT.md` §10) | Ne rien nommer. |
| Publication automatique sur réseaux sociaux | Connecteurs absents ; export manuel seulement | « Paquet prêt à publier, exporté par votre équipe. » |
| « Une photo suffit pour une estimation » ; mesure de dimensions depuis une photo | Aucune mesure photo (C et E) | « Photos et mesures saisies, avec les incertitudes. » |
| Géolocalisation des employés en direct ; itinéraires exacts ; dispatch automatique | GPS factice ; OSRM non déployé ; dispatch absent | « Pointage et planification, avec consentement. » (géolocalisation à qualifier) |
| « Application mobile complète pour quatre profils » ; « hors ligne vérifié » ; notifications push | Profil client absent ; resynchronisation jamais testée contre un serveur ; pas de push | « Application pour l'administration, les vendeurs et les employés (en pilote). » |
| Réceptionniste téléphonique IA ; appels traités en temps réel | Pas de téléphonie ni de SIP (D) | « Messages vocaux transcrits (en pilote). » |
| « L'IA fait votre comptabilité et vos impôts » ; paie calculée ; déclarations | Retenues non branchées ; calendrier à valider par un CPA | « Préparation de vos dossiers, avec validation par votre comptable. » |
| « Mode souverain », « 100 % souverain », « aucune donnée chez un fournisseur d'IA », « hors ligne garanti », « aucune télémétrie » | Aucun « mode souverain » n'est défini dans le code ni dans les docs produit ; le mot n'apparaît que pour une transcription « à écrire » (`docs/departements/M1-audit.md:194`) ; le fichier d'environnement liste neuf fournisseurs d'IA cloud ; la passerelle LiteLLM peut les appeler ; la transcription souveraine est « à écrire » | Décrire le périmètre réel : où sont les données, qui peut y accéder, quels flux sont configurés. |
| « Apprend automatiquement de toutes vos données » ; « mémoire parfaite » | Calibration gouvernée seulement ; pas de rappel garanti | « Connaissances et décisions retrouvables, sourcées et révisables. » |
| « Conforme à la Loi 25 » ou « certifié » | Politiques en proposition, non validées | « Conçu pour la protection des renseignements personnels ; à valider avec votre conseiller juridique. » |
| « Open source », « Apache », licence propriétaire | Contradiction non tranchée (section 6) | Ne rien dire sur la licence. |
| Telegram, WhatsApp, Slack, Teams, iMessage | Code amont présent dans `core/`, non raccordé à OPSYS (`CANAUX` ne contient que le SMS) | Ne rien nommer. |
| Logos ou mentions de Gentek, Royal Solution de Bâtiment, O.A.M., Kaycan ; témoignage Synergy | Contexte métier, pas de partenariat ni de témoignage autorisé | Aucun. |
| ROI marketing mesuré ; gains de temps chiffrés ; pourcentages de précision | Aucune mesure en usage réel | Décrire la méthode, pas un résultat. |
| « 3 323 tests », « 992 tests », « 1 849 cas » comme preuve | Chiffres rapportés, non vérifiés, non certifiants | Aucun chiffre de tests. |
| Score de santé, tableau de bord temps réel, wallboard | Absents (D) | « Vue exécutive. » |
| « Essai gratuit » ; « souscrire » ; « démarrer maintenant » | Pas de produit en libre-service | CTA : démonstration, étude de déploiement, pilote qualifié. |
| « Mise en service en quelques jours » | Aucune preuve | Aucun délai, sauf mesuré sur un pilote. |
| « Fusion opérationnelle », avatars, apprentissage étendu, agents qui décident seuls | Vision (D), à présenter comme évolution | Mention dans une section « vision », clairement nommée. |

### 5.3 Règles de présentation

- Chaque capacité porte son statut visible (disponible, pilote, prévu), comme demandé par le brief.
- La démonstration centrale est étiquetée « démonstration sur données fictives ».
- Le maillon « envoyé » n'apparaît jamais sans code d'envoi réel. Le maillon « acquitté » n'apparaît jamais sans confirmation externe.
- Sur le terrain, la position est formulée comme pointage horodaté par le serveur, avec géolocalisation à qualifier.
- Les marques et prestataires cités dans le contexte métier ne sont jamais présentés comme partenaires.
- CTA : « Demander une démonstration » ou « Étudier un déploiement / lancer un pilote ». Aucun « essai gratuit ».

---

## 6. Anomalies et contradictions à connaître avant rédaction

1. **Documentation périmée.** `README.md` annonce 427 tests (département M4), 992 (M7), 3 323 (mobile) et 26 outils (M5) ; le code déclare 31 outils M5 et 29 outils M6. `DEFINITION-PRODUIT.md` §11 décrit l'état de juin 2026 (M1 « STUB », M9 « STUB »), que le code contredit. La matrice LOT7 renvoie à des lignes qui ne contiennent plus les fonctions nommées. Le README M7 dit que `client_satisfait = false` refuse la demande d'avis : le code et les tests disent le contraire.
2. **Décision humaine non universelle.** Le PRD de M2 (`departments/m02-revenue-crm/docs/bmad/02-PRD-PM.md:22`) exige une décision humaine explicite pour passer de `qualifie` à `converti`, et le SOUL de M2 (`SOUL.md:11`) exige une décision humaine avant de faire progresser un dossier. Pourtant, les consommateurs des évènements de M3 et de M4 font `qualifie→converti` et `converti→cedule→chantier→facture` sans personne (`departments/m02-revenue-crm/src/m2_revenue_crm/outils.py:1305-1318, 1581`). `m2_transitionner_statut` ne demande pas d'humain, contrairement à la réassignation et au consentement.
3. **Auto-approbation de saisie AP.** La saisie N3 de compte à payer est créée et décidée par la même personne, dans la même requête (`src/opsys/console/fusion_ap_m5_saisie.py:318-326`). Ne pas présenter cette saisie comme une double validation.
4. **Décisions de M10.** `m10_journaliser_decision` accepte le statut `validee` d'un agent hors mode ombre, et ce statut alimente les « règles de l'entreprise » de tous les agents (`departments/m10-memoire/src/m10_memoire/paquets.py:142-147`).
5. **Journal non chaîné.** La table `journal` n'a ni empreinte ni contrainte SQL ; l'immuabilité repose sur l'absence de code UPDATE ou DELETE. Les registres M1 et M10 sont en revanche chaînés.
6. **Bus permissif.** `src/opsys/evenements/bus.py:81` n'exige qu'un nom de producteur non vide. Un évènement forgé mais cohérent serait admis. Le commentaire de M9 le reconnaît (`departments/m09-strategic-intelligence/src/m9_strategic_intelligence/outils.py:229-232`).
7. **Position factice au pointage.** La position est (0,0) avec un rayon de 20 000 km ; l'attestation d'appareil et le consentement sont `fictif: true` (`mobile/src/m4/contextePointageProvisoire.ts:46-70`). Le serveur écrit chaque pointage avec `fictif: True`.
8. **Accueil employé vide.** `employee.tsx` (23 lignes) ne mène à aucun écran métier : la cédule, le pointage et le reste sont annoncés pour une étape ultérieure. Le profil présenté comme le plus important n'a donc pas de navigation.
9. **Pont formulaire inactif.** Le pont HMAC du formulaire vers M1 n'est pas activé par `opsys-console` (réponse 503) ; la page HTML n'est câblée à rien. Le compteur « demandes d'estimation » du digest reste à zéro.
10. **Automatisations non exécutées.** Les crons du digest, de la consolidation, du briefing et de la relance sont des commandes générées dans `automatisations.sh` (`src/opsys/openclaw.py:921-939`) ; aucun script de déploiement ne les lance. Toute formulation « chaque matin » ou « chaque semaine » est non prouvée.
11. **Garde-fou partiel.** Le garde-fou de texte n'est pas appliqué à l'envoi de M1 (`m1_emettre_notification`) ni aux devis, factures ou briefings.
12. **Accès aux positions.** `m4_lire_position_gps` est ouvert à tout appareil `admin`, avec journalisation. L'employé n'a aucun outil d'accès à ses propres positions (`ROLES.md:647`).
13. **Clés de chiffrement.** Les clés sont stockées dans la même base que les données, sans clé maîtresse ni rotation, et sont incluses dans l'export (`src/opsys/cles_chiffrement.py`).
14. **Licence.** `LICENSE` est Apache-2.0 ; `README.md` indique que l'ADR-0003 (propriétaire) la contredit ; l'ADR-0003 est « Accepted ». Tant que ce point n'est pas tranché, aucune promesse de licence.
15. **Canaux amont.** `core/` contient les extensions Telegram, Slack, WhatsApp, Teams, iMessage, Signal, Google Chat ; OPSYS n'en raccorde aucune (`CANAUX` = SMS).
16. **Déclencheurs CI.** `core.yml`, `e2e-core.yml` et `installateur.yml` sont des workflows réutilisables (`workflow_call`) et peuvent être lancés à la main. `ci.yml` les appelle selon une sélection par diff : la couverture CI d'un commit donné dépend de ce qui a changé. Le statut des runs du commit audité n'a pas été lu.
17. **Consignes d'agent dans le dépôt.** `SOUL.md`, skills et `AGENTS.md` donnent des ordres aux agents. Ils ne lient ni le site ni cet audit.
18. **Hooks versionnés.** `.claude/settings.json` exécute des commandes au démarrage de session, à chaque message de l'utilisateur et avant chaque appel Bash. À examiner avant toute ouverture du dépôt avec un outil d'agent.

---

## 7. Zones non examinées et lacunes de preuve

**Non examiné, ou examiné seulement par extraits :**
- `core/` (36 446 fichiers) : non audité. Seuls les points d'intégration avec OPSYS ont été relevés (506 fichiers mentionnent OPSYS). Non vérifiés : wrapper d'admission, planificateur cron, porte d'appareil, bac à sable, moteur de contexte TypeScript.
- `docs/` : `research/` (4 783 fichiers, dont 1 356 archives `.gz` dans `R20-2026-10-01`), `reprise/` (237), `grs/` (92), `programme/` (36). Seuls l'index `docs/README.md`, les documents produit cités et quelques ADR ont été lus.
- Tests : la plupart des tests de département n'ont été ouverts que par leur nom ; les tests racine (environ 250) ont été échantillonnés ; les 238 tests Jest ont été classés par nature (faux `fetch`, dépôt mémoire, fixture JSON) sans lecture individuelle. Aucun test n'a été exécuté.
- Mobile : 179 fichiers non examinés (écrans M1 à M10 vus par nom, `i18n`, `materials.tsx`, une partie des photos et fichiers).
- Plateforme : `openclaw.py` par extraits (1 198 lignes) ; `fusion_*.py` et `ocr_*.py` rattachés à M3 et M5 mais non lus en entier ; 23 migrations classées par leur docstring.
- Déploiement : `install/install.sh` (908 lignes), `deploy/Dockerfile`, `entrypoint.sh`, `readiness*.py`, `permissions.py` non lus. Aucune installation réelle n'a été testée.
- `AGENTS.md`, `CLAUDE.md`, `CODEOWNERS`, `outils/fork/elaguer_core.py`, `scripts/ci/*` : non lus.

**Preuves non obtenues :**
- Statut des runs CI du commit (API GitHub limitée à 403, `gh` non authentifié).
- Tests exécutés, en local ou en CI.
- Comportement réel de Twilio, des fournisseurs de transcription, de LiteLLM, des modèles cloud ou locaux.
- PostgreSQL en conditions réelles (la plupart des tests PostgreSQL sont ignorés sans Docker).
- Application mobile sur téléphone : caméra, WebView, pont SQLite d'Expo, comportement hors ligne réel.
- Restauration complète d'une sauvegarde (rapportée par les auteurs : restauration Docker non exécutée).
- Performance, volumes, sécurité (aucun audit de sécurité ni scan mené).

**Hors de portée juridique et commerciale :**
- Validité des politiques Loi 25, CASL et fiscalité : les documents sont des propositions, « A_VALIDER CPA ».
- Aucun témoignage client, aucune donnée réelle d'exploitation, aucun chiffre de performance mesuré en usage réel.
- Licence : contradictoire, non tranchée.

---

## 8. Décisions à prendre avant publication (proposition)

1. Trancher la licence (Apache-2.0 ou propriétaire) avant toute mention.
2. Décider si « mode souverain » existe comme offre. Si oui, définir le périmètre, désactiver par défaut les fournisseurs cloud, et instrumenter la preuve « aucun flux métier vers un fournisseur ». Sinon, retirer la promesse.
3. Corriger la navigation de l'accueil employé, ou présenter le profil employé comme « en pilote » sur la page.
4. Confirmer que le statut `envoye` reste un statut interne, comme le retient ce rapport, et ne jamais le présenter comme un envoi au client.
5. Réviser `DEFINITION-PRODUIT.md` §11 et le README (chiffres de tests et d'outils) avant toute citation.
