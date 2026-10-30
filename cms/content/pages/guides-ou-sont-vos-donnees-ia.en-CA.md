# Where your AI data is — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-ou-sont-vos-donnees-ia.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-ou-sont-vos-donnees-ia` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/guides/where-is-your-ai-data/` · slug : `guides/where-is-your-ai-data`
- Titre SEO (42 caractères) : Where is your data? Storage and processing
- Description SEO (145 caractères) : Storage, processing and jurisdiction: three questions to know where your AI data is, and the questions to put to any AI provider before you sign.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : trois questions pour savoir où sont les données, sans promesse de résidence. · Affirmations : CL-E08, CL-E09, CL-75*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · Data and jurisdiction**

# Where your data really is.

Storage, processing, jurisdiction: three separate questions, and the questions to put to an AI provider. We promise no compliance and no residency that we cannot prove.

[See our data commitments](/en/your-data/) · [Deployment study](/en/contact/?sujet=etude-deploiement)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : les trois questions, la différence stockage et traitement, la juridiction. · Affirmations : CL-E08, CL-E09, CL-75*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

Knowing where your data is takes three questions: where it is stored, where it is processed, and which jurisdiction the provider is subject to. Storage in Canada does not mean processing in Canada. A provider subject to a foreign law may have to hand over data it holds, even if stored here.

Jurisdiction is the set of a country's laws that apply to a company. Processing is the moment the model reads your request to produce a response.

### Bloc 3 — Cartes (`block_cards`)

*Les trois questions, une par carte. · Affirmations : CL-E08, CL-E09*

Réglages : `columns=3`, `tone=sable`, `layout=grille`, `anchor_id=trois-questions`

## Storage, processing, jurisdiction.

#### Where is it stored?

Files, backups and logs rest somewhere. It is the location providers most readily announce.

#### Where is it processed?

The model reads your request and computes its response somewhere. That place can differ from where data is stored.

#### Which law applies?

A provider subject to another country's jurisdiction may have to hand over data it holds. Local laws also apply to local companies.

### Bloc 4 — Section (`block_section`)

*Services grand public : le partage des conversations est un réglage que l'utilisateur doit désactiver lui-même. · Affirmations : CL-E07, CL-E08*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=grand-public`

## What consumer services say.

In some consumer AI services, sharing conversations to improve models is a setting the user must turn off themselves: not training on your data is not the default. For a large API platform, residency in Canada may cover storage without covering the processing of requests.

These findings come from each provider's documentation. They say nothing about what a given provider does today: always reread its current page.

### Bloc 5 — Section (`block_section`)

*Tableau des trois modes (chez vous, hébergé au Québec, via une API) : où sont les données, où est le traitement, quoi demander. · Affirmations : CL-72, CL-E01, CL-E02, CL-73, CL-S01, CL-77, CL-05, CL-87, CL-S02*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=trois-modes`

## Three modes, three answers.

<table><caption>Where your data is, by mode</caption><thead><tr><th>Mode</th><th>Where the data is</th><th>Where processing happens</th><th>What to ask</th></tr></thead><tbody><tr><th>On your premises</th><td>On your server; Nexora AI accesses it only if you authorize it in writing, for a specific task.</td><td>On your server, except an external model you turn on.</td><td>The list of outbound flows (updates, licences, external model) before go-live.</td></tr><tr><th>Hosted in Quebec</th><td>In Nexora AI's infrastructure, in Quebec, backups included: this is our written commitment.</td><td>In the same infrastructure, except a service you turn on.</td><td>The address and contract of the site, the location of backups, logs and subprocessors. This evidence is in preparation.</td></tr><tr><th>Through a model API</th><td>Depends on the provider; the Nexora AI gateway keeps only usage metadata (model, tokens, cost, duration), never the content of requests or answers.</td><td>At the chosen model's provider.</td><td>The processing location, not only the storage location, and the provider's data policy.</td></tr></tbody></table>See also [deployment](/en/deployment/) on your premises or hosted in Quebec.

### Bloc 6 — Section (`block_section`)

*Ce que la fiche d'un modèle dit et ne dit pas. · Affirmations : CL-S01, CL-75, CL-E08, CL-S02, CL-M06*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=fiche-modele`

