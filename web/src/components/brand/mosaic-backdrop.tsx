import { cn } from "@/lib/cn";
import { Mosaic, type MosaicPalette } from "./mosaic";

type Shape = "wide" | "compact";

/**
 * Décor des héros, des bandeaux et des fenêtres vides : la grille de mesure (filets tous les 4 rem, qui s'efface vers
 * les bords), la mosaïque braise qui se dissout vers la gauche (hors de la colonne du texte) et, quand le mouvement
 * est permis, une ligne de balayage qui traverse lentement. Décoratif (`aria-hidden` côté appelant ou ici) :
 * le contenu ne dépend jamais du dessin. Le conteneur parent doit être `relative` et rogner son débordement.
 *
 *  - "wide" : fond de héros sur grand écran (mosaïque sur la moitié droite) ;
 *  - "compact" : composition propre au mobile, un bandeau sous le texte.
 */
export function MosaicBackdrop({
  shape = "wide",
  animated = true,
  palette = "braise",
  seed = 3,
  rows,
  className,
}: {
  shape?: Shape;
  animated?: boolean;
  palette?: MosaicPalette;
  seed?: number;
  /** Rangées de la mosaïque large : plus il y en a, plus les carrés sont petits (bandeaux bas : 14 ; héros : 26). */
  rows?: number;
  className?: string;
}) {
  if (shape === "compact") {
    return (
      <div
        aria-hidden="true"
        className={cn("relative h-full w-full overflow-hidden", className)}
      >
        <Mosaic
          cols={26}
          rows={10}
          seed={seed}
          palette={palette}
          toward="right"
          fade={0.85}
          animated={animated}
          className="size-full"
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none relative h-full w-full", className)}
    >
      <div className="tex-grid absolute inset-0 opacity-70" />
      <div className="absolute inset-y-0 right-0 w-[46%] [-webkit-mask-image:linear-gradient(to_right,transparent,#000_30%)] [mask-image:linear-gradient(to_right,transparent,#000_30%)]">
        <Mosaic
          cols={24}
          rows={rows ?? 26}
          seed={seed}
          palette={palette}
          toward="right"
          fade={1}
          animated={animated}
          className="size-full"
        />
      </div>
      {animated ? (
        <div className="absolute inset-0 overflow-hidden">
          <div className="scan absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-accent-graphic to-transparent opacity-60" />
        </div>
      ) : null}
    </div>
  );
}
