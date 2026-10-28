import type { Tone } from "@/server/cms/model";

/** Ton CMS -> propriétés de <Section> : sombre = fond noir profond ; clair = papier ; sable = surface claire relevée. */
export function toneProps(tone: Tone | undefined): {
  tone: "dark" | "light";
  surface: boolean;
} {
  switch (tone) {
    case "sombre":
      return { tone: "dark", surface: false };
    case "sable":
      return { tone: "light", surface: true };
    default:
      return { tone: "light", surface: false };
  }
}

/** Attributs communs d'un bloc : ancre (id + marge de défilement sous l'en-tête et le sommaire). */
export function anchorProps(anchorId: string | null | undefined): {
  id?: string;
  className?: string;
} {
  return anchorId ? { id: anchorId, className: "scroll-mt-12" } : {};
}
