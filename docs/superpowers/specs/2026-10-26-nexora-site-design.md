# Nexora — nouveau site (conception)

**Date :** 26 octobre 2026 · **Dossier :** `/home/pc6/Desktop/NexoraSite` · **Statut :** conception à valider par le fondateur (la construction locale démarre en parallèle, réversible).

**Sources :** demande du fondateur du 26/10 ; prompt maître `~/Desktop/NexoraWeb/PROMPT_MAITRE_SITE_NEXORA_DIRECTUS.md` (positionnement, ton, règles de vérité, OPSYS-AI, souveraineté) et ses décisions ; recherches `docs/recherche/00` à `06` (audit visuel de Mistral, SEO on-page, SEO off-page et agents, Directus, VPS et paiements, passerelle de modèles, marketing et souveraineté).

## 1. Intention

Un site **porte-étendard technologique** pour Nexora, entreprise québécoise d'IA souveraine. Il marie trois références :

- **Mistral AI** pour la qualité visuelle et éditoriale : sobriété, grands titres, contraste, ton à la fois technique, marketing et accessible.
- **Hostinger** pour la vente de serveurs privés virtuels (VPS) : offres claires, configurateur, paiement, tableau de bord client.
- **OpenRouter** pour l'accès aux modèles : catalogue, prix par million de jetons, clés API clientes, crédits.

Il vend aussi les **services** de Nexora (installation de serveurs IA et configuration de systèmes qui automatisent le travail, sur place ou hébergés au Québec), **Nexora WorkStudio** et des **agents hébergés**. Il est **administré entièrement depuis Directus** et **en partie géré par des agents IA**, sous validation humaine.

**Message directeur** (prompt maître) : « L'IA qui travaille pour votre entreprise. Sous votre contrôle. »

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
1. Un dirigeant non technicien comprend en moins d'une minute ce que fait Nexora, où vont ses données et comment commencer.
2. Un développeur crée un compte, achète des crédits, obtient une clé API et appelle un modèle, comme sur OpenRouter.
3. Un client commande un VPS au Québec avec une application prête (Hermes Agent, OpenClaw, Ollama + Open WebUI, etc.), le paie et le pilote depuis son espace.
4. L'administrateur configure tout depuis Directus : contenus, offres VPS, plans d'abonnement, serveurs Proxmox, fournisseurs et modèles, prix et marges, moyens de paiement, clés de fournisseurs (dont OpenRouter), agents IA et leurs budgets.
5. Des agents IA rédigent, traduisent, optimisent (SEO on-page) et préparent l'off-page ; un humain approuve chaque publication.
6. Qualité Mistral : Lighthouse mobile ≥ 95 sur les pages clés, WCAG 2.2 AA, LCP ≤ 2,5 s, CLS ≤ 0,1.

**Non-objectifs (pour cette version)**
- Pas de facturation multi-devises : CAD seulement.
- Pas de reconstruction de WorkStudio, d'OPSYS-AI ou d'un IAM complet : les produits gardent leurs propres services ; le site les présente et y donne accès.
- Pas de console Proxmox exposée aux clients.

**Anti-objectifs (échec même si « ça marche »)**
- Faux clients, témoignages, chiffres de traction, certifications, prix inventés ou « conforme à la Loi 25 » (règles du prompt maître et du rapport 06 §11.4).
- Un agent qui publie, envoie un message commercial, achète un lien ou modifie un prix sans approbation humaine.
- Une clé secrète lisible dans Directus, dans le navigateur, dans le dépôt ou dans un journal.
- Un paiement réel encaissé avant l'accord explicite du fondateur (mode test Stripe par défaut).
- Une copie de Mistral (police, pixel art, textes, logo).

## 3. Contraintes

