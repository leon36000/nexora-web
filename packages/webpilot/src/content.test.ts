import { describe, expect, it } from "vitest";
import {
  decodeBody,
  extractContent,
  extractLinks,
  isHtmlType,
  plainContent,
} from "./content.ts";

const PAGE = `<!doctype html><html lang="fr-CA"><head>
<title> Page d'essai </title>
<meta name="description" content="Une description.">
<link rel="canonical" href="/canon">
<style>.x{color:red}</style><script>alert('mal')</script></head>
<body>
<header><nav><a href="/menu">Menu</a></nav></header>
<main>
  <h1>Titre principal</h1>
  <p>Un <strong>paragraphe</strong> avec un <a href="/lien?a=1#ancre">lien</a>, du <em>texte</em> et du <code>code</code>.</p>
  <ul><li>Un</li><li>Deux <ul><li>Imbriqué</li></ul></li></ul>
  <ol><li>Premier</li><li>Second</li></ol>
  <pre>ligne 1
  ligne 2</pre>
  <blockquote>Citation</blockquote>
  <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
  <img src="/i.png" alt="Une image">
  <a href="javascript:alert(1)">piège</a>
  <a href="mailto:x@y.z">écrire</a>
  <p hidden>caché</p>
  <script>document.write('x')</script>
</main>
<aside>Publicité</aside>
<footer>Pied de page <a href="https://autre.example/x">ailleurs</a></footer>
</body></html>`;

const BASE = "https://exemple.test/dossier/page";

