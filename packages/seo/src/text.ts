/** Normalisation pour comparer un texte de données structurées au texte visible (casse, espaces, guillemets). */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[   ]/g, " ")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″«»]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** URL comparable : sans fragment, hôte en minuscules, sans barre finale (sauf la racine). */
export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (u.pathname !== "/" && s.endsWith("/")) s = s.slice(0, -1);
    if (u.pathname === "/" && !u.search) s = s.replace(/\/$/, "");
    return s;
  } catch {
    return input;
  }
}

/** Nombres lisibles dans un texte, en notation décimale à point (« 1 234,50 » et « 1,234.50 » -> 1234.5). */
export function numbersIn(text: string): number[] {
  const t = text.normalize("NFKC").replace(/[   ]/g, " ");
  const out: number[] = [];
  for (const m of t.matchAll(/\d[\d  .,]*\d|\d/g)) {
    let s = m[0].replace(/ /g, "");
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    const dec = Math.max(lastDot, lastComma);
    if (dec === -1) s = s.replace(/[.,]/g, "");
    else {
      const frac = s.slice(dec + 1);
      const intPart = s.slice(0, dec).replace(/[.,]/g, "");
      // « 1,234 » (3 chiffres après l'unique séparateur) reste ambigu : on retient les deux lectures
      if (
        frac.length === 3 &&
        (s.match(/[.,]/g) ?? []).length === 1 &&
        s[dec] === ","
      )
        out.push(Number(`${intPart}${frac}`));
      s = `${intPart}.${frac}`;
    }
    const n = Number(s);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}
