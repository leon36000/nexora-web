import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

/** Méthode : comprendre -> intégrer -> vérifier -> former -> exploiter et améliorer. */
export function Method({
  lang,
  t,
}: {
  lang: Lang;
  t: Dictionary["home"]["method"];
}) {
  return (
    <Section tone="light" aria-labelledby="method-title">
      <SectionHeader id="method-title" label={t.label} title={t.title} />
      <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
        {t.steps.map((step, index) => (
          <li
            key={step.title}
            className="relative border-t border-line-strong pt-6"
          >
            <span
              aria-hidden="true"
              className="absolute -top-[5px] left-0 size-[9px] bg-accent"
            />
            <Badge>{String(index + 1).padStart(2, "0")}</Badge>
            <h3 className="mt-4 text-h3 text-fg">{step.title}</h3>
            <p className="mt-3 text-fg-muted">{step.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-12">
        <ButtonLink
          href={localizePath(lang, "/methode")}
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
