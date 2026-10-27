# NexoraSite — règles du dépôt (à lire avant toute modification)

Site public et commercial de Nexora (IA souveraine au Québec). Conception de référence : `docs/superpowers/specs/2026-10-26-nexora-site-design.md` (lis-la, en particulier les §4, §8 à §13 et les décisions D1 à D13 du §17). Recherches : `docs/recherche/`.

## Structure
- `web/` — Next.js 16 (App Router, React 19, TypeScript strict, Tailwind CSS 4) : site public fr-CA/en-CA, espace client, API serveur (`/v1/*` passerelle facturée, coffre, API d'administration), webhooks.
- `worker/` — Node.js/TypeScript : file de tâches PostgreSQL (`SKIP LOCKED`), provisionnement VPS, synchronisations, agents du site.
- `cms/` — Directus 12.5.1 : schéma et configuration (Environment Sync), extensions maison (`cms/extensions/`), script de contenu initial idempotent.
- `deploy/` — `compose.yml` (images épinglées par empreinte), gabarits `.env.example`.
- `docs/` — conception, plans, ledger, recherches.

## Règles absolues
- **Aucun secret** dans le dépôt, dans Directus, dans le navigateur ou dans un journal. Les secrets passent par le service coffre (D2) ou par des secrets Docker. `.env*` est ignoré, sauf `.env.example`.
- **Frontière des données (D4)** : Directus = contenus, catalogues et configurations publiés. Tout ce qui porte un identifiant client ou un montant vit dans la base `app`.
- **Images Docker épinglées par empreinte** (`image@sha256:…`), jamais `latest`. LiteLLM : `v1.106.2` seulement (incident 1.107.0).
- **Vérité du contenu** : aucun faux client, témoignage, chiffre, prix, certification ou « conforme à la Loi 25 ». Lexique et ton : `docs/recherche/06-mistral-marketing-souverainete.md` §11.
- **Français québécois d'abord** (fr-CA), anglais canadien (en-CA) relu ; tout texte visible passe par les dictionnaires ou Directus, jamais en dur dans un composant.
- **Paiements en mode test** (Stripe) tant que le fondateur n'a pas donné son accord explicite.
- **Accessibilité WCAG 2.2 AA** et palette de la conception §5 (contrastes calculés) ; `prefers-reduced-motion` respecté.
- **Tests** : écris le test qui échoue avant le code pour toute logique (grand livre, prix, webhooks, machine à états, garde de publication, coffre). Pas de test qui recopie une déclaration.

## Outils
- Gestionnaire : **bun** (`bun install`, `bun run …`, `bunx`). Node 24 disponible.
- Ne jamais utiliser `cd` dans une commande Bash : chemins absolus, `git -C`, `bun --cwd`.
- Ports de développement : site 3500, Directus 8456, LiteLLM 4400 (réseau interne), PostgreSQL 15440, Mailpit 8026 (interface) / 1026 (SMTP).
- Machine pc6 (aarch64, disque à ~95 %) : `docker builder prune -af` après les builds ; ne supprimer que ses propres images.
- Commits en français, se terminant par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (ou le modèle de l'agent).

## Next.js 16 : différences à connaître
`proxy.ts` remplace `middleware.ts` ; `revalidateTag(tag, profil)` prend deux arguments ; lire `web/node_modules/next/dist/docs/` en cas de doute.
