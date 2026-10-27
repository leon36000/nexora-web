import { answerParagraphs } from "@/components/blocks/faq-block";
import { CodeBlock } from "@/components/gateway/code-samples";
import type { VpsDictionary } from "@/i18n/vps";

export interface FaqEntry {
  question: string;
  answer: string;
  /** Commande affichée entre `answer` et `after` (bloc de code défilable au clavier). */
  code?: string;
  after?: string;
}

/**
 * Questions fréquentes en <details>/<summary> natifs : accessibles au clavier et aux lecteurs d'écran,
 * sans JavaScript. Même gabarit visuel que le bloc FAQ du CMS.
 */
export function FaqList({ items }: { items: readonly FaqEntry[] }) {
  return (
    <div className="max-w-3xl divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.question} className="group py-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 text-h4 text-fg [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
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
            {answerParagraphs(item.answer).map((p) => (
              <p key={p}>{p}</p>
            ))}
            {item.code ? (
              <CodeBlock code={item.code} label={item.question} />
            ) : null}
            {item.after
              ? answerParagraphs(item.after).map((p) => <p key={p}>{p}</p>)
              : null}
          </div>
        </details>
      ))}
    </div>
  );
}

/** Questions générales de la page /vps, dans l'ordre d'affichage. */
export function generalFaq(t: VpsDictionary): FaqEntry[] {
  const i = t.faq.items;
  return [
    { question: i.whatIs.q, answer: i.whatIs.a },
    { question: i.data.q, answer: i.data.a },
    { question: i.ssh.q, answer: i.ssh.a },
    {
      question: i.tunnel.q,
      answer: i.tunnel.a,
      code: i.tunnel.code,
      after: i.tunnel.after,
    },
    { question: i.renewal.q, answer: i.renewal.a },
    { question: i.unpaid.q, answer: i.unpaid.a },
    { question: i.cancel.q, answer: i.cancel.a },
    { question: i.reinstall.q, answer: i.reinstall.a },
    { question: i.port25.q, answer: i.port25.a },
    { question: i.taxes.q, answer: i.taxes.a },
  ];
}
