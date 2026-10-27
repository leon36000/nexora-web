# Invoices — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-factures.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-factures` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/solutions/invoices/` · slug : `solutions/invoices`
- Titre SEO (47 caractères) : Automated invoice processing for small business
- Description SEO (160 caractères) : A system reads your supplier invoices, extracts the amounts, flags what does not add up and files everything in a table. A person approves before anything else.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution factures. · Affirmations : CL-101, CL-121*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Invoices**

# Invoices read. Discrepancies flagged.

The system reads your suppliers' invoices, extracts the fields you defined and shows you what looks doubtful first. Payment and bookkeeping stay in a person's hands.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See all solutions](/en/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : exemple d'un atelier qui reçoit des formats variés. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=probleme`

## The same entry, twice.

Picture a machine shop. A metal supplier emails a PDF, a carrier sends a photo taken on the dock, another sends an invoice scanned crooked. Someone retypes the numbers, dates and amounts, then looks for who must approve.

The example is constructed to illustrate the principle; it is not a customer's result.

- **Assorted formats.** Digital PDF, scan, photo: each reads differently.
- **Typing errors.** A transposed amount makes it through approval, even payment.
- **A queue nobody can see.** No one can tell at a glance what is received, checked, approved.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : lecture, extraction, vérification, rangement. · Affirmations : CL-101, CL-121, CL-21*

Réglages : `columns=4`, `tone=sable`, `layout=etapes`, `anchor_id=systeme`

## What the system does.

The steps are those of a WorkStudio workflow: a file goes in, a table row comes out.

#### It reads.

A digital PDF is read directly; an image or a scanned PDF goes through a document-reading model. Scans read more slowly.

#### It extracts.

You define the fields (number, date, supplier, amounts, taxes, project number); the system looks for them in each document.

#### It checks.

A missing required field, an unreadable value or a total that does not add up: the document is marked “to verify”, with the reason.

#### It files.

One row per document in a table, ready for what follows. What follows waits for a person.

### Bloc 4 — Section (`block_section`)

*Ce que reçoit l'équipe. · Affirmations : CL-101, CL-121*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=equipe`

## What your team receives.

The team opens a table, not a pile of emails. Reliable documents scan quickly; doubtful ones rise to the top.

- **A table of documents.** One row per invoice, with the fields you chose.
- **A “to verify” flag.** With the reason: missing field, unreadable value, total that does not add up.
- **A simple conclusion.** The starter template “supplier invoice check” concludes “to pay” or “to verify”.
- **The text as read.** The document as it was read is kept, so you can compare with the original.

### Bloc 5 — Section (`block_section`)

*Bénéfice attendu, sans chiffre. · Affirmations : CL-14, CL-09*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=benefice`

## The expected benefit.

Less retyping, errors caught before approval rather than after payment, a clear view of what remains to process. We announce no accuracy percentage and no time saved: reading quality depends on your documents and is measured during a pilot, on your own invoices.

### Bloc 6 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, y compris les limites. · Affirmations : CL-128, CL-21, CL-125, CL-111, CL-06*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## What stays under your control.

#### No automatic payment.

The system pays nothing. Approval and payment stay with a person.

#### No posting without approval.

Posting to your accounting software goes through a connector to be qualified, after approval. Not all software connects the same way.

#### Your fields, your taxes.

The starter templates are general and do not follow Quebec tax rules: your fields (GST, QST, project number) are defined with us, then checked on your documents.

#### A person reviews the doubts.

Everything marked “to verify” goes under someone's eyes.

#### Where documents are read is a choice.

A reading model on your server keeps documents with you; an external service is a written, disclosed choice.

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à la solution factures. · Affirmations : CL-101, CL-125, CL-132*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Invoices: your questions.

#### Does it read invoices scanned crooked?

It reads images and scanned PDFs with a document-reading model, more slowly than a digital PDF. Quality depends on how clear the scan is; anything doubtful is marked “to verify”.

#### Does it connect to my accounting software?

Possibly: it depends on the software. We check during the diagnosis. Without a connection, the table can serve as the basis for faster entry, approved by your accountant.

#### What about Quebec taxes?

They are not handled by default. We define with you the tax fields to extract and the checks to run, then test them on your documents.

#### Can it also handle quotes and expense reports?

Starter templates exist for quotes, purchase orders and expense reports. They are customized the same way as the invoice one.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : démonstration. · Affirmations : CL-01*

Réglages : `tone=sombre`

## See your invoices read.

We prepare a demonstration on fictional invoices, then we talk about your documents, your fields and your bookkeeping.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See accounting](/en/solutions/accounting/)
