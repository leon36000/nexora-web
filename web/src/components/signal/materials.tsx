import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { LightField } from "./light-field";

/**
 * Matières « Signal » en code (aucun fichier image) : forme d'onde, cadre de détection, décor de héros, pastille.
 * Toutes décoratives (`aria-hidden`), déterministes (même rendu côté serveur et client) et figées sous
 * `prefers-reduced-motion` (les animations sont déclarées dans globals.css sous `no-preference`).
 */

/** Amplitudes d'une forme d'onde de voix : rafales et silences, déterministes (aucun hasard au rendu). */
export function waveAmplitudes(n: number, seed = 1): number[] {
  return Array.from({ length: n }, (_, i) => {
    const x = i / n;
    const burst =
      0.5 +
      0.5 *
        Math.sin(x * Math.PI * (3 + (seed % 3)) + seed) *
        Math.sin(x * Math.PI * 1.3 + seed * 0.7);
    const fine = 0.5 + 0.5 * Math.sin(i * 2.17 + seed * 1.31);
    const env = Math.sin(Math.PI * Math.min(1, Math.max(0, x)));
    return Math.max(
      0.06,
      Math.min(1, env * (0.25 + 0.75 * burst) * (0.55 + 0.45 * fine)),
    );
  });
}

/** Forme d'onde (matière n° 3) : barres fines symétriques, en ion ; elles « parlent » quand le mouvement est permis. */
export function Waveform({
  bars = 64,
  seed = 1,
  animated = true,
  className,
  tone = "ion",
}: {
  bars?: number;
  seed?: number;
  animated?: boolean;
  className?: string;
  tone?: "ion" | "muted";
}) {
  const amps = waveAmplitudes(bars, seed);
  const gap = 2;
  const bw = 2;
  const width = bars * (bw + gap);
  return (
    <svg
      viewBox={`0 0 ${width} 48`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn(animated && "wave-animate", "block", className)}
    >
      {amps.map((a, i) => {
        const hgt = Math.max(2, a * 44);
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: barres fixes et ordonnées
            key={i}
            className="wave-bar"
            x={i * (bw + gap)}
            y={24 - hgt / 2}
            width={bw}
            height={hgt}
            rx={1}
            fill={tone === "ion" ? "var(--accent-graphic)" : "var(--fg-muted)"}
            opacity={0.35 + a * 0.65}
            style={
              {
                "--i": i,
                "--amp": (0.25 + (1 - a) * 0.5).toFixed(2),
              } as CSSProperties
            }
          />
        );
      })}
    </svg>
  );
}