## What a model sheet says.

In the Nexora AI catalogue, each model's sheet states its provider, its hosting location (Quebec, Canada, United States, Europe or other) and the data policy that provider declares.

- **What it says.** The information declared in the catalogue.
- **What it does not say.** That no foreign law applies, or that processing happens in the same place as hosting.
It is information, not a residency guarantee. See the [model gateway API](/en/model-gateway-api/) and the [list of models](/en/modeles/).

Before each call to a provider, Nexora Privacy Router evaluates the request: it masks obvious personal details (email, phone, credit card, SIN, IBAN, keys and secrets) or refuses the request, according to the organization's policy. Its detection is heuristic, it finds neither names nor postal addresses, and it does not prove where the provider then processes the data.

### Bloc 7 — Cartes (`block_cards`)

*Liste de questions à poser à un fournisseur d'IA. · Affirmations : CL-E08, CL-E09, CL-E05, CL-E03*

Réglages : `columns=2`, `tone=sombre`, `layout=liste`, `anchor_id=questions-a-poser`

## What to ask a provider.

#### Where are my requests processed?

The country and the hosting provider, not just the storage location.

#### Does my data train a model?

By default or only if I turn it on, and what the contract says.

#### Who are your subprocessors?

Their country and role, in a register I can read.

#### Which law applies to your company?

And can it require you to hand over data hosted here?

#### What do you keep of my requests?

Metadata only, or content, and for how long.

#### What happens if a model goes down?

A silent switch to another provider would change the processing location.

### Bloc 8 — Section (`block_section`)

*Ce que Nexora AI documente par écrit : schéma des flux, lieu, sous-traitants ; documents types en préparation. · Affirmations : CL-05, CL-73, CL-E06, CL-87, CL-76*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=documents`

## What Nexora AI documents in writing.

Before go-live, Nexora AI provides in writing the data flow diagram: where data is stored, which external services are called, which backups exist. In the hosted mode, the hosting location, the location of backups and logs and the list of subprocessors are stated in writing. The system never switches silently to an external model.

These commitments rest on a processing agreement, a subprocessor register and an access log. These template documents are in preparation: none is available yet.

### Bloc 9 — FAQ (`block_faq`)

*Questions du guide : stockage au Canada, vérification, entraînement, mode API, preuve. · Affirmations : CL-E08, CL-E09, CL-E03, CL-S01, CL-02, CL-87, CL-S02, CL-M06, CL-T05, CL-PL01*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=questions`

## Where your data is: your questions.

#### Is hosting in Canada enough?

Not by itself. Some providers state storage in Canada while requests are processed elsewhere, and a provider subject to a foreign law may have to hand over data it holds. Ask where processing happens and which jurisdiction applies.

#### What is the difference between storage and processing?

Storage is where your files, backups and logs rest. Processing is where the model reads your request and computes its response. The two can be in different countries.

#### How can I check where a model runs?

By asking the provider in writing for the country and host of the processing, and by reading its contract and subprocessor register. A catalogue sheet states what the provider declares; it does not prove it.

#### Does Nexora AI use my data to train models?

No. Nexora AI commits never to use a client's data, documents, prompts or results to train or tune a model. This commitment relies on a processing agreement that is in preparation.

#### Does Nexora AI prove its servers are in Quebec?

The hosted mode commits to keeping data in Quebec, but the technical evidence (address, contract, location of backups and subprocessors) is in preparation. It will be provided in writing before go-live.

#### Where is my data on the Nexora AI credit platform?

The documents and files you keep with Nexora AI count toward your plan's storage. The model gateway keeps only usage metadata (model, tokens, cost, duration), never the content of requests or answers. Each model shows its hosting location and its provider's data policy, and Nexora Privacy Router evaluates every request before the call. The location shown is information, not a residency guarantee: processing takes place at the chosen model's provider.

### Bloc 10 — Appel à l'action (`block_cta`)

*Appel à l'action : étude de déploiement. · Affirmations : CL-80, CL-05*

Réglages : `tone=sombre`

## Let's map your flows.

A deployment study maps the data flows for your case: where the data is, what leaves, what stays.

[Request a study](/en/contact/?sujet=etude-deploiement) · [Your data](/en/your-data/)
