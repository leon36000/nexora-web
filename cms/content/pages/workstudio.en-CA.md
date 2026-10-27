# WorkStudio — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `workstudio.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `workstudio` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/workstudio/` · slug : `workstudio`
- Titre SEO (42 caractères) : Nexora WorkStudio: AI agents and workflows
- Description SEO (145 caractères) : Design, connect and run AI agents and workflows, with human approval, traces, evaluations and an OpenAI-compatible API. Demonstration on request.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de WorkStudio. · Affirmations : CL-20, CL-21, CL-110*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Product · WorkStudio**

# Design, connect, run. In plain language.

Nexora WorkStudio brings the design, connection and running of agents and workflows into one place. A step can wait for a person's approval before acting.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See the solutions](/en/solutions/)

### Bloc 2 — Cartes (`block_cards`)

*Scénario type : de la demande à la trace, six temps. · Affirmations : CL-90, CL-91, CL-21, CL-93, CL-96, CL-25*

Réglages : `columns=3`, `tone=sable`, `layout=etapes`, `anchor_id=scenario`

## From request to trace.

A typical scenario, in six stages. Each stage is set up in WorkStudio, without writing code.

#### 1. A request arrives.

By email, by a form, by chat, on a schedule or through an API call.

#### 2. Information is retrieved.

The agent searches the document bases you authorized.

#### 3. A proposal is prepared.

A reply draft, a record, a pre-entry line, depending on the case.

#### 4. An approval is requested.

The workflow stops on a card showing the planned action. A person approves or refuses.

#### 5. The action runs.

Once, if it was authorized. Otherwise, nothing goes out.

#### 6. Everything is traced.

Who asked what, what was answered, with which model, in how much time.

### Bloc 3 — Cartes (`block_cards`)

*Concevoir : agents, flux, Copilote, connaissances, documents et voix. · Affirmations : CL-90, CL-91, CL-92, CL-25, CL-101, CL-102, CL-110*

Réglages : `columns=3`, `tone=clair`, `layout=modules`, `anchor_id=concevoir`

## Design your agents.

“Available” means delivered in the current version and verified on Nexora AI's test server. It does not mean a customer is already using it.

#### Agents.

A specialized assistant: it follows your instructions, uses the tools and documents you authorize, cites its sources and is published in a chat.

#### Workflows.

A sequence of steps, shown as cards or on a canvas (a drawing screen), tested step by step, then deployed through chat, schedule, event or an automatic call from another service. Every deployment is a version you can return to.

#### A Copilot.

Describe an automation in plain language: it prepares a workflow you review before creating it. Starter templates for small businesses (quotes, reminders, email sorting, meeting minutes) are provided.

#### Knowledge.

A base of your documents, indexed by default on the instance's server: agents answer from it with their sources.

#### Documents read.

Reading of scanned PDFs and images, extraction of fields from an invoice, quote, purchase order or expense report, with a “to verify” flag.

#### Voice.

Transcription of audio recordings, with a meeting's speakers, and reading a text aloud. No call-answering service is included.

### Bloc 4 — Cartes (`block_cards`)

