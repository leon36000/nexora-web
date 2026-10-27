import { Badge } from "@/components/ui/badge";
import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";
import { Chip, Window } from "./frame";

type Kind = "trigger" | "agent" | "check" | "approval" | "action";
const ORDER: Kind[] = ["trigger", "agent", "check", "approval", "action"];
const SELECTED: Kind = "approval";

/** Pictogrammes d'étape : des carrés et des filets, dans la grammaire de la grille de périmètre. */
function Glyph({ kind }: { kind: Kind }) {
  const common = "size-5 shrink-0";
  switch (kind) {
    case "trigger":
      return (
        <svg viewBox="0 0 20 20" className={common} aria-hidden="true">
          <path
            d="M3 3h14v14H3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M3 10h6" stroke="currentColor" strokeWidth="1.6" />
          <rect x="9" y="7" width="6" height="6" fill="#ce411c" />
        </svg>
      );
    case "agent":
      return (
        <svg viewBox="0 0 20 20" className={common} aria-hidden="true">
          <rect x="3" y="3" width="6" height="6" fill="currentColor" />
          <rect
            x="11"
            y="3"
            width="6"
            height="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <rect
            x="3"
            y="11"
            width="6"
            height="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <rect x="11" y="11" width="6" height="6" fill="currentColor" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 20 20" className={common} aria-hidden="true">
          <path
            d="M3 3h14v14H3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="m6.5 10.5 2.5 2.5 4.5-5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "approval":
      return (
        <svg viewBox="0 0 20 20" className={common} aria-hidden="true">
          <rect x="7" y="2.5" width="6" height="6" fill="#ce411c" />
          <path
            d="M3.5 17.5v-3.5h13v3.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 20 20" className={common} aria-hidden="true">
          <path
            d="M3 3h5M3 17h5M3 3v14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M8 10h9m-3.5-3.5L17 10l-3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );
  }
}

/**
 * Maquette de l'éditeur de flux de Nexora WorkStudio : un flux de facture dont l'écriture en comptabilité attend
 * l'approbation d'une personne (la garde centrale du produit), l'étape sélectionnée et son journal.
 */
export function FlowEditorMock({ t }: { t: VisualsDictionary["flow"] }) {
  return (
    <Window title={`${t.window} · ${t.name}`} status={<Chip>{t.state}</Chip>}>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_13.5rem]">
        <ol className="tex-dots relative space-y-0 px-5 py-6 sm:px-8">
          {ORDER.map((kind, i) => {
            const node = t.nodes[kind];
            const selected = kind === SELECTED;
            return (
              <li key={kind} className="relative">
                <div
                  className={cn(
                    "relative flex items-center gap-3.5 rounded-md border bg-surface-2 p-3.5",
                    selected
                      ? "ring-soft border-accent bg-surface-2"
                      : "border-line",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-sm border",
                      selected
                        ? "border-accent/60 text-fg"
                        : "border-line text-fg-muted",
                    )}
                  >
                    <Glyph kind={kind} />
                  </span>
                  <span className="min-w-0">
                    <Badge className="text-[0.6875rem]">{t.kinds[kind]}</Badge>
                    <span className="mt-0.5 block text-[0.9375rem] font-medium leading-snug text-fg">
                      {node.title}
                    </span>
                    <span className="block text-small text-fg-muted">
                      {node.sub}
                    </span>
                  </span>
                </div>
                {i < ORDER.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="flow-line mx-auto block h-5 w-0.5"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
        <aside className="hidden border-l border-line bg-surface p-4 sm:block">
          <p className="font-mono text-label uppercase text-fg-muted">
            {t.inspector.title}
          </p>
          <dl className="mt-3 space-y-2.5">
            {t.inspector.fields.map(([k, v]) => (
              <div key={k}>
                <dt className="text-small text-fg-muted">{k}</dt>
                <dd className="text-small font-medium text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 border-t border-line pt-4 font-mono text-label uppercase text-fg-muted">
            {t.inspector.logTitle}
          </p>
          <ul className="mt-3 space-y-2">
            {t.inspector.log.map((line, i) => {
              const done = i < t.inspector.log.length - 1;
              return (
                <li
                  key={line}
                  className="flex items-center gap-2 text-small text-fg-muted"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0",
                      done ? "bg-success" : "bg-accent",
                    )}
                  />
                  {line}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </Window>
  );
}
