import type { VisualsDictionary } from "./visuals-fr-CA";

/** Texts of the illustrations and interface mock-ups (en-CA). Same structure as the fr-CA one; example data only. */
export const visualsEnCA: VisualsDictionary = {
  caption: {
    mock: "Illustrative mock-up, with sample data.",
    concept: "Conceptual diagram, not a screenshot.",
  },
  legend: {
    onsite: ["Your data", "Model and compute", "Incoming request"],
    hosted: ["Your data", "Model and storage, in Quebec", "Gateway"],
    flow: ["Documents", "Model", "A person’s approval"],
  },
  flow: {
    window: "Workflow",
    name: "Supplier invoice",
    state: "Draft",
    kinds: {
      trigger: "Trigger",
      agent: "Agent",
      check: "Check",
      approval: "Approval",
      action: "Action",
    },
    nodes: {
      trigger: { title: "Email received", sub: "Invoices inbox" },
      agent: { title: "Read the invoice", sub: "Model of your choice" },
      check: { title: "Validate the fields", sub: "Amount, taxes, supplier" },
      approval: { title: "A person decides", sub: "Nothing is written before" },
      action: { title: "Write to accounting", sub: "After approval" },
    },
    inspector: {
      title: "Selected step",
      fields: [
        ["Type", "Approval"],
        ["Approver", "Accounts manager"],
        ["If refused", "Back to the check"],
      ],
      logTitle: "Log",
      log: [
        "Email received",
        "Invoice read",
        "Fields validated",
        "Waiting for a person",
      ],
    },
  },
  gitspace: {
    window: "Gitspace · billing-project",
    status: "Mockup",
    branchesTitle: "Branches",
    branches: [
      { name: "agent/fix-calculation", agent: true },
      { name: "agent/add-tests", agent: true },
      { name: "main", agent: false },
    ],
    mrTitle: "Fix the credit calculation",
    mrMeta: "Merge request prepared by the code agent",
    mrState: "To review",
    steps: [
      { label: "Project memory read", done: true },
      { label: "Tests written and run", done: true },
      { label: "Continuous integration feedback received", done: true },
      { label: "Human review required before merging", done: false },
    ],
    memoryTitle: "Project memory",
    memory: [
      "Amounts are always in cents.",
      "Every merge goes through a review.",
    ],
  },
  catalog: {
    window: "Model catalogue",
    search: "Search a model",
    filters: ["Text", "Vision", "Embeddings"],
    hostLabel: "Hosting",
    hosts: ["Quebec", "Canada"],
    rows: [
      { name: "Writing model", tags: ["Text", "Tools"], host: "Quebec" },
      {
        name: "Document reading model",
        tags: ["Text", "Vision"],
        host: "Canada",
      },
      { name: "Search model", tags: ["Embeddings"], host: "Quebec" },
    ],
    codeTitle: "OpenAI-compatible",
    codeComment: "# only the address and the key change",
  },
  vps: {
    window: "My server",
    state: "Active",
    fields: [
      ["Region", "Quebec"],
      ["Application", "Agent installed"],
      ["Access", "SSH key"],
      ["Firewall", "Active"],
    ],
    terminalTitle: "Terminal",
    banner: "Nexora AI: application installed",
    gauges: ["Processor", "Memory", "Disk"],
  },
  dashboard: {
    window: "Usage",
    balance: "Credit balance",
    balanceValue: "$25.00",
    cap: "Monthly cap",
    chart: "Calls per day",
    keysTitle: "API keys",
    keys: [
      ["Production key", "…a91f"],
      ["Test key", "…c07d"],
    ],
    byModel: ["Writing model", "Search model"],
  },
  vision: {
    site: "Your site",
    server: "On-site server",
    alert: "Alert",
    stays: "Images stay on site",
    leaves: "Only the alert leaves",
    event: "Loading zone: movement detected",
    legend: ["Camera", "Monitored zone", "Only the alert leaves"],
  },
  growth: {
    from: "Your trade and your region",
    hub: "Nexora Croissance",
    channels: [
      "Website suited to your trade",
      "Organic search",
      "Google Ads",
      "Microsoft Advertising",
      "Social networks",
      "Market analysis",
    ],
    to: "Customer enquiries",
  },
  commitments: {
    items: [
      {
        title: "At your place",
        text: "On-premises: your data stays on your server.",
      },
      { title: "In Quebec", text: "Hosted: in our infrastructure, in Quebec." },
      { title: "Never for training", text: "No model learns from your data." },
      { title: "Never sold", text: "Neither sold nor rented." },
      {
        title: "Written consent",
        text: "No external model without your agreement.",
      },
    ],
  },
  hero: {
    label: "Example",
    received: "Request received",
    prepared: "Reply prepared",
    title: "To approve",
    body: "A reply to a customer, prepared from your documents.",
    approve: "Approve",
    edit: "Edit",
    footer: "Nothing leaves without you.",
  },
  signal: {
    motion: {
      pause: "Pause animations",
      play: "Resume animations",
    },
    detection: ["ZONE 02", "MOTION", "CAM 04", "ALERT"],
    reception: {
      window: "Virtual reception",
      live: "Online",
      call: {
        title: "Incoming call",
        time: "2:02 p.m.",
        caller: "Caller",
        ai: "Reception",
        lines: [
          {
            who: "caller",
            text: "Hello, I’d like to move my Thursday appointment.",
          },
          {
            who: "ai",
            text: "Of course. I can offer Friday at 10 a.m. or 2 p.m.",
          },
          { who: "caller", text: "Friday at 10 a.m. is perfect." },
        ],
      },
      feed: {
        title: "Conversations handled",
        items: [
          {
            channel: "call",
            who: "Call · Ms. Tremblay",
            summary: "Appointment moved to Friday",
            state: "Done",
            done: true,
          },
          {
            channel: "email",
            who: "Email · Quote",
            summary: "Request qualified, sent to sales",
            state: "Transferred",
            done: false,
          },
          {
            channel: "sms",
            who: "Text · Delivery",
            summary: "Arrival time confirmed",
            state: "Done",
            done: true,
          },
          {
            channel: "call",
            who: "Call · Supplier",
            summary: "Summary sent to accounting",
            state: "Summary",
            done: false,
          },
        ],
      },
    },
    surveillance: {
      window: "AI surveillance",
      live: "Live",
      camera: "CAM 04 · Warehouse",
      timestamp: "02:14:37",
      boxes: ["Presence · closed area", "Rack B"],
      timeline: "Overnight activity",
      range: "10 p.m. – 6 a.m.",
      alert: {
        label: "Alert sent",
        title: "Presence detected in a closed area, after business hours.",
        channels: ["Text", "Email", "App", "Security officer"],
      },
      report: {
        label: "Event report",
        items: [
          { time: "02:14", text: "Entry through loading door 3" },
          { time: "02:15", text: "Movement in aisle B, clip attached" },
          { time: "02:17", text: "Alert sent according to your instructions" },
        ],
      },
    },
    infrastructure: {
      onsite: {
        label: "At your site",
        title: "Installed on your premises",
        items: [
          "Compact machine or AI workstation",
          "Server rack",
          "Your data stays on site",
        ],
      },
      hosted: {
        label: "With us",
        title: "Hosted on our servers",
        items: [
          "In Quebec",
          "Monitored by our team",
          "Access restricted to your business",
        ],
      },
      stack: ["Your models", "Your applications", "Security", "Monitoring"],
    },
  },
  workspace: {
    address: "app.nexora · Workspace",
    org: "Your organization",
    tabs: ["Code", "Documents", "Flows", "Creative", "WebPilot"],
    layout: "Layout: 4 panels",
    code: {
      title: "Coding agent",
      prompt: "Add email validation to the contact form, with a test.",
      file: "src/contact/schema.ts",
      removed: ["  email: z.string(),"],
      added: [
        "  email: z.string().trim().email({",
        '    message: "Invalid email address",',
        "  }),",
      ],
      context: [
        "export const contactSchema = z.object({",
        "  name: z.string().min(1),",
      ],
      status: "Writing the test",
      tests: "2 tests added · ready for review",
      review: "Review the change",
    },
    rag: {
      title: "Your documents",
      question: "How many vacation days after three years?",
      answer:
        "After three years of service, the policy provides three weeks of paid vacation, to be taken between May and October unless agreed in writing.",
      sources: [
        "Vacation policy.pdf · p. 4",
        "Employee handbook.docx · section 3",
      ],
      cited: "Cited sources",
    },
    flow: {
      title: "Workflow",
      nodes: ["Email received", "Classify", "Approval", "Reply"],
      waiting: "Waiting for your approval",
    },
    creative: {
      title: "Creative",
      prompt: "Bakery storefront at sunrise, slow shot",
      rendering: "Rendering the video",
    },
    usage: {
      title: "Account credits",
      text: "One balance for every tool.",
      caps: "Monthly cap, keys and call log.",
      items: ["Code", "Documents", "Flows", "Creative"],
    },
    machine: {
      title: "Your computer",
      text: "The agent can run the work on your machine.",
      cloud: "Cloud",
      local: "Your machine",
      status: "In preparation",
      device: "Your machine, linked to your account",
    },
  },
  notFound: { alt: "404" },
};
