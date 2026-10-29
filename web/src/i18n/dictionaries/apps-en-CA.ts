import type { AppsDictionary } from "./apps-fr-CA";

/**
 * Nexora Apps dictionary (en-CA): the /apps page and the /apps/<slug> pages. Same structure as the fr-CA one; no
 * invented figures, prices, dates, customers or certifications. A tool that is not shipped is "Soon" or "Later" and
 * its text uses the future or the conditional, never the present tense.
 */
export const appsEnCA: AppsDictionary = {
  meta: {
    list: {
      title: "Nexora Apps: code agent, WebPilot and more | Nexora AI",
      description:
        "Code agent, Gitspace, RAG, WebPilot, Privacy Router and free tools: each page says what is ready and what is coming, with no invented dates.",
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
      name: "Nexora Code Agent",
      hook: "An agent that understands, edits and tests code with you. Planned as free, to download or to use from your client panel.",
      audience:
        "For developers and technical teams who want a code assistant connected to Nexora AI models.",
      accessLabel: "Planned as free",
      accessText:
        "The code agent is designed to be offered for free: to download, or to use from the client panel. The terms of use of the models will be published before it ships.",
      ready: [],
      coming: [
        "A version to download.",
        "A version usable from the client panel, with no installation.",
        "A connection to Nexora AI’s RAG, so the agent knows your documents.",
        "A pass through Privacy Router for everything that leaves for a model.",
      ],
      faq: [
        {
          question: "Is it really free?",
          answer:
            "That is the intention: the code agent is designed to be offered for free. It is not shipped yet and no terms of use are published. This page will be updated when it ships.",
        },
        {
          question: "Can I use it without installing anything?",
          answer:
            "That is planned: a version usable from the client panel, in addition to a downloadable version. Neither is shipped today.",
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
      hook: "Forgejo and GitLab built into your Nexora AI cloud space: host your code repositories alongside everything else. By subscription.",
      audience:
        "For teams that want to keep their code repositories in their company’s cloud space rather than with a third-party service.",
      accessLabel: "By subscription (planned)",
      accessText:
        "Nexora Gitspace will be offered by subscription. No price is published today; it will be shown here before any sale.",
      ready: [],
      coming: [
        "Forgejo, a code hosting software, built into your cloud space.",
        "GitLab, for teams that prefer it, built into the same space.",
        "A subscription managed from your Nexora AI client area.",
      ],
      faq: [
        {
          question: "What is the difference between Forgejo and GitLab?",
          answer:
            "They are two code hosting software products, each with its own features. Nexora Gitspace is designed to build both into your cloud space; the choice will be made with you. Details on each will be published when it ships.",
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

    rag: {
      name: "Nexora RAG",
      hook: "Your documents become a base that AI queries, with sources to back it up. By subscription, connectable to the code agent, OPSYS-AI or your infrastructure.",
      audience:
        "For companies whose answers already sit in their documents: procedures, contracts, manuals, technical sheets.",
      accessLabel: "By subscription (planned)",
      accessText:
        "Nexora RAG will be offered by subscription. No price is published today; it will be shown here before any sale.",
      ready: [
        "WorkStudio’s knowledge bases already exist: your documents are indexed there (filed so they can be found fast) and agents answer with their sources.",
      ],
      coming: [
        "A separate RAG service, by subscription.",
        "A connection to Nexora AI’s code agent.",
        "A connection to OPSYS-AI.",
        "A connection to your company’s infrastructure.",
      ],
      faq: [
        {
          question: "What is RAG?",
          answer:
            "RAG stands for retrieval-augmented generation: before answering, the AI finds the useful passages in your documents and relies on them. The answer shows its sources, so it can be checked.",
        },
        {
          question: "Are my documents used to train a model?",
          answer:
            "No. Nexora AI commits to never using your data to train a model and to never selling it. The commitments are detailed on the Your data page.",
        },
        {
          question: "Can I use it with my own server?",
          answer:
            "That is the intention: Nexora RAG is planned to connect to your company’s infrastructure. Details will be specified when it ships.",
        },
        {
          question: "How is it different from WorkStudio’s knowledge base?",
          answer:
            "WorkStudio’s is shipped and serves the agents built in WorkStudio. Nexora RAG is planned as a separate service, by subscription, that other tools will be able to query.",
        },
      ],
    },

    bot: {
      name: "Nexora Bot",
      hook: "A free bot connected to Nexora AI's models, which you can also install yourself: the code will be open.",
      audience:
        "For anyone or any small team who wants an assistant with nothing to configure, and for developers who want a base to build on.",
      accessLabel: "Free",
      accessText:
        "Nexora Bot is free. It uses Nexora AI's models; model usage is paid from your wallet.",
      ready: [] as string[],
      coming: [
        "The bot, connected to Nexora AI's models.",
        "The code published as free software, to study, change and improve with us.",
        "A simple install, with no model setup.",
      ],
      faq: [
        {
          question: "Is Nexora Bot available?",
          answer:
            "Not yet for download or online on this site. We are not announcing a date. The waiting list is the best way to be told.",
        },
        {
          question: "Under which licence will it be released?",
          answer:
            "The code will be published as free software. The exact licence will be announced with the release, not before.",
        },
        {
          question: "Is model usage free?",
          answer:
            "The bot is free; the tokens used with the models are charged to your wallet, at the price shown in the catalogue.",
        },
      ],
    },

    wordpress: {
      name: "Nexora WordPress plugins",
      hook: "A free WordPress plugin, and website automation on subscription: search ranking, blog articles, updates.",
      audience:
        "For WordPress site owners, small businesses and agencies who want a site that stays up to date and gets found, without spending their evenings on it.",
      accessLabel: "Free plugin, automation on subscription (planned)",
      accessText:
        "The plugin is planned to be free and open. Site automation (search ranking, articles) is planned on subscription. No price is published yet.",
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
            "The plugin is planned to be free. Automation (search ranking, articles) is planned on subscription. Prices will be shown before any sale.",
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
      hook: "Nexora AI’s shared protection layer: it controls what leaves, according to your organization’s policy. Included, never paid.",
      audience:
        "For any organization that wants to decide which data may leave its environment, toward which models and services, without buying one more product.",
      accessLabel: "Included by default, never paid",
      accessText:
        "Nexora Privacy Router is included by default with Nexora AI. It is never paid: not sold separately, not billed as an extra.",
      ready: [
        "The public model catalogue already shows, for each model, where it runs.",
        "In WorkStudio, a workspace’s data policies allow, mask or refuse sending personal information to a model outside the instance.",
      ],
      coming: [
        "A shared checkpoint before any data leaves, for models, WebPilot and the other tools.",
        "A policy per customer, which you set for your organization.",
        "Strict sovereignty, as an option: nothing is sent outside the environment you chose.",
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
            "What leaves your environment: which data may go to which model or service. Each organization has its own policy. The details of the settings will be published with the documentation; the shared layer is not shipped under this name today.",
        },
        {
          question: "What is strict sovereignty?",
          answer:
            "A policy where nothing leaves the environment you chose: no data is sent to an outside model or service. It is possible in Privacy Router’s plan, without being shipped, and it does not replace legal advice.",
        },
        {
          question: "Is any of it used today?",
          answer:
            "Part of the principle already exists: the catalogue shows where each model runs, and WorkStudio lets you allow, mask or refuse sending personal information to an external model. The shared layer itself is still to come.",
        },
      ],
    },

    creative: {
      name: "Nexora Creative",
      hook: "Image, sound and video tools for marketing, with AI. A later stage of Nexora Apps: nothing is shipped, and there is no date.",
      audience:
        "For marketing teams and small businesses that produce visuals, sounds and videos for their campaigns.",
      accessLabel: "To be defined",
      accessText:
        "How Nexora Creative will be offered is not settled. No price is published.",
      ready: [],
      coming: [
        "Creating and retouching images.",
        "Voice, music and sound.",
        "Video editing and generation.",
      ],
      faq: [
        {
          question: "When will Nexora Creative ship?",
          answer:
            "Later. It is a later stage of Nexora Apps: we announce neither a date nor a final scope.",
        },
        {
          question: "How is it different from Nexora Croissance?",
          answer:
            "Nexora Croissance takes care of a small business’s online presence: website, search, advertising and social networks. Nexora Creative would be a set of tools for creating images, sounds and videos. The two could complement each other; nothing is decided.",
        },
        {
          question: "Can I say what interests me first?",
          answer:
            "Yes. The waiting list lets us know which tools matter most to you before we build them.",
        },
      ],
    },

    outils: {
      name: "Nexora Free Tools",
      hook: "Small AI tools offered for free, running on Nexora AI’s models and servers. None is shipped today.",
      audience:
        "For anyone who wants to try Nexora AI’s AI without installing or renting a server.",
      accessLabel: "Planned as free",
      accessText:
        "The free tools are planned at no charge and run on Nexora AI’s models and servers. Terms of use, including any limits, will be published with each tool.",
      ready: [],
      coming: [
        "Simple AI tools, offered for free.",
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
