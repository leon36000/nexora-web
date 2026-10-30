# On-premises AI server — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-serveur-ia-sur-place.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-serveur-ia-sur-place` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/guides/on-premises-ai-server/` · slug : `guides/on-premises-ai-server`
- Titre SEO (43 caractères) : On-premises AI server: decide before buying
- Description SEO (149 caractères) : The five decisions before buying an on-premises AI server: users, documents, model, tools and backups. What stays with you and what leaves your site.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : les décisions à prendre avant d'acheter un serveur d'IA sur place, sans prix ni dimensionnement. · Affirmations : CL-82, CL-80*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · On-premises AI**

# An on-premises AI server: decide before you buy.

Five decisions, what stays with you, what leaves, and who does what. Hardware is set at the assessment, before any purchase: no price or sizing is published here.

[See on-premises deployment](/en/deployment/on-premises/) · [Request a study](/en/contact/?sujet=etude-deploiement)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : le matériel dépend du cas et se décide au diagnostic ; un petit modèle ne suffit pas toujours. · Affirmations : CL-82, CL-83, CL-80*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

The hardware needed depends on the number of users, the volume of documents, the chosen model and the uses; it is set at the assessment, before any purchase. A small local model is not always enough for agents that call tools. No price or sizing is published: they depend on your case.

An on-premises AI server is a server installed at your site, which runs the AI system and keeps your documents there.

### Bloc 3 — Cartes (`block_cards`)

*Les cinq décisions, dans l'ordre où on les prend. · Affirmations : CL-82, CL-83, CL-26*

Réglages : `columns=4`, `tone=sable`, `layout=etapes`, `anchor_id=decisions`

## The five decisions.

Each one changes the hardware. The assessment settles them with you.

#### Users.

How many people use it, and at the same time?

#### Documents.

What volume, which formats, and do you need to read scanned PDFs or transcribe speech?

#### The model.

A more capable model needs more memory. A small model is not always enough for tool-calling agents.

#### Tools.

What should agents be able to do: read, write, send?

#### Backups.

Where, how often, and who restores?

### Bloc 4 — Section (`block_section`)

*Ce qui reste chez vous et ce qui sort : flux sortants à lister, jamais de bascule silencieuse. · Affirmations : CL-77, CL-76, CL-E01, CL-06*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=flux`

## What stays, what leaves.

On premises, your data stays on your server. Nexora AI accesses it only if you authorize it in writing, for a specific, time-limited task, and every access is logged.

Installing the system on your server is nevertheless not the same as having no outbound flow. Updates, licences and any external model are listed before go-live. No call to an external AI service is configured without your explicit activation, recorded in writing, and the system never switches silently to an external model, for example when a local model fails.

### Bloc 5 — Cartes (`block_cards`)

*Qui fait quoi : le client, Nexora AI. · Affirmations : CL-72, CL-04, CL-81*

Réglages : `columns=2`, `tone=clair`, `layout=grille`, `anchor_id=qui-fait-quoi`

## Who does what.

#### You.

The hardware, access and backups belong to you. You name the person who validates actions.

#### Nexora AI.

It installs and configures the system, then runs it with you and evolves it. Operations are agreed in the contract.

### Bloc 6 — Section (`block_section`)

*Installation en une commande : WorkStudio, Docker défini, choix du modèle, sauvegarde, restauration, mise à jour. · Affirmations : CL-26, CL-88*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=installation`

## Installation in one command.

WorkStudio installs with one command on a Docker server, Linux or macOS, amd64 or arm64 architecture. Docker is a tool that packages software so it installs the same way everywhere.

The installer offers a local model or a third-party service compatible with the OpenAI format, generates secrets on the machine and installs backup, restore and update commands. See [WorkStudio](/en/workstudio/) and [AI server installation](/en/services/ai-server-installation/).

### Bloc 7 — Cartes (`block_cards`)

*Limites : niveau de service, modèle local, voix et documents, absence de réseau. · Affirmations : CL-86, CL-83, CL-82, CL-77*

Réglages : `columns=2`, `tone=clair`, `layout=modules`, `anchor_id=limites`

## Limits to know.

#### No service level.

Availability and response times are set out in the contract.

#### A local model has limits.

A small model is not always enough for agents that call tools: the model is chosen with the case.

#### Voice and documents.

Reading documents and voice need additional models, hence more hardware.

#### Offline is not guaranteed.

Operation without a network is not guaranteed: updates and licences have outbound flows.

### Bloc 8 — FAQ (`block_faq`)

*Questions du guide : serveur puissant, sans internet, matériel, prix, responsabilité. · Affirmations : CL-82, CL-83, CL-77, CL-10, CL-72, CL-86, CL-E01, CL-80*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## On-premises AI server: your questions.

#### Do I need a powerful server to run AI in a small business?

It depends on the case: number of users, volume of documents, chosen model and uses. The assessment sets the hardware you need before any purchase.

#### Can AI run without the internet?

Partly. Installing the system on your server is not the same as guaranteed offline operation: updates, licences and any external model are outbound flows, listed before go-live.

#### Is a small local model enough?

Not always. A small local model is enough for some tasks, but not always for agents that call tools. The model is chosen with the case.

#### How much does an on-premises AI server cost?

There is no public price yet. A written estimate follows the assessment and says what is included and what is not. No hardware price list is published, because the hardware depends on your case.

#### Who owns the hardware and the data?

You do: the hardware, access and backups belong to you, and your data stays on your server. Nexora AI installs, configures and runs it with you.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : étude de déploiement sur place. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Let's start with the assessment.

Tell us your users, your documents and your uses. We set the hardware with you before any purchase.

[Request a study](/en/contact/?sujet=etude-deploiement) · [On-premises deployment](/en/deployment/on-premises/)
