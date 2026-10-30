# Customer service — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `solutions-service-client.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `solutions-service-client` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/solutions/customer-service/` · slug : `solutions/customer-service`
- Titre SEO (40 caractères) : Customer service agent on your documents
- Description SEO (140 caractères) : An agent answers your customers from your documents, cites its sources and hands off to a person with a summary. Your team stays in control.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la solution service client : le site répond, l'équipe se concentre. · Affirmations : CL-122, CL-90, CL-107*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Solution · Customer service**

# Your site answers. Your team focuses.

An agent (software that completes a task using the tools you authorize) answers your customers' questions from your documents, cites its sources and hands off to your team when it does not know.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See all solutions](/en/solutions/)

### Bloc 2 — Section (`block_section`)

*Problème : exemple construit d'un distributeur de produits de plomberie. · Affirmations : CL-11*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=probleme`

## The same questions, day after day.

Take a plumbing-supplies distributor that serves contractors. All day long, people ask about opening hours, the return policy, the documents needed to open an account, the areas served. The answers exist, in data sheets and guides, but someone has to find them and say them again, while another customer waits at the counter.

This example is constructed to illustrate the principle; it is not a customer's result.

- **An interrupted team.** Simple questions break the concentration of the people who should be handling the hard cases.
- **Uneven answers.** Depending on the person and the day, the answer changes.
- **Customers who give up.** A question without a quick answer sometimes becomes a lost order.

### Bloc 3 — Cartes (`block_cards`)

*Ce que fait le système : trois étapes, avec relais humain. · Affirmations : CL-122, CL-25, CL-90, CL-107, CL-112, CL-P01*

Réglages : `columns=3`, `tone=sombre`, `layout=modules`, `anchor_id=systeme`

## Search, answer, hand off.

The agent is published in WorkStudio, the tool that puts answers drawn from your own documents within your reach. It can live on your website (a chat bubble) or in an internal space reserved for your team.

#### It searches.

For each question, it consults the document bases you have opened to it: data sheets, guides, policies. Indexing (filing documents so they can be found quickly) is computed by default on the instance's server.

#### It answers and cites.

The answer numbers its sources, which one click opens. A safeguard (an automatic check) can verify that the answer stays faithful to your documents before it goes out.

#### It passes the request on.

If it finds nothing, it offers a callback by a person and passes the request to the team with a summary.

### Bloc 4 — Cartes (`block_cards`)

*Ce que reçoit l'équipe : mosaïque de bénéfices (bento). · Affirmations : CL-96, CL-122*

Réglages : `columns=2`, `tone=clair`, `layout=bento`, `anchor_id=equipe`

## A team that takes back control.

Simple questions get an answer without tying anyone up. The others arrive with their context.

#### Requests passed on with context.

The question, what the agent has already answered, a summary of the exchange: nobody has to ask again.

#### A log of conversations.

The agent's exchanges are traced: you can see what was answered, with which sources.

#### Traces that reveal the gaps.

Questions left unanswered show up in the traces and tell you which documents your base is missing.

#### Simple questions, settled alone.

The answers are found in your data sheets and guides, without interrupting anyone.

### Bloc 5 — Section (`block_section`)

*Bénéfice attendu, sans chiffre ; lien diagnostic ; lien vers Croissance (visibilité, accès anticipé). · Affirmations : CL-14, CL-122, CL-09, CL-G01*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=benefice`

## Fewer interruptions, more consistency.

The expected benefit: fewer interruptions, more consistent answers, customers who get what they are looking for faster. No percentage is announced; the effect is measured during a pilot, on your real questions.

[Book an assessment](/en/contact/?sujet=diagnostic) to assess your frequent questions.

Want more customers to find you, too? [Nexora Croissance](/en/growth/), our automated marketing service, is in early access: access is on request.

### Bloc 6 — Cartes (`block_cards`)

*Ce qui reste sous contrôle, avec limites : pas de téléphone, pas de promesse de disponibilité ; carte données avec lien Vos données. · Affirmations : CL-124, CL-86, CL-109, CL-93, CL-128, CL-06, CL-E01, CL-E02, CL-E03, CL-E04, CL-E05*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=controle`

## You stay in control, always.

#### You choose the documents.

The agent consults only the bases you open to it. A publicly accessible agent should never have access to confidential documents: we keep the two apart.

#### Nothing irreversible without approval.

If the agent has a tool that writes (create a file, send a message), the action waits for your team's approval when the chat is public.

#### No telephone.

No call-answering service is delivered today. The solution covers chat and written requests.

#### No availability promise.

The agent answers when the system is online. No availability level is announced today; it will be specified in the contract.

#### Web search stays off.

If it were turned on for the agent, its queries would leave the system: we do not turn it on for a public agent.

#### Your data stays yours.

On your server or with us, in Quebec: never used to train a model, never sold. An external model comes in only when you explicitly activate it, in writing.

→ [Read our commitments](/en/your-data/)

### Bloc 7 — FAQ (`block_faq`)

*FAQ propre à la solution service client. · Affirmations : CL-107, CL-122, CL-132, CL-112, CL-10, CL-PL03, CL-T01, CL-T06, CL-T04, CL-T09, CL-12, CL-T02*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Customer service: your questions.

#### How does the agent appear on my website?

One line of code adds a chat bubble, or you embed a frame in a page. You limit the list of sites allowed to display it. This requires a public HTTPS address (a secure web address anyone can reach) for your instance.

#### Can the agent make up an answer?

A model can be wrong. We reduce the risk by having it answer from your documents, cite its sources and, where needed, add a faithfulness guardrail. During the pilot we check that it says so when it finds nothing.

#### What happens if the customer wants to talk to someone?

The agent offers a callback by a person and passes the request along with a summary. Live chat with a human is not an announced feature.

#### Does the agent speak French and English?

It answers in the language of the question, to the extent the chosen model allows. We check both languages on your documents during the pilot.

#### How much does it cost?

There is no public price yet for the customer service agent. Two things are paid for. Support (assessment, installation, configuration): a written estimate follows the assessment and says what is included and what is not. Use of the platform: in credits, because anything that calls an AI model uses them; a plan gives you credits and storage every month, otherwise you top up. Platform prices will appear on the Pricing page once they are published.

#### What uses credits here?

Each time the system calls an AI model hosted by Nexora AI to answer a customer's question or check that the answer stays faithful to your documents, it uses credits: one credit equals one Canadian cent of tokens at the model catalogue price. Steps that call no model use none. When none are left, the call is refused with a message pointing to top-ups and plans. The credit platform is not yet open for sale.

### Bloc 8 — Appel à l'action (`block_cta`)

*CTA : démonstration. · Affirmations : CL-01*

Réglages : `tone=sombre`

## Watch the agent answer your customers.

We prepare a demonstration on fictional documents, then we talk about your frequent questions and your website.

[Request a demonstration](/en/contact/?sujet=demonstration) · [See documents](/en/solutions/documents/)
