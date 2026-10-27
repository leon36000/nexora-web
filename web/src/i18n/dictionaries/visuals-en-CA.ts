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
  notFound: { alt: "404" },
};
