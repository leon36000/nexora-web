import type { VisualsDictionary } from "@/i18n/visuals";

const CAMERAS = [
  { x: 40, y: 44, cone: "M40 44 L150 20 L150 100 Z" },
  { x: 40, y: 196, cone: "M40 196 L150 170 L150 250 Z" },
  { x: 296, y: 30, cone: "M296 30 L186 10 L186 100 Z" },
] as const;

/**
 * Schéma de principe de Nexora Vision : l'analyse des images se fait sur un serveur du site ; les images ne le quittent
 * pas, seule une alerte écrite sort par le point de passage. Aucune reconnaissance faciale n'est dessinée.
 */
export function VisionDiagram({ t }: { t: VisualsDictionary["vision"] }) {
  return (
    <div className="theme-dark rounded-lg border border-line bg-bg p-4 sm:p-6">
      <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_13rem]">
        <svg
          viewBox="0 0 352 270"
          className="h-auto w-full"
          aria-hidden="true"
          focusable="false"
        >
          {/* Le site : un périmètre de carrés, ouvert par un point de passage à droite. */}
          <rect
            x="14"
            y="14"
            width="312"
            height="242"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeDasharray="7 9"
            className="text-fg-muted"
            opacity="0.7"
          />
          {CAMERAS.map((c) => (
            <g key={c.cone}>
              <path d={c.cone} fill="#ce411c" opacity="0.16" />
              <rect
                x={c.x - 6}
                y={c.y - 6}
                width="12"
                height="12"
                className="fill-fg"
              />
            </g>
          ))}
          {/* Zones surveillées. */}
          <rect
            x="132"
            y="150"
            width="86"
            height="64"
            fill="none"
            stroke="currentColor"
            strokeDasharray="4 4"
            className="text-fg-muted"
            opacity="0.8"
          />
          <rect
            x="96"
            y="40"
            width="70"
            height="46"
            fill="none"
            stroke="currentColor"
            strokeDasharray="4 4"
            className="text-fg-muted"
            opacity="0.8"
          />
          {/* Serveur sur place. */}
          <g>
            <rect
              x="238"
              y="168"
              width="64"
              height="70"
              className="fill-surface-2"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.95"
            />
            <rect
              x="248"
              y="180"
              width="44"
              height="8"
              className="fill-fg"
              opacity="0.7"
            />
            <rect
              x="248"
              y="196"
              width="44"
              height="8"
              className="fill-fg"
              opacity="0.45"
            />
            <rect
              x="248"
              y="212"
              width="12"
              height="12"
              className="fill-accent"
            />
          </g>
          {/* Liaisons caméras vers serveur : filets fins, à l'intérieur du périmètre. */}
          <path
            d="M40 196 H238 M40 44 V120 H270 V168 M296 30 V120"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            className="text-fg-muted"
            opacity="0.55"
          />
          {/* Point de passage : le seul trajet vers l'extérieur, réservé à l'alerte. */}
          <rect
            x="316"
            y="120"
            width="20"
            height="20"
            className="fill-accent"
          />
          <rect
            x="311"
            y="115"
            width="30"
            height="30"
            fill="none"
            className="stroke-accent"
            strokeWidth="1.4"
          />
          <path
            d="M270 130 H316"
            stroke="#ce411c"
            strokeWidth="3"
            strokeLinecap="square"
            className="pg-flow"
          />
        </svg>
        <div className="space-y-3 md:pl-1">
          <div className="rounded-md border border-accent/60 bg-surface p-3.5">
            <p className="font-mono text-label uppercase text-accent-text">
              {t.alert}
            </p>
            <p className="mt-1.5 text-small font-medium leading-snug text-fg">
              {t.event}
            </p>
          </div>
          <p className="text-small text-fg-muted">
            <span className="text-fg">{t.stays}.</span> {t.leaves}.
          </p>
        </div>
      </div>
      <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-small text-fg-muted">
        <li className="flex items-center gap-2">
          <span className="size-2.5 bg-fg" />
          {t.legend[0]}
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2.5 border border-dashed border-fg-muted" />
          {t.legend[1]}
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2.5 bg-accent" />
          {t.legend[2]}
        </li>
      </ul>
    </div>
  );
}
