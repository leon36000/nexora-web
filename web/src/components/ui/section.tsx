import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Container } from "./container";

type SectionProps = {
  /**
   * Thème sémantique de la bande (jetons bg, fg…) : "dark" = abysse, le plus profond ; "light" = nuit, le fond courant
   * du site public (sombre d'abord, identité « Signal ») ; "paper" = papier clair (espace client).
   */
  tone?: "dark" | "light" | "paper";
  /** Ligne de balayage qui traverse la bande quand elle apparaît (matière « Signal », figée sous mouvement réduit). */
  scan?: boolean;
  /** Utilise la surface du thème plutôt que son fond (alternance douce entre deux sections claires). */
  surface?: boolean;
  /** Retire l'espacement vertical (héros, sections à fond décoratif). */
  flush?: boolean;
  /**
   * Continuité avec les blocs voisins de même ton : « after » supprime l'espacement du haut (la section
   * prolonge la précédente), « before » resserre le bas (la suivante prolonge celle-ci), « both » les deux.
   */
  joined?: "after" | "before" | "both";
  /** Contenu décoratif placé derrière le contenu (aria-hidden côté appelant). */
  background?: ReactNode;
  /** Filets verticaux qui cadrent la colonne de la page (par défaut oui ; masqués sur téléphone). */
  rails?: boolean;
  containerClassName?: string;
} & Omit<ComponentPropsWithoutRef<"section">, "children"> & {
    children: ReactNode;
  };

/**
 * Section pleine largeur à thème sombre ou clair, cadrée par un filet horizontal en haut et deux filets verticaux
 * (les « rails ») le long de la colonne de la page. Les enfants lisent les jetons sémantiques
 * (text-fg, bg-surface, text-accent-text…) qui changent avec le thème.
 */
export function Section({
  tone = "light",
  surface = false,
  flush = false,
  joined,
  background,
  rails = true,
  scan = false,
  className,
  containerClassName,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden border-t border-line text-fg first:border-t-0",
        tone === "dark"
          ? "theme-dark"
          : tone === "paper"
            ? "theme-light"
            : "theme-night",
        scan && "scan-reveal",
        surface ? "bg-surface" : "bg-bg",
        // Lueur d'accent seulement en tête d'une bande : une section qui prolonge la précédente n'en répète pas.
        !(joined === "after" || joined === "both") &&
          (tone === "paper"
            ? surface
              ? "wash-paper"
              : null
            : tone === "dark"
              ? "wash-dark"
              : surface
                ? "wash-sand"
                : null),
        !flush && !joined && "py-section",
        !flush && joined === "after" && "pb-section",
        !flush && joined === "before" && "pt-section pb-12 md:pb-16",
        !flush && joined === "both" && "pb-12 md:pb-16",
        className,
      )}
      {...props}
    >
      {background}
      {rails ? <div aria-hidden="true" className="rails" /> : null}
      {scan ? (
        <div aria-hidden="true" className="scan-track">
          <div className="scanline" />
        </div>
      ) : null}
      <Container className={cn("relative", containerClassName)}>
        {children}
      </Container>
    </section>
  );
}
