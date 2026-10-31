import type { Dictionary } from "./fr-CA";

/**
 * Dictionnaire d'interface en-CA : même structure que fr-CA (vérifiée par le type `Dictionary`).
 * Anglais canadien (orthographe : center, organization/organisation selon l'usage canadien, « Quebec »
 * sans accent). Mêmes règles de vérité que la version française : aucun chiffre, client ou
 * certification inventé.
 */
export const enCA: Dictionary = {
  meta: {
    siteName: "Nexora AI",
    home: {
      title: "Nexora AI | Sovereign AI for your business, in Quebec",
      description:
        "Nexora AI: one account, your credits, all your AI tools, and systems designed for your business, on your premises or in Quebec. You keep control of your data.",
    },
    notFound: {
      title: "Page not found | Nexora AI",
    },
  },

  a11y: {
    skipToContent: "Skip to content",
    homeLink: "Nexora AI, back to the home page",
    mainNav: "Main navigation",
    mobileNav: "Mobile navigation",
    footerNav: "Footer",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    menuTitle: "Menu",
    menuButton: "Menu",
    closeButton: "Close",
    languageNav: "Language",
  },

  language: {
    label: "Language",
    fr: { short: "FR", name: "Français (Canada)" },
    en: { short: "EN", name: "English (Canada)" },
  },

  nav: {
    sovereignty: { label: "Sovereign AI", href: "/souverainete" },
    solutions: { label: "Solutions", href: "/solutions" },
    products: {
      label: "Products",
      items: [
        {
          label: "VPS",
          description:
            "Virtual private servers in Quebec, with the application of your choice.",
          href: "/vps",
        },
        {
          label: "Models and API",
          description:
            "One gateway to many models, with data residency shown for each.",
          href: "/modeles",
        },
        {
          label: "WorkStudio",
          description: "The studio for designing agents and workflows.",
          href: "/workstudio",
        },
        {
          label: "Nexora Apps",
          description:
            "Nexora Code, Gitspace, RAG, WebPilot, Privacy Router and free tools. The state of each is shown.",
          href: "/apps",
        },
        {
          label: "Software suite",
          description:
            "Nexora Code and RAG in preparation, Corpus, Quanta and Helix: the status of each is shown.",
          href: "/suite",
        },
        {
          label: "OPSYS-AI",
          description:
            "A coordinated team for construction and field services.",
          href: "/opsys-ai",
        },
      ],
    },
    pricing: { label: "Pricing", href: "/tarifs" },
    resources: { label: "Resources", href: "/ressources" },
    login: { label: "Sign in", href: "/compte" },
    accountLabel: "My tools",
    cta: { label: "Book an assessment", href: "/contact" },
  },

  footer: {
    tagline: "AI that works for your business. Under your control.",
    location: "A Quebec AI company.",
    quick: {
      title: "Quick access",
      myTools: {
        label: "My tools",
        text: "Your tools, credits and access in one place.",
        href: "/compte",
      },
      pricing: {
        label: "Pricing",
        text: "The subscription, the credits and what they cover.",
        href: "/tarifs",
      },
      contact: {
        label: "Book an assessment",
        text: "Let’s talk about your project, no strings attached.",
        href: "/contact",
      },
    },
    columns: [
      {
        title: "Products",
        links: [
          { label: "VPS", href: "/vps" },
          { label: "Models and API", href: "/modeles" },
          { label: "WorkStudio", href: "/workstudio" },
          { label: "Nexora Apps", href: "/apps" },
          { label: "My tools", href: "/compte" },
          { label: "Software suite", href: "/suite" },
          { label: "OPSYS-AI", href: "/opsys-ai" },
          { label: "Nexora Croissance", href: "/croissance" },
          { label: "Nexora Vision", href: "/vision" },
        ],
      },
      {
        title: "Solutions",
        links: [
          { label: "All solutions", href: "/solutions" },
          { label: "Email", href: "/solutions/courriels" },
          { label: "Invoices", href: "/solutions/factures" },
          { label: "Customer service", href: "/solutions/service-client" },
          { label: "Appointment booking", href: "/solutions/rendez-vous" },
          { label: "Accounting", href: "/solutions/comptabilite" },
          { label: "Documents", href: "/solutions/documents" },
        ],
      },
      {
        title: "Company",
        links: [
          { label: "Services", href: "/services" },
          { label: "Deployment modes", href: "/deploiement" },
          { label: "Method", href: "/methode" },
          { label: "About", href: "/entreprise" },
          { label: "Pricing", href: "/tarifs" },
          { label: "Contact", href: "/contact" },
        ],
      },
      {
        title: "Trust center",
        links: [
          { label: "Sovereignty", href: "/souverainete" },
          { label: "Your data", href: "/vos-donnees" },
          { label: "Law 25", href: "/souverainete/loi-25" },
          { label: "Trust center", href: "/centre-de-confiance" },
          { label: "Frequently asked questions", href: "/faq" },
          { label: "Resources", href: "/ressources" },
        ],
      },
    ],
    legalTitle: "Legal",
    legal: [
      { label: "Legal notice", href: "/mentions-legales" },
      { label: "Privacy", href: "/confidentialite" },
      { label: "Terms of use", href: "/conditions" },
      { label: "Acceptable use", href: "/utilisation-acceptable" },
    ],
    copyright: "© Nexora AI. All rights reserved.",
  },

  notFound: {
    label: "Error 404",
    title: "This page does not exist.",
    text: "The link may be wrong, or the page may not be published yet.",
    cta: "Back to the home page",
  },

  cms: {
    priceOnRequest: "On request",
    toc: { label: "On this page" },
    byline: {
      by: "By {name}",
      published: "Published",
      updated: "Updated",
    },
    status: {
      disponible: "Available",
      "acces-anticipe": "Early access",
      "qualifie-localement": "Locally qualified",
      "en-developpement": "In development",
      pilote: "Pilot",
      prevu: "Planned",
      legend: "Status",
    },
    modules: { detail: "See details" },
    visuals: {
      "perimetre-sur-place":
        "Diagram: a single perimeter surrounds your data, the model and the compute, on your premises. A request enters through a controlled gateway and stays inside.",
      "perimetre-heberge":
        "Diagram: your data crosses a controlled gateway into the perimeter of Nexora AI’s infrastructure in Quebec, where the model and the storage are.",
      "flux-donnees":
        "Diagram: your documents enter through a controlled gateway to the model, inside the perimeter. What the system prepares leaves only after a person approves it.",
      "flux-workstudio":
        "Mock-up of the Nexora WorkStudio flow editor: a supplier-invoice workflow, from the received email to the accounting entry, that waits for a person’s approval before writing anything.",
      "catalogue-modeles":
        "Mock-up of the model catalogue: search, filters by capability and hosting location, a few models and an example of an OpenAI-compatible call.",
      "console-vps":
        "Mock-up of the console of a virtual private server in Quebec: active state, region, key-based access, firewall, terminal and usage curves.",
      "tableau-de-bord":
        "Mock-up of the account dashboard: credit balance, monthly cap, calls per day and masked API keys.",
      "vision-sur-place":
        "Conceptual diagram: cameras are connected to a server installed on the site. The images stay there; only a written alert leaves through the gateway.",
      "croissance-canaux":
        "Conceptual diagram: your trade and your region go into Nexora Croissance, which makes the website, organic search, Google and Microsoft ads, social networks and market analysis work together to produce customer enquiries.",
      "engagements-donnees":
        "The five commitments on your data: it stays with you or in Quebec, is never used to train a model, is never sold, and no external model is used without your written agreement.",
    },
    preview: {
      banner: "Preview — not published",
      version: "Version:",
      noVersion: "No version in progress: showing the page’s main content",
      pageStatus: "status",
      exit: "Exit preview",
    },
    unavailable: {
      label: "Content unavailable",
      title: "This page is temporarily unavailable.",
      text: "We can’t read the content right now. Please try again in a few moments.",
      cta: "Back to home",
    },
  },

  contact: {
    meta: {
      title: "Contact us | Nexora AI",
      description:
        "Describe your need in a few questions: Nexora AI records your request and the team writes back. Installed on your premises or hosted in Quebec.",
    },
    label: "Contact",
    title: "Let’s talk about your need.",
    lead: "A few questions to understand your situation, then your contact details. The message is optional.",
    next: {
      title: "What happens next",
      items: [
        "Your request is recorded as soon as you send it.",
        "The Nexora AI team is notified by email.",
        "We write to the address you give us.",
      ],
      note: "We do not announce a response time. Sending this form commits you to nothing.",
    },
    noscript:
      "This form requires JavaScript: the anti-abuse check is computed in your browser, with no third-party service.",
    form: {
      label: "Contact request",
      step: "Step {n} of {total}",
      steps: ["Your need", "Your details"],
      required: "required",
      optional: "optional",
      next: "Continue",
      back: "Back",
      submit: "Send my request",
      sending: "Sending…",
      errorsTitle: "The form contains errors.",
      need: {
        label: "What do you need?",
        options: {
          diagnostic: "An assessment to pin down my need",
          installation: "Installation of an AI server",
          automatisation: "Custom automation",
          "opsys-ai": "OPSYS-AI (construction and field services)",
          workstudio: "Nexora WorkStudio",
          vision: "Nexora Vision (pilot project, by invitation)",
          croissance: "Nexora Croissance (early access)",
          "vps-api": "A virtual private server, models or the API",
          autre: "Something else",
        },
      },
      sector: {
        label: "Your line of business",
        placeholder: "Choose a sector",
        options: {
          construction: "Construction and field services",
          "services-professionnels": "Professional services",
          sante: "Health and social services",
          commerce: "Retail and customer services",
          industrie: "Industry and manufacturing",
          technologie: "Technology and development",
          autre: "Other sector",
        },
      },
      deployment: {
        label: "Deployment mode you have in mind",
        hint: "This choice decides nothing: it helps us prepare the conversation.",
        options: {
          "sur-place": "On your premises, on your own server",
          heberge: "Hosted in Quebec by Nexora AI",
          indecis: "I don’t know yet",
        },
      },
      name: { label: "Your name", autocomplete: "name" },
      email: { label: "Your email", autocomplete: "email" },
      company: { label: "Your company", autocomplete: "organization" },
      message: {
        label: "Your message",
        hint: "Optional: the context, where you lose time, the tools you use today.",
        // Text filled in by the "waiting list" links of the Nexora Apps pages (?sujet=apps-…), editable.
        prefill: {
          "apps-code": "Waiting list: Nexora Code.",
          "apps-bot": "Waiting list: Nexora Bot.",
          "apps-wordpress": "Waiting list: Nexora WordPress plugins.",
          "apps-gitspace": "Waiting list: Nexora Gitspace.",
          "apps-cloud": "Waiting list: Nexora Cloud.",
          "apps-rag": "Waiting list: Nexora RAG.",
          "apps-webpilot": "Waiting list: Nexora WebPilot.",
          "apps-privacy-router": "Question about Nexora Privacy Router: ",
          "apps-creative": "Waiting list: Nexora Creative.",
          "apps-outils": "Waiting list: Nexora free tools.",
          "modele-apercu": "Please let me know when this model opens: ",
          "ouverture-plateforme":
            "Please let me know when the credit platform opens.",
        },
      },
      consentMarketing: {
        label: "I would also like to receive news from Nexora AI by email.",
        hint: "Optional and separate from your request: leave this box unchecked to simply write to us.",
      },
      privacy: {
        before:
          "The information you enter is used to answer your request. See the ",
        link: "privacy policy",
        after: ".",
      },
      honeypot: "Do not fill in this field",
      altchaLabel: "Anti-abuse check",
      altchaPending:
        "Please wait: the anti-abuse check is finishing in your browser.",
    },
    errors: {
      required: "This field is required.",
      invalid_email: "This email address doesn’t look valid.",
      invalid_choice: "Choose one of the options offered.",
      too_long: "This text is too long.",
      invalid_chars: "This field contains characters that are not allowed.",
      altcha:
        "The anti-abuse check did not succeed. Please try again in a moment.",
      rate_limited:
        "Too many requests from your connection. Please try again in a few minutes.",
      storage:
        "Your request could not be recorded: nothing was kept. Please try again in a moment.",
      network:
        "The server isn’t responding. Check your connection and try again.",
      unavailable: "The form is temporarily closed. Please try again later.",
    },
    success: {
      title: "Request recorded.",
      text: "Your request is recorded and the Nexora AI team has been notified. We will write to the address you gave us. We do not announce a response time.",
      already:
        "This request was already recorded: there is no need to send it again. The team has been notified.",
      home: "Back to home",
    },
  },

  home: {
    hero: {
      label: "Sovereign AI in Quebec",
      title: "AI that works for your business. Under your control.",
      subtitle:
        "From managing your requests to automating your operations, Nexora AI designs AI systems tailored to your trade. One account, your credits, all your tools.",
      primary: "Book an assessment",
      secondary: "See solutions",
    },

    family: {
      label: "One account, all your tools",
      title: "One account for the whole Nexora family.",
      lead: "One sign-in, one “My tools” panel, shared credits. Each tool shows its real status: available, coming soon or later.",
      account: "Your Nexora account",
      accountHint: "One sign-in, shared credits",
      seeApps: "See Nexora Apps",
      seeTools: "Open My tools",
      tools: "The tools in the family",
      items: {
        workstudio: {
          name: "Nexora WorkStudio",
          tag: "Agents and workflows",
        },
        code: { name: "Nexora Code", tag: "Hosted coding agent" },
        rag: { name: "Nexora RAG", tag: "Your documents, searchable" },
        bot: { name: "Nexora Bot", tag: "A bot tied to your account" },
        creative: { name: "Nexora Creative", tag: "Image, sound and video" },
        webpilot: { name: "Nexora WebPilot", tag: "Web search and browsing" },
        "privacy-router": {
          name: "Privacy Router",
          tag: "Privacy included",
        },
        vps: { name: "VPS in Quebec", tag: "Virtual private servers" },
      },
    },

    problems: {
      label: "Where to start",
      title: "Start from a concrete problem.",
      lead: "Every Nexora AI system begins with a specific task from your day-to-day work, then grows without adding disconnected tools.",
      items: [
        {
          title: "Scattered requests",
          text: "Emails, forms and messages arrive through different doors. They need to be gathered before anyone answers.",
        },
        {
          title: "Re-entering the same data",
          text: "Connecting your software means no more retyping the same information from one tool to the next.",
        },
        {
          title: "Documents you cannot find",
          text: "Find an answer in your own documents, with its sources, instead of digging through folders.",
        },
        {
          title: "Forgotten follow-ups",
          text: "Every request keeps its next action, its owner, and its due date.",
        },
        {
          title: "Little visibility",
          text: "Readable, sourced indicators that come with their quality, so you can decide with what you have.",
        },
      ],
      cta: "See solutions",
    },

    deployment: {
      label: "Two deployment modes",
      title: "On your premises, or in Quebec.",
      lead: "Either way, you keep control of your data, your access, and the uses you authorize.",
      onsite: {
        label: "On your premises",
        title: "On-premises installation",
        text: "The system is installed on your own infrastructure, under your access rules.",
        diagram:
          "Diagram: a single perimeter surrounds your data, the models, and the compute, on your premises.",
      },
      hosted: {
        label: "In Quebec",
        title: "Hosted by Nexora AI",
        text: "We run the system in our AI infrastructure located in Quebec, with the access and uses you authorize.",
        diagram:
          "Diagram: your data crosses one controlled gate into the perimeter of Nexora AI’s infrastructure in Quebec.",
      },
      cta: "Compare the two modes",
    },

    products: {
      label: "The suite",
      title: "Building blocks, one entry point.",
      lead: "Building blocks that complete each other: you choose the entry point, the rest connects to it.",
      items: [
        {
          label: "VPS",
          title: "Virtual private servers",
          text: "A server in Quebec, with the application of your choice already installed.",
          href: "/vps",
        },
        {
          label: "Models and API",
          title: "A model gateway",
          text: "One access point to many models, hosted in Quebec or in the cloud, each with its data residency.",
          href: "/modeles",
        },
        {
          label: "WorkStudio",
          title: "Nexora WorkStudio",
          text: "The studio for designing agents and workflows.",
          href: "/workstudio",
        },
        {
          label: "Suite",
          title: "Code, RAG, Corpus, Quanta and Helix",
          text: "Nexora Code and RAG are in preparation; Corpus, Quanta and Helix have no date. The real status of each is shown.",
          href: "/suite",
        },
      ],
      more: "Explore the product",
    },

    opsys: {
      label: "Construction and field services",
      title: "A coordinated team for your construction business.",
      text: "OPSYS-AI brings together ten virtual departments that work on the same files, from the first request to job-site follow-up. Autonomy operates within precise permissions; decisions that commit you keep their approvals.",
      departmentsLabel: "The ten departments",
      departments: [
        { code: "M1", name: "Reception" },
        { code: "M2", name: "Customer relations and sales" },
        { code: "M3", name: "Estimating" },
        { code: "M4", name: "Field" },
        { code: "M5", name: "FinanceCore" },
        { code: "M6", name: "Materials" },
        { code: "M7", name: "Marketing" },
        { code: "M8", name: "Analytics" },
        { code: "M9", name: "Strategy" },
        { code: "M10", name: "Memory" },
      ],
      note: "The availability of each capability is stated on the OPSYS-AI page.",
      cta: "Explore OPSYS-AI",
    },

    method: {
      label: "Our method",
      title: "Five steps, from need to operation.",
      steps: [
        {
          title: "Understand",
          text: "We map the task, the tools already in use, and the rules to follow.",
        },
        {
          title: "Integrate",
          text: "We connect the system to your software so nothing has to be re-entered.",
        },
        {
          title: "Verify",
          text: "We test the system on your real cases before it goes live.",
        },
        {
          title: "Train",
          text: "Your team learns to supervise the system and to correct it.",
        },
        {
          title: "Operate and improve",
          text: "We measure, adjust, and maintain over time.",
        },
      ],
      cta: "Explore the method",
    },

    trust: {
      label: "Trust",
      title: "Commitments you can verify.",
      lead: "We only state what the configuration can demonstrate, deployment mode by deployment mode.",
      items: [
        {
          title: "Data",
          text: "Where it is stored and who can access it, documented for each deployment mode.",
        },
        {
          title: "Models",
          text: "Models hosted in Quebec and external cloud models are identified as such. No silent switching.",
        },
        {
          title: "Compute",
          text: "Where processing runs, on your infrastructure or on ours.",
        },
        {
          title: "Operations",
          text: "Who administers, what is logged, and how to roll back.",
        },
      ],
      law: "Documents for your Law 25 approach are in preparation.",
      cta: "Visit the trust center",
      secondary: "Read our approach to sovereignty",
    },

    finalCta: {
      title: "Let’s start with one concrete case.",
      text: "An assessment to pin down the task to automate and the deployment mode that suits you.",
      primary: "Book an assessment",
      secondary: "See solutions",
    },
  },
};
