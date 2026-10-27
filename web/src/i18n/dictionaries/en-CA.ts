import type { Dictionary } from "./fr-CA";

/**
 * Dictionnaire d'interface en-CA : même structure que fr-CA (vérifiée par le type `Dictionary`).
 * Anglais canadien (orthographe : centre, organization/organisation selon l'usage canadien, « Québec »
 * avec accent). Mêmes règles de vérité que la version française : aucun chiffre, client ou
 * certification inventé.
 */
export const enCA: Dictionary = {
  meta: {
    siteName: "Nexora",
    home: {
      title: "Nexora | Sovereign AI for your business, in Québec",
      description:
        "Nexora designs AI systems for your business, installed on your premises or hosted in Québec. You keep control of your data and your access.",
    },
    notFound: {
      title: "Page not found | Nexora",
    },
  },

  a11y: {
    skipToContent: "Skip to content",
    homeLink: "Nexora, back to the home page",
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
            "Virtual private servers in Québec, with the application of your choice.",
          href: "/vps",
        },
        {
          label: "Models and API",
          description:
            "One gateway to many models, with data residency shown for each.",
          href: "/modeles",
        },
        {
          label: "Agents",
          description: "Hosted agents you can call by API with your own key.",
          href: "/agents",
        },
        {
          label: "WorkStudio",
          description: "The studio for designing agents and workflows.",
          href: "/workstudio",
        },
        {
          label: "Software suite",
          description: "Code, Corpus, and the Quanta and Helix models.",
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
    cta: { label: "Book a diagnostic", href: "/contact" },
  },

  footer: {
    tagline: "AI that works for your business. Under your control.",
    location: "A Québec sovereign AI company.",
    columns: [
      {
        title: "Products",
        links: [
          { label: "VPS", href: "/vps" },
          { label: "Models and API", href: "/modeles" },
          { label: "Agents", href: "/agents" },
          { label: "WorkStudio", href: "/workstudio" },
          { label: "Software suite", href: "/suite" },
          { label: "OPSYS-AI", href: "/opsys-ai" },
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
        title: "Trust centre",
        links: [
          { label: "Sovereignty", href: "/souverainete" },
          { label: "Law 25", href: "/souverainete/loi-25" },
          { label: "Trust centre", href: "/centre-de-confiance" },
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
    copyright: "© Nexora. All rights reserved.",
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
    status: {
      disponible: "Available",
      pilote: "Pilot",
      prevu: "Planned",
      legend: "Status",
    },
    modules: { detail: "See details" },
    visuals: {
      "perimetre-sur-place":
        "Diagram: a single perimeter surrounds your data, the model and the compute, on your premises. A request enters through a controlled gateway and stays inside.",
      "perimetre-heberge":
        "Diagram: your data crosses a controlled gateway into the perimeter of Nexora’s infrastructure in Québec, where the model and the storage are.",
      "flux-donnees":
        "Diagram: your documents enter through a controlled gateway to the model, inside the perimeter. What the system prepares leaves only after a person approves it.",
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
      title: "Book a diagnostic | Nexora",
      description:
        "Describe your need in a few questions: Nexora records your request and the team writes back. Installed on your premises or hosted in Québec.",
    },
    label: "Diagnostic",
    title: "Let’s talk about your need.",
    lead: "A few questions to understand your situation, then your contact details. The message is optional.",
    next: {
      title: "What happens next",
      items: [
        "Your request is recorded as soon as you send it.",
        "The Nexora team is notified by email.",
        "We write to the address you give us.",
      ],
      note: "We do not announce a response time. Sending this form commits you to nothing.",
    },
    noscript:
      "This form requires JavaScript: the anti-abuse check is computed in your browser, with no third-party service.",
    form: {
      label: "Diagnostic request",
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
          diagnostic: "A diagnostic to pin down my need",
          installation: "Installation of an AI server",
          automatisation: "Custom automation",
          "opsys-ai": "OPSYS-AI (construction and field services)",
          workstudio: "Nexora WorkStudio",
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
          "sur-place": "On my premises, on my own server",
          heberge: "Hosted in Québec by Nexora",
          indecis: "I don’t know yet",
        },
      },
      name: { label: "Your name", autocomplete: "name" },
      email: { label: "Your email", autocomplete: "email" },
      company: { label: "Your company", autocomplete: "organization" },
      message: {
        label: "Your message",
        hint: "Optional: the context, where you lose time, the tools you use today.",
      },
      consentMarketing: {
        label: "I would also like to receive news from Nexora by email.",
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
      text: "Your request is recorded and the Nexora team has been notified. We will write to the address you gave us. We do not announce a response time.",
      already:
        "This request was already recorded: there is no need to send it again. The team has been notified.",
      home: "Back to home",
    },
  },

  home: {
    hero: {
      label: "Sovereign AI in Québec",
      title: "AI that works for your business. Under your control.",
      subtitle:
        "From answering your calls to automating your operations, Nexora designs AI systems tailored to your trade — installed on your premises or hosted in our infrastructure in Québec.",
      primary: "Book a diagnostic",
      secondary: "See solutions",
    },

    problems: {
      label: "Where to start",
      title: "Start from a concrete problem.",
      lead: "Every Nexora system begins with a specific task from your day-to-day work, then grows without adding disconnected tools.",
      items: [
        {
          title: "Unanswered calls",
          text: "A missed request is a lost request. A system can answer, qualify, and hand over with the right context.",
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
      title: "On your premises, or in Québec.",
      lead: "Either way, you keep control of your data, your access, and the uses you authorize.",
      onsite: {
        label: "On your premises",
        title: "Sovereign installation",
        text: "The system is installed on your own infrastructure, under your access rules.",
        diagram:
          "Diagram: a single perimeter surrounds your data, the models, and the compute, on your premises.",
      },
      hosted: {
        label: "In Québec",
        title: "Hosted by Nexora",
        text: "We run the system in our AI infrastructure located in Québec, with the access and uses you authorize.",
        diagram:
          "Diagram: your data crosses one controlled gate into the perimeter of Nexora’s infrastructure in Québec.",
      },
      cta: "Compare the two modes",
    },

    products: {
      label: "The suite",
      title: "One whole, not stacked subscriptions.",
      lead: "Building blocks that complete each other: you choose the entry point, the rest connects to it.",
      items: [
        {
          label: "VPS",
          title: "Virtual private servers",
          text: "A server in Québec, with the application of your choice already installed.",
          href: "/vps",
        },
        {
          label: "Models and API",
          title: "A model gateway",
          text: "One access point to many models, hosted in Québec or in the cloud, each with its data residency.",
          href: "/modeles",
        },
        {
          label: "Agents",
          title: "Hosted agents",
          text: "Agents built in WorkStudio that you can call by API with your own key.",
          href: "/agents",
        },
        {
          label: "WorkStudio",
          title: "Nexora WorkStudio",
          text: "The studio for designing agents and workflows.",
          href: "/workstudio",
        },
        {
          label: "Suite",
          title: "Code, Corpus, Quanta and Helix",
          text: "The other components of the suite, shown with their actual availability.",
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
          text: "Models hosted in Québec and external cloud models are identified as such. No silent switching.",
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
      law: "Designed to help you meet your Law 25 obligations.",
      cta: "Visit the trust centre",
      secondary: "Read our approach to sovereignty",
    },

    finalCta: {
      title: "Let’s start with one concrete case.",
      text: "A diagnostic to pin down the task to automate and the deployment mode that suits you.",
      primary: "Book a diagnostic",
      secondary: "See solutions",
    },
  },
};