- **Langue :** français québécois d'abord (fr-CA), anglais canadien ensuite (en-CA), adaptations relues, hreflang réciproque. Lexique OQLF (rapport 06 §11).
- **Souveraineté :** les promesses sont démontrables mode par mode (sur place / hébergé au Québec). Le site distingue modèles hébergés au Québec et modèles infonuagiques externes (OpenRouter) avec un **badge de résidence des données** par modèle ; jamais de bascule silencieuse vers un modèle externe.
- **Licences :**
  - Directus 12 est sous MSCL-1.0-GPL. L'auto-hébergement complet est gratuit sous l'**Open Innovation Grant** (moins de 5 M$ de revenus et moins de 50 employés, vérifié sur directus.com/pricing le 26/10). Sans subvention, le palier Core (gratuit en auto-hébergement, payant en infonuagique) est limité à 3 sièges, 25 collections et 5 flows. **Action du fondateur :** demander la clé sur https://directus.com/oig. Plan B : palier Team (499 $ à 588 $ US/mois selon la page). Le modèle de données reste sobre (D5).
  - Pas de revente de n8n, Open WebUI au-delà de 50 utilisateurs, ni Dify sans accord : ces applications sont proposées « installées sur votre VPS, sous votre licence », pas revendues. Flowise est écarté (fin de vie).
  - AGPL (Proxmox, Lago, Postiz) : utilisés sans modification, ou isolés.
- **Sécurité de la chaîne d'approvisionnement :** LiteLLM 1.107.0 (21/10/2026) était piégé. Toute image est épinglée par **empreinte** (jamais `latest`) ; LiteLLM tourne isolé, sans accès aux autres secrets.
- **Machine :** pc6 (aarch64, 20 cœurs, disque à 95 %) : nettoyer les caches après chaque build.
- **Ports de développement :** site 3500, Directus 8456, passerelle 4400, PostgreSQL 15440.

## 4. Architecture

```
                  Visiteurs / clients / développeurs
                                 |
                    Next.js 16 (web, App Router)
     pages publiques (ISR) · espace client · API serveur · webhooks
        |              |                 |                   |
   Directus 12      Base « app »       Passerelle         Stripe (test)
 (contenu + config) (PostgreSQL)    LiteLLM épinglé      Billing + Tax
        |              |          (clés virtuelles,          |
        |              |           budgets, dépenses)   webhooks signés
        |              |                 |
        |        Worker (jobs)     modèles Québec (Ollama / vLLM)
        |   provisionnement VPS    + infonuagique (OpenRouter…)
        |   agents IA du site            |
        +------> Proxmox VE (serveurs Nexora au Québec, branchés depuis l'admin)
```

