import { MosaicBackdrop } from "@/components/brand/mosaic-backdrop";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { Breadcrumb } from "@/components/vps/breadcrumb";
import { JsonLd } from "@/components/vps/json-ld";
import { type Lang, localizePath } from "@/i18n/config";
import type { PricingDictionary } from "@/i18n/pricing";
import { buildPricingJsonLd, groupOffers } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";
import { buildBreadcrumbJsonLd } from "@/lib/vps-jsonld";
import type { PublicPlans } from "@/server/billing/pricing-read";
import { OfferCard } from "./offer-card";

/**
 * Page Tarifs (fr : /tarifs, en : /en/pricing). Trois états honnêtes : offres publiées, aucune offre
 * (« bientôt » + contact), service illisible (message + contact). Les données structurées ne décrivent que les
 * offres publiées affichées.
 */
export function PricingPage({
  lang,
  t,
  data,
}: {
  lang: Lang;
  t: PricingDictionary;
  data: PublicPlans;
}) {
  const offers = groupOffers(data.plans, lang);
  const pagePath = localizePath(lang, "/tarifs");
  const breadcrumb = buildBreadcrumbJsonLd(SITE_URL, [
    { name: t.nav.home, path: localizePath(lang, "/") },
    { name: t.nav.pricing, path: pagePath },
  ]);
  const products = buildPricingJsonLd({
    siteUrl: SITE_URL,
    pagePath,
    offers,
    labels: t.period,
  });
  const state =
    data.status === "ready" && offers.length > 0
      ? "ready"
      : data.status === "unavailable"
        ? "unavailable"
        : "empty";

  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={products} />
      <Section
        tone="light"
        aria-labelledby="pricing-title"
        background={
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 hidden opacity-40 md:block"
          >
            <MosaicBackdrop shape="wide" animated={false} />
          </div>
        }
      >
        <Breadcrumb
          label={t.nav.breadcrumb}
          items={[
            { name: t.nav.home, href: localizePath(lang, "/") },
            { name: t.nav.pricing },
          ]}
        />
        <header className="mt-4 max-w-3xl">
          <Badge tone="accent">{t.hero.label}</Badge>
          <h1 id="pricing-title" className="mt-4 text-h1 text-fg">
            {t.hero.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lead text-fg-muted">
            {t.hero.lead}
          </p>
        </header>
      </Section>

      {state === "ready" ? (
        <Section tone="light" surface aria-labelledby="offers-title">
          <SectionHeader
            id="offers-title"
            title={t.offers.title}
            lead={t.offers.lead}
          />
          <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {offers.map((offer) => (
              <li key={offer.family}>
                <OfferCard lang={lang} offer={offer} t={t} />
              </li>
            ))}
          </ul>
          <div className="mt-8 max-w-3xl space-y-2 text-small text-fg-muted">
            <p>{t.taxes}</p>
            {offers.some((o) => o.includedCreditsCents > 0) ? (
              <p>{t.includedNote}</p>
            ) : null}
            {offers.some((o) => o.trialDays > 0) ? <p>{t.trialNote}</p> : null}
          </div>
        </Section>
      ) : (
        <Section tone="light" surface aria-labelledby="pricing-state-title">
          <div className="max-w-2xl">
            <Badge tone="accent">{t.states[state].label}</Badge>
            <h2 id="pricing-state-title" className="mt-4 text-h2 text-fg">
              {t.states[state].title}
            </h2>
            <p className="mt-5 text-lead text-fg-muted">
              {t.states[state].text}
            </p>
            <div className="mt-8">
              <ButtonLink
                href={`${localizePath(lang, "/contact")}?sujet=demonstration`}
                arrow
              >
                {t.states[state].cta}
              </ButtonLink>
            </div>
          </div>
        </Section>
      )}

      <Section tone="light" aria-labelledby="more-title">
        <SectionHeader
          id="more-title"
          title={t.more.title}
          lead={t.more.lead}
        />
        <ul className="mt-12 grid gap-6 md:grid-cols-2">
          <li>
            <Card className="flex h-full flex-col">
              <h3 className="text-h3 text-fg">{t.more.vps.title}</h3>
              <p className="mt-3 text-fg-muted">{t.more.vps.text}</p>
              <div className="mt-auto pt-8">
                <ButtonLink
                  href={localizePath(lang, "/vps")}
                  variant="secondary"
                  arrow
                >
                  {t.more.vps.cta}
                </ButtonLink>
              </div>
            </Card>
          </li>
          <li>
            <Card className="flex h-full flex-col">
              <h3 className="text-h3 text-fg">{t.more.credits.title}</h3>
              <p className="mt-3 text-fg-muted">{t.more.credits.text}</p>
              <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row">
                <ButtonLink
                  href={localizePath(lang, "/modeles")}
                  variant="secondary"
                  arrow
                >
                  {t.more.credits.cta}
                </ButtonLink>
                <ButtonLink
                  href={localizePath(lang, "/compte/inscription")}
                  variant="link"
                >
                  {t.more.credits.ctaSecondary}
                </ButtonLink>
              </div>
            </Card>
          </li>
        </ul>
      </Section>
    </>
  );
}
