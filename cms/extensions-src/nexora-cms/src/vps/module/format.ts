// Aides pures du module « VPS » : montants en dollars <-> cents entiers (aucun nombre à virgule flottante),
// libellés français (états, problèmes de la garde, différences, erreurs) et construction + validation des corps
// envoyés à l'API d'administration. Rien ici ne touche au réseau ni au DOM, pour pouvoir être testé.

// ─── Montants ────────────────────────────────────────────────────────────────────

const DOLLARS = /^(\d{1,7})(?:[.,](\d{1,2}))?$/;
/** Même plafond que l'API : 100 000,00 $ (10 000 000 cents). */
export const MAX_CENTS = 100_000_00;

/** « 12,5 » ou « 12.50 » -> 1250 (cents) ; null si invalide, nul (0) ou au-dessus du plafond de l'API. */
export function parseDollarsToCents(input: string): number | null {
  const m = DOLLARS.exec(input.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return cents >= 1 && cents <= MAX_CENTS ? cents : null;
}

/** 1250 -> « 12,50 » ; 1200 -> « 12,00 » ; chaîne vide si absent. */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents))
    return "";
  const whole = Math.trunc(cents / 100);
  const frac = String(Math.abs(cents % 100)).padStart(2, "0");
  return `${whole},${frac}`;
}

/** « 12,50 $ » ou « — » pour une durée non offerte. */
export function priceLabel(cents: number | null | undefined): string {
  const s = formatCents(cents);
  return s ? `${s} $` : "—";
}

// ─── Nombres et listes ───────────────────────────────────────────────────────────

/** Entier strict ("12", 12) ; null pour "", "1.5", "1e3", "abc". */
export function toInt(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string" || !/^-?\d{1,15}$/.test(value.trim()))
    return null;
  return Number(value.trim());
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export function isIPv4(value: string): boolean {
  const m = IPV4.exec(value);
  return !!m && m.slice(1).every((o) => Number(o) <= 255);
}

/** Une plage par ligne : « 10.0.0.10 - 10.0.0.50 ». Renvoie null si une ligne est mal formée. */
export function parseRanges(
  text: string,
): { from: string; to: string }[] | null {
  const out: { from: string; to: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s*[-–—]\s*|\s+/).filter(Boolean);
    const [from, to] = parts;
    if (parts.length !== 2 || !from || !to || !isIPv4(from) || !isIPv4(to))
      return null;
    out.push({ from, to });
  }
  return out;
}
export const formatRanges = (ranges: { from: string; to: string }[]): string =>
  ranges.map((r) => `${r.from} - ${r.to}`).join("\n");

/** « 1.1.1.1, 9.9.9.9 » -> liste ; null si une adresse est invalide. */
export function parseDns(text: string): string[] | null {
  const items = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return items.every(isIPv4) ? items : null;
}

// ─── Libellés ────────────────────────────────────────────────────────────────────

type Labels = Record<string, string>;
export const label = (map: Labels, value: string | null | undefined): string =>
  value ? (map[value] ?? value) : "—";

