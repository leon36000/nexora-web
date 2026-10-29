# Model gateway API — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `passerelle-api-modeles.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `passerelle-api-modeles` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/model-gateway-api/` · slug : `model-gateway-api`
- Titre SEO (46 caractères) : AI model gateway API, OpenAI-compatible format
- Description SEO (149 caractères) : One OpenAI-format API for several AI models: prices in Canadian dollars per token, the hosting location shown for each model, keys and spending caps.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse de la passerelle : une API au format OpenAI, des prix en dollars canadiens et le lieu d'hébergement de chaque modèle, avec l'état réel de la vente. · Affirmations : CL-27, CL-S01, CL-S04, CL-12*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Product · Models and API**

# One API. Several models. Readable prices.

The Nexora AI API is a model gateway in the OpenAI format: you change the base address and the key, and the rest of your code stays the same. Each model shows its price in Canadian dollars and where it is hosted. Self-service offers are not yet open for sale: payments only work in test mode.

[See the models](/en/modeles/) · [Read the documentation](/en/docs/api/)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : ce qu'est une passerelle de modèles, définie en une phrase, avec le jeton défini au premier usage. · Affirmations : CL-27, CL-S04, CL-S03*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## A gateway, in one sentence.

A model gateway is a single access point to several AI models: your application calls one address with one key, and the gateway passes each request to the model you chose, then measures the consumption. The Nexora AI API follows the OpenAI API format: libraries and tools that speak that format connect to it by changing the base address and the key.

A token is the unit of text a model processes. It is what prices and consumption are measured in.

To choose between a gateway and direct access, see the guide [Gateway or direct access](/en/guides/gateway-or-direct-access/). To call the API, see [OpenAI-compatible API: change the base address](/en/guides/openai-compatible-api/). For a server of your own, see [A VPS in Quebec for your AI agents](/en/guides/quebec-vps-ai-agents/).

- **One access point.** One address, one key, several models.
- **A familiar format.** The OpenAI API format, so you do not rewrite your code.
- **A clear measure.** Each complete response carries the cost of the request.

### Bloc 3 — Cartes (`block_cards`)

*Les six fonctions de la passerelle, chacune tirée de la documentation publique de l'API. · Affirmations : CL-S04, CL-S05, CL-S01, CL-S03, CL-S06, CL-S02*

Réglages : `columns=3`, `tone=sable`, `layout=grille`, `anchor_id=fonctions`

## What the gateway does.

Each line can be checked in the API documentation.

#### A familiar format.

Chat, embeddings (texts turned into sequences of numbers that can be compared) and a model list, with streaming, tools and response formats.

#### Controlled keys.

Each key can have a spending cap, an expiry and a rate limit. Its value is shown only once; only its fingerprint is kept.

#### The location shown.

Each model says where it is hosted, with the data policy declared by its provider.

#### Billed per token.

Prices in Canadian dollars per million tokens, input and output separate. Each request is settled at its actual cost.

#### Readable errors.

Errors follow the OpenAI format. If the model's provider is unavailable, nothing is charged.

#### No content kept.

Usage events contain only metadata: the model, the tokens, the cost and the duration.

### Bloc 4 — Cartes (`block_cards`)

*Quatre étapes de la clé au premier appel, avec l'état réel : comptes et paiements en mode test. · Affirmations : CL-27, CL-S01, CL-S05, CL-S04, CL-S03, CL-12*

Réglages : `columns=4`, `tone=clair`, `layout=etapes`, `anchor_id=etapes`

## From key to first call.

Accounts and payments only work in test mode for now: the path below describes how it works, not an offer open for sale.

#### Choose a model.

The catalogue gives each model's identifier, price, context size and hosting location.

→ [See the catalogue](/en/modeles/)

#### Create a key.

In the customer area, with a spending cap if you want one.

#### Call the API.

Same format as OpenAI: change the base address and the key.

→ [Read the documentation](/en/docs/api/)

#### Follow the usage.

Requests, tokens and cost, by day and by model, in the customer area.

### Bloc 5 — Section (`block_section`)

