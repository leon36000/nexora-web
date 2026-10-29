import { normalizeText, numbersIn } from "./text.ts";
import type { SeoFinding } from "./types.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Types connus pour l'émission (`@type` peut être un tableau). */
export const KNOWN_JSONLD_TYPES = [
  "Organization",
  "WebSite",
  "WebPage",
  "AboutPage",
  "BreadcrumbList",
  "Service",
  "Product",
  "SoftwareApplication",
  "Article",
  "FAQPage",
] as const;

export const typesOf = (n: Obj): string[] => {
  const t = n["@type"];
  return Array.isArray(t)
    ? t.filter((x): x is string => typeof x === "string")
    : typeof t === "string"
      ? [t]
      : [];
};

/** Aplatit les blocs : tableaux de premier niveau et `@graph`. Ne descend pas dans les propriétés. */
export function topLevelNodes(jsonLd: unknown[]): Obj[] {
  const out: Obj[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (!isObj(v)) return;
    if (Array.isArray(v["@graph"])) (v["@graph"] as unknown[]).forEach(visit);
    else out.push(v);
  };
  jsonLd.forEach(visit);
  return out;
}

const asArray = (v: unknown): unknown[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

/** Prix annoncés (price, lowPrice, highPrice) dans un nœud, à n'importe quelle profondeur. */
function collectPrices(v: unknown, out: { label: string; value: number }[]) {
  if (Array.isArray(v)) {
    for (const x of v) collectPrices(x, out);
    return;
  }
  if (!isObj(v)) return;
  for (const key of ["price", "lowPrice", "highPrice"] as const) {
    const raw = v[key];
    if (raw !== undefined && raw !== null && raw !== "")
      out.push({ label: key, value: Number(raw) });
  }
  for (const [k, child] of Object.entries(v))
    if (k !== "@context") collectPrices(child, out);
}

export interface ConformityOptions {
  /** Adresse de la page, pour les constats. */
  url?: string;
}

/**
 * Les données structurées doivent correspondre au contenu VISIBLE de la page (règle de Google) :
 * noms, descriptions, questions et réponses doivent apparaître dans le texte ; tout prix annoncé doit être
 * affiché ; une FAQPage ne peut pas contenir une question qui n'est pas à l'écran.
 * Exception documentée : BreadcrumbList (fil d'Ariane de structure, vérifié seulement pour sa forme).
 */
export function checkJsonLdConformity(
  jsonLd: unknown[],
  visibleText: string,
  options: ConformityOptions = {},
): SeoFinding[] {
  const url = options.url ?? "";
  const visible = normalizeText(visibleText);
  const numbers = numbersIn(visibleText);
  const findings: SeoFinding[] = [];
  const shown = (text: string) => visible.includes(normalizeText(text));
  const miss = (rule: string, what: string, text: string, type: string) =>
    findings.push({
      rule,
      severity: "error",
      url,
      message: `Données structurées ${type} : ${what} absent du contenu visible (« ${text.slice(0, 80)} »).`,
      detail: { type, field: what },
    });

  const nodes = topLevelNodes(jsonLd);
  if (jsonLd.length > 0 && nodes.length === 0)
    findings.push({
      rule: "jsonld.empty",
      severity: "error",
      url,
      message: "Données structurées sans objet exploitable.",
    });

  for (const node of nodes) {
    const types = typesOf(node);
    const type = types[0] ?? "(sans type)";
    if (types.length === 0) {
      findings.push({
        rule: "jsonld.no-type",
        severity: "error",
        url,
        message: "Un bloc JSON-LD n'a pas de @type.",
      });
      continue;
    }

    if (types.includes("BreadcrumbList")) {
      const items = asArray(node.itemListElement).filter(isObj);
      const ok =
        items.length > 0 &&
        items.every(
          (it, i) =>
            it.position === i + 1 &&
            typeof it.name === "string" &&
            it.name.length > 0 &&
            typeof it.item === "string" &&
            /^https?:\/\//.test(it.item),
        );
      if (!ok)
        findings.push({
          rule: "jsonld.breadcrumb-shape",
          severity: "error",
          url,
          message:
            "BreadcrumbList : positions consécutives à partir de 1, nom et URL absolue requis.",
        });
      continue;
    }

    if (types.includes("FAQPage")) {
      const questions = asArray(node.mainEntity).filter(isObj);
      if (questions.length === 0)
        findings.push({
          rule: "jsonld.faq-empty",
          severity: "error",
          url,
          message: "FAQPage sans question.",
        });
      for (const q of questions) {
        const name = typeof q.name === "string" ? q.name : "";
        if (!name || !shown(name))
          miss("jsonld.faq-question-hidden", "question", name, "FAQPage");
        const answer = isObj(q.acceptedAnswer) ? q.acceptedAnswer : null;
        const text =
          answer && typeof answer.text === "string" ? answer.text : "";
        if (!text || !shown(text))
          miss("jsonld.faq-answer-hidden", "réponse", text, "FAQPage");
      }
      continue;
    }

    for (const field of ["name", "headline", "description"] as const) {
      const v = node[field];
      if (typeof v === "string" && v.trim() && !shown(v))
        miss("jsonld.not-visible", field, v, type);
    }

    const prices: { label: string; value: number }[] = [];
    collectPrices(node.offers, prices);
    const seen = new Set<number>();
    for (const p of prices) {
      // un même prix répété (Offer.price et priceSpecification.price) n'est signalé qu'une fois
      if (seen.has(p.value)) continue;
      seen.add(p.value);
      if (Number.isNaN(p.value))
        findings.push({
          rule: "jsonld.price-invalid",
          severity: "error",
          url,
          message: `${type} : prix illisible dans « ${p.label} ».`,
        });
      else if (!numbers.some((n) => Math.abs(n - p.value) < 1e-9))
        findings.push({
          rule: "jsonld.price-not-visible",
          severity: "error",
          url,
          message: `${type} : le prix ${p.value} annoncé n'est pas affiché sur la page.`,
          detail: { type, price: p.value },
        });
    }
    if (node.offers !== undefined && prices.length === 0)
      findings.push({
        rule: "jsonld.offer-without-price",
        severity: "error",
        url,
        message: `${type} : une offre sans prix ne doit pas être émise.`,
      });
  }
  return findings;
}
