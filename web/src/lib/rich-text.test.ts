import { describe, expect, it } from "vitest";
import { parseRichText, type RichNode, richTextToPlain } from "./rich-text";

/** Sérialisation compacte pour comparer des arbres : <tag>…</tag>, texte brut, liens avec href. */
function show(nodes: RichNode[]): string {
  return nodes
    .map((n) =>
      n.type === "text"
        ? n.value
        : `<${n.tag}${n.href ? ` href=${n.href}` : ""}>${show(n.children)}</${n.tag}>`,
    )
    .join("");
}

describe("parseRichText : balises autorisées", () => {
  it("conserve le gras, l'italique, les paragraphes, les listes et les titres", () => {
    const html =
      "<h2>Titre</h2><p>Un <strong>mot</strong> et <em>un autre</em>.</p><ul><li>a</li><li>b</li></ul><ol><li>1</li></ol><h3>Sous</h3><blockquote>Citation</blockquote>";
    expect(show(parseRichText(html))).toBe(
      "<h2>Titre</h2><p>Un <strong>mot</strong> et <em>un autre</em>.</p><ul><li>a</li><li>b</li></ul><ol><li>1</li></ol><h3>Sous</h3><blockquote>Citation</blockquote>",
    );
  });

  it("normalise b et i en strong et em", () => {
    expect(show(parseRichText("<p><b>x</b><i>y</i></p>"))).toBe(
      "<p><strong>x</strong><em>y</em></p>",
    );
  });

  it("conserve un lien valide, sans aucun autre attribut", () => {
    const out = parseRichText(
      '<p><a href="/solutions/" target="_blank" onclick="x()" style="color:red">Voir</a></p>',
    );
    expect(show(out)).toBe("<p><a href=/solutions>Voir</a></p>");
  });

  it("conserve la coupure de ligne", () => {
    expect(show(parseRichText("<p>a<br>b<br/>c</p>"))).toBe(
      "<p>a<br></br>b<br></br>c</p>",
    );
  });
});

describe("parseRichText : tout le reste est neutralisé", () => {
  it("supprime script, style, iframe et leur contenu", () => {
    const html =
      '<p>avant</p><script>alert(1)</script><style>p{display:none}</style><iframe src="https://evil.example">x</iframe><p>après</p>';
    const out = show(parseRichText(html));
    expect(out).toBe("<p>avant</p><p>après</p>");
    expect(out).not.toContain("alert");
  });

  it("retire les gestionnaires d'évènements et les attributs inconnus", () => {
    const out = show(
      parseRichText('<p onmouseover="alert(1)" class="x" id="y">texte</p>'),
    );
    expect(out).toBe("<p>texte</p>");
  });

  it("déballe les balises inconnues en gardant leur texte", () => {
    expect(
      show(
        parseRichText(
          '<div><span style="x">bonjour</span> <img src=x onerror=alert(1)></div>',
        ),
      ),
    ).toBe("bonjour ");
  });

  it("refuse un lien javascript: ou data: et garde le texte", () => {
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html;base64,AAAA",
      "//evil.example",
    ]) {
      const out = show(parseRichText(`<p><a href="${href}">clic</a></p>`));
      expect(out, href).toBe("<p>clic</p>");
    }
  });

  it("traite le texte comme du texte : aucune balise ne peut en sortir", () => {
    const out = parseRichText(
      "<p>1 &lt; 2 &amp;&amp; &lt;script&gt;x&lt;/script&gt;</p>",
    );
    expect(show(out)).toBe("<p>1 < 2 && <script>x</script></p>");
    // …mais ce sont des nœuds texte : le rendu React les échappe.
    const first = out[0];
    expect(first?.type).toBe("el");
    if (first?.type === "el")
      expect(first.children.every((c) => c.type === "text")).toBe(true);
  });

  it("ignore commentaires, déclarations et CDATA", () => {
    expect(
      show(parseRichText("<p>a<!-- <script>x</script> -->b<![CDATA[y]]>c</p>")),
    ).toBe("<p>abc</p>");
  });

  it("ne se laisse pas tromper par un '>' dans un attribut", () => {
    const out = show(
      parseRichText(
        '<a href="/x" title="a>b"><img src=x onerror=alert(1)>t</a>',
      ),
    );
    expect(out).toBe("<a href=/x>t</a>");
  });

  it("traite un '<' isolé comme du texte", () => {
    expect(show(parseRichText("<p>a < b et c <3</p>"))).toBe(
      "<p>a < b et c <3</p>",
    );
  });

  it("résiste aux balises mal imbriquées et non fermées", () => {
    expect(show(parseRichText("<p>un<strong>deux<em>trois</p>quatre"))).toBe(
      "<p>un<strong>deux<em>trois</em></strong></p>quatre",
    );
    expect(show(parseRichText("</p></strong>seul"))).toBe("seul");
  });

  it("ferme le paragraphe ouvert devant un bloc, et l'élément de liste devant le suivant", () => {
    expect(show(parseRichText("<p>a<ul><li>1<li>2</ul>"))).toBe(
      "<p>a</p><ul><li>1</li><li>2</li></ul>",
    );
  });

  it("n'imbrique pas deux liens", () => {
    expect(show(parseRichText('<a href="/a">x<a href="/b">y</a></a>'))).toBe(
      "<a href=/a>xy</a>",
    );
  });

  it("borne la taille du document et la profondeur", () => {
    const deep = `${"<blockquote>".repeat(500)}x${"</blockquote>".repeat(500)}`;
    expect(() => parseRichText(deep)).not.toThrow();
    const huge = `<p>${"a".repeat(500_000)}</p>`;
    const out = parseRichText(huge);
    expect(richTextToPlain(out).length).toBeLessThanOrEqual(100_000);
  });
});

