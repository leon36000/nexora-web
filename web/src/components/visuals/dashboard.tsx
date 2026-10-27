import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";
import { Chip, Window } from "./frame";

/** Hauteurs de principe (14 jours) : une forme, pas une mesure. */
const BARS = [30, 42, 36, 58, 50, 44, 66, 72, 60, 78, 70, 86, 74, 92];

/** Maquette du tableau de bord du compte : solde, plafond, appels par jour, clés d'API masquées. */
export function DashboardMock({ t }: { t: VisualsDictionary["dashboard"] }) {
  return (
    <Window
      title={t.window}
      status={<Chip tone="accent">{t.balanceValue}</Chip>}
    >
      <div className="grid gap-px bg-line sm:grid-cols-2">
        <div className="bg-surface p-4">
          <p className="text-small text-fg-muted">{t.balance}</p>
          <p className="mt-1 font-display text-h3 tabular text-fg">
            {t.balanceValue}
          </p>
          <div className="mt-3 h-1.5 w-full bg-surface-2">
            <div className="h-full w-2/3 bg-accent" />
          </div>
          <p className="mt-1.5 text-small text-fg-muted">{t.cap}</p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-small text-fg-muted">{t.chart}</p>
          <div className="mt-3 flex h-[4.5rem] items-end gap-1">
            {BARS.map((h, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: série fixe, jamais réordonnée
                key={i}
                style={{ height: `${h}%`, "--d": i } as React.CSSProperties}
                className={cn(
                  "bar-grow block flex-1",
                  i === BARS.length - 1 ? "bg-accent" : "bg-fg-muted/45",
                )}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-line bg-bg p-4">
        <p className="font-mono text-label uppercase text-fg-muted">
          {t.keysTitle}
        </p>
        <ul className="mt-2 divide-y divide-line">
          {t.keys.map(([name, tail]) => (
            <li
              key={name}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="text-small text-fg">{name}</span>
              <span className="font-mono text-small text-fg-muted">{tail}</span>
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}
