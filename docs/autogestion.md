# Agents du site (S8, D9)

Code : `worker/src/agents/` (cinq agents, outil `create_draft`, exécution), `packages/db/src/schema-site.ts` et `site-agents.ts` (tables, définitions), `web/src/server/site-agents/` (API d'administration), module Directus « Agents du site » (`cms/extensions-src/nexora-cms/src/agents/`). Conception : `docs/superpowers/specs/2026-10-26-nexora-site-design.md` §13 et D9, D14.

## Principe : un agent propose, un humain décide

| Agent | Modèle ? | Écrit dans Directus ? | Produit |
|---|---|---|---|
| Rédacteur | oui | oui (`create_draft`, mode `new_page`) | brouillon de page fr-CA + approbation « contenu » |
| Traducteur fr-CA → en-CA | oui | oui (mode `update_translation`) | version avec les traductions en-CA + approbation « traduction » ; n'agit que sur une page **publiée** (français approuvé) |
| SEO on-page | oui | oui (mode `update_seo`) | version avec `seo_title` et `seo_description` (et slug si la page n'est pas publiée) + approbation « seo » ; liens internes **suggérés** dans le résumé |
| Veille | oui | non | briefs proposés (dans la sortie de l'exécution), à partir d'une source fournie |
| Santé des modèles | non | non | sondes gratuites (`/v1/models`, état des fournisseurs, vivacité de LiteLLM) |

Aucun LLM n'intervient sur le chemin de publication : la promotion exige une approbation sur le hash exact (garde de Directus), les données structurées sont générées par le code, le sitemap et l'indexation sont déterministes.

## Séparation ingestion / écriture (injection)

1. **Ingestion** (`ingest.ts`, `facts.ts`) : lecture seule d'une URL fournie par une personne. Refus des schémas non http(s), des identifiants dans l'URL, des adresses non publiques (boucle locale seulement hors production), des redirections ; taille et durée bornées ; scripts, styles, commentaires et éléments cachés retirés ; texte tronqué et enveloppé en `<source_non_fiable>`. Le modèle de cette étape n'a **aucun outil** : il ne rend que des faits courts (JSON borné). Un fait qui ressemble à une consigne adressée à une IA est écarté (injection de second ordre) et l'exécution consigne « la source contient des consignes, traitées comme des données ».
2. **Écriture** (`create-draft.ts`) : outil **unique**. Entrée validée par un schéma zod **fermé** (champ inconnu = refus ; pas de statut ; pas de lien externe ; pas de bloc de tarifs ; slugs réservés refusés) puis par la **politique de l'agent** (modes permis). L'écriture ne va que dans une **version** (jamais sur l'élément publié) ; une nouvelle page commence par une coquille en **brouillon**. Le client Directus des agents (`directus-client.ts`) n'a que `get` et `post` et compare chaque requête à une liste fermée : jamais `DELETE`, `PATCH`, `/promote`, une autre collection ou un utilisateur — même si le jeton en avait le droit.
3. **Contenu produit** : un contrôle déterministe (`content-lint.ts`) signale dans le résumé de l'approbation les montants, pourcentages, certifications, affirmations de conformité à la Loi 25, superlatifs, références clients : « à vérifier avant d'approuver ».
4. Aucun secret dans le contexte du modèle ni dans la sortie : les clés sont lues du Coffre par le coureur, jamais passées à l'agent ; le journal du worker masque `nxk_…` et les jetons.

## Modèles : passerelle Nexora, pas de clé virtuelle LiteLLM directe

Chaque agent a **sa clé Nexora** (`nxk_…`, modèle autorisé = le sien) dans l'organisation interne « Nexora — agents du site » (`org_nexora_agents_site`). Les appels passent par `/v1/chat/completions` : réservation atomique au grand livre, règlement au coût réel, 402 si le crédit manque, révocation d'une clé, `usage_events`. Choix justifié : ces mécanismes existent et sont testés (S5) ; une clé virtuelle LiteLLM créerait un second compteur de dépense à rapprocher et contournerait le grand livre et les prix versionnés. Contrepartie : le worker dépend du site (`NEXORA_APP_INTERNAL_URL`).

- **Budget** : mensuel par agent (micro-CAD), la dépense du mois est la somme du coût des exécutions (`agentMonthSpendMicro`). Il est vérifié **avant chaque appel**. Dépassement : l'exécution s'arrête proprement (`budget_exceeded`), l'agent passe à l'état « budget dépassé », le lancement manuel est refusé (409). Filet : le crédit alloué à l'organisation interne (`POST /api/admin/site-agents/credit`, 500 $ par appel au plus) ; sans crédit, la passerelle répond 402, traité comme un arrêt propre.
- **Arrêt** : désactiver un agent (ou « Arrêter ») le fait s'arrêter avant son prochain appel de modèle ; les exécutions en file passent à « arrêtée ».
- **Modèle par défaut** : `nexora/glm-5-3` (via le LiteLLM de pc1). **Plafond de sortie** : 4096 jetons, raisonnement compris, pour ce modèle de développement : les pages sont courtes (5 à 7 blocs) et la traduction se fait par lots de 2 600 caractères (`config.batchChars`) ; `config.maxTokens` règle le plafond par agent pour un modèle plus généreux (modèle OpenRouter branché par le module « Modèles »).
- **Journal et coûts** : `site_agent_runs` (entrée, sortie = références seulement, jetons, coût, événements bornés à 100, erreur nettoyée) ; `site_agents` (mission, modèle, budget, activé, dernier passage, jetons et coût cumulés, état, dernière erreur).

## Exploitation

- Mise en service d'un agent (module « Agents du site » + module « Coffre ») : coller le jeton Directus de l'agent dans le Coffre (`site-agent.<agent>.directus`), « Générer la clé de la passerelle », « Allouer du crédit » à l'organisation interne, fixer budget et modèle, activer. En développement, `worker/scripts/dev-provision-agents.ts` fait tout cela (comptes Directus de service, jetons déposés dans le Coffre, crédit d'essai) ; en production ce sont les modules, et `apply.ts` crée les comptes de service (diff `docs/propositions/s8-cms-agents.diff`).
- Droits Directus nécessaires (diff proposé) : le Rédacteur doit pouvoir **créer** `pages` et `pages_translations` (coquille en brouillon) ; les trois agents de contenu doivent pouvoir fournir l'`id` de l'approbation qu'ils créent (ils ne peuvent pas la relire).
- Déclencheurs : manuel (module), planifié (santé horaire, veille du lundi), événement (une page française publiée sans anglais met le Traducteur en file s'il est activé : `after-publish.ts`).
- Variables du worker : `DATABASE_URL`, `NEXORA_VAULT_MASTER_KEY`, `NEXORA_APP_INTERNAL_URL`, `DIRECTUS_URL`, `LITELLM_BASE_URL` (santé), `SITE_URL`/`SITE_ENV` (indexation), `WORKER_SCHEDULER`.

## Limites connues

- La Veille ne lit que l'URL fournie (aucune API payante) ; le suivi de mots-clés et de liens entrants par DataForSEO n'est pas câblé (l'adaptateur vérifie la clé, rien de plus).
- L'agent Diffusion (Postiz) et le maillage par embeddings ne sont pas livrés.
- Le Traducteur sur une page dont l'anglais existe déjà propose une **mise à jour** de l'anglais (version + approbation) ; il ne touche jamais aux blocs de tarifs.
- Sans licence Directus, les agents voient tout le contenu en lecture (brouillons compris) ; les jetons sont tenus par le Coffre, pas par Directus.
