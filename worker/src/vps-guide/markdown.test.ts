import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown.ts";

const html = (src: string) => renderMarkdown(src).html;

describe("rendu Markdown du guide", () => {
  it("titres avec ancres stables, sans accent, uniques", () => {
    const r = renderMarkdown(
      "# Un titre\n\n## Étape à suivre\n\n## Étape à suivre\n\n### Détail",
    );
    expect(r.headings).toEqual([
      { level: 1, id: "un-titre", text: "Un titre" },
      { level: 2, id: "etape-a-suivre", text: "Étape à suivre" },
      { level: 2, id: "etape-a-suivre-2", text: "Étape à suivre" },
      { level: 3, id: "detail", text: "Détail" },
    ]);
    expect(r.html).toContain('<h2 id="etape-a-suivre">Étape à suivre</h2>');
  });

  it("paragraphes et mise en forme en ligne", () => {
    expect(html("Du **gras**, de l'*italique* et `du code`.\nSuite.")).toBe(
      "<p>Du <strong>gras</strong>, de l'<em>italique</em> et <code>du code</code>. Suite.</p>",
    );
  });

  it("échappe tout le HTML : aucun balisage ne passe", () => {
    const out = html('<script>alert(1)</script> & "x" <b>');
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&amp;");
  });

  it("n'accepte que les liens https, mailto et les ancres internes", () => {
    expect(html("[Proxmox](https://pve.proxmox.com/)")).toContain(
      '<a href="https://pve.proxmox.com/">Proxmox</a>',
    );
    expect(html("[haut](#sommaire)")).toContain('<a href="#sommaire">haut</a>');
    const bad = html("[x](javascript:alert(1)) [y](http://exemple.test)");
    expect(bad).not.toContain("href");
    expect(bad).toContain("x");
  });

  it("listes à puces et numérotées, avec un niveau d'imbrication", () => {
    const out = html(
      "- un\n- deux\n  - sous-point\n- trois\n\n1. premier\n2. second",
    );
    expect(out).toBe(
      "<ul><li>un</li><li>deux<ul><li>sous-point</li></ul></li><li>trois</li></ul><ol><li>premier</li><li>second</li></ol>",
    );
  });

  it("tableaux avec en-tête et contenu en ligne", () => {
    const out = html(
      "| Droit | Chemin |\n|---|---|\n| `VM.Audit` | **/vms** |",
    );
    expect(out).toContain("<table>");
    expect(out).toContain("<th>Droit</th><th>Chemin</th>");
    expect(out).toContain(
      "<td><code>VM.Audit</code></td><td><strong>/vms</strong></td>",
    );
  });

  it("blocs de code : contenu échappé et conservé tel quel, langue notée", () => {
    const out = html(
      '```bash\npveum role add X --privs "A B" <fin>\n  indentation\n```',
    );
    expect(out).toContain('<pre data-lang="bash"><code>');
    expect(out).toContain("&lt;fin&gt;");
    expect(out).toContain("\n  indentation</code>");
    expect(out).toContain("&quot;A B&quot;");
  });

  it("encadrés ::: importante/attention/astuce/note, avec titre et contenu Markdown", () => {
    const out = html(
      ":::attention Port 8006\nOuvrir le **port**.\n\n- un\n:::",
    );
    expect(out).toContain('<aside class="encadre attention">');
    expect(out).toContain('<p class="encadre-titre">Port 8006</p>');
    expect(out).toContain("<strong>port</strong>");
    expect(out).toContain("<ul><li>un</li></ul>");
    expect(out).toContain("</aside>");
  });

  it("saut de page explicite", () => {
    expect(html("a\n\n<!-- saut -->\n\nb")).toBe(
      '<p>a</p><div class="saut"></div><p>b</p>',
    );
  });

  it("règle horizontale", () => {
    expect(html("a\n\n---\n\nb")).toBe("<p>a</p><hr><p>b</p>");
  });
});
