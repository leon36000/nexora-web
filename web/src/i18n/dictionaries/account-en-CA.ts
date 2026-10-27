import type { AccountDictionary } from "./account-fr-CA";

/** Customer area dictionary (en-CA): same structure as fr-CA, checked by the `AccountDictionary` type. */
export const accountEnCA: AccountDictionary = {
  meta: {
    login: "Sign in | Nexora",
    signup: "Create an account | Nexora",
    forgot: "Forgot your password | Nexora",
    reset: "New password | Nexora",
    verify: "Email confirmation | Nexora",
    dashboard: "My account | Nexora",
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
    passwordHint: "At least 10 characters.",
    submit: "Create my account",
    haveAccount: "Already have an account?",
    loginLink: "Sign in",
    errors: {
      nameRequired: "Enter your name.",
      weak: "This password is too short: at least 10 characters.",
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
    lead: "Choose a password of at least 10 characters. Your other sessions will be signed out.",
    password: "New password",
    submit: "Save the password",
    done: "Your password has been changed. You can now sign in.",
    goLogin: "Go to sign in",
    errors: {
      invalidToken: "This link is invalid or has expired. Ask for a new one.",
      weak: "This password is too short: at least 10 characters.",
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
        plan_not_synced: "This plan is not ready for sale yet.",
        rate_limited: "Too many requests. Wait a minute before trying again.",
        payment_unavailable:
          "The payment service is not responding. Try again in a moment.",
        internal_error: "Something went wrong. Try again in a moment.",
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
      productName: "Nexora credits",
      lead: "One-time payment, no subscription. You receive the pre-tax amount as credits.",
      amount: "Amount in Canadian dollars",
      choose: "Suggested amounts",
      submit: "Pay with Stripe",
      taxNote:
        "GST and QST are calculated by Stripe at the next step, based on your billing address, and added to the amount.",
      testNote: "Test mode: no real payment is possible for now.",
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
      statuses: {
        incomplete: "Awaiting payment",
        incomplete_expired: "Expired",
        trialing: "Trial",
        active: "Active",
        past_due: "Payment overdue",
        unpaid: "Unpaid",
        paused: "Paused",
        canceled: "Cancelled",
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
        included: "{amount} of credits included each period",
        subscribe: "Subscribe",
        ownerOnly: "Only the owner can subscribe.",
        unavailable: "Plans cannot be displayed at the moment.",
        notReady: "Coming soon",
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
};
