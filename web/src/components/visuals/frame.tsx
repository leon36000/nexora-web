import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Ancienne teinte de scène par produit ; l'identité « Signal » n'a qu'une lumière (ion), la valeur est ignorée. */
type StageKind = "braise" | "ciel" | "or" | "menthe" | "nuit";

/**
 * Scène d'une maquette (identité « Signal ») : un fond abysse, une grille de précision à 1 px et un halo de lumière ion
 * en biais, sur lequel la fenêtre du produit est posée. Décoratif : le dessin ne porte aucun sens à lui seul.
 */
export function Stage({
  children,
  className,
}: {
  palette?: StageKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "theme-dark relative isolate overflow-hidden rounded-frame border border-line bg-abyss-950 p-3 sm:p-8",
        "bg-[radial-gradient(70%_60%_at_85%_0%,rgb(31_207_128/0.16),transparent_70%),radial-gradient(50%_50%_at_0%_100%,rgb(31_207_128/0.07),transparent_70%)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="grid-precision absolute inset-0 -z-10"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-accent-graphic/70 to-transparent"
      />
      {children}
    </div>
  );
}

/**
 * Cadre commun des illustrations : une image nommée (`role="img"`, texte alternatif traduit) dont le contenu est un
 * dessin ou une maquette décorative, puis une légende qui dit ce que c'est (maquette ou schéma de principe).
 * `stage` pose la maquette sur une scène colorée.
 */
export function VisualFigure({
  alt,
  caption,
  children,
  className,
  stage,
}: {
  alt: string;
  caption?: string;
  children: ReactNode;
  className?: string;
  stage?: StageKind;
}) {
  return (
    <figure className={cn("m-0", className)}>
      <div role="img" aria-label={alt}>
        {stage ? <Stage>{children}</Stage> : children}
      </div>
      {caption ? (
        <figcaption className="mt-3 text-small text-fg-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Fenêtre d'application (toujours sombre, comme l'interface produit), à titre mono et pastille d'état. */
export function Window({
  title,
  status,
  children,
  className,
}: {
  title: string;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "theme-dark overflow-hidden rounded-lg border border-line bg-abyss-900/90 text-fg shadow-pop ring-1 ring-inset ring-white/5 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2.5 font-mono text-label uppercase text-fg-muted">
          <span className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_var(--accent-graphic)]" />
          <span className="truncate">{title}</span>
        </span>
        {status}
      </div>
      {children}
    </div>
  );
}

/** Pastille d'état d'une fenêtre ou d'une ligne. */
export function Chip({
  children,
  tone = "plain",
  className,
}: {
  children: ReactNode;
  tone?: "plain" | "accent" | "success";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-xs border px-2 py-0.5 font-mono text-label uppercase",
        tone === "plain" && "border-line text-fg-muted",
        tone === "accent" && "border-accent/60 text-accent-text",
        tone === "success" && "border-success/50 text-success",
        className,
      )}
    >
      {children}
    </span>
  );
}