*Contrôler : validation, garde-fous, gouvernance, lieu des modèles. · Affirmations : CL-21, CL-93, CL-24, CL-105, CL-22, CL-23, CL-104, CL-112*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controler`

## Control every step.

#### Human approval.

Each action tool of an agent asks, by default, for a person's agreement before writing or deleting. With no answer, the action does not happen.

#### Safeguards.

Before going on, you can check that a format is valid, that personal information is absent or masked, or that an answer stays faithful to your knowledge. A safeguard reduces error; it does not eliminate it.

#### Data policies.

For each workspace: allow, mask or refuse sending personal information to a model outside the instance. Access groups can forbid certain models.

#### Organizations and roles.

Organizations, roles, an audit log and monthly consumption caps. Single sign-on with the usual identity providers.

#### Each model's location.

Every model shows whether it runs on your server, in Europe or at a third party. It is a documented display, not proof of residency.

### Bloc 5 — Cartes (`block_cards`)

*Mesurer et améliorer : Playground, prompts, traces, évaluations, lots, consommation. · Affirmations : CL-94, CL-95, CL-96, CL-97, CL-98, CL-106*

Réglages : `columns=3`, `tone=clair`, `layout=modules`, `anchor_id=mesurer`

## Measure and improve.

#### A Playground.

Try and compare several models side by side before choosing, with the time and tokens (the unit of text a model processes) of each answer.

#### Versioned instructions.

A reusable instruction has versions and two labels, production and test. You test a version before promoting it; every change is logged.

#### Traces.

Every model call leaves a trace: steps, duration, tokens, model. Personal information can be masked in them.

#### Evaluations.

Test sets and judges measure whether an agent, an instruction or a model answers well, and compare two versions before changing.

#### Batch processing.

Have a table of several hundred rows processed in the background: progress, cancellation, CSV export.

#### Measured consumption.

Tokens, runs and estimated carbon footprint, by model, workspace and person, with monthly caps.

### Bloc 6 — Cartes (`block_cards`)

*Brancher : Nexora Connect, API, site, Assistant, délégation, installation. · Affirmations : CL-103, CL-27, CL-107, CL-100, CL-108, CL-26*

Réglages : `columns=3`, `tone=sable`, `layout=modules`, `anchor_id=brancher`

## Connect your tools.

#### Connectors.

Nexora Connect plugs in a broad catalogue of services: mail, calendar, customer relations, storage, billing. Each connection belongs to a workspace and is qualified service by service.

#### An OpenAI-format API.

An API (the door through which other software calls a service) gives access to models and published agents, in the OpenAI format that many tools already understand: keys, quotas, consumption metering.

#### Your website.

A published agent shows up on your site with one line of code (chat bubble, frame or link). WorkStudio also installs as an application from a compatible browser.

#### An internal Assistant.

A chat where your teams talk to the company's published agents, with their history and attached files.

#### Agents that help each other.

An agent can hand a request to another published agent, with limited depth and no loops.

#### A simple installation.

One command on a Docker server (a tool that packages software), on Linux or macOS, then backup, restore and update commands.

→ [See installation](/en/services/ai-server-installation/)

### Bloc 7 — Section (`block_section`)

*Limites dites franchement. · Affirmations : CL-83, CL-109, CL-111, CL-110, CL-103*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=limites`

## The limits, stated plainly.

A product is also judged by what it writes about its limits. Here are ours, as of this page's date.

- **Verified here, not yet at a customer.** WorkStudio has been verified on Nexora AI's test server with several models hosted elsewhere than on that server. No customer result is announced.
- **Tool-using agents need a capable model.** A small local model is not always enough for agents that call tools. The model is chosen with the case.
- **Two options are off the beaten path.** The code interpreter is off by default and can only be turned on by an administrator. Web search sends its queries outside the instance: it is available only if an administrator turns it on.
- **Starter templates are general.** They do not follow Quebec tax rules: taxes, formats and vocabulary are adapted to your business.
- **Connections are qualified.** Some services require an administrator to first register an application with the provider, and a public HTTPS address for the instance.

### Bloc 8 — FAQ (`block_faq`)

*FAQ propre à WorkStudio. · Affirmations : CL-12, CL-20, CL-26, CL-06, CL-27*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## WorkStudio: your questions.

#### Can we try it with no commitment?

Self-service is not open for sale yet: accounts and payments only work in test mode. We offer a demonstration, on fictional data, then we talk about your case.

#### Do I need to know how to code?

Not for everyday use: a workflow reads as cards, is set up through forms and is tested step by step. Special cases may need code; we handle that with you.

#### Does my data leave my server?

By default, indexing of your documents is computed on the instance's server. An external model is never configured without your written agreement, and each model shows where it runs.

#### Can it integrate with our tools?

Yes, through connectors, an OpenAI-format API, or by displaying an agent on your website. Each connection is qualified.

#### How long to install?

Installation is one command on a Docker server; putting a case into service depends on your situation, with no universal timeline.

### Bloc 9 — Appel à l'action (`block_cta`)

*CTA : démonstration. · Affirmations : CL-12*

Réglages : `tone=sombre`

## See WorkStudio at work.

We prepare a demonstration on fictional data, then we talk about your first case.

[Request a demonstration](/en/contact/?sujet=demonstration) · [Read the method](/en/method/)
