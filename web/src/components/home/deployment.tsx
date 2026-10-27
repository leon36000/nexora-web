import { PerimeterDiagram } from "@/components/brand/perimeter-grid";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { localizePath, type Lang } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

/** Les deux modes de déploiement, chacun avec son schéma de périmètre. */
export function Deployment({ lang, t }: { lang: Lang; t: Dictionary["home"]["deployment"] }) {
  const modes = [
    { key: "onsite", mode: "onsite" as const, copy: t.onsite },
    { key: "hosted", mode: "hosted" as const, copy: t.hosted },
  ];
  return (
    <Section tone="dark" aria-labelledby="deployment-title">
      <SectionHeader id="deployment-title" label={t.label} title={t.title} lead={t.lead} />
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        {modes.map(({ key, mode, copy }) => (
          <Card key={key} as="article" className="flex flex-col p-5 sm:p-7">
            <figure>
              <div className="rounded-md border border-line bg-bg px-4 py-6">
                <PerimeterDiagram mode={mode} />
              </div>
              <figcaption className="sr-only">{copy.diagram}</figcaption>
            </figure>
            <Badge tone="accent" className="mt-8">
              {copy.label}
            </Badge>
            <h3 className="mt-3 text-h3 text-fg">{copy.title}</h3>
            <p className="mt-3 max-w-md text-fg-muted">{copy.text}</p>
          </Card>
        ))}
      </div>
      <div className="mt-10">
        <ButtonLink href={localizePath(lang, "/deploiement")} variant="link" size="lg" arrow>
          {t.cta}
        </ButtonLink>
      </div>
    </Section>
  );
}