/** Cadre de détection (matière n° 4) : crochets aux angles et libellé mono ; `hot` le passe en flare (alerte). */
export function DetectionBox({
  label,
  hot = false,
  className,
  style,
  delay = 0,
}: {
  label?: string;
  hot?: boolean;
  className?: string;
  style?: CSSProperties;
  delay?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("detect detect-animate absolute", className)}
      style={
        {
          ...style,
          "--detect-color": hot ? "var(--color-flare-500)" : undefined,
          "--d": delay,
        } as CSSProperties
      }
    >
      {label ? (
        <span
          className={cn(
            "label-mono absolute -top-5 left-0 whitespace-nowrap px-1 text-[0.625rem] leading-4",
            hot ? "bg-flare-500 text-abyss-950" : "bg-bg/85 text-accent-text",
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Décor des héros : grille de précision, champ de lumière (sauf `variant="grille"`), règle graduée et ligne de
 * balayage. Le parent doit être `relative` et rogner son débordement.
 */
export function SignalBackdrop({
  variant = "champ",
  animated = true,
  labels = [],
  className,
}: {
  variant?: "champ" | "grille" | "onde" | "detection";
  animated?: boolean;
  /** Libellés des cadres de détection (dictionnaire des visuels : `signal.detection`). */
  labels?: readonly string[];
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 -z-10", className)}
    >
      <div className="grid-precision absolute inset-0" />
      {variant === "champ" ? (
        <div className="absolute inset-x-0 bottom-0 top-[18%] [mask-image:linear-gradient(to_bottom,transparent,#000_30%,#000_80%,transparent)]">
          <LightField animated={animated} hotspot />
        </div>
      ) : null}
      {variant === "onde" ? (
        <div className="absolute inset-x-0 top-1/2 h-40 -translate-y-1/2 opacity-60 [mask-image:linear-gradient(to_right,transparent,#000_25%,#000_75%,transparent)] md:left-[38%]">
          <Waveform
            bars={96}
            seed={3}
            animated={animated}
            className="size-full"
          />
        </div>
      ) : null}
      {variant === "detection" ? (
        <div className="absolute inset-y-[14%] right-[4%] hidden w-[40%] md:block">
          <DetectionBox
            label={labels[0]}
            className="left-[8%] top-[18%] h-[38%] w-[30%]"
            delay={1}
          />
          <DetectionBox
            label={labels[1]}
            hot
            className="left-[52%] top-[44%] h-[34%] w-[22%]"
            delay={2}
          />
          <DetectionBox
            className="left-[30%] top-[70%] h-[20%] w-[16%]"
            delay={3}
          />
        </div>
      ) : null}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-graphic/60 to-transparent" />
      <div className="ruler absolute inset-x-0 bottom-0" />
      {animated ? (
        <div className="scan-loop absolute inset-0 overflow-hidden">
          <div className="scanline" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pastille d'un produit (remplace la mosaïque 5 × 5) : un petit spectre de cinq traits de lumière, dont les hauteurs
 * dépendent de la graine ; un seul trait est plus vif. Décorative.
 */
export function SignalGlyph({
  seed = 1,
  className,
}: {
  seed?: number;
  className?: string;
}) {
  const hs = Array.from(
    { length: 5 },
    (_, i) => 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(seed * 1.7 + i * 1.9)),
  );
  const peak = hs.indexOf(Math.max(...hs));
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={cn(
        "size-10 shrink-0 rounded-sm border border-line bg-surface p-2",
        className,
      )}
    >
      {hs.map((v, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: traits fixes
          key={i}
          x={1.5 + i * 3.6}
          y={10 - v * 8}
          width={1.6}
          height={v * 16}
          rx={0.8}
          fill="var(--accent-graphic)"
          opacity={i === peak ? 1 : 0.4}
        />
      ))}
    </svg>
  );
}

/**
 * Emplacement d'image stable : garde son rapport et, tant que le fichier n'existe pas, montre une matière en code
 * (dégradé de lumière ion, grille de précision, champ ou onde) au lieu d'une image cassée.
 */
export function MediaPlaceholder({
  material = "champ",
  className,
  children,
}: {
  material?: "champ" | "onde" | "detection" | "infra" | "grille";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      aria-hidden={children ? undefined : true}
      className={cn(
        "relative isolate overflow-hidden bg-surface-2",
        "bg-[radial-gradient(80%_60%_at_70%_20%,rgb(255_102_0/0.16),transparent_70%),radial-gradient(60%_50%_at_10%_100%,rgb(255_102_0/0.08),transparent_70%)]",
        className,
      )}
    >
      <div className="grid-precision absolute inset-0 opacity-80" />
      {material === "champ" ? (
        <div className="absolute inset-0 top-[30%]">
          <LightField cols={56} animated={false} />
        </div>
      ) : null}
      {material === "onde" ? (
        <div className="absolute inset-x-[8%] top-1/2 h-1/3 -translate-y-1/2">
          <Waveform bars={48} seed={5} animated={false} className="size-full" />
        </div>
      ) : null}
      {material === "detection" ? (
        <>
          <DetectionBox className="left-[14%] top-[22%] h-[42%] w-[34%]" />
          <DetectionBox hot className="left-[56%] top-[48%] h-[30%] w-[24%]" />
        </>
      ) : null}
      {material === "infra" ? <RackLines /> : null}
      {children}
    </div>
  );
}

/** Façade de baie en lignes de lumière : unités de serveur, voyants (placeholder des photos d'infrastructure). */
function RackLines() {
  const units = Array.from({ length: 14 }, (_, i) => i);
  return (
    <svg
      viewBox="0 0 200 250"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className="absolute inset-[12%] size-[76%]"
    >
      <rect
        x="40"
        y="10"
        width="120"
        height="230"
        rx="3"
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth="1"
      />
      {units.map((u) => (
        <g key={u}>
          <rect
            x="48"
            y={18 + u * 15.6}
            width="104"
            height="11"
            rx="1.5"
            fill="var(--fg)"
            fillOpacity={0.03}
            stroke="var(--line)"
            strokeWidth="0.75"
          />
          <rect
            x="54"
            y={22 + u * 15.6}
            width={22 + ((u * 37) % 40)}
            height="1.2"
            fill="var(--accent-graphic)"
            opacity={0.25 + ((u * 13) % 7) / 10}
          />
          <circle
            cx="144"
            cy={23.5 + u * 15.6}
            r="1.4"
            fill={u === 9 ? "var(--color-flare-500)" : "var(--accent-graphic)"}
            opacity={u === 9 ? 1 : 0.8}
          />
        </g>
      ))}
    </svg>
  );
}
