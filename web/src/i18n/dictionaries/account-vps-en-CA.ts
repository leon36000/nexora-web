import type { AccountVpsDictionary } from "./account-vps-fr-CA";

/** “My VPS” dictionary (en-CA): same structure as fr-CA, checked by the `AccountVpsDictionary` type. No invented figures, delivery times or guarantees. */
export const accountVpsEnCA: AccountVpsDictionary = {
  meta: {
    title: "My VPS | Nexora",
    description:
      "Your virtual private servers: status, SSH access, start, reinstall and cancellation.",
  },

  title: "My VPS.",
  lead: "Your virtual private servers: status, SSH access and everyday operations.",
  backToAccount: "Back to my account",
  autoRefresh: "This page updates automatically while an operation is running.",
  liveChange: "{name}: {state}.",

  noOrganization: {
    title: "No organization.",
    text: "No organization is linked to this account: your VPS belong to an organization.",
    link: "Back to my account",
  },

  banner: {
    ordered: "Payment received: your VPS is being prepared.",
    orderedWaiting:
      "Thank you. We are waiting for Stripe to confirm the payment; your VPS starts being prepared as soon as it arrives.",
  },

  empty: {
    title: "No VPS yet.",
    text: "Choose a size and an application, then pay: the machine is prepared automatically.",
    cta: "See the VPS plans",
  },

  list: {
    live: "Your VPS",
    closed: "Ended or failed VPS",
    order: "Order another VPS",
  },

  states: {
    provisioning: "Preparing",
    reinstalling: "Reinstalling",
    running: "Running",
    stopped: "Stopped",
    active: "Active",
    starting: "Starting",
    stopping: "Stopping",
    rebooting: "Rebooting",
    suspended: "Suspended",
    canceled: "Cancelled",
    failed: "Our team is on it",
    deleted: "Deleted",
  },
  stateLabel: "Status",

  card: {
    plan: "{vcpu} vCPU · {ram} GB RAM · {disk} GB disk",
    application: "Application",
    size: "Size",
    region: "Region",
    hostname: "Hostname",
    ip: "IP address",
    ipPending: "Assigned during preparation",
    ipCopy: "Copy the IP address",
    regions: {
      quebec: "Québec",
      canada: "Canada",
      etats_unis: "United States",
      europe: "Europe",
      autre: "Outside Canada",
    },
    created: "Ordered on {date}",
    activated: "Activated on {date}",
    suspended: "Suspended on {date}",
    canceled: "Cancelled on {date}",
    deleted: "Deleted on {date}",
  },

  copy: {
    button: "Copy",
    done: "Copied",
    failed: "Could not copy: select the text.",
  },

  access: {
    title: "SSH access",
    intro: "Connect with your SSH key:",
    commandCopy: "Copy the connection command",
    noPassword: "No password sign-in: only your SSH key is accepted.",
    unavailable: "Access details appear as soon as the IP address is assigned.",
    tunnel: {
      title: "Open an application through an SSH tunnel",
      text: "Applications listen on 127.0.0.1, inside the VM: they are not exposed to the Internet. To reach one from your computer, open a tunnel and leave the command running, then use the 127.0.0.1 address and the port, for example in your browser.",
      forPort: "{label} (port {port})",
      generic: "Replace <port> with the application’s port.",
      copy: "Copy the tunnel command",
      publicPorts: "Ports open on the firewall: {ports}.",
    },
    file: {
      title: "Access file",
      text: "At install time, the passwords and tokens generated for the application are written to the {file} file on the VM. Read it after your first sign-in and keep these values in your password manager.",
    },
    fingerprints: {
      title: "Fingerprints",
      yourKey: "Your SSH key",
      hostKey: "VM host key",
      hostKeyHint:
        "On your first connection, compare the fingerprint SSH shows with this one.",
      hostKeyPending: "Not collected yet.",
    },
  },

  billing: {
    title: "Subscription",
    perMonth: "{amount} per month, before tax",
    perYear: "{amount} per year, before tax",
    nextDue: "Next payment date: {date}",
    cancelRequested: "Cancellation requested",
    cancelsOn:
      "The service stays active until {date}, then the machine is stopped and deleted 7 days later.",
    cancelsNoDate:
      "The service stays active until the end of the paid period, then the machine is stopped and deleted 7 days later.",
  },

  progress: {
    provisioning: "Preparation in progress",
    reinstalling: "Reinstall in progress",
    stepsLabel: "Preparation steps",
    bar: "Step {current} of {total}",
    done: "done",
    current: "in progress",
    todo: "upcoming",
    stages: {
      placement: "Placement on a server",
      clone: "Creating the machine",
      configure: "Configuration",
      firewall: "Firewall",
      start: "Starting",
      await_agent: "Waiting for the agent",
      install: "Installing the application",
      verify: "Verification",
    },
  },

  suspended: {
    title: "Payment not received",
    text: "This VPS is suspended because the subscription payment was not received. Your data is kept. Once the payment is sorted out, the VPS is resumed.",
    portal: "Open the billing portal",
    ownerOnly: "Only the organization owner can open the billing portal.",
  },

  canceled: {
    title: "VPS cancelled",
    text: "The machine is stopped. It will be deleted on {date}.",
    textNoDate: "The machine is stopped, then it will be deleted.",
  },

  failed: {
    title: "Our team is working on this",
    text: "We are taking care of this VPS: there is nothing you need to do for now.",
    contact: "Contact us",
  },

  deleted: {
    text: "This VPS has been deleted.",
  },

  orders: {
    title: "Orders without a VPS",
    plan: "{plan} · {app}",
    statuses: {
      awaiting_payment: "Awaiting payment",
      paid: "Payment received",
      provisioning: "Preparing",
      fulfilled: "Delivered",
      failed: "Our team is on it",
      canceled: "Cancelled",
      expired: "Expired",
      late_payment: "Payment received, under review",
    },
    hints: {
      awaiting_payment:
        "Payment is not complete. To start again, go back to the VPS plans.",
      paid: "Payment received: your VPS is being prepared.",
      provisioning: "Your VPS is being prepared.",
      fulfilled: "This order has been delivered.",
      failed: "Our team is working on this.",
      canceled: "This order was cancelled.",
      expired: "This order expired without payment.",
      late_payment:
        "Your payment was received, but the order had expired. Our team has been alerted and is handling it.",
    },
  },

  actions: {
    title: "Operations",
    start: "Start",
    stop: "Stop",
    reboot: "Reboot",
    reinstall: "Reinstall…",
    cancel: "Cancel service…",
    working: "Sending…",
    ownerOnly: "Only the organization owner can reinstall or cancel a VPS.",
    suspendedNote: "Operations are disabled until the payment is sorted out.",
    forVps: "{action}: {name}",
    sent: {
      start: "Start requested.",
      stop: "Stop requested.",
      reboot: "Reboot requested.",
      reinstall: "Reinstall requested.",
      cancel: "Cancellation requested.",
    },
  },

  errors: {
    not_active:
      "This operation is only possible while the VPS is active and idle.",
    confirmation_required: "A confirmation is required.",
    forbidden: "Only the organization owner can do this.",
    rate_limited: "Too many requests. Wait a minute before trying again.",
    no_subscription:
      "No subscription is linked to this VPS: write to us and we will sort it out with you.",
    not_found: "This VPS could not be found.",
    unauthenticated: "Your session has expired. Sign in again.",
    generic: "The operation failed. Try again in a moment.",
  },

  dialog: {
    close: "Close",
    cancelButton: "Cancel",
    reinstall: {
      title: "Reinstall this VPS?",
      warning:
        "All data on the disk will be erased. Nexora keeps a snapshot of the old machine for 7 days so our team can recover it; this is not a self-service backup.",
      unavailable: "The VPS will be unavailable during the reinstall.",
      ack: "I understand",
      ackRequired: "Tick the box to confirm.",
      submit: "Reinstall",
    },
    cancel: {
      title: "Cancel this VPS?",
      text: "The service stays active until the end of the paid period ({date}), then the machine is stopped and deleted 7 days later.",
      textNoDate:
        "The service stays active until the end of the paid period, then the machine is stopped and deleted 7 days later.",
      submit: "Confirm cancellation",
    },
  },

  journal: {
    title: "Log",
    empty: "No events yet.",
    caption: "Latest events for this VPS",
    actors: {
      system: "System",
      customer: "You",
      operator: "Nexora team",
      stripe: "Payment",
      worker: "System",
    },
    kinds: {
      order_created: "Order created",
      checkout_completed: "Payment being confirmed",
      paid: "Payment confirmed",
      provision_started: "Preparation started",
      placed: "Server assigned",
      no_capacity: "Waiting for capacity",
      checkout_expired: "Payment session expired",
      resumed_after_expiry: "Payment received after expiry: order resumed",
      paid_after_expiry: "Payment received after expiry: under review",
      clone_started: "Creating the machine",
      vm_started: "Machine started",
      app_installed: "Application installed",
      active: "VPS active",
      step_error: "A step failed: trying again",
      provision_failed: "Preparation failed",
      reinstall_started: "Reinstall requested",
      reinstall_done: "Reinstall complete",
      reinstall_failed: "Reinstall failed",
      old_vm_retained: "Old machine kept for recovery",
      old_vm_deleted: "Old machine deleted",
      cleanup_failed: "Clean-up to retry",
      power_start: "VPS started",
      power_stop: "VPS stopped",
      power_reboot: "VPS rebooted",
      suspended: "VPS suspended: payment not received",
      resumed: "VPS resumed",
      cancel_requested: "Cancellation requested",
      canceled: "Subscription cancelled: machine stopped",
      deleted: "VPS deleted",
    },
  },
};
