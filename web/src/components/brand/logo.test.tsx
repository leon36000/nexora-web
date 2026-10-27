import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Logo, LogoMark } from "./logo";
import { LOGO } from "./logo-geometry";

describe("logo Nexora AI", () => {
  it("dessine le logotype en contours : aucun texte, donc aucune police à charger", () => {
    const html = renderToStaticMarkup(<Logo tone="dark" />);
    expect(html).not.toMatch(/>\s*nexora/i);
    expect(html).toContain(LOGO.nexora);
    expect(html).toContain(LOGO.ai);
    expect(html).toContain(`viewBox="${LOGO.lockupBox}"`);
  });

  it("garde l'orange Nexora pour l'intersection, sur tous les tons", () => {
    for (const tone of ["dark", "light", "auto"] as const) {
      expect(renderToStaticMarkup(<Logo tone={tone} />)).toContain(
        `fill="#ce411c"`,
      );
    }
  });

  it("choisit pour « AI » un orange de texte qui passe le contraste AA sur son fond", () => {
    expect(renderToStaticMarkup(<Logo tone="dark" />)).toContain("#f07a52");
    expect(renderToStaticMarkup(<Logo tone="light" />)).toContain("#b83a18");
    expect(renderToStaticMarkup(<Logo tone="auto" />)).toContain(
      "var(--accent-text)",
    );
  });

  it("est décoratif par défaut (le lien qui le contient porte le nom), et nommé sur demande", () => {
    expect(renderToStaticMarkup(<Logo />)).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(<Logo label="Nexora AI" />);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Nexora AI"');
    expect(named).not.toContain("aria-hidden");
  });

  it("le symbole seul reprend la même géométrie", () => {
    const html = renderToStaticMarkup(<LogoMark />);
    expect(html).toContain(LOGO.squares);
    expect(html).toContain(`viewBox="${LOGO.symbolBox}"`);
    expect(renderToStaticMarkup(<Logo wordmark={false} />)).not.toContain(
      LOGO.nexora,
    );
  });
});
