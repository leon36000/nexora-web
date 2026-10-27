import type { VisualsDictionary } from "@/i18n/visuals";

/**
 * Carte d'exemple de l'accueil : une réponse préparée attend l'approbation d'une personne. Posée sur la grille de
 * périmètre, elle dit en une image la garde centrale du produit. Décorative et étiquetée « Exemple ».
 */
export function HeroApproval({ t }: { t: VisualsDictionary["hero"] }) {
  return (
    <div className="theme-dark relative w-[19.5rem] text-fg">
      <div
        aria-hidden="true"
        className="absolute inset-x-5 -top-3 h-full rounded-md border border-line bg-surface/60"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-2.5 -top-1.5 h-full rounded-md border border-line bg-surface/80"
      />
      <div className="relative rounded-md border border-line bg-surface p-4 shadow-pop ring-1 ring-inset ring-white/5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-label uppercase text-accent-text">
            {t.title}
          </span>
          <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-label uppercase text-fg-muted">
            {t.label}
          </span>
        </div>
        <ul className="mt-3 space-y-2 text-small text-fg-muted">
          <li className="flex items-center gap-2">
            <span className="size-2 bg-success" />
            {t.received}
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2 bg-success" />
            {t.prepared}
          </li>
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-small text-fg">
          {t.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="ring-soft rounded-sm bg-accent px-3.5 py-2 text-small font-semibold text-on-accent">
            {t.approve}
          </span>
          <span className="rounded-sm border border-line-strong px-3.5 py-2 text-small text-fg">
            {t.edit}
          </span>
        </div>
        <p className="mt-3 text-small text-fg-muted">{t.footer}</p>
      </div>
    </div>
  );
}
