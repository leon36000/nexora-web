import type { ReactNode } from "react";
import {
  Mosaic,
  type MosaicPalette,
  PALETTES,
} from "@/components/brand/mosaic";
import { cn } from "@/lib/cn";

/**
 * Scène d'une maquette : un champ de carrés teintés (la mosaïque) sur lequel la fenêtre du produit est posée, comme une
 * carte sur un aplat de couleur. Chaque produit a sa teinte. Décoratif : le dessin ne porte aucun sens à lui seul.
 */
export function Stage({
  palette,
  children,
  className,
}: {
  palette: MosaicPalette;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-md p-3 sm:p-8",
        className,
      )}
      style={{ background: PALETTES[palette][0] }}
    >
      <Mosaic
        cols={30}
        rows={20}
        seed={4}
        palette={palette}
        toward="right"
        fade={0.55}
        gap={0}
        className="absolute inset-0 -z-10 size-full"
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
  stage?: MosaicPalette;
}) {
  return (
    <figure className={cn("m-0", className)}>
      <div role="img" aria-label={alt}>
        {stage ? <Stage palette={stage}>{children}</Stage> : children}
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
        "theme-dark overflow-hidden rounded-md border border-line bg-bg text-fg shadow-pop ring-1 ring-inset ring-white/5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2.5 font-mono text-label uppercase text-fg-muted">
          <span className="size-2 shrink-0 bg-accent" />
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
