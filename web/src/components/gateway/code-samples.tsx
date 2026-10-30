import type { Sample } from "@/lib/api-samples";

/**
 * Exemples de code : un bloc par langage, sans JavaScript côté client. Chaque bloc est une région
 * défilable au clavier (le code ne coupe jamais, il défile).
 */
export function CodeSamples({ samples }: { samples: Sample[] }) {
  return (
    <div className="grid gap-6">
      {samples.map((s) => (
        <figure key={s.id}>
          <figcaption className="font-mono text-label uppercase text-fg-muted">
            {s.label}
          </figcaption>
          <CodeBlock label={s.label} code={s.code} />
        </figure>
      ))}
    </div>
  );
}

export function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
      tabIndex={0}
      className="mt-2 overflow-x-auto rounded-frame border border-line bg-surface p-4"
    >
      <pre className="font-mono text-[0.8125rem] leading-relaxed text-fg">
        <code>{code}</code>
      </pre>
    </section>
  );
}
