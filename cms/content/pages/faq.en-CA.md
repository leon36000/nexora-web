# Frequently asked questions — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `faq.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `faq` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/faq/` · slug : `faq`
- Titre SEO (35 caractères) : FAQ: AI for Quebec small businesses
- Description SEO (156 caractères) : Your data, cost, going live, AI mistakes, Quebec privacy law: Nexora's answers to the questions small-business owners ask most often. Straight answers only.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Entrée de la FAQ. · Affirmations : CL-09*

Réglages : `variant=sombre`, `perimeter_grid=true`

**FAQ**

# Your questions. Our answers.

The objections business owners raise most often, with true answers only: when we do not know yet, or when something is not delivered, we say so.

[Ask a question](/en/contact/) · [See the trust center](/en/trust-center/)

### Bloc 2 — FAQ (`block_faq`)

*Données et souveraineté : sept questions. · Affirmations : CL-02, CL-05, CL-06, CL-07, CL-08, CL-71, CL-77, CL-L05*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=donnees`

## Data and sovereignty.

#### Does my data leave Quebec?

It depends on the deployment mode and the models you choose, and we write it down before kickoff. On your premises, the hardware and the access are yours, and the only outbound flows are those we draw up together: updates, licences, and an external model if you choose one. With us, hosting is in our infrastructure, in Quebec, and we specify backups, logs and providers in writing. In both cases, we only write “no data leaves” if we have verified it on your configuration.

#### Do you train your models on our data?

No, not without your specific authorization. Our rule: one customer's data does not serve another customer or train a model without that customer's agreement, and we put it in the contract.

#### Is a server in Quebec enough?

No. Where the machines sit says nothing about the models called, the backups, the logs or the subcontractors. That is why we look at four layers: the data, the models, the compute and the operations.

#### Are you compliant with Law 25?

We do not put it that way. A company's compliance depends on its own practices, contracts and governance: no software and no supplier confers it. We describe what we document, what the software allows and what is in preparation, in the trust center.

#### Can an external model be used?

Yes, on two conditions: you accept it in writing, and it appears on the data-flow diagram as an outbound flow. No call to an external AI service is configured without your written agreement, and the system never switches to one without telling you.

#### Does the system work offline?

We do not promise operation with no outbound flow at all: updates and licences are listed. Running with no outbound flow is decided and verified case by case.

#### What happens if we stop?

You leave with your documents, configurations and workflows: export is provided for in the contract from the start, not negotiated at the end.

### Bloc 3 — FAQ (`block_faq`)

*Mise en œuvre et coûts : sept questions. · Affirmations : CL-04, CL-10, CL-82, CL-14, CL-85, CL-12, CL-83*

Réglages : `emit_jsonld=false`, `tone=sable`, `anchor_id=mise-en-oeuvre`

## Setup and cost.

#### We have no technical staff.

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

### Bloc 4 — FAQ (`block_faq`)

*L'IA, ses erreurs et ses limites : huit questions. · Affirmations : CL-21, CL-128, CL-96, CL-112, CL-124, CL-28, CL-30, CL-90*

Réglages : `emit_jsonld=false`, `tone=clair`, `anchor_id=limites`

## AI, its mistakes, its limits.

#### Will AI replace my employees?

Our systems take the repetitive tasks; the decision stays with a person. A workflow can stop on an approval before acting, and a log keeps track of what was done.

#### Can the AI be wrong?

Yes. We reduce the risk by making it answer from your documents, citing sources, and adding a faithfulness safeguard when useful. No safeguard eliminates error, which is why a person approves whatever commits the business.

#### Who supervises what the AI does?

Your team. Every model call leaves a trace you can consult, consumption is measured, and test sets let you check that a change has not degraded anything.

#### Why not a consumer assistant like ChatGPT?

A consumer assistant answers general questions well. What Nexora adds: choosing where your requests are processed, your own documents as the basis for answers, links to your software, approvals and a log. The right choice depends on what you want to do with it.

#### What is an AI agent?

Software that completes a task in your place, with the tools and documents you authorize, and that asks for your approval before an important action.

#### Can it answer the phone?

No. No call-answering service is delivered today. A voice message dropped in as a recording can be transcribed; live telephony is checked separately.

#### Are Nexora Code, Corpus, Quanta and Helix available?

No availability or date is announced at this stage. Only Nexora WorkStudio is available, on request.

#### Is there a solution for construction?

Yes: OPSYS-AI coordinates ten departments for construction companies and field services, each with an honest status (available, in pilot or planned).

### Bloc 5 — Appel à l'action (`block_cta`)

*CTA final de la FAQ. · Affirmations : CL-01*

Réglages : `tone=sombre`

## One more question.

Ask us. If we do not know the answer, or if it is not delivered yet, we will tell you.

[Ask a question](/en/contact/) · [See the solutions](/en/solutions/)
