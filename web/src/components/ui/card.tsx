import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/cn";

type CardProps<T extends ElementType> = {
  as?: T;
  /** Carte cliquable : affiche un survol et l'anneau de focus quand un lien interne a le focus. */
  interactive?: boolean;
  /** "surface" : fond de surface du thème ; "outline" : simple filet, fond transparent ; "cell" : cellule d'une grille à filets (sans bordure propre, le fond du thème). */
  variant?: "surface" | "outline" | "cell";
} & Omit<ComponentPropsWithoutRef<T>, "as">;

/**
 * Carte sobre (ou cellule d'une grille à filets). Pour une carte entièrement cliquable, le titre contient un lien dont le
 * pseudo-élément ::after couvre la carte (classe `card-link`), ce qui garde un seul arrêt de tabulation.
 */
export function Card<T extends ElementType = "div">({
  as,
  interactive = false,
  variant = "surface",
  className,
  ...props
}: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn(
        "relative p-6 sm:p-8",
        variant === "cell"
          ? "rounded-none bg-bg"
          : "rounded-card border border-line",
        variant === "surface" && "bg-surface",
        variant === "outline" && "bg-transparent",
        interactive &&
          (variant === "cell"
            ? "transition-colors duration-200 hover:bg-surface has-[a:focus-visible]:bg-surface"
            : "transition-[transform,border-color,background-color,box-shadow] duration-200 hover:border-line-strong hover:bg-surface-2 hover:shadow-lift has-[a:focus-visible]:border-line-strong motion-safe:hover:-translate-y-0.5"),
        className,
      )}
      {...props}
    />
  );
}

/** Classes d'un lien dont la zone cliquable s'étend à toute la carte parente (`relative`). */
export const CARD_LINK =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-4 focus-visible:after:outline-focus";
