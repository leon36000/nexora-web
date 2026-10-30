# On-premises deployment — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `deploiement-sur-place.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `deploiement-sur-place` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/deployment/on-premises/` · slug : `deployment/on-premises`
- Titre SEO (40 caractères) : On-premises AI server for small business
- Description SEO (156 caractères) : On-premises AI server for small business: Nexora AI installs it in your offices or at your chosen host. Your data stays on your server; the access is yours.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du mode sur place : mon serveur, mes accès, mes règles ; engagement CL-E01. · Affirmations : CL-72, CL-26, CL-E01*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Deployment · On-premises**

# Your AI. Your server. Your rules.

We install and configure the system on a server that belongs to you, in your offices or at a host of your choice. Your data stays there. Nexora AI gets in only if you authorize it in writing, for a specific task and a limited time.

[Study my project](/en/contact/?sujet=etude-deploiement) · [Compare the two modes](/en/deployment/)

### Bloc 2 — Section (`block_section`)

*Périmètre sur place : schéma et liste de ce qui reste dedans, de ce qui peut sortir et de qui peut entrer. · Affirmations : CL-72, CL-05, CL-77, CL-79, CL-E01, CL-E03, CL-E04, CL-E05*

Réglages : `media_position=none`, `tone=sombre`, `visual=perimetre-sur-place`, `anchor_id=perimetre`

## The perimeter, on your premises.

The diagram shows a typical perimeter: your server, your workstations, your documents. It is an example, not the configuration of a real customer; we hand you the diagram of your installation in writing. Your data is never used to train a model and never sold: [see the commitments on your data](/en/your-data/).

Before buying hardware, read [An on-premises AI server: decide before buying](/en/guides/on-premises-ai-server/) and [Where your data really is](/en/guides/where-is-your-ai-data/).

- **What stays within your walls.** Documents, the search index, conversations, logs and, if you choose, the models.
- **What can leave.** Updates, licence checks, and an external model only if you explicitly activated it, in writing.
- **Who can get in.** Nexora AI accesses your server only if you authorize it in writing, for a specific task and a limited time; every access is logged.
- **What we verify.** Every outbound flow is listed. We write "no data leaves" only if we have verified it on your configuration.

### Bloc 3 — Cartes (`block_cards`)

*Étapes de la mise en place sur place, sans devenir informaticien. · Affirmations : CL-81, CL-26, CL-104, CL-04*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## Six steps, no IT degree needed.

#### Size.

The assessment measures your uses and sets the hardware needed, before any purchase.

#### Install.

Installation takes one command on a Docker server (a tool that packages software), on Linux or macOS.

#### Configure.

Accounts, roles, single sign-on with your identity provider, model, connections to your software.

#### Verify.

List of outbound flows, diagram handed over in writing, test of a real case.

#### Train.

Usage and supervision, for your team: review, correct, approve.

#### Operate.

Split of tasks written in the contract: updates, backups, monitoring.

### Bloc 4 — Cartes (`block_cards`)

*Qui fait quoi dans le mode sur place. · Affirmations : CL-72, CL-04, CL-08, CL-E01*

Réglages : `columns=2`, `tone=sable`, `layout=modules`, `anchor_id=repartition`

## Who does what.

#### You.

You own the hardware.
You hold the access and decide when to grant it to Nexora AI, in writing.
You place and keep the backups.
You decide on the models and activate, or not, any external option.

#### Nexora AI.

We size, install and configure.
We list the outbound flows and hand over the diagram.
We train your team.
We run it with you, as the contract provides.

### Bloc 5 — Cartes (`block_cards`)

*Limites du mode sur place. · Affirmations : CL-77, CL-83, CL-86, CL-82*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=limites`

## Limits to know about.

#### Offline is not assumed.

A server on your premises can still receive updates or check a licence. Everything is listed.

#### The hardware has to keep up.

A model on your server needs suitable hardware. A small local model is not always enough for agents that call tools.

#### No announced service level.

Availability and response times are set out in the contract.

#### Hardware is sized before it is bought.

No standard configuration: it depends on the number of users, the volume of documents and the model.

### Bloc 6 — FAQ (`block_faq`)

*FAQ propre au mode sur place. · Affirmations : CL-72, CL-77, CL-08, CL-E01, CL-E03, CL-E04, CL-10, CL-80, CL-82*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## On-premises: your questions.

#### Does my data stay with me?

Yes. Documents, the index and conversations stay on your server. The outbound flows are the ones we list with you before go-live: updates, licences and, if you activate it in writing, an external model.

#### Does Nexora AI access my server?

Only if you authorize it in writing, for a specific task and a limited time. Nexora AI logs every access, and you can withdraw the authorization.

#### Is my data used to train a model?

No, never. Nexora AI does not use your data, documents, prompts or results to train or fine-tune a model, and it does not sell them.

#### Can I install it with a host of my choice?

Yes: "on your premises" means on a server that belongs to you, in your offices or with the host you choose. Its location then appears in the data-flow diagram.

#### What can I take with me if I leave?

You keep your server, your documents, your configurations and your workflows: the contract provides for their export.

#### How much does an on-premises AI server cost?

There is no public price yet. The hardware you need depends on the number of users, the volume of documents, the model chosen and the uses: the assessment sets it before any purchase. A written estimate follows the assessment and says what is included (installation, configuration) and what is not.

### Bloc 7 — Appel à l'action (`block_cta`)

*CTA : étude de déploiement. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Let's study your server.

Tell us your uses and your constraints. We will tell you what it would take to install, where, and what would leave the network.

[Study my project](/en/contact/?sujet=etude-deploiement) · [See the hosted mode](/en/deployment/hosted-quebec/)
