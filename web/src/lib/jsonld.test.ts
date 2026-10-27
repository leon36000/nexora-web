import { describe, expect, it } from "vitest";
import type { Block } from "@/server/cms/model";
import { buildFaqJsonLd, jsonLdString } from "./jsonld";

const faq = (over: Partial<Extract<Block, { type: "faq" }>> = {}): Block => ({
  type: "faq",
  key: "k",
  anchorId: null,
  tone: "clair",
  emitJsonLd: true,
  title: "Questions",
  items: [
    {
      question: "Où sont mes données ?",
      answer: "Chez vous.\n\nOu hébergées au Québec.",
    },
    { question: "Et les modèles ?", answer: "Au choix." },
  ],
  ...over,
});
const hero: Block = {
  type: "hero",
  key: "h",
  anchorId: null,
  variant: "sombre",
  perimeterGrid: true,
  media: null,
  eyebrow: null,
  headline: "T",
  subheadline: null,
  primary: null,
  secondary: null,
};

describe("buildFaqJsonLd", () => {
  it("produit un FAQPage à partir du contenu visible, réponses comprises", () => {
    expect(buildFaqJsonLd([hero, faq()])).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Où sont mes données ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Chez vous.\n\nOu hébergées au Québec.",
          },
        },
        {
          "@type": "Question",
          name: "Et les modèles ?",
          acceptedAnswer: { "@type": "Answer", text: "Au choix." },
        },
      ],
    });
  });

  it("ne produit rien sans FAQ ou si le bloc le refuse", () => {
    expect(buildFaqJsonLd([hero])).toBeNull();
    expect(buildFaqJsonLd([faq({ emitJsonLd: false })])).toBeNull();
  });

  it("fusionne plusieurs FAQ en un seul FAQPage", () => {
    const two = buildFaqJsonLd([
      faq(),
      faq({ items: [{ question: "Q3 ?", answer: "R3" }] }),
    ]);
    expect((two as { mainEntity: unknown[] }).mainEntity).toHaveLength(3);
  });
});

describe("jsonLdString", () => {
  it("ne laisse aucun '<' : impossible de fermer la balise script depuis le contenu", () => {
    const s = jsonLdString({ a: "</script><script>alert(1)</script>", b: "x" });
    expect(s).not.toContain("<");
    expect(JSON.parse(s)).toEqual({
      a: "</script><script>alert(1)</script>",
      b: "x",
    });
  });
});
