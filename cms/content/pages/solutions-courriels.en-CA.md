# Email — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-courriels.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-courriels` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/solutions/email/` · slug : `solutions/email`
- Titre SEO (36 caractères) : AI email sorting and drafts for SMEs
- Description SEO (148 caractères) : The system sorts your email, summarizes each request and drafts a reply from your documents. Your team reviews and approves before anything is sent.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution courriels : une boîte déjà rangée, une validation avant tout envoi. · Affirmations : CL-120, CL-21*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Email**

# Your email arrives already sorted.

The system reads each message, ranks it by urgency, summarizes it in one sentence and drafts a reply based on your documents. Nothing goes out without your team's go-ahead.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See all solutions](/en/solutions/)

### Bloc 2 — Section (`block_section`)

*Le problème, avec un exemple construit (entreprise de rénovation). · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=probleme`

## The inbox overflows, the urgent waits.

Take a renovation company. Day after day, price requests, questions about a job's progress, supplier invoices and unrelated messages land in the same inbox. The coordinator opens everything, sorts, digs for the file history, writes. The message from a customer whose bathroom job is on hold waits behind three others.

This example is constructed to illustrate the principle; it is not a customer's result.

- **Sorting.** Telling a price request from an invoice, and the urgent from what can wait.
- **Searching.** Finding the latest quote, the clause, the file number.
- **Writing.** Replying politely and completely, in the house style.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : quatre étapes, la dernière attend une personne. · Affirmations : CL-120, CL-103, CL-95, CL-21, CL-85, CL-P02*

Réglages : `columns=4`, `tone=sable`, `layout=etapes`, `anchor_id=systeme`

## From email received to reply approved.

The workflow (an automated sequence of tasks) reacts when an email lands in the mailbox connected to WorkStudio. It is built without writing code, and every step is visible and editable.

#### It spots.

A new email triggers the workflow. Only the mailboxes you choose to connect are read.

#### It classifies.

Category (price request, invoice, complaint, other), urgency and a one-sentence summary.

#### It drafts.

A draft reply, written to your style instructions and from your documents.

#### It waits.

A person reviews, edits, approves or declines. Nothing leaves before that.

### Bloc 4 — Cartes (`block_cards`)

*Ce que reçoit l'équipe : bénéfices concrets en mosaïque (bento). · Affirmations : CL-120, CL-96, CL-95*

Réglages : `columns=2`, `tone=sombre`, `layout=bento`, `anchor_id=equipe`

## A team that reviews instead of writing.

The team no longer works in the chaos of an inbox: it receives items that are ready to review.

#### A sorted queue.

Email arrives classified by category and urgency: the urgent comes first.

#### A summary per message.

One sentence to understand without reading it all.

#### A draft per reply.

To correct, not to write. Style comes from instructions you version: the production instruction and the test one stay separate.

#### A trace of every draft.

Which model, which request, which answer: all of it can be consulted.

### Bloc 5 — Section (`block_section`)

*Bénéfice attendu, sans chiffre ; lien diagnostic. · Affirmations : CL-14, CL-09*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=benefice`

## What you gain.

Less sorting by hand, urgent items seen sooner, replies that are more consistent from one person to the next. No percentage and no time saved is announced: they depend on your volume and your rules, and are measured during a pilot, on your own email.

[Book an assessment](/en/contact/?sujet=diagnostic) to see what it would look like for you.

### Bloc 6 — Cartes (`block_cards`)

*Ce qui reste sous contrôle ; carte données (CL-E01 à E05) avec lien Vos données. · Affirmations : CL-128, CL-21, CL-06, CL-23, CL-103, CL-E01, CL-E02, CL-E03, CL-E04, CL-E05*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## Nothing leaves without your go-ahead.

#### A person approves every send.

A person's approval comes before any send, unless you decide otherwise in writing.

#### You write the sorting rules.

The categories, the urgency thresholds and the cases never to handle automatically are yours.

#### You choose the mailboxes.

Each connection belongs to a workspace and can be removed.

#### Your data stays yours.

On your server or with us, in Quebec: never used to train a model, never sold. An external model comes in only when you explicitly activate it, in writing, and every model shows where it runs.

→ [Read our commitments](/en/your-data/)

#### No bulk sending.

This solution replies to requests received. It is not for sending promotional email.

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à la solution courriels. · Affirmations : CL-85, CL-103, CL-112, CL-132, CL-10, CL-PL03, CL-T01, CL-T06, CL-T04, CL-T09, CL-12, CL-T02*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Your questions about email.

#### Does the solution work with my mail service?

It depends on the service. A wide catalogue of services connects to WorkStudio, but each mail service is qualified during the assessment, and some connections require an administrator to register an application with the provider first.

#### Can the AI get a draft wrong?

Yes, like a person in a hurry. That is why a human approves every send, every draft leaves a trace, and a guardrail (an automatic check) can verify that the reply stays faithful to your documents before it is shown to you. The guardrail reduces errors; it does not make them impossible.

#### Can the system reply on its own to simple cases?

Technically yes. In our setups, human approval is the rule; removing that step for a specific type of message is a written decision on your part, which we record.

#### How long does it take to go live?

No universal timeline is announced: it depends on your mail service, your rules and your documents, and is measured on a first case.

#### How much does it cost?

There is no public price yet for email sorting. Two things are paid for. Support (assessment, installation, configuration): a written estimate follows the assessment and says what is included and what is not. Use of the platform: in credits, because anything that calls an AI model uses them; a plan gives you credits and storage every month, otherwise you top up. Platform prices will appear on the Pricing page once they are published.

#### What uses credits here?

Each time the system calls an AI model hosted by Nexora AI to sort an email, summarize it or draft a reply, it uses credits: one credit equals one Canadian cent of tokens at the model catalogue price. Steps that call no model use none. When none are left, the call is refused with a message pointing to top-ups and plans. The credit platform is not yet open for sale.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : démonstration. · Affirmations : CL-01*

Réglages : `tone=sombre`

## Watch your email sort itself.

We prepare a demonstration on fictitious emails, then we talk about your mail service and your sorting rules.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See the other solutions](/en/solutions/)