export const SERVER_STATE: Labels = {
  draft: "brouillon",
  ready: "prêt",
  maintenance: "maintenance",
  offline: "hors ligne",
};
export const ITEM_STATUS: Labels = {
  draft: "brouillon",
  approved: "approuvé",
  published: "publié",
  retired: "retiré",
};
export const VERSION_STATUS: Labels = {
  draft: "brouillon",
  approved: "approuvée",
  published: "publiée",
  superseded: "remplacée",
};
export const TEMPLATE_STATE: Labels = {
  draft: "à vérifier",
  ready: "prêt",
  retired: "retiré",
};
export const ORDER_STATUS: Labels = {
  awaiting_payment: "en attente du paiement",
  paid: "payée",
  provisioning: "en cours de création",
  fulfilled: "livrée",
  failed: "échouée",
  canceled: "annulée",
  expired: "expirée",
  late_payment: "payée après expiration (à traiter)",
};
export const INSTANCE_STATUS: Labels = {
  provisioning: "en cours de création",
  active: "actif",
  suspended: "suspendu",
  reinstalling: "réinstallation",
  canceled: "annulé",
  failed: "en échec",
  deleted: "supprimé",
};
export const STEP: Labels = {
  placement: "placement",
  snapshot: "instantané",
  clone: "clonage",
  configure: "configuration",
  firewall: "pare-feu",
  start: "démarrage",
  await_agent: "attente de l’agent",
  install: "installation",
  verify: "vérification",
  done: "terminé",
};
export const POWER: Labels = {
  unknown: "inconnu",
  running: "en marche",
  stopped: "arrêté",
};
export const TERM: Labels = { month: "mensuel", year: "annuel" };
export const REGION: Labels = {
  quebec: "Québec",
  canada: "Canada",
  etats_unis: "États-Unis",
  europe: "Europe",
  autre: "Autre",
};
export const APPLIED: Labels = {
  applied: "appliquée",
  failed: "en échec",
};
export const appliedLabel = (status: string | null | undefined): string =>
  status ? (APPLIED[status] ?? status) : "jamais faite";

/** Date locale courte (ex. « 2026-10-27 14:05 ») ; « — » si absente ou invalide. */
export function formatDate(
  iso: string | null | undefined,
  timeZone?: string,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

// ─── Problèmes de la garde, différences ──────────────────────────────────────────

const ISSUE_LABELS: Labels = {
  price_missing: "aucun prix (jamais 0 $)",
  price_invalid: "prix invalide",
  yearly_not_cheaper:
    "le prix annuel doit être inférieur à 12 mois au tarif mensuel",
  dev_sample: "plan de développement : non publiable en production",
  template_missing:
    "aucun gabarit prêt de ce code sur un serveur prêt de la région",
  excluded: "exclue de l’installation (D8) : guide seulement",
  license_not_permissive: "licence non permissive : installation refusée (D8)",
  script_missing: "script d’installation absent",
  script_hash_mismatch: "la somme SHA-256 ne correspond pas au script",
  version_unpinned: "version non épinglée",
  guide_incomplete:
    "un guide exige l’avertissement de licence (fr, en) et le guide d’installation",
  license_url: "l’adresse de la licence doit commencer par https",
  duplicate: "code en double",
};
const ENTITY: Labels = {
  plan: "Plan",
  app: "Application",
  catalog: "Catalogue",
};
const ZOD_CODES: Labels = {
  invalid_type: "type de valeur invalide",
  too_small: "valeur trop petite ou trop courte",
  too_big: "valeur trop grande ou trop longue",
  invalid_format: "format invalide",
  invalid_value: "valeur non permise",
  unrecognized_keys: "champ inconnu",
  invalid_union: "valeur invalide",
};

/**
 * Un problème tel que l'app le renvoie : chaîne (serveur : déjà en français), problème de la garde
 * `{ entity, code, issue, message }` ou erreur de validation `{ path, code }`.
 */
export function describeIssue(issue: unknown): string {
  if (typeof issue === "string") return issue;
  if (!issue || typeof issue !== "object") return "problème inconnu";
  const i = issue as Record<string, unknown>;
  if (typeof i.issue === "string") {
    const what = label(ISSUE_LABELS, i.issue);
    const who = typeof i.code === "string" ? ` « ${i.code} »` : "";
    const entity = ENTITY[String(i.entity)] ?? "Élément";
    return `${entity}${who} : ${i.issue in ISSUE_LABELS ? what : String(i.message ?? i.issue)}`;
  }
  if (typeof i.code === "string") {
    const where = typeof i.path === "string" && i.path ? i.path : "";
    const what = ZOD_CODES[i.code] ?? i.code;
    return where ? `Champ « ${where} » : ${what}` : what;
  }
  return "problème inconnu";
}

/** Types de problèmes de la garde par élément : clé `app:<code>` ou `plan:<code>`. */
export function indexIssues(issues: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!Array.isArray(issues)) return out;
  for (const raw of issues) {
    const i = raw as Record<string, unknown> | null;
    if (
      i &&
      typeof i === "object" &&
      typeof i.entity === "string" &&
      typeof i.code === "string" &&
      typeof i.issue === "string"
    ) {
      const key = `${i.entity}:${i.code}`;
      const list = out[key] ?? [];
      if (!list.includes(i.issue)) list.push(i.issue);
      out[key] = list;
    }
  }
  return out;
}