| Composant | Technologie | Rôle |
|---|---|---|
| `web/` | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Motion | Site public, espace client (compte, abonnements, clés, VPS, usage), routes serveur, webhooks Stripe, revalidation |
| `cms/` | Directus 12.5.1 (empreinte épinglée), schéma versionné (snapshot) | Panneau d'administration : contenus, catalogues, configuration, file d'approbation, prompts et budgets des agents |
| `db` | PostgreSQL 17 (+ pgvector) | Deux bases : `directus` et `app` |
| `app` (base) | Drizzle ORM | Comptes, organisations, sessions, clés clientes (empreintes seulement), grand livre de crédits, abonnements (miroir Stripe), commandes, services VPS, tâches, journaux. **Les données clients ne sont pas dans Directus** ; l'admin les consulte par des vues en lecture seule |
| `gateway` | LiteLLM proxy, version vérifiée épinglée par empreinte | Accès OpenAI-compatible aux modèles, clés virtuelles par client et par agent, budgets, dépenses. Remplaçable (contrat OpenAI) par Nexora API |
| `worker` | Node.js (TypeScript), file de tâches dans PostgreSQL | Provisionnement VPS (API Proxmox, cloud-init, installation d'applications), agents IA du site (rédaction, traduction, SEO, audits, indexation), synchronisations |
| Auth clients | Better Auth (MIT) dans Next.js | Courriel + mot de passe, vérification, 2FA plus tard ; distinct des comptes Directus |
| Analytique | Umami (MIT), sans témoins | Mesure respectueuse de la Loi 25 |

**Clés secrètes saisies dans l'admin** (le fondateur veut coller une clé OpenRouter dans le panneau) : voir la décision D2 (§17). Le module « Coffre » de Directus est un simple formulaire. Il envoie la clé **directement** au service coffre de l'app, sans l'écrire dans une collection, l'activité, les révisions ou les journaux de Directus. Directus ne reçoit en retour que la référence, les 4 derniers caractères et l'état. Une clé n'est jamais relisible, seulement remplaçable ou révocable.

## 5. Identité visuelle

La première version de cette section (palette sable et encre forêt, logo à trois barres) est abandonnée. L'identité en vigueur, la refonte « Instrument » du 27/10/2026 (palette, contrastes, logo « N » en pixels, typographies Geist, Inter et JetBrains Mono, composants), est décrite dans `docs/marque/charte.md` ; les principes retenus de l'étude de mistral.ai sont dans `docs/marque/refonte-mistral.md` et l'audit de départ dans `docs/recherche/00-audit-visuel-mistral.md`. Les contraintes de la conception restent : une seule teinte d'accent, aucun cerveau lumineux ni robot décoratif, composition mobile propre (pas une réduction), animations discrètes désactivées avec `prefers-reduced-motion`, contrastes WCAG 2.2 AA calculés (`bun run --cwd web check:contrast`).

## 6. Arborescence (fr-CA, puis `/en/…`)

Base : rapport 06 §9 et prompt maître §5, avec les ajouts commerciaux demandés.

| Route | Rôle |
|---|---|
| `/` | Accueil : promesse, entrée par problème, deux modes de déploiement, produits, OPSYS-AI, méthode, confiance, FAQ, CTA |
| `/souverainete/` (+ `/loi-25/`) | Pilier de confiance : quatre couches (données, modèles, calcul, exploitation), schémas de flux, ce que Nexora affirme et prouve |
| `/solutions/` (+ courriels, factures, service-client, rendez-vous, comptabilite, documents) | Cas d'usage : problème → ce que fait le système → ce que reçoit l'équipe → bénéfice → ce qui reste sous contrôle |
| `/services/` (+ `/installation-serveurs-ia/`, `/automatisation-sur-mesure/`) | Services de Nexora : diagnostic, installation de serveurs IA chez le client ou au Québec, configuration et exploitation |
| `/deploiement/` (+ `/sur-place/`, `/heberge-quebec/`) | Comparaison des modes, qui contrôle quoi |
| `/vps/` | Offres VPS façon Hostinger : grille de plans, configurateur (plan, application, durée), lieu au Québec, FAQ ; commande |
| `/vps/[application]/` | Pages d'atterrissage SEO par application (Hermes Agent, OpenClaw, Ollama + Open WebUI, LibreChat, n8n installé par le client) |
| `/modeles/` et `/modeles/[fournisseur]/[modele]/` | Catalogue façon OpenRouter : filtres, prix par million de jetons, contexte, capacités, **résidence des données**, fiche modèle, exemple d'appel |
| `/api/` (page) et `/docs/` | Passerelle : démarrage rapide, clés, crédits, limites, compatibilité OpenAI |
| `/agents/` | Agents hébergés : catalogue, appel par API avec la clé du client, garde-fous |
| `/workstudio/` | Nexora WorkStudio : studio d'agents et de flux de travaux, démonstration intégrée (widget `/embed.js`) |
| `/suite/` (+ code, corpus, modeles-quanta-helix) | Suite logicielle (statuts honnêtes, prompt maître §6) |
| `/opsys-ai/` | Page phare construction (prompt maître §7), statuts par département |
| `/tarifs/` | Abonnements et offres (depuis Directus), taxes et renouvellements affichés |
| `/methode/`, `/entreprise/`, `/contact/`, `/centre-de-confiance/`, `/faq/` | Méthode, identité, diagnostic, preuves, objections |
| `/ressources/` (guides, blogue) | Contenu SEO de fond, rédigé par agents et approuvé |
| `/compte/…` | Espace client : tableau de bord, abonnements et factures, crédits et usage, clés API, VPS (état, démarrer, arrêter, réinstaller), agents |
| légal | Mentions légales, confidentialité, conditions, politique d'utilisation acceptable |

Navigation principale : **IA souveraine · Solutions · Produits** (menu : VPS, Modèles et API, Agents, WorkStudio, Suite, OPSYS-AI) **· Tarifs · Ressources**. À droite : « Connexion » (lien) et « Planifier un diagnostic » (bouton).

## 7. Contenu : méthode d'équipe marketing

1. **Personas et proposition de valeur** (rapport 06 §8) : Nathalie (direction administrative), Marc (responsable TI), Julie (cabinet ou clinique), Samuel (développeur ou agence, cible VPS, API et modèles).
2. **Message par page :** objectif, mot-clé principal, messages clés, preuve, objection traitée, CTA (rapport 06 §10).
3. **Écriture :** problème → système → ce que l'équipe reçoit → bénéfice → contrôle. Le jargon arrive au second niveau de lecture, toujours défini.
4. **Charte de ton et lexique** (rapport 06 §11) : titres de 3 à 7 mots ponctués d'un point, vouvoiement, typographie française.
5. **Relecture en trois passes :**
   - **vérité :** registre des affirmations, rien d'inventé ;
   - **clarté :** grand public ;
   - **SEO :** intention, titre, description, maillage.
6. **Prix :** aucun prix n'est inventé. Les offres sont créées en brouillon dans Directus ; le fondateur fixe et publie les prix. Tant qu'une offre n'est pas publiée, la page affiche « Sur demande ».

## 8. Modèle de données Directus (contenu et configuration)

Environ 30 collections, regroupées pour rester sobres :

- **Site :** `site_settings` (singleton), `navigation`, `languages`.
- **Pages et blocs :** `pages`, `pages_blocks` (M2A), blocs typés : héros, texte et média, fonctionnalités, étapes, comparaison, tarifs, FAQ, CTA, formulaire, schéma de flux.
- **Ressources :** `articles`, `authors`, `faqs`, `claims` (registre des affirmations, privé).
- **Catalogue commercial :**
  - `vps_plans` : vCPU, RAM, disque, bande passante, prix mensuel et annuel, identifiants de prix Stripe, statut ;
  - `vps_apps` : application, modèle d'installation, licence, avertissement ;
  - `subscription_plans` : abonnements WorkStudio, API et agents, avec crédits inclus ;
  - `services` : offres de services sur devis.
- **Infrastructure :**
  - `proxmox_servers` : hôte, nœud, région, capacité, pool d'IP, référence de secret, état et dernier contrôle ;
  - `os_templates`.
- **Modèles :**
  - `model_providers` : type, URL, référence de clé, région, politique de données, priorité, état ;
  - `models` : identifiant public, nom, contexte, capacités, résidence, prix amont et prix de vente, marge, visibilité, statut ;
  - `hosted_agents` : agent WorkStudio, prix par exécution, quotas.
- **Paiement :**
  - `payment_methods` : fournisseur, mode test ou production, activé, ordre, référence de secret ;
  - `tax_settings` : TPS, TVQ, TVH, numéros d'inscription.
- **Agents IA du site :**
  - `ai_agents` : mission, route de modèle, budget, activé ;
  - `ai_prompts` ;
  - `approvals` : file de validation (version, diff, état, relecteur) ;
  - `agent_runs`.

Rôles : Administrateur, Éditeur, Relecteur, un rôle API par agent (brouillons seulement, aucune suppression, aucun accès aux secrets ni au catalogue de prix), Publication (flow), Public (publié seulement).

Flux de publication : agent → brouillon (versions de contenu) → `approvals` → relecteur → publication (garde bloquante) → revalidation Next.js → vérification.

## 9. Passerelle de modèles (façon OpenRouter)

- **Configuration :** l'admin ajoute un fournisseur dans Directus (OpenRouter, serveur vLLM ou Ollama de Nexora, etc.) et colle sa clé dans le coffre. Il active des modèles, fixe le prix de vente (ou une marge avec plancher) et indique la résidence (Québec, Canada, États-Unis, Europe).
- **Synchronisation :** le worker pousse ces réglages dans LiteLLM : modèles, crédentials, alias et prix.
- **Côté client :** inscription → achat de crédits (Stripe Checkout, taxes par Stripe Tax) → le webhook crédite le grand livre → création d'une clé (LiteLLM `key/generate` avec budget, modèles et limites ; la valeur est affichée une fois, seule l'empreinte est gardée) → appel `https://<api>/v1/chat/completions` → la dépense LiteLLM est rapprochée du grand livre (idempotence par `request_id`) → tableau d'usage.
- **Catalogue public :** filtres (capacités, résidence, prix), fiches modèles, exemples de code. Les modèles « Québec » sont mis en avant.

