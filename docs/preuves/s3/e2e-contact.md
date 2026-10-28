# Preuve du formulaire de contact — S3

Commande : `BASE_URL=http://localhost:3500 bun web/scripts/e2e-contact.ts` (site `next start` sur :3500, base `app` de développement, worker lancé et arrêté par le script avec son PID, Mailpit sur 127.0.0.1:8026). Navigateur réel (Chromium de Playwright) : la preuve de travail ALTCHA est vraiment calculée dans la page. Le script supprime ses lignes, ses tâches et ses courriels à la fin.

Parcours : soumission -> ligne dans `leads` + tâche `contact.notify` -> worker avec un SMTP injoignable (échec : demande conservée, erreur notée, tâche reprise) -> worker avec Mailpit : UN courriel, `notified_at` renseigné -> renvoi identique : « déjà enregistrée », toujours une ligne, une tâche, un courriel -> sans preuve : 403 -> champ piège : rien d'enregistré.

```
OK    consentement marketing décoché par défaut
OK    page de confirmation honnête — DEMANDE ENREGISTRÉE. Votre demande est enregistrée et l'équipe de Nexora en est avertie. Nous vous écrirons à l'adresse 
OK    une seule ligne dans leads
OK    contenu enregistré
OK    tâche contact.notify en file, sans renseignement personnel
OK    échec d'envoi : la tâche note l'erreur et sera reprise — essai 1, état pending
OK    échec d'envoi : la demande reste conservée, non notifiée
OK    échec d'envoi : aucun courriel
OK    courriel visible dans Mailpit — Nouvelle demande : Essai S3 mvq5j1y5 (diagnostic pour cerner le besoin)
OK    courriel : contenu et adresse de réponse
OK    notified_at renseigné après l'envoi
OK    un seul courriel malgré la reprise
OK    renvoi identique : « déjà enregistrée »
OK    renvoi identique : toujours une ligne
OK    renvoi identique : toujours une tâche
OK    sans preuve Altcha : 403
OK    champ piège rempli : rien d'enregistré

17 vérification(s) réussie(s), 0 échec(s)
```

Tests unitaires et d'intégration (base jetable) : `web/src/server/contact/*.test.ts` (validation, empreinte, déduplication 24 h et envois simultanés, Altcha : rejeu, falsification, expiration, limitation de débit, champ piège, panne de la base, secret absent) et `worker/src/contact-notify.test.ts` (envoi, idempotence, échec puis reprise par le vrai worker, injection d'en-têtes).
