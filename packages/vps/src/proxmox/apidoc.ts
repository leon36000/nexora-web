import subset from "./apidoc-subset.json" with { type: "json" };

/**
 * Schéma de l'API REST de Proxmox VE (sous-ensemble utilisé par Nexora), extrait de l'apidoc
 * officiel par `scripts/extract-apidoc.mjs`. Il sert au simulateur (validation des requêtes, comme
 * le fait Proxmox) et aux tests (validation des réponses du simulateur).
 */
export interface ParamDef {
  type?: string;
  optional?: number;
  enum?: string[];
  minimum?: number | string;
  maximum?: number | string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  default?: string | number | boolean;
}
export interface ReturnsDef {
  type?: string;
  enum?: string[];
  optional?: number;
  properties?: Record<string, ReturnsDef>;
  items?: ReturnsDef;
}
export interface MethodDef {
  name: string;
  allowtoken: boolean;
  additionalProperties: boolean;
  parameters: Record<string, ParamDef>;
  returns?: ReturnsDef;
}

const endpoints = subset.endpoints as unknown as Record<
  string,
  Record<string, MethodDef>
>;

export const APIDOC_META = {
  source: subset.source,
  lastModified: subset.lastModified,
  etag: subset.etag,
  sourceSha256: subset.sourceSha256,
} as const;

export interface Matched {
  template: string;
  /** Paramètres de chemin (node, vmid, upid, snapname…). */
  pathParams: Record<string, string>;
  methods: Record<string, MethodDef>;
}

const templates = Object.keys(endpoints).map((template) => ({
  template,
  segments: template.split("/").filter(Boolean),
}));

/** Trouve le chemin du schéma correspondant à `path` (sans préfixe /api2/json). */
export function matchPath(path: string): Matched | null {
  const parts = path.split("/").filter(Boolean);
  for (const t of templates) {
    if (t.segments.length !== parts.length) continue;
    const pathParams: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const seg = t.segments[i] as string;
      const part = parts[i] as string;
      if (seg.startsWith("{") && seg.endsWith("}")) {
        pathParams[seg.slice(1, -1)] = decodeURIComponent(part);
      } else if (seg !== part) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const methods = endpoints[t.template];
      if (methods) return { template: t.template, pathParams, methods };
    }
  }
  return null;
}

export function getMethodDef(
  template: string,
  method: string,
): MethodDef | undefined {
  return endpoints[template]?.[method.toUpperCase()];
}

export function listEndpoints(): { template: string; methods: string[] }[] {
  return Object.entries(endpoints).map(([template, m]) => ({
    template,
    methods: Object.keys(m),
  }));
}

export interface ParamIssue {
  param: string;
  message: string;
}

const NAME_PATTERNED = /^(.*)\[n\]$/;

function paramDefFor(
  def: MethodDef,
  name: string,
): { def: ParamDef; known: true } | { known: false } {
  const exact = def.parameters[name];
  if (exact) return { def: exact, known: true };
  // Propriétés à indice (ipconfig[n], net[n], scsi[n]…) : « ipconfig0 », « net1 »…
  for (const [key, value] of Object.entries(def.parameters)) {
    const m = NAME_PATTERNED.exec(key);
    if (m && new RegExp(`^${escapeRegExp(m[1] as string)}\\d+$`).test(name))
      return { def: value, known: true };
  }
  return { known: false };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Coerced = string | number | boolean;

function coerce(
  raw: unknown,
  type: string | undefined,
): { ok: true; value: Coerced } | { ok: false; message: string } {
  if (type === "integer" || type === "number") {
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw)
          ? Number(raw)
          : Number.NaN;
    if (Number.isNaN(n) || (type === "integer" && !Number.isInteger(n)))
      return { ok: false, message: `value is not a valid ${type}` };
    return { ok: true, value: n };
  }
  if (type === "boolean") {
    if (raw === true || raw === 1 || raw === "1" || raw === "true")
      return { ok: true, value: true };
    if (raw === false || raw === 0 || raw === "0" || raw === "false")
      return { ok: true, value: false };
    return { ok: false, message: "type check ('boolean') failed" };
  }
  if (typeof raw === "string") return { ok: true, value: raw };
  if (typeof raw === "number" || typeof raw === "boolean")
    return { ok: true, value: String(raw) };
  return { ok: false, message: "type check ('string') failed" };
}

export interface ValidationResult {
  ok: boolean;
  issues: ParamIssue[];
  /** Valeurs converties (entiers, booléens). */
  values: Record<string, Coerced>;
}

