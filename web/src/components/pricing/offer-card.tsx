import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmt, formatCad } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import type { PricingDictionary } from "@/i18n/pricing";
import { withOffer } from "@/lib/offer-param";
import { annualSavingPercent, type PricingOffer } from "@/lib/pricing";

/**
 * Une offre : prix mensuel et/ou annuel (avant taxes), essai, crédits par mois, espace disque et un bouton par période vendable
 * qui mène à l'inscription (l'offre choisie suit jusqu'au paiement). Une période qui n'est pas encore vendable
 * (prix pas encore poussé vers Stripe) ne propose qu'un contact : jamais un bouton qui échouerait.
 */
export function OfferCard({
  lang,
  offer,
  t,
}: {
  lang: Lang;
  offer: PricingOffer;
  t: PricingDictionary;
}) {
  const { month, year } = offer.options;
  const saving = annualSavingPercent(offer);
  const headline = month ?? year;
  const signup = (code: string) =>
    withOffer(localizePath(lang, "/compte/inscription"), code);
  const titleId = `offre-${offer.family}-titre`;
  return (
    <Card
      as="article"
      id={`offre-${offer.family}`}
      aria-labelledby={titleId}
      className="flex h-full flex-col"
    >
      <h3 id={titleId} className="text-h3 text-fg">
        {offer.name}
      </h3>
      {offer.description ? (
        <p className="mt-3 text-fg-muted">{offer.description}</p>
      ) : null}

      {headline ? (
        <p className="mt-6 font-display text-h2 text-fg tabular-nums">
          {formatCad(lang, headline.perMonthCents)}{" "}
          <span className="text-small font-normal text-fg-muted">
            {t.card.perMonth}
          </span>
        </p>
      ) : null}
      {month && year ? (
        <ul className="mt-3 space-y-1 text-small text-fg-muted">
          <li>
            {t.card.monthlyBilling} : {formatCad(lang, month.priceCents)}{" "}
            {t.card.perMonth}
          </li>
          <li>
            {t.card.yearlyBilling} : {formatCad(lang, year.priceCents)}{" "}
            {t.card.perYear} (
            {fmt(t.card.yearlyEquivalent, {
              amount: formatCad(lang, year.perMonthCents),
            })}
            )
          </li>
        </ul>
      ) : year ? (
        <p className="mt-3 text-small text-fg-muted">
          {t.card.yearlyBilling} : {formatCad(lang, year.priceCents)}{" "}
          {t.card.perYear}
        </p>
      ) : null}
      {saving ? (
        <Badge className="mt-3 w-fit normal-case tracking-normal">
          {fmt(t.card.saving, { percent: saving })}
        </Badge>
      ) : null}

      <ul className="mt-5 space-y-1 text-small text-fg">
        {offer.trialDays > 0 ? (
          <li>{fmt(t.card.trial, { days: offer.trialDays })}</li>
        ) : null}
        {offer.creditsPerMonth > 0 ? (
          <li>
            {fmt(t.card.credits, {
              credits: new Intl.NumberFormat(
                lang === "fr" ? "fr-CA" : "en-CA",
              ).format(offer.creditsPerMonth),
            })}
            {year && offer.creditsPerMonth > 0 ? (
              <span className="block text-fg-muted">
                {t.card.creditsYearly}
              </span>
            ) : null}
          </li>
        ) : null}
        {offer.includedStorageGb > 0 ? (
          <li>{fmt(t.card.storage, { gb: offer.includedStorageGb })}</li>
        ) : null}
      </ul>

      {offer.features.length > 0 ? (
        <div className="mt-6 border-t border-line pt-6">
          <p className="sr-only">{t.card.included}</p>
          <ul className="space-y-2 text-fg-muted">
            {offer.features.map((f) => (
              <li key={f} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 bg-accent"
                />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row sm:flex-wrap">
        {month?.sellable ? (
          <ButtonLink href={signup(month.code)} arrow>
            {t.card.choose}
          </ButtonLink>
        ) : null}
        {year?.sellable ? (
          <ButtonLink
            href={signup(year.code)}
            variant={month?.sellable ? "secondary" : "primary"}
            arrow={!month?.sellable}
          >
            {month?.sellable ? t.card.chooseYearly : t.card.choose}
          </ButtonLink>
        ) : null}
        {!month?.sellable && !year?.sellable ? (
          <>
            <p className="w-full text-small text-fg-muted">
              <strong className="text-fg">{t.card.notReady}</strong>.{" "}
              {t.card.notReadyHelp}
            </p>
            <ButtonLink
              href={`${localizePath(lang, "/contact")}?sujet=demonstration`}
              variant="secondary"
            >
              {t.card.contact}
            </ButtonLink>
          </>
        ) : null}
      </div>
    </Card>
  );
}
