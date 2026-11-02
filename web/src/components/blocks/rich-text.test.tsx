import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { hasWideContent, parseRichText } from "@/lib/rich-text";
import type { SectionBlock } from "@/server/cms/model";
import { RichText } from "./rich-text";
import { SectionBlockView } from "./section-block";

const html = (source: string) =>
  renderToStaticMarkup(<RichText nodes={parseRichText(source)} />);

const TABLE =
  "<table><caption>Critères de choix</caption><thead><tr><th>Critère</th><th>Passerelle</th></tr></thead><tbody><tr><th>Clé</th><td>Une seule</td></tr></tbody></table>";

describe("RichText : tableaux et code", () => {
  it("rend un tableau accessible : région nommée par sa légende, défilable au clavier, en-têtes avec portée", () => {
    const out = html(TABLE);
    expect(out).toContain('aria-label="Critères de choix"');
    expect(out).toContain('tabindex="0"');
    expect(out).toContain("<caption");
    // en-tête de colonne dans l'en-tête, en-tête de ligne devant une donnée
    expect(out).toMatch(/<th scope="col"[^>]*>Critère<\/th>/);
    expect(out).toMatch(/<th scope="row"[^>]*>Clé<\/th>/);
    expect(out).toMatch(/<td[^>]*>Une seule<\/td>/);
  });

  it("rend un bloc de code défilable au clavier en conservant les retours à la ligne", () => {
    const out = html("<pre><code>a = 1\nb = 2</code></pre>");
    expect(out).toContain('tabindex="0"');
    expect(out).toContain("<code");
    expect(out).toContain("a = 1\nb = 2");
  });

  it("n'insère jamais de HTML brut : un script dans une cellule est écarté", () => {
    const out = html(
      "<table><tr><td>ok<script>alert(1)</script></td></tr></table>",
    );
    expect(out).not.toContain("<script");
    expect(out).toContain("ok");
  });
});

describe("hasWideContent", () => {
  it("reconnaît un tableau ou un bloc de code, même imbriqué", () => {
    expect(hasWideContent(parseRichText(TABLE))).toBe(true);
    expect(hasWideContent(parseRichText("<pre>x</pre>"))).toBe(true);
    expect(
      hasWideContent(parseRichText("<blockquote><pre>x</pre></blockquote>")),
    ).toBe(true);
    expect(hasWideContent(parseRichText("<p>texte <code>x</code></p>"))).toBe(
      false,
    );
    expect(hasWideContent([])).toBe(false);
  });
});

describe("SectionBlockView : largeur du texte", () => {
  const section = (body: string): SectionBlock => ({
    type: "section",
    key: "s1",
    anchorId: null,
    tone: "clair",
    visual: "aucun",
    title: "Les critères",
    body: parseRichText(body),
    media: null,
    captions: null,
    poster: null,
    mediaPosition: "none",
    items: [],
  });
  it("élargit la colonne de texte quand le corps contient un tableau", () => {
    const wide = renderToStaticMarkup(
      <SectionBlockView block={section(TABLE)} lang="fr" />,
    );
    const narrow = renderToStaticMarkup(
      <SectionBlockView block={section("<p>Un texte.</p>")} lang="fr" />,
    );
    expect(wide).toContain("max-w-4xl");
    expect(narrow).not.toContain("max-w-4xl");
    expect(narrow).toContain("max-w-2xl");
  });
});
