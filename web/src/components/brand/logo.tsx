import { cn } from "@/lib/cn";
import { LOGO } from "./logo-geometry";

/**
 * Logo Nexora AI : deux périmètres carrés qui se recouvrent (le vôtre, le nôtre), leur intersection en orange
 * Nexora #CE411C (le point de passage contrôlé, jamais une fuite), puis le logotype « Nexora AI » dessiné en
 * contours (Geist 500, avec un I à empattements pour qu'on ne lise jamais « Al »). Aucun texte, aucune police à
 * charger : le logo ne provoque aucun saut de mise en page. Géométrie générée par
 * `docs/marque/outils/build-marque.mjs` ; règles d'usage dans `docs/marque/charte.md`.
 *
 * `tone` choisit les couleurs indépendamment du thème :
 *  - "dark"  : pour les fonds sombres (os #F4F1EA, « AI » #F07A52, 6,7:1) ;
 *  - "light" : pour les fonds clairs (forêt #17221E, « AI » #B83A18, 5,4:1) ;
 *  - "auto"  : suit la couleur de texte courante et l'accent du thème de la section.
 * L'intersection garde l'orange sur tous les fonds (graphisme : 3,9:1 sur sombre, 4,8:1 sur clair, au-delà des 3:1).
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

const TONE: Record<Tone, { ink: string; ai: string }> = {
  dark: { ink: "#f4f1ea", ai: "#f07a52" },
  light: { ink: "#17221e", ai: "#b83a18" },
  auto: { ink: "currentColor", ai: "var(--accent-text)" },
};

const EMBER = "#ce411c";

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
      <path fill={c.ink} d={LOGO.squares} />
      <path fill={EMBER} d={LOGO.overlap} />
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
      <path fill={c.ink} d={LOGO.squares} />
      <path fill={EMBER} d={LOGO.overlap} />
      <path fill={c.ink} d={LOGO.nexora} />
      <path fill={c.ai} d={LOGO.ai} />
    </svg>
  );
}
