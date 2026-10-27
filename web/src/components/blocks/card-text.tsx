import { cn } from "@/lib/cn";

/** Lignes d'un texte de carte (une ligne par saut de ligne) : le CMS sépare ainsi « Avant », « Après », « Votre contrôle ». */
export function textLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Paragraphes d'un texte de carte, en gardant l'espacement du premier. */
export function CardText({
  text,
  className,
  first = true,
}: {
  text: string;
  className?: string;
  /** Faux : le premier paragraphe n'a pas de marge haute (le parent la gère). */
  first?: boolean;
}) {
  return (
    <>
      {textLines(text).map((line, i) => (
        <p
          key={line}
          className={cn(
            "text-fg-muted",
            i > 0 && "mt-2",
            i === 0 && first && "mt-3",
            className,
          )}
        >
          {line}
        </p>
      ))}
    </>
  );
}
