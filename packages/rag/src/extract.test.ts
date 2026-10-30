import { describe, expect, it } from "vitest";
import { ExtractError, extractText } from "./extract.ts";

const enc = (s: string) => new TextEncoder().encode(s);

/** PDF minimal valide : une page par texte, police Helvetica standard. */
function makePdf(pages: string[]): Uint8Array {
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const fontRef = 3 + pages.length * 2;
  pages.forEach((text, i) => {
    const content = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontRef} 0 R >> >> >>`,
    );
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets)
    out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return enc(out);
}

describe("extractText : texte brut et Markdown", () => {
  it("lit un .txt en UTF-8 et retire le BOM", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("Été à Montréal")]);
    const r = await extractText({ filename: "note.txt", bytes });
    expect(r.kind).toBe("txt");
    expect(r.text).toBe("Été à Montréal");
  });

  it("retombe sur Windows-1252 quand l'UTF-8 est invalide", async () => {
    const r = await extractText({
      filename: "vieux.txt",
      bytes: new Uint8Array([0x63, 0x61, 0x66, 0xe9]),
    });
    expect(r.text).toBe("café");
  });

  it("refuse un fichier binaire déguisé en texte", async () => {
    await expect(
      extractText({
        filename: "x.txt",
        bytes: new Uint8Array([0x41, 0x00, 0x42, 0x00]),
      }),
    ).rejects.toMatchObject({ code: "unsupported_type" });
  });

  it("garde le Markdown tel quel et prend le premier titre comme titre", async () => {
    const r = await extractText({
      filename: "guide.md",
      bytes: enc("# Mon guide\n\nTexte."),
    });
    expect(r.kind).toBe("md");
    expect(r.title).toBe("Mon guide");
    expect(r.text).toBe("# Mon guide\n\nTexte.");
  });

  it("se fie au type de contenu quand le nom n'a pas d'extension connue", async () => {
    const r = await extractText({
      filename: "LISEZMOI",
      contentType: "text/markdown; charset=utf-8",
      bytes: enc("# T\n\nx"),
    });
    expect(r.kind).toBe("md");
  });
});

describe("extractText : HTML", () => {
  const html = `<!doctype html><html><head><title>Ma page</title><style>body{color:red}</style><script>alert("secret")</script></head>
  <body><nav>Menu</nav><h1>Titre</h1><p>Un <b>paragraphe</b> avec &eacute;l&eacute;ments &amp; entit&eacute;s.</p>
  <ul><li>un</li><li>deux</li></ul><h2>Tableau</h2><table><tr><th>Nom</th><th>Prix</th></tr><tr><td>A</td><td>5</td></tr></table>
  <iframe src="https://x.example">cadre</iframe><noscript>activez JS</noscript></body></html>`;

  it("convertit en texte structuré : titres, listes, tableaux, entités", async () => {
    const r = await extractText({ filename: "page.html", bytes: enc(html) });
    expect(r.kind).toBe("html");
    expect(r.title).toBe("Ma page");
    expect(r.text).toContain("# Titre");
    expect(r.text).toContain("## Tableau");
    expect(r.text).toContain("Un paragraphe avec éléments & entités.");
    expect(r.text).toContain("- un\n- deux");
    expect(r.text).toContain("Nom | Prix");
    expect(r.text).toContain("A | 5");
  });

  it("n'extrait ni script, ni style, ni cadre, ni noscript", async () => {
    const r = await extractText({ filename: "page.html", bytes: enc(html) });
    for (const banned of [
      "alert",
      "secret",
      "color:red",
      "cadre",
      "activez JS",
    ])
      expect(r.text).not.toContain(banned);
  });
});

describe("extractText : PDF", () => {
  it("extrait le texte page par page et donne le début de chaque page", async () => {
    const r = await extractText({
      filename: "doc.pdf",
      bytes: makePdf(["Bonjour page un", "Deuxieme page ici"]),
    });
    expect(r.kind).toBe("pdf");
    expect(r.text).toContain("Bonjour page un");
    expect(r.text).toContain("Deuxieme page ici");
    expect(r.pageStarts).toHaveLength(2);
    expect(r.text.slice(r.pageStarts?.[1] ?? 0)).toMatch(/^Deuxieme/);
  });

  it("reconnaît un PDF à son en-tête même avec un mauvais nom", async () => {
    const r = await extractText({
      filename: "doc.bin",
      bytes: makePdf(["Salut"]),
    });
    expect(r.kind).toBe("pdf");
  });

  it("refuse un PDF trop long en pages", async () => {
    await expect(
      extractText(
        { filename: "d.pdf", bytes: makePdf(["a", "b"]) },
        { maxPages: 1 },
      ),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("refuse un PDF abîmé", async () => {
    await expect(
      extractText({
        filename: "d.pdf",
        bytes: enc("%PDF-1.4\nce n'est pas un vrai pdf"),
      }),
    ).rejects.toBeInstanceOf(ExtractError);
  });
});

describe("extractText : limites et refus", () => {
  it("refuse un fichier plus gros que la limite avant tout traitement", async () => {
    await expect(
      extractText(
        { filename: "a.txt", bytes: new Uint8Array(1001).fill(97) },
        { maxBytes: 1000 },
      ),
    ).rejects.toMatchObject({ code: "too_large" });
  });
  it("refuse un texte plus long que la limite de caractères", async () => {
    await expect(
      extractText(
        { filename: "a.txt", bytes: enc("a".repeat(500)) },
        { maxChars: 100 },
      ),
    ).rejects.toMatchObject({ code: "too_large" });
  });
  it("refuse un document vide", async () => {
    await expect(
      extractText({ filename: "a.txt", bytes: enc("  \n ") }),
    ).rejects.toMatchObject({ code: "empty" });
  });
  it("refuse un type non pris en charge, en nommant ceux qui le sont", async () => {
    await expect(
      extractText({
        filename: "photo.png",
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      }),
    ).rejects.toMatchObject({ code: "unsupported_type" });
    await expect(
      extractText({ filename: "doc.docx", bytes: enc("PK") }),
    ).rejects.toThrow(/\.txt.*\.md.*\.html.*\.pdf/s);
  });
});