/** Pastilles d'une application selon ce que la garde a dit (jamais déduites côté navigateur). */
export function appBadges(issueTypes: readonly string[] | undefined): string[] {
  const out: string[] = [];
  if (issueTypes?.includes("license_not_permissive"))
    out.push("licence non permissive");
  if (issueTypes?.includes("excluded"))
    out.push("exclue de l’installation (D8)");
  return out;
}

const FIELD_LABELS: Labels = {
  name: "nom",
  descriptionFr: "description (fr)",
  descriptionEn: "description (en)",
  vcpu: "vCPU",
  ramMb: "RAM",
  diskGb: "disque",
  bandwidthGb: "bande passante",
  region: "région",
  priceMonthlyCents: "prix mensuel",
  priceYearlyCents: "prix annuel",
  highlighted: "mise en avant",
  templateCode: "gabarit",
  sort: "tri",
  isDevSample: "plan de développement",
  kind: "type",
  version: "version",
  license: "licence",
  licenseUrl: "adresse de la licence",
  installScript: "script d’installation",
  installScriptSha256: "somme SHA-256",
  ports: "ports",
  minRamMb: "RAM minimale",
};

export function describeDiff(entry: unknown): string {
  const e = (entry ?? {}) as Record<string, unknown>;
  const who = typeof e.code === "string" ? e.code : "?";
  const noun = e.entity === "app" ? "Application" : "Plan";
  const feminine = e.entity === "app";
  const fields = Array.isArray(e.fields)
    ? e.fields.map((f) => label(FIELD_LABELS, String(f))).join(", ")
    : "";
  switch (e.change) {
    case "added":
      return `${noun} ${feminine ? "ajoutée" : "ajouté"} : ${who}`;
    case "removed":
      return `${noun} ${feminine ? "retirée" : "retiré"} : ${who}`;
    case "changed":
      return `${noun} ${feminine ? "modifiée" : "modifié"} : ${who}${fields ? ` (${fields})` : ""}`;
    default:
      return `Changement : ${who}`;
  }
}

/** Résultat de « Publier vers Stripe » : une ligne par plan (identifiants de produit et de prix). */
export function describeStripePlans(result: unknown): string[] {
  const plans = (result as { plans?: Record<string, unknown> } | null)?.plans;
  if (!plans || typeof plans !== "object") return [];
  return Object.entries(plans).map(([code, raw]) => {
    const p = raw as {
      productId?: string;
      monthly?: string;
      yearly?: string;
      created?: number;
    };
    const parts = [`produit ${p.productId ?? "?"}`];
    if (p.monthly) parts.push(`prix mensuel ${p.monthly}`);
    if (p.yearly) parts.push(`prix annuel ${p.yearly}`);
    const created = p.created ?? 0;
    parts.push(
      created > 0
        ? `${created} nouveau${created > 1 ? "x" : ""} prix`
        : "aucun nouveau prix",
    );
    return `${code} : ${parts.join(" · ")}`;
  });
}

