# Frequently asked questions — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `faq.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `faq` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/faq/` · slug : `faq`
- Titre SEO (39 caractères) : AI for small business: straight answers
- Description SEO (157 caractères) : Data, training, cost, Law 25, AI mistakes, video surveillance, marketing: Nexora AI's straight answers to the questions small-business owners ask most often.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Entrée de la FAQ : réponses franches en langage de dirigeant. · Affirmations : CL-09*

Réglages : `variant=sombre`, `perimeter_grid=true`

**FAQ**

# Your questions. Straight answers.

Data, cost, going live, AI mistakes: the questions business owners ask us most often, with true answers only. When something is not delivered yet, we say so.

[Ask a question](/en/contact/) · [Read our commitments on your data](/en/your-data/)

### Bloc 2 — FAQ (`block_faq`)

*Données et souveraineté : huit questions, dont l'entraînement et la vente des données (E03, E04). · Affirmations : CL-02, CL-05, CL-06, CL-07, CL-08, CL-71, CL-77, CL-L05, CL-E01, CL-E02, CL-E03, CL-E04, CL-E05, CL-L01, CL-L02, CL-87*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=donnees`

## Your data, your rules.

#### Does my data leave Quebec?

It stays where you decide, and we write it down before kickoff. On your premises, the hardware and the access are yours: only the flows we list together before go-live leave (updates, licences and, if you turn it on, an external model). With us, your data is stored and processed in our infrastructure, in Quebec, backups included; the only exceptions are services you explicitly turn on, all listed in a subcontractor register, which is in preparation.

In both cases, we only write “no data leaves” if we have verified it on your configuration.

#### Is my data used to train an AI?

No, never. Nexora AI uses neither your data, nor your documents, nor your prompts, nor your results to train or fine-tune a model, whether it belongs to Nexora AI or to a third party. For an external model that you turn on, the contracts with providers, in preparation, set out retention and training.

#### Is my data sold?

No. Nexora AI does not sell, rent, trade or share for advertising any personal information or business data entrusted to it.

#### Is a server in Quebec enough?

No. Where the machines sit says nothing about the models called, the backups, the logs or the subcontractors. That is why we look at four layers: the data, the models, the compute and the operations.

#### Are you compliant with Law 25?

We do not put it that way: no software and no supplier makes a business compliant, and responsibility stays with the business that holds the information. The law asks your business, among other things, for a privacy impact assessment and a written contract with its suppliers. We describe what we document, what the software allows and what is in preparation, in the trust center.

#### Can an external model be used?

Yes, on two conditions: you turn it on in writing, and it appears on the data-flow diagram as an outbound flow. No call to an external AI service is configured without your explicit activation, and the system never switches to one without telling you.

#### Does the system work offline?

We do not promise operation with no outbound flow at all: updates and licences are listed. Running with no outbound flow is decided and verified case by case.

#### What happens if we stop?

You leave with your documents, configurations and workflows: export is provided for in the contract from the start, not negotiated at the end.

### Bloc 3 — FAQ (`block_faq`)

*Mise en œuvre et coûts : neuf questions, dont le marketing automatisé et l'hébergement inclus (CL-G03). · Affirmations : CL-04, CL-10, CL-82, CL-14, CL-85, CL-12, CL-83, CL-G01, CL-G02, CL-G03, CL-G04*

Réglages : `emit_jsonld=false`, `tone=sable`, `anchor_id=mise-en-oeuvre`

## Getting started, without the hassle.

#### What if we have no technical staff?

That is not an obstacle. We install the system, run it with you and keep it evolving; your team's training covers usage and supervision, not the technical side.

#### How much does it cost?

There is no public price yet. The cost depends on the number of cases handled, the volume of documents, the deployment mode, the integrations and, on your premises, the hardware. After a diagnosis, we provide a written estimate that states what is included and what is not.

#### Do we need a powerful server?

It depends on the case. With us, you buy no server. On your premises, we size the hardware to your uses: number of users, volume of documents, chosen model. A small local model is not always enough for agents that call tools.

#### How long to get started?

We announce no universal timeline: it depends on your software, your documents and your rules. It is measured on a first case.

#### Is my current software compatible?

A broad catalogue of services connects to WorkStudio, but whether a given piece of software can be connected depends on the service concerned. We check it during the diagnosis, package by package.

