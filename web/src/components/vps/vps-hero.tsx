import { PerimeterGrid } from "@/components/brand/perimeter-grid";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { type Lang, localizePath } from "@/i18n/config";
import type { VpsDictionary } from "@/i18n/vps";
import { Breadcrumb } from "./breadcrumb";

/**
 * Héros court de /vps. Les boutons et la mention des prix n'apparaissent que si la page affiche des plans
 * (`withActions`) : jamais d'ancre absente, jamais de mention de prix sans prix (offres en préparation,
 * catalogue indisponible, squelette de chargement).
 */
export function VpsHero({
  lang,
  t,
  withActions,
}: {
  lang: Lang;
  t: VpsDictionary;
  withActions: boolean;
}) {
  return (
    <Section
      tone="light"
      aria-labelledby="vps-title"
      background={
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden opacity-40 md:block"
        >
          <PerimeterGrid shape="wide" animated={false} />
        </div>
      }
    >
      <Breadcrumb
        label={t.nav.breadcrumb}
        items={[
          { name: t.nav.home, href: localizePath(lang, "/") },
          { name: t.nav.vps },
        ]}
      />
      <header className="mt-4 max-w-3xl">
        <Badge tone="accent">{t.hero.label}</Badge>
        <h1 id="vps-title" className="mt-4 text-h1 text-fg">
          {t.hero.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lead text-fg-muted">{t.hero.lead}</p>
        {withActions ? (
          <p className="mt-4 max-w-2xl text-small text-fg-muted">
            {t.common.priceNote} {t.common.taxes}
          </p>
        ) : null}
        {withActions ? (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="#configurateur" size="lg" arrow>
              {t.hero.primary}
            </ButtonLink>
            <ButtonLink href="#plans" variant="secondary" size="lg">
              {t.hero.secondary}
            </ButtonLink>
          </div>
        ) : null}
      </header>
    </Section>
  );
}