/** Résumé du test de connexion d'un serveur Proxmox (jamais de jeton : l'app n'en renvoie pas). */
export function summarizeTest(r: {
  ok?: boolean;
  detail?: string;
  version?: string | null;
  templates?: { code: string; ok: boolean }[];
}): string {
  const bits: string[] = [r.ok ? "Connexion réussie" : "Connexion en échec"];
  if (r.version) bits.push(`Proxmox ${r.version}`);
  if (!r.ok && r.detail) bits.push(r.detail);
  const tpls = r.templates ?? [];
  if (tpls.length === 0) bits.push("aucun gabarit à vérifier");
  else
    bits.push(
      `gabarits : ${tpls.map((t) => `${t.code} ${t.ok ? "prêt" : "introuvable"}`).join(", ")}`,
    );
  return bits.join(" · ");
}

// ─── Erreurs ─────────────────────────────────────────────────────────────────────

const ERROR_TEXT: Labels = {
  VPS_NON_CONFIGURE:
    "Le service d’administration de l’app n’est pas configuré (NEXORA_APP_INTERNAL_URL / NEXORA_APP_ADMIN_TOKEN).",
  VPS_INDISPONIBLE: "Le service d’administration de l’app est injoignable.",
  VPS_NON_AUTORISE: "L’app a refusé le jeton de service de Directus.",
  VPS_REPONSE_INVALIDE: "Réponse invalide du service d’administration.",
  VPS_ERREUR: "Le service d’administration a répondu par une erreur.",
  VPS_ROUTE_INCONNUE: "Appel non pris en charge.",
  VPS_REQUETE_INVALIDE: "Requête refusée.",
  VPS_CORPS_TROP_GRAND: "Les données envoyées sont trop volumineuses.",
  admin_not_configured:
    "Le service d’administration de l’app n’est pas configuré.",
  not_found: "Élément introuvable.",
  method_not_allowed: "Opération non permise.",
  conflict: "Cet élément existe déjà (code en double).",
  invalid_request: "Valeurs refusées : vérifiez les champs.",
  invalid_json: "Données illisibles.",
  invalid_transition: "Cette transition d’état n’est pas permise.",
  publication_refused: "Refusé par la garde de publication.",
  stale_version:
    "Le catalogue publié a changé depuis ce brouillon : créez-en un nouveau.",
  no_published_catalog: "Aucun catalogue publié.",
  nothing_to_sync: "Aucun plan publié à synchroniser.",
  payload_too_large: "Les données envoyées sont trop volumineuses.",
  internal_error: "Erreur interne de l’app.",
  FORBIDDEN: "Réservé aux administrateurs.",
  INVALID_CREDENTIALS: "Session expirée : reconnectez-vous à Directus.",
};

/** Message sobre pour une erreur de relais : code applicatif d'abord, sinon l'état HTTP, sinon le réseau. */
export function errorText(status: number | undefined, code: string): string {
  if (code && ERROR_TEXT[code]) return ERROR_TEXT[code];
  if (status === undefined) return "Le réseau est indisponible : réessayez.";
  if (status === 401) return "Session expirée : reconnectez-vous à Directus.";
  if (status === 403) return "Réservé aux administrateurs.";
  if (status >= 500)
    return "Le service d’administration a répondu par une erreur.";
  return `Échec de l’opération${code ? ` (${code})` : ""}.`;
}

// ─── Corps envoyés à l'API (validation + conversion) ─────────────────────────────

export type Built<T> = { ok: true; body: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});
const CODE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const CODE_HINT =
  "3 à 40 caractères : minuscules, chiffres et tirets (sans tiret au début ni à la fin)";
const intIn = (value: unknown, min: number, max: number): number | null => {
  const n = toInt(value);
  return n !== null && n >= min && n <= max ? n : null;
};
const blank = (s: unknown): string => (typeof s === "string" ? s.trim() : "");
const orNull = (s: unknown): string | null => blank(s) || null;

/** Référence du Coffre pour le jeton Proxmox d'un serveur. Respecte `^[a-z0-9._-]{3,64}$`. */
export const proxmoxRef = (serverCode: string): string =>
  `proxmox.${serverCode}`;

