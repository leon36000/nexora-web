import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Container } from "./container";
import { cn } from "@/lib/cn";

type SectionProps = {
  /** "dark" : fond encre forêt ; "light" : fond papier. Pose le thème sémantique (jetons bg, fg…). */
  tone?: "dark" | "light";
  /** Utilise la surface du thème plutôt que son fond (alternance douce entre deux sections claires). */
  surface?: boolean;
  /** Retire l'espacement vertical (héros, sections à fond décoratif). */
  flush?: boolean;
  /** Contenu décoratif placé derrière le contenu (aria-hidden côté appelant). */
  background?: ReactNode;
  containerClassName?: string;
} & Omit<ComponentPropsWithoutRef<"section">, "children"> & { children: ReactNode };

/**
 * Section pleine largeur à thème sombre ou clair. Les enfants lisent les jetons sémantiques
 * (text-fg, bg-surface, text-accent-text…) qui changent avec le thème.
 */
export function Section({
  tone = "light",
  surface = false,
  flush = false,
  background,
  className,
  containerClassName,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden text-fg",
        tone === "dark" ? "theme-dark" : "theme-light",
        surface ? "bg-surface" : "bg-bg",
        !flush && "py-section",
        className,
      )}
      {...props}
    >
      {background}
      <Container className={cn("relative", containerClassName)}>{children}</Container>
    </section>
  );
}
