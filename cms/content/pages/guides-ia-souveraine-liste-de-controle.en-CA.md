# Sovereign AI checklist — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `guides-ia-souveraine-liste-de-controle.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `guides-ia-souveraine-liste-de-controle` · langue : `en-CA` · statut visé : `published` · noindex : non
- Route : `/en/guides/sovereign-ai-checklist/` · slug : `guides/sovereign-ai-checklist`
- Titre SEO (40 caractères) : Sovereign AI: an IT director's checklist
- Description SEO (150 caractères) : Four layers of control, twelve questions, the evidence to request and the pitfalls: an IT department's checklist for judging a sovereign AI in Quebec.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Promesse du guide : une liste de contrôle pour une DSI, avec la définition de travail de la souveraineté. · Affirmations : CL-70, CL-71, CL-75*

Réglages : `variant=sombre`, `perimeter_grid=true`

**Guide · Sovereign AI**

# Sovereign AI: an IT director's checklist.

Four layers of control, the questions that matter, the evidence to ask for and the pitfalls. A working definition, with no legal weight, that also applies to judging Nexora AI.

[See sovereignty at Nexora AI](/en/sovereignty/) · [Deployment study](/en/contact/?sujet=etude-deploiement)

### Bloc 2 — Section (`block_section`)

*Réponse d'abord : la définition de travail en quatre couches, sans valeur légale. · Affirmations : CL-70, CL-71, CL-75*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=reponse`

## The short answer.

AI is called sovereign when you know where it runs and where the data goes. Nexora AI describes it through four layers of control: data, models, compute and operations. It is a working definition with no legal weight: no legal definition of "sovereign" exists, and a server in Quebec does not, by itself, rule out the laws that apply.

An IT department can use it as a grid, for Nexora AI as for any other provider.

### Bloc 3 — Cartes (`block_cards`)

*Les quatre couches de contrôle, une question directrice par couche. · Affirmations : CL-70, CL-71*

Réglages : `columns=4`, `tone=sable`, `layout=grille`, `anchor_id=couches`

## The four layers.

#### Data.

Where is it stored, who accesses it, and what becomes of a backup?

#### Models.

Who runs them, under which licence, and can they be replaced?

#### Compute.

On what hardware and in which country are requests processed?

#### Operations.

Who administers the system, with which access, and which of it is logged?

### Bloc 4 — Section (`block_section`)

*Liste de contrôle : douze questions, trois par couche, sous forme de liste. · Affirmations : CL-70, CL-E08, CL-E05, CL-76, CL-77*

Réglages : `media_position=none`, `tone=clair`, `anchor_id=questions`

## The questions that matter.

<h3>Data</h3>- Where are files, backups and logs stored?
- Can the provider read my data, and under what conditions?
- Is my data used to train a model, by default or on opt-in?
<h3>Models</h3>- Which models are used, and under which licence?
- Is a call to an external model possible, and who turns it on?
- Can the system switch silently to another model during an outage?
<h3>Compute</h3>- Where does processing happen: country, host, hardware?
- Which outbound flows exist (updates, licences, telemetry)?
- Does the system work without outside access, and how far?
<h3>Operations</h3>- Who administers, with which access, and is every access logged?
- Which subprocessors are involved, in which country, for what role?
- What happens at the end of the contract: export, deletion?

### Bloc 5 — Section (`block_section`)

*Preuves à demander, avec l'état réel des documents de Nexora AI (en préparation). · Affirmations : CL-05, CL-73, CL-E06, CL-87*

Réglages : `media_position=none`, `tone=sombre`, `anchor_id=preuves`

## The evidence to ask for.

A spoken answer proves nothing. Ask for documents:

- **The data flow diagram**: where data goes, which external services are called.
- **The subprocessor register**: their country and role.
- **The processing agreement**: what is promised, in writing.
- **The address and contract of the hosting site**, and those of backups and logs.
- **The access log**: who entered your data, when and for which task.
Nexora AI commits to provide the data flow diagram before go-live. The template contract, the subprocessor register and the evidence of the hosting location are in preparation: none is available yet.

### Bloc 6 — Cartes (`block_cards`)

*Les pièges : flux sortants, bascule silencieuse, stockage et traitement, serveur local, vocabulaire. · Affirmations : CL-77, CL-76, CL-E08, CL-75*

Réglages : `columns=2`, `tone=clair`, `layout=liste`, `anchor_id=pieges`

## The pitfalls.

#### On your server is not isolated.

Installing a system on your server does not mean having no outbound flow: updates, licences and any external model must be listed before go-live.

#### The silent switch.

A system that moves on its own to an external model during an outage changes the processing location without telling you. Require that it never does.

#### Storage is not processing.

Storage in Canada does not say where the model reads your requests.

#### A local server is not enough.

It does not, by itself, rule out the laws that apply to the provider. Local laws also apply to local companies.

### Bloc 7 — Section (`block_section`)

*Ce que Nexora AI ne promet pas : risque nul, immunité, conformité automatique, certification. · Affirmations : CL-75, CL-09, CL-86*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=limites`

## What Nexora AI does not promise.

Nexora AI promises neither zero risk, nor legal immunity, nor automatic compliance. It shows no certification it cannot prove and announces no service level today. A sovereign AI is one you know where it runs: it is not an AI that nothing can reach.

### Bloc 8 — FAQ (`block_faq`)

*Questions du guide : définition, hébergement canadien, vérification, auto-hébergement, Nexora AI. · Affirmations : CL-70, CL-75, CL-E08, CL-77, CL-02, CL-87*

Réglages : `emit_jsonld=true`, `tone=clair`, `anchor_id=faq`

## Sovereign AI: your questions.

#### What is a sovereign AI?

It is an AI whose location of operation and data destination you know. Nexora AI describes it through four layers of control: data, models, compute and operations. It is a working definition, with no legal weight.

#### Is hosting in Canada enough?

Not by itself: storage in Canada does not mean processing in Canada, and a provider subject to a foreign law may have to hand over data it holds. Ask where processing happens; the guide “Where your data really is” covers these questions.

#### Does a server on my premises rule out outbound flows?

No. Installing the system on your server is not the same as no telemetry or guaranteed offline operation: outbound flows are listed before go-live.

#### How do I verify a provider's answers?

By asking for documents rather than spoken answers: data flow diagram, subprocessor register, processing agreement, address and contract of the hosting site, access log.

#### Is Nexora AI a sovereign AI?

Nexora AI offers two modes, on your premises or hosted in Quebec, and commits to documenting flows in writing. The template contract and evidence of the hosting location are in preparation: judge it with the list above, documents in hand.

### Bloc 9 — Appel à l'action (`block_cta`)

*Appel à l'action : étude de déploiement. · Affirmations : CL-80*

Réglages : `tone=sombre`

## Let's apply the list to your case.

A deployment study reviews these questions for your context: layers, outbound flows, evidence.

[Request a study](/en/contact/?sujet=etude-deploiement) · [Where your data is](/en/guides/where-is-your-ai-data/)