describe("extraction du contenu lisible", () => {
  it("rend le markdown du contenu principal sans script, style ni navigation", () => {
    const out = extractContent(PAGE, BASE, {
      formats: ["markdown"],
      onlyMainContent: true,
    });
    const md = out.markdown ?? "";
    expect(md).toContain("# Titre principal");
    expect(md).toContain("**paragraphe**");
    expect(md).toContain("[lien](https://exemple.test/lien?a=1)");
    expect(md).toContain("*texte*");
    expect(md).toContain("`code`");
    expect(md).toContain("- Un");
    expect(md).toContain("  - Imbriqué");
    expect(md).toContain("1. Premier");
    expect(md).toContain("```\nligne 1\n  ligne 2\n```");
    expect(md).toContain("> Citation");
    expect(md).toContain("| A | B |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 1 | 2 |");
    expect(md).toContain("![Une image](https://exemple.test/i.png)");
    expect(md).not.toContain("alert");
    expect(md).not.toContain("color:red");
    expect(md).not.toContain("Menu");
    expect(md).not.toContain("Publicité");
    expect(md).not.toContain("Pied de page");
    expect(md).not.toContain("caché");
    expect(md).not.toContain("javascript:");
    expect(md).toContain("écrire");
    expect(md).not.toContain("mailto:");
  });

  it("garde la navigation et le pied de page quand le contenu principal n'est pas demandé", () => {
    const md =
      extractContent(PAGE, BASE, {
        formats: ["markdown"],
        onlyMainContent: false,
      }).markdown ?? "";
    expect(md).toContain("Menu");
    expect(md).toContain("Pied de page");
    expect(md).not.toContain("alert");
  });

  it("métadonnées : titre, langue, description, adresse canonique", () => {
    const { metadata } = extractContent(PAGE, BASE, {
      formats: ["markdown"],
      onlyMainContent: true,
    });
    expect(metadata.title).toBe("Page d'essai");
    expect(metadata.language).toBe("fr-CA");
    expect(metadata.description).toBe("Une description.");
    expect(metadata.canonicalUrl).toBe("https://exemple.test/canon");
  });

  it("format texte : sans marques markdown", () => {
    const text =
      extractContent(PAGE, BASE, {
        formats: ["text"],
        onlyMainContent: true,
      }).text ?? "";
    expect(text).toContain("Titre principal");
    expect(text).toContain("Un paragraphe avec un lien, du texte et du code.");
    expect(text).not.toContain("**");
    expect(text).not.toContain("](");
    expect(text).not.toContain("#");
  });

  it("format html : nettoyé (aucun script, style, gestionnaire d'événement ni javascript:)", () => {
    const html =
      extractContent(
        `<main><p onclick="x()" class="a">Salut <a href="javascript:evil()">x</a></p><script>1</script><iframe src="http://e"></iframe></main>`,
        BASE,
        { formats: ["html"], onlyMainContent: true },
      ).html ?? "";
    expect(html).toContain("Salut");
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("iframe");
  });

  it("format links : absolus, http(s) seulement, sans doublon ni ancre", () => {
    const { links } = extractContent(PAGE, BASE, {
      formats: ["links"],
      onlyMainContent: false,
    });
    const urls = (links ?? []).map((l) => l.url);
    expect(urls).toContain("https://exemple.test/lien?a=1");
    expect(urls).toContain("https://autre.example/x");
    expect(urls).toContain("https://exemple.test/menu");
    expect(urls.some((u) => u.startsWith("javascript:"))).toBe(false);
    expect(urls.some((u) => u.startsWith("mailto:"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("ne renvoie que les formats demandés", () => {
    const out = extractContent(PAGE, BASE, {
      formats: ["text"],
      onlyMainContent: true,
    });
    expect(out.markdown).toBeUndefined();
    expect(out.html).toBeUndefined();
    expect(out.links).toBeUndefined();
  });

  it("extractLinks : liens à suivre pour une exploration (toute la page, base respectée)", () => {
    const html = `<base href="https://exemple.test/autre/"><a href="a">A</a><a href="/b#x">B</a><a href="https://z.test/">Z</a>`;
    expect(extractLinks(html, BASE)).toEqual([
      "https://exemple.test/autre/a",
      "https://exemple.test/b",
      "https://z.test/",
    ]);
  });

  it("résiste à un HTML mal formé et très imbriqué", () => {
    const deep = `${"<div>".repeat(5000)}fond${"</div>".repeat(5000)}`;
    const out = extractContent(`<p>ouvert <b>gras ${deep}`, BASE, {
      formats: ["markdown", "text"],
      onlyMainContent: true,
    });
    expect(out.markdown).toContain("ouvert");
  });
});

describe("contenu non HTML et décodage", () => {
  it("texte brut : repris tel quel", () => {
    const out = plainContent("Bonjour\nMonde", ["markdown", "text"]);
    expect(out.markdown).toBe("Bonjour\nMonde");
    expect(out.text).toBe("Bonjour\nMonde");
  });

  it("reconnaît les types HTML", () => {
    expect(isHtmlType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlType("application/xhtml+xml")).toBe(true);
    expect(isHtmlType("text/plain")).toBe(false);
    expect(isHtmlType(undefined)).toBe(true);
  });

  it("décode selon le jeu de caractères de l'en-tête, puis de la balise meta, sinon utf-8", () => {
    const latin1 = Uint8Array.from([0x63, 0x61, 0x66, 0xe9]); // « café » en ISO-8859-1
    expect(decodeBody(latin1, "text/html; charset=iso-8859-1")).toBe("café");
    const meta = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="iso-8859-1">'),
      0xe9,
    ]);
    expect(decodeBody(meta, "text/html")).toContain("é");
    expect(
      decodeBody(new TextEncoder().encode("é"), "text/html; charset=inconnu"),
    ).toBe("é");
  });
});

describe("pages sans <main> ni titre", () => {
  it("ne laisse pas la déclaration <!doctype> dans le contenu lu", () => {
    const html =
      "<!doctype html><html lang=en><head><title>Exemple</title></head><body><p>Un seul paragraphe.</p></body></html>";
    const out = extractContent(html, "https://exemple.test/", {
      formats: ["markdown", "text"],
      onlyMainContent: true,
    });
    expect(out.markdown).toBe("Un seul paragraphe.");
    expect(out.text).toBe("Un seul paragraphe.");
  });

  it("ne laisse pas non plus un prologue XML ni un commentaire conditionnel", () => {
    const html =
      '<?xml version="1.0"?><!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0//EN"><html><body><p>Texte.</p></body></html>';
    const out = extractContent(html, "https://exemple.test/", {
      formats: ["markdown"],
      onlyMainContent: false,
    });
    expect(out.markdown).toBe("Texte.");
  });
});
