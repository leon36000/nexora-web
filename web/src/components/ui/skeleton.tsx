import { cn } from "@/lib/cn";

/**
 * Bloc de chargement : un rectangle à angles francs qui pulse doucement (opacité seulement, et seulement si le
 * mouvement est permis). Décoratif : le conteneur porte `aria-hidden` ou un état `aria-busy`.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton rounded-card bg-fg/[0.07]", className)}
    />
  );
}

/** Squelette de la liste des modèles : une rangée d'étiquettes, la barre de recherche et six cartes. */
export function CatalogSkeleton() {
  return (
    <div aria-hidden="true" className="mt-10">
      <div className="flex gap-2 overflow-hidden">
        {["a", "b", "c", "d", "e", "f"].map((k) => (
          <Skeleton key={k} className="h-11 w-24 shrink-0" />
        ))}
      </div>
      <Skeleton className="mt-6 h-11 w-full" />
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["a", "b", "c", "d", "e", "f"].map((k) => (
          <li key={k}>
            <Skeleton className="h-64 w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
