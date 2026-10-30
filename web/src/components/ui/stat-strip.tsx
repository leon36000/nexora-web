import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Stat = {
  label: string;
  value: ReactNode;
  /** Précision sous la valeur (unité, « par million de jetons »). */
  hint?: ReactNode;
};

/**
 * Bandeau de repères : de deux à quatre cellules séparées par des filets d'un pixel (la grammaire des grilles du site),
 * un libellé mono, une grande valeur chiffrée alignée en chiffres tabulaires. Aucune donnée inventée : l'appelant
 * passe ce que la page affiche déjà.
 */
export function StatStrip({
  items,
  className,
}: {
  items: readonly Stat[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-px overflow-hidden rounded-frame border border-line bg-line",
        items.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        items.length === 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="bg-bg p-5">
          <dt className="font-mono text-label uppercase text-fg-muted">
            {item.label}
          </dt>
          <dd className="mt-2 font-display text-h3 tabular-nums text-fg">
            {item.value}
            {item.hint ? (
              <span className="mt-1 block font-sans text-small font-normal tracking-normal text-fg-muted">
                {item.hint}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
