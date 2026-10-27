import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { localizePath, type Lang } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

/** Confiance : quatre couches (données, modèles, calcul, exploitation), sans certification affirmée. */
export function Trust({ lang, t }: { lang: Lang; t: Dictionary["home"]["trust"] }) {
  return (
    <Section tone="dark" aria-labelledby="trust-title">
      <SectionHeader id="trust-title" label={t.label} title={t.title} lead={t.lead} />
      <dl className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {t.items.map((item, index) => (
          <div key={item.title} className="bg-bg p-6 sm:p-7">
            <dt className="flex items-center gap-3">
              <Badge>{String(index + 1).padStart(2, "0")}</Badge>
              <span className="font-display text-h3 text-fg">{item.title}</span>
            </dt>
            <dd className="mt-4 text-fg-muted">{item.text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 font-display text-h4 text-fg">{t.law}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
        <ButtonLink href={localizePath(lang, "/centre-de-confiance")} size="lg" arrow>
          {t.cta}
        </ButtonLink>
        <ButtonLink href={localizePath(lang, "/souverainete")} variant="link" size="lg" arrow>
          {t.secondary}
        </ButtonLink>
      </div>
    </Section>
  );
}
