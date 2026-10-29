# Contract review — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-revue-contrat.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-revue-contrat` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/workflow-templates/contract-review/` · slug : `workflow-templates/contract-review`
- Titre SEO (34 caractères) : Contract review: workflow template
- Description SEO (146 caractères) : Contract review: a WorkStudio starter template for small business. Starting fields, steps, human approval and what to adapt for Quebec before use.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Revue de contrat », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Template · Finance and documents**

# Contract review.

The Contract review template flags risky clauses (a table with quoted extract and level), common missing clauses and questions to ask, according to your role and priorities.

[See all templates](/en/workflow-templates/) · [Request a demo](/en/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-129, CL-21*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

The Contract review template flags risky clauses (a table with quoted extract and level), common missing clauses and questions to ask, according to your role and priorities. A person approves the review; only their approval emails the summary, noting that it is not legal advice.

A workflow template is an automated sequence of tasks, provided as a starting point in WorkStudio and to be adapted to the business before it is deployed.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-129, CL-21*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## What you provide.

Each starting field is pre-filled with an example value so a first run needs no typing, except email addresses and files.

- **The contract.** Text of the contract or clauses to review.
- **The context.** Your role in the contract and your priorities.
- **The recipient.** Email address to send the summary to.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-129, CL-21*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## The steps.

#### Carry out the review.

An agent presents risky clauses (article, quoted extract, risk, level), missing clauses and questions, citing nothing but the text provided.

#### Get approval.

A person reads the review and approves or refuses it.

#### Send the summary.

If approved, the summary goes by email, subject "Revue de contrat (ne constitue pas un avis juridique)".

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-129, CL-21*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## To adapt before use.

#### What to adapt here.

The review cites only what is in the text. The "common" clauses come from an AI model, not from a Quebec lawyer: have the contract reviewed by a lawyer.

#### What applies to all.

The templates are written for a French small business. Taxes, currency, vocabulary and formats are adapted to your business and to Quebec before any use.

#### A person approves before sending.

The flow stops for a person's approval and sends the email only if they approve. The mail server (host, port, account, sender) is left to fill in.

### Bloc 6 — FAQ (`block_faq`)

*Questions de la fiche : envoi, point propre au gabarit, adaptation au Québec. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-129, CL-21*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Your questions about this template.

#### Can it send an email without my approval?

No. The flow stops for a person's approval and sends the email only if they approve. The mail server must be filled in.

#### Who receives the summary?

The email address you give in the starting field, and only after a person approves.

#### Does it suit Quebec as is?

Not as is. The starter templates are written for a French small business and do not follow Quebec tax rules: taxes, formats and vocabulary are adapted to your business.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## See it at work.

A demonstration on fictional data, to see what the template prepares and where a person stays in control.

[Request a demo](/en/contact/?sujet=demonstration) · [All templates](/en/workflow-templates/)
