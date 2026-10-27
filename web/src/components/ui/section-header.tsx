import type { ReactNode } from "react";
import { Badge } from "./badge";
import { cn } from "@/lib/cn";

type SectionHeaderProps = {
  id: string;
  label?: string;
  title: string;
  lead?: ReactNode;
  className?: string;
  /** Largeur maximale du bloc de texte. */
  narrow?: boolean;
};

/** Étiquette mono, titre H2 et chapeau : l'en-tête commun des sections de page. */
export function SectionHeader({ id, label, title, lead, className, narrow = true }: SectionHeaderProps) {
  return (
    <header className={cn(narrow && "max-w-3xl", className)}>
      {label ? <Badge tone="accent">{label}</Badge> : null}
      <h2 id={id} className={cn("text-h2 text-fg", label && "mt-4")}>
        {title}
      </h2>
      {lead ? <p className="mt-5 max-w-2xl text-lead text-fg-muted">{lead}</p> : null}
    </header>
  );
}
