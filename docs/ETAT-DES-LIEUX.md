# Où nous en sommes : 30 octobre 2026 (soir)

Document écrit pour le fondateur : français simple, rien d'inventé. Chaque ligne dit ce qui est fait, ce qui est vérifié et ce qui ne l'est pas.

## En une phrase

Le site, le modèle à crédits, le RAG, le panneau « Mes outils » et l'agent de code (fork d'OpenCode) sont **construits et testés en développement**. **Rien n'est ouvert à la vente**. La suite : un serveur Proxmox, pour tout mettre dans son vrai environnement.

## Ce qui tourne aujourd'hui, et où

| Machine | Ce qui y tourne | Note |
|---|---|---|
| **pc6** | Site de démo (version `3d276a0`), worker, base PostgreSQL, Directus de développement, LiteLLM de développement, SearXNG, Mailpit (faux courriel), stripe-mock (faux paiement) | Le lien public `https://gx10-e526.tail0c55ff.ts.net:10000` sert exactement cette version (vérifié le 30/10 depuis pc1). |
| **pc1** | WorkStudio de test (pile `nexora-x86`) et le LiteLLM qui donne accès aux modèles cloud | Connexion unique avec le site vérifiée le 29/10. |
| **pc4** | GitLab privé : `root/nexora-web` (site), `root/nexora-workstudio`, `root/nexora-code-agent` | Chaque projet n'a que la branche `main`, aucune demande de fusion ouverte. |

Sur pc6 tournent aussi des projets d'autres entreprises (`infratechca-*`, `jeuxvideoca-*`) : ils ne sont pas à Nexora, on n'y touche pas.

## Où en est chaque produit (état réel)

| Produit | État | Ce qui manque |
|---|---|---|
| Crédits, abonnement, recharge, espace disque | Construit et testé. Offres en **brouillon** (rien de publié). | Tes prix, la politique d'expiration, le taux de change. Le paiement réel (Stripe). |
| WorkStudio | Relié au site par connexion unique, chat vérifié via la passerelle. | Un crédit à acheter : impossible tant que les paiements sont en test. |
| Panneau « Mes outils » | Construit : solde, espace, cartes avec l'état réel de chaque produit. | Rien de bloquant. |
| RAG managé | Construit et testé, **éteint**. | Ta clé DeepInfra et la mise en service des modèles d'embedding : aucun vrai modèle n'a été appelé. |
| Nexora Code (agent unique, téléchargeable **et** hébergé) | Fork d'OpenCode rebrandé, connexion par ton compte, plugins Claude Code et Codex ; côté site : code d'appareil et environnement hébergé. **Éteint**. | Le binaire à télécharger, l'image `nexora/code-workspace` et le DNS/TLS joker ne sont pas construits. |
| WebPilot, Privacy Router | Construits, intégrés. | La recherche web dépend de SearXNG ; WebPilot navigateur non déployé. |
| VPS | Module du site prêt. | Le serveur Proxmox. |
| Nexora Bot | **Non construit** (carte « Bientôt »). | Ta décision de le construire. |
| Nexora Creative | **Non construit** (carte « Plus tard »). | Un brief de démarrage est prêt : `docs/superpowers/briefs/nexora-creative-demarrage.md`. |

## Les modèles

33 modèles du catalogue DeepInfra, **tous « En aperçu »** : visibles avec leur prix, mais l'appel par API n'est pas ouvert. Pour cette raison `/v1/models` ne liste rien. Trois anciens modèles de démonstration sont retirés. Seul `nexora/essai-dev` est appelable (caché), et c'est lui qui fait marcher le chat de démo : à retirer avant la vraie mise en service.

## Le site : ce qu'il fait et ce qu'il devrait faire

Il ne vend pas encore (aucune porte vers l'inscription, aucun prix, rien de « disponible »). La direction proposée est dans `docs/direction-du-site.md` : **deux portes, une promesse**. Elle attend ta réponse.

**Aucune des 210 affirmations du site n'est approuvée** (192 en revue, 18 brouillons) : c'est le plus gros frein à la publication du contenu réécrit.

## Vérifications (dernière exécution complète : après la fusion du 30/10)

Lint : 0 erreur. Typecheck : vert. Tests : web 2 493, cms 1 640, worker 211, base de données 106, code 17, RAG 69, déploiement 38 sur 38. Depuis, seuls des documents ont changé.

**Non vérifié** : aucun vrai modèle appelé pour le RAG ; aucun conteneur de Nexora Code lancé ; le visuel de `/compte` et `/tarifs` n'a pas été comparé image par image ; le mobile et l'anglais n'ont pas été relus par l'audit ; Lighthouse non relancé.

## Ce qui attend le fondateur, dans l'ordre utile

1. **Répondre à la direction du site** (`docs/direction-du-site.md`) : deux portes, puis les six corrections sans approbation.
2. **Le serveur Proxmox** : domaine, matériel, lieu. Les cinq décisions à prendre sont en tête de `docs/proxmox-mise-en-service.md`.
3. **La clé DeepInfra** dans le Coffre, puis « passer en service » les modèles.
4. **Approuver les affirmations**, par paquets (un document de décision groupé reste à produire).
5. **Valider les prix** : paliers Pro et Équipe, Go supplémentaire, facteur du crédit, expiration, taux de change.
6. **Comptes externes** : Stripe, courriel réel (SMTP).
7. **Décider** : construire Nexora Bot et Nexora Creative ? Licence Directus (25 collections maximum) ? Pages juridiques à rédiger avec l'avocat ? Sauvegarde de pc4 ?

## Ce qui a été fait le 30/10

- Modèle à crédits, RAG, Nexora Code (fork + site), panneau, polissage visuel et contenu : fusionnés et poussés (voir `docs/superpowers/plans/ledger.md`).
- Décision du fondateur : **un seul agent de code**, téléchargeable et hébergé (spec § 11).
- Nettoyage : anciennes bases de test `app_s7`, `app_s9`, `app_securite` sauvegardées dans `~/Archives-Nexora/bases/` puis retirées ; restes des essais du fork mis de côté dans `~/Archives-Nexora/fork-essais-2026-10-30/` ; processus de test fou arrêté ; branches et arbres de travail fusionnés supprimés.
- Laissés tels quels : 245 volumes Docker orphelins sur pc6 (13 Go récupérables, propriétaire non prouvé) ; pc1 (453 images, surtout d'autres travaux) ; les dossiers de l'application de bureau de Codex.

## Pièges connus

- **Avant la production** : un mot de passe de base de données est écrit en clair dans une unité de démo (`~/.config/systemd/user/nexorasite-demo.service.d/base.conf`) ; ne pas reproduire cette pratique. Le site et le worker n'ont **aucun Dockerfile** ; les images de pc6 sont arm64 alors que Proxmox exige du x86-64.
- **Tests** : lancer `npx vitest run --maxWorkers=3` par paquet, jamais `bun run check` en parallèle (le Postgres de développement tombe).
- **Démo** : se met à jour uniquement par `~/.local/state/nexorasite-demo/mettre-a-jour.sh` après fusion dans `main`.
- **Connexion locale** : le navigateur sur `127.0.0.1` est refusé par la protection d'origine du site (message trompeur « courriel non confirmé ») ; tester par l'adresse publique.
- **GitLab depuis pc6** : par le mandataire SOCKS `127.0.0.1:1055` (déjà configuré dans les dépôts).