export interface ServerForm {
  code: string;
  name: string;
  host: string;
  port: string | number;
  node: string;
  region: string;
  vcpu: string | number;
  ramMb: string | number;
  diskGb: string | number;
  ranges: string;
  prefix: string | number;
  gateway: string;
  dns: string;
  bridge: string;
  storage: string;
  pool: string;
  vmidMin: string | number;
  tlsMode: string;
  tlsFingerprint: string;
  /** Édition seulement : '' = ne pas changer ; « prêt » ne se choisit jamais (il vient du test). */
  state: string;
}

export function buildServerBody(
  f: ServerForm,
  mode: "create" | "edit",
): Built<Record<string, unknown>> {
  if (mode === "create" && !CODE.test(blank(f.code)))
    return fail(`Code du serveur invalide : ${CODE_HINT}.`);
  if (!blank(f.name)) return fail("Le nom est obligatoire.");
  if (!blank(f.host)) return fail("L’hôte est obligatoire.");
  const port = intIn(f.port, 1, 65535);
  if (port === null) return fail("Port invalide (1 à 65535).");
  if (!blank(f.node)) return fail("Le nom du nœud Proxmox est obligatoire.");
  const vcpu = intIn(f.vcpu, 1, 4096);
  const ramMb = intIn(f.ramMb, 1, 16_000_000);
  const diskGb = intIn(f.diskGb, 1, 10_000_000);
  if (vcpu === null || ramMb === null || diskGb === null)
    return fail(
      "Capacité invalide : vCPU, RAM (Mo) et disque (Go) doivent être des entiers positifs.",
    );
  const ranges = parseRanges(f.ranges);
  if (!ranges || ranges.length === 0 || ranges.length > 20)
    return fail(
      "Plages d’adresses invalides : une par ligne, « 10.0.0.10 - 10.0.0.50 » (1 à 20).",
    );
  const prefix = intIn(f.prefix, 8, 30);
  if (prefix === null) return fail("Préfixe invalide (8 à 30).");
  if (!isIPv4(blank(f.gateway)))
    return fail("Passerelle invalide (adresse IPv4).");
  const dns = parseDns(f.dns);
  if (!dns || dns.length === 0 || dns.length > 4)
    return fail(
      "DNS invalide : 1 à 4 adresses IPv4 séparées par des virgules.",
    );
  if (!blank(f.bridge))
    return fail("Le pont réseau est obligatoire (ex. vmbr0).");
  if (!blank(f.storage))
    return fail("Le stockage est obligatoire (ex. local-lvm).");
  const vmidMin = intIn(f.vmidMin, 100, 999_999_000);
  if (vmidMin === null) return fail("VMID minimal invalide (100 ou plus).");
  if (f.tlsMode !== "verify" && f.tlsMode !== "pinned")
    return fail("Mode TLS invalide.");
  const fingerprint = blank(f.tlsFingerprint);
  if (f.tlsMode === "pinned" && !/^([0-9a-fA-F]{2}:?){32}$/.test(fingerprint))
    return fail(
      "Empreinte SHA-256 du certificat attendue (64 caractères hexadécimaux, avec ou sans « : »).",
    );
  const body: Record<string, unknown> = {
    name: blank(f.name),
    host: blank(f.host),
    port,
    node: blank(f.node),
    region: f.region,
    capacity: { vcpu, ramMb, diskGb },
    ipPool: {
      ranges,
      prefix,
      gateway: blank(f.gateway),
      dns,
      bridge: blank(f.bridge),
    },
    storage: blank(f.storage),
    pool: orNull(f.pool),
    vmidMin,
    tlsMode: f.tlsMode,
    tlsFingerprint: f.tlsMode === "pinned" ? fingerprint : null,
  };
  if (mode === "create") body.code = blank(f.code);
  else if (f.state) {
    if (!["draft", "maintenance", "offline"].includes(f.state))
      return fail(
        "L’état « prêt » vient du test de connexion : il ne se choisit pas à la main.",
      );
    body.state = f.state;
  }
  return { ok: true, body };
}