## 10. VPS (façon Hostinger)

- **Page :** grille de plans publiés et configurateur (plan → application → durée). Le prix affiché précise le renouvellement et les taxes.
- **Parcours :** commande → Stripe Checkout (abonnement) → webhook → tâche de provisionnement. Le worker choisit un serveur Proxmox prêt dans la région, clone le gabarit, applique cloud-init (clé SSH du client, IP), démarre la machine, installe l'application (script vérifié par application, Coolify en option) puis passe le service à « actif ».
- **Espace client :** état, IP, démarrer, arrêter, redémarrer, réinstaller, résilier. **Cycle :** suspension après échec de paiement et délai de grâce.
- **Isolation :** un VPS par client ; pare-feu par machine ; OpenClaw jamais exposé sans protection.
- **Brancher un serveur :** l'admin crée la fiche Proxmox dans Directus, colle le jeton API dans le coffre et lance « Tester la connexion ». Le serveur passe à « prêt » si le test réussit.
- **Sans serveur Proxmox réel :** un **simulateur Proxmox** (même API, en mémoire) permet de développer et de tester tout le parcours. Le statut réel s'affiche honnêtement dans l'admin.

## 11. Abonnements et paiements

- **Stripe :** Billing, Checkout, Tax et portail client, en **mode test** jusqu'à l'accord du fondateur.
- **Moyens de paiement :** activables depuis l'admin (`payment_methods`) : cartes via Stripe, Apple Pay et Google Pay via Stripe, PayPal en option ; Interac Online est fermé (rapport 04).
- **Plans :** définis dans Directus. L'action « Publier vers Stripe » crée ou met à jour le produit et le prix Stripe, puis écrit leurs identifiants dans la fiche.
- **Factures :** TPS et TVQ calculées par Stripe Tax. Les numéros d'inscription de Nexora sont dans `tax_settings`. Les mentions sont à faire valider par un comptable.

