/**
 * Contrôle DÉTERMINISTE de vérité du contenu (AGENTS.md : aucun faux chiffre, prix, certification, client,
 * témoignage ni « conforme à la Loi 25 »). Il ne bloque pas : il SIGNALE au relecteur, dans le résumé de
 * l'approbation, les passages qui exigent une preuve. Aucun modèle n'intervient ici.
 */

const RULES: { id: string; re: RegExp; label: string }[] = [
  {
    id: "montant",
    re: /\d[\d\s.,]*\s?(?:\$|€|\b(?:CAD|USD|dollars?)\b)|(?:\$|€)\s?\d/i,
    label: "montant ou prix",
  },
  { id: "pourcentage", re: /\d\s?%/, label: "pourcentage ou statistique" },
  {
    id: "loi25",
    re: /(?:conform|certifi|compatible|respect)\w*[^.]{0,40}loi\s*25|loi\s*25[^.]{0,40}(?:conform|certifi|garanti)/i,
    label: "affirmation de conformité à la Loi 25",
  },
  {
    id: "certification",
    re: /\bcertifi\w+|\bISO\s?\d{3,5}\b|\bSOC\s?[12]\b|\bHIPAA\b|\bRGPD certifi/i,
    label: "certification",
  },
  {
    id: "garantie",
    re: /\bgaranti\w*|\b100\s?%\b|\bsans (?:aucun )?risque\b|\bnuméro un\b|\bleader\b/i,
    label: "garantie ou superlatif",
  },
  {
    id: "client",
    re: /\bnos clients (?:comme|tels que|incluent)|\bils nous font confiance|\bdéjà utilisé par\b|\btémoignage/i,
    label: "référence client ou témoignage",
  },
  {
    id: "souverainete",
    re: /\b100\s?%\s?(?:québécois|canadien|souverain)|\bhébergé? au québec\b/i,
    label: "affirmation d'hébergement ou de souveraineté",
  },
];

export interface LintFlag {
  rule: string;
  label: string;
  excerpt: string;
}

/** Parcourt récursivement toutes les chaînes d'une valeur et renvoie les signalements (un par règle et par chaîne). */
export function lintStrings(value: unknown, limit = 12): LintFlag[] {
  const flags: LintFlag[] = [];
  const visit = (v: unknown) => {
    if (flags.length >= limit) return;
    if (typeof v === "string") {
      for (const r of RULES) {
        const m = r.re.exec(v);
        if (m && flags.length < limit) {
          const at = Math.max(0, m.index - 25);
          flags.push({
            rule: r.id,
            label: r.label,
            excerpt: v.slice(at, at + 80).replace(/\s+/g, " "),
          });
        }
      }
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(value);
  return flags;
}

export function formatFlags(flags: LintFlag[]): string {
  if (flags.length === 0) return "";
  const lines = flags.map((f) => `- ${f.label} : « …${f.excerpt}… »`);
  return `\n\nÀ VÉRIFIER avant d'approuver (preuve requise, aucun chiffre ni certification n'a été vérifié par l'agent) :\n${lines.join("\n")}`;
}
