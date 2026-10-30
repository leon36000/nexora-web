# Appointments — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-rendez-vous.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-rendez-vous` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/solutions/appointments/` · slug : `solutions/appointments`
- Titre SEO (42 caractères) : AI appointment booking that fills your day
- Description SEO (152 caractères) : The system receives appointment requests, proposes slots from your calendar, reminds your customers and releases cancellations. No slot is ever made up.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution rendez-vous : un agenda qui se remplit, sans disponibilité inventée. · Affirmations : CL-123, CL-124*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Appointments**

# A calendar that fills itself.

The system receives appointment requests, proposes slots checked against your calendar and reminds your customers, even when the office is closed. It never confirms an availability it has not checked.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See all solutions](/en/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : exemple construit d'un petit cabinet qui perd des créneaux. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=probleme`

## Slots that slip away.

A small practice receives appointment requests by email and by form, often in the evening, after closing. The receptionist confirms by hand the next day, sends reminders by hand, and a last-minute cancellation leaves a hole in the practitioner's day.

This example is constructed to illustrate the principle; it is not a customer's result.

- **Requests that wait.** They arrive in the evening; the reply goes out the next day, sometimes too late.
- **Forgotten reminders.** Every oversight is a risk of a no-show.
- **Late cancellations.** The freed slot does not get filled.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système, selon l'agenda connecté : de la demande au rappel. · Affirmations : CL-123, CL-103, CL-91, CL-21, CL-85, CL-P02*

Réglages : `columns=4`, `tone=clair`, `layout=etapes`, `anchor_id=systeme`

## From request to reminder.

It all rests on a calendar genuinely connected to WorkStudio. Without that connection, the system is limited to recording a slot request, confirming nothing. The workflow (an automated sequence of tasks) is built without writing code.

#### It receives.

A request arrives by email or form. The system pulls out the need and the preferences.

#### It proposes.

It looks for open slots in the connected calendar and prepares a reply with two or three options.

#### It confirms after checking.

The event is created only once availability is verified in the calendar, and after a person's approval if you decide so.

#### It reminds.

A scheduled workflow sends a reminder before the appointment and handles cancellations.

### Bloc 4 — Cartes (`block_cards`)

*Ce que reçoit l'équipe : mosaïque de bénéfices (bento), dont la transcription d'un message vocal et l'absence de téléphonie. · Affirmations : CL-123, CL-124, CL-102*

Réglages : `columns=2`, `tone=sombre`, `layout=bento`, `anchor_id=equipe`

## Appointments ready, reminders sent.

A calendar that fills while the team works, reminders sent without anyone thinking about it, cancellations handled.

#### Requests received.

A clear queue: to process, proposed, confirmed.

#### Reminders prepared.

The wording is yours, approved once.

#### Cancellations in plain sight.

The freed slot shows up in the calendar right away.

#### Voice messages, transcribed.

A voice message dropped in as a recording can be transcribed. The phone itself is not included: no call-answering service is delivered today, and live telephony is checked separately.

### Bloc 5 — Section (`block_section`)

*Bénéfice attendu, sans chiffre ; lien diagnostic ; lien vers Croissance (être trouvé, accès anticipé). · Affirmations : CL-14, CL-09, CL-123, CL-G01*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=benefice`

## Fewer lost slots.

The expected benefit: fewer lost slots and less time spent confirming by hand. No no-show rate or gain is announced: it is measured during a pilot, on your calendar.

[Book an assessment](/en/contact/?sujet=diagnostic) to connect your calendar.

A full calendar starts with customers who find you: [Nexora Croissance](/en/growth/), our automated marketing service, is in early access, on request.

### Bloc 6 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, y compris la prudence sur les renseignements de santé ; carte données avec lien Vos données. · Affirmations : CL-123, CL-131, CL-128, CL-06, CL-E01, CL-E02, CL-E03, CL-E04, CL-E05*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=controle`

## No slot is ever made up.

#### No calendar, no confirmation.

Without a connected calendar, the system records a slot request. It does not confirm an unverified availability.

#### You decide on confirmation.

You choose which types of appointment confirm on their own and which wait for a person.

#### Limited information.

For a health or wellness practice, we recommend limiting the system to administrative information (date, time, type of appointment). We do not qualify any clinical use.

#### The reminders are yours.

The wording, the timing and the channel are approved by you. Reminders concern an existing appointment; they are not for prospecting.

#### Your data stays yours.

The calendar and the requests stay within the agreed perimeter: on your server or with us, in Quebec. Never used to train a model, never sold; an external service comes in only when you explicitly activate it, in writing.

→ [Read our commitments](/en/your-data/)

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à la solution rendez-vous. · Affirmations : CL-123, CL-124, CL-85, CL-132, CL-10, CL-PL03, CL-T01, CL-T06, CL-T04, CL-T09, CL-12, CL-T02*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Appointments: your questions.

#### Which calendars does the solution work with?

Calendars that connect to WorkStudio through a connector. Each calendar is qualified during the assessment, and some connections require prior registration with the provider.

#### Can the system answer the phone?

No. No call-answering service is delivered today. The solution handles written requests (email, form); a voice message dropped in as a recording can be transcribed.

#### What happens when two people want the same slot?

It checks the calendar at the moment of confirming. If the slot is taken, it offers another option rather than confirming a double booking.

#### Can it be used for health care?

For administration only: request, slot, reminder. We do not qualify any clinical use and we recommend not routing health information through it.

#### How much does it cost?

There is no public price yet for appointment booking. Two things are paid for. Support (assessment, installation, configuration): a written estimate follows the assessment and says what is included and what is not. Use of the platform: in credits, because anything that calls an AI model uses them; a plan gives you credits and storage every month, otherwise you top up. Platform prices will appear on the Pricing page once they are published.

#### What uses credits here?

Each time the system calls an AI model hosted by Nexora AI to understand an appointment request or draft a reply with slots, it uses credits: one credit equals one Canadian cent of tokens at the model catalogue price. Steps that call no model use none. When none are left, the call is refused with a message pointing to top-ups and plans. The credit platform is not yet open for sale.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : démonstration ; partenaire d'ici. · Affirmations : CL-01, CL-04*

Réglages : `tone=sombre`

## Watch the calendar fill up.

We prepare a demonstration on a fictional calendar, then we talk about yours and your confirmation rules. A partner from here installs, runs and trains with you.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See customer service](/en/solutions/customer-service/)
