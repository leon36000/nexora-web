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

  it("dessine un « N » en pixels : deux montants d'encre (un rectangle chacun) et une diagonale de trois carrés", () => {
    expect(LOGO.bars.match(/M/g)).toHaveLength(2);
    expect(LOGO.passage.match(/M/g)).toHaveLength(3);
  });

  it("garde l'orange signal pour la diagonale, plus soutenu sur fond clair", () => {
    expect(renderToStaticMarkup(<Logo tone="dark" />)).toContain(
      `fill="#ff5a1f"`,
    );
    expect(renderToStaticMarkup(<Logo tone="light" />)).toContain(
      `fill="#f04a10"`,
    );
    expect(renderToStaticMarkup(<Logo tone="auto" />)).toContain(
      "var(--accent-graphic)",
    );
  });

  it("choisit pour « AI » un orange de texte qui passe le contraste AA sur son fond", () => {
    expect(renderToStaticMarkup(<Logo tone="dark" />)).toContain("#ff7a45");
    expect(renderToStaticMarkup(<Logo tone="light" />)).toContain("#b53a0a");
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
    expect(html).toContain(LOGO.bars);
    expect(html).toContain(`viewBox="${LOGO.symbolBox}"`);
    expect(renderToStaticMarkup(<Logo wordmark={false} />)).not.toContain(
      LOGO.nexora,
    );
  });
});
