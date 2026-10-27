import type { SecurityDictionary } from "./security-fr-CA";

export const securityEnCA: SecurityDictionary = {
  meta: { title: "Account security" },
  title: "Account security.",
  lead: "Protect your account with a second factor: a six-digit code from an authenticator app (Aegis, FreeOTP, 1Password, Google Authenticator…).",
  back: "Back to my account",
  required: {
    title: "Two-factor authentication is required for your account.",
    text: "Your account is flagged as staff: until two-factor authentication is on, team privileges (team codes, provided services) are suspended.",
  },
  status: {
    on: "Two-factor authentication is on.",
    off: "Two-factor authentication is off.",
  },
  enable: {
    title: "Turn on two-factor authentication",
    password: "Your password",
    passwordHint: "We ask for it to confirm it is really you.",
    start: "Start",
    scan: "Scan this code with your app, or type the key by hand:",
    qrLabel: "Two-factor authentication setup QR code",
    secretLabel: "Setup key",
    codes: {
      title: "Backup codes",
      text: "Each code works once, if you lose your phone. Write them down now in a safe place: they will not be shown again.",
    },
    confirmLabel: "Six-digit code shown by the app",
    confirm: "Turn on",
    done: "Done: two-factor authentication is on. You will be asked for a code at your next sign-in.",
  },
  regenerate: {
    title: "Backup codes",
    text: "Generate new codes: the old ones stop working.",
    action: "Generate new codes",
    done: "New backup codes (the old ones are invalid):",
  },
  disable: {
    title: "Turn off two-factor authentication",
    text: "Your account will only be protected by your password.",
    action: "Turn off",
    done: "Two-factor authentication is off.",
    staff: "A staff account cannot turn off two-factor authentication.",
  },
  challenge: {
    title: "Two-step verification.",
    lead: "Enter the six-digit code from your authenticator app.",
    code: "Six-digit code",
    submit: "Verify",
    useBackup: "Use a backup code",
    useApp: "Use the authenticator app",
    backupCode: "Backup code",
    errors: {
      invalid: "This code is not valid. Try again.",
      locked:
        "Too many failures: the account is locked for a few minutes. Try again later.",
      expired: "The verification expired. Sign in again with your password.",
      generic: "The verification failed. Try again in a moment.",
    },
  },
  errors: {
    password: "Wrong password.",
    code: "This code is not valid.",
    rateLimited: "Too many attempts. Wait before trying again.",
    staff: "A staff account cannot turn off two-factor authentication.",
    generic: "The operation failed. Try again in a moment.",
  },
  dashboard: {
    link: "Account security",
    linkText: "Two-factor authentication and backup codes.",
  },
  common: { working: "Working…", copy: "Copy" },
};
