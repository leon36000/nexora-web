import type { PricingDictionary } from "./pricing-fr-CA";

/** Pricing page text (en-CA). No price here: prices come from the plans published in Directus. */
export const pricingEnCA: PricingDictionary = {
  meta: {
    title: "Pricing | Nexora",
    description:
      "Nexora subscription plans in Canadian dollars, before tax: monthly and yearly prices, free trial and included credits. Also: private servers and pay-as-you-go API credits.",
  },
  nav: { home: "Home", pricing: "Pricing", breadcrumb: "Breadcrumb" },
  hero: {
    label: "Pricing",
    title: "Clear pricing, in Canadian dollars.",
    lead: "Pick a plan, try it, then pay securely. Prices are shown before tax; GST and QST are calculated at checkout.",
  },
  offers: {
    title: "Subscription plans",
    lead: "Every plan can be cancelled at any time from your customer area.",
  },
  card: {
    perMonth: "per month",
    perYear: "per year",
    monthlyBilling: "Billed monthly",
    yearlyBilling: "Billed yearly",
    yearlyEquivalent: "that is {amount} per month",
    saving: "{percent}% off compared to monthly",
    trial: "{days}-day free trial",
    credits: "{amount} of credits included every period",
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
      label: "Plans in preparation",
      title: "Our plans are coming soon.",
      text: "We are finalizing our pricing. Tell us what you need: we will reply with a clear proposal, no commitment.",
      cta: "Contact us",
    },
    unavailable: {
      label: "Temporarily unavailable",
      title: "Pricing cannot be displayed right now.",
      text: "The service that publishes our plans is not responding. Try again in a moment, or write to us: we answer every request.",
      cta: "Contact us",
    },
  },
  more: {
    title: "Other ways to get started",
    lead: "A subscription is not the only path: get a server or pay as you go.",
    vps: {
      title: "Private servers (VPS)",
      text: "A virtual private server, at the price shown on its page, with the application of your choice already installed.",
      cta: "See VPS plans",
    },
    credits: {
      title: "API credits",
      text: "Pay as you go: top up credits from your customer area, no subscription. The model catalogue and its prices are public.",
      cta: "See the models",
      ctaSecondary: "Create an account",
    },
  },
  period: { month: "Monthly", year: "Yearly" },
};
