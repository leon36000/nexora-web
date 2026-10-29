import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/get-dictionary";
import { PageByline } from "./page-byline";

const dates = {
  createdAt: "2026-10-20T14:00:00.000Z",
  updatedAt: "2026-10-29T15:30:00.000Z",
};

describe("PageByline : signature d'un guide", () => {
  it("affiche l'auteur, la date de publication et celle de mise à jour, avec <time>", () => {
    const out = renderToStaticMarkup(
      <PageByline
        lang="fr"
        dates={dates}
        siteName="Nexora AI"
        t={getDictionary("fr").cms.byline}
      />,
    );
    expect(out).toContain("Par Nexora AI");
    expect(out).toContain('<time dateTime="2026-10-20">20 octobre 2026</time>');
    expect(out).toContain("Mis à jour le");
    expect(out).toContain('<time dateTime="2026-10-29">29 octobre 2026</time>');
  });

  it("parle anglais dans la version anglaise", () => {
    const out = renderToStaticMarkup(
      <PageByline
        lang="en"
        dates={dates}
        siteName="Nexora AI"
        t={getDictionary("en").cms.byline}
      />,
    );
    expect(out).toContain("By Nexora AI");
    expect(out).toContain("Updated");
    expect(out).toContain("October 29, 2026");
  });

  it("n'affiche rien sans date réelle", () => {
    expect(
      renderToStaticMarkup(
        <PageByline
          lang="fr"
          dates={null}
          siteName="Nexora AI"
          t={getDictionary("fr").cms.byline}
        />,
      ),
    ).toBe("");
  });
});
