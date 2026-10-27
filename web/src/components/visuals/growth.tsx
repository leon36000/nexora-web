import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";

/** Schéma de principe de Nexora Croissance : un métier et une région entrent, les canaux travaillent ensemble, des demandes de clients sortent. */
export function GrowthDiagram({ t }: { t: VisualsDictionary["growth"] }) {
  const link = (
    <span aria-hidden="true" className="flow-line mx-auto block h-6 w-0.5" />
  );
  return (
    <div className="theme-dark tex-dots rounded-lg border border-line bg-bg p-5 sm:p-8">
      <div className="mx-auto max-w-md">
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-center text-small font-medium text-fg">
          {t.from}
        </p>
        {link}
        <p className="ring-soft rounded-md border border-accent bg-surface px-4 py-3.5 text-center font-display text-h4 text-fg">
          {t.hub}
        </p>
        {link}
        <ul className="grid grid-cols-2 gap-2">
          {t.channels.map((c, i) => (
            <li
              key={c}
              className={cn(
                "flex items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2.5 text-small text-fg",
              )}
            >
              <span
                className={cn(
                  "size-2 shrink-0",
                  i === 0 ? "bg-accent" : "bg-fg-muted",
                )}
              />
              {c}
            </li>
          ))}
        </ul>
        {link}
        <p className="rounded-md border border-success/50 bg-surface px-4 py-3 text-center text-small font-medium text-success">
          {t.to}
        </p>
      </div>
    </div>
  );
}
