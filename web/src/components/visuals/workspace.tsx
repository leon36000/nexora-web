import type { CSSProperties, ReactNode } from "react";
import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";

type T = VisualsDictionary["workspace"];

/** Icônes du rail (trait de 1,5 px, une seule famille) : code, documents, flux, creative, navigateur. */
const RAIL_ICONS: ReactNode[] = [
  <path key="c" d="M8 7 3 12l5 5M16 7l5 5-5 5" />,
  <path key="d" d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />,
  <path
    key="f"
    d="M5 6h4v4H5zM15 14h4v4h-4zM9 8h4a2 2 0 0 1 2 2v4M5 18h4M7 10v8"
  />,
  <path key="r" d="M4 5h16v14H4zM4 15l5-4 4 3 3-2 4 3" />,
  <path
    key="w"
    d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18"
  />,
];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Panneau ancré dans l'espace de travail : barre de titre fine, poignée, contenu. */
function Panel({
  title,
  aside,
  children,
  className,
  d,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  d: number;
}) {
  return (
    <div
      style={{ "--d": d } as CSSProperties}
      className={cn(
        "ws-dock flex min-w-0 flex-col overflow-hidden rounded-md border border-line bg-surface",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-small font-medium text-fg">
          <span
            aria-hidden="true"
            className="grid grid-cols-2 gap-0.5 opacity-50"
          >
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="size-[3px] rounded-full bg-fg-muted" />
            ))}
          </span>
          <span className="truncate">{title}</span>
        </span>
        {aside}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Maquette de l'espace de travail dans le navigateur : rail des outils, agent de code qui propose un changement,
 * documents interrogés avec leurs sources, flux en attente d'approbation, rendu Creative, crédits partagés et
 * exécution sur l'ordinateur de la personne (en préparation). Décorative : le texte alternatif vient du CMS.
 */
export function WorkspaceMock({ t }: { t: T }) {
  return (
    <div className="theme-dark overflow-hidden rounded-xl border border-line bg-abyss-900 text-fg shadow-pop ring-1 ring-inset ring-white/5">
      {/* barre du navigateur */}
      <div className="flex items-center gap-3 border-b border-line bg-abyss-950 px-3 py-2.5 sm:px-4">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-steel/70" />
          <span className="size-2.5 rounded-full bg-steel/50" />
          <span className="size-2.5 rounded-full bg-steel/30" />
        </span>
        <span className="mx-auto flex min-w-0 max-w-md flex-1 items-center justify-center gap-2 rounded-sm border border-line bg-abyss-900 px-3 py-1 text-small text-fg-muted">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-3 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />
          </svg>
          <span className="truncate">{t.address}</span>
        </span>
        <span className="hidden text-small text-fg-muted md:inline">
          {t.org}
        </span>
      </div>

      <div className="flex">
        {/* rail des outils */}
        <nav
          aria-hidden="true"
          className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-abyss-950/60 py-3 sm:flex"
        >
          {RAIL_ICONS.map((icon, i) => (
            <span
              key={t.tabs[i]}
              title={t.tabs[i]}
              className={cn(
                "grid size-8 place-items-center rounded-sm text-fg-muted",
                i === 0 && "bg-accent/15 text-accent-text",
              )}
            >
              <Icon>{icon}</Icon>
            </span>
          ))}
        </nav>

        <div className="min-w-0 flex-1 p-2 sm:p-3">
          {/* onglets ouverts */}
          <div className="mb-2 flex items-center gap-1 overflow-hidden sm:mb-3">
            {t.tabs.slice(0, 4).map((tab, i) => (
              <span
                key={tab}
                className={cn(
                  "shrink-0 rounded-sm px-2.5 py-1 text-small",
                  i === 0 ? "bg-surface-2 text-fg" : "text-fg-muted",
                )}
              >
                {tab}
              </span>
            ))}
            <span className="ml-auto hidden shrink-0 text-small text-fg-muted lg:inline">
              {t.layout}
            </span>
          </div>

          <div className="grid gap-2 sm:gap-3 lg:grid-cols-12">
            {/* agent de code */}
            <Panel
              d={0}
              title={t.code.title}
              className="lg:col-span-7 lg:row-span-2"
              aside={
                <span className="flex items-center gap-1.5 text-small text-accent-text">
                  <span className="live-dot size-1.5 rounded-full bg-accent" />
                  {t.code.status}
                </span>
              }
            >
              <div className="space-y-3 p-3">
                <p className="max-w-prose rounded-sm bg-surface-2 px-3 py-2 text-small text-fg">
                  {t.code.prompt}
                </p>
                <div className="overflow-hidden rounded-sm border border-line bg-abyss-950 font-mono text-[0.75rem] leading-6">
                  <div className="border-b border-line px-3 py-1.5 text-fg-muted">
                    {t.code.file}
                  </div>
                  <div className="overflow-hidden py-1">
                    {t.code.context.map((line, i) => (
                      <DiffLine key={line} n={i + 1} kind="ctx" line={line} />
                    ))}
                    {t.code.removed.map((line) => (
                      <DiffLine key={line} n={3} kind="del" line={line} />
                    ))}
                    {t.code.added.map((line, i) => (
                      <DiffLine
                        key={line}
                        n={3 + i}
                        kind="add"
                        line={line}
                        d={i}
                      />
                    ))}
                    <div className="flex px-3">
                      <span className="w-8 shrink-0 text-fg-muted/60">6</span>
                      <span className="text-fg-muted">{"});"}</span>
                      <span
                        aria-hidden="true"
                        className="ws-caret ml-0.5 inline-block h-4 w-[7px] translate-y-1 bg-accent"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-small text-fg-muted">
                    {t.code.tests}
                  </span>
                  <span className="rounded-sm bg-accent px-2.5 py-1 text-small font-medium text-on-accent">
                    {t.code.review}
                  </span>
                </div>
              </div>
            </Panel>

            {/* documents (RAG) */}
            <Panel d={1} title={t.rag.title} className="lg:col-span-5">
              <div className="space-y-2.5 p-3 text-small">
                <p className="text-fg">{t.rag.question}</p>
                <p className="text-fg-muted">
                  {t.rag.answer}
                  <sup className="ml-0.5 text-accent-text">1</sup>
                  <sup className="ml-0.5 text-accent-text">2</sup>
                </p>
                <ul className="space-y-1 border-t border-line pt-2.5">
                  {t.rag.sources.map((s, i) => (
                    <li
                      key={s}
                      className="flex items-center gap-2 text-fg-muted"
                    >
                      <span className="grid size-4 shrink-0 place-items-center rounded-xs border border-accent/50 text-[0.625rem] text-accent-text">
                        {i + 1}
                      </span>
                      <span className="truncate">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>

            {/* flux de travaux */}
            <Panel d={2} title={t.flow.title} className="lg:col-span-5">
              <div className="p-3">
                <ol className="flex items-center gap-1.5">
                  {t.flow.nodes.map((node, i) => (
                    <li
                      key={node}
                      className="flex min-w-0 flex-1 items-center gap-1.5"
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate rounded-sm border px-1.5 py-1.5 text-center text-[0.6875rem] sm:text-small",
                          i < 2 && "border-line bg-surface-2 text-fg",
                          i === 2 &&
                            "ring-soft border-accent/70 bg-accent/10 text-accent-text",
                          i > 2 && "border-dashed border-line text-fg-muted",
                        )}
                      >
                        {node}
                      </span>
                      {i < t.flow.nodes.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className="h-px w-2 shrink-0 bg-steel"
                        />
                      ) : null}
                    </li>
                  ))}
                </ol>
                <p className="mt-2.5 text-small text-fg-muted">
                  {t.flow.waiting}
                </p>
              </div>
            </Panel>

            {/* Creative */}
            <Panel
              d={3}
              title={t.creative.title}
              className="hidden sm:flex lg:col-span-4"
            >
              <div className="p-3">
                <div className="relative aspect-[16/7] overflow-hidden rounded-sm border border-line bg-[linear-gradient(160deg,#1b2a3f_0%,#2c3f57_35%,#c27a46_78%,#f2b06a_100%)]">
                  <div className="absolute inset-x-[12%] bottom-0 h-[46%] rounded-t-sm bg-abyss-950/80" />
                  <div className="absolute inset-x-[18%] bottom-[14%] h-[20%] rounded-xs bg-[#f6c27a]/70" />
                  <div className="scan absolute inset-y-0 w-px bg-white/60" />
                </div>
                <p className="mt-2 truncate text-small text-fg-muted">
                  {t.creative.prompt}
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="ws-progress h-full w-3/5 rounded-full bg-accent" />
                </div>
                <p className="mt-1.5 text-small text-fg-muted">
                  {t.creative.rendering}
                </p>
              </div>
            </Panel>

            {/* crédits partagés */}
            <Panel
              d={4}
              title={t.usage.title}
              className="hidden sm:flex lg:col-span-4"
            >
              <div className="p-3">
                <p className="text-small text-fg-muted">{t.usage.text}</p>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
                  <span className="h-full w-[28%] bg-accent" />
                  <span className="h-full w-[16%] bg-accent/70" />
                  <span className="h-full w-[12%] bg-accent/45" />
                  <span className="h-full w-[9%] bg-accent/25" />
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2">
                  {t.usage.items.map((item, i) => (
                    <li
                      key={item}
                      className="flex items-center gap-2 text-small text-fg-muted"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-xs bg-accent"
                        style={{ opacity: 1 - i * 0.25 }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-line pt-3 text-small text-fg-muted">
                  {t.usage.caps}
                </p>
              </div>
            </Panel>

            {/* votre ordinateur */}
            <Panel
              d={5}
              title={t.machine.title}
              className="lg:col-span-4"
              aside={
                <span className="rounded-xs border border-line px-1.5 py-0.5 text-[0.6875rem] text-fg-muted">
                  {t.machine.status}
                </span>
              }
            >
              <div className="p-3">
                <p className="text-small text-fg-muted">{t.machine.text}</p>
                <div className="mt-3 grid grid-cols-2 rounded-sm border border-line p-0.5 text-center text-small">
                  <span className="rounded-xs px-2 py-1 text-fg-muted">
                    {t.machine.cloud}
                  </span>
                  <span className="rounded-xs bg-surface-2 px-2 py-1 text-fg">
                    {t.machine.local}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-sm border border-dashed border-line px-3 py-2.5">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="size-5 shrink-0 text-fg-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 5h18v11H3zM8 20h8M12 16v4" />
                  </svg>
                  <span className="min-w-0 text-small text-fg-muted">
                    {t.machine.device}
                  </span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffLine({
  n,
  kind,
  line,
  d = 0,
}: {
  n: number;
  kind: "ctx" | "add" | "del";
  line: string;
  d?: number;
}) {
  return (
    <div
      style={{ "--d": d } as CSSProperties}
      className={cn(
        "flex whitespace-pre px-3",
        kind === "add" && "ws-type bg-ok-400/10 text-ok-400",
        kind === "del" &&
          "bg-alert-400/10 text-alert-400 line-through decoration-alert-400/40",
        kind === "ctx" && "text-fg-muted",
      )}
    >
      <span className="w-8 shrink-0 select-none opacity-60">
        {kind === "add" ? "+" : kind === "del" ? "−" : n}
      </span>
      <span>{line}</span>
    </div>
  );
}
