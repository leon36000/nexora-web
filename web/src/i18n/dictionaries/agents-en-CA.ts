import type { AgentsDictionary } from "./agents-fr-CA";

/** Hosted agents dictionary (en-CA), milestone S7. Same structure as the fr-CA one; no invented figures or claims. */
export const agentsEnCA: AgentsDictionary = {
  meta: {
    list: {
      title: "Hosted agents | Nexora AI",
      description:
        "Agents built in Nexora WorkStudio, callable through the API with your key: one credit balance, prices in Canadian dollars, hosting location shown.",
    },
    agent: {
      description:
        "Page for the {name} agent: API call with your Nexora AI key, pricing, instance hosting, limits and code examples.",
    },
  },

  residency: {
    quebec: "Instance hosted in Quebec",
    canada: "Instance hosted in Canada",
    etats_unis: "Instance hosted in the United States",
    europe: "Instance hosted in Europe",
    autre: "Instance hosted outside Canada",
  },
  categories: {
    general: "General",
    support: "Customer support",
    documents: "Documents",
    ventes: "Sales",
    finance: "Finance",
    ressources_humaines: "Human resources",
    autre: "Other",
  },

  catalog: {
    label: "Hosted agents",
    title: "Agents ready to call.",
    lead: "An agent is built and published in Nexora WorkStudio. You call it through the Nexora AI API, with your key and your credit balance, the same way you call a model.",
    count: "{count} published agent(s)",
    empty:
      "No agent is published yet. The catalogue fills up as Nexora AI publishes its agents.",
    unavailable:
      "The catalogue is temporarily unavailable. Please try again in a moment.",
    trialNote:
      "The prices shown are development trial values: they are not an offer.",
    priceNote: "Prices in Canadian dollars (CAD), before taxes.",
    perRun: "Per run",
    input: "Input",
    output: "Output",
    perMillion: "per million tokens",
    trialBadge: "Trial price",
    viewAgent: "View the {name} page",
    updated: "Catalogue as of {date}",
    howTitle: "How it works",
    howSteps: [
      "Create an API key in your customer area and add credits (top-up or plan).",
      "Call the Nexora AI API with the model “agent/<identifier>”, exactly as you would for a model.",
      "Follow each agent’s consumption in your customer area.",
    ],
  },

  detail: {
    back: "All agents",
    category: "Category",
    pricing: "Pricing",
    pricingLead:
      "Billed at the actual cost of each run: an amount per run and/or the tokens consumed, depending on the agent’s price.",
    trialLead:
      "These prices are development trial values. They will change before any commercial offer.",
    limits: "Limits",
    runCap:
      "Cap of {tokens} tokens (input and output) per run. The amount reserved on your balance is computed on this cap, and you are never charged beyond it.",
    textOnly:
      "The agent receives text: images, audio and files are not supported by the API.",
    systemIgnored:
      "The “system” and “developer” messages in your request are ignored: the agent keeps its own instructions. Send “user” and “assistant” messages.",
    noTuning:
      "Model settings (temperature, tools, max_tokens…) do not apply to a published agent and are ignored.",
    example: "Example call",
    exampleLead:
      "Replace the example key with your own. The examples use the API address: {url}.",
    streamTitle: "Streaming",
    streamLead:
      "Add stream: true to receive the answer as it is produced. The cost is settled at the end of the run, based on actual usage.",
    createKey: "Create an API key",
    docs: "Read the API documentation",
  },

  guardrails: {
    title: "Safeguards",
    lead: "What the gateway does, and what it does not do.",
    hostingTitle: "Hosting",
    hosting:
      "Your request is processed by the Nexora WorkStudio instance shown on the agent’s page (hosting declared by Nexora AI), then by the language model that instance uses. A model’s region can be checked in the model catalogue; the instance hosting says nothing more than what is declared.",
    retentionTitle: "Content of your exchanges",
    retention:
      "The Nexora AI gateway keeps only usage metadata (agent, tokens, cost, duration), never the content of your requests.",
    billingTitle: "Billing",
    billing:
      "Each call first reserves its maximum cost on your balance, then is settled at the actual cost. Without enough balance, the API answers 402 before calling the agent. You can cap the spending of a key.",
    keyTitle: "Your key",
    key: "An API key must never be placed in a web page or an installed app: call the API from your server. The API sends no CORS headers.",
    revokeTitle: "Revocation and withdrawal",
    revoke:
      "A revoked key is refused immediately (401). An agent withdrawn from the catalogue answers 404.",
  },

  cta: {
    title: "Call an agent",
    lead: "Create a key in your customer area, then call the agent of your choice.",
    createKey: "Create a key in the customer area",
    docs: "API documentation",
    models: "See the models",
  },

  widget: {
    defaultLabel: "Chat with the assistant",
  },

  account: {
    title: "Agent consumption",
    lead: "Runs over the last 30 days, by day and by agent.",
    modelsTitle: "Model consumption",
    empty: "No agent run in the last 30 days.",
    caption: "Agent usage by day and by agent",
    columns: {
      day: "Day",
      agent: "Agent",
      requests: "Runs",
      input: "Input tokens",
      output: "Output tokens",
      cost: "Cost",
    },
    total: "Total",
  },
};
