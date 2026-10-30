# OpenRouter and Nexora AI API — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-alternative-openrouter.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-alternative-openrouter` · langue : `en-CA` · statut visé : `draft` · noindex : oui
- Route : `/en/guides/openrouter-alternative/` · slug : `guides/openrouter-alternative`
- Titre SEO (42 caractères) : OpenRouter and Nexora AI API: what differs
- Description SEO (160 caractères) : A comparison of dated, sourced facts between OpenRouter and Nexora AI API: format, catalogue, currency, data, where it is processed, and when to pick the other.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse : un comparatif de faits datés et sourcés, sans adjectif de valeur. Page à relire avant publication. · Affirmations : CL-27, CL-X01, CL-S01*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Comparison · Facts read on October 29, 2026**

# OpenRouter and Nexora AI API: what differs.

Two model gateways that follow the OpenAI API format. A table of dated, sourced facts on each side, with no value adjectives, and a section saying when to choose the other.

[See the Nexora AI gateway](/en/model-gateway-api/) · [Gateway or direct access](/en/guides/gateway-or-direct-access/)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce que sont les deux passerelles, ce qui les distingue, l'état de la vente. · Affirmations : CL-27, CL-X01, CL-X02, CL-X07, CL-S01, CL-12*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

OpenRouter and Nexora AI API are two model gateways that follow the OpenAI API format. OpenRouter states more than five hundred models and bills in US dollars. Nexora AI API has a catalogue limited to the models published on its Models page, prices in Canadian dollars, and a sheet for each model showing where it is hosted. Its self-service is not yet open for sale.

This page compares facts; it does not rank. Each OpenRouter fact is dated and points to its public source.

### Bloc 3 — Section (`block_section`)

*Tableau de faits : OpenRouter (lu le 29/10/2026, avec sources) et Nexora AI API (registre), sans adjectif de valeur. · Affirmations : CL-X01, CL-X02, CL-X03, CL-X04, CL-X05, CL-X06, CL-X07, CL-S01, CL-S02, CL-S03, CL-M06, CL-86, CL-12*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=faits`

## What each one does.

<table><caption>OpenRouter facts read on October 29, 2026 and Nexora AI API facts</caption><thead><tr><th>Criterion</th><th>OpenRouter (read on October 29, 2026)</th><th>Nexora AI API</th></tr></thead><tbody><tr><th>API format</th><td>Interface in the OpenAI API format (/completions and /chat/completions endpoints).</td><td>OpenAI API format: chat, embeddings, model list.</td></tr><tr><th>Catalogue</th><td>More than five hundred models and more than eighty providers stated (paid plans).</td><td>The models published on the Models page.</td></tr><tr><th>Currency</th><td>US dollars.</td><td>Canadian dollars, per million tokens.</td></tr><tr><th>Fees</th><td>Inference at the provider's list price, no markup; fee when buying credits: 5.5% (Standard), 8% (Business).</td><td>No price published today: the current catalogue's prices are development prices.</td></tr><tr><th>Logging</th><td>Basic metadata; prompts and responses not logged by default; optional logging in exchange for a one percent discount.</td><td>Usage events limited to metadata: model, tokens, cost, duration.</td></tr><tr><th>Where it is processed</th><td>Regional routing for Europe and the United States (Business, Enterprise); the pricing page does not mention Canadian routing.</td><td>Hosting location of each model shown on its sheet: catalogue information, not a residency guarantee.</td></tr><tr><th>Data policies</th><td>Routing based on data policies from the Standard plan.</td><td>Nexora Privacy Router included: masking of six kinds of obvious information, refusal by policy, log without content.</td></tr><tr><th>Service level</th><td>Contractual only with the Enterprise plan.</td><td>No service level announced.</td></tr><tr><th>Purchase</th><td>Self-service sign-up and credit purchase.</td><td>Self-service not open: payments work in test mode only.</td></tr></tbody></table>OpenRouter sources, read on October 29, 2026: the [pricing page](https://openrouter.ai/pricing) and the [frequently asked questions](https://openrouter.ai/docs/faq). These pages change: the facts are rechecked at each publication and every three months.

### Bloc 4 — Section (`block_section`)

*Données et lieu de traitement : divulgation du fournisseur amont, limites du refus de collecte, stockage et traitement. · Affirmations : CL-M09, CL-M06, CL-E08, CL-E09, CL-75*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=donnees`

