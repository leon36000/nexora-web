import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/cn";

/**
 * Logo de la marque, lu dans `web/src/lib/brand.ts` (un seul endroit à changer lors du changement de nom).
 *
 * Tant que le logo dessiné n'existe pas, le logo est TYPOGRAPHIQUE : la marque « signal » (un cadre de détection — deux
 * crochets d'angle — traversé par une ligne de balayage qui s'arrête sur un point de lumière), puis le nom en Geist et
 * le suffixe en JetBrains Mono (en Geist, « AI » se lirait « Al »). Aucun pixel, aucun « N ».
 *
 * `tone` choisit les couleurs indépendamment du thème :
 *  - "dark"  : fonds sombres (givre #f4f6f7, ion #1fcf80) ;
 *  - "light" : fonds clairs (graphite #1b1f23, ion foncé #0b7a4b) ;
 *  - "auto"  : suit la couleur de texte courante et l'accent du thème.
 *
 * Décoratif par défaut (le lien qui l'entoure porte le nom accessible) ; `label` en fait une image nommée.
 */
type Tone = "dark" | "light" | "auto";

const TONE: Record<Tone, { ink: string; ion: string }> = {
  dark: { ink: "#f4f6f7", ion: "#1fcf80" },
  light: { ink: "#1b1f23", ion: "#0b7a4b" },
  auto: { ink: "currentColor", ion: "var(--accent-graphic)" },
};

/** Géométrie de la marque « signal » (grille de 32 unités). Exportée pour l'icône et l'image Open Graph. */
export const SIGNAL_MARK = {
  viewBox: "0 0 32 32",
  /** Crochets d'angle (haut-gauche, bas-droite) : le cadre de détection. */
  brackets: "M4 12V4h8M28 20v8h-8",
  /** Ligne de balayage. */
  scan: "M4 16h17",
  /** Le point de lumière : ce qui est détecté, entendu, calculé. */
  point: { cx: 23.5, cy: 16, r: 3 },
} as const;

export function LogoMark({
  className,
  tone = "auto",
  label,
}: {
  className?: string;
  tone?: Tone;
  label?: string;
}) {
  const c = TONE[tone];
  const { point } = SIGNAL_MARK;
  return (
    <svg
      viewBox={SIGNAL_MARK.viewBox}
      focusable="false"
      className={cn("size-7 shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        d={SIGNAL_MARK.brackets}
        fill="none"
        stroke={c.ink}
        strokeWidth="2.25"
        strokeLinecap="square"
      />
      <path
        d={SIGNAL_MARK.scan}
        fill="none"
        stroke={c.ion}
        strokeWidth="2.25"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle
        cx={point.cx}
        cy={point.cy}
        r={point.r + 3}
        fill={c.ion}
        opacity="0.18"
      />
      <circle cx={point.cx} cy={point.cy} r={point.r} fill={c.ion} />
    </svg>
  );
}

export function Logo({
  tone = "auto",
  wordmark = true,
  label,
  className,
}: {
  tone?: Tone;
  /** Affiche le nom à côté de la marque. */
  wordmark?: boolean;
  /** Nom accessible, quand le logo n'est pas déjà décrit par un lien ou un titre voisin. */
  label?: string;
  className?: string;
}) {
  const logo = BRAND.logo;
  if (logo.kind === "svg") {
    return (
      // biome-ignore lint/performance/noImgElement: fichier SVG de marque servi tel quel (next/image refuse le SVG, D11)
      <img
        src={tone === "light" ? logo.light : logo.dark}
        alt={label ?? ""}
        className={cn("h-7 w-auto shrink-0", className)}
        style={{ aspectRatio: logo.ratio }}
      />
    );
  }
  if (!wordmark)
    return <LogoMark tone={tone} label={label} className={className} />;
  const c = TONE[tone];
  const classes = cn(
    "inline-flex shrink-0 items-center gap-2.5 leading-none",
    className,
  );
  const content = (
    <>
      <LogoMark tone={tone} className="size-7" />
      <span className="whitespace-nowrap font-display text-[1.3125rem] font-semibold tracking-[-0.035em]">
        {BRAND.wordmark.base}
        {/* une vraie espace : le nom lu (et comparé au nom accessible du lien) est « Nexora AI », pas « NexoraAI » */}
        {BRAND.wordmark.suffix ? " " : null}
        {BRAND.wordmark.suffix ? (
          <span
            className="align-[0.12em] font-mono text-[0.8125rem] font-medium tracking-[0.04em]"
            style={{ color: c.ion }}
          >
            {BRAND.wordmark.suffix}
          </span>
        ) : null}
      </span>
    </>
  );
  return label ? (
    <span
      role="img"
      aria-label={label}
      className={classes}
      style={{ color: c.ink }}
    >
      {content}
    </span>
  ) : (
    <span aria-hidden="true" className={classes} style={{ color: c.ink }}>
      {content}
    </span>
  );
}
