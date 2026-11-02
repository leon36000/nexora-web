import { PerimeterDiagram } from "@/components/brand/perimeter-grid";
import type { Lang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { getVisualsDictionary } from "@/i18n/visuals";
import type { SectionVisual } from "@/server/cms/model";
import { CommitmentsMap } from "./commitments";
import { DashboardMock } from "./dashboard";
import { FlowEditorMock } from "./flow-editor";
import { VisualFigure } from "./frame";
import { GrowthDiagram } from "./growth";
import { ModelCatalogMock } from "./model-catalog";
import {
  InfrastructureDiagram,
  ReceptionMock,
  SurveillanceMock,
} from "./signal";
import { VisionDiagram } from "./vision";
import { VpsConsoleMock } from "./vps-console";
import { WorkspaceMock } from "./workspace";

type Shown = Exclude<SectionVisual, "aucun">;

const DIAGRAM_MODE = {
  "perimetre-sur-place": "onsite",
  "perimetre-heberge": "hosted",
  "flux-donnees": "flow",
} as const;

/** Légende en HTML sous un schéma de périmètre : ce que représentent les carrés (le dessin seul ne porte aucun sens). */
function DiagramLegend({ items }: { items: string[] }) {
  const swatch = ["bg-fg", "border border-fg", "bg-accent"];
  return (
    <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-small text-fg-muted">
      {items.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span className={`size-2.5 shrink-0 ${swatch[i] ?? "bg-fg"}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Illustration d'un bloc `section` (champ `visual` du CMS) : schémas de périmètre, maquettes d'interface produit
 * (WorkStudio, catalogue, console VPS, tableau de bord) et schémas de principe (Vision, Croissance, engagements).
 * Le texte alternatif vient du dictionnaire du CMS ; les textes de maquette, du dictionnaire des visuels.
 */
export function SectionVisualFigure({
  visual,
  lang,
}: {
  visual: Shown;
  lang: Lang;
}) {
  const alt = getDictionary(lang).cms.visuals[visual];
  const v = getVisualsDictionary(lang);
  switch (visual) {
    case "perimetre-sur-place":
    case "perimetre-heberge":
    case "flux-donnees": {
      const mode = DIAGRAM_MODE[visual];
      return (
        <VisualFigure alt={alt}>
          <div className="tex-dots rounded-md border border-line bg-bg px-4 py-6 sm:px-6 sm:py-8">
            <PerimeterDiagram mode={mode} />
            <DiagramLegend
              items={
                v.legend[
                  mode === "onsite"
                    ? "onsite"
                    : mode === "hosted"
                      ? "hosted"
                      : "flow"
                ]
              }
            />
          </div>
        </VisualFigure>
      );
    }
    case "espace-de-travail":
      return (
        <VisualFigure alt={alt} caption={v.caption.mock}>
          <WorkspaceMock t={v.workspace} />
        </VisualFigure>
      );
    case "flux-workstudio":
      return (
        <VisualFigure alt={alt} caption={v.caption.mock} stage="braise">
          <FlowEditorMock t={v.flow} />
        </VisualFigure>
      );
    case "catalogue-modeles":
      return (
        <VisualFigure alt={alt} caption={v.caption.mock} stage="ciel">
          <ModelCatalogMock t={v.catalog} />
        </VisualFigure>
      );
    case "console-vps":
      return (
        <VisualFigure alt={alt} caption={v.caption.mock} stage="or">
          <VpsConsoleMock t={v.vps} />
        </VisualFigure>
      );
    case "tableau-de-bord":
      return (
        <VisualFigure alt={alt} caption={v.caption.mock} stage="menthe">
          <DashboardMock t={v.dashboard} />
        </VisualFigure>
      );
    case "vision-sur-place":
      return (
        <VisualFigure alt={alt} caption={v.caption.concept}>
          <VisionDiagram t={v.vision} />
        </VisualFigure>
      );
    case "croissance-canaux":
      return (
        <VisualFigure alt={alt} caption={v.caption.concept}>
          <GrowthDiagram t={v.growth} />
        </VisualFigure>
      );
    case "engagements-donnees":
      return (
        <VisualFigure alt={alt}>
          <CommitmentsMap t={v.commitments} />
        </VisualFigure>
      );
    case "signal-accueil":
      return (
        <VisualFigure alt={alt} caption={v.caption.mock} stage="nuit">
          <ReceptionMock t={v.signal.reception} />
        </VisualFigure>
      );
    case "signal-surveillance":
      return (
        <VisualFigure alt={alt} caption={v.caption.mock} stage="nuit">
          <SurveillanceMock t={v.signal.surveillance} />
        </VisualFigure>
      );
    case "signal-infrastructure":
      return (
        <VisualFigure alt={alt} caption={v.caption.concept}>
          <InfrastructureDiagram t={v.signal.infrastructure} />
        </VisualFigure>
      );
  }
}