## Data and where it is processed.

In both cases your request is passed to a model provider, which processes it on its side. For part of its catalogue, the Nexora AI gateway itself relies on OpenRouter as an upstream provider. It asks OpenRouter to refuse data collection by the final host, but cannot verify that the refusal is applied.

Choosing Nexora AI API therefore does not, by itself, rule out processing by a third party: read the model sheet. To learn how to ask about location, see [Where your data really is](/en/guides/where-is-your-ai-data/).

### Bloc 5 — Cartes (`block_cards`)

*Facturation : comment chacun facture, sans comparaison de prix possible aujourd'hui. · Affirmations : CL-X02, CL-X03, CL-S03, CL-S05, CL-12*

Réglages : `columns=2`, `tone=clair`, `layout=grille`, `anchor_id=facturation`

## Who bills what.

No price comparison is possible today: Nexora AI has published no price.

#### At OpenRouter.

The provider's list price, with no markup, in US dollars; a fee applies when credits are bought; taxes are added; under its terms, credits may expire one year after purchase.

#### At Nexora AI API.

Per token, in Canadian dollars: each request reserves its maximum cost and is then settled at the actual cost; without enough balance, the API returns a payment error before any call. Each key can have a spending cap.

### Bloc 6 — Cartes (`block_cards`)

*Pour qui : trois profils, sans classement. · Affirmations : CL-02, CL-04, CL-S01, CL-M06*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=pour-qui`

## Who it is for.

#### You compare models in Canadian dollars.

Nexora AI API prices are in Canadian dollars and each model sheet shows its hosting location.

#### You want built-in protection.

Nexora Privacy Router is included at no extra cost and applies to every gateway request.

#### You want support.

Nexora AI installs, runs and evolves AI systems, on your premises or hosted in Quebec.

### Bloc 7 — Section (`block_section`)

*Quand choisir l'autre : quatre besoins que seul OpenRouter couvre aujourd'hui. · Affirmations : CL-12, CL-86, CL-X06, CL-X07*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=choisir-lautre`

## When to choose the other.

OpenRouter meets several needs today that Nexora AI API does not cover:

- **You want to buy now.** Nexora AI self-service is not open for sale.
- **You need a very wide catalogue.** Nexora AI's is limited to the models published on its Models page.
- **You require a contractual service level.** Nexora AI announces none.
- **You want European or American regional routing.** OpenRouter offers it in its Business and Enterprise plans.

### Bloc 8 — FAQ (`block_faq`)

*Questions du comparatif : alternative, fournisseur amont, prix, lieu, migration. · Affirmations : CL-M09, CL-X02, CL-X06, CL-S04, CL-12, CL-M07*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Comparison: your questions.

#### Is Nexora AI API an alternative to OpenRouter?

For some uses, yes: both are model gateways that follow the OpenAI API format. They differ in currency, catalogue, the way hosting location is shown, and the state of sales. The table on this page gives the facts.

#### Does Nexora AI API use OpenRouter?

For part of its catalogue, yes: OpenRouter can serve as an upstream provider. Nexora AI asks it to refuse data collection by the final host, but cannot verify that the refusal is applied. Each model sheet gives its provider and its data policy.

#### Which one costs less?

We cannot say: Nexora AI has published no price, and OpenRouter's prices are in US dollars with a fee when buying credits. Compare on your own case, including taxes and exchange.

#### Where are my requests processed?

At the chosen model's provider, in both cases. OpenRouter offers regional routing for Europe and the United States in its Business and Enterprise plans; Nexora AI shows the hosting location on each model sheet. Neither is, by itself, proof of residency.

#### Can I move from one to the other by changing the base address?

The format is the same, so the base address and the key change; model identifiers differ and must be adapted. See the guide on the OpenAI-compatible API.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : parler du cas d'usage. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Let's talk about your case.

Tell us which models you want to compare, where your data must stay and what matters most. We answer with an assessment.

[Book an assessment](/en/contact/?sujet=diagnostic) · [Gateway or direct access](/en/guides/gateway-or-direct-access/)