export interface TemplateForm {
  code: string;
  name: string;
  os: string;
  osVersion: string;
  vmid: string | number;
  ciUser: string;
}
export function buildTemplateBody(
  f: TemplateForm,
  mode: "create" | "edit",
): Built<Record<string, unknown>> {
  if (mode === "create" && !CODE.test(blank(f.code)))
    return fail(`Code du gabarit invalide : ${CODE_HINT}.`);
  if (!blank(f.name) || !blank(f.os) || !blank(f.osVersion))
    return fail("Nom, système et version du système sont obligatoires.");
  const vmid = intIn(f.vmid, 100, 999_999_999);
  if (vmid === null)
    return fail("VMID du gabarit invalide (100 à 999 999 999).");
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(blank(f.ciUser)))
    return fail("Utilisateur cloud-init invalide (ex. debian).");
  const body: Record<string, unknown> = {
    name: blank(f.name),
    os: blank(f.os),
    osVersion: blank(f.osVersion),
    vmid,
    ciUser: blank(f.ciUser),
  };
  if (mode === "create") body.code = blank(f.code);
  return { ok: true, body };
}

export interface PlanForm {
  code: string;
  name: string;
  descriptionFr: string;
  descriptionEn: string;
  vcpu: string | number;
  ramMb: string | number;
  diskGb: string | number;
  bandwidthGb: string | number;
  region: string;
  /** En dollars, tel que saisi ; vide = durée non offerte. */
  priceMonthly: string;
  priceYearly: string;
  highlighted: boolean;
  templateCode: string;
  sort: string | number;
  isDevSample: boolean;
}
export function buildPlanBody(
  f: PlanForm,
  mode: "create" | "edit",
): Built<Record<string, unknown>> {
  if (mode === "create" && !CODE.test(blank(f.code)))
    return fail(`Code du plan invalide : ${CODE_HINT}.`);
  if (!blank(f.name)) return fail("Le nom est obligatoire.");
  const vcpu = intIn(f.vcpu, 1, 256);
  const ramMb = intIn(f.ramMb, 256, 4_000_000);
  const diskGb = intIn(f.diskGb, 1, 100_000);
  const bandwidthGb = intIn(f.bandwidthGb, 0, 10_000_000);
  if (vcpu === null) return fail("vCPU invalide (1 à 256).");
  if (ramMb === null) return fail("RAM invalide (256 Mo ou plus).");
  if (diskGb === null) return fail("Disque invalide (1 Go ou plus).");
  if (bandwidthGb === null)
    return fail("Bande passante invalide (0 Go ou plus).");
  if (!CODE.test(blank(f.templateCode)))
    return fail(
      "Le code du gabarit est obligatoire (celui d’un gabarit de serveur).",
    );
  const sort = intIn(f.sort, 0, 10_000);
  if (sort === null) return fail("Tri invalide (0 à 10 000).");
  const price = (raw: string, name: string): Built<number | null> => {
    if (!blank(raw)) return { ok: true, body: null };
    const cents = parseDollarsToCents(raw);
    return cents === null
      ? fail(
          `Prix ${name} invalide : montant en dollars supérieur à 0 (ex. 24,90), jamais 0 $.`,
        )
      : { ok: true, body: cents };
  };
  const monthly = price(f.priceMonthly, "mensuel");
  if (!monthly.ok) return monthly;
  const yearly = price(f.priceYearly, "annuel");
  if (!yearly.ok) return yearly;
  const body: Record<string, unknown> = {
    name: blank(f.name),
    descriptionFr: f.descriptionFr,
    descriptionEn: f.descriptionEn,
    vcpu,
    ramMb,
    diskGb,
    bandwidthGb,
    region: f.region,
    priceMonthlyCents: monthly.body,
    priceYearlyCents: yearly.body,
    highlighted: !!f.highlighted,
    templateCode: blank(f.templateCode),
    sort,
    isDevSample: !!f.isDevSample,
  };
  if (mode === "create") body.code = blank(f.code);
  return { ok: true, body };
}

