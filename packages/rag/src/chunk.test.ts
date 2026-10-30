import { describe, expect, it } from "vitest";
import { chunkText, embeddingInput } from "./chunk.ts";

const para = (n: number, c = "a") => `${c.repeat(n)}.`;

describe("chunkText", () => {
  it("ne rend rien pour un texte vide ou fait d'espaces", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n \t ")).toEqual([]);
  });

  it("garde un texte court en un seul extrait dont le texte est une tranche exacte de la source", () => {
    const source = "Bonjour le monde.\n\nDeuxième paragraphe.";
    const chunks = chunkText(source);
    expect(chunks).toHaveLength(1);
    const [c] = chunks;
    expect(c?.index).toBe(0);
    expect(c?.text).toBe(source);
    expect(source.slice(c?.start, c?.end)).toBe(c?.text);
  });

  it("respecte la taille maximale et le texte de chaque extrait est une tranche de la source", () => {
    const source = Array.from({ length: 40 }, (_, i) =>
      para(300, "abcdefg"[i % 7] ?? "a"),
    ).join("\n\n");
    const chunks = chunkText(source, { maxChars: 1000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(1000);
      expect(source.slice(c.start, c.end)).toBe(c.text);
    }
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("coupe de préférence entre les paragraphes, pas au milieu d'une phrase", () => {
    const sentences = Array.from(
      { length: 12 },
      (_, i) => `Phrase numéro ${i} qui parle d'un sujet précis.`,
    );
    const source = sentences.join(" ");
    const chunks = chunkText(source, { maxChars: 200, overlapChars: 0 });
    for (const c of chunks) expect(c.text.endsWith(".")).toBe(true);
    expect(chunks.length).toBeGreaterThan(2);
  });

  it("chevauche les extraits d'une même section d'au plus la valeur demandée", () => {
    const source = Array.from(
      { length: 30 },
      (_, i) => `Phrase ${i} du texte de recherche.`,
    ).join(" ");
    const chunks = chunkText(source, { maxChars: 300, overlapChars: 80 });
    expect(chunks.length).toBeGreaterThan(2);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const cur = chunks[i];
      if (!prev || !cur) throw new Error("extrait manquant");
      const overlap = prev.end - cur.start;
      expect(overlap).toBeGreaterThan(0);
      expect(overlap).toBeLessThanOrEqual(80);
    }
  });

  it("n'ajoute aucun chevauchement quand overlapChars vaut 0", () => {
    const source = Array.from(
      { length: 30 },
      (_, i) => `Phrase ${i} du texte de recherche.`,
    ).join(" ");
    const chunks = chunkText(source, { maxChars: 300, overlapChars: 0 });
    for (let i = 1; i < chunks.length; i++) {
      expect((chunks[i - 1]?.end ?? 0) <= (chunks[i]?.start ?? 0)).toBe(true);
    }
  });

  it("suit les titres Markdown et les rattache à leurs extraits", () => {
    const body = (s: string) =>
      Array.from(
        { length: 8 },
        (_, i) => `${s} ligne ${i} avec assez de mots pour compter.`,
      ).join(" ");
    const source = `# Guide\n\nIntro courte mais assez longue pour dépasser le minimum de taille.\n\n## Installation\n\n${body("install")}\n\n## Usage\n\n${body("usage")}`;
    const chunks = chunkText(source, {
      maxChars: 260,
      overlapChars: 0,
      minChars: 40,
    });
    const install = chunks.filter((c) => c.text.includes("install ligne"));
    const usage = chunks.filter((c) => c.text.includes("usage ligne"));
    expect(install.length).toBeGreaterThan(0);
    expect(usage.length).toBeGreaterThan(0);
    for (const c of install) expect(c.heading).toBe("Guide > Installation");
    for (const c of usage) expect(c.heading).toBe("Guide > Usage");
    // Un extrait ne mélange pas deux sections quand chacune dépasse la taille minimale.
    for (const c of chunks)
      expect(
        c.text.includes("install ligne") && c.text.includes("usage ligne"),
      ).toBe(false);
  });

  it("fusionne une section minuscule avec la suivante plutôt que d'émettre un extrait vide de sens", () => {
    const source = `## A\n\nCourt.\n\n## B\n\n${"Un long paragraphe de contenu utile. ".repeat(10)}`;
    const chunks = chunkText(source, {
      maxChars: 1000,
      overlapChars: 0,
      minChars: 100,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toBe("A");
  });

  it("ne confond pas un # dans un bloc de code avec un titre", () => {
    const source =
      "# Titre\n\n```bash\n# commentaire du shell\nls -la\n```\n\nSuite.";
    const chunks = chunkText(source);
    expect(chunks[0]?.heading).toBe("Titre");
    expect(chunks.every((c) => c.heading === "Titre")).toBe(true);
  });

  it("découpe un très long paragraphe par phrases puis, sans espaces, par tranches dures sans casser une paire de substitution", () => {
    const longSentences = Array.from(
      { length: 50 },
      (_, i) => `Phrase ${i}.`,
    ).join(" ");
    const a = chunkText(longSentences, { maxChars: 100, overlapChars: 0 });
    for (const c of a) expect(c.text.length).toBeLessThanOrEqual(100);

    const noSpaces = "😀".repeat(300);
    const b = chunkText(noSpaces, { maxChars: 101, overlapChars: 0 });
    expect(b.length).toBeGreaterThan(2);
    for (const c of b) {
      expect(c.text.length).toBeLessThanOrEqual(101);
      expect(c.text).toBe([...c.text].join(""));
      expect(c.text.includes("�")).toBe(false);
      // Pas de moitié de paire de substitution en début ni en fin.
      expect(
        c.text.charCodeAt(0) >= 0xdc00 && c.text.charCodeAt(0) <= 0xdfff,
      ).toBe(false);
      const last = c.text.charCodeAt(c.text.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    }
  });

  it("couvre tout le texte utile : aucun mot de la source n'est perdu", () => {
    const words = Array.from({ length: 400 }, (_, i) => `mot${i}`);
    const source = words.join(" ");
    const chunks = chunkText(source, { maxChars: 500, overlapChars: 60 });
    const seen = new Set(chunks.flatMap((c) => c.text.split(/\s+/)));
    for (const w of words) expect(seen.has(w)).toBe(true);
  });

  it("est déterministe et normalise les fins de ligne", () => {
    const source = "Ligne un.\r\n\r\nLigne deux.\r\n";
    const a = chunkText(source);
    const b = chunkText(source);
    expect(a).toEqual(b);
    expect(a[0]?.text.includes("\r")).toBe(false);
  });

  it("refuse des options incohérentes", () => {
    expect(() => chunkText("x", { maxChars: 10 })).toThrow(/maxChars/);
    expect(() => chunkText("x", { maxChars: 1000, overlapChars: 600 })).toThrow(
      /overlapChars/,
    );
  });
});

describe("embeddingInput", () => {
  it("préfixe le titre de section quand l'extrait ne le contient pas", () => {
    expect(
      embeddingInput({
        index: 1,
        text: "du contenu",
        heading: "Guide > Usage",
        start: 0,
        end: 10,
      }),
    ).toBe("Guide > Usage\n\ndu contenu");
  });
  it("ne répète pas un titre déjà présent en tête de l'extrait", () => {
    expect(
      embeddingInput({
        index: 0,
        text: "## Usage\n\ndu contenu",
        heading: "Usage",
        start: 0,
        end: 20,
      }),
    ).toBe("## Usage\n\ndu contenu");
  });
  it("laisse l'extrait tel quel sans titre", () => {
    expect(
      embeddingInput({ index: 0, text: "x", heading: null, start: 0, end: 1 }),
    ).toBe("x");
  });
});
