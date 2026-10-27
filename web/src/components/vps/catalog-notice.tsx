import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { type Lang, localizePath } from "@/i18n/config";
import type { VpsDictionary } from "@/i18n/vps";

/**
 * « Offres en préparation » (aucun plan publié) ou « momentanément indisponible » (base illisible).
 * Jamais de prix. Le lien mène au formulaire de contact avec le besoin « démonstration » présélectionné.
 */
export function CatalogNotice({
  lang,
  kind,
  t,
}: {
  lang: Lang;
  kind: "empty" | "unavailable";
  t: VpsDictionary;
}) {
  const s = t.states[kind];
  return (
    <Section tone="light" surface aria-labelledby="vps-state-title">
      <div className="max-w-2xl">
        <Badge tone="accent">{s.label}</Badge>
        <h2 id="vps-state-title" className="mt-4 text-h2 text-fg">
          {s.title}
        </h2>
        <p className="mt-5 text-lead text-fg-muted">{s.text}</p>
        <div className="mt-8">
          <ButtonLink
            href={`${localizePath(lang, "/contact")}?sujet=demonstration`}
            arrow
          >
            {s.cta}
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
