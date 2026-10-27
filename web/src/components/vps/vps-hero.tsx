import { PerimeterGrid } from "@/components/brand/perimeter-grid";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { PageIntro } from "@/components/visuals/page-intro";
import { VpsConsoleMock } from "@/components/visuals/vps-console";
import { type Lang, localizePath } from "@/i18n/config";
import { getVisualsDictionary } from "@/i18n/visuals";
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
  skeleton = false,
}: {
  lang: Lang;
  t: VpsDictionary;
  withActions: boolean;
  /**
   * Coque de chargement (frontière Suspense) : Next diffuse la coque ET le contenu final dans le même HTML ; sans
   * cette option la page contiendrait deux h1 et deux fils d'Ariane. La coque reprend l'aspect du titre sans le
   * structurer.
   */
  skeleton?: boolean;
}) {
  const Title = skeleton ? "p" : "h1";
  return (
    <Section
      tone="light"
      aria-labelledby={skeleton ? undefined : "vps-title"}
      background={
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden opacity-25 md:block"
        >
          <PerimeterGrid shape="wide" animated={false} />
        </div>
      }
    >
      {skeleton ? null : (
        <Breadcrumb
          label={t.nav.breadcrumb}
          items={[
            { name: t.nav.home, href: localizePath(lang, "/") },
            { name: t.nav.vps },
          ]}
        />
      )}
      <PageIntro
        visual={
          skeleton ? null : (
            <VpsConsoleMock t={getVisualsDictionary(lang).vps} />
          )
        }
      >
        <header className="mt-4 max-w-3xl">
          <Badge tone="accent">{t.hero.label}</Badge>
          <Title
            id={skeleton ? undefined : "vps-title"}
            className="mt-4 text-h1 text-fg"
          >
            {t.hero.title}
          </Title>
          <p className="mt-5 max-w-2xl text-lead text-fg-muted">
            {t.hero.lead}
          </p>
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
      </PageIntro>
    </Section>
  );
}
