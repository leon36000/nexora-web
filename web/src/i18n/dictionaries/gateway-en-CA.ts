import type { GatewayDictionary } from "./gateway-fr-CA";

/** Gateway dictionary (en-CA), milestone S5. Same structure as the fr-CA one; no invented figures or claims. */
export const gatewayEnCA: GatewayDictionary = {
  meta: {
    models: {
      title: "Models | Nexora",
      description:
        "Catalogue of AI models available through the Nexora API: prices in Canadian dollars, context window, capabilities and hosting location for each.",
    },
    model: {
      description:
        "Model page for {name}: price per million tokens in Canadian dollars, context window, hosting and an example call.",
    },
    docs: {
      title: "API documentation | Nexora",
      description:
        "Quickstart for the Nexora API, which is OpenAI-compatible: key, first call, streaming, errors and limits.",
    },
  },

  residency: {
    quebec: "Hosted in Quebec",
    canada: "Hosted in Canada",
    etats_unis: "Hosted in the United States",
    europe: "Hosted in Europe",
    autre: "Hosted outside Canada",
  },
  residencyFilter: {
    quebec: "Quebec",
    canada: "Canada",
    etats_unis: "United States",
    europe: "Europe",
    autre: "Other",
  },
  capabilities: {
    tools: "Tool calling",
    vision: "Vision",
    reasoning: "Reasoning",
    streaming: "Streaming",
    json_mode: "JSON mode",
  },
  kinds: { chat: "Chat", embedding: "Embeddings" },

  catalog: {
    label: "Models",
    title: "Every model, one API.",
    lead: "One key, an OpenAI-compatible API, prices in Canadian dollars, and the hosting location of every model shown plainly.",
    filtersLabel: "Filter models",
    residencyField: "Hosting",
    capabilityField: "Capability",
    kindField: "Type",
    all: "All",
    apply: "Apply",
    reset: "Reset",
    count: "{count} model(s)",
    empty: "No model matches these filters.",
    emptyCatalog: "The catalogue is being prepared: no model is published yet.",
    unit: "per million tokens",
    priceNote: "Prices in Canadian dollars (CAD), before taxes.",
    input: "Input",
    output: "Output",
    cachedInput: "Cached input",
    context: "Context",
    tokens: "tokens",
    viewModel: "View the page for {name}",
    devNote: "Development pricing",
    updated: "Catalogue as of {date}",
  },

  detail: {
    back: "All models",
    pricing: "Pricing",
    pricingLead:
      "Billed at the actual cost of each request, based on input and output tokens.",
    context: "Maximum context",
    maxOutput: "Maximum output",
    capabilities: "Capabilities",
    noCapabilities: "No particular capability declared.",
    hosting: "Hosting and data",
    hostingProvider: "Provider",
    hostingRegion: "Hosting location",
    dataPolicy: "Data policy declared by the provider",
    dataPolicyMissing: "The provider has not declared a data policy yet.",
    nexoraNote:
      "Nexora’s gateway keeps only usage metadata (model, tokens, cost, duration), never the content of your requests.",
    sunset: "Scheduled for retirement on {date}.",
    example: "Example call",
    exampleLead:
      "Replace the example key with yours. The examples use the API address: {url}.",
    exampleEmbeddingLead:
      "This model produces vectors: call it through /v1/embeddings.",
    createKey: "Create an API key",
    docs: "Read the documentation",
  },

  docs: {
    label: "API",
    title: "API quickstart.",
    lead: "The Nexora API is compatible with OpenAI’s: change the base URL and the key, and the rest of your code stays as it is.",
    baseUrlTitle: "Base URL",
    baseUrlText:
      "All requests go through {url}. Authenticate with the Authorization header.",
    steps: {
      title: "In four steps",
      items: [
        "Create an account and top up your credits from your customer area.",
        "Create an API key (Account, API keys section): its value is shown only once.",
        "Pick a model in the catalogue and note its identifier, for example {model}.",
        "Make your first call with one of the examples below.",
      ],
    },
    code: "code",
    firstCall: "First call",
    streaming: "Streaming",
    streamingText:
      "Add stream: true to receive the response as it is produced (SSE). The cost is settled at the end of the stream from actual usage; if you close the connection midway, only the tokens already delivered are billed.",
    models: "List models",
    modelsText:
      "GET /v1/models returns the published models with their prices (CAD per million tokens), context window and hosting location. The public catalogue needs no key.",
    embeddings: "Embeddings",
    embeddingsText:
      "POST /v1/embeddings accepts a text or a list of texts, for models of the Embeddings type.",
    billing: {
      title: "Billing",
      items: [
        "Each request first reserves its maximum cost (estimated input tokens and output bounded by max_tokens), then is settled at actual cost and the rest is released.",
        "Without enough balance, the API answers 402 before any call to the model.",
        "You can cap a key’s spending and limit its rate.",
        "Every response carries an x-request-id header; x-nexora-cost-micro gives the cost of a complete response, in millionths of a Canadian dollar.",
      ],
    },
    errors: {
      title: "Errors",
      tableLabel: "table",
      lead: "Errors follow OpenAI’s format: an error object with message, type and code.",
      columns: { status: "Status", code: "Code", meaning: "Meaning" },
      rows: [
        [
          "401",
          "invalid_api_key · api_key_revoked · api_key_expired",
          "Missing or unknown key, revoked key, expired key.",
        ],
        [
          "402",
          "insufficient_quota · account_blocked · api_key_spend_cap_reached",
          "Insufficient balance, blocked account (negative balance) or key spending cap reached.",
        ],
        [
          "404",
          "model_not_found",
          "Model does not exist or is not allowed for this key.",
        ],
        [
          "400",
          "invalid_json · missing_model · invalid_messages · invalid_input · invalid_max_tokens · context_length_exceeded · model_not_supported · unsupported_parameter",
          "Invalid request (JSON, missing model, messages, max_tokens, context exceeded, unsupported parameter). The param field names the faulty parameter.",
        ],
        ["413", "request_too_large", "Request body too large."],
        [
          "429",
          "rate_limit_exceeded",
          "Requests or tokens per minute limit reached (see Retry-After).",
        ],
        [
          "502 / 503",
          "upstream_error · upstream_unavailable · upstream_overloaded · gateway_unavailable",
          "The model provider is unavailable or overloaded: try again (see Retry-After). Nothing is charged.",
        ],
      ],
    },
    privacy: {
      title: "Privacy",
      text: "The gateway keeps only usage metadata (model, tokens, cost, duration), never the content of your requests. Each provider’s data policy is shown on the model page.",
    },
    compat: {
      title: "Compatibility",
      text: "Supported: /v1/chat/completions (with streaming, tools and response formats), /v1/embeddings and /v1/models. One choice per request (n = 1). Provider-specific parameters are ignored.",
    },
    cta: "See the models",
  },

  account: {
    title: "API keys",
    lead: "Keys give access to the Nexora API and spend your organization’s credits.",
    ownerOnly: "Only the organization owner can create or revoke a key.",
    createTitle: "Create a key",
    name: "Key name",
    nameHint: "For example “Production” or “Testing”.",
    spendCap: "Spending cap",
    spendCapHint:
      "In Canadian dollars, for example 50 or 12.50. Leave empty for no cap.",
    expires: "Expiry",
    expiresHint:
      "Number of days before it expires. Leave empty for a key that never expires.",
    optional: "optional",
    create: "Create key",
    creating: "Creating…",
    createdTitle: "Key created",
    createdWarn:
      "Copy this key now: it will never be shown again. Nexora only keeps its fingerprint.",
    copy: "Copy key",
    copied: "Key copied",
    close: "I have copied the key",
    tableLabel: "table",
    list: "Your keys",
    empty: "No keys yet.",
    columns: {
      name: "Name",
      prefix: "Start",
      created: "Created",
      lastUsed: "Last used",
      spent: "Spent",
      cap: "Cap",
      status: "Status",
    },
    never: "Never",
    noCap: "None",
    status: { active: "Active", revoked: "Revoked", expired: "Expired" },
    revoke: "Revoke",
    revokeLabel: "Revoke key {name}",
    confirmRevoke:
      "Revoke the key “{name}”? Applications using it will be refused immediately.",
    errors: {
      invalid_request: "Check the name, the cap and the duration.",
      invalid_spend_cap:
        "Invalid cap: enter an amount in dollars, for example 50 or 12.50.",
      forbidden: "Only the organization owner can manage keys.",
      rate_limited: "Too many requests. Wait a minute.",
      generic: "The operation failed. Try again in a moment.",
    },
    usageTitle: "Usage",
    usageLead: "Requests over the last 30 days, by day and by model.",
    usageEmpty: "No requests in the last 30 days.",
    usageCaption: "API usage by day and by model",
    usageColumns: {
      day: "Day",
      model: "Model",
      requests: "Requests",
      input: "Input tokens",
      output: "Output tokens",
      cost: "Cost",
    },
    usageTotal: "Total",
  },
};
