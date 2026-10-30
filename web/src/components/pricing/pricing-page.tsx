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
import type { CreditEquivalent } from "@/lib/credit-equivalence";
import { buildPricingJsonLd, groupOffers, splitOffers } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";
import { buildBreadcrumbJsonLd } from "@/lib/vps-jsonld";
import type { PublicPacks, PublicPlans } from "@/server/billing/pricing-read";
import { OfferCard } from "./offer-card";
import {
  CreditSection,
  PricingFaq,
  PricingState,
  RefillSection,
  StorageSection,
  UsageSection,
} from "./pricing-sections";

/**
 * Page Tarifs (fr : /tarifs, en : /en/pricing), refaite pour le modèle à crédits : ce qu'est un crédit (avec son équivalent
 * en jetons calculé depuis le catalogue), les paliers, la recharge, l'espace, ce qui est inclus ou consomme, la FAQ.
 * États honnêtes : paliers publiés ; « prix à venir » (rien d'inventé : les explications restent) ; service illisible.
 * Les données structurées ne décrivent que les offres publiées affichées.
 */
export function PricingPage({
  lang,
  t,
  data,
  packs = { status: "empty", packs: [] },
  equivalents = null,
}: {
  lang: Lang;
  t: PricingDictionary;
  data: PublicPlans;
  packs?: PublicPacks;
  /** Équivalent de crédits en jetons ; `null` : catalogue indisponible. */
  equivalents?: CreditEquivalent[] | null;
}) {
  const offers = groupOffers(data.plans, lang);
  const { tiers, storageAddon } = splitOffers(offers);
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
    data.status === "ready" && tiers.length > 0
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
            {tiers.map((offer) => (
              <li key={offer.family}>
                <OfferCard lang={lang} offer={offer} t={t} />
              </li>
            ))}
          </ul>
          <div className="mt-8 max-w-3xl space-y-2 text-small text-fg-muted">
            <p>{t.taxes}</p>
            {tiers.some((o) => o.trialDays > 0) ? <p>{t.trialNote}</p> : null}
          </div>
        </Section>
      ) : (
        <PricingState lang={lang} state={state} t={t} />
      )}

      <CreditSection lang={lang} t={t} equivalents={equivalents} />
      <RefillSection lang={lang} t={t} packs={packs.packs} />
      <StorageSection lang={lang} t={t} addon={storageAddon} />
      <UsageSection t={t} />
      <PricingFaq t={t} pricesPublished={state === "ready"} />

      <Section tone="light" surface aria-labelledby="more-title">
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
              <h3 className="text-h3 text-fg">{t.more.contact.title}</h3>
              <p className="mt-3 text-fg-muted">{t.more.contact.text}</p>
              <div className="mt-auto pt-8">
                <ButtonLink
                  href={`${localizePath(lang, "/contact")}?sujet=demonstration`}
                  variant="secondary"
                  arrow
                >
                  {t.more.contact.cta}
                </ButtonLink>
              </div>
            </Card>
          </li>
        </ul>
      </Section>
    </>
  );
}
