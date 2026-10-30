# Documents — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-documents.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-documents` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/solutions/documents/` · slug : `solutions/documents`
- Titre SEO (35 caractères) : AI search across your own documents
- Description SEO (150 caractères) : Ask a question in plain language: the answer comes from your own documents, with its sources. Contracts, quotes, procedures: find, summarize, extract.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution documents : retrouver la bonne clause, avec sources. · Affirmations : CL-127, CL-25, CL-90*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Documents**

# The right clause. The right version. Found.

Ask your question in plain language: the answer comes from your own documents, cites its sources and sends you back to the original passage. It is a colleague who has read everything, and who shows you where.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See all solutions](/en/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : exemple construit d'un cabinet de services professionnels. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=probleme`

## Documents that hide.

A professional-services firm accumulates contracts, quotes, procedures and file notes, spread across several folders and several versions. A partner looks for the termination clause of a contract signed years ago: she digs through several folders, finds three versions and calls a colleague to learn which one was signed.

This example is constructed to illustrate the principle; it is not a customer's result.

- **Several versions.** Which one is right? The signed one, or the last one edited?
- **A memory held in heads.** When a person leaves, landmarks go with them.
- **Searches to repeat.** The same question, asked by three people, is searched for three times.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : constituer la base, répondre avec sources, résumer, extraire. · Affirmations : CL-127, CL-25, CL-90, CL-101, CL-129, CL-112, CL-P01*

Réglages : `columns=2`, `tone=clair`, `layout=modules`, `anchor_id=systeme`

## Searching your documents, in plain language.

Functions of WorkStudio, the tool that puts answers drawn from your own documents within your reach, assembled for your case.

#### A knowledge base.

You drop in documents (PDF, Word, text, web pages) or connect a synced source. They are split up and indexed (filed so they can be found quickly); by default the computing is done on the instance's server.

#### Answers with their sources.

The agent (software that completes a task using the tools you authorize) searches the base first, answers, numbers its sources and makes them clickable. A safeguard can check the answer's faithfulness to your documents.

#### Summaries and extracts.

A starter template summarizes a contract (deadlines, amounts, clauses to have reviewed). It does not replace a lawyer. Scanned documents can be read too, more slowly.

#### Structured fields.

When a document follows a known form (quote, purchase order), the system pulls out fields filed in a table.

### Bloc 4 — Cartes (`block_cards`)

*Ce que reçoit l'équipe : mosaïque de bénéfices (bento). · Affirmations : CL-127, CL-100, CL-96*

Réglages : `columns=2`, `tone=sombre`, `layout=bento`, `anchor_id=equipe`

## A memory that stays when people leave.

A way to ask your own documents a question, in WorkStudio's internal Assistant or in a chat you publish.

#### An answer and its sources.

One click opens the document or shows the passage used.

#### A company memory.

Knowledge of the files stays in the base when someone leaves.

#### Traces to review.

Questions left unanswered reveal what your documents do not say.

#### An Assistant close at hand.

The Assistant is an internal chat where the team talks to the company's published agents.

### Bloc 5 — Section (`block_section`)

*Bénéfice attendu, sans chiffre ; lien diagnostic. · Affirmations : CL-14, CL-09, CL-127*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=benefice`

## Less searching, more answers.

The expected benefit: less time spent searching, less dependence on one person's memory. No time saved is announced; the effect is measured during a pilot, on your real questions.

[Book an assessment](/en/contact/?sujet=diagnostic) to choose which documents to query first.

### Bloc 6 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, avec limites ; carte données avec lien Vos données. · Affirmations : CL-127, CL-25, CL-129, CL-109, CL-06, CL-E01, CL-E02, CL-E03, CL-E04, CL-E05*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## You choose what it reads.

#### You choose the bases.

The agent consults only the document bases you open to it. Access rights are set per base and per workspace, not document by document.

#### Where your documents are indexed.

By default, indexing is computed on the instance's server: with you, on your server; in hosted mode, in Nexora AI's infrastructure in Quebec. An external service is a written choice.

#### No legal advice.

The contract summary flags clauses to have reviewed. It replaces neither a lawyer nor a careful reading.

#### The AI can be wrong.

A model can misread a passage. The cited sources let you verify, and we check faithfulness to the documents during the pilot.

#### Web search stays a choice.

If it is turned on for an agent, its queries leave the instance: we do not turn it on for agents that handle confidential data.

#### Your data stays yours.

Never used to train a model, never sold. An external model comes in only when you explicitly activate it, in writing.

→ [Read our commitments](/en/your-data/)

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à la solution documents. · Affirmations : CL-127, CL-25, CL-101, CL-132, CL-10, CL-PL03, CL-T01, CL-T06, CL-T04, CL-T09, CL-12, CL-T02*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Documents: your questions.

#### What types of files can the system read?

PDFs, Word documents, text and web pages. Scanned documents are read with a reading model, more slowly.

#### Are my documents sent elsewhere?

By default, no: indexing is computed on the instance's server. If you choose an external model to answer, the excerpts used are passed to it; we tell you beforehand, in writing.

#### Does the agent say so when it finds nothing?

That is the goal of the configuration, and we check it during the pilot on your documents. A faithfulness guardrail reduces unsupported answers; it does not eliminate them.

#### Can we limit what each person sees?

We limit what each agent consults, knowledge base by knowledge base. Document-by-document access rights are not announced today.

#### How much does it cost?

There is no public price yet for searching your documents. Two things are paid for. Support (assessment, installation, configuration): a written estimate follows the assessment and says what is included and what is not. Use of the platform: in credits, because anything that calls an AI model uses them; a plan gives you credits and storage every month, otherwise you top up. Platform prices will appear on the Pricing page once they are published.

#### What uses credits here?

Each time the system calls an AI model hosted by Nexora AI to answer a question about your documents, summarize a contract or read a scanned document, it uses credits: one credit equals one Canadian cent of tokens at the model catalogue price. Steps that call no model use none. When none are left, the call is refused with a message pointing to top-ups and plans. The credit platform is not yet open for sale.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : démonstration ; partenaire d'ici. · Affirmations : CL-01, CL-04*

Réglages : `tone=sombre`

## Question your documents.

We prepare a demonstration on fictional documents, then we talk about yours and where they must stay. A partner from here installs, runs and trains with you.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See customer service](/en/solutions/customer-service/)
