import { cn } from "@/lib/cn";

/**
 * Logo Nexora : trois barres inclinées (orange Nexora #CE411C) + mot-symbole « nexora » en Geist 500.
 * Les barres reprennent la géométrie de l'icône d'origine (NexoraWeb/web/src/app/icon.svg).
 *
 * `tone` choisit la couleur du mot-symbole indépendamment du thème :
 *  - "dark"  : pour les fonds sombres (texte os #F4F1EA) ;
 *  - "light" : pour les fonds clairs (texte forêt #17221E) ;
 *  - "auto"  : suit la couleur de texte courante (thème de la section).
 * Les barres gardent l'orange sur les deux fonds (3,9:1 sur sombre, 4,8:1 sur clair : graphisme >= 3:1).
 */
type LogoProps = {
  tone?: "dark" | "light" | "auto";
  /** Affiche le mot-symbole à côté des barres. */
  wordmark?: boolean;
  className?: string;
};

const TONE_CLASS = {
  dark: "text-bone",
  light: "text-forest-900",
  auto: "text-fg",
} as const;

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="6 12 46 40"
      aria-hidden="true"
      focusable="false"
      className={cn("h-[1.6em] w-auto shrink-0", className)}
    >
      <g fill="#ce411c" transform="translate(7 0) skewX(-12)">
        <rect x="12" y="14" width="8" height="36" />
        <rect x="25" y="23" width="8" height="18" />
        <rect x="38" y="14" width="8" height="36" />
      </g>
    </svg>
  );
}

export function Logo({ tone = "auto", wordmark = true, className }: LogoProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-display text-[1.375rem] font-medium leading-none tracking-[-0.03em]",
        TONE_CLASS[tone],
        className,
      )}
    >
      <LogoMark />
      {wordmark ? <span>nexora</span> : null}
    </span>
  );
}
