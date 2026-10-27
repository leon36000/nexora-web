import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildAlternates } from "@/lib/alternates";
import type { FooterModel } from "@/lib/chrome";
import { SiteFooter } from "./site-footer";

// Le sélecteur de langue lit le chemin courant (hook client).
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const render = (model: FooterModel, lang: "fr" | "en" = "fr") =>
  renderToStaticMarkup(
    <SiteFooter
      lang={lang}
      dict={getDictionary(lang)}
      model={model}
      alternates={buildAlternates([])}
    />,
  );

describe("pied de page : bloc légal", () => {
  it("n'affiche ni titre ni liste quand aucune mention légale n'est publiée", () => {
    const html = render({
      columns: [{ title: "Produits", links: [{ label: "VPS", href: "/vps" }] }],
      legal: [],
    });
    expect(html).not.toContain(getDictionary("fr").footer.legalTitle);
    expect(html).not.toContain('<h2 class="sr-only"');
    // le sélecteur de langue et le droit d'auteur restent présents
    expect(html).toContain(getDictionary("fr").footer.copyright);
  });

  it("affiche le titre et les liens quand des mentions légales existent", () => {
    const html = render(
      {
        columns: [],
        legal: [{ label: "Confidentialité", href: "/confidentialite" }],
      },
      "en",
    );
    expect(html).toContain(getDictionary("en").footer.legalTitle);
    expect(html).toContain("Confidentialité");
  });
});
