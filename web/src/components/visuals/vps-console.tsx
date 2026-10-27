import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";
import { Chip, Window } from "./frame";

/** Courbes de principe (aucune valeur) : des tracés fixes, jamais présentés comme des mesures. */
const TRACES = [
  "M0 22 L12 18 L24 20 L36 12 L48 15 L60 8 L72 11 L84 6 L96 9",
  "M0 14 L12 15 L24 13 L36 16 L48 14 L60 15 L72 13 L84 14 L96 12",
  "M0 20 L12 20 L24 19 L36 19 L48 18 L60 18 L72 17 L84 17 L96 16",
];

/** Maquette de la console d'un VPS : état, région, accès, terminal et trois courbes de principe. */
export function VpsConsoleMock({ t }: { t: VisualsDictionary["vps"] }) {
  return (
    <Window
      title={t.window}
      status={
        <Chip tone="success">
          <span className="size-1.5 bg-success" />
          {t.state}
        </Chip>
      }
    >
      <div className="grid gap-px bg-line sm:grid-cols-[13rem_minmax(0,1fr)]">
        <dl className="space-y-3 bg-surface p-4">
          {t.fields.map(([k, v]) => (
            <div key={k}>
              <dt className="text-small text-fg-muted">{k}</dt>
              <dd className="text-[0.9375rem] font-medium text-fg">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="bg-bg">
          <p className="border-b border-line px-4 py-2 font-mono text-label uppercase text-fg-muted">
            {t.terminalTitle}
          </p>
          <pre className="overflow-hidden px-4 py-3 font-mono text-[0.8125rem] leading-6 text-fg-muted">
            <span className="text-accent-text">$</span>{" "}
            <span className="text-fg">ssh vous@votre-serveur</span>
            {"\n"}
            {t.banner}
            {"\n"}
            <span className="text-accent-text">$</span>{" "}
            <span className="inline-block h-[1.05em] w-[0.55em] translate-y-[0.18em] bg-fg" />
          </pre>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
        {t.gauges.map((label, i) => (
          <div key={label} className="bg-surface px-4 py-3">
            <p className="text-small text-fg-muted">{label}</p>
            <svg
              viewBox="0 0 96 28"
              className="mt-2 h-7 w-full"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={TRACES[i]}
                fill="none"
                stroke={i === 0 ? "#f07a52" : "#a9b3ae"}
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        ))}
      </div>
    </Window>
  );
}
