# Meeting minutes — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gabarit-compte-rendu.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gabarit-compte-rendu` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/workflow-templates/meeting-minutes/` · slug : `workflow-templates/meeting-minutes`
- Titre SEO (34 caractères) : Meeting minutes: workflow template
- Description SEO (146 caractères) : Meeting minutes: a WorkStudio starter template for small business. Starting fields, steps, human approval and what to adapt for Quebec before use.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la fiche : ce que fait le gabarit « Compte rendu de réunion », dit sans détour. · Affirmations : CL-M01, CL-M02, CL-111*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Template · Emails and meetings**

# Meeting minutes.

The Meeting minutes template transcribes the audio recording while separating the speakers, writes the minutes (participants, points discussed, decisions, action table, open questions), submits them to a person and emails them to the recipient you name only after that person approves.

[See all templates](/en/workflow-templates/) · [Request a demo](/en/contact/?sujet=demonstration)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que fait le gabarit, en trois lignes. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

The Meeting minutes template transcribes the audio recording while separating the speakers, writes the minutes (participants, points discussed, decisions, action table, open questions), submits them to a person and emails them to the recipient you name only after that person approves.

A workflow template is an automated sequence of tasks, provided as a starting point in WorkStudio and to be adapted to the business before it is deployed.

### Bloc 3 — Section (`block_section`)

*Les champs de départ du gabarit, tels que déclarés dans WorkStudio. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=champs`

## What you provide.

Each starting field is pre-filled with an example value so a first run needs no typing, except email addresses and files.

- **The recording.** Audio recording of the meeting (file).
- **The participants.** Participants, with their role (optional).
- **The recipient.** Email address to send the minutes to.

### Bloc 4 — Cartes (`block_cards`)

*Les étapes du flux : ce que fait chaque agent, où une personne intervient. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21*

Réglages : `columns=3`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## The steps.

#### Transcribe.

The recording is transcribed while separating the voices: "Intervenant 1", "Intervenant 2"… These labels mean voices, not names.

#### Write the minutes.

An agent matches names mentioned to the speakers when the text allows, then writes participants, points discussed, decisions, action table and open questions.

#### Approve, then send.

A person reads the minutes and approves or refuses them. Only approval sends the email.

### Bloc 5 — Cartes (`block_cards`)

*Ce qui s'adapte avant l'usage : le propre du gabarit, le commun, l'envoi. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=adapter`

## To adapt before use.

#### What to adapt here.

Matching names to voices is not infallible: read before approving. Reading speech needs a transcription model, hence hardware if you are on premises. Set up the mail server.

#### What applies to all.

The templates are written for a French small business. Taxes, currency, vocabulary and formats are adapted to your business and to Quebec before any use.

#### A person approves before sending.

The flow stops for a person's approval and sends the email only if they approve. The mail server (host, port, account, sender) is left to fill in.

### Bloc 6 — FAQ (`block_faq`)

*Questions de la fiche : envoi, point propre au gabarit, adaptation au Québec. · Affirmations : CL-M01, CL-M02, CL-111, CL-M04, CL-M03, CL-M05, CL-102, CL-21*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Your questions about this template.

#### Can it send an email without my approval?

No. The flow stops for a person's approval and sends the email only if they approve. The mail server must be filled in.

#### Does the template identify who is speaking by name?

No, it tells numbered voices apart. It matches names mentioned in the discussion to the speakers when the text allows, helped by the participant list you provide.

#### Does it suit Quebec as is?

Not as is. The starter templates are written for a French small business and do not follow Quebec tax rules: taxes, formats and vocabulary are adapted to your business.

### Bloc 7 — Appel à l'action (`block_cta`)

*Appel à l'action : démonstration sur données fictives. · Affirmations : CL-61, CL-80*

Réglages : `tone=sombre`

## See it at work.

A demonstration on fictional data, to see what the template prepares and where a person stays in control.

[Request a demo](/en/contact/?sujet=demonstration) · [All templates](/en/workflow-templates/)