## 12. Agents hébergés

Les agents publiés dans Nexora WorkStudio sont exposés au client par l'API de la passerelle (`/v1/agents/{id}/runs` ou modèle `agent/<nom>` au format OpenAI), avec sa clé et son décompte. Ils sont catalogués dans Directus (`hosted_agents`). La page `/agents/` les présente.

## 13. Autogestion par IA et SEO

**Agents du site :** worker Node, modèles via la passerelle (une clé virtuelle et un budget par agent), sorties en brouillon dans Directus. Aucun agent sur les paiements, les clients ou les prix.

| Agent | Mission | Cadence |
|---|---|---|
| Rédacteur | Brouillons de pages et d'articles à partir d'un brief | À la demande |
| Traducteur | Version en-CA d'un contenu fr-CA approuvé | Sur approbation |
| SEO on-page | Titre, description, slug, JSON-LD, liens internes suggérés | Sur brouillon |
| Audit technique | Lighthouse et Unlighthouse, liens (lychee), accessibilité (axe) ; problèmes ouverts dans Directus | Nuit |
| Indexation | Diff du sitemap → IndexNow et Bing ; Search Console une fois connectée | Après publication |
| Veille SEO | Mots-clés, concurrents, backlinks via DataForSEO (clé dans l'admin) ; briefs proposés | Hebdomadaire |
| Diffusion | Brouillons de publications sociales (Postiz si branché), validation humaine | Selon calendrier |
| Santé des modèles | Disponibilité des fournisseurs et modèles | Horaire |

**SEO technique natif (Next.js 16) :**
- métadonnées par page, canonical et hreflang réciproques ;
- `sitemap.ts` multilingue, `robots.ts` avec une politique par type de robot (recherche, entraînement, action) ;
- JSON-LD via `schema-dts` (Organization, Service, Product pour VPS et modèles avec prix publiés, SoftwareApplication, Article, FAQPage, BreadcrumbList), toujours conforme au visible ;
- images Open Graph dynamiques, `llms.txt` (sans en attendre de miracle) ;
- maillage interne suggéré par embeddings.

**Garde-fous :** aucune publication automatique, aucune production en masse, aucun lien acheté, aucun avis sollicité automatiquement. Chaque adaptateur externe (Search Console, Bing, DataForSEO, Postiz) affiche honnêtement son état : non connecté, connecté en lecture ou autorisé en écriture.

## 14. Qualité et vérification

- **Tests :**
  - unitaires ciblés (grand livre de crédits, calcul des prix, signatures de webhooks, client Proxmox sur simulateur, garde de publication) ;
  - bout en bout avec Playwright (inscription → crédits → clé → appel de modèle ; commande VPS → simulateur → service actif ; brouillon d'agent → approbation → publication → revalidation) ;
  - axe-core et lychee.
- **Revue visuelle** à 390, 768, 1024 et 1440 pixels, comparée à mistral.ai, critique argumentée.
- **Performance :** Lighthouse mobile ≥ 95 sur les pages clés, protocole documenté.
- **Contrôle qualité :**
  - l'orchestrateur relit chaque livraison d'agent : code, tests, rendu et vérité du contenu ;
  - une revue indépendante de bout en bout (sécurité, paiements, isolation des clés) a lieu avant de déclarer la version terminée.

## 15. Jalons (révisés après la relecture du 26/10)

Chaque « Terminé quand » est vérifiable par une commande, un test ou une capture datée.

| Jalon | Contenu | « Terminé quand » |
|---|---|---|
| S1 Socle | Monorepo (`web/`, `cms/`, `worker/`, `deploy/`), compose (PostgreSQL 17 + pgvector, Directus 12.5.1, LiteLLM v1.106.2, Mailpit), toutes les images épinglées par empreinte. Système de design (tokens, polices locales, grille de périmètre). Mise en page fr-CA/en-CA. Schéma Directus par Environment Sync + script de contenu initial idempotent. Service coffre. **Essai de la garde de publication** (voir D4). CI locale (lint, types, tests) | `docker compose up` sain ; accueil squelette en fr et en ; `bun run check` vert ; essai de garde consigné (versions, M2A, contournement) ; une clé collée dans le coffre est introuvable dans l'activité, les révisions et les journaux de Directus (test) |
| S2 Tranche verticale | Accueil complet et page OPSYS-AI branchés à Directus ; matrice de couverture du dépôt `leon36000/OPSYS-AI` et registre des capacités ; chaîne brouillon → prévisualisation → approbation (hash de version) → publication → revalidation | Un brouillon reste invisible ; une approbation devenue périmée bloque la publication ; la page publiée est exacte ; Lighthouse mobile ≥ 95 et axe sans violation sur les deux pages ; captures à 390/768/1024/1440 |
| S3 Vitrine | Souveraineté (+ Loi 25), solutions (6), services, déploiement, méthode, WorkStudio (widget), suite, entreprise, contact (Altcha, stockage unique, Mailpit), centre de confiance, FAQ, légal ; contenus et traductions relues | Toutes les routes de §6 hors commerce rendues depuis Directus en fr et en ; formulaire de contact testé (doublon, abus, échec d'envoi) ; lychee sans lien cassé ; Lighthouse ≥ 95 sur 5 pages clés |
| S4 Comptes et paiements | Better Auth (dernière version épinglée), organisations, Stripe en mode test : Checkout, Billing, Tax, portail ; table des événements traités (idempotence par `event.id`) ; achat de crédits (paiement unique) distinct des abonnements ; remboursements et litiges ; « Publier vers Stripe » depuis l'admin | Avec Stripe CLI : abonnement test et achat de crédits de bout en bout, webhook rejoué sans double effet, remboursement qui débite le grand livre ; facture test avec TPS et TVQ |
| S5 Passerelle de modèles | Couche Nexora de facturation devant LiteLLM (D1) ; fournisseurs et coffre ; synchronisation versionnée Directus → LiteLLM (D3) ; catalogue `/modeles/` et fiches ; clés clientes ; usage ; documentation `/docs/` | Crédits test → clé Nexora → appel réel de `cloud-glm-5-3` (via le LiteLLM de pc1 comme fournisseur amont) → débit exact du grand livre ; 20 appels concurrents ne dépassent pas le solde ; clé révoquée refusée |
| S6 VPS | Offres, configurateur, commande, machine à états de provisionnement idempotente (clé de commande → `vmid`, suivi UPID, compensation), client Proxmox, simulateur dérivé du schéma OpenAPI de Proxmox, espace client VPS, suspension et résiliation (instantané avant réinstallation, rétention 7 jours) | Commande test → VPS simulé actif → arrêt, démarrage, réinstallation → suspension après échec de paiement ; test de contrat contre un vrai Proxmox dès qu'un serveur est branché |
| S7 Agents hébergés | Catalogue des agents WorkStudio publiés (API développeur de WorkStudio, format OpenAI), appel par la passerelle avec la clé du client et son décompte, page `/agents/` | Appel d'un agent WorkStudio publié avec une clé cliente, débit au grand livre |
| S8 Autogestion IA et SEO | Agents du site (D9), SEO technique natif, audits planifiés (Lighthouse CI, Unlighthouse, lychee, axe), indexation (IndexNow, Bing), adaptateurs off-page à état honnête, Umami (base séparée) | Brouillon d'agent → approbation → publication → revalidation ; test d'injection (une consigne malveillante dans une source ne publie rien et n'élargit aucun droit) ; sitemap, hreflang et JSON-LD valides |
| S9 Recette | Bout en bout complet, accessibilité, performance, sécurité, inventaire des flux sortants comparé aux promesses, CMS indisponible (le site sert son cache), sauvegarde et restauration isolées, guide opérateur | Toutes les preuves du §16 du brief consignées ; revue indépendante sans point bloquant ni important ouvert |

**Équipe :**
- l'orchestrateur (conception, contrôle qualité, fusions, **seul propriétaire du schéma Directus**) ;
- jusqu'à 3 agents Sonnet 5.5 en effort élevé, chacun dans son worktree ;
- jusqu'à 3 agents Haiku 5.5 pour les tâches mécaniques ;
- les agents Haiku de recherche ne sont pas plafonnés.

## 16. Ce qui reste au fondateur

1. Demander la clé de l'**Open Innovation Grant** de Directus.
2. Fournir ou confirmer les **identités légales** : raison sociale, NEQ, numéros TPS/TVQ, adresse, mentions légales.
3. Fixer les **prix** des offres et des modèles, puis les publier.
4. Créer le compte **Stripe** et fournir les clés test, puis production (jamais dans le chat : dans le coffre de l'admin).
5. Brancher les **serveurs Proxmox** réels.
6. **Domaine, DNS et adresse HTTPS publique**.
7. **Vérifier le LiteLLM de pc1** (incident 1.107.0).
8. **Validations juridiques et fiscales :** Loi 25, LCAP, Loi sur la protection du consommateur, TPS et TVQ, licences.
9. **Publication** du site.

## 17. Décisions après la relecture constructeur (26/10)

Relecture indépendante (agent Sonnet 5.5) : 4 points bloquants, 11 importants. Décisions de l'orchestrateur, que le fondateur peut renverser :

- **D1 — Facturation des modèles.** Une couche Nexora (dans `web/`, route `/v1/*`) se place devant LiteLLM. Elle authentifie la clé cliente (256 bits aléatoires, empreinte SHA-256, préfixe affiché), **réserve atomiquement** le coût maximal estimé dans le grand livre PostgreSQL (micro-unités CAD entières), appelle LiteLLM sur le réseau interne, puis règle au coût réel (jetons × prix de vente publié). La dépense de LiteLLM n'est qu'un contrôle de dérive. Les coûts amont en USD sont convertis par un taux de change approuvé dans l'admin. Le client ne voit jamais de clé LiteLLM. Le contrat OpenAI garde Nexora API comme remplaçant possible du moteur.
- **D2 — Coffre.** Le service coffre fait partie de l'app. Il chiffre par enveloppe (AES-256-GCM, clé maîtresse en secret Docker, rotation documentée) et pousse les clés de fournisseurs de modèles dans LiteLLM. Le module Directus n'écrit rien dans une collection. Critère de test en S1.
- **D3 — Synchronisation Directus → LiteLLM et Stripe.** Elle ne consomme que des versions publiées. Elle montre un aperçu des différences et écrit en retour l'état « appliqué » et sa date. Le coût amont et le prix de vente restent deux champs distincts. Un prix absent bloque la publication (jamais 0 $). Un plancher de marge bloque aussi. `LITELLM_SALT_KEY` est fixé une fois pour toutes. Chaque commande et chaque ligne du grand livre enregistre la `config_version` utilisée.
- **D4 — Frontière Directus / app.** Directus ne contient que des catalogues et configurations publiés, versionnés et approuvés. Tout ce qui porte un identifiant client ou un montant vit dans la base app. L'admin consulte les opérations par un **module Directus « Opérations »** qui interroge l'API d'administration de l'app (rien n'est stocké dans Directus).
- **D5 — Collections et blocs.** Six types de blocs seulement : héros, section (texte, média, liste), cartes, tarifs, FAQ, CTA. Schéma et configuration par Environment Sync (rôles, politiques, flows), contenu par script idempotent.
- **D6 — Garde de publication.** Un hook filtre `items.promote` refuse toute promotion sans approbation portant sur le hash exact de la version. Le même hook déclenche la revalidation de Next.js. Essai en S1 : écriture directe sur l'élément publié, versionnement des blocs M2A, contournement par l'API.
- **D7 — Paiements.**
  - Achat de crédits : paiement unique. Abonnements : séparés.
  - Remboursement ou litige : débit du grand livre. Un solde négatif bloque l'API.
  - Expiration des crédits : 12 mois par défaut, réglable.
  - TPS et TVQ appliquées aux crédits par prudence, à faire confirmer par un comptable. La TVQ reste déclarée par Nexora (le dépôt simplifié de Stripe ne la couvre pas).
  - Mode test jusqu'à l'accord du fondateur.
- **D8 — VPS.**
  - Machine à états idempotente.
  - Un VPS par client, pare-feu par machine, port 25 sortant fermé par défaut, limites d'abus.
  - Applications installées par le worker : seulement des projets à licence permissive vérifiée (Hermes Agent, OpenClaw durci, Ollama, LibreChat, AnythingLLM…).
  - n8n, Open WebUI et Dify : guides d'installation par le client, jamais revendus ni installés par le worker.
  - Secrets et rôles distincts par fonction du worker.
- **D9 — Agents du site et injection.**
  - L'ingestion (agents sans outil d'écriture) est séparée de l'écriture (outil unique `create_draft`, validé par schéma sur des collections autorisées).
  - Un jeton par agent, sortie réseau restreinte.
  - JSON-LD généré par code ; aucun LLM sur le chemin de publication.
  - Le MCP Directus est réservé à l'opérateur humain, suppressions désactivées.
- **D10 — Clientèle.** Entreprises seulement par défaut (B2B), ce qui allège les obligations de la Loi sur la protection du consommateur ; à renverser si le fondateur vise aussi les particuliers. Responsable de la protection des renseignements personnels : la personne ayant la plus haute autorité (règle par défaut de la Loi 25), à confirmer.
- **D11 — Sécurité de la chaîne.**
  - LiteLLM `v1.106.2` épinglé par empreinte, réseau interne seulement ; relire l'avis annoncé pour le 27/10.
  - Next.js 16.4.3 ou plus, SVG désactivé dans `next/image`.
  - Better Auth à la dernière version, gardes d'organisation testées.
- **D12 — Modèle « réel » de développement.** Le LiteLLM du site utilise le LiteLLM de pc1 (`cloud-glm-5-3`) comme fournisseur amont. Une clé OpenRouter du fondateur pourra être ajoutée par le coffre. Pour afficher la résidence d'un modèle OpenRouter, le fournisseur doit être fixé (« provider pinning »).
- **D13 — Divers.**
  - File de tâches : PostgreSQL `SKIP LOCKED`.
  - Antiabus : Altcha.
  - Courriel : Mailpit en développement, SMTP interchangeable.
  - Médias : volume local sauvegardé.
  - Umami : base dédiée.
  - Navigation : OPSYS-AI et Souveraineté restent visibles au premier niveau.
  - Next.js 16 : `proxy.ts`, `revalidateTag(tag, profil)`.
- **D14 — Catalogues commerciaux dans l'app, administrés depuis Directus (27/10).** Sans licence, Directus Core plafonne à 25 collections, et le contenu éditorial en occupe déjà 24. Les catalogues et configurations qui touchent l'argent ou l'infrastructure vivent donc dans la base app : fournisseurs et modèles, prix et marges, taux de change, offres et applications VPS, serveurs Proxmox, gabarits, moyens de paiement, taxes, agents du site, prompts et exécutions. Chaque catalogue a son module Directus maison (« Modèles », « VPS », « Paiements », « Agents du site »), qui appelle l'API d'administration de l'app (`/api/admin/catalog/*`, jeton d'administration relayé par un endpoint Directus réservé aux administrateurs, comme le Coffre). Le panneau d'administration reste unique. Les versions et approbations de ces catalogues sont tenues par l'app (`config_versions` : brouillon → approuvé → publié, hash figé, la synchronisation ne consomme que le publié). Directus garde le contenu éditorial et `subscription_plans` (déjà créée). Effet de bord voulu : l'argent et l'infrastructure ne dépendent plus d'une licence Directus. Coût si faux : des modules à maintenir au lieu de collections natives.

