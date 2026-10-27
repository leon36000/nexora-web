import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import type { FaqBlock } from "@/server/cms/model";
import { anchorProps, toneProps } from "./tone";

/** Réponse en paragraphes (une ligne vide sépare deux paragraphes) : le même texte alimente le JSON-LD. */
export function answerParagraphs(answer: string): string[] {
  return answer
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** FAQ en <details>/<summary> natifs : accessible au clavier sans JavaScript. */
export function FaqBlockView({
  block,
  joined,
}: {
  block: FaqBlock;
  joined?: "after" | "before" | "both";
}) {
  const titleId = `${block.key}-title`;
  const anchor = anchorProps(block.anchorId);
  return (
    <Section
      {...toneProps(block.tone)}
      joined={joined}
      aria-labelledby={block.title ? titleId : undefined}
      id={anchor.id}
      className={anchor.className}
    >
      {block.title ? <SectionHeader id={titleId} title={block.title} /> : null}
      <div
        className={`max-w-3xl divide-y divide-line border-y border-line ${block.title ? "mt-12" : ""}`}
      >
        {block.items.map((q) => (
          <details key={q.question} className="group py-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 text-h4 text-fg [&::-webkit-details-marker]:hidden">
              <span>{q.question}</span>
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
                className="size-4 shrink-0 text-accent-text transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none"
              >
                <path
                  d="M8 2v12M2 8h12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="square"
                />
              </svg>
            </summary>
            <div className="mt-4 max-w-2xl space-y-4 text-fg-muted">
              {answerParagraphs(q.answer).map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}
