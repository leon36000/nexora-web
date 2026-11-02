import Link from "next/link";
import type { ReactNode } from "react";
import { SignalBackdrop } from "@/components/signal/materials";
import { cn } from "@/lib/cn";
import { Badge } from "./badge";
import { Section } from "./section";

type PageHeroProps = {
  /** Identifiant du titre : la section est nommée par lui (`aria-labelledby`). */
  titleId: string;
  title: ReactNode;
  /** Étiquette mono à point de lumière, au-dessus du titre. */
  eyebrow?: ReactNode;
  lead?: ReactNode;
  /** Fil d'Ariane (un `<nav>` déjà nommé) : posé au-dessus du titre. */
  breadcrumb?: ReactNode;
  /** Pastilles d'état et de licence : sur une ligne, entre le fil d'Ariane et le titre. */
  meta?: ReactNode;
  /** Sous le titre : étiquettes, identifiants, appels à l'action. */
  children?: ReactNode;
  /** Bandeau de chiffres ou de repères, pleine largeur sous le texte. */
  aside?: ReactNode;
  /** Ancienne teinte par famille (mosaïque retirée) : ignorée, l'identité « Signal » n'a qu'une lumière. */
  palette?: string;
  /** Matière de fond : grille de précision (défaut), champ de lumière, onde ou détection. */
  material?: "grille" | "champ" | "onde" | "detection";
  seed?: number;
  /** Niveau du titre : `h1` (défaut) ou `h2` quand la page a déjà son h1. */
  as?: "h1" | "h2";
  className?: string;
};

/**
 * En-tête commun des pages de l'application (Nexora Apps, modèles, comparateur, classements, agents, documentation de
 * l'API, contact) : une bande claire à grille de précision (matière « Signal »), qui prolonge le héros de l'accueil en
 * plus bas et plus calme. Une seule grammaire : fil d'Ariane, pastilles, titre h1, chapeau, actions, bandeau de repères.
 */
export function PageHero({
  titleId,
  title,
  eyebrow,
  lead,
  breadcrumb,
  meta,
  children,
  aside,
  material = "grille",
  as: H = "h1",
  className,
}: PageHeroProps) {
  return (
    <Section
      tone="light"
      flush
      aria-labelledby={titleId}
      className={cn("pb-14 pt-10 md:pb-20 md:pt-16", className)}
      background={<SignalBackdrop variant={material} animated={false} />}
    >
      {breadcrumb ? <div className="mb-8 md:mb-10">{breadcrumb}</div> : null}
      <div className="max-w-3xl pb-6 md:pb-0">
        {meta ? (
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {meta}
          </div>
        ) : null}
        {eyebrow ? <Badge tone="accent">{eyebrow}</Badge> : null}
        <H
          id={titleId}
          className={cn("text-h1 text-fg", eyebrow || meta ? "mt-5" : null)}
        >
          {title}
        </H>
        {lead ? (
          <p className="mt-5 max-w-2xl text-lead text-fg-muted">{lead}</p>
        ) : null}
        {children}
      </div>
      {aside ? <div className="mt-10 md:mt-12">{aside}</div> : null}
    </Section>
  );
}

/** Fil d'Ariane sur fond sombre ou clair : cibles de 44 px de haut, séparateur décoratif. */
export function Breadcrumb({
  label,
  items,
}: {
  label: string;
  items: readonly { label: string; href?: string }[];
}) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-x-2 text-small text-fg-muted">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-x-2">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link
                href={item.href}
                prefetch={false}
                className="inline-flex min-h-11 min-w-11 items-center rounded-xs underline underline-offset-4 transition-colors duration-150 hover:text-fg"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
