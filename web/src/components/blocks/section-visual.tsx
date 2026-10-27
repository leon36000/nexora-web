import { PerimeterDiagram } from "@/components/brand/perimeter-grid";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { SectionVisual } from "@/server/cms/model";

const MODE = {
  "perimetre-sur-place": "onsite",
  "perimetre-heberge": "hosted",
  "flux-donnees": "flow",
} as const;

/**
 * Schéma de section : SVG construit à partir de la grille de périmètre. Le dessin est décoratif
 * (`aria-hidden`) ; c'est le conteneur `role="img"` qui porte le texte alternatif traduit (dictionnaire).
 */
export function SectionVisualFigure({
  visual,
  t,
}: {
  visual: Exclude<SectionVisual, "aucun">;
  t: Dictionary["cms"]["visuals"];
}) {
  return (
    <figure className="m-0">
      <div
        role="img"
        aria-label={t[visual]}
        className="rounded-md border border-line bg-bg px-4 py-6 sm:px-6 sm:py-8"
      >
        <PerimeterDiagram mode={MODE[visual]} />
      </div>
    </figure>
  );
}
