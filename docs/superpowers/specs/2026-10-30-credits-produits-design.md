# Nexora AI : modèle à crédits, produits du panneau, RAG et agent de code (conception)

Date : 30/10/2026. Origine : demande du fondateur du 30/10 (voir « Ce que le fondateur a décidé »). Dépôts : site `root/nexora-web` (`~/Desktop/NexoraSite`), agent de code `root/nexora-code-agent` (le nom `nexora-code` est pris par l'application de bureau `nexora/nexora-code`, voir le journal) (`~/Desktop/NexoraCode`, fork d'`anomalyco/opencode`).

## But

Un seul modèle économique, lisible : **un abonnement = des crédits mensuels + de l'espace disque** ; sinon on **recharge** des crédits. Les outils Nexora sont gratuits ou inclus ; **tout ce qui appelle un modèle d'IA consomme des crédits** (c'est du jeton). À terme Nexora héberge les modèles pour tous ses services. Le panneau du compte réunit les produits : WorkStudio, Nexora Code, Nexora Creative, Nexora Bot, RAG. En plus : un site plus beau et un contenu plus qualitatif.

## Ce que le fondateur a décidé (30/10/2026)

- Abonnement uniquement, pour un nombre de crédits ; les crédits sont « en gros des jetons » ; sinon recharge (« refill »).
- Exemple de forfait de base : **29,99 $, 1 Go d'espace, 1 000 crédits par mois**.
- Dans le panneau : WorkStudio, Nexora Creative, Nexora Code (environnement de travail et espace **sur nos serveurs**, rien sur le poste du client), Nexora Bot (connexion au compte Nexora ; fonctionne avec l'abonnement ou la recharge).
- RAG : le client paie l'**espace** et les jetons d'**embedding** et de **rerank** ; **en un clic** il déploie son RAG, connectable à son bot, à ses agents de code ou à tous nos outils, avec **une clé API** pour l'utiliser sur son système.
- Agent de code : télécharger le code source d'**OpenCode v2**, le rebrander **Nexora**, l'améliorer, avec des **plugins** comme Claude Code et Codex et **compatible avec les plugins de Claude Code et de Codex** ; accessible depuis le panneau.
- Site : polir, contenu plus qualitatif, visuellement encore plus beau.

## Mes décisions (à corriger si le fondateur n'est pas d'accord)

1. **1 crédit = 1 ¢ CA de jetons au prix du catalogue** (coût amont DeepInfra × taux approuvé + 10 %). 1 000 crédits = 10 $ de consommation. Le portefeuille garde ses cents : « crédit » est l'unité affichée. Chaque modèle montre son équivalent en jetons. *Si faux : changer le libellé et le facteur d'affichage, pas la facturation.*
2. **Une seule famille d'offres « Nexora »** remplace les offres `workstudio-*`. Palier de base = les chiffres du fondateur (29,99 $ CA par mois, 1 Go, 1 000 crédits). Paliers au-dessus en **brouillon** (`suggested_price_cents`, non publiés) : Pro 79,99 $ (10 Go, 4 000 crédits), Équipe 199,99 $ (50 Go, 12 000 crédits). Annuel : 12 mois au tarif de 10 % de moins. Aucun essai gratuit (règle du 29/10). Devise : $ CA.
3. **Deux sortes de crédits** : *d'abonnement* (versés à chaque période payée, expirent à la fin de la période) et *de recharge* (achetés, **sans expiration**). On consomme d'abord ceux d'abonnement. Recharges proposées : 10, 25, 50, 100 $ (1 $ = 100 crédits). Pas de recharge automatique sans consentement explicite.
4. **Accès aux modèles** = solde de crédits supérieur à zéro (abonnement **ou** recharge) ; la maison (administrateur) reste gratuite. Remplace « exige un abonnement ». Les outils qui n'appellent aucun modèle restent gratuits.
5. **Espace disque** : un quota par offre, compté **par organisation** et ventilé par produit (`workstudio`, `code`, `rag`, `creative`, `bot`). Au-delà : écriture refusée avec un message clair et achat de Go supplémentaires (suggestion 1 $ CA par Go et par mois, brouillon). Les prix et quotas vivent dans Directus, jamais en dur.
6. **RAG managé v1** = approvisionnement **logique** isolé par organisation (une « base » créée en un clic), pas un conteneur par client : PostgreSQL + pgvector, l'embedding et le rerank passent par la passerelle (jetons facturés en crédits), l'espace (documents + vecteurs) compte dans le quota. Interface : API HTTP `/v1/rag/...` avec clé dédiée, **serveur MCP** pour les agents et les bots, bouton « Copier la configuration ». *Si faux (isolation physique demandée) : phase 2 avec le module VPS.*
7. **Nexora Bot et Nexora Creative ne sont pas construits** : ils apparaissent dans le panneau avec leur **état réel** (« Bientôt » / « Plus tard »), conformément à la règle du site (un outil non livré n'est jamais présenté comme disponible). Le contrat de connexion du Bot (compte Nexora + crédits) est documenté pour qu'il se branche sans refonte. Le fondateur décide s'ils sont construits ensuite.
8. **Nexora Code** = fork d'`anomalyco/opencode` (MIT, v2.2.3, branche `dev`). Obligations MIT : conserver `LICENSE` et la mention de droit d'auteur d'origine, ajouter celle de Nexora, ne pas laisser croire à un parrainage d'OpenCode. **Vie privée** : tout appel vers les services d'OpenCode (Zen, Go, console, partage, mises à jour, télémétrie, `opencode.ai`) est retiré ou remplacé par Nexora ; le fournisseur par défaut est la passerelle Nexora. Binaire : `nexora-code`. Connexion par le compte Nexora (clé `nxk_` par personne, comme `workstudio-access`).
9. **Compatibilité des plugins** : chargeur qui lit (a) les plugins de **Claude Code** (`.claude-plugin/plugin.json`, `commands/`, `agents/`, `skills/*/SKILL.md`, `hooks/`, `.mcp.json`) et (b) le format **Agent Plugins / Codex** (`plugin.json` à la racine, `skills/`, `mcp.json`), en plus de l'API de plugins d'OpenCode. Ce qui ne peut pas être traduit est **signalé** (jamais ignoré en silence).
10. **Nexora Code hébergé** : environnement par personne dans un conteneur isolé sur nos serveurs, volume compté dans le quota, ouvert depuis le panneau. v1 : pilote d'approvisionnement avec un pilote Docker local et une interface qui accepte le module VPS plus tard ; le pilote réel sur les serveurs Proxmox attend leur arrivée.
11. **Un seul agent, deux formes de livraison** (réponse du fondateur, 30/10/2026, à la question « cohabiter ou remplacer l'application de bureau existante ? » : *ni l'un ni l'autre*). Quand l'agent de code sera terminé, **c'est le même Nexora Code** qui est **téléchargeable** (poste de la personne : binaire, puis bureau) **et** hébergé **dans l'espace de travail Nexora** (image `nexora/code-workspace`). Conséquences : (a) une seule base de code (le fork `root/nexora-code-agent`), une seule version, un seul contrat de connexion (code d'appareil, clé `nxk_`, crédits, plugins) ; (b) le binaire téléchargé et l'image hébergée sortent **de la même étiquette de version** (jamais deux chaînes de compilation) ; (c) le fork garde le nom `nexora-code` et ses dossiers `~/.config/nexora-code` (aucun renommage « pour cohabiter ») ; (d) l'application de bureau Electron de Codex (`nexora/nexora-code`) n'est ni étendue ni supprimée ici : *mon hypothèse* est qu'elle est remplacée par la forme « bureau » du fork ; le fondateur le confirmera quand le téléchargement existera ; (e) le panneau et la page Apps présenteront les deux formes comme **un seul produit** dès qu'elles existent, pas avant (règle : aucun outil non livré n'est présenté comme disponible).

## Contrats entre chantiers

```ts
// web/src/server/billing/entitlements.ts (chantier A produit ; B, C, D consomment)
export type StorageProduct = "workstudio" | "code" | "rag" | "creative" | "bot";
export type OrgEntitlements = {
  planCode: string | null;                       // « nexora-base », null sans abonnement
  interval: "month" | "year" | null;
  credits: { subscription: number; refill: number; total: number }; // en crédits (1 crédit = 1 ¢ CA)
  storage: { quotaBytes: number; extraBytes: number; usedBytes: number; byProduct: Record<StorageProduct, number> };
  canUseModels: boolean;                          // total > 0, ou organisation maison
};
export function getOrgEntitlements(orgId: string): Promise<OrgEntitlements>;
export function recordStorageUsage(orgId: string, product: StorageProduct, deltaBytes: number):
  Promise<{ ok: true } | { ok: false; reason: "quota_exceeded" }>;
```

RAG (chantier C) : `packages/rag` (découpage, requêtes pgvector, rerank), `web/src/server/rag/`, routes `web/src/app/v1/rag/`. Les appels d'embedding et de rerank passent par les fonctions de la passerelle déjà utilisées par `/v1/chat/completions` (débit en crédits, Activité du client).

Nexora Code (chantier D) : dépôt séparé ; lit `NEXORA_API_URL` (passerelle) et se connecte par un flux « code d'appareil » dont le contrat côté site est décrit dans `docs/nexora-code.md` (route côté site ajoutée au chantier du panneau).

## Chantiers

| | Chantier | Dépôt / dossier | Dépend de |
|---|---|---|---|
| A | Crédits, offres, recharge, quota d'espace, page Tarifs, Directus, docs | site (`packages/db`, `web/src/server/billing`, `cms`, `/tarifs`) | rien |
| B | RAG managé (API, MCP, facturation en jetons et en espace) | site (`packages/rag`, `web/src/server/rag`, `/v1/rag`) | contrat A (peut utiliser un bouchon) |
| C | Nexora Code : fork, rebrand, vie privée, connexion Nexora, chargeur de plugins Claude Code et Codex | `~/Desktop/NexoraCode` | aucun |
| D | Panneau « Mes outils » : cartes des produits, solde, espace, RAG en un clic, ouverture de Nexora Code ; fiches Apps mises à jour | site (`/compte/(panneau)`, `i18n/apps`) | A, B |
| E | Polissage visuel et contenu de toutes les pages publiques (accueil, Apps, modèles, docs, FAQ, contact) | site (`web/src/app/[lang]`, `cms/content`) | A pour `/tarifs` |

Ordre : A, B et C en parallèle ; puis D ; E en dernier (il touche des pages que A et D modifient).

## À ne pas faire

Aucun prix publié, aucune date, aucun client ni certification inventés ; l'état réel de chaque outil ; aucune donnée vers OpenCode ou un service tiers non déclaré ; aucun modèle local ; rien vers GitHub (seulement lire) ; chaque affirmation de page passe par le registre `cms/content/claims.json`.

## Reste au fondateur

Valider les prix des paliers, le prix du Go supplémentaire, le facteur du crédit, la politique d'expiration, le taux de change réel, la clé DeepInfra, la décision de construire Nexora Bot et Nexora Creative, l'isolation physique du RAG, la date des serveurs Proxmox.
