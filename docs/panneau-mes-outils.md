# Panneau « Mes outils » (chantier D)

Page d'accueil du compte (`/compte`, fr-CA et en-CA) et pages `/compte/rag` et `/compte/code`. Conception : `docs/superpowers/specs/2026-10-30-credits-produits-design.md` (décisions 4, 5, 7, 10) ; crédits, espace et contrat `OrgEntitlements` : `docs/credits-et-offres.md`.

## Ce que la page montre

1. **Crédits** : total, **abonnement et recharge séparés**, échéance des crédits d'abonnement, « n'expirent pas » pour la recharge, message quand il n'en reste plus, alerte de compte bloqué, « Accès administrateur gratuit » pour l'organisation maison. Bouton « Ajouter des fonds » (propriétaire seulement).
2. **Espace disque** : barre globale sur le quota (offre + Go supplémentaires), ventilation par produit (`workstudio`, `code`, `rag`, `creative`, `bot`), **avertissement à 80 %**, **message clair à 100 %** (écritures refusées, lecture et suppression permises), « Aucun espace » sans offre. Maison : usage sans limite.
3. **Mon offre** : nom, rythme, renouvellement ou fin (résiliation demandée), paiement en retard ; sinon « Aucun abonnement : rechargez ou choisissez une offre ».
4. **Cartes des produits** : état réel, ce que le produit consomme (crédits, espace), rappel de ce qui manque, action principale.
5. L'activité (« Où j'en suis », « Pour démarrer », 30 derniers jours) reste dessous.

Une lecture de droits qui échoue ne casse pas la page : le résumé est remplacé par un message, les cartes restent (sans rappels). Chargement : squelette qui reprend la mise en page (pulse coupé si le mouvement est réduit).

## Registre des produits (`web/src/server/products/registry.ts`)

