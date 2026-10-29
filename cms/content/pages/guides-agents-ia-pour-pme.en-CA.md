# AI agents for small business — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-agents-ia-pour-pme.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-agents-ia-pour-pme` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/guides/ai-agents-small-business/` · slug : `guides/ai-agents-small-business`
- Titre SEO (47 caractères) : What is an AI agent? A guide for small business
- Description SEO (155 caractères) : An AI agent follows your instructions, uses the tools and documents you allow, cites its sources and acts under human approval. Definitions and safeguards.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : définir un agent IA simplement, avec la validation humaine dès le sous-titre. · Affirmations : CL-90, CL-93, CL-21*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · AI agents**

# What is an AI agent? A clear answer.

An agent is a software assistant: it follows your instructions, uses the tools and documents you allow, cites its sources and can act. A person approves before anything goes out.

[See WorkStudio](/en/workstudio/) · [Request a demonstration](/en/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : la définition d'un agent, en un paragraphe, et ses quatre composantes. · Affirmations : CL-90, CL-20, CL-93*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

An AI agent is a software assistant that carries out a task with the tools you allow. It follows your instructions, uses the tools and documents you open to it, cites its sources and can be published in a chat. In WorkStudio, each action tool by default asks for a person's approval before writing or deleting.

A language model on its own produces text. An agent combines a model, instructions, tools and documents to see a task through.

- **A model.** The engine that reads and produces text.
- **Instructions.** What you ask it to do, and how.
- **Tools.** What it is allowed to use.
- **Documents.** What it relies on to answer.

### Bloc 3 — Cartes (`block_cards`)

*Trois mots qu'on confond : modèle, agent, flux de travaux. · Affirmations : CL-90, CL-91, CL-21*

Réglages : `columns=3`, `tone=sable`, `layout=grille`, `anchor_id=vocabulaire`

## Model, agent, workflow.

Three words people often confuse.

#### A model.

The engine that reads and produces text. It answers; it does nothing else.

#### An agent.

A model, instructions, tools and allowed documents. It follows your instructions and cites its sources.

#### A workflow.

An automated chain of tasks. It can stop for a person's approval, who approves or refuses before the action goes out.

### Bloc 4 — Section (`block_section`)

*Ce qu'un agent fait, concrètement : quatre exemples construits à partir de ce que WorkStudio permet, étiquetés comme exemples. · Affirmations : CL-120, CL-101, CL-122, CL-102, CL-11*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=exemples`

## What an agent does, concretely.

These examples are built from what WorkStudio allows; they are not results measured at clients.

- **It sorts your email.** When an email arrives, it classifies it (category, urgency, summary), drafts a reply and sends only after a person's approval.
- **It reads paper.** It reads scanned PDFs and images, extracts the fields of an invoice, quote or expense report, and marks what is missing, illegible or inconsistent as "to check".
- **It answers from your documents.** It answers customers' questions in a chat from the documents opened to it, cites its sources and, when it has no answer, offers a callback by a person.
- **It transcribes a meeting.** It transcribes audio recordings, with the speakers, and reads a text aloud. It does not answer the phone.

### Bloc 5 — Cartes (`block_cards`)

*Les garde-fous un par un : validation, traces, masquage, outils désactivés par défaut, plafonds. · Affirmations : CL-93, CL-21, CL-96, CL-24, CL-105, CL-109, CL-22, CL-106*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=garde-fous`

## The safeguards, one by one.

#### Human approval.

Each action tool by default asks for a person's approval before writing or deleting; with no answer, the action does not happen.

#### Traces.

Each model call leaves a viewable trace (steps, duration, tokens, model); personal information can be masked in it.

#### Information masked.

A policy per workspace decides whether personal information is allowed, masked or refused before a call to a model outside the instance.

#### Tools off by default.

An agent's web search is only available if an administrator turns it on; the code interpreter is off by default.

#### Caps and log.

Organizations, roles, an audit log and monthly consumption caps.

### Bloc 6 — Section (`block_section`)

*Sans code : comment on construit, avec le Copilote, un flux relu avant création. · Affirmations : CL-92, CL-P02, CL-91*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=sans-code`

## No code: how it works.

You describe the need in French; the Copilot, the building assistant, prepares a workflow that you review, test step by step, then deploy. Each deployment is a version you can return to. Starter templates for small businesses are provided. See [WorkStudio](/en/workstudio/).

The starter models are described one by one in the [workflow templates](/en/workflow-templates/).

### Bloc 7 — Cartes (`block_cards`)

*Ce qu'un agent ne fait pas : téléphone, rapprochement bancaire, règles fiscales, avis juridique. · Affirmations : CL-124, CL-126, CL-111, CL-129*

Réglages : `columns=2`, `tone=clair`, `layout=modules`, `anchor_id=limites`

## What an agent does not do.

#### It does not answer the phone.

No phone-answering service is delivered to date.

#### It does not do bank reconciliation.

It is not delivered in WorkStudio; it can be studied as custom work, from exported statements, with no bank connection.

#### It does not know your tax rules.

The starter templates are general; taxes, formats and vocabulary are adapted to the business.

#### It does not replace a lawyer.

A starter template summarizes a contract; it does not replace a lawyer.

### Bloc 8 — FAQ (`block_faq`)

*Questions du guide : agent et agent conversationnel, envoi autonome, lieu d'exécution, mesure, coût. · Affirmations : CL-90, CL-122, CL-93, CL-26, CL-02, CL-97, CL-80, CL-106*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## AI agents: your questions.

#### Is an AI agent the same as a chatbot?

Not exactly. A chatbot converses. An agent can also use tools and documents to carry out a task, with the rights you give it.

#### Can an agent send an email on its own?

Not by default. Each action tool asks for a person's approval before writing or deleting; with no answer, the action does not happen. In the workflows Nexora AI configures, any action that commits the business goes through an approval, unless the client decides otherwise in writing.

#### Where do agents run?

WorkStudio installs with one command on a Docker server, a tool that packages software so it installs the same way everywhere. The system is installed on your premises or hosted in Nexora AI's infrastructure, located in Quebec.

#### How do I know whether an agent answers well?

Test sets and judges measure whether an agent, an instruction or a model answers well, and compare two versions.

#### How much does an agent cost?

The cost depends on the case; a written estimate follows a diagnosis. Consumption is measured in tokens, the unit of text a model processes, with monthly caps.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : voir un agent à l'œuvre, sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## See an agent at work.

A demonstration on fictitious data, to see what an agent prepares and where it stops before you approve.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See the solutions](/en/solutions/)
