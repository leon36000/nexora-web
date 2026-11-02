import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import { Logo, LogoMark, SIGNAL_MARK } from "./logo";

describe("logo de la marque (identité « Signal »)", () => {
  it("lit le nom dans la configuration de marque : un seul endroit à changer", () => {
    const html = renderToStaticMarkup(<Logo tone="dark" />);
    expect(html).toContain(BRAND.wordmark.base);
    if (BRAND.wordmark.suffix) expect(html).toContain(BRAND.wordmark.suffix);
  });

  it("la marque « signal » n'est pas le « N » en pixels : deux crochets, une ligne, un point, aucun carré", () => {
    const html = renderToStaticMarkup(<LogoMark tone="dark" />);
    expect(html).toContain(SIGNAL_MARK.brackets);
    expect(html).toContain(SIGNAL_MARK.scan);
    expect(html).toMatch(/<circle/);
    expect(html).not.toMatch(/<rect|h10\.4/);
  });

  it("prend l'accent ion : clair sur fond sombre, foncé (contraste AA) sur fond clair, ou celui du thème", () => {
    expect(renderToStaticMarkup(<Logo tone="dark" />)).toContain("#3ec8ff");
    expect(renderToStaticMarkup(<Logo tone="light" />)).toContain("#0b6e99");
    expect(renderToStaticMarkup(<Logo tone="auto" />)).toContain(
      "var(--accent-graphic)",
    );
  });

  it("est décoratif par défaut (le lien qui le contient porte le nom), et nommé sur demande", () => {
    expect(renderToStaticMarkup(<Logo />)).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(<Logo label={BRAND.name} />);
    expect(named).toContain('role="img"');
    expect(named).toContain(`aria-label="${BRAND.name}"`);
    expect(named).not.toContain('aria-hidden="true"><svg');
  });

  it("le symbole seul ne porte pas le nom", () => {
    expect(renderToStaticMarkup(<Logo wordmark={false} />)).not.toContain(
      BRAND.wordmark.base,
    );
  });
});
