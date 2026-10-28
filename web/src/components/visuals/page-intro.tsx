import type { ReactNode } from "react";
import type { MosaicPalette } from "@/components/brand/mosaic";
import { Stage } from "./frame";

/**
 * En-tête de page à deux colonnes : le texte à gauche, une maquette de l'interface concernée à droite (sous le texte
 * en mobile), posée sur une scène colorée (`stage`) quand une teinte est donnée.
 */
export function PageIntro({
  children,
  visual,
  stage,
}: {
  children: ReactNode;
  visual: ReactNode;
  stage?: MosaicPalette;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
      <div>{children}</div>
      <div className="min-w-0">
        {stage && visual ? <Stage palette={stage}>{visual}</Stage> : visual}
      </div>
    </div>
  );
}
