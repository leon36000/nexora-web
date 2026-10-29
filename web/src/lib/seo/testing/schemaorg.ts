import subset from "./schemaorg-subset.json";

/**
 * Validation des données structurées contre le VOCABULAIRE schema.org (tests seulement ; non importé par l'application).
 *
 * `schemaorg-subset.json` est un extrait du vocabulaire officiel (https://schema.org/version/latest/schemaorg-current-https.jsonld,
 * lu le 29 octobre 2026) : les types utilisés par le site, leurs parents, leurs propriétés propres et les types de valeurs
 * permis. Une propriété inventée ou mal écrite (`inlanguage`, `logoUrl`), un type inconnu ou une valeur d'un type que la
 * propriété n'accepte pas sont signalés. Ne vérifie PAS les exigences d'un moteur précis (Google) : seulement le vocabulaire.
 */
type TypeEntry = { parents: string[]; own: string[] };
const TYPES = subset.types as Record<string, TypeEntry>;
const RANGES = subset.ranges as Record<string, string[]>;

const PRIMITIVES = new Set([
  "Text",
  "URL",
  "Number",
  "Integer",
  "Float",
  "Boolean",
  "Date",
  "DateTime",
  "Time",
  "PronounceableText",
  "CssSelectorType",
  "XPathType",
]);

/** Le type et tous ses ancêtres. */
function lineage(type: string, seen = new Set<string>()): Set<string> {
  if (seen.has(type)) return seen;
  seen.add(type);
  for (const parent of TYPES[type]?.parents ?? []) lineage(parent, seen);
  return seen;
}

function propertiesOf(type: string): Set<string> {
  const out = new Set<string>();
  for (const t of lineage(type))
    for (const p of TYPES[t]?.own ?? []) out.add(p);
  return out;
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function schemaOrgTypeKnown(type: string): boolean {
  return type in TYPES;
}

/** Erreurs de vocabulaire d'un nœud JSON-LD (et de ses nœuds imbriqués) ; liste vide = valide. */
export function validateSchemaOrg(node: unknown, path = "$"): string[] {
  if (!isObj(node)) return [`${path} : un objet est attendu`];
  const errors: string[] = [];
  const root = path === "$";
  if (root && node["@context"] !== "https://schema.org")
    errors.push(`${path} : @context doit valoir https://schema.org`);
  const rawType = node["@type"];
  const types = (Array.isArray(rawType) ? rawType : [rawType]).filter(
    (t): t is string => typeof t === "string",
  );
  const keys = Object.keys(node).filter((k) => !k.startsWith("@"));
  // un nœud réduit à @id est une référence
  if (types.length === 0) {
    if (keys.length > 0 || typeof node["@id"] !== "string")
      errors.push(`${path} : @type absent`);
    return errors;
  }
  for (const t of types)
    if (!schemaOrgTypeKnown(t))
      errors.push(`${path} : type « ${t} » absent du vocabulaire connu`);
  const known = types.filter(schemaOrgTypeKnown);
  if (known.length === 0) return errors;
  const allowed = new Set<string>();
  for (const t of known) for (const p of propertiesOf(t)) allowed.add(p);
  for (const key of keys) {
    if (!allowed.has(key)) {
      errors.push(
        `${path}.${key} : propriété inconnue pour ${known.join("/")}`,
      );
      continue;
    }
    const ranges = RANGES[key] ?? [];
    asArray(node[key]).forEach((value, i) => {
      if (!isObj(value)) return;
      const sub = `${path}.${key}${Array.isArray(node[key]) ? `[${i}]` : ""}`;
      const valueTypes = asArray(value["@type"]).filter(
        (t): t is string => typeof t === "string",
      );
      if (valueTypes.length > 0) {
        const ok = valueTypes.some((vt) =>
          [...lineage(vt)].some((a) => ranges.includes(a)),
        );
        // une valeur typée dont le type est inconnu du extrait est signalée par la récursion
        if (!ok && valueTypes.every(schemaOrgTypeKnown))
          errors.push(
            `${sub} : ${valueTypes.join("/")} n'est pas une valeur permise pour « ${key} » (permis : ${ranges.filter((r) => !PRIMITIVES.has(r)).join(", ") || "texte"})`,
          );
      }
      errors.push(...validateSchemaOrg(value, sub));
    });
  }
  return errors;
}
