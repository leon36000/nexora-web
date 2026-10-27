import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;

function Glyph({ i }: { i: number }) {
  const common = "size-8 shrink-0 text-fg";
  switch (i) {
    case 0: // serveur : deux boîtes empilées
      return (
        <svg viewBox="0 0 32 32" className={common} aria-hidden="true">
          <rect x="5" y="5" width="22" height="10" {...S} />
          <rect x="5" y="17" width="22" height="10" {...S} />
          <rect x="9" y="8.5" width="4" height="3" fill="#ce411c" />
          <rect x="9" y="20.5" width="4" height="3" fill="currentColor" />
        </svg>
      );
    case 1: // carte : un cadre et un repère
      return (
        <svg viewBox="0 0 32 32" className={common} aria-hidden="true">
          <rect x="5" y="5" width="22" height="22" {...S} />
          <path d="M5 16h22M16 5v22" {...S} opacity="0.45" />
          <rect x="17" y="17" width="7" height="7" fill="#ce411c" />
        </svg>
      );
    case 2: // jamais pour entraîner : un document barré
      return (
        <svg viewBox="0 0 32 32" className={common} aria-hidden="true">
          <rect x="7" y="4" width="18" height="24" {...S} />
          <path d="M11 11h10M11 16h10M11 21h6" {...S} opacity="0.5" />
          <path d="M4 28 28 4" stroke="#ce411c" strokeWidth="2.2" fill="none" />
        </svg>
      );
    case 3: // jamais vendues : un symbole barré
      return (
        <svg viewBox="0 0 32 32" className={common} aria-hidden="true">
          <rect x="5" y="5" width="22" height="22" {...S} />
          <path
            d="M20 11.5c-1-1.4-2.6-2-4-2-2.2 0-3.6 1.2-3.6 2.8 0 4 8 2.2 8 6.4 0 1.8-1.6 3-4.2 3-1.8 0-3.4-.8-4.2-2M16 7.5v17"
            {...S}
          />
          <path d="M4 28 28 4" stroke="#ce411c" strokeWidth="2.2" fill="none" />
        </svg>
      );
    default: // accord écrit : le seuil ouvert avec son carré
      return (
        <svg viewBox="0 0 32 32" className={common} aria-hidden="true">
          <path d="M5 13V5h22v22H5v-8" {...S} />
          <rect x="11" y="12" width="8" height="8" fill="#ce411c" />
        </svg>
      );
  }
}

/** Les cinq engagements sur les données, en tuiles : sur place, au Québec, jamais pour entraîner, jamais vendues, accord écrit. */
export function CommitmentsMap({ t }: { t: VisualsDictionary["commitments"] }) {
  return (
    <div className="theme-dark rounded-lg border border-line bg-bg p-3 sm:p-4">
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
        {t.items.map((item, i) => (
          <li
            key={item.title}
            className={cn(
              "rounded-md border border-line bg-surface p-4",
              i < 2 ? "sm:col-span-3" : "sm:col-span-2",
              i === 0 && "wash-dark",
              i === 4 && "col-span-2 sm:col-span-2",
            )}
          >
            <Glyph i={i} />
            <p className="mt-3 font-display text-h4 text-fg">{item.title}</p>
            <p className="mt-1 text-small text-fg-muted">{item.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
