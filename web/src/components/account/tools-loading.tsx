/**
 * Contenu affiché pendant que « Mes outils » lit les droits du compte : le titre, puis des blocs qui reprennent la
 * mise en page (crédits, espace, cartes), pour que la page ne saute pas quand elle arrive. Le pulse est coupé si le
 * mouvement est réduit.
 */
export function ToolsLoading({
  title,
  working,
}: {
  title: string;
  working: string;
}) {
  const block =
    "rounded-md border border-line bg-surface motion-safe:animate-pulse";
  return (
    <div aria-busy="true" className="space-y-8">
      <p className="font-display text-h3 text-fg">{title}</p>
      <p className="text-fg-muted" role="status">
        {working}
      </p>
      <div aria-hidden="true" className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className={`${block} h-56`} />
          <div className={`${block} h-56`} />
        </div>
        <div className={`${block} h-24`} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={`${block} h-60`} />
          <div className={`${block} h-60`} />
        </div>
      </div>
    </div>
  );
}
