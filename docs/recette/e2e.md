# Parcours de bout en bout regroupés (S9)

Généré par `bun run e2e` le 2026-10-27T10:48:07.880Z. Base du site de l'essai : `app_s9` (serveur PostgreSQL partagé de développement, port 15440). Site de production lancé par la commande sur le port 3790.

**Résultat : 7 réussi(s), 0 échec(s), 1 sauté(s).**

| Parcours | Jalon | Résultat | Durée | Détail |
|---|---|---|---|---|
| Inscription, vérification par courriel, achat de crédits, webhook signé, rejeu sans double effet, remboursement, 20 réservations concurrentes | S4 | RÉUSSI | 2.5 s | 9 test(s) réussi(s), 0 échec(s), 0 sauté(s) |
| Catalogue publié, crédits, clé nxk_, appels réels non diffusé et diffusé, débit exact, révocation (401) | S5 | RÉUSSI | 1.9 s | terminé, code 0 ((extrait du flux : "Bonjour à toi, ami !")) |
| Commande VPS, Checkout, webhook, vrai worker, simulateur Proxmox, actif, arrêt/démarrage, réinstallation, suspension, résiliation, suppression | S6 | RÉUSSI | 2.9 s | 11 test(s) réussi(s), 0 échec(s), 0 sauté(s) |
| Brouillon -> aperçu signé -> approbation sur le hash exact -> publication -> revalidation -> page publique exacte | S2 | RÉUSSI | 8.3 s | terminé, code 0 (## Bilan : 25/25 vérifications passées) |
| Formulaire de contact (ALTCHA réel), ligne en base, tâche, échec d'envoi repris, un seul courriel, abus refusés | S3 | RÉUSSI | 54 s | terminé, code 0 (17 vérification(s) réussie(s), 0 échec(s)) |
| Gardes d'accès (401/403 sans identification sur toutes les routes), en-têtes de sécurité, aucune requête hors origine dans un navigateur réel | S9 | RÉUSSI | 11.9 s | gardes : terminé, code 0 (TOUT EST VERT) ; flux : terminé, code 0 (TOUT EST VERT : aucune requête hors origine, aucune violation de CSP.) |
| Agent WorkStudio publié, découverte, clé du client, appels agent/<slug> non diffusé et diffusé, débit, 402, révocation, retrait | S7 | SAUTÉ | 0 s | prérequis manquant : WORKSTUDIO_KEY_FILE (clé d'espace WorkStudio autorisant « Agents publiés ») non défini ou absent |
| Agents du site : brouillon + approbation (rien de publié), injection ignorée, source interne refusée, budget, arrêt | S8 | RÉUSSI | 1.5 s | 11 test(s) réussi(s), 0 échec(s), 0 sauté(s) |
