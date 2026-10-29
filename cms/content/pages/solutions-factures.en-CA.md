# Invoices — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-factures.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-factures` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/solutions/invoices/` · slug : `solutions/invoices`
- Titre SEO (38 caractères) : Invoice processing automation for SMEs
- Description SEO (153 caractères) : The system reads your supplier invoices (PDF, scan, photo), extracts the amounts, flags discrepancies and files everything in a table. A person approves.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution factures : fini de retaper, les écarts remontent. · Affirmations : CL-101, CL-121*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Invoices**

# Stop retyping your invoices.

The system reads each invoice, PDF, scan or photo, extracts the fields you have defined and shows you what looks doubtful first. Payment and accounting stay in a person's hands.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See all solutions](/en/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : exemple construit d'un atelier d'usinage qui reçoit des formats variés. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=probleme`

## When every invoice arrives differently.

Imagine a machining shop. A metal supplier sends a PDF by email, a carrier a photo taken at the dock, another a crooked scan. Someone retypes the numbers, dates and amounts, then works out who has to approve.

The example is constructed to illustrate the principle; it is not a customer's result.

- **Assorted formats.** Digital PDF, scan, photo: each is read differently.
- **Typing errors.** A transposed amount slips through to approval, even to payment.
- **A queue nobody can see.** No one can tell at a glance what is received, checked, approved.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : lecture, extraction, vérification, rangement. · Affirmations : CL-101, CL-121, CL-21, CL-P01, CL-P02*

Réglages : `columns=4`, `tone=sable`, `layout=etapes`, `anchor_id=systeme`

## One invoice in, one row out.

The steps are those of a WorkStudio workflow (an automated sequence of tasks), built without writing code. WorkStudio puts AI reading of scanned documents within your reach, with the human oversight it needs.

#### It reads.

A digital PDF is read directly; an image or a scanned PDF goes through a document-reading model. Scans are read more slowly.

#### It extracts.

You define the fields (number, date, supplier, amounts, taxes, project number); the system looks for them in each document.

#### It checks.

A missing required field, an unreadable value or a total that does not add up: the document is marked "to review", with the reason.

#### It files.

One row per document in a table, ready for what comes next. What comes next waits for a person.

### Bloc 4 — Cartes (`block_cards`)

*Ce que reçoit l'équipe : mosaïque de bénéfices concrets (bento). · Affirmations : CL-101, CL-121*

Réglages : `columns=2`, `tone=sombre`, `layout=bento`, `anchor_id=equipe`

## A table instead of a pile.

The team opens a table, not a pile of email. Safe documents go by quickly; doubtful ones rise to the top.

#### A table of documents.

One row per invoice, with the fields you have chosen.

#### A "to review" flag.

With the reason: missing field, unreadable value, total that does not add up.

#### A simple conclusion.

The starter template "supplier invoice check" concludes "to pay" or "to review".

#### The text as read, kept.

The document as it was read is kept, so you can compare it with the original.

### Bloc 5 — Section (`block_section`)

*Bénéfice attendu, sans chiffre ; lien diagnostic. · Affirmations : CL-14, CL-09*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=benefice`

## Errors caught before payment.

Less retyping, errors caught before approval rather than after payment, a clear view of what is left to process. We announce no accuracy percentage and no time saved: reading quality depends on your documents and is measured during a pilot, on your own invoices.

[Book a diagnosis](/en/contact/?sujet=diagnostic) to put the reading to the test on your documents.

### Bloc 6 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, y compris les limites ; carte données avec lien Vos données. · Affirmations : CL-128, CL-21, CL-125, CL-M15, CL-06, CL-E01, CL-E02, CL-E03, CL-E04, CL-E05*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## No payment without a person.

#### No automatic payment.

The system pays nothing. Approval and payment stay with a person.

#### No entry without approval.

Writing to your accounting software goes through a connector to be qualified, after approval. Not all software connects in the same way.

#### Your fields, your taxes.

The document-reading templates are not yet adapted to Quebec taxes (VAT, before tax, tax included): your fields (GST, QST, project number) are defined with us, then checked on your documents.

#### A person reviews the doubts.

Anything marked "to review" passes under someone's eyes.

#### Your data stays yours.

On your server or with us, in Quebec: never used to train a model, never sold. A reading model on your server keeps the documents with you; an external service comes in only when you explicitly activate it, in writing.

→ [Read our commitments](/en/your-data/)

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à la solution factures. · Affirmations : CL-101, CL-125, CL-132*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Invoice automation: your questions.

#### Can it read crooked scanned invoices?

It reads images and scanned PDFs with a document-reading model, more slowly than a digital PDF. Quality depends on how sharp the scan is; anything doubtful is marked "to review".

#### Does it connect to my accounting software?

Maybe: it depends on the software. We check during the diagnosis. Without a connection, the table can serve as the basis for faster data entry, approved by your accountant.

#### What about Quebec taxes?

They are not handled by default. We define with you the tax fields to extract and the checks to run, then put them to the test on your documents.

#### Can it also handle quotes and expense reports?

Starter templates exist for quotes, purchase orders and expense reports. They can be customized like the invoice one.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : démonstration ; partenaire d'ici. · Affirmations : CL-01, CL-04*

Réglages : `tone=sombre`

## Watch your invoices read themselves.

We prepare a demonstration on fictional invoices, then we talk about your documents, your fields and your accounting. A partner from here installs, runs and trains with you.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See accounting](/en/solutions/accounting/)
