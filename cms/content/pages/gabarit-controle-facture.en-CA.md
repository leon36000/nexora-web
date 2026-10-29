# Supplier invoice check — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-controle-facture.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-controle-facture` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/workflow-templates/supplier-invoice-check/` · slug : `workflow-templates/supplier-invoice-check`
- Titre SEO (41 caractères) : Supplier invoice check: workflow template
- Description SEO (160 caractères) : Supplier invoice check: a WorkStudio starter template for small business. Starting fields, steps, human approval and what is left to validate with your adviser.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Contrôle d'une facture fournisseur », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111, CL-M12, CL-M13*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Template · Finance and documents**

# Supplier invoice check.

The Supplier invoice check template extracts the invoice data (supplier, number, date, subtotal, GST, QST, total, registration numbers and NEQ), then checks the calculations (GST at 5%, QST at 9.975% of the subtotal) and the format of the numbers, and concludes "À PAYER" or "À VÉRIFIER".

[See all templates](/en/workflow-templates/) · [Request a demo](/en/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

The Supplier invoice check template extracts the invoice data (supplier, number, date, subtotal, GST, QST, total, registration numbers and NEQ), then checks the calculations (GST at 5%, QST at 9.975% of the subtotal) and the format of the numbers, and concludes "À PAYER" or "À VÉRIFIER".

A workflow template is an automated sequence of tasks, provided as a starting point in WorkStudio and to be adapted to the business before it is deployed.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## What you provide.

Each starting field is pre-filled with an example value so a first run needs no typing, except email addresses and files.

- **The invoice.** Invoice text.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## The steps.

#### Extract the data.

An agent answers in JSON with the keys fournisseur, numero, date, sous_total (before tax), tps, tvq, total, numero_tps, numero_tvq and neq; a value is null if absent.

#### Check.

A second agent checks that the subtotal, GST and QST add up to the total to within a cent, that GST is 5% of the subtotal and QST 9.975% of the subtotal, never of the GST, and that the GST registration number (nine digits, RT, four digits) and QST registration number (ten digits, TQ, four digits) are present. A small unregistered supplier is flagged "to check" without being declared at fault; anomalies are listed.

#### Review.

You read the text produced, correct it if needed, then use or send it yourself: the template sends nothing.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## To adapt before use.

#### What to adapt here.

The check is for a Quebec supplier: federal GST and QST only, with the RT and TQ forms. It checks the form of the numbers, not whether they exist with Revenu Québec or the Canada Revenue Agency. The numbers in the examples are fictional.

#### What applies to all.

The templates are written for a Quebec small business: amounts in Canadian dollars, GST and QST wherever a tax applies, and Quebec business vocabulary. They do not guarantee any tax or legal compliance: the examples are fictional, and your accountant or adviser validates the result before use.

#### Nothing is sent.

The template produces text to review. Only five templates in the collection send an email, and each waits first for a person's approval.

### Bloc 6 — FAQ (`block_faq`)

*Questions de la fiche : envoi, point propre au gabarit, adaptation au Québec. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-101, CL-M12, CL-M13*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Your questions about this template.

#### Does this template send anything for me?

No. It produces text to review; you use or send it yourself. Only five templates in the collection send an email, and each waits first for a person's approval.

#### Does the template pay the invoice?

No. It concludes "À PAYER" or "À VÉRIFIER" with the list of anomalies. Payment and the decision remain with a person.

#### Does it suit my suppliers' invoices?

It is written for a Quebec supplier. The examples and numbers are fictional, and an agent does the checking: it does not replace your accountant. Other provinces' taxes are not covered.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## See it at work.

A demonstration on fictional data, to see what the template prepares and where a person stays in control.

[Request a demo](/en/contact/?sujet=demonstration) · [All templates](/en/workflow-templates/)
