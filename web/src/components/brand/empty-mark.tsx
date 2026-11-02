import { SignalGlyph } from "@/components/signal/materials";
import { cn } from "@/lib/cn";

/**
 * Repère des états vides : une petite mosaïque dont les carrés s'éteignent vers la gauche (« rien pour l'instant,
 * mais le champ est là »). Décoratif ; le texte voisin dit l'état.
 */
export function EmptyMark({
  seed = 2,
  className,
}: {
  seed?: number;
  className?: string;
}) {
  return (
    <SignalGlyph
      seed={seed}
      className={cn("h-10 w-[4.5rem] shrink-0", className)}
    />
  );
}