| Produit | Accès | Espace | État | Action |
|---|---|---|---|---|
| WorkStudio | crédits | `workstudio` | **disponible si l'adresse de l'instance est connue** (`WORKSTUDIO_PUBLIC_URL` ou réglage en base : l'interrupteur d'avant) ; sinon « Bientôt », sans bouton | Ouvrir WorkStudio (masqué sans crédit : le rappel dit quoi faire) |
| Nexora Code | crédits | `code` | interrupteur **`NEXORA_PRODUCT_CODE`** | Ouvrir Nexora Code (`/compte/code`) ; sinon « Me prévenir » |
| Nexora RAG | crédits (jetons d'embedding et de rerank) | `rag` | interrupteur **`NEXORA_PRODUCT_RAG`** | Créer mon RAG (`/compte/rag`) ; sinon « Me prévenir » |
| Nexora Bot | crédits | `bot` | état de sa fiche Apps (Bientôt) | Me prévenir |
| Nexora Creative | à définir | `creative` | état de sa fiche Apps (Plus tard) | Me prévenir |
| WebPilot | crédits (à l'usage) | aucun | état de sa fiche Apps (Bientôt) | Me prévenir |
| Privacy Router | inclus, jamais payant | aucun | état de sa fiche Apps (Bientôt) ; sa page du panneau existe | Régler ma politique |
| VPS | abonnement propre | aucun | disponible (sa page existe) | Voir mes VPS |

**Interrupteurs** : `NEXORA_PRODUCT_CODE` et `NEXORA_PRODUCT_RAG` valent `1`, `true`, `on`, `oui` ou `yes` pour allumer ; tout le reste (absent, vide, `0`, faute de frappe) éteint. Éteints par défaut. Aucun interrupteur ne commande WorkStudio, Bot, Creative, WebPilot, Privacy Router ni VPS. « Me prévenir » mène au formulaire de contact prérempli (`?sujet=apps-<produit>`), la liste d'attente existante.

**À la mise en service du RAG puis de Nexora Code** (les gestes vont ensemble, un test ne peut pas les lier) : (1) RAG : déjà branché ; Nexora Code : renvoyer le service dans `web/src/server/products/services.ts` ; (2) allumer `NEXORA_PRODUCT_RAG=1` / `NEXORA_PRODUCT_CODE=1` ; (3) passer l'état de la fiche `rag` / `code` à `disponible` dans `web/src/i18n/apps.ts` et compléter leur liste « ce qui est prêt » (fr et en : un test exige du livré pour « disponible ») ; (4) mettre à jour les affirmations CL-AP06 / CL-AP07 de `cms/content/claims.json` (leur texte parle au futur).

## Interfaces à remplir

### `RagPanelService` (`web/src/server/products/rag-panel.ts`) : chantier B (fusionné dans `main`)

```ts
listBases(orgId): Promise<RagBaseSummary[]>   // id, name, description, createdAt, documents, pending, failed, usedBytes
connection(): { siteUrl, apiUrl, mcpUrl }       // https://<site>, …/v1/rag, …/v1/rag/mcp
```

**Déjà branché** : `createRagPanelService` (`rag-service.ts`) lit `listBases` de `web/src/server/rag` (octets = `stats.bytes`) ; `services.ts` l'instancie. La **création** n'est pas dans l'interface : « Créer mon RAG » appelle `POST /api/account/rag { name }` du chantier B (`docs/rag.md` §1), qui crée la base et sa clé dédiée (valeur montrée une seule fois). Le panneau n'affiche jamais un message du serveur : un code connu (`quota_exceeded`, `insufficient_quota`, `base_exists`, `base_limit`, `key_limit`, `model_unavailable`, `rag_unavailable`, 429, 401, 403) choisit un message du dictionnaire (`rag-create-response.ts`). Les extraits à copier viennent de `server/rag/snippets.ts` (une seule source). **Tant que les modèles d'embedding du catalogue sont en « aperçu »**, créer une base répond `409 model_unavailable` : ne pas allumer `NEXORA_PRODUCT_RAG` avant leur mise en service.

### `CodeWorkspaceService` (`web/src/server/products/code-workspace.ts`) : chantier C

```ts
getState({ orgId, userId }): Promise<{ status: "stopped" | "starting" | "ready" | "error"; usedBytes; openUrl: string | null }>
start({ orgId, userId }): Promise<{ ok: true, state } | { ok: false, reason: "quota_exceeded" | "unavailable" }>
cli(): { installCommand: string | null; loginCommand: "nexora-code login" }
```

Un environnement **par personne** ; `usedBytes` = volume (à compter par `recordStorageUsage(orgId, "code", …)` avant d'écrire). `openUrl` : https (ou http local en dev), sinon écarté et l'état retombe à « en démarrage ». `installCommand` null affiche « sera publiée ici à la sortie ». Le panneau relit l'état toutes les 3 s tant qu'il vaut `starting`.

### Où brancher

`web/src/server/products/services.ts` : `getRagPanelService()` et `getCodeWorkspaceService()` rendent `null` aujourd'hui. Import statique volontaire (un registre mutable ne serait pas partagé entre les routes et les pages). Allumé sans service : page « indisponible », jamais de faux contenu.

## Routes

- RAG : `/api/account/rag/*` est celui du chantier B (`server/rag/account.ts`), sans interrupteur côté route : c'est la page qui est cachée tant que `NEXORA_PRODUCT_RAG` est éteint.
- `GET` / `POST /api/account/code/workspace` : toute personne de l'organisation, pour SON environnement ; POST démarre (202).

## Extraits « Se connecter » (page RAG)

`connectionSnippets` du chantier B (`web/src/server/rag/snippets.ts`) : configuration MCP distante de Nexora Code (format d'OpenCode : **à confirmer par le chantier C**), `mcpServers` générique, `curl …/bases/{id}/query`, variables d'environnement. Sans clé, l'exemple `nxk_votre_cle` ; après « Créer mon RAG », les extraits portent la clé fraîche, qui disparaît quand on ferme la confirmation (elle n'est ni dans le journal, ni dans le stockage du navigateur).

## États de chaque page

`soon` (interrupteur éteint : ce qui est prévu, liste d'attente, fiche), `unavailable` (allumé, service absent), `error` (lecture en échec : message générique, lien « Réessayer »), `ready`. Nexora Code montre aussi, même « Bientôt », le texte sur les plugins compatibles (Claude Code, Codex : **prévu**, ce qui ne se traduit pas est signalé).

## Décisions (Ruling : décision — pourquoi — coût si faux)

- Ruling : `/compte` devient « Mes outils » (l'ancien « Aperçu ») — le fondateur veut cette page d'accueil — coût si faux : renommer deux libellés.
- Ruling : Privacy Router suit l'état de sa fiche Apps (« Bientôt ») tout en proposant sa page de réglage — une seule vérité publique — coût si faux : passer `stateSource` à `panel` (une ligne).
- Ruling : la fiche RAG passe de « abonnement » à « à l'usage » (espace + jetons en crédits) — décision 6 et demande du fondateur — coût si faux : `access` de `rag` dans `i18n/apps.ts`, et CL-AP07.
- Ruling : le nom « Nexora Code » remplace « Agent de code Nexora » (l'adresse `/apps/code` ne change pas) — décision 8 et charte — coût si faux : un nom dans deux dictionnaires.
- Ruling : l'organisation maison n'a ni crédit ni espace à montrer : le panneau le sait par le mode de facturation, pas par le contrat (qui n'a pas de champ « maison »).
- Ruling : seul le propriétaire crée un RAG (cela crée une clé d'API, comme `/api/account/api-keys`) — coût si faux : retirer le test de rôle de `handleCreateRag`.
- Ruling : « Créer mon RAG » sur la carte mène à `/compte/rag`, où se fait le clic unique (la clé s'y affiche) — la carte ne pouvait pas porter l'affichage unique de la clé — coût si faux : incorporer `CreateRagForm` à la carte.
- Ruling : le site n'a pas de mode sombre (les sections posent leur thème) : captures en clair seulement.

## Tests

`web/src/server/products/*.test.ts` (registre, vues, services avec faux, adaptateur du RAG, route Nexora Code, composition sur base jetable), `components/account/rag-create-response.test.ts`, `web/src/components/account/tools-home.test.tsx`, `rag-code-panels.test.tsx`, `panel-render.test.tsx`, dictionnaires (`account-panel-dictionary.test.ts`, `apps.test.ts`), affirmations (`cms/content`). Base jetable : `set -a; . ~/Desktop/NexoraSite/.env; set +a` puis `npx vitest run` (Node 24).
