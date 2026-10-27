import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";
import { Chip, Window } from "./frame";

/** Maquette du catalogue de modèles : filtres d'hébergement et de capacité, lignes de modèles, appel compatible OpenAI. */
export function ModelCatalogMock({ t }: { t: VisualsDictionary["catalog"] }) {
  return (
    <Window title={t.window} status={<Chip tone="accent">{t.hosts[0]}</Chip>}>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex min-h-9 flex-1 basis-40 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-small text-fg-muted">
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
              <circle
                cx="7"
                cy="7"
                r="4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="m10.5 10.5 3 3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            {t.search}
          </span>
          {t.filters.map((f, i) => (
            <span
              key={f}
              className={cn(
                "rounded-xs border px-2.5 py-1.5 text-small",
                i === 0
                  ? "border-accent/60 bg-surface-2 text-fg"
                  : "border-line text-fg-muted",
              )}
            >
              {f}
            </span>
          ))}
        </div>
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {t.rows.map((row, i) => (
            <li key={row.name} className="flex items-center gap-3 px-3.5 py-3">
              <span className="grid size-8 shrink-0 grid-cols-2 gap-0.5 p-1">
                {[0, 1, 2, 3].map((c) => (
                  <span
                    key={c}
                    className={cn(
                      "block",
                      (c + i) % 3 === 0 ? "bg-accent" : "bg-fg-muted/50",
                    )}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium text-fg">
                  {row.name}
                </span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {row.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-xs bg-surface-2 px-1.5 py-0.5 text-[0.75rem] leading-none text-fg-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </span>
              <Chip tone={row.host === t.hosts[0] ? "success" : "plain"}>
                {row.host}
              </Chip>
            </li>
          ))}
        </ul>
        <div className="rounded-md border border-line bg-bg">
          <p className="border-b border-line px-3.5 py-2 font-mono text-label uppercase text-fg-muted">
            {t.codeTitle}
          </p>
          <pre className="overflow-hidden px-3.5 py-3 font-mono text-[0.8125rem] leading-6 text-fg-muted">
            <span className="text-fg">client</span> = OpenAI(
            {"\n"} base_url=
            <span className="text-accent-text">&quot;…/v1&quot;</span>,{"\n"}{" "}
            api_key=<span className="text-accent-text">&quot;…&quot;</span>,
            {"\n"}) <span className="text-fg-muted/80">{t.codeComment}</span>
          </pre>
        </div>
      </div>
    </Window>
  );
}

/** Maquette d'un appel d'API compatible OpenAI : seules l'adresse et la clé changent, le reste du code ne bouge pas. */
export function ApiCallMock({ t }: { t: VisualsDictionary["catalog"] }) {
  return (
    <Window title={t.codeTitle} status={<Chip tone="accent">/v1</Chip>}>
      <pre className="overflow-hidden px-4 py-4 font-mono text-[0.8125rem] leading-6 text-fg-muted sm:px-5">
        <span className="text-fg">client</span> = OpenAI(
        {"\n"} base_url=
        <span className="text-accent-text">&quot;…/v1&quot;</span>,{" "}
        <span className="text-fg-muted/80">{t.codeComment}</span>
        {"\n"} api_key=<span className="text-accent-text">&quot;…&quot;</span>,
        {"\n"}){"\n\n"}
        <span className="text-fg">reply</span> = client.chat.completions.create(
        {"\n"} model=<span className="text-accent-text">&quot;…&quot;</span>,
        {"\n"} messages=[{"{"}
        <span className="text-accent-text">&quot;role&quot;</span>:{" "}
        <span className="text-accent-text">&quot;user&quot;</span>, …{"}"}],
        {"\n"})
      </pre>
      <div className="flex items-center gap-3 border-t border-line bg-surface px-4 py-3 sm:px-5">
        <span className="size-2 bg-success" />
        <span className="font-mono text-small text-fg-muted">200 OK</span>
      </div>
    </Window>
  );
}
