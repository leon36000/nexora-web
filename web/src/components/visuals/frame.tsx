import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Cadre commun des illustrations : une image nommée (`role="img"`, texte alternatif traduit) dont le contenu est un
 * dessin ou une maquette décorative, puis une légende qui dit ce que c'est (maquette ou schéma de principe).
 */
export function VisualFigure({
  alt,
  caption,
  children,
  className,
}: {
  alt: string;
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("m-0", className)}>
      <div role="img" aria-label={alt}>
        {children}
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
        "theme-dark overflow-hidden rounded-lg border border-line bg-bg text-fg shadow-pop ring-1 ring-inset ring-white/5",
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
