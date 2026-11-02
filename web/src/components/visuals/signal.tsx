import { DetectionBox, Waveform } from "@/components/signal/materials";
import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";
import { Chip, Window } from "./frame";

type T = VisualsDictionary["signal"];

/** Pictogramme du canal d'une conversation (appel, courriel, texto), dessiné au trait. */
function ChannelIcon({ kind }: { kind: "call" | "email" | "sms" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-4 shrink-0 text-accent-text"
    >
      {kind === "call" ? (
        <path
          d="M4 2.5h2l1 3-1.5 1a7 7 0 0 0 4 4l1-1.5 3 1v2A1.5 1.5 0 0 1 12 13.5 10 10 0 0 1 2.5 4 1.5 1.5 0 0 1 4 2.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ) : kind === "email" ? (
        <path
          d="M2 4h12v8H2zM2 4l6 5 6-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ) : (
        <path
          d="M2.5 3h11v7.5H7L4 13v-2.5H2.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      )}
    </svg>
  );
}

/** Maquette de la réception virtuelle : un appel en cours (onde, transcription) et le fil des conversations traitées. */
export function ReceptionMock({ t }: { t: T["reception"] }) {
  return (
    <Window
      title={t.window}
      status={
        <Chip tone="success">
          <span className="live-dot size-1.5 rounded-full bg-success text-success" />
          {t.live}
        </Chip>
      }
    >
      <div className="@container">
        <div className="grid gap-px bg-line @2xl:grid-cols-[1.15fr_1fr]">
          <div className="min-w-0 bg-bg p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-small font-medium text-fg">
                <ChannelIcon kind="call" />
                {t.call.title}
              </span>
              <span className="label-mono tabular whitespace-nowrap text-fg-muted">
                {t.call.time}
              </span>
            </div>
            <div className="mt-4 h-14 rounded-md border border-line bg-surface/60 px-3 py-2">
              <Waveform bars={56} seed={2} className="size-full" />
            </div>
            <ol className="mt-4 space-y-2.5 text-small">
              {t.call.lines.map((l) => (
                <li
                  key={l.text}
                  className={cn(
                    "max-w-[92%] rounded-md px-3 py-2",
                    l.who === "ai"
                      ? "ml-auto border border-accent-graphic/30 bg-accent-graphic/[0.07] text-fg"
                      : "border border-line bg-surface text-fg-muted",
                  )}
                >
                  <span className="label-mono mb-0.5 block text-[0.625rem] text-fg-muted">
                    {l.who === "ai" ? t.call.ai : t.call.caller}
                  </span>
                  {l.text}
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0 bg-bg p-4 sm:p-5">
            <p className="label-mono text-fg-muted">{t.feed.title}</p>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {t.feed.items.map((it) => (
                <li key={it.who} className="flex items-start gap-3 py-3">
                  <ChannelIcon kind={it.channel as "call" | "email" | "sms"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-medium text-fg">
                      {it.who}
                    </p>
                    <p className="truncate text-small text-fg-muted">
                      {it.summary}
                    </p>
                  </div>
                  <Chip tone={it.done ? "success" : "accent"}>{it.state}</Chip>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Window>
  );
}

/** Allée d'entrepôt vue par une caméra : lignes de fuite, rayonnages, aucun visage ni personne reconnaissable. */
function WarehouseScene() {
  return (
    <svg
      viewBox="0 0 400 225"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id="sv-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1622" />
          <stop offset="1" stopColor="#05070b" />
        </linearGradient>
        <radialGradient id="sv-light" cx="0.5" cy="0.2" r="0.6">
          <stop offset="0" stopColor="rgb(62 200 255 / 0.18)" />
          <stop offset="1" stopColor="rgb(62 200 255 / 0)" />
        </radialGradient>
      </defs>
      <rect width="400" height="225" fill="url(#sv-floor)" />
      <rect width="400" height="225" fill="url(#sv-light)" />
      {/* lignes de fuite du sol et des rayonnages */}
      {[-260, -170, -90, 90, 170, 260].map((x) => (
        <line
          key={x}
          x1={200}
          y1={78}
          x2={200 + x * 1.6}
          y2={225}
          stroke="rgb(140 151 170 / 0.25)"
          strokeWidth="0.8"
        />
      ))}
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const y = 82 + k * k * 4.6 + k * 8;
        const half = 20 + (y - 78) * 1.35;
        return (
          <g key={k}>
            <line
              x1={200 - half}
              y1={y}
              x2={200 - half * 0.62}
              y2={y}
              stroke="rgb(140 151 170 / 0.22)"
              strokeWidth="0.8"
            />
            <line
              x1={200 + half * 0.62}
              y1={y}
              x2={200 + half}
              y2={y}
              stroke="rgb(140 151 170 / 0.22)"
              strokeWidth="0.8"
            />
          </g>
        );
      })}
      {/* rayonnages */}
      <path
        d="M30 40 L150 78 L150 160 L30 225 Z M370 40 L250 78 L250 160 L370 225 Z"
        fill="rgb(17 23 35 / 0.7)"
        stroke="rgb(140 151 170 / 0.3)"
        strokeWidth="0.8"
      />
      {[0, 1, 2, 3].map((k) => (
        <g key={k} stroke="rgb(140 151 170 / 0.28)" strokeWidth="0.7">
          <line x1="30" y1={70 + k * 40} x2="150" y2={95 + k * 18} />
          <line x1="370" y1={70 + k * 40} x2="250" y2={95 + k * 18} />
        </g>
      ))}
      {/* silhouette générique (forme simple, sans traits) */}
      <path
        d="M226 118 a7 7 0 1 1 0.1 0 Z M216 130 h20 l3 34 h-8 l-2 22 h-6 l-2 -22 h-8 Z"
        fill="rgb(238 243 250 / 0.22)"
      />
    </svg>
  );
}

/** Maquette de la surveillance IA : image de caméra, cadres de détection, alerte et chronologie des événements. */
export function SurveillanceMock({ t }: { t: T["surveillance"] }) {
  return (
    <Window
      title={t.window}
      status={
        <Chip tone="plain">
          <span className="live-dot size-1.5 rounded-full bg-flare text-flare" />
          {t.live}
        </Chip>
      }
    >
      <div className="@container">
        <div className="grid gap-px bg-line @3xl:grid-cols-[1.5fr_1fr]">
          <div className="min-w-0 bg-bg">
            <div className="relative aspect-video overflow-hidden">
              <WarehouseScene />
              <DetectionBox
                label={t.boxes[0]}
                hot
                className="left-[50%] top-[46%] h-[42%] w-[16%]"
                delay={1}
              />
              <DetectionBox
                label={t.boxes[1]}
                className="left-[9%] top-[24%] h-[56%] w-[26%]"
                delay={2}
              />
              <span className="label-mono absolute left-3 top-3 rounded-xs bg-abyss-950/80 px-1.5 py-0.5 text-[0.625rem] text-fg">
                {t.camera}
              </span>
              <span className="label-mono tabular absolute right-3 top-3 rounded-xs bg-abyss-950/80 px-1.5 py-0.5 text-[0.625rem] text-fg-muted">
                {t.timestamp}
              </span>
            </div>
            <div className="border-t border-line p-4">
              <div className="flex items-center justify-between">
                <span className="label-mono text-fg-muted">{t.timeline}</span>
                <span className="label-mono text-fg-muted">{t.range}</span>
              </div>
              <div className="relative mt-3 h-10">
                {/* carte de chaleur de l'activité */}
                <div className="absolute inset-x-0 top-0 flex h-4 gap-px overflow-hidden rounded-xs">
                  {Array.from({ length: 48 }, (_, i) => {
                    const v =
                      0.08 +
                      0.9 *
                        Math.max(
                          0,
                          Math.sin(i * 0.31) * Math.sin(i * 0.13 + 1) ** 2,
                        );
                    return (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: cases fixes
                        key={i}
                        className="flex-1"
                        style={{
                          background:
                            i === 30
                              ? "var(--color-flare-500)"
                              : `rgb(62 200 255 / ${v.toFixed(2)})`,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="absolute inset-x-0 bottom-1 h-px bg-line-strong" />
                {[0.18, 0.41, 0.63, 0.86].map((p, i) => (
                  <span
                    key={p}
                    className={cn(
                      "absolute bottom-0 h-2.5 w-px",
                      i === 2 ? "bg-flare" : "bg-accent-graphic",
                    )}
                    style={{ left: `${p * 100}%` }}
                  />
                ))}
                <span className="playhead playhead-animate absolute -top-1 bottom-0 w-px bg-fg/80" />
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-px bg-line">
            <div className="bg-bg p-4">
              <p className="label-mono text-flare">{t.alert.label}</p>
              <p className="mt-2 text-small font-medium text-fg">
                {t.alert.title}
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {t.alert.channels.map((c) => (
                  <li key={c}>
                    <Chip>{c}</Chip>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1 bg-bg p-4">
              <p className="label-mono text-fg-muted">{t.report.label}</p>
              <ol className="mt-3 space-y-2.5">
                {t.report.items.map((r) => (
                  <li key={r.time} className="flex gap-3 text-small">
                    <span className="label-mono tabular w-12 shrink-0 pt-0.5 text-fg-muted">
                      {r.time}
                    </span>
                    <span className="text-fg">{r.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

/** Schéma de l'infrastructure : la même pile (modèles, applications, sécurité, supervision), chez vous ou chez nous. */
export function InfrastructureDiagram({ t }: { t: T["infrastructure"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
      {[t.onsite, t.hosted].map((side, i) => (
        <div
          key={side.title}
          className={cn(
            "relative overflow-hidden rounded-lg border border-line bg-surface/70 p-5",
            i === 1 && "md:order-3",
          )}
        >
          <p className="label-mono text-accent-text">{side.label}</p>
          <p className="mt-2 font-display text-h4 text-fg">{side.title}</p>
          <ul className="mt-4 space-y-2">
            {side.items.map((it) => (
              <li
                key={it}
                className="flex items-center gap-2.5 text-small text-fg-muted"
              >
                <span className="size-1 shrink-0 rounded-full bg-accent-graphic" />
                {it}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="flex flex-col justify-center gap-2 md:order-2 md:w-52">
        {t.stack.map((layer, i) => (
          <div
            key={layer}
            className={cn(
              "rounded-md border px-3 py-2.5 text-center text-small",
              i === 0
                ? "border-accent-graphic/50 bg-accent-graphic/10 text-fg"
                : "border-line bg-bg text-fg-muted",
            )}
          >
            {layer}
          </div>
        ))}
      </div>
    </div>
  );
}
