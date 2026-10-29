import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Éléments de présentation partagés par les pages du panneau client : titre de page, carte de chiffre,
 * zone de tableau défilable au clavier. Ils lisent les jetons du système de conception (text-fg, border-line…).
 */

/** Titre d'une page du panneau : le seul `h1` de la page. */
export function PanelHeading({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        <h1 id={id} className="text-h3 text-fg">
          {title}
        </h1>
        {lead ? (
          <p className="mt-3 max-w-2xl text-body text-fg-muted">{lead}</p>
        ) : null}
      </div>
      {children}
    </header>
  );
}

/** Titre de section (`h2`) d'une page du panneau. */
export function SectionTitle({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 id={id} className={cn("text-h4 text-fg", className)}>
      {children}
    </h2>
  );
}

/** Un chiffre clé : à placer dans un `<dl>` (la carte est le groupe terme + valeur). */
export function StatCard({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5 sm:p-5", className)}>
      <dt className="text-small text-fg-muted">{label}</dt>
      <dd className="mt-1">
        <span className="block font-display text-h3 tabular-nums text-fg">
          {value}
        </span>
        {note ? (
          <span className="mt-1 block text-small text-fg-muted">{note}</span>
        ) : null}
      </dd>
    </Card>
  );
}

/**
 * Zone défilable (tableau large sur téléphone) : atteignable et défilable au clavier, nommée pour les lecteurs
 * d'écran. `maxHeight` borne un long tableau.
 */
export function ScrollRegion({
  label,
  children,
  tall = false,
}: {
  label: string;
  children: ReactNode;
  tall?: boolean;
}) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
      tabIndex={0}
      className={cn(
        "overflow-x-auto rounded-md border border-line",
        tall && "max-h-96 overflow-y-auto",
      )}
    >
      {children}
    </section>
  );
}

export const TH = "px-4 py-3 font-medium";
export const TD = "px-4 py-3 text-fg";

/** Contenu affiché pendant qu'une page du panneau charge ses données (dans la coque du panneau). */
export function PanelLoading({
  title,
  working,
}: {
  title: string;
  working: string;
}) {
  return (
    <div aria-busy="true">
      <p className="font-display text-h3 text-fg">{title}</p>
      <p className="mt-4 text-fg-muted" role="status">
        {working}
      </p>
    </div>
  );
}
