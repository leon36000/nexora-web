# AI server installation — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `services-installation-serveurs-ia.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `services-installation-serveurs-ia` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/services/ai-server-installation/` · slug : `services/ai-server-installation`
- Titre SEO (41 caractères) : AI server installation for small business
- Description SEO (160 caractères) : AI server installation for small business: Nexora AI installs in one command, on your premises or in Quebec, and runs it with you. Hardware sized before buying.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du service d'installation : un serveur d'IA prêt à travailler, un périmètre écrit. · Affirmations : CL-81, CL-05, CL-26*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Services · Installation**

# An AI server, ready to work.

We install, configure and run with you the server that powers your agents and models: on your premises, or in our infrastructure in Quebec. One-command installation, perimeter handed over in writing before go-live, data that stays yours.

[Request a deployment study](/en/contact/?sujet=etude-deploiement) · [Compare the two modes](/en/deployment/)

### Bloc 2 — Section (`block_section`)

*Définition du serveur d'IA, deux voies et engagements sur les données de chaque voie. · Affirmations : CL-81, CL-02, CL-13, CL-E01, CL-E02, CL-E03, CL-E04, CL-73*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=deux-voies`

## Two paths, one method.

An AI server is a machine that runs the models (the engines that produce the answers) and the agents. It can be a physical server, or a virtual private server (VPS), meaning a server rented just for you.

The method is the same in both cases: size, install, configure, check the flows, train, then operate. In both cases too, your data is never used to train a model and never sold: [see the commitments on your data](/en/your-data/).

- **On your premises.** In your offices or at a host of your choice. The hardware and the access are yours, and your data stays on your server: Nexora AI gets in only if you authorize it in writing, for a specific task and a limited time, and every access is logged.
- **With us, in Quebec.** In our infrastructure, where we run it. You buy no server and no hardware. Your data stays in Quebec, backups included, apart from the services you explicitly activate; the location is specified to you in writing before go-live.

### Bloc 3 — Cartes (`block_cards`)

*Six étapes de l'installation, de l'étude à l'exploitation. · Affirmations : CL-81, CL-26, CL-88, CL-104, CL-05, CL-04*

Réglages : `columns=3`, `tone=sable`, `layout=etapes`, `anchor_id=etapes`

## Installation, from study to operation.

#### 1. Size.

Number of users, volume of documents, chosen model: the assessment sets what is needed, before any purchase.

#### 2. Install.

WorkStudio installs with one command on a Docker server (a tool that packages software so it installs cleanly), on Linux or macOS. Secrets are generated on the machine; backup, restore and update commands are put in place.

#### 3. Configure.

Organization, accounts and roles, single sign-on with your identity provider, choice of model, connections to your software.

#### 4. Verify.

We list what leaves the network and hand over the data-flow diagram. Then we test a real case, with your approvals.

#### 5. Train.

Your team learns to supervise, correct and decide, not to program.

#### 6. Operate.

Updates, backups, monitoring and evolution: what we do and what you do is written in the contract.

### Bloc 4 — Cartes (`block_cards`)

*Facteurs de dimensionnement, sans valeur inventée. · Affirmations : CL-82, CL-83, CL-102*

Réglages : `columns=2`, `tone=sombre`, `layout=modules`, `anchor_id=dimensionnement`

## What makes the hardware vary.

We give no standard configuration: it depends on these four factors, which the assessment measures before any purchase.

#### The number of users.

How many people query the system at the same time, and at what hours.

#### The volume of documents.

It sets the size of the knowledge base and the indexing time.

#### The chosen model.

A model on your server needs more powerful hardware than an external model. A small local model is not always enough for agents that call tools: the choice is made during the assessment.

#### The uses.

Reading scanned documents or transcribing recordings calls for additional models, hence memory and compute time.

### Bloc 5 — Section (`block_section`)

*Ce que contient le serveur : WorkStudio et ses composants. · Affirmations : CL-26, CL-27, CL-103, CL-24, CL-88, CL-P02*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=composants`

## What your AI server contains.

The installation brings together the [Nexora WorkStudio](/en/workstudio/) platform, where you build agents and workflows without writing code, and the services it needs.

- **WorkStudio.** The studio where agents and workflows are designed and run, in French, without writing code.
- **A model gateway.** A single access point to several AI models, in the OpenAI format, with keys, quotas and consumption metering.
- **Nexora Connect.** The connector engine that links your services (mail, calendar, storage, billing).
- **Optional services.** Local detection of personal information, local voice (transcription, speech synthesis), reading of scanned documents.
- **Operating commands.** Start, stop, log, back up, restore, update.

### Bloc 6 — Cartes (`block_cards`)

*Ce que nous ne promettons pas, pour ce service. · Affirmations : CL-10, CL-14, CL-86, CL-77, CL-PL03, CL-T01, CL-T06, CL-12*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=limites`

## What we do not promise.

#### No public price.

For support, a written estimate follows the assessment. Use of the platform is paid for in credits, and their prices will appear on the Pricing page.

#### No universal timeline.

The duration depends on your case and is measured on a first case.

#### No announced service level.

Availability and response times are set out in the contract.

#### We do not presume there is no outbound traffic.

Updates, licences, any external model: everything is listed before go-live.

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à l'installation (matériel, serveur existant, exploitation, changement de mode, sorties de données). · Affirmations : CL-26, CL-81, CL-82, CL-08, CL-77, CL-06, CL-E01, CL-E05, CL-10, CL-PL03, CL-T01, CL-T04, CL-T06, CL-12*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Installation: your questions.

#### Do I need to buy a powerful server?

It depends on the case. The assessment answers that before any purchase: it takes into account the number of users, the volume of documents and the chosen model.

#### Can it go on an existing server?

Yes, if it is a Linux or macOS server running Docker. We check during the assessment that it suits the intended uses.

#### Does my data leave the server?

In the on-premises mode, documents, the search index and conversations stay on your server. What can leave is listed with you before go-live: updates, licence checks and, only if you activated it in writing, an external model.

#### Who runs the server afterwards?

Nexora AI does, with you, as the contract provides. In the on-premises mode, we access your server only if you authorize it in writing, for a specific task and a limited time.

#### Can we change mode later?

Yes. Export of your documents, configurations and workflows is provided for in the contract; a change of mode is then planned as a project.

#### How much does it cost?

There is no public price yet for AI server installation. Two things are paid for. Support (assessment, installation, configuration): a written estimate follows the assessment and says what is included and what is not. Use of the platform: in credits, because anything that calls an AI model uses them; a plan gives you credits and storage every month, otherwise you top up. Platform prices will appear on the Pricing page once they are published.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : étude de déploiement. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Let's size before buying.

Describe your uses. We will tell you which mode fits, what hardware it would take if any, and where to start.

[Request a deployment study](/en/contact/?sujet=etude-deploiement) · [See the on-premises mode](/en/deployment/on-premises/)
