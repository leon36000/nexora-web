import type { AccountDictionary } from "./account-fr-CA";

/** Customer area dictionary (en-CA): same structure as fr-CA, checked by the `AccountDictionary` type. */
export const accountEnCA: AccountDictionary = {
  meta: {
    login: "Sign in | Nexora AI",
    signup: "Create an account | Nexora AI",
    forgot: "Forgot your password | Nexora AI",
    reset: "New password | Nexora AI",
    verify: "Email confirmation | Nexora AI",
    dashboard: "My account | Nexora AI",
  },

  common: {
    email: "Email",
    password: "Password",
    required: "required",
    optional: "optional",
    working: "One moment…",
    tryAgain: "Try again in a moment.",
    errorPrefix: "Error",
    currency: "CAD",
  },

  login: {
    title: "Sign in.",
    lead: "Access your customer area: credits, subscriptions and billing.",
    submit: "Sign in",
    forgot: "Forgot your password?",
    noAccount: "No account yet?",
    signupLink: "Create an account",
    resend: "Resend the confirmation email",
    resent:
      "If an account matches this address, a new confirmation email has just been sent.",
    errors: {
      invalid: "Incorrect email or password.",
      unverified:
        "Your email is not confirmed yet. Open the message we sent you, or ask for a new one.",
      rateLimited: "Too many attempts. Wait a minute before trying again.",
      locked:
        "Too many failed sign-ins for this address: access is suspended for a few minutes. Try again later, or reset your password.",
      generic: "Sign-in failed. Try again in a moment.",
    },
  },

  signup: {
    title: "Create an account.",
    lead: "One account, one organization: it holds your credits and your subscriptions.",
    name: "Your name",
    company: "Company name",
    companyHint:
      "It will name your organization. Without a company, we will use your name.",
    passwordHint: "At least 12 characters.",
    submit: "Create my account",
    haveAccount: "Already have an account?",
    loginLink: "Sign in",
    errors: {
      nameRequired: "Enter your name.",
      weak: "This password is too short: at least 12 characters.",
      common:
        "This password is too common or too close to your details. Choose a longer passphrase.",
      breached:
        "This password appears in known data breaches. Choose another one.",
      invalidEmail: "This email address is not valid.",
      rateLimited: "Too many attempts. Wait a minute before trying again.",
      generic: "Account creation failed. Try again in a moment.",
    },
    done: {
      title: "Check your email.",
      text: "We have just sent a confirmation link to {email}. Open it to activate your account, then sign in.",
      note: "Nothing received? Check your spam folder, then ask for a new message from the sign-in page.",
    },
  },

  forgot: {
    title: "Forgot your password.",
    lead: "Enter your email: if an account matches, we will send you a link to choose a new password.",
    submit: "Send the link",
    done: "If an account matches this address, a reset link has just been sent. It is valid for one hour.",
    back: "Back to sign in",
    errors: {
      invalidEmail: "This email address is not valid.",
      rateLimited: "Too many requests. Wait a minute before trying again.",
      generic: "The request failed. Try again in a moment.",
    },
  },

  reset: {
    title: "New password.",
    lead: "Choose a password of at least 12 characters. Your other sessions will be signed out.",
    password: "New password",
    submit: "Save the password",
    done: "Your password has been changed. You can now sign in.",
    goLogin: "Go to sign in",
    errors: {
      invalidToken: "This link is invalid or has expired. Ask for a new one.",
      weak: "This password is too short: at least 12 characters.",
      common: "This password is too common. Choose a longer passphrase.",
      breached:
        "This password appears in known data breaches. Choose another one.",
      generic: "The change failed. Try again in a moment.",
    },
    askAgain: "Ask for a new link",
  },

  verify: {
    title: "Email confirmed.",
    text: "Your account is active. Sign in to access your area.",
    goLogin: "Sign in",
    errorTitle: "Invalid link.",
    errorText:
      "This confirmation link is invalid or has expired. Sign in to ask for a new one.",
  },

  dashboard: {
    title: "My account.",
    lead: "Your organization, your credits and your subscriptions.",
    organization: "Organization",
    role: "Your role",
    roles: { owner: "Owner", member: "Member" },
    signOut: "Sign out",
    alerts: {
      purchaseOk:
        "Thank you. The payment is confirmed: your credits are added as soon as Stripe notifies us, usually within seconds. Refresh the page if the balance has not changed.",
      purchaseCancelled: "The purchase was cancelled. No amount was charged.",
      subscriptionOk:
        "Thank you. The subscription activates as soon as Stripe confirms the first payment. Refresh the page in a moment.",
      subscriptionCancelled:
        "The subscription was cancelled before payment. No amount was charged.",
      errors: {
        invalid_amount: "The amount must be between {min} and {max}.",
        forbidden: "Only the organization owner can do this.",
        no_organization: "No organization is linked to this account.",
        no_customer:
          "You have not made a payment yet: the portal is not available.",
        plan_not_found: "This plan is no longer available.",
        already_subscribed: "You are already subscribed to this plan.",
        plan_not_synced: "This plan is not ready for sale yet.",
        rate_limited: "Too many requests. Wait a minute before trying again.",
        payment_unavailable:
          "The payment service is not responding. Try again in a moment.",
        internal_error: "Something went wrong. Try again in a moment.",
        gift_cap_reached:
          "The monthly cap on provided credits has been reached.",
        gift_already_gifted: "This gift already exists.",
        gift_code_exhausted:
          "This code has reached its maximum number of uses.",
        gift_code_expired: "This code has expired.",
        gift_two_factor_required:
          "Turn on two-factor authentication for your account (Security page) to provide a service.",
      },
    },
    balance: {
      title: "Credit balance",
      available: "Available",
      held: "Held for requests in progress: {amount}",
      blockedTitle: "Account blocked.",
      blockedText:
        "Your balance is negative following a refund or a dispute. API access is suspended until the balance is positive again. Top up credits below or contact us.",
      expiryNote:
        "Purchased credits expire {months} months after purchase; those closest to expiry are used first.",
    },
    buy: {
      title: "Buy credits",
      productName: "Nexora AI credits",
      lead: "One-time payment, no subscription. You receive the pre-tax amount as credits.",
      amount: "Amount in Canadian dollars",
      choose: "Suggested amounts",
      submit: "Pay with Stripe",
      taxNote:
        "GST and QST are calculated by Stripe at the next step, based on your billing address, and added to the amount.",
      testNote: "Test mode: no real payment is possible for now.",
      feeNote:
        "A top-up fee of {percent}% (minimum {min}) is deducted from the credits granted.",
      limits: "From {min} to {max}.",
      ownerOnly: "Only the organization owner can buy credits.",
    },
    history: {
      title: "Credit history",
      empty: "No activity yet.",
      caption: "Latest entries of the credit ledger",
      date: "Date",
      type: "Movement",
      amount: "Amount",
      balance: "Balance after",
      expires: "Expires on {date}",
      sources: {
        purchase: "Credit purchase",
        subscription: "Included credits (subscription)",
        usage: "Usage",
        staff_gift: "Credits provided by Nexora",
        staff_gift_revoked: "Provided credits: taken back",
        stripe_refund: "Refund",
        stripe_dispute: "Dispute",
        dispute_reversal: "Dispute won: credits returned",
        expiration: "Expiry",
      },
    },
    subscriptions: {
      title: "Subscriptions",
      empty: "No subscription.",
      plan: "Plan",
      status: "Status",
      renews: "Next due date: {date}",
      cancels: "Ends on {date}",
      graceUntil: "Payment to be settled before {date}",
      chosen:
        "You chose the {name} plan. Confirm to continue to secure payment.",
      statuses: {
        incomplete: "Awaiting payment",
        incomplete_expired: "Expired",
        trialing: "Trial",
        active: "Active",
        past_due: "Payment overdue",
        unpaid: "Unpaid",
        paused: "Paused",
        canceled: "Cancelled",
        gifted: "Provided by Nexora",
      },
      access: {
        full: "Full access",
        grace: "Access kept during the grace period",
        suspended: "Access suspended",
        none: "No access",
      },
      available: {
        title: "Available plans",
        empty: "No plan is published at the moment.",
        perMonth: "{amount} per month, before tax",
        perYear: "{amount} per year, before tax",
        trial: "{days}-day free trial",
        included: "{amount} of credits included each period",
        subscribe: "Subscribe",
        ownerOnly: "Only the owner can subscribe.",
        unavailable: "Plans cannot be displayed at the moment.",
        notReady: "Coming soon",
        current: "Your current plan",
      },
    },
    portal: {
      title: "Billing",
      lead: "Invoices, payment methods and cancellation, in Stripe’s secure portal.",
      button: "Open the billing portal",
      none: "The portal will be available after your first payment.",
    },
    vps: {
      title: "My VPS",
      lead: "Your virtual private servers: status, SSH access and everyday operations.",
      link: "See my VPS",
    },
  },
  promo: {
    label: "Promo code",
    placeholder: "Your code",
    hint: "Optional. The discount is checked by the server and shown on the payment page.",
    trialNote:
      "{days}-day free trial: you are only billed when the trial ends.",
    errors: {
      unknown: "This promo code does not exist or is no longer valid.",
      expired: "This promo code has expired.",
      exhausted: "This promo code has reached its maximum number of uses.",
      wrong_scope: "This code does not apply to this type of purchase.",
      staff_only: "This code is reserved for the Nexora team.",
      two_factor_required:
        "Turn on two-factor authentication for your account (Security page) to use a team code.",
      first_order_only: "This code is reserved for a first order.",
      already_used: "Your organization has already used this code.",
      min_amount: "This code requires a higher purchase amount.",
      not_ready: "This code is not active yet. Try again later or contact us.",
      covers_all:
        "This code would cover the whole credit purchase: choose a higher amount.",
      account_restricted:
        "This code cannot be applied to your account at the moment. Contact us.",
    },
    gifted: {
      subscription: "Subscription provided: full access, no payment.",
      vps: "VPS provided: it will be installed as soon as a server is ready.",
      credits: "Credits provided: they have been added to your balance.",
      capReached: "The monthly cap on provided credits has been reached.",
    },
  },

  /** Customer panel (`/compte/…`): side navigation, overview, models and keys, activity, WorkStudio, cloud. */
  panel: {
    meta: {
      overview: "Overview | Nexora AI",
      models: "Models and keys | Nexora AI",
      activity: "Activity | Nexora AI",
      workstudio: "WorkStudio and agents | Nexora AI",
      billing: "Billing | Nexora AI",
    },
    nav: {
      label: "Customer area",
      soon: "Coming soon",
      items: {
        overview: "Overview",
        models: "Models and keys",
        activity: "Activity",
        workstudio: "WorkStudio and agents",
        cloud: "Cloud and VPS",
        apps: "Nexora Apps",
        billing: "Billing",
        security: "Security",
      },
    },
    overview: {
      title: "Overview.",
      lead: "Your wallet, your first steps and your last 30 days.",
      wallet: {
        title: "Wallet",
        addFunds: "Add funds",
        ownerOnly: "Only the organization owner can add funds.",
        freeTitle: "Free administrator access",
        freeText:
          "Your organization is part of the Nexora team: your requests do not debit any credits.",
        freeValue: "Value at public prices, last 30 days: {amount}",
      },
      start: {
        title: "Getting started",
        progress: "{done} of {total} steps done",
        done: "Done",
        todo: "To do",
        steps: {
          key: {
            title: "Create an API key",
            text: "A key connects your applications to Nexora AI.",
          },
          model: {
            title: "Try a model",
            text: "Pick a model from the catalogue, then send it a first request.",
          },
          workstudio: {
            title: "Open WorkStudio",
            text: "Choose a plan to get access to your workspace.",
          },
          vps: {
            title: "Install a VPS",
            text: "A virtual private server with the application of your choice.",
          },
        },
      },
      last30: {
        title: "Last 30 days",
        empty:
          "No requests in the last 30 days. Create a key and try a model: your activity will show up here.",
        seeAll: "See all activity",
      },
    },
    models: {
      title: "Models and keys.",
      lead: "Create your API keys and find the identifier of the model to call.",
      catalog: {
        title: "Available models",
        lead: "Copy the identifier to use in the “model” field of your requests.",
        copy: "Copy identifier",
        copied: "Identifier copied",
        copyLabel: "Copy identifier {id}",
        sheet: "Model details",
        sheetLabel: "See details for {name}",
        all: "See the full catalogue",
        empty: "The catalogue is not available right now.",
        input: "Input: {price}",
        output: "Output: {price}",
        perMillion: "per million tokens",
        identifier: "Identifier",
      },
    },
    activity: {
      title: "Activity.",
      lead: "Your API requests: model, tokens, cost and latency. The content of your requests is never kept here.",
      invalid:
        "Some criteria in the address were not valid: they were ignored.",
      filters: {
        label: "Filter activity",
        period: "Period",
        periods: {
          "24h": "24 hours",
          "7d": "7 days",
          "30d": "30 days",
          "90d": "90 days",
        },
        model: "Model or agent",
        allModels: "All",
        key: "API key",
        allKeys: "All",
        status: "Status",
        allStatuses: "All",
        statuses: {
          ok: "Succeeded",
          error: "Failed",
          aborted: "Interrupted",
        },
        apply: "Apply",
        reset: "Reset",
        range: "From {from} to {to}",
      },
      summary: {
        title: "Summary",
        spend: "Spend",
        spendFree: "Value provided (public price)",
        requests: "Requests",
        failures: "{count} failed",
        noFailures: "No failures",
        promptTokens: "Input tokens",
        completionTokens: "Output tokens",
        cachedTokens: "Cached tokens",
        cachedNote: "Included in input tokens",
        latency: "Average latency",
        none: "—",
      },
      breakdown: {
        title: "Breakdown",
        empty: "No data for this period.",
        byDay: "By day",
        byModel: "By model",
        byAgent: "By agent",
        byKey: "By key",
        chartLabel: "Spend per day, oldest to most recent",
        columns: {
          day: "Day",
          model: "Model",
          agent: "Agent",
          key: "Key",
          requests: "Requests",
          input: "Input",
          output: "Output",
          cached: "Cached",
          cost: "Spend",
        },
        captionDay: "Spend and tokens by day",
        captionModel: "Spend and tokens by model",
        captionAgent: "Spend and tokens by agent",
        captionKey: "Spend and tokens by API key",
        keyRevoked: "Deleted key",
      },
      log: {
        title: "Request log",
        caption: "Requests in the period, most recent first",
        empty: "No requests match these criteria.",
        columns: {
          time: "Date and time",
          model: "Model",
          key: "Key",
          status: "Status",
          tokens: "Tokens (input / output)",
          cost: "Cost",
          latency: "Latency",
        },
        shown: "{count} requests shown",
        next: "Older requests",
        first: "Back to the most recent",
        stream: "streamed",
        offered: "provided",
      },
      webpilot: {
        title: "WebPilot",
        lead: "Web search, reading, crawling and extraction through the API. Only metadata is kept: the host visited (never the full address), the number of pages and the cost.",
        pagesStatic: "Pages read",
        pagesBrowser: "Pages rendered by browser",
        minutes: "Browser minutes",
        spend: "Cost",
        spendFree: "Value provided (public price)",
        requests: "Requests",
        failures: "{count} failed",
        columns: {
          operation: "Operation",
          requests: "Requests",
          pages: "Pages",
          minutes: "Minutes",
          cost: "Cost",
        },
        caption: "WebPilot: requests, pages and cost by operation",
        operations: {
          search: "Search",
          scrape: "Single-page read",
          crawl: "Site crawl",
          extract: "Data extraction",
          session: "Browser session",
        },
      },
      export: {
        button: "Export as CSV",
        note: "CSV file with the same criteria: up to 100,000 rows, never any request content.",
      },
    },
    workstudio: {
      title: "WorkStudio and agents.",
      lead: "Your workspace for building agents, and the agents your organization calls.",
      subscription: {
        title: "WorkStudio subscription",
        none: "No WorkStudio subscription yet.",
        seeOffers: "See plans",
        manage: "Manage subscription",
        suspended:
          "Your subscription is suspended: settle the payment to get access back.",
      },
      instance: {
        title: "Your instance",
        open: "Open WorkStudio",
        pending: "Your instance is being prepared.",
        pendingText:
          "The open button will show up here as soon as its address is known.",
        locked: "The instance opens with an active subscription.",
      },
      agents: {
        title: "Agents called by your organization",
        lead: "The hosted agents your keys have called over the last 90 days.",
        empty: "No agents called yet.",
        catalog: "Browse agents",
        caption: "Agents called in the last 90 days",
        columns: {
          agent: "Agent",
          requests: "Requests",
          last: "Last call",
          cost: "Spend",
        },
        removed: "Removed from the catalogue",
      },
    },
    cloud: {
      soon: "Other cloud services: coming soon.",
    },
    billing: {
      title: "Billing.",
      lead: "Credits, subscriptions, invoices and history for your organization.",
    },
  },
};
