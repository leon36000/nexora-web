import { cn } from "@/lib/cn";
import { LOGO } from "./logo-geometry";

/**
 * Logo Nexora AI : un « N » dessiné en pixels (deux montants d'encre, une diagonale en orange signal : le point de
 * passage contrôlé), puis le logotype « Nexora AI » dessiné en contours (Geist 500, avec un I à empattements pour
 * qu'on ne lise jamais « Al »). Aucun texte, aucune police à charger : le logo ne provoque aucun saut de mise en page.
 * Géométrie générée par `docs/marque/outils/build-marque.mjs` ; règles d'usage dans `docs/marque/charte.md`.
 *
 * `tone` choisit les couleurs indépendamment du thème :
 *  - "dark"  : pour les fonds sombres (os #F5F4EF, diagonale #FF5A1F, « AI » #FF7A45, 7,6:1) ;
 *  - "light" : pour les fonds clairs (graphite #121218, diagonale #F04A10, « AI » #B53A0A, 5,7:1) ;
 *  - "auto"  : suit la couleur de texte courante et les accents du thème de la section.
 *
 * Décoratif par défaut (le lien qui l'entoure porte le nom accessible) ; `label` en fait une image nommée.
 */
type Tone = "dark" | "light" | "auto";

type LogoProps = {
  tone?: Tone;
  /** Affiche le logotype à côté du symbole. */
  wordmark?: boolean;
  /** Nom accessible, quand le logo n'est pas déjà décrit par un lien ou un titre voisin. */
  label?: string;
  className?: string;
};

const TONE: Record<Tone, { ink: string; hot: string; ai: string }> = {
  dark: { ink: "#f5f4ef", hot: "#ff5a1f", ai: "#ff7a45" },
  light: { ink: "#121218", hot: "#f04a10", ai: "#b53a0a" },
  auto: {
    ink: "currentColor",
    hot: "var(--accent-graphic)",
    ai: "var(--accent-text)",
  },
};

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
  return (
    <svg
      viewBox={LOGO.symbolBox}
      focusable="false"
      className={cn("size-[1.75rem] shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path fill={c.ink} d={LOGO.bars} />
      <path fill={c.hot} d={LOGO.passage} />
    </svg>
  );
}

export function Logo({
  tone = "auto",
  wordmark = true,
  label,
  className,
}: LogoProps) {
  if (!wordmark)
    return <LogoMark tone={tone} label={label} className={className} />;
  const c = TONE[tone];
  return (
    <svg
      viewBox={LOGO.lockupBox}
      focusable="false"
      className={cn("h-7 w-auto shrink-0", className)}
      style={{ aspectRatio: LOGO.lockupRatio }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path fill={c.ink} d={LOGO.bars} />
      <path fill={c.hot} d={LOGO.passage} />
      <path fill={c.ink} d={LOGO.nexora} />
      <path fill={c.ai} d={LOGO.ai} />
    </svg>
  );
}
