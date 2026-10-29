# Supplier invoice extraction — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-factures-fournisseurs.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-factures-fournisseurs` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/workflow-templates/supplier-invoice-extraction/` · slug : `workflow-templates/supplier-invoice-extraction`
- Titre SEO (46 caractères) : Supplier invoice extraction: workflow template
- Description SEO (158 caractères) : Supplier invoice extraction: a WorkStudio starter template for small business. Starting fields, steps, human approval and what to adapt for Quebec before use.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Extraction d'une facture fournisseur », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Template · Finance and documents**

# Supplier invoice extraction.

The Supplier invoice extraction template extracts an invoice's fields as JSON (supplier, number, date, totals, tax, due date), with null for any missing value, then checks the totals are consistent and concludes "COHÉRENTE" or "À VÉRIFIER".

[See all templates](/en/workflow-templates/) · [Request a demo](/en/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

The Supplier invoice extraction template extracts an invoice's fields as JSON (supplier, number, date, totals, tax, due date), with null for any missing value, then checks the totals are consistent and concludes "COHÉRENTE" or "À VÉRIFIER". The invoice is uploaded as a PDF or image file.

A workflow template is an automated sequence of tasks, provided as a starting point in WorkStudio and to be adapted to the business before it is deployed.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## What you provide.

Each starting field is pre-filled with an example value so a first run needs no typing, except email addresses and files.

- **The invoice.** Invoice uploaded as a file (PDF or image).
- **The text.** Invoice text, as it appears in the file.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## The steps.

#### Extract the fields.

An agent answers in JSON only: supplier, number, date, totals, tax and due date; null for any value absent from the text.

#### Check consistency.

A second agent shows the calculation, checks the due date and the absence of null values, and lists anomalies.

#### Review.

You read the text produced, correct it if needed, then use or send it yourself: the template sends nothing.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## To adapt before use.

#### What to adapt here.

The check knows French VAT rates. For Quebec, adapt the instruction to GST and QST, and to how your suppliers present their taxes.

#### What applies to all.

The templates are written for a French small business. Taxes, currency, vocabulary and formats are adapted to your business and to Quebec before any use.

#### Nothing is sent.

The template produces text to review. Only five templates in the collection send an email, and each waits first for a person's approval.

### Bloc 6 — FAQ (`block_faq`)

*Questions de la fiche : envoi, point propre au gabarit, adaptation au Québec. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Your questions about this template.

#### Does this template send anything for me?

No. It produces text to review; you use or send it yourself. Only five templates in the collection send an email, and each waits first for a person's approval.

#### Does the template read the PDF itself?

The file is uploaded to the template, and the invoice text is also requested. Reading scanned PDFs and images needs a document-reading model, to plan according to the installation.

#### Does it suit Quebec as is?

Not as is. The starter templates are written for a French small business and do not follow Quebec tax rules: taxes, formats and vocabulary are adapted to your business.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## See it at work.

A demonstration on fictional data, to see what the template prepares and where a person stays in control.

[Request a demo](/en/contact/?sujet=demonstration) · [All templates](/en/workflow-templates/)
