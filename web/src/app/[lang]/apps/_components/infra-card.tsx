import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Stage } from "@/components/visuals/frame";
import type { AppsDictionary } from "@/i18n/apps";
import { type Lang, localizePath } from "@/i18n/config";

/**
 * Carte « Infrastructure IA physique ou virtuelle » : le texte à gauche, un emplacement d'image réservé à droite.
 * L'emplacement est une scène colorée vide et décorative (`aria-hidden`) : aucune image n'est inventée. Pour y poser
 * une photo ou un schéma, remplacer le `div[data-image-slot]` par une `<Image>` avec son texte alternatif traduit.
 */
export function InfraCard({ lang, t }: { lang: Lang; t: AppsDictionary }) {
  const i = t.list.infra;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:gap-14">
      <div>
        <Badge tone="accent">{i.label}</Badge>
        <h2 id="infra-title" className="mt-4 text-h2 text-fg">
          {i.title}
        </h2>
        <p className="mt-5 max-w-2xl text-lead text-fg-muted">{i.text}</p>
        <p className="mt-4 max-w-2xl text-small text-fg-muted">{i.note}</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <ButtonLink href={localizePath(lang, "/opsys-ai")} arrow>
            {i.opsys}
          </ButtonLink>
          <ButtonLink
            href={`${localizePath(lang, "/contact")}?sujet=etude-deploiement`}
            variant="secondary"
          >
            {i.study}
          </ButtonLink>
        </div>
      </div>
      <div aria-hidden="true" className="min-w-0">
        <Stage palette="nuit">
          <div
            data-image-slot="infrastructure-ia"
            className="aspect-[4/3] w-full"
          />
        </Stage>
      </div>
    </div>
  );
}
