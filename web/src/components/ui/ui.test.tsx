import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { buttonClasses } from "./button";
import { Card } from "./card";
import { Section } from "./section";

describe("primitives de la direction « Instrument »", () => {
  it("le bouton d'accent a un texte noir sur l'orange signal : le blanc n'y atteindrait que 3:1", () => {
    const primary = buttonClasses({ variant: "primary" });
    expect(primary).toContain("bg-accent");
    expect(primary).toContain("text-on-accent");
    expect(primary).not.toContain("text-white");
  });

  it("offre un bouton discret (« Découvrir ›») en plus du primaire, du secondaire et du lien", () => {
    expect(buttonClasses({ variant: "soft" })).toContain("rounded-md");
    expect(buttonClasses({ variant: "secondary" })).toContain("border");
  });

  it("une section est cadrée par des filets (rails) que l'on peut retirer ; ils sont décoratifs", () => {
    const framed = renderToStaticMarkup(<Section>x</Section>);
    expect(framed).toContain('class="rails"');
    expect(framed).toMatch(/aria-hidden="true" class="rails"/);
    expect(
      renderToStaticMarkup(<Section rails={false}>x</Section>),
    ).not.toContain("rails");
    expect(framed).toContain("border-t border-line");
  });

  it("une carte « cellule » n'a ni bordure ni rayon propres : la grille à filets les porte", () => {
    const cell = renderToStaticMarkup(<Card variant="cell">x</Card>);
    expect(cell).toContain("rounded-none");
    expect(cell).not.toContain("border-line");
    const surface = renderToStaticMarkup(<Card>x</Card>);
    expect(surface).toContain("rounded-card border border-line");
  });

  it("l'étiquette d'accent s'ouvre par un pixel orange, les autres tons non", () => {
    expect(renderToStaticMarkup(<Badge tone="accent">x</Badge>)).toContain(
      "before:bg-accent-graphic",
    );
    expect(renderToStaticMarkup(<Badge>x</Badge>)).not.toContain("before:");
  });
});
