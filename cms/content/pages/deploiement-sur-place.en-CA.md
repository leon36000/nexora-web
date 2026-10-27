# On-premises deployment — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `deploiement-sur-place.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `deploiement-sur-place` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/deployment/on-premises/` · slug : `deployment/on-premises`
- Titre SEO (42 caractères) : On-premises AI server for small businesses
- Description SEO (159 caractères) : Nexora installs the AI system on your server, in your offices or at a host of your choice. Hardware and access are yours; outbound flows are listed in writing.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du mode sur place. · Affirmations : CL-72, CL-26*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Deployment · On-premises**

# AI on your server. The access is yours.

We install and configure the system on a server you own, in your offices or at a host of your choice. What leaves your network, if anything, is handed to you in writing before go-live.

[Request a deployment study](/en/contact/?sujet=etude-deploiement) · [Compare the two modes](/en/deployment/)

### Bloc 2 — Section (`block_section`)

*Périmètre sur place : schéma et liste de ce qui reste dedans et de ce qui peut sortir. · Affirmations : CL-72, CL-05, CL-77, CL-79*

Réglages : `media_position=none`, `tone=sombre`, `visual=perimetre-sur-place`, `anchor_id=perimetre`

## The perimeter, on your premises.

The diagram shows a typical perimeter: your server, your workstations, your documents. It is an example, not a real customer's configuration; the diagram for your installation is handed over in writing.

- **What stays within your walls.** Documents, the search index, conversations, logs and, if you choose, the models.
- **What may leave.** Updates, licence checks, and an external model only if you accepted it in writing.
- **What we verify.** Every outbound flow is listed. We write “no data leaves” only if we have checked it on your configuration.

### Bloc 3 — Cartes (`block_cards`)

*Étapes de la mise en place sur place. · Affirmations : CL-81, CL-26, CL-104, CL-04*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## From study to operation.

#### Size.

The diagnosis measures your uses and sets the hardware needed, before any purchase.

#### Install.

Installation is one command on a Docker server (a tool that packages software), on Linux or macOS.

#### Configure.

Accounts, roles, single sign-on with your identity provider, model, connections to your software.

#### Verify.

List of outbound flows, diagram handed over in writing, test of a real case.

#### Train.

Usage and supervision, for your team.

#### Operate.

Division of tasks written in the contract: updates, backups, monitoring.

### Bloc 4 — Cartes (`block_cards`)

*Qui fait quoi dans le mode sur place. · Affirmations : CL-72, CL-04, CL-08*

Réglages : `columns=2`, `tone=sable`, `layout=modules`, `anchor_id=repartition`

## Who does what.

#### You.

You own the hardware.
You hold the access and grant it to Nexora as needed.
You place and keep the backups.
You decide on the models and any external option.

#### Nexora.

We size, install and configure.
We list the outbound flows and hand over the diagram.
We train your team.
We run it with you, as the contract provides.

### Bloc 5 — Cartes (`block_cards`)

*Limites du mode sur place. · Affirmations : CL-77, CL-83, CL-86, CL-82*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=limites`

## Limits to know about.

#### Offline is not presumed.

A server on your premises can still receive updates or check a licence. Everything is listed.

#### The hardware has to keep up.

A model on your server needs suitable hardware. A small local model is not always enough for agents that call tools.

#### No announced service level.

Availability and response times are set out in the contract.

#### Hardware is sized before it is bought.

No standard configuration: it depends on the number of users, the volume of documents and the model.

### Bloc 6 — FAQ (`block_faq`)

*FAQ propre au mode sur place. · Affirmations : CL-72, CL-77, CL-08*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## On-premises: your questions.

#### Does my data stay with me?

Documents, the index and conversations stay on your server. The only outbound flows are those we list together: updates, licences, and an external model if you choose one.

#### Does Nexora access my server?

Only through the access you grant, agreed in advance. You can withdraw it.

#### Can I install it at a host of my choice?

Yes: “on your premises” means on a server you own, in your offices or at the host you choose. Its location then appears on the data-flow diagram.

#### What if I want to leave?

You keep your server, your documents, your configurations and your workflows: export is provided for in the contract.

### Bloc 7 — Appel à l'action (`block_cta`)

*CTA : étude de déploiement. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Let's study your server.

Tell us your uses and constraints. We will tell you what would need to be installed, where, and what would leave the network.

[Request a deployment study](/en/contact/?sujet=etude-deploiement) · [See the hosted mode](/en/deployment/hosted-quebec/)
