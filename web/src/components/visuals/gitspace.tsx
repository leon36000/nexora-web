import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";
import { Chip, Window } from "./frame";

/**
 * Maquette de Gitspace, la forge pensée pour les agents : branches ouvertes par des agents, une demande de fusion
 * qu'un agent a préparée (contexte lu, tests, retour de la CI), la porte de revue humaine et la mémoire du projet.
 * Illustration de conception : aucun chiffre, aucun résultat réel.
 */
export function GitspaceMock({ t }: { t: VisualsDictionary["gitspace"] }) {
  return (
    <Window title={t.window} status={<Chip tone="accent">{t.status}</Chip>}>
      <div className="grid gap-px bg-line md:grid-cols-[13rem_1fr]">
        <div className="bg-bg p-4">
          <p className="font-mono text-label uppercase text-fg-muted">
            {t.branchesTitle}
          </p>
          <ul className="mt-3 space-y-1.5">
            {t.branches.map((b, i) => (
              <li
                key={b.name}
                className={cn(
                  "flex items-center gap-2 rounded-xs px-2 py-1.5 font-mono text-small",
                  i === 0 ? "bg-surface-2 text-fg" : "text-fg-muted",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    b.agent ? "bg-accent" : "bg-fg-muted/60",
                  )}
                />
                <span className="truncate">{b.name}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4 bg-bg p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-medium text-fg">
                {t.mrTitle}
              </p>
              <p className="mt-1 text-small text-fg-muted">{t.mrMeta}</p>
            </div>
            <Chip tone="plain">{t.mrState}</Chip>
          </div>
          <ol className="space-y-2">
            {t.steps.map((s) => (
              <li
                key={s.label}
                className="flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5 text-small"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border text-[0.625rem] leading-none",
                    s.done
                      ? "border-accent bg-accent text-on-accent"
                      : "border-fg-muted/60 text-fg-muted",
                  )}
                >
                  {s.done ? "✓" : ""}
                </span>
                <span className={s.done ? "text-fg" : "text-fg-muted"}>
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
          <div className="rounded-sm border border-dashed border-line-strong p-3">
            <p className="font-mono text-label uppercase text-fg-muted">
              {t.memoryTitle}
            </p>
            <ul className="mt-2 space-y-1 text-small text-fg-muted">
              {t.memory.map((m) => (
                <li key={m} className="flex gap-2">
                  <span aria-hidden="true" className="text-accent-text">
                    ›
                  </span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Window>
  );
}
