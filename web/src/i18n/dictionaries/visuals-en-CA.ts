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
  notFound: { alt: "404" },
};
