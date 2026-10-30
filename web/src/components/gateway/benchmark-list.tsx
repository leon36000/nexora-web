import type { ModelBenchmark } from "@nexora/db";
import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { formatDay, formatScore, type ModelsText } from "@/i18n/models";
import { groupBenchmarks, scorePercent } from "@/lib/models/benchmarks";

const LINK = "rounded-xs text-accent-text underline underline-offset-4";

/**
 * Barre d'un pourcentage : décorative (le chiffre est dans le texte), piste et remplissage à 3:1 au moins. Quatre
 * graduations (tous les quarts) la lisent comme un instrument ; le remplissage se déploie à l'entrée dans l'écran
 * quand le mouvement est permis (CSS seulement).
 */
export function ScoreBar({ percent }: { percent: number }) {
  return (
    <div
      aria-hidden="true"
      className="relative h-2.5 w-full overflow-hidden rounded-xs bg-line"
    >
      <div
        className="score-fill h-full bg-accent-graphic"
        style={{ width: `${percent}%` }}
      />
      <div className="score-ticks absolute inset-0" />
    </div>
  );
}

/** Avertissement honnête sur la non-comparabilité des mesures. */
export function BenchmarkWarning({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <aside className="mt-5 max-w-3xl rounded-card border border-l-2 border-line-strong border-l-accent-graphic bg-surface p-4">
      <p className="text-small font-medium text-fg">{title}</p>
      <p className="mt-1 text-small text-fg-muted">{text}</p>
    </aside>
  );
}

function Item({
  b,
  lang,
  t,
}: {
  b: ModelBenchmark;
  lang: Lang;
  t: ModelsText;
}) {
  const d = t.detail.benchmarks;
  const percent = scorePercent(b);
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-body font-medium text-fg">{b.name}</span>
        <span className="tabular-nums text-body text-fg">
          {formatScore(lang, b.score)} {b.unit}
        </span>
      </div>
      {percent !== null ? (
        <div className="mt-2">
          <ScoreBar percent={percent} />
        </div>
      ) : null}
      <p className="mt-2 text-small text-fg-muted">
        {fmt(d.publishedBy, { publisher: b.publisher })}
        {b.measuredAt
          ? ` · ${fmt(d.measured, { date: formatDay(lang, b.measuredAt) })}`
          : ""}
        {" · "}
        <a href={b.sourceUrl} rel="noopener noreferrer" className={LINK}>
          {d.source}
          <span className="sr-only">
            {" "}
            ({b.name}, {b.publisher})
          </span>
        </a>
      </p>
    </li>
  );
}

/**
 * Mesures publiées d'un modèle, groupées par catégorie, avec barre de score (pourcentages seulement), éditeur de la
 * mesure et lien vers la source précise. Sans mesure : on le dit, on n'en invente pas.
 */
export function BenchmarkList({
  benchmarks,
  lang,
  t,
}: {
  benchmarks: readonly ModelBenchmark[];
  lang: Lang;
  t: ModelsText;
}) {
  const d = t.detail.benchmarks;
  if (benchmarks.length === 0)
    return <p className="mt-4 max-w-2xl text-body text-fg-muted">{d.none}</p>;
  return (
    <>
      <BenchmarkWarning title={d.warningTitle} text={d.warning} />
      <div className="mt-6 grid gap-8">
        {groupBenchmarks(benchmarks).map((g) => (
          <div key={g.category ?? "autres"}>
            <h3 className="text-h4 text-fg">{g.category ?? d.other}</h3>
            <ul className="mt-1 divide-y divide-line border-y border-line">
              {g.items.map((b) => (
                <Item
                  key={`${b.name}-${b.publisher}-${b.sourceUrl}`}
                  b={b}
                  lang={lang}
                  t={t}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
