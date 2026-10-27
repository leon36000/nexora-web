// Aides pures du module « Paiements » : montants, libellés français, états, et construction (avec validation) des
// requêtes envoyées à l'app. Aucun accès réseau ici : tout est testé sans Directus.

const DECIMAL = /^(\d{1,9})(?:[.,](\d{1,2}))?$/;

/** « 129 », « 129,5 » ou « 129.50 » -> 12950 (cents) ; null si invalide ou nul. */
export function dollarsToCents(input: string): number | null {
  const m = DECIMAL.exec(input.trim().replace(/\s| |\$/g, ""));
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

/** 12900 -> « 129,00 $ » ; absent -> « — ». */
export function centsToDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `${(cents / 100).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
}

export type NoticeType = "info" | "success" | "warning" | "danger";
export type StateView = { label: string; icon: string; type: NoticeType };

/** État du branchement de Stripe, tel que l'API le renvoie (`state`). */
export const STRIPE_STATE: Record<string, StateView> = {
  no_key: { label: "Clé manquante", icon: "key_off", type: "warning" },
  key_unverified: {
    label: "Clé collée, à vérifier",
    icon: "pending",
    type: "info",
  },
  connected: { label: "Branché", icon: "check_circle", type: "success" },
  error: { label: "Erreur", icon: "error", type: "danger" },
};

export const MODE_LABEL: Record<string, string> = {
  test: "Mode test (aucun argent réel)",
  live: "Mode production (argent réel)",
};

export const KIND_LABEL: Record<string, string> = {
  percent: "Pourcentage",
  amount: "Montant",
  free: "Gratuit (100 %)",
  trial: "Essai de N jours",
  staff: "Personnel (offert, sans Stripe)",
};
export const SCOPE_LABEL: Record<string, string> = {
  subscriptions: "Abonnements",
  credits: "Crédits",
  vps: "VPS",
};
export const DURATION_LABEL: Record<string, string> = {
  once: "Une seule fois",
  repeating: "Pendant N mois",
  forever: "Pour toujours",
};

export type PromoItem = {
  id: string;
  code: string;
  label: string;
  kind: string;
  percentOff: number | null;
  amountOffCents: number | null;
  trialDays: number | null;
  scopes: string[];
  duration: string;
  durationMonths: number | null;
  maxRedemptions: number | null;
  expiresAt: string | null;
  firstOrderOnly: boolean;
  onePerCustomer: boolean;
  minAmountCents: number | null;
  status: string;
  stripePromotionCodeId: string | null;
  stripeSyncError: string | null;
  redemptions: number;
  discountCents: number;
};

/** Valeur du code en une phrase : « 20 % de rabais, une seule fois ». */
export function describePromo(p: PromoItem): string {
  const value =
    p.kind === "percent"
      ? `${p.percentOff} % de rabais`
      : p.kind === "amount"
        ? `${centsToDollars(p.amountOffCents)} de rabais`
        : p.kind === "free"
          ? "Gratuit (100 %)"
          : p.kind === "trial"
            ? `Essai de ${p.trialDays} jours`
            : "Offert par l’équipe";
  if (p.kind === "trial" || p.kind === "staff") return value;
  const when =
    p.duration === "repeating"
      ? `pendant ${p.durationMonths} mois`
      : p.duration === "forever"
        ? "pour toujours"
        : "une seule fois";
  return `${value}, ${when}`;
}

/** État de la synchronisation avec Stripe d'un code. */
export function syncState(p: PromoItem): StateView {
  if (p.kind === "staff" || p.kind === "trial")
    return { label: "Sans Stripe", icon: "block", type: "info" };
  if (p.stripeSyncError)
    return { label: "Erreur", icon: "error", type: "danger" };
  if (p.stripePromotionCodeId)
    return { label: "Synchronisé", icon: "check_circle", type: "success" };
  return { label: "À synchroniser", icon: "sync", type: "warning" };
}

export type PromoForm = {
  code: string;
  label: string;
  kind: string;
  percent: string;
  amount: string;
  trialDays: string;
  scopes: string[];
  duration: string;
  durationMonths: string;
  maxRedemptions: string;
  expiresOn: string;
  firstOrderOnly: boolean;
  onePerCustomer: boolean;
  minAmount: string;
};

export const EMPTY_PROMO_FORM: PromoForm = {
  code: "",
  label: "",
  kind: "percent",
  percent: "",
  amount: "",
  trialDays: "",
  scopes: ["subscriptions"],
  duration: "once",
  durationMonths: "",
  maxRedemptions: "",
  expiresOn: "",
  firstOrderOnly: false,
  onePerCustomer: false,
  minAmount: "",
};

const positiveInt = (s: string): number | null => {
  const t = s.trim();
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
};

export type Built<T> =
  | { ok: true; payload: T }
  | { ok: false; errors: string[] };

/** Formulaire -> définition envoyée à l'app (sans le code si `withCode` est faux : lots). */
export function buildPromoDefinition(
  f: PromoForm,
  withCode: boolean,
): Built<Record<string, unknown>> {
  const errors: string[] = [];
  const out: Record<string, unknown> = { kind: f.kind, scopes: f.scopes };
  if (withCode) {
    const code = f.code.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9-]{3,40}$/.test(code))
      errors.push(
        "Code : 3 à 40 caractères, lettres, chiffres et tirets seulement.",
      );
    out.code = code;
  }
  if (f.label.trim()) out.label = f.label.trim();
  if (f.scopes.length === 0) errors.push("Choisissez au moins une portée.");
  if (f.kind === "percent") {
    const n = positiveInt(f.percent);
    if (n === null || n > 100)
      errors.push("Pourcentage : un entier de 1 à 100.");
    else out.percentOff = n;
  } else if (f.kind === "amount") {
    const c = dollarsToCents(f.amount);
    if (c === null)
      errors.push("Montant du rabais invalide (ex. 15 ou 15,50).");
    else out.amountOffCents = c;
  } else if (f.kind === "trial") {
    const n = positiveInt(f.trialDays);
    if (n === null || n > 365) errors.push("Essai : 1 à 365 jours.");
    else out.trialDays = n;
    if (f.scopes.some((s) => s !== "subscriptions"))
      errors.push("Un code d’essai ne vise que les abonnements.");
  }
  if (
    f.scopes.includes("credits") &&
    (f.kind === "free" || (f.kind === "percent" && out.percentOff === 100))
  )
    errors.push(
      "Un rabais de 100 % ne peut pas viser les crédits : utilisez un code du personnel.",
    );
  if (f.kind !== "trial" && f.kind !== "staff") {
    out.duration = f.duration;
    if (f.duration === "repeating") {
      const n = positiveInt(f.durationMonths);
      if (n === null || n > 36) errors.push("Durée : 1 à 36 mois.");
      else out.durationMonths = n;
    }
  }
  if (f.maxRedemptions.trim()) {
    const n = positiveInt(f.maxRedemptions);
    if (n === null) errors.push("Utilisations maximales : un entier positif.");
    else out.maxRedemptions = n;
  }
  if (f.expiresOn.trim()) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(f.expiresOn) ||
      Number.isNaN(Date.parse(f.expiresOn))
    )
      errors.push("Date d’expiration invalide.");
    else out.expiresAt = `${f.expiresOn}T23:59:59.000Z`;
  }
  if (f.minAmount.trim()) {
    const c = dollarsToCents(f.minAmount);
    if (c === null) errors.push("Montant minimum invalide.");
    else out.minAmountCents = c;
  }
  out.firstOrderOnly = f.firstOrderOnly;
  out.onePerCustomer = f.onePerCustomer;
  return errors.length ? { ok: false, errors } : { ok: true, payload: out };
}

export type BatchForm = { prefix: string; count: string; length: string };

export function buildBatch(
  f: PromoForm,
  b: BatchForm,
): Built<Record<string, unknown>> {
  const def = buildPromoDefinition(f, false);
  const errors = def.ok ? [] : [...def.errors];
  const prefix = b.prefix.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{0,12}$/.test(prefix))
    errors.push("Préfixe : 12 lettres ou chiffres au plus.");
  const count = positiveInt(b.count);
  if (count === null || count > 5000)
    errors.push("Nombre de codes : 1 à 5 000.");
  const length = positiveInt(b.length);
  if (length === null || length < 4 || length > 24)
    errors.push("Longueur : 4 à 24 caractères.");
  if (errors.length || !def.ok || count === null || length === null)
    return { ok: false, errors };
  return {
    ok: true,
    payload: {
      ...(prefix ? { prefix } : {}),
      count,
      length,
      definition: def.payload,
    },
  };
}

export type PlanItem = {
  id: string;
  code: string;
  status: string;
  interval: string;
  price_cents: number | null;
  suggested_price_cents: number | null;
  trial_days: number | null;
  included_credits_cents: number | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  stripe_synced_at: string | null;
};

/** Ce qu'il reste à faire pour qu'une offre soit vendable, dans l'ordre. */
export function planNextStep(p: PlanItem): {
  label: string;
  action: "adopt" | "publish" | "sync" | "none";
} {
  if (p.price_cents === null || p.price_cents <= 0)
    return p.suggested_price_cents
      ? {
          label: "Fixer le prix (le prix suggéré peut être adopté)",
          action: "adopt",
        }
      : { label: "Fixer le prix", action: "none" };
  if (p.status !== "published")
    return {
      label: "Publier la fiche dans Directus (statut « Publié »)",
      action: "none",
    };
  if (!p.stripe_price_id)
    return { label: "Publier vers Stripe", action: "publish" };
  return { label: "Vendable", action: "sync" };
}

export const PLAN_STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  published: "Publié",
  archived: "Archivé",
};

/** Message d'erreur lisible d'une réponse de l'endpoint (format Directus `{ errors: [{ message }] }`). */
export function errorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: unknown } })?.response?.data as
    | {
        errors?: { message?: string }[];
        message?: string;
        error?: string;
        issues?: string[];
      }
    | undefined;
  const first = data?.errors?.[0]?.message ?? data?.message;
  const issues = data?.issues?.length ? ` (${data.issues.join(" ; ")})` : "";
  return first ? `${first}${issues}` : fallback;
}
