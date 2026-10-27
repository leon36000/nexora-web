import type { Block } from "@/server/cms/model";

/**
 * FAQPage généré PAR CODE à partir des blocs FAQ visibles de la page (jamais écrit à la main, jamais par un modèle).
 * Les questions et réponses sont exactement celles qui s'affichent. Plusieurs blocs FAQ -> un seul FAQPage.
 */
export function buildFaqJsonLd(
  blocks: Block[],
): Record<string, unknown> | null {
  const entities = blocks.flatMap((b) =>
    b.type === "faq" && b.emitJsonLd
      ? b.items.map((q) => ({
          "@type": "Question",
          name: q.question,
          acceptedAnswer: { "@type": "Answer", text: q.answer },
        }))
      : [],
  );
  if (entities.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entities,
  };
}

/** JSON sûr pour une balise <script type="application/ld+json"> : aucun « < » ne peut fermer la balise. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
