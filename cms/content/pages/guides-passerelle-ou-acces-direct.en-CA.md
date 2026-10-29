# Gateway or direct access — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-passerelle-ou-acces-direct.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-passerelle-ou-acces-direct` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/guides/gateway-or-direct-access/` · slug : `guides/gateway-or-direct-access`
- Titre SEO (45 caractères) : Model gateway or direct access: how to choose
- Description SEO (142 caractères) : A gateway adds a middleman that helps when comparing models or keeping one key. Criteria, limits, and the cases where direct access is enough.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : choisir entre une passerelle et un accès direct, sans marque. · Affirmations : CL-27, CL-S04*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · Model gateway**

# Gateway or direct access: how to choose.

A gateway adds a middleman, and in return a single key, a single format and a single meter. Here are the criteria side by side, and the cases where a gateway is no use.

[See the Nexora AI gateway](/en/model-gateway-api/) · [Book a diagnostic](/en/contact/?sujet=diagnostic)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : quand la passerelle, quand l'accès direct, avec les deux termes définis. · Affirmations : CL-27, CL-S04, CL-S05*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

A model gateway adds a middleman between your application and AI providers. It becomes useful when you compare or switch models, or when you want a single key, a single spending cap and a single meter of consumption. With a single provider, direct access may be enough.

A model gateway is a single access point to several AI models. Direct access is a call to one provider's API, with its key and its contract. Consumption is measured in tokens, the unit of text a model processes.

- **A gateway.** One address, one key, several models.
- **Direct access.** One provider, its key, its contract.
- **The right choice.** It depends on how many models you plan to compare.

### Bloc 3 — Section (`block_section`)

*Tableau des critères, sans marque : huit critères, deux colonnes. La latence n'est pas chiffrée (aucune mesure). · Affirmations : CL-S04, CL-S05, CL-S01, CL-S03, CL-M08*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=criteres`

## The criteria, side by side.

<table><caption>Direct access and gateway, criterion by criterion</caption><thead><tr><th>Criterion</th><th>Direct access</th><th>Gateway</th></tr></thead><tbody><tr><th>Number of providers</th><td>One: the simplest setup.</td><td>Several, behind a single address.</td></tr><tr><th>Key and caps</th><td>One key per provider, with each provider's settings.</td><td>One key, with spending cap, expiry and rate limit set in one place (Nexora AI API offers them).</td></tr><tr><th>Switching models</th><td>Rewrite the call if the provider's format differs.</td><td>Change the model identifier in the request, if the gateway follows the format your code speaks.</td></tr><tr><th>Metering consumption</th><td>One statement per provider.</td><td>A single statement, by day and by model.</td></tr><tr><th>Added latency</th><td>None: a single hop.</td><td>One more hop. Nexora AI has published no measurement of this latency.</td></tr><tr><th>Where it is processed</th><td>Where the provider processes it; read its contract.</td><td>Wherever each provider behind the gateway processes it; the Nexora AI model sheet shows it.</td></tr><tr><th>Contract</th><td>Directly with the provider.</td><td>With the gateway operator, who has its own contracts.</td></tr><tr><th>Fees</th><td>The provider's price.</td><td>The gateway's price: how it is calculated varies, read it before choosing.</td></tr></tbody></table>

### Bloc 4 — Cartes (`block_cards`)

*Ce que la passerelle apporte, avec les fonctions de Nexora AI API à l'appui. · Affirmations : CL-S04, CL-S05, CL-S01, CL-S03*

Réglages : `columns=4`, `tone=clair`, `layout=grille`, `anchor_id=apports`

## What a gateway brings.

Each line can be checked in the Nexora AI API documentation.

#### One format.

The OpenAI API format: your libraries and tools connect by changing the base address and the key.

→ [Change the base address](/en/guides/openai-compatible-api/)

#### A managed key.

Spending cap, expiry and rate limit per key; the key's value is shown only once.

#### A stated location.

Each model sheet says where it is hosted and which data policy its provider declares.

#### A readable cost.

The price in Canadian dollars per million tokens, and the cost of each complete response.

→ [See the models](/en/modeles/)

### Bloc 5 — Section (`block_section`)

*Le coût en dépendance : intermédiaire, contrat, catalogue, point de passage des données. · Affirmations : CL-S02, CL-S06, CL-E08*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=dependance`

## What it costs in dependence.

A gateway always creates some dependence, even a simple one. It adds a link that can fail, one more contract to read, a catalogue that is not yours, and a point your requests pass through.

- **One more link.** If a model's provider is unavailable, the Nexora AI gateway returns a gateway error and charges nothing.
- **A catalogue to follow.** You use the models the gateway publishes, not all those providers sell.
- **A point of passage.** What the gateway keeps of your requests is a question to ask. Nexora AI's keeps only usage metadata: the model, tokens, cost and duration.

### Bloc 6 — Section (`block_section`)

*Où passent les données : stockage et traitement, juridiction, renvoi vers le guide dédié et vers Vos données. · Affirmations : CL-E08, CL-E09, CL-75, CL-S01*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=donnees`

## Where your data goes.

With a gateway, where your data is processed is where the chosen model's provider processes it. Some providers state that data is stored in Canada while requests are processed elsewhere: the difference between storage and processing is the first question to ask. A provider subject to another country's jurisdiction may also be required to hand over data it holds.

The guide [Where your data really is](/en/guides/where-is-your-ai-data/) covers these three questions, and the [Your data](/en/your-data/) page lists Nexora AI's commitments.

### Bloc 7 — Cartes (`block_cards`)

*Quand Nexora AI n'est pas le bon choix : quatre cas, dits sans détour. · Affirmations : CL-12, CL-86, CL-S01, CL-02*

Réglages : `columns=2`, `tone=sable`, `layout=liste`, `anchor_id=limites`

## When Nexora AI is not the fit.

#### A direct contract is required.

If your organization must sign with the model's provider itself, direct access is simpler.

#### The model is not in the catalogue.

The gateway serves only the models published in its catalogue.

#### You want to buy today.

Self-service is not open for sale: accounts and payments work in test mode only.

#### A service level is required.

No service level is announced today; availability and response times are set out in the contract.

### Bloc 8 — FAQ (`block_faq`)

*Questions du guide : une passerelle en vaut-elle la peine, latence, clés, lieu, changement de modèle. · Affirmations : CL-27, CL-S04, CL-S05, CL-M08, CL-E08, CL-12*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Gateway or direct access: your questions.

#### Do I need a gateway if I only use one model?

Not necessarily. With a single provider, direct access is simpler and removes a middleman. A gateway becomes useful when you compare or switch models, or want a single key, cap and meter.

#### Does a gateway slow calls down?

It adds a network hop. Nexora AI has published no measurement of the latency its gateway adds, so we state none. Measure it on your own case before deciding.

#### Can I switch models without rewriting my code?

Yes, if the gateway follows the format your code speaks. With Nexora AI API, which follows the OpenAI API format, you only change the model identifier in the request.

#### Where are my requests processed?

At the chosen model's provider. Each Nexora AI model sheet states its hosting location and the data policy its provider declares: it is catalogue information, not a residency guarantee.

#### Can I buy access to Nexora AI API today?

Not in self-service: accounts and payments work in test mode only and no real payment is accepted. For a project, write to us: we start with a diagnostic.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : diagnostic, puis passerelle. · Affirmations : CL-80, CL-12*

Réglages : `tone=sombre`

## Let's talk about your use.

Tell us which models you want to compare and where your data must stay. We start with a diagnostic.

[Book a diagnostic](/en/contact/?sujet=diagnostic) · [See the gateway](/en/model-gateway-api/)
