import type { AppsDictionary } from "./apps-fr-CA";

/**
 * Nexora Apps dictionary (en-CA): the /apps page and the /apps/<slug> pages. Same structure as the fr-CA one; no
 * invented figures, prices, dates, customers or certifications. A tool that is not shipped is "Soon" or "Later" and
 * its text uses the future or the conditional, never the present tense.
 */
export const appsEnCA: AppsDictionary = {
  meta: {
    list: {
      title: "Nexora Apps: Nexora Code, RAG, WebPilot and more | Nexora AI",
      description:
        "Nexora Code, RAG, WebPilot, Privacy Router and free tools: each page says what is ready and what is coming, with no invented dates.",
    },
  },

  states: {
    disponible: {
      label: "Available",
      description: "Shipped and usable today.",
    },
    bientot: {
      label: "Soon",
      description: "In preparation. No date is announced.",
    },
    plus_tard: {
      label: "Later",
      description: "Planned for a later stage. No date is announced.",
    },
  },

  list: {
    label: "Nexora Apps",
    title: "Nexora Apps.",
    lead: "The Nexora AI tools that surround your models, servers and agents: writing code, hosting code, finding answers in your documents, browsing the web, protecting your data. Each page says what is ready and what is coming.",
    legendTitle: "The state of each tool",
    legendLead:
      "We show the real state. A tool that is not shipped is “Soon” or “Later”: no date and no performance figure that we cannot show.",
    notify: "Notify me when it opens",
    gridTitle: "The tools",
    accessLabel: "Access",
    mainTitle: "The main products",
    mainLead:
      "These products are at the heart of Nexora AI. Nexora Apps complement them.",
    infra: {
      label: "Infrastructure",
      title: "Physical or virtual AI infrastructure.",
      text: "When data has to stay with you, Nexora AI sets up the AI infrastructure for you: physical, installed on your premises by our technicians (for example DGX Spark or DGX Station machines, or a cluster of machines), or virtual, on an infrastructure that belongs to your company. OPSYS-AI is installed on this foundation.",
      note: "Every installation starts with a study of your needs. No price or lead time is announced.",
      opsys: "Discover OPSYS-AI",
      study: "Request a deployment study",
    },
    closing: {
      title: "Missing a tool?",
      text: "Tell us what you are looking for: the waiting list on each page helps us know what to build first.",
      button: "Write to the team",
    },
  },

  detail: {
    back: "All Nexora Apps",
    stateLabel: "State",
    answerTitle: "The short answer",
    audienceTitle: "Who it is for",
    accessTitle: "How you get it",
    readyTitle: "What is ready",
    comingTitle: "What is coming",
    nothingReady: "Nothing is shipped yet.",
    comingNote: "No date is announced.",
    faqTitle: "Frequently asked questions",
    relatedTitle: "See also",
    waitlist: {
      title: "Be told when it ships.",
      text: "Join the waiting list: the contact form fills in your request for you. We write back to the address you give, without announcing a date.",
      button: "Join the waiting list",
    },
    contact: {
      title: "A question?",
      text: "Write to the team: the contact form fills in your request for you. We answer at the address you give.",
      button: "Write to the team",
    },
  },

  apps: {
    code: {
      name: "Nexora Code",
      answer:
        "Nexora Code is a code agent that understands, edits and tests code with you, in a work environment hosted on Nexora AI’s servers: nothing to install on your computer. The tool is designed to be free; whatever it has a model do uses credits. It is not delivered yet: no date is announced.",
      hook: "A code agent in an environment hosted on our servers, linked to your Nexora account. The tool is planned as free; the models use credits.",
      audience:
        "For developers and technical teams who want a code assistant connected to Nexora AI models, with nothing to install on their computer.",
      accessLabel: "Tool planned as free, models in credits",
      accessText:
        "Nexora Code is designed to be free. Anything the agent has a model do uses credits, your subscription credits first, then your top-up credits. The space of your hosted environment counts toward your plan’s storage. No price is published to date.",
      ready: [],
      coming: [
        "A work environment for each person, hosted on Nexora AI’s servers and opened from your client panel: nothing to install on your computer.",
        "An optional terminal command that signs in to your Nexora account.",
        "Compatibility with Claude Code and Codex plugins, in addition to Nexora Code’s own plugins; whatever cannot be translated is flagged, never silently ignored.",
        "A connection to Nexora RAG, so the agent knows your documents.",
        "A pass through Privacy Router for everything that leaves for a model.",
      ],
      faq: [
        {
          question: "Is it really free?",
          answer:
            "That is the intention: the tool is designed to be free. Whatever the agent has a model do uses credits, because models have a cost. Nothing is shipped yet and no terms of use are published.",
        },
        {
          question: "Can I use it without installing anything?",
          answer:
            "That is the principle: your environment is hosted on our servers and opens from your client panel. An optional terminal command is also planned. None of this is shipped today.",
        },
        {
          question: "Where are my files?",
          answer:
            "In your environment, on Nexora AI’s servers. They count toward your plan’s storage. When storage is full, writes are refused with a clear message, but you can still read and delete your files.",
        },
        {
          question: "Will my Claude Code or Codex plugins work?",
          answer:
            "That is planned: Nexora Code will read Claude Code and Codex plugins. Whatever cannot be translated will be flagged, never silently ignored. Nothing is shipped today.",
        },
        {
          question: "Will my code be sent to an external model?",
          answer:
            "Anything sent to a model will go through Nexora Privacy Router, included by default, which applies your organization’s policy. This connection is part of what is coming: nothing is shipped today.",
        },
        {
          question: "How do I find out when it ships?",
          answer:
            "Join the waiting list with the button on this page. We write to you when it ships and we do not announce a date.",
        },
      ],
    },

    gitspace: {
      name: "Nexora Gitspace",
      answer:
        "Nexora Gitspace is Nexora AI’s code repository forge, designed so AI agents connect to it directly. It is planned as a subscription. It is not delivered yet: no price and no date are announced, and the exact hosting location will be stated before any subscription.",
      hook: "The code repository forge built for AI agents, which connect to it directly. By subscription.",
      audience:
        "For teams that want their agents to work in the same forge as their code, with a human review before every merge.",
      accessLabel: "By subscription (planned)",
      accessText:
        "Nexora Gitspace will be offered by subscription. No price is published today; it will be shown here before any sale.",
      ready: [],
      coming: [
        "Repositories, branches and merge requests that agents drive directly.",
        "Project memory and guardrails, with a human review before merging.",
        "A subscription managed from your Nexora AI client area.",
      ],
      faq: [
        {
          question: "How does Gitspace differ from GitHub or GitLab?",
          answer:
            "Gitspace is designed so AI agents connect to it directly. These are design goals, not shipped features. The Gitspace page has the details. In the meantime, our repositories are on GitLab.",
        },
        {
          question: "Where will my repositories be hosted?",
          answer:
            "In your Nexora AI cloud space. The exact hosting location will be stated before any subscription. Nothing is shipped today.",
        },
        {
          question: "How much will Nexora Gitspace cost?",
          answer:
            "It will be offered by subscription. No price is published today: we only announce what we can stand behind.",
        },
        {
          question: "Can I migrate my existing repositories?",
          answer:
            "Migration details will be specified when it ships. We promise nothing at this stage.",
        },
      ],
    },

    cloud: {
      name: "Nexora Cloud",
      answer:
        "Nexora Cloud is the Nexora AI cloud space, with a built-in code repository of your choice: GitLab or Forgejo. It is planned as a subscription. It is not delivered yet: no price and no date are announced, and the hosting location will be stated before any subscription.",
      hook: "Your Nexora AI cloud space, with a built-in code repository: GitLab or Forgejo. As a subscription.",
      audience:
        "For companies that want their work and their code in a space of their own, at Nexora AI, rather than across several third-party services.",
      accessLabel: "Subscription (planned)",
      accessText:
        "Nexora Cloud will be offered as a subscription. No price is published to date; it will be shown here before any sale.",
      ready: [] as string[],
      coming: [
        "A cloud space managed from your Nexora AI customer area.",
        "A built-in code repository, of your choice: GitLab or Forgejo.",
        "A connection to Nexora AI’s RAG, to Nexora Code and to OPSYS-AI.",
      ],
      faq: [
        {
          question: "What is Nexora Cloud?",
          answer:
            "Nexora AI’s cloud space: a place of your own, managed from your customer area, where a code repository is built in. Nothing is delivered to date.",
        },
        {
          question: "Where will the code repository live?",
          answer:
            "The code repository (GitLab or Forgejo) will be built into your Nexora Cloud space. It is planned as a subscription along with the space, and nothing is delivered yet.",
        },
        {
          question: "Where will it be hosted?",
          answer:
            "In Nexora AI’s infrastructure. The exact hosting location will be stated before any subscription; we announce none before we can prove it.",
        },
        {
          question: "How much will Nexora Cloud cost?",
          answer:
            "It will be offered as a subscription. No price is published to date: we announce only what we can hold.",
        },
      ],
    },

    rag: {
      name: "Nexora RAG",
      answer:
        "Nexora RAG turns your documents into a base the AI queries while showing its sources. You create it in one click, then connect it to Nexora Code, a bot or another tool with an API key. You pay for the space used and for embedding and rerank tokens, in credits. It is not delivered yet.",
      hook: "Your documents become a base that AI queries, with sources to back it up. Created in one click, with an API key; space and tokens paid in credits.",
      audience:
        "For companies whose answers already sit in their documents: procedures, contracts, manuals, technical sheets.",
      accessLabel: "Pay per use: space and tokens (planned)",
      accessText:
        "Nexora RAG is planned as pay-per-use: you pay for the space your documents and their vectors take, counted in your plan’s storage, and for embedding and rerank tokens, paid with your credits. No price is published to date.",
      ready: [
        "WorkStudio’s knowledge bases already exist: your documents are indexed there (filed so they can be found fast) and agents answer with their sources.",
      ],
      coming: [
        "A base created in one click from your client panel, with its API key.",
        "Indexing of your documents and querying them, with the sources of each answer.",
        "An MCP server and an HTTP API to connect the base to Nexora Code, a bot or another tool.",
        "A connection to OPSYS-AI and to your company’s infrastructure, at a later stage.",
      ],
      faq: [
        {
          question: "What is RAG?",
          answer:
            "RAG stands for retrieval-augmented generation: before answering, the AI finds the useful passages in your documents and relies on them. The answer shows its sources, so it can be checked.",
        },
        {
          question: "What exactly do I pay for?",
          answer:
            "The space your documents and their vectors take, which counts toward your plan’s storage, and embedding and rerank tokens, paid with your credits. Nothing is shipped today and no price is published.",
        },
        {
          question: "How do I use it with my bot or my code agent?",
          answer:
            "Once created, the base has its API key. An MCP server and an HTTP API are planned to connect it to Nexora Code, a bot or another tool, from your client panel.",
        },
        {
          question: "Are my documents used to train a model?",
          answer:
            "No. Nexora AI commits to never using your data to train a model and to never selling it. The commitments are detailed on the Your data page.",
        },
        {
          question: "Can I use it with my own server?",
          answer:
            "That is the intention, at a later stage: Nexora RAG is planned to connect to your company’s infrastructure. Details will be specified when it ships.",
        },
        {
          question: "How is it different from WorkStudio’s knowledge base?",
          answer:
            "WorkStudio’s is shipped and serves the agents built in WorkStudio. Nexora RAG is planned as a separate service that other tools will be able to query.",
        },
      ],
    },

    bot: {
      name: "Nexora Bot",
      answer:
        "Nexora Bot is a bot that connects to your Nexora account and works with your subscription or your top-ups. It is designed to be free; the models it calls use credits. Its code is planned to be open so you can install it yourself. It is not delivered yet: no date is announced.",
      hook: "A bot that connects to your Nexora account. Planned as free, with models paid in credits; its code will be open so you can install it yourself.",
      audience:
        "For anyone or any small team who wants an assistant with nothing to configure, and for developers who want a base to build on.",
      accessLabel: "Planned as free, models in credits",
      accessText:
        "Nexora Bot is designed to be free. It connects to your Nexora account and works with your subscription or your top-ups: anything it has a model do uses credits, at the catalogue price.",
      ready: [] as string[],
      coming: [
        "The bot, connected to your Nexora account: no model setup to do.",
        "Operation with your subscription or your credit top-ups.",
        "The code published as free software, to study, change and improve with us.",
        "A connection to Nexora RAG, so the bot knows your documents.",
      ],
      faq: [
        {
          question: "Is Nexora Bot available?",
          answer:
            "Not yet, neither for download nor online on this site. We do not announce a date. The waiting list is the best way to be notified.",
        },
        {
          question: "Under which licence will it be published?",
          answer:
            "The code will be published as free software. The exact licence will be announced with the publication, not before.",
        },
        {
          question: "Is model usage free?",
          answer:
            "No: the bot is designed to be free, but the models it calls use credits, your subscription credits first, then your top-up credits.",
        },
        {
          question: "Do I need a subscription?",
          answer:
            "A subscription or a top-up is enough. As long as you have credits left, the bot can call the models. Nothing is shipped today.",
        },
      ],
    },

    wordpress: {
      name: "Nexora WordPress plugins",
      answer:
        "The Nexora WordPress plugins include a plugin planned as free and a site automation planned as a subscription: search visibility, blog posts, updates. Nothing is delivered yet, and neither price nor date is announced.",
      hook: "A free WordPress plugin, and website automation on subscription: search ranking, blog articles, updates.",
      audience:
        "For WordPress site owners, small businesses and agencies who want a site that stays up to date and gets found, without spending their evenings on it.",
      accessLabel: "Free plugin, automation on subscription (planned)",
      accessText:
        "The plugin is planned to be free and open. Site automation (search ranking, articles) is planned on subscription; whatever it has a model do uses credits. No price is published yet.",
      ready: [] as string[],
      coming: [
        "A free WordPress plugin, with open code.",
        "Automation of your site's search ranking.",
        "Writing blog articles, which you review before publishing.",
        "Workflow logic for a website, in the spirit of WorkStudio.",
        "Clear terms for commercial use, announced with the licence.",
      ],
      faq: [
        {
          question: "Is the plugin available?",
          answer:
            "No, not yet. We are not announcing a date. The waiting list is the best way to be told.",
        },
        {
          question: "What is free and what is paid?",
          answer:
            "The plugin is planned to be free. Automation (search ranking, articles) is planned on subscription, and whatever it has a model do uses credits. Prices will be shown before any sale.",
        },
        {
          question: "What about commercial use?",
          answer:
            "Commercial-use terms are planned. They will be published with the licence; nothing is settled yet.",
        },
        {
          question: "Are articles published without my seeing them?",
          answer:
            "The principle is that you review before publishing, as in WorkStudio where a person validates sensitive steps.",
        },
      ],
    },

    webpilot: {
      name: "Nexora WebPilot",
      answer:
        "Nexora WebPilot is an API to search, read and explore the web, then browse and act on pages. It is planned as pay-as-you-go, like a model, with Nexora Privacy Router. It is not delivered yet: no date is announced.",
      hook: "An API to search, read and explore the web, then navigate and act on pages. Sold by usage, like a model.",
      audience:
        "For developers and AI agents that need the web: search, page reading, site exploration, automated browsing.",
      accessLabel: "By usage (planned)",
      accessText:
        "Nexora WebPilot is planned by usage, with the same credit balance as Nexora AI’s models. No price is published today.",
      ready: [],
      coming: [
        "Web search.",
        "Reading a page, returned as clean text.",
        "Exploring a site, page after page.",
        "Extracting structured data from a page.",
        "Browser sessions: navigating pages and acting on them.",
        "Billing per page processed and per browser minute, drawn from your balance.",
        "Your organization’s policy applied by Privacy Router before anything leaves.",
      ],
      faq: [
        {
          question: "When will WebPilot be available?",
          answer:
            "We do not announce a date. The API contract is in preparation and nothing is shipped today. The waiting list is the best way to be told.",
        },
        {
          question: "How will it be billed?",
          answer:
            "By usage, from your credit balance, like Nexora AI’s models. The planned units are the page processed and the browser minute. When the balance is empty, the API answers 402. No price is published; it will be shown before any sale.",
        },
        {
          question: "Does what WebPilot retrieves go through Privacy Router?",
          answer:
            "That is the plan: your organization’s policy applies before anything leaves, since Privacy Router is included by default. This connection is part of what is coming.",
        },
        {
          question: "Can I use it with my own agent?",
          answer:
            "That is the intended use: an API called with your Nexora AI key, like the models API. The exact format will be published with the documentation.",
        },
      ],
    },

    "privacy-router": {
      name: "Nexora Privacy Router",
      answer:
        "Nexora Privacy Router is the layer that controls what leaves Nexora AI toward a third party, according to your organization’s policy. It is included by default in all products, at no extra cost. It is already in place in the API gateway, which is not yet open for sale; the other products will follow.",
      hook: "Nexora AI’s shared protection layer: it controls what leaves, according to your organization’s policy. Included, never paid.",
      audience:
        "For any organization that wants to decide which data may leave its environment, toward which models and services, without buying one more product.",
      accessLabel: "Included by default, never paid",
      accessText:
        "Nexora Privacy Router is included by default with Nexora AI. It is never paid: not sold separately, not billed as an extra.",
      ready: [
        "The public model catalogue already shows, for each model, where it runs.",
        "In WorkStudio, a workspace’s data policies allow, mask or refuse sending personal information to a model outside the instance.",
        "In the API gateway, each chat and embeddings request is evaluated before the call to the provider: masking of six kinds of obvious information, refusal according to the organization’s policy, refusal as a precaution if the layer cannot decide, a log of decisions without content. The gateway is not yet open for sale.",
        "Three policy levels per organization (standard, reinforced, strict sovereign), set by the owner in the customer area.",
      ],
      coming: [
        "Connecting WebPilot and WorkStudio to the same layer: the interface provides for it, but it is not done yet.",
        "A retention period for the log, still to be set: no automatic purge exists yet.",
      ],
      faq: [
        {
          question: "Is Privacy Router paid?",
          answer:
            "No. It is included by default and it will never be paid: not sold separately, not billed as an extra. It is part of how Nexora AI handles your data.",
        },
        {
          question: "What exactly does it control?",
          answer:
            "What leaves your environment: which data may go to which model or service. Each organization has its own policy: a level, kinds of information masked or refused, lists of models and destinations. In the API gateway, it masks six kinds of obvious information; its detection is heuristic (it does not recognize names or postal addresses) and it does not prove where a provider then processes the data.",
        },
        {
          question: "What is strict sovereignty?",
          answer:
            "A policy level where nothing leaves unless explicitly allowed: without a list of allowed models and destinations, everything is refused. It replaces neither legal advice nor proof of data residency.",
        },
        {
          question: "Is any of it used today?",
          answer:
            "Yes, in the API gateway, which is however not yet open for sale. The catalogue also shows where each model runs, and WorkStudio lets you allow, mask or refuse sending personal information to an external model. Connecting WebPilot and WorkStudio to the same layer is still to do.",
        },
      ],
    },

    creative: {
      name: "Nexora Creative",
      answer:
        "Nexora Creative is a video, image and music studio powered by AI: you describe a scene in plain language, and it writes the shooting plan, shoots the video with sound, composes the music and edits the film. It runs as a demonstration on Nexora’s servers; it is not yet open in your account and no date is announced.",
      hook: "One sentence, a video with sound and music. In preparation: the trailer below was created with its engines. No date.",
      audience:
        "For marketing teams, creators and SMEs that produce videos, visuals and sounds for their campaigns.",
      accessLabel: "To be defined",
      accessText:
        "Nexora Creative’s access model has not been decided. The principle is the same as every Nexora tool: whatever calls a model uses credits, with the quote shown before each creation, and the files created count toward your plan’s storage. No price is published.",
      ready: [] as string[],
      coming: [
        "Video creation with sound, from a sentence or a photo.",
        "Multi-shot films, editable shot by shot.",
        "Original music and publishing texts.",
        "Opening in your Nexora account, with credit tracking.",
      ],
      faq: [
        {
          question: "When will it open?",
          answer:
            "We announce neither a date nor a final scope. The waiting list lets you be told among the first.",
        },
        {
          question: "How will it be billed?",
          answer:
            "Nothing is decided. The principle is that whatever calls a model uses credits, with a quote before each creation, and that the files created count toward your storage. No price is published.",
        },
        {
          question:
            "Is the video on this page really made with Nexora Creative?",
          answer:
            "The shots and the music were generated with Nexora Creative’s engines (MiniMax H3 and MiniMax-Music3) on Nexora hardware; the final edit and the impact sound effects were made with internal tools. Every image and every sound is AI-generated.",
        },
        {
          question: "Where will it be usable?",
          answer:
            "The licence of the MiniMax H3 video model excludes some territories (United States, European Union, United Kingdom and South Korea). We will assign a territory to each account and show it clearly; this point is being validated.",
        },
        {
          question: "How is it different from Nexora Croissance?",
          answer:
            "Nexora Croissance takes care of an SME’s online presence: website, SEO, advertising and social media. Nexora Creative is for creating videos, images and sounds. The two could complement each other; nothing is decided.",
        },
      ],
    },

    outils: {
      name: "Nexora Free Tools",
      answer:
        "The Nexora free tools are small AI tools, free to open, that use Nexora AI models and servers. Whatever they have a model do uses credits. None is delivered to date, and no release date is announced.",
      hook: "Small AI tools that are free to open, running on Nexora AI’s models and servers; the models they call use credits. None is shipped.",
      audience:
        "For anyone who wants to try Nexora AI’s AI without installing or renting a server.",
      accessLabel: "Planned as free",
      accessText:
        "The free tools are designed to be free to open and run on Nexora AI’s models and servers. Those that call a model use credits, as everywhere in Nexora AI. Terms of use, including any limits, will be published with each tool.",
      ready: [],
      coming: [
        "Simple AI tools, free to open.",
        "Running on Nexora AI’s models and servers, with nothing for you to install.",
        "One page per tool, with its state and its terms of use.",
      ],
      faq: [
        {
          question: "Which tools will be offered?",
          answer:
            "The list is not settled. Each tool will have its own page, with its state and its terms of use.",
        },
        {
          question: "Will my data be used to train a model?",
          answer:
            "No. Nexora AI’s commitment to never use your data to train a model applies to all its products. It is detailed on the Your data page.",
        },
        {
          question: "How do I follow their release?",
          answer:
            "Join the waiting list with the button on this page. We write to you when a first tool is ready, without announcing a date.",
        },
      ],
    },
  },
};
