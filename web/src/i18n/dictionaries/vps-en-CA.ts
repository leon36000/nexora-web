import type { VpsDictionary } from "./vps-fr-CA";

/** VPS pages dictionary (en-CA), milestone S6. Same structure as the fr-CA one; no invented figures or claims. */
export const vpsEnCA: VpsDictionary = {
  meta: {
    vps: {
      title: "VPS in Quebec for your AI agents | Nexora AI",
      description:
        "VPS hosted in Quebec for your AI agents and tools: compared plans, ready-to-install applications, prices in Canadian dollars before taxes.",
    },
    app: {
      title: "{name} on a VPS in Quebec | Nexora AI",
      description:
        "{tagline} Version {version}, {license} license. VPS in Quebec, prices in CAD before taxes.",
    },
    guide: {
      title: "Install {name} on your VPS | Nexora AI",
      description:
        "{tagline} Installation guide: Nexora AI does not install {name} and does not resell it.",
    },
  },

  nav: {
    breadcrumb: "Breadcrumb",
    home: "Home",
    vps: "VPS",
  },

  region: {
    quebec: "Quebec",
    canada: "Canada",
    etats_unis: "United States",
    europe: "Europe",
    autre: "Outside Canada",
  },
  units: { gb: "GB", mb: "MB" },

  common: {
    priceNote: "Prices in Canadian dollars (CAD), before taxes.",
    taxes: "GST and QST calculated at checkout based on your address.",
    renewal:
      "Renews automatically at the same rate each period, cancellable at any time (service runs until the end of the paid period).",
    beforeTaxes: "before taxes",
    perMonth: "per month",
    perYear: "per year",
    monthly: "Monthly",
    yearly: "Yearly",
    yearEquivalent: "or {price} per month",
    notOffered: "Not offered",
    notSpecified: "Not specified",
    devBadge: "Development plan — not for sale",
    suggested: "Suggested plan",
    contactCta: "Contact us",
  },

  hero: {
    label: "Hosted in Quebec",
    title: "A server of your own, in Quebec, for your AI agents.",
    lead: "A VPS (virtual private server) hosted in Quebec, with SSH key access, to run your AI agents and tools. Choose a plan and a ready-to-install application, then order.",
    primary: "Configure my VPS",
    secondary: "Compare plans",
  },

  states: {
    empty: {
      label: "Coming soon",
      title: "Our VPS offers are being prepared",
      text: "No plan is published at the moment, which is why no price is shown. Contact us to talk it over or to ask for a demonstration.",
      cta: "Talk to the team",
    },
    unavailable: {
      label: "Unavailable",
      title: "VPS offers are temporarily unavailable",
      text: "We can’t display the catalogue right now. Reload the page in a few minutes; if the problem persists, contact us.",
      cta: "Contact us",
    },
  },

  plans: {
    label: "Plans",
    title: "Choose the size of your server",
    lead: "Each plan lists its resources as published: virtual processors, memory, NVMe disk and bandwidth. The hosting location is shown for each one.",
    vcpu: "vCPU",
    ram: "Memory (RAM)",
    disk: "NVMe disk",
    bandwidth: "Bandwidth",
    location: "Location",
    choose: "Choose this plan",
    chooseLabel: "Choose this plan: {name}",
  },

  table: {
    title: "Compare plans",
    caption:
      "VPS plan comparison: resources, location and prices in Canadian dollars before taxes",
    region: "Plan comparison table, scrollable horizontally",
    plan: "Plan",
    monthly: "Monthly price",
    yearly: "Yearly price",
  },

  configurator: {
    title: "Configure and order",
    lead: "Four choices, then secure payment: plan, application, term and SSH key.",
    stepPlan: "1. Plan",
    stepApp: "2. Application",
    stepTerm: "3. Term",
    stepKey: "4. Public SSH key",
    planHint:
      "Plans that are too small for the chosen application are greyed out.",
    appHint: "Only applications installed by Nexora AI can be ordered online.",
    tooSmall: "Too small: this application needs at least {ram}.",
    specLine: "{vcpu} vCPU · {ram} · {disk} NVMe",
    minRam: "Minimum memory: {ram}",
    termNotOffered: "Not offered for this plan",
    termMonthlyLead: "Billed every month.",
    termYearlyLead: "Billed once a year.",
    termYearlyTotal: "{total} per year",
    noApps:
      "No ready-to-install application is published at the moment: online ordering is not open yet.",
    noCompatiblePlan:
      "No published plan has enough memory for this application.",
    keyHint:
      "Paste your PUBLIC key on a single line: ed25519, ECDSA or RSA of 2048 bits or more. Never paste your private key.",
    keyPlaceholder: "ssh-ed25519 AAAA… you@laptop",
    keygenSummary: "How do I generate a key?",
    keygenIntro:
      "In a terminal on your computer, create a key pair. The command asks for an optional passphrase: it protects your private key on your computer and is never sent to Nexora AI.",
    keygenCommand: "ssh-keygen -t ed25519",
    keygenShow:
      "Then display the public key (the file ending in .pub) and paste its content above:",
    keygenShowCommand: "cat ~/.ssh/id_ed25519.pub",
    keygenPrivate:
      "The file without the .pub extension is your private key: keep it on your computer.",
    hostnameLabel: "Server name",
    hostnameOptional: "optional",
    hostnameHint:
      "Lowercase letters, digits and hyphens (32 characters at most).",
    promoLabel: "Promo code",
    promoOptional: "optional",
    promoHint:
      "Optional. The discount is checked when you order and shown on the payment page.",
    promoPlaceholder: "Your code",
    summaryTitle: "Your order",
    summaryPlan: "Plan",
    summaryApp: "Application",
    summaryTerm: "Term",
    summaryTotal: "Total before taxes",
    summaryLocation: "Location",
    summaryEmpty: "Complete the choices to see the total.",
    devWarning:
      "Development plan: it is not for sale. Order it only with test payments.",
    submit: "Order",
    submitting: "Redirecting to payment…",
    stripeNote:
      "Payment takes place on a secure page. You enter no card details on this site.",
    loginLink: "Sign in",
    signupLink: "Create an account",
    errors: {
      unauthenticated:
        "Sign in (or create an account) to order, then come back to this page: your choice of plan, application and term is kept in the address.",
      forbidden: "Only the organization owner can order a VPS.",
      invalid_ssh_key:
        "SSH key rejected. Paste a PUBLIC key (ed25519, ECDSA or RSA of 2048 bits or more) on a single line, for example the content of the id_ed25519.pub file. Never paste your private key.",
      key_empty: "Paste your public SSH key to continue.",
      key_private:
        "This looks like a private key: it was not sent. Never paste it here; paste the public key (the file ending in .pub).",
      key_multiple: "The key must fit on a single line.",
      invalid_hostname:
        "Invalid server name: lowercase letters, digits and hyphens only, 32 characters at most, no hyphen at the start or end.",
      plan_too_small: "This plan is too small for this application.",
      term_unavailable: "This term is not offered for this plan.",
      plan_not_synced:
        "This plan is not ready for sale yet (its price is syncing with the payment service). Try again later or contact us.",
      limit_reached:
        "You have reached the maximum number of VPS for your organization.",
      rate_limited: "Too many attempts. Wait a minute, then try again.",
      payment_unavailable:
        "The payment service is temporarily unavailable. No payment was made; try again in a moment.",
      catalog_changed:
        "This plan or application is no longer offered. Reload the page to see the up-to-date catalogue.",
      already_processed:
        "This order has already been processed. See your VPS in your customer area.",
      network: "Connection failed. Check your network, then try again.",
      generic: "The order could not be created. Try again in a moment.",
      promo_unknown: "This promo code does not exist or is no longer valid.",
      promo_expired: "This promo code has expired.",
      promo_exhausted:
        "This promo code has reached its maximum number of uses.",
      promo_wrong_scope: "This code does not apply to this type of purchase.",
      promo_staff_only: "This code is reserved for the Nexora team.",
      promo_first_order_only: "This code is reserved for a first order.",
      promo_already_used: "Your organization has already used this code.",
      promo_min_amount: "This code requires a higher purchase amount.",
      promo_not_ready:
        "This code is not active yet. Try again later or contact us.",
      promo_covers_all:
        "This code would cover the whole purchase: choose another option.",
      promo_account_restricted:
        "This code cannot be applied to your account at the moment. Contact us.",
    },
  },

  apps: {
    label: "Applications",
    title: "Ready-to-install applications",
    lead: "Choose an application when you order: Nexora AI installs it on your VPS in the version shown. Each page gives the version, the license and the ports.",
    empty: "No application is published at the moment.",
    kind: "Ready to install",
    version: "Version {version}",
    license: "{license} license",
    minRam: "Minimum memory: {ram}",
    view: "See the {name} page",
  },

  guides: {
    label: "Guides",
    title: "Tools you install yourself",
    lead: "Some applications are not installed by Nexora AI: their license does not allow it (for example n8n, Open WebUI or Dify). You install them yourself on your VPS, under your own license, by following the guide on their page.",
    kind: "Install it yourself under your license",
    license: "{license} license",
    view: "See the {name} guide",
  },

  faq: {
    title: "Frequently asked questions",
    items: {
      whatIs: {
        q: "What is a VPS?",
        a: "A VPS (virtual private server) is a virtual server that you administer: you have your own system, separate from other customers’, with the resources of the plan you chose (processors, memory, disk). You run your AI agents and tools on it.",
      },
      data: {
        q: "Where is my data?",
        a: "The VPS is hosted in Quebec and its data lives on its disk. Applications you install on it and external services you connect to it (for example an AI model provider) may, however, send data elsewhere: it is up to you to check where.",
      },
      ssh: {
        q: "How do I access the server? Is there a password?",
        a: "Access is over SSH, with your key only: you provide your PUBLIC key when ordering. No SSH password is created or requested, and Nexora AI never sees your private key.",
      },
      tunnel: {
        q: "Are applications open to the Internet?",
        a: "By default, no: their interfaces listen only inside the server (127.0.0.1). You reach them through an SSH tunnel from your computer, for example for port 3000:",
        code: "ssh -N -L 3000:127.0.0.1:3000 user@your-vps-address",
        after:
          "Then open http://localhost:3000 in your browser. Each application page lists its ports and whether they are reachable through a tunnel or open.",
      },
      renewal: {
        q: "How does renewal work?",
        a: "The VPS renews automatically at the same rate each period, monthly or yearly. You can cancel at any time: service runs until the end of the paid period.",
      },
      unpaid: {
        q: "What happens if a payment fails?",
        a: "If a payment fails, a 7-day grace period applies. After that, the VPS is suspended.",
      },
      cancel: {
        q: "What happens if I cancel?",
        a: "Service runs until the end of the paid period. Then the VPS is stopped, and deleted after 7 days.",
      },
      reinstall: {
        q: "What does a reinstall do?",
        a: "It erases the VPS data to start from a fresh install. Nexora AI does keep a snapshot of the disk for 7 days.",
      },
      port25: {
        q: "Can I send email from the VPS?",
        a: "Outbound port 25 (direct email sending) is closed by default, to limit abuse. To send email, go through a third-party sending service.",
      },
      taxes: {
        q: "Do prices include taxes?",
        a: "No. Prices are in Canadian dollars, before taxes. GST and QST are calculated at checkout based on your address.",
      },
    },
  },

  appPage: {
    back: "All VPS",
    kindApp: "Ready-to-install application",
    kindGuide: "Installation guide",
    version: "Pinned version",
    license: "License",
    licenseText: "Read the license text",
    upstream: "Upstream project",
    minRam: "Minimum memory",
    licenseWarning: "License warning",
    ports: "Ports",
    portsLead:
      "The application’s ports on your VPS. A “tunnel” port is not open to the Internet: you reach it through an SSH tunnel.",
    portTunnel: "Access through an SSH tunnel",
    portPublic: "Open",
    portLine: "{port}/{proto}",
    tunnelExample: "Example tunnel for port {port}:",
    tunnelCommand: "ssh -N -L {port}:127.0.0.1:{port} user@your-vps-address",
    plansTitle: "Compatible plans",
    plansLead:
      "Plans whose memory meets the required minimum ({ram}). Prices in Canadian dollars, before taxes.",
    noCompatible:
      "No published plan has enough memory for this application at the moment.",
    plansPending:
      "Our VPS offers are being prepared: no price is shown for now.",
    plansUnavailable:
      "Plans are temporarily unavailable. Reload the page in a few minutes.",
    order: "Order with this application",
    guideTitle: "Installation guide",
    guideNotice: "Nexora AI does not install {name} and does not resell it.",
    guideNoticeText:
      "You install {name} yourself, under your own license, on a VPS. The steps below are a starting point: always follow the project’s official documentation.",
    guideOrderNote:
      "Online ordering currently offers a VPS delivered with a ready-to-install application. For a blank VPS, contact us.",
    guideSeeVps: "See the VPS",
    guideBlank: "Ask for a blank VPS",
    faqTitle: "Questions about {name}",
    faq: {
      access: {
        q: "How do I access {name}?",
        a: "{name}’s ports are listed above. A “tunnel” port is not open to the Internet: you reach it through an SSH tunnel from your computer. An “open” port is reachable from the Internet.",
      },
      license: {
        q: "What license is {name} under?",
        a: "{name} is published under the {license} license. The full text is available from this page; check that it suits your use.",
      },
      version: {
        q: "Which version is installed?",
        a: "Nexora AI installs version {version}. For new versions and security advisories, follow the upstream project.",
      },
      whoInstalls: {
        q: "Who installs {name}?",
        a: "You do. Nexora AI does not install it and does not resell it: you follow the guide on your own VPS, under your license.",
      },
      ram: {
        q: "How much memory do I need?",
        a: "The page states a minimum of {ram} of memory. Compatible plans are listed above.",
      },
    },
  },
};