#### How will my employees be trained?

In usage and supervision: reviewing, correcting, approving, refusing. Not in programming.

#### Can I see the product before committing?

Yes: we offer a demonstration on fictional data. Self-service offers (servers, a credit-based model catalogue, hosted agents) are not open yet.

#### What about automated marketing?

Nexora Croissance, our automated marketing service, is in early access: access is on request, and each connection to a platform opens at its own pace. It brings together a website, search visibility, advertising campaign management, social networks and reputation tracking. You approve publications and major budget or targeting changes, a spending cap that you set applies, and no result is guaranteed. The details are on the Nexora Croissance page.

#### Is web hosting free with Nexora Croissance?

It is included: no separate hosting fees as long as you are a Nexora Croissance customer. Still at your expense, shown upfront: the domain name in your name (annual fees paid to the registrar) and the advertising fees paid to the platforms. You leave with your content and your domain name.

### Bloc 4 — FAQ (`block_faq`)

*L'IA, ses erreurs et ses limites : neuf questions, dont la surveillance vidéo (CL-V01). · Affirmations : CL-21, CL-128, CL-96, CL-112, CL-124, CL-28, CL-30, CL-90, CL-V01, CL-V02, CL-V03, CL-V06, CL-V07, CL-L04*

Réglages : `emit_jsonld=false`, `tone=clair`, `anchor_id=limites`

## AI that is honest about its limits.

#### Will AI replace my employees?

Our systems take the repetitive tasks; the decision stays with a person. A workflow can stop on an approval before acting, and a log keeps track of what was done.

#### Can the AI be wrong?

Yes. We reduce the risk by making it answer from your documents, citing sources, and adding a faithfulness safeguard when useful. No safeguard eliminates error, which is why a person approves whatever commits the business.

#### Who supervises what the AI does?

Your team. Every model call leaves a trace you can consult, consumption is measured, and test sets let you check that a change has not degraded anything.

#### Why not a consumer AI assistant?

A consumer assistant answers general questions well. What Nexora AI adds: choosing where your requests are processed, your own documents as the basis for answers, links to your software, approvals and a log. The right choice depends on what you want to do with it.

#### What is an AI agent?

Software that completes a task in your place, with the tools and documents you authorize, and that asks for your approval before an important action.

#### Can it answer the phone?

No. No call-answering service is delivered today. A voice message dropped in as a recording can be transcribed; live telephony is checked separately.

#### Are Nexora Code, Corpus, Quanta and Helix available?

No availability or date is announced at this stage. Nexora WorkStudio is presented as a demonstration on request; no self-service offer is open.

#### Is there a solution for construction?

Yes: OPSYS-AI coordinates ten departments for construction companies and field services, each with an honest level (locally qualified, to complete or planned). OPSYS-AI is a product in development, partial: no complete production deployment exists.

#### What about AI video surveillance?

Nexora Vision, our AI video surveillance project, is a pilot project by invitation: it is not an available product, and no installation exists yet. The intended design keeps image analysis on a server at the customer's site. Nexora Vision does not offer facial recognition, and every alert asks a person to check. Law 25 requires, among other things, informing people before collection; the details are on the Nexora Vision page.

### Bloc 5 — Cartes (`block_cards`)

*Renvois vers les pages qui détaillent : données, Vision, Croissance, confiance. · Affirmations : CL-V01, CL-G01, CL-87*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=plus-loin`

## Go further.

#### Your data.

The five commitments, in writing: on your premises or in Quebec, never used for training, never sold.

→ [Read the commitments](/en/your-data/)

#### Nexora Vision.

AI video surveillance: a pilot project by invitation, not an available product.

→ [See the pilot project](/en/vision/)

#### Nexora Croissance.

Automated marketing: a website with hosting included, search visibility, advertising, social networks. Early access.

→ [See early access](/en/growth/)

#### The trust center.

What the software already allows and the documents we are preparing.

→ [See the proof](/en/trust-center/)

### Bloc 6 — Appel à l'action (`block_cta`)

*CTA final de la FAQ. · Affirmations : CL-01*

Réglages : `tone=sombre`

## One more question.

Ask us. If we do not know the answer, or if it is not delivered yet, we will tell you.

[Ask a question](/en/contact/) · [See the solutions](/en/solutions/)
