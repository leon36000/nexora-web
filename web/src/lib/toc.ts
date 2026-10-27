import type { Block } from "@/server/cms/model";

/** Une page dont au moins trois blocs ont une ancre affiche un sommaire (collant en bureau, déroulant en mobile). */
export const MIN_TOC_ANCHORS = 3;

export type TocEntry = { id: string; label: string };

/** Les titres du CMS sont ponctués d'un point : le sommaire est une liste de rubriques, sans point final. */
const noFinalPeriod = (text: string) => text.replace(/\s*[.。]\s*$/, "");

function labelOf(block: Block, id: string): string {
  switch (block.type) {
    case "hero":
      return noFinalPeriod(block.eyebrow ?? block.headline);
    case "cta":
      return noFinalPeriod(block.title);
    default:
      return noFinalPeriod(block.title?.trim() || id);
  }
}

/** Entrées du sommaire, dans l'ordre de la page ; `null` sous le seuil. Une ancre déjà vue est ignorée. */
export function buildToc(blocks: readonly Block[]): TocEntry[] | null {
  const seen = new Set<string>();
  const entries: TocEntry[] = [];
  for (const block of blocks) {
    const id = block.anchorId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, label: labelOf(block, id) });
  }
  return entries.length >= MIN_TOC_ANCHORS ? entries : null;
}
