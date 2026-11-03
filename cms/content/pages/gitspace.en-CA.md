# Gitspace — en-CA

> Texte de relecture **généré** par `bun run cms/content/render-md.ts` à partir de `gitspace.en-CA.json`. Ne pas modifier à la main : corriger le JSON, puis régénérer.

## Métadonnées

- Page : `gitspace` · langue : `en-CA` · statut visé : `archived` · noindex : oui
- Route : `/en/gitspace/` · slug : `gitspace`
- Titre SEO (36 caractères) : Gitspace: the forge built for agents
- Description SEO (157 caractères) : Gitspace is Nexora AI's code repository forge, designed so AI agents connect to it directly. In preparation: our repositories stay on GitLab in the meantime.

## Contenu

### Bloc 1 — Héros (`block_hero`)

*Ouverture sobre : ce qu'est Gitspace, en préparation, deux boutons. · Affirmations : CL-GS01*

Réglages : `variant=clair`, `perimeter_grid=false`, `layout=standard`, `signature=aucun`

**In preparation**

# Gitspace, the forge built for agents.

A GitHub-style repository system designed from the start for AI agents. They connect to it directly, find the project's context there and propose their work, while you keep the decision.

[Notify me](/en/contact/?sujet=apps-gitspace) · [Our repositories, meanwhile](/en/gitspace/depots/)

### Bloc 2 — Section (`block_section`)

*Maquette de Gitspace et les six objectifs de conception ; tous en préparation. · Affirmations : CL-GS01, CL-GS02*

Réglages : `media_position=top`, `visual=forge-agents`, `tone=sombre`, `anchor_id=forge`

## A forge where agents work.

Today's forges were drawn for people: a screen, notifications, discussions. Gitspace starts from somewhere else. Agents plug in directly, read and write in repositories like the other members of the team, and the final decision stays human.

These are our design goals. None has shipped yet, and the mock-up is an illustration.

- **A direct connection.** Agents drive repositories, branches and merge requests through a programming interface and through MCP, without going through a web page.
- **Project memory.** Decisions, conventions and context stay in the repository. The agent reads them before acting and updates them afterwards.
- **Guardrails.** What an agent may change, and what requires a human review before merging, is set project by project.
- **Tasks written for agents.** A task carries its goal, the files involved and its success criteria, in a form an agent reads without guessing.
- **Continuous integration feedback.** Test results go back to the agent, which fixes the problem before it asks for your attention.
- **Review, on the human side.** You see what the agent read, changed and checked, then you merge, ask for a change or decline.

### Bloc 3 — Section (`block_section`)

*Pourquoi une forge de plus : les manques des agents, l'objectif, sans chiffre. · Affirmations : CL-GS01*

Réglages : `media_position=none`, `tone=sable`, `anchor_id=pourquoi`

## Why build a forge.

A code agent working in a forge made for people has to guess the project's context, rediscover its own decisions from one session to the next and wait to be told that a test failed. Those gaps are paid for in back-and-forth.

Gitspace aims to close them at the source, inside the forge itself. Our goal is to cut that back-and-forth and raise the odds that a project gets finished. We publish no figure: no measurement exists yet.

### Bloc 4 — Cartes (`block_cards`)

*Le déroulement prévu d'une tâche confiée à un agent (illustration de conception). · Affirmations : CL-GS02*

Réglages : `columns=3`, `layout=etapes`, `tone=clair`, `anchor_id=deroulement`

## One task, from reading to review.

#### The agent reads.

It opens the task and the project memory before touching the code.

#### It proposes and checks.

It creates a branch, prepares the merge request and receives the test results.

#### You decide.

You review, then merge, ask for a change or decline.

### Bloc 5 — Appel à l'action (`block_cta`)

*En attendant : le bouton mène à GitLab par /gitspace/depots (adresse en configuration, jamais dans le contenu). · Affirmations : CL-GS03*

Réglages : `tone=clair`, `anchor_id=en-attendant`

## Meanwhile, our repositories are on GitLab.

Gitspace is not open yet. Our code repositories currently live on a private GitLab, reachable on the team's private network. Gitspace will take its place when it is ready.

[Open GitLab](/en/gitspace/depots/) · [See the workspace](/en/suite/)

### Bloc 6 — FAQ (`block_faq`)

*Questions sur l'état et la portée de Gitspace ; réponses vraies seulement. · Affirmations : CL-GS01, CL-GS02, CL-GS03*

Réglages : `emit_jsonld=true`, `tone=sable`, `anchor_id=questions`

## Your questions. Our answers.

#### Is Gitspace available?

No. Gitspace is in preparation: no date and no price are announced. In the meantime, Nexora AI's repositories are on a private GitLab.

#### How does Gitspace differ from GitHub?

Gitspace is designed for AI agents: they connect to it directly, read the project memory and receive test results. These are design goals, not shipped features.

#### Can agents merge without my approval?

The design principle is the opposite: a human review remains the gate before merging, and you set what an agent may change.

#### Will I be more productive?

That is the goal, but we publish no figure until a measurement exists.

### Bloc 7 — Appel à l'action (`block_cta`)

*CTA final : liste d'attente. · Affirmations : CL-GS01*

Réglages : `tone=sombre`

## Be notified when it opens.

Leave us your address and we will write when Gitspace opens. Nothing else.

[Notify me](/en/contact/?sujet=apps-gitspace) · [See all applications](/en/apps/)
