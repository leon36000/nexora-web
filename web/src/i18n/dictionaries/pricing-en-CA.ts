import type { PricingDictionary } from "./pricing-fr-CA";

/**
 * Pricing page text (en-CA). No price here: prices, credits and storage of each plan come from the plans published in
 * Directus (never hard-coded). Claim identifiers (`claims`) point to `cms/content/claims.json`, same as in French.
 */
export const pricingEnCA: PricingDictionary = {
  meta: {
    title: "Pricing | Nexora AI",
    description:
      "Credits, plans, top-ups and storage at Nexora AI: what uses credits, what is included, and the published prices in Canadian dollars.",
  },
  nav: { home: "Home", pricing: "Pricing", breadcrumb: "Breadcrumb" },
  hero: {
    label: "Pricing",
    title: "Credits for AI, storage for your data.",
    lead: "A plan gives you credits every month and storage space. Without a plan, you top up credits. Anything that calls an AI model uses credits; the rest is included.",
    claims: ["CL-T01"],
  },
  offers: {
    title: "Subscription tiers",
    lead: "Each tier gives credits every month and storage space; higher tiers give more of both.",
    claims: ["CL-T01"],
  },
  card: {
    perMonth: "per month",
    perYear: "per year",
    monthlyBilling: "Billed monthly",
    yearlyBilling: "Billed yearly",
    yearlyEquivalent: "that is {amount} per month",
    saving: "{percent}% off compared to monthly",
    trial: "{days}-day free trial",
    credits: "{credits} credits per month",
    creditsYearly: "Yearly billing: credits are granted one twelfth per month",
    storage: "{gb} GB of storage",
    choose: "Choose this plan",
    chooseYearly: "Choose yearly billing",
    notReady: "Coming soon",
    notReadyHelp: "This plan is not open for subscription yet.",
    contact: "Contact us",
    included: "What is included",
  },
  taxes:
    "All prices are in Canadian dollars, before tax. GST and QST are calculated by our payment provider from your billing address and added to the price. Included credits are granted every paid period.",
  trialNote:
    "During a trial, nothing is charged until the trial ends; you can cancel before then at no cost.",
  states: {
    empty: {
      label: "Prices coming",
      title: "Prices are not published yet.",
      text: "We already show how everything works: what a credit is, what uses credits, how top-ups and storage are counted. The tiers, their amounts and their prices will appear here once they are published; we state no price in the meantime. For a specific need, write to us.",
      cta: "Contact us",
      claims: ["CL-T06"],
    },
    unavailable: {
      label: "Temporarily unavailable",
      title: "Prices cannot be displayed right now.",
      text: "The service that publishes our plans is not responding. Try again in a moment, or write to us: we answer every request. The rest of this page still applies.",
      cta: "Contact us",
    },
  },
  credit: {
    title: "What a credit is",
    lead: "One credit is worth one Canadian cent (1¢) of tokens, at the model catalogue price. An economical model gives more tokens for a credit; a powerful model gives fewer.",
    points: [
      "Catalogue prices are public: every model sheet shows its price per million tokens.",
      "Each request is charged at its actual cost, calculated with the price on the sheet of the model used.",
      "Any call to an AI model uses credits; Nexora tools that call no model use none.",
    ],
    claims: ["CL-T02", "CL-T04"],
    equivalents: {
      title: "What {credits} credits buy",
      lead: "Calculated from the prices published in the catalogue, for a few models. Input tokens are those of your request; output tokens are those of the answer.",
      caption:
        "{credits} credits expressed in tokens, based on catalogue prices",
      model: "Model",
      input: "Input tokens",
      output: "Output tokens",
      note: "Catalogue prices can change, and the equivalent changes with them.",
      unavailable:
        "The model catalogue is not available right now: the token equivalent will appear as soon as it is back. Nothing is estimated in the meantime.",
      cta: "See all models and their prices",
      claims: ["CL-T02"],
    },
  },
  refill: {
    title: "Top-ups",
    lead: "Without a plan, or on top of one, top up credits whenever you like.",
    points: [
      "Plan credits expire at the end of their period; they are used first.",
      "Top-up credits do not expire: they are used once the plan credits are gone.",
      "A credit balance above zero is enough to call the models, whether it comes from a plan or a top-up.",
    ],
    claims: ["CL-T01", "CL-T03"],
    packsTitle: "Top-up packs",
    packCredits: "{credits} credits",
    packsSoon: "Top-up packs will appear here once their prices are published.",
    cta: "Top up from my account",
  },
  storage: {
    title: "Storage",
    lead: "Every plan includes storage space. It is counted per organization, across all products.",
    points: [
      "Beyond your space, writing is refused with a clear message, until you free up space or add gigabytes.",
      "Freeing up space is always allowed.",
      "Extra gigabytes can be added to your plan.",
    ],
    claims: ["CL-T05"],
    addonPrice: "{price} per GB per month",
    addonSoon:
      "The “Extra gigabyte” add-on will appear here once its price is published.",
  },
  usage: {
    title: "What is included, what uses credits",
    lead: "Where your credits go, and what costs you nothing more.",
    claims: ["CL-T04", "CL-T05", "CL-T07"],
    included: {
      title: "Free or included",
      items: [
        "The model catalogue and its prices, available without an account.",
        "Nexora tools that call no AI model.",
      ],
    },
    credits: {
      title: "Uses credits",
      items: [
        "Any call to an AI model: API requests, agents, automations that use a model.",
        "The input and output tokens of each request, at the catalogue price.",
      ],
    },
    space: {
      title: "Uses storage",
      items: ["The data you keep at Nexora, across all products."],
    },
  },
  faq: {
    title: "Frequently asked questions",
    lead: "Straight answers, including about what is not decided yet.",
    items: {
      noCredits: {
        q: "What happens when I have no credits left?",
        a: "Calls to the models are refused, with a message pointing to top-ups and plans. As soon as your balance is above zero, you can start again.",
        claims: ["CL-T09"],
      },
      expiry: {
        q: "Do my credits expire?",
        a: "Plan credits expire at the end of the period they were granted for, and they are used first. Top-up credits do not expire.",
        claims: ["CL-T03"],
      },
      annual: {
        q: "How are the credits of a yearly plan granted?",
        a: "One twelfth each month, not all at once. Each twelfth expires at the end of its month.",
        claims: ["CL-T08"],
      },
      trial: {
        q: "Can I try before paying?",
        a: "There is no free trial of the plans. The model catalogue and its prices are public, and a top-up lets you buy only what you use.",
        claims: ["CL-T07"],
      },
      space: {
        q: "What happens if I exceed my storage?",
        a: "Writing is refused with a clear message. Free up space, or add gigabytes to your plan; what you have already saved is not deleted by this refusal.",
        claims: ["CL-T05"],
      },
      cancel: {
        q: "Can I cancel a plan?",
        a: "Yes, from your customer area. Cancellation takes effect at the end of the paid period.",
        claims: ["CL-T10"],
      },
      prices: {
        q: "When will prices be published?",
        a: "We have no date to announce. Prices will appear on this page as soon as they are published; until then, no price applies.",
        claims: ["CL-T06"],
      },
    },
  },
  more: {
    title: "Other ways to get started",
    lead: "A plan is not the only path: get a server, or let us talk about your need.",
    vps: {
      title: "Private servers (VPS)",
      text: "A virtual private server, at the price shown on its page, with the application of your choice already installed.",
      cta: "See VPS plans",
    },
    contact: {
      title: "A specific need?",
      text: "Tell us what you want to accomplish: we reply with a clear proposal, no commitment.",
      cta: "Contact us",
    },
  },
  period: { month: "Monthly", year: "Yearly" },
};
