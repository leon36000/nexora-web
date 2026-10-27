import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/cn";

/** Entrée par problème : cinq situations du quotidien, en mosaïque 3 + 2 sur grand écran. */
export function Problems({
  lang,
  t,
}: {
  lang: Lang;
  t: Dictionary["home"]["problems"];
}) {
  // Mosaïque sur 6 colonnes : 2 cartes larges puis 3 cartes étroites.
  const spans = [
    "lg:col-span-3",
    "lg:col-span-3",
    "lg:col-span-2",
    "lg:col-span-2",
    "lg:col-span-2",
  ];
  return (
    <Section tone="light" aria-labelledby="problems-title">
      <SectionHeader
        id="problems-title"
        label={t.label}
        title={t.title}
        lead={t.lead}
      />
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {t.items.map((item, index) => (
          <li key={item.title} className={cn("flex", spans[index])}>
            <Card className="flex w-full flex-col">
              <Badge>{String(index + 1).padStart(2, "0")}</Badge>
              <h3 className="mt-8 text-h3 text-fg">{item.title}</h3>
              <p className="mt-3 text-fg-muted">{item.text}</p>
            </Card>
          </li>
        ))}
      </ul>
      <div className="mt-10">
        <ButtonLink
          href={localizePath(lang, "/solutions")}
          variant="link"
          size="lg"
          arrow
        >
          {t.cta}
        </ButtonLink>
      </div>
    </Section>
  );
}
