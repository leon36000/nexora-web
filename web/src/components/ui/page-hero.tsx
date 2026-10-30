import Link from "next/link";
import type { ReactNode } from "react";
import type { MosaicPalette } from "@/components/brand/mosaic";
import { MosaicBackdrop } from "@/components/brand/mosaic-backdrop";
import { cn } from "@/lib/cn";
import { Badge } from "./badge";
import { Section } from "./section";

type PageHeroProps = {
  /** Identifiant du titre : la section est nommée par lui (`aria-labelledby`). */
  titleId: string;
  title: ReactNode;
  /** Étiquette mono à pixel orange, au-dessus du titre. */
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
  /** Rampe de la mosaïque : braise (défaut), ciel (modèles, API), or (serveurs), menthe (compte). */
  palette?: MosaicPalette;
  seed?: number;
  /** Niveau du titre : `h1` (défaut) ou `h2` quand la page a déjà son h1. */
  as?: "h1" | "h2";
  className?: string;
};

/**
 * En-tête commun des pages de l'application (Nexora Apps, modèles, comparateur, classements, agents, documentation de
 * l'API, contact) : une bande sombre à mosaïque, qui prolonge le héros de l'accueil en plus bas et plus calme. Une seule
 * grammaire pour toutes ces pages : fil d'Ariane, pastilles, titre h1, chapeau, actions, bandeau de repères. La mosaïque
 * est décorative (`aria-hidden`), elle prend la teinte du produit ; sur téléphone, elle devient un ruban sous le texte.
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
  palette = "braise",
  seed = 5,
  as: H = "h1",
  className,
}: PageHeroProps) {
  return (
    <Section
      tone="dark"
      flush
      aria-labelledby={titleId}
      className={cn("pb-12 pt-8 md:pb-16 md:pt-10", className)}
      background={
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 hidden md:block"
          >
            <MosaicBackdrop
              shape="wide"
              palette={palette}
              seed={seed}
              rows={16}
            />
            <div className="ruler absolute inset-x-0 bottom-0" />
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 -z-10 h-16 md:hidden"
          >
            <MosaicBackdrop shape="compact" palette={palette} seed={seed} />
          </div>
        </>
      }
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
          className={cn("text-h1 text-fg", eyebrow || meta ? "mt-4" : null)}
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
                className="inline-flex min-h-11 items-center rounded-xs underline underline-offset-4 transition-colors duration-150 hover:text-fg"
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
