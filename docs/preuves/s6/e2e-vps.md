# Preuve de bout en bout — VPS (S6)

Généré par `WRITE_CAPTURE=1 bun run --cwd web vitest run src/server/vps/e2e.test.ts` le 2026-10-27.
Simulateur Proxmox (dérivé de l'apidoc officiel), stripe-mock, Mailpit, webhooks signés, vrai worker, horloge simulée pour les délais. Aucun paiement réel, aucun vrai serveur Proxmox.

1. Serveur simulé branché et testé : Proxmox VE 9.0.3, nœud pve1, 1/1 gabarit(s) prêt(s) (jeton lu du Coffre, jamais dans la fiche).
2. Version de catalogue vps_d03caad4276906e1 publiée (garde : prix présents, licence MIT, somme SHA-256 du script) puis envoyée vers Stripe (prix mensuel et annuel, hors taxes).
3. Client de test inscrit, courriel vérifié (Mailpit), connecté ; une organisation créée.
4. Checkout (mode abonnement, Stripe Tax, adresse requise) créé chez stripe-mock pour la commande fa9fc63f ; formulaire renvoyé = même commande.
5. Webhook signé → tâche unique → worker : VM 10000 clonée, cloud-init (clé SSH du client, IP 10.20.0.10), pare-feu (SSH seulement, port 25 sortant fermé), démarrée, application installée (script vérifié) → ACTIVE. Rejeu du même événement : « duplicate ».
6. Arrêt propre puis démarrage : VM `stopped` puis `running` côté Proxmox, état de l'instance suivi.
7. Réinstallation : instantané « avant-reinstall-202610270518 » pris sur l'ancienne VM 10000 (arrêtée, retirée du réseau, gardée 7 jours) ; nouvelle VM 10001, même IP, application réinstallée.
8. `invoice.payment_failed` → past_due avec délai de grâce de 7 jours (machine à états S4) ; service intact pendant la grâce ; grâce écoulée (horloge simulée) → balayage → VM arrêtée, instance SUSPENDUE, données gardées.
9. `invoice.paid` → abonnement actif → tâche de reprise → VM redémarrée, instance ACTIVE.
10. Résiliation confirmée → Stripe (cancel_at_period_end) → `customer.subscription.deleted` → VM arrêtée, rétention jusqu'au 2026-11-11 (7 jours) → rien supprimé avant l'échéance → après : VM supprimée, ancienne VM de la réinstallation supprimée, instance `deleted`.
11. Journal (20 événements) sans secret ; 10 tâches, aucune « dead » ; 2 clonages au total (livraison + réinstallation), jamais de doublon.