*Le lieu d'hébergement affiché : une information du catalogue, pas une garantie de résidence ; renvoi vers le déploiement et les engagements sur les données. · Affirmations : CL-S01, CL-E08, CL-E09, CL-75, CL-02*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=lieu`

## The location, stated plainly.

The hosting location shown on each model sheet comes from the published catalogue: it is information, not a guarantee of data residency. A model hosted outside Quebec processes your requests outside Quebec. Some providers announce data storage in Canada while requests are processed elsewhere: the difference between storage and processing is a question to ask. A provider subject to another country's jurisdiction can also be required to hand over data it holds, even if stored in Canada.

When data residency is a requirement, the right choice may be a system installed on your premises or hosted in Quebec: see [deployment](/en/deployment/) and the [commitments on your data](/en/your-data/).

The guide [Where your data really is](/en/guides/where-is-your-ai-data/) explains the difference between storage, processing and jurisdiction.

Each gateway request first goes through [Nexora Privacy Router](/en/apps/privacy-router/), included at no extra cost.

- **What the sheet says.** The provider, the hosting location and the data policy it declares.
- **What it does not say.** That no foreign law applies: hosting in Quebec does not, by itself, rule out the laws that apply.

### Bloc 6 — Cartes (`block_cards`)

*Limites à connaître : libre-service non ouvert, prix de développement, un seul choix par requête, pas de niveau de service annoncé. · Affirmations : CL-12, CL-S04, CL-86*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=limites`

## Limits to know about.

#### Not yet on sale.

Self-service offers (servers, the credit-based model catalogue, hosted agents) are not open for sale: accounts and payments only work in test mode and no real payment is accepted.

#### No published price.

The prices in the current catalogue are development prices: no price is published yet.

#### One choice per request.

A request returns a single choice, and provider-specific parameters are ignored.

#### No announced service level.

Availability and response times are specified in the contract.

### Bloc 7 — FAQ (`block_faq`)

*Questions de la passerelle, réponse d'abord : définition, compatibilité, facturation, lieu, données, état de la vente, utilité d'une passerelle, changement de modèle. · Affirmations : CL-27, CL-S04, CL-S03, CL-S01, CL-S02, CL-12, CL-80*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Gateway API: your questions.

#### What is a model gateway API?

A single access point to several AI models. Your application calls one address with one key; the gateway passes each request to the chosen model and measures the consumption.

#### Is the Nexora AI API compatible with OpenAI's?

Yes, for chat (with streaming, tools and response formats), embeddings and the model list: you only change the base address and the key. A request returns a single choice, and provider-specific parameters are ignored.

#### How is consumption billed?

Per token, in Canadian dollars. Each request first reserves its maximum cost, then is settled at its actual cost from the input and output tokens; the rest is released. Without enough balance, the API answers with a payment error before any call to the model.

#### Where are the models hosted?

Each catalogue sheet shows the model's hosting location (Quebec, Canada, United States, Europe or other) and the data policy declared by its provider. It is catalogue information, not a guarantee of data residency.

#### Does Nexora AI keep the content of my requests?

No. The gateway's usage events contain only metadata: the model, the tokens, the cost and the duration. The model provider's data policy is shown on its sheet.

#### Can I buy access today?

Not as self-service: accounts and payments only work in test mode and no real payment is accepted. For a project, write to us: we start with a diagnosis of the case.

#### Do I need a gateway if I use a single model?

Not necessarily. A gateway adds an intermediary; it becomes useful when you compare or switch models, or when you want one key, one spending cap and one measure of consumption. If one provider is enough for you, direct access may be simpler.

#### Can I switch models without rewriting my code?

Yes: the model is chosen by an identifier in the request. Change the identifier, keep the rest.

### Bloc 8 — Appel à l'action (`block_cta`)

*Appel à l'action : diagnostic, puis catalogue. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Let's talk about your use.

Tell us which models you want to compare and where your data must stay. We start with a diagnosis.

[Book a diagnosis](/en/contact/) · [See the models](/en/modeles/)
