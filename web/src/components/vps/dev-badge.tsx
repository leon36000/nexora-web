import type { ReactNode } from "react";

/**
 * Étiquette d'un plan de développement : volontairement très visible (fond orange, texte blanc, contraste
 * 4,8:1). Ces plans n'existent qu'en base de développement et ne se vendent pas.
 */
export function DevBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-xs bg-accent px-2 py-1 font-mono text-label uppercase text-white">
      {children}
    </span>
  );
}