export interface PortForm {
  port: string | number;
  proto: string;
  exposure: string;
  labelFr: string;
  labelEn: string;
}
export interface AppForm {
  code: string;
  name: string;
  kind: string;
  version: string;
  upstreamUrl: string;
  license: string;
  licenseUrl: string;
  licenseWarningFr: string;
  licenseWarningEn: string;
  taglineFr: string;
  taglineEn: string;
  descriptionFr: string;
  descriptionEn: string;
  guideFr: string;
  guideEn: string;
  installScript: string;
  ports: PortForm[];
  minRamMb: string | number;
  sort: string | number;
}
const isHttpUrl = (s: string) => /^https?:\/\/[^\s/]+\S*$/i.test(s);
export function buildAppBody(
  f: AppForm,
  mode: "create" | "edit",
): Built<Record<string, unknown>> {
  if (mode === "create" && !CODE.test(blank(f.code)))
    return fail(`Code de l’application invalide : ${CODE_HINT}.`);
  if (!blank(f.name)) return fail("Le nom est obligatoire.");
  if (f.kind !== "installable" && f.kind !== "guide")
    return fail("Type invalide (installable ou guide).");
  if (!blank(f.version)) return fail("La version épinglée est obligatoire.");
  if (!isHttpUrl(blank(f.upstreamUrl)))
    return fail("Adresse amont invalide (http ou https).");
  if (!blank(f.license))
    return fail("La licence (identifiant SPDX) est obligatoire.");
  if (!/^https:\/\/[^\s/]+\S*$/i.test(blank(f.licenseUrl)))
    return fail("Adresse de la licence invalide (https attendu).");
  const minRamMb = intIn(f.minRamMb, 256, 4_000_000);
  if (minRamMb === null) return fail("RAM minimale invalide (256 Mo ou plus).");
  const sort = intIn(f.sort, 0, 10_000);
  if (sort === null) return fail("Tri invalide (0 à 10 000).");
  if (f.ports.length > 20) return fail("Vingt ports au plus.");
  const ports: Record<string, unknown>[] = [];
  for (const [n, p] of f.ports.entries()) {
    const port = intIn(p.port, 1, 65535);
    if (port === null) return fail(`Port ${n + 1} invalide (1 à 65535).`);
    if (p.proto !== "tcp" && p.proto !== "udp")
      return fail(`Port ${n + 1} : protocole invalide.`);
    if (p.exposure !== "tunnel" && p.exposure !== "public")
      return fail(`Port ${n + 1} : exposition invalide.`);
    ports.push({
      port,
      proto: p.proto,
      exposure: p.exposure,
      labelFr: p.labelFr,
      labelEn: p.labelEn,
    });
  }
  let installScript: string | null = null;
  if (f.kind === "installable") {
    if (!f.installScript.trim())
      return fail(
        "Une application installable exige un script d’installation.",
      );
    if (f.installScript.length > 200_000)
      return fail(
        "Script d’installation trop long (200 000 caractères au plus).",
      );
    installScript = f.installScript;
  }
  const body: Record<string, unknown> = {
    name: blank(f.name),
    kind: f.kind,
    taglineFr: f.taglineFr,
    taglineEn: f.taglineEn,
    descriptionFr: f.descriptionFr,
    descriptionEn: f.descriptionEn,
    version: blank(f.version),
    upstreamUrl: blank(f.upstreamUrl),
    license: blank(f.license),
    licenseUrl: blank(f.licenseUrl),
    licenseWarningFr: f.licenseWarningFr,
    licenseWarningEn: f.licenseWarningEn,
    guideFr: f.guideFr,
    guideEn: f.guideEn,
    installScript,
    ports,
    minRamMb,
    sort,
  };
  if (mode === "create") body.code = blank(f.code);
  return { ok: true, body };
}