/**
 * Valide des paramètres selon le schéma : propriétés inconnues refusées, propriétés obligatoires,
 * types, bornes, longueurs, motif, énumérations. Les paramètres de chemin (`node`, `vmid`…) sont
 * validés comme les autres.
 */
export function validateParams(
  def: MethodDef,
  params: Record<string, unknown>,
): ValidationResult {
  const issues: ParamIssue[] = [];
  const values: Record<string, Coerced> = {};
  for (const [name, raw] of Object.entries(params)) {
    const found = paramDefFor(def, name);
    if (!found.known) {
      if (!def.additionalProperties)
        issues.push({
          param: name,
          message:
            "property is not defined in schema and the schema does not allow additional properties",
        });
      continue;
    }
    const d = found.def;
    const c = coerce(raw, d.type);
    if (!c.ok) {
      issues.push({ param: name, message: c.message });
      continue;
    }
    const v = c.value;
    if (typeof v === "number") {
      const min = d.minimum === undefined ? undefined : Number(d.minimum);
      const max = d.maximum === undefined ? undefined : Number(d.maximum);
      if (min !== undefined && v < min)
        issues.push({
          param: name,
          message: `value must have a minimum value of ${min}`,
        });
      if (max !== undefined && v > max)
        issues.push({
          param: name,
          message: `value must have a maximum value of ${max}`,
        });
    }
    if (typeof v === "string") {
      if (d.minLength !== undefined && v.length < d.minLength)
        issues.push({
          param: name,
          message: `value must be at least ${d.minLength} characters long`,
        });
      if (d.maxLength !== undefined && v.length > d.maxLength)
        issues.push({
          param: name,
          message: `value may only be ${d.maxLength} characters long`,
        });
      if (d.pattern && !new RegExp(`^(?:${d.pattern})$`).test(v))
        issues.push({
          param: name,
          message: `value does not match the regex pattern`,
        });
      if (d.enum && !d.enum.includes(v))
        issues.push({
          param: name,
          message: `value '${v}' does not have a value in the enumeration '${d.enum.join(", ")}'`,
        });
    }
    values[name] = v;
  }
  for (const [name, d] of Object.entries(def.parameters)) {
    if (NAME_PATTERNED.test(name)) continue;
    if (d.optional !== 1 && !(name in params))
      issues.push({
        param: name,
        message: "property is missing and it is not optional",
      });
  }
  return { ok: issues.length === 0, issues, values };
}

/** Valide une réponse du simulateur contre le schéma `returns` (type, énumération, propriétés). */
export function validateReturns(
  def: ReturnsDef | undefined,
  value: unknown,
  path = "data",
): string[] {
  if (!def) return [];
  const errors: string[] = [];
  if (value === null || value === undefined) {
    if (def.type === "null" || def.optional === 1) return errors;
    return [`${path} : valeur absente`];
  }
  switch (def.type) {
    case "string":
      if (typeof value !== "string") errors.push(`${path} : chaîne attendue`);
      else if (def.enum && !def.enum.includes(value))
        errors.push(`${path} : « ${value} » hors énumération`);
      break;
    // Proxmox renvoie parfois un nombre sous forme de chaîne (ex. /cluster/nextid) : toléré.
    case "integer":
      if (
        !Number.isInteger(value) &&
        !(typeof value === "string" && /^-?\d+$/.test(value))
      )
        errors.push(`${path} : entier attendu`);
      break;
    case "number":
      if (
        typeof value !== "number" &&
        !(typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value))
      )
        errors.push(`${path} : nombre attendu`);
      break;
    case "boolean":
      if (typeof value !== "boolean" && value !== 0 && value !== 1)
        errors.push(`${path} : booléen attendu`);
      break;
    case "array":
      if (!Array.isArray(value)) errors.push(`${path} : tableau attendu`);
      else
        value.forEach((item, i) => {
          errors.push(...validateReturns(def.items, item, `${path}[${i}]`));
        });
      break;
    case "object":
      if (typeof value !== "object" || Array.isArray(value))
        errors.push(`${path} : objet attendu`);
      else if (def.properties) {
        const obj = value as Record<string, unknown>;
        for (const [k, sub] of Object.entries(def.properties)) {
          if (k in obj || sub.optional !== 1)
            errors.push(...validateReturns(sub, obj[k], `${path}.${k}`));
        }
      }
      break;
    default:
      break;
  }
  return errors;
}