describe("entités", () => {
  it("décode les entités courantes et numériques, jamais en balise", () => {
    const nb = String.fromCharCode(0xa0);
    expect(
      richTextToPlain(
        parseRichText(
          "<p>L&#39;IA &amp; vous&nbsp;: &laquo;&nbsp;oui&nbsp;&raquo; &#x41; &#65;</p>",
        ),
      ),
    ).toBe(`L'IA & vous${nb}: «${nb}oui${nb}» A A`);
  });
  it("ignore une entité numérique invalide", () => {
    expect(
      richTextToPlain(parseRichText("<p>a&#0;b&#xD800;c&#99999999;d</p>")),
    ).toBe("abcd");
  });
});

describe("richTextToPlain", () => {
  it("donne le texte visible, avec une espace entre les blocs", () => {
    expect(
      richTextToPlain(
        parseRichText("<h2>T</h2><p>un</p><ul><li>a</li><li>b</li></ul>"),
      ),
    ).toBe("T un a b");
  });
});

describe("parseRichText : entrée hostile (temps borné)", () => {
  it("traite en temps quasi linéaire une suite de balises jamais fermées (ReDoS)", () => {
    const hostile = "<a ".repeat(30_000);
    const start = performance.now();
    parseRichText(hostile);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("traite en temps borné des attributs en nombre démesuré et des guillemets jamais fermés", () => {
    for (const hostile of [
      `<a ${'x="1" '.repeat(15_000)}`,
      `<a x="${"y ".repeat(40_000)}`,
      `<p ${"<b ".repeat(30_000)}>`,
    ]) {
      const start = performance.now();
      parseRichText(hostile);
      expect(performance.now() - start).toBeLessThan(250);
    }
  });

  it("garde le même résultat pour les balises normales (liens, guillemets, auto-fermantes)", () => {
    expect(
      show(
        parseRichText(
          `<p>a<br/>b <a href="https://exemple.ca/x?a=1&amp;b=2" title="x>y">lien</a> <b class=c>g</b></p>`,
        ),
      ),
    ).toBe(
      `<p>a<br></br>b <a href=https://exemple.ca/x?a=1&b=2>lien</a> <strong>g</strong></p>`,
    );
  });
});

describe("parseRichText : tableaux et code (pages de comparaison et tutoriels)", () => {
  it("conserve un tableau avec légende, en-tête, corps, lignes et cellules, sans aucun attribut", () => {
    const html =
      '<table class="x" style="width:9px"><caption>Critères</caption><thead><tr><th scope="col" onclick="x()">Critère</th><th>Passerelle</th></tr></thead><tbody><tr><td>Clé</td><td>Une seule</td></tr></tbody></table>';
    expect(show(parseRichText(html))).toBe(
      "<table><caption>Critères</caption><thead><tr><th>Critère</th><th>Passerelle</th></tr></thead><tbody><tr><td>Clé</td><td>Une seule</td></tr></tbody></table>",
    );
  });

  it("ferme une cellule ou une ligne devant la suivante (HTML d'éditeur non fermé)", () => {
    expect(
      show(parseRichText("<table><tr><td>a<td>b<tr><td>c<td>d</table>")),
    ).toBe(
      "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>",
    );
  });

  it("déballe une cellule, une ligne ou une légende hors de leur parent (jamais d'élément mal placé)", () => {
    expect(show(parseRichText("<p>a</p><td>seule</td><tr>x</tr>"))).toBe(
      "<p>a</p>seulex",
    );
    expect(show(parseRichText("<ul><li><td>z</td></li></ul>"))).toBe(
      "<ul><li>z</li></ul>",
    );
  });

  it("ferme le paragraphe ouvert devant un tableau", () => {
    expect(show(parseRichText("<p>a<table><tr><td>1</td></tr></table>"))).toBe(
      "<p>a</p><table><tr><td>1</td></tr></table>",
    );
  });

  it("garde les retours à la ligne et les retraits d'un bloc de code", () => {
    const code =
      'from openai import OpenAI\n\nclient = OpenAI(\n    base_url="x",\n)';
    const out = parseRichText(
      `<pre><code class="language-python">${code.replace(/"/g, "&quot;")}</code></pre>`,
    );
    expect(show(out)).toBe(`<pre><code>${code}</code></pre>`);
    expect(richTextToPlain(out)).toContain("client = OpenAI(");
  });

  it("traite le contenu d'un bloc de code comme du texte : une balise y est écartée, jamais exécutée", () => {
    const out = show(
      parseRichText(
        "<pre><code>a &lt;script&gt;x&lt;/script&gt;<script>alert(1)</script>b</code></pre>",
      ),
    );
    expect(out).toBe("<pre><code>a <script>x</script>b</code></pre>");
  });

  it("accepte le code en ligne", () => {
    expect(show(parseRichText("<p>Changez <code>base_url</code>.</p>"))).toBe(
      "<p>Changez <code>base_url</code>.</p>",
    );
  });

  it("ferme le paragraphe ouvert devant un bloc de code", () => {
    expect(show(parseRichText("<p>a<pre>x</pre>"))).toBe(
      "<p>a</p><pre>x</pre>",
    );
  });

  it("borne la profondeur des tableaux imbriqués", () => {
    const deep = `${"<table><tr><td>".repeat(300)}x${"</td></tr></table>".repeat(300)}`;
    expect(() => parseRichText(deep)).not.toThrow();
  });
});
