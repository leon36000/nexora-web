# Incoming email triage — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-tri-emails.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-tri-emails` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/workflow-templates/incoming-email-triage/` · slug : `workflow-templates/incoming-email-triage`
- Titre SEO (40 caractères) : Incoming email triage: workflow template
- Description SEO (152 caractères) : Incoming email triage: a WorkStudio starter template for small business. Starting fields, steps, human approval and what to adapt for Quebec before use.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Tri des courriels entrants », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Template · Emails and meetings**

# Incoming email triage.

The Incoming email triage template classifies a received email (category, urgency, one-sentence summary), then prepares a draft reply suited to the category and urgency.

[See all templates](/en/workflow-templates/) · [Request a demo](/en/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

The Incoming email triage template classifies a received email (category, urgency, one-sentence summary), then prepares a draft reply suited to the category and urgency. For spam, it only answers "Aucune réponse à envoyer". It sends nothing: you review the draft and send it by hand.

A workflow template is an automated sequence of tasks, provided as a starting point in WorkStudio and to be adapted to the business before it is deployed.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## What you provide.

Each starting field is pre-filled with an example value so a first run needs no typing, except email addresses and files.

- **The email.** Email received: sender, subject and body.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## The steps.

#### Classify the email.

An agent answers in JSON: category (quote, billing, support, sales, administrative, spam or other), urgency (low, normal or high) and summary.

#### Prepare the draft.

A second agent writes a draft reply suited to the category and urgency.

#### Review.

You read the text produced, correct it if needed, then use or send it yourself: the template sends nothing.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## To adapt before use.

#### What to adapt here.

The categories are the template's: change them to reflect your handling queues. The draft is reviewed and sent by hand.

#### What applies to all.

The templates are written for a French small business. Taxes, currency, vocabulary and formats are adapted to your business and to Quebec before any use.

#### Nothing is sent.

The template produces text to review. Only five templates in the collection send an email, and each waits first for a person's approval.

### Bloc 6 — FAQ (`block_faq`)

*Questions de la fiche : envoi, point propre au gabarit, adaptation au Québec. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Your questions about this template.

#### Does this template send anything for me?

No. It produces text to review; you use or send it yourself. Only five templates in the collection send an email, and each waits first for a person's approval.

#### Does the template read my mailbox?

No. It receives the email you give it in the starting field. Connecting a mailbox is a connector matter, qualified at the diagnostic.

#### Does it suit Quebec as is?

Not as is. The starter templates are written for a French small business and do not follow Quebec tax rules: taxes, formats and vocabulary are adapted to your business.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## See it at work.

A demonstration on fictional data, to see what the template prepares and where a person stays in control.

[Request a demo](/en/contact/?sujet=demonstration) · [All templates](/en/workflow-templates/)
