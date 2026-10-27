# Parcours de bout en bout regroupés (S9)

Généré par `bun run e2e` le 2026-10-27T11:00:34.215Z. Base du site de l'essai : `app_s9` (serveur PostgreSQL partagé de développement, port 15440). Site de production lancé par la commande sur le port 3790.

**Résultat : 7 réussi(s), 0 échec(s), 1 sauté(s).**

| Parcours | Jalon | Résultat | Durée | Détail |
|---|---|---|---|---|
| Inscription, vérification par courriel, achat de crédits, webhook signé, rejeu sans double effet, remboursement, 20 réservations concurrentes | S4 | RÉUSSI | 2 s | 9 test(s) réussi(s), 0 échec(s), 0 sauté(s) |
| Catalogue publié, crédits, clé nxk_, appels réels non diffusé et diffusé, débit exact, révocation (401) | S5 | RÉUSSI | 1.6 s | terminé, code 0 ((extrait du flux : "Bonjour ! 😊")) |
| Commande VPS, Checkout, webhook, vrai worker, simulateur Proxmox, actif, arrêt/démarrage, réinstallation, suspension, résiliation, suppression | S6 | RÉUSSI | 2.9 s | 11 test(s) réussi(s), 0 échec(s), 0 sauté(s) |
| Brouillon -> aperçu signé -> approbation sur le hash exact -> publication -> revalidation -> page publique exacte | S2 | RÉUSSI | 8.4 s | terminé, code 0 (## Bilan : 25/25 vérifications passées) |
| Formulaire de contact (ALTCHA réel), ligne en base, tâche, échec d'envoi repris, un seul courriel, abus refusés | S3 | RÉUSSI | 54.4 s | terminé, code 0 (17 vérification(s) réussie(s), 0 échec(s)) |
| Gardes d'accès (401/403 sans identification sur toutes les routes), en-têtes de sécurité, aucune requête hors origine dans un navigateur réel | S9 | RÉUSSI | 12 s | gardes : terminé, code 0 (TOUT EST VERT) ; flux : terminé, code 0 (TOUT EST VERT : aucune requête hors origine, aucune violation de CSP.) |
| Agent WorkStudio publié, découverte, clé du client, appels agent/<slug> non diffusé et diffusé, débit, 402, révocation, retrait | S7 | SAUTÉ | 0 s | prérequis manquant : WORKSTUDIO_KEY_FILE (clé d'espace WorkStudio autorisant « Agents publiés ») non défini ou absent |
| Agents du site : brouillon + approbation (rien de publié), injection ignorée, source interne refusée, budget, arrêt | S8 | RÉUSSI | 1.5 s | 11 test(s) réussi(s), 0 échec(s), 0 sauté(s) |

## Lecture et limites

- Les parcours « inscription, crédits », « commande VPS » et « agents du site » sont des tests Vitest : ils créent **leurs propres bases jetables** (`nexora_test_xxxx`, supprimées ensuite) sur le serveur PostgreSQL de `DATABASE_URL`. Les parcours « clé et modèle », « contact » et « gardes et flux » passent par le **site de production lancé par la commande**, branché sur la base `app_s9`.
- « Publication » exige que la garde de Directus puisse revalider un site : elle appelle `NEXORA_APP_INTERNAL_URL` (réglé sur `http://localhost:3500` dans le Directus de développement, port de l'orchestrateur). Le parcours cible donc ce site (`E2E_PUBLICATION_BASE_URL`) et crée puis supprime une page jetable dans Directus ; il est sauté si ce site ne répond pas.
- « Agent hébergé » est sauté sans `WORKSTUDIO_KEY_FILE` (clé d'espace WorkStudio autorisant « Agents publiés », jamais dans le dépôt) : l'instance WorkStudio de test peut répondre, mais sans cette clé le parcours ne peut pas s'authentifier. Un saut n'est jamais compté comme une réussite ; `E2E_STRICT=1` le transforme en échec.
- Le brouillon d'un agent du site (S8) est couvert par `worker/src/agents/runner.test.ts` (brouillon seulement, injection ignorée, source interne refusée, budget, arrêt) ; la chaîne approbation, publication et revalidation par « Publication ».
- Le site de la commande tourne en mode `production` : le LiteLLM de développement (127.0.0.1) y est autorisé explicitement par `NEXORA_OUTBOUND_ALLOW=127.0.0.0/8`, comme le ferait un opérateur.
