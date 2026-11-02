import type { Block, Tone } from "@/server/cms/model";

/**
 * Ton CMS -> propriétés de <Section>. Le site public est clair par défaut (papier, thème « Signal clair ») ; seules
 * les bandes de vitrine (héros plein écran, vidéo, cartes vitrine, appel à l'action final) restent sombres pour
 * donner du rythme : un ton « sombre » du CMS sur un bloc qui n'est pas une vitrine devient une bande claire.
 * clair = papier ; sable = surface blanche relevée.
 */
export type SurfaceTone = "dark" | "light";

/** Surface réellement rendue d'un bloc : "dark" (vitrine), "light" (papier) ou "light-surface" (bande blanche). */
export type EffectiveTone = "dark" | "light" | "light-surface";

/** Un bloc reste sombre seulement s'il met en scène une vidéo ou une vitrine (ou s'il clôt la page). */
export function effectiveTone(block: Block): EffectiveTone {
  switch (block.type) {
    case "hero":
      return block.layout === "plein-ecran"
        ? "dark"
        : fromTone(block.variant, false);
    case "cta":
      return fromTone(block.tone ?? "sombre", true);
    case "section":
      // une vidéo, ou une scène de produit large (schéma « au-dessus »), est une vitrine
      return fromTone(
        block.tone,
        block.media?.kind === "video" ||
          (Boolean(block.visual) &&
            block.visual !== "aucun" &&
            block.mediaPosition === "top"),
      );
    case "cards":
      return fromTone(block.tone, block.layout === "vitrine");
    default:
      return fromTone((block as { tone?: Tone }).tone, false);
  }
}

function fromTone(tone: Tone | undefined, showcase: boolean): EffectiveTone {
  if (tone === "sombre") return showcase ? "dark" : "light";
  return tone === "sable" ? "light-surface" : "light";
}

export function toneProps(effective: EffectiveTone): {
  tone: SurfaceTone;
  surface: boolean;
} {
  return {
    tone: effective === "dark" ? "dark" : "light",
    surface: effective === "light-surface",
  };
}

/** Attributs communs d'un bloc : ancre (id + marge de défilement sous l'en-tête et le sommaire). */
export function anchorProps(anchorId: string | null | undefined): {
  id?: string;
  className?: string;
} {
  return anchorId ? { id: anchorId, className: "scroll-mt-12" } : {};
}
