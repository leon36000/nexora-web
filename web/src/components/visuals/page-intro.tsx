import type { ReactNode } from "react";

/** En-tête de page à deux colonnes : le texte à gauche, une maquette de l'interface concernée à droite (sous le texte en mobile). */
export function PageIntro({
  children,
  visual,
}: {
  children: ReactNode;
  visual: ReactNode;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
      <div>{children}</div>
      <div className="min-w-0">{visual}</div>
    </div>
  );
}
