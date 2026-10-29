import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type AccountDictionary,
  fmt,
  formatCad,
  formatDate,
} from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import type { DashboardData } from "@/server/billing/dashboard";
import type { SubscriptionPlan } from "@/server/billing/plans";
import type { BillingConfig } from "@/server/ledger/config";
import { INPUT_CLASS, Notice } from "./field";
import { formatMicroCadExact } from "./panel-format";
import { PanelHeading, ScrollRegion, SectionTitle, TD, TH } from "./panel-ui";

type Role = "owner" | "member";

const NEGATIVE = "text-accent-text";

/** Champ facultatif « code promo » : le serveur le valide ; le navigateur n'envoie que le texte saisi. */
export function PromoField({
  t,
  id,
}: {
  lang?: Lang;
  t: AccountDictionary;
  id: string;
}) {
  return (
    <div className="mb-3 max-w-48">
      <label htmlFor={id} className="block text-small font-medium text-fg">
        {t.promo.label}
      </label>
      <input
        id={id}
        name="promo"
        type="text"
        maxLength={60}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={t.promo.placeholder}
        className={INPUT_CLASS}
      />
    </div>
  );
}

export function HiddenLang({ lang }: { lang: Lang }) {
  return <input type="hidden" name="lang" value={lang} />;
}

/**
 * Offre choisie sur la page Tarifs (`/compte?offre=…`) : publiée, vendable et pas déjà en cours. Affichée sur
 * l'aperçu, là où atterrit le lien de la page Tarifs.
 */
export function ChosenOfferCard({
  lang,
  t,
  offer,
}: {
  lang: Lang;
  t: AccountDictionary;
  offer: SubscriptionPlan;
}) {
  const d = t.dashboard;
  return (
    <Card as="section" aria-labelledby="chosen-title">
      <h2 id="chosen-title" className="text-h4 text-fg">
        {fmt(d.subscriptions.chosen, {
          name:
            offer.translations[lang === "fr" ? "fr-CA" : "en-CA"]?.name ??
            offer.code,
        })}
      </h2>
      <p className="mt-2 text-body text-fg">
        {fmt(
          offer.interval === "month"
            ? d.subscriptions.available.perMonth
            : d.subscriptions.available.perYear,
          { amount: formatCad(lang, offer.priceCents) },
        )}
        {offer.trialDays > 0
          ? ` · ${fmt(d.subscriptions.available.trial, { days: offer.trialDays })}`
          : ""}
      </p>
      <form
        method="post"
        action="/api/billing/checkout/subscription"
        className="mt-5"
      >
        <HiddenLang lang={lang} />
        <input type="hidden" name="plan" value={offer.code} />
        <PromoField t={t} id="promo-chosen" />
        <Button type="submit" arrow>
          {d.subscriptions.available.subscribe}
        </Button>
      </form>
    </Card>
  );
}

export interface BillingPanelProps {
  lang: Lang;
  t: AccountDictionary;
  data: DashboardData;
  role: Role;
  config: BillingConfig;
  /** null : les offres n'ont pas pu être lues (Directus indisponible ou non configuré). */
  plans: SubscriptionPlan[] | null;
  /** Réglages de paiement visibles du client : mode réel ou test, frais de recharge. */
  payment: {
    liveMode: boolean;
    fee: { percent: number; minCents: number } | null;
  };
}

/**
 * Facturation de l'espace client : solde, achat de crédits, abonnements, portail Stripe et historique.
 * Ce sont les blocs de l'ancien tableau de bord, réunis sous « Facturation » ; les formulaires envoient les mêmes
 * champs aux mêmes routes `/api/billing/*`. Le bloc d'achat porte l'ancre `#ajouter-des-fonds` (bouton de l'aperçu).
 */
export function BillingPanel({
  lang,
  t,
  data,
  role,
  config,
  plans,
  payment,
}: BillingPanelProps) {
  const d = t.dashboard;
  const { account } = data;
  const isOwner = role === "owner";
  const ownedPlans = new Set(
    data.subscriptions
      .filter((s) => s.access === "full" || s.access === "grace")
      .map((s) => s.planCode),
  );
  const min = formatCad(lang, config.minPurchaseCents);
  const max = formatCad(lang, config.maxPurchaseCents);

  return (
    <div className="space-y-14">
      <PanelHeading
        id="billing-title"
        title={t.panel.billing.title}
        lead={t.panel.billing.lead}
      />

      {/* Solde et achat de crédits */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card as="section" aria-labelledby="balance-title">
          <SectionTitle id="balance-title">{d.balance.title}</SectionTitle>
          <p className="mt-1 text-small text-fg-muted">{d.balance.available}</p>
          <p
            className={`mt-1 font-display text-h2 tabular-nums ${account.blocked ? NEGATIVE : "text-fg"}`}
            data-testid="balance"
          >
            {formatMicroCadExact(lang, account.availableMicro)}
          </p>
          {account.heldMicro > 0n ? (
            <p className="mt-2 text-small text-fg-muted">
              {fmt(d.balance.held, {
                amount: formatMicroCadExact(lang, account.heldMicro),
              })}
            </p>
          ) : null}
          {account.blocked ? (
            <div className="mt-5">
              <Notice tone="error">
                <strong>{d.balance.blockedTitle}</strong>{" "}
                {d.balance.blockedText}
              </Notice>
            </div>
          ) : null}
          <p className="mt-5 text-small text-fg-muted">
            {fmt(d.balance.expiryNote, { months: config.creditExpiryMonths })}
          </p>
        </Card>

        <Card
          as="section"
          id="ajouter-des-fonds"
          aria-labelledby="buy-title"
          className="scroll-mt-28"
        >
          <SectionTitle id="buy-title">{d.buy.title}</SectionTitle>
          <p className="mt-2 text-small text-fg-muted">{d.buy.lead}</p>
          {isOwner ? (
            <form
              method="post"
              action="/api/billing/checkout/credits"
              className="mt-5 space-y-4"
            >
              <HiddenLang lang={lang} />
              <div>
                <label
                  htmlFor="amount"
                  className="block text-small font-medium text-fg"
                >
                  {d.buy.amount}
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]+([.,][0-9]{1,2})?"
                  defaultValue="50"
                  required
                  aria-describedby="amount-hint"
                  className={`${INPUT_CLASS} max-w-48`}
                />
                <p id="amount-hint" className="mt-1.5 text-small text-fg-muted">
                  {fmt(d.buy.limits, { min, max })}
                </p>
              </div>
              <PromoField t={t} id="promo-credits" />
              <Button type="submit" arrow>
                {d.buy.submit}
              </Button>
              <p className="text-small text-fg-muted">{d.buy.taxNote}</p>
              {payment.fee ? (
                <p className="text-small text-fg-muted">
                  {fmt(d.buy.feeNote, {
                    percent: payment.fee.percent,
                    min: formatCad(lang, payment.fee.minCents),
                  })}
                </p>
              ) : null}
              {payment.liveMode ? null : (
                <p className="text-small text-fg-muted">{d.buy.testNote}</p>
              )}
            </form>
          ) : (
            <p className="mt-5 text-small text-fg-muted">{d.buy.ownerOnly}</p>
          )}
        </Card>
      </div>

      {/* Abonnements */}
      <section aria-labelledby="subs-title">
        <SectionTitle id="subs-title">{d.subscriptions.title}</SectionTitle>
        {data.subscriptions.length === 0 ? (
          <p className="mt-4 text-body text-fg-muted">
            {d.subscriptions.empty}
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {data.subscriptions.map((s) => (
              <li key={s.id}>
                <Card className="h-full">
                  <p className="font-display text-h4 text-fg">
                    {s.planCode ?? "—"}
                  </p>
                  <p className="mt-2 text-small text-fg">
                    {d.subscriptions.statuses[s.status]}
                    <span className="text-fg-muted">
                      {" "}
                      · {d.subscriptions.access[s.access]}
                    </span>
                  </p>
                  {s.cancelAtPeriodEnd && s.currentPeriodEnd ? (
                    <p className="mt-2 text-small text-fg-muted">
                      {fmt(d.subscriptions.cancels, {
                        date: formatDate(lang, s.currentPeriodEnd),
                      })}
                    </p>
                  ) : s.currentPeriodEnd ? (
                    <p className="mt-2 text-small text-fg-muted">
                      {fmt(d.subscriptions.renews, {
                        date: formatDate(lang, s.currentPeriodEnd),
                      })}
                    </p>
                  ) : null}
                  {s.access === "grace" && s.graceEndsAt ? (
                    <p className="mt-2 text-small text-accent-text">
                      {fmt(d.subscriptions.graceUntil, {
                        date: formatDate(lang, s.graceEndsAt),
                      })}
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}

        {/* Un plan déjà en cours (accès complet ou délai de grâce) ne se souscrit pas une seconde fois. */}
        <h3 className="mt-10 text-h4 text-fg">
          {d.subscriptions.available.title}
        </h3>
        {plans === null ? (
          <p className="mt-3 text-small text-fg-muted">
            {d.subscriptions.available.unavailable}
          </p>
        ) : plans.length === 0 ? (
          <p className="mt-3 text-small text-fg-muted">
            {d.subscriptions.available.empty}
          </p>
        ) : (
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {plans.map((plan) => {
              const tr = plan.translations[lang === "fr" ? "fr-CA" : "en-CA"];
              const price = fmt(
                plan.interval === "month"
                  ? d.subscriptions.available.perMonth
                  : d.subscriptions.available.perYear,
                { amount: formatCad(lang, plan.priceCents) },
              );
              return (
                <li key={plan.code}>
                  <Card className="flex h-full flex-col">
                    <p className="font-display text-h4 text-fg">
                      {tr?.name ?? plan.code}
                    </p>
                    {tr?.description ? (
                      <p className="mt-2 text-small text-fg-muted">
                        {tr.description}
                      </p>
                    ) : null}
                    <p className="mt-3 text-body text-fg">{price}</p>
                    {plan.trialDays > 0 ? (
                      <p className="mt-1 text-small text-fg-muted">
                        {fmt(d.subscriptions.available.trial, {
                          days: plan.trialDays,
                        })}
                      </p>
                    ) : null}
                    {plan.includedCreditsCents > 0 ? (
                      <p className="mt-1 text-small text-fg-muted">
                        {fmt(d.subscriptions.available.included, {
                          amount: formatCad(lang, plan.includedCreditsCents),
                        })}
                      </p>
                    ) : null}
                    <div className="mt-5">
                      {!plan.stripePriceId ? (
                        <p className="text-small text-fg-muted">
                          {d.subscriptions.available.notReady}
                        </p>
                      ) : ownedPlans.has(plan.code) ? (
                        <p className="text-small text-fg-muted">
                          {d.subscriptions.available.current}
                        </p>
                      ) : isOwner ? (
                        <form
                          method="post"
                          action="/api/billing/checkout/subscription"
                        >
                          <HiddenLang lang={lang} />
                          <input type="hidden" name="plan" value={plan.code} />
                          <PromoField t={t} id={`promo-${plan.code}`} />
                          <Button type="submit" variant="secondary">
                            {d.subscriptions.available.subscribe}
                          </Button>
                        </form>
                      ) : (
                        <p className="text-small text-fg-muted">
                          {d.subscriptions.available.ownerOnly}
                        </p>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Portail Stripe */}
      <section aria-labelledby="portal-title">
        <SectionTitle id="portal-title">{d.portal.title}</SectionTitle>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">
          {d.portal.lead}
        </p>
        {isOwner && data.hasStripeCustomer ? (
          <form method="post" action="/api/billing/portal" className="mt-5">
            <HiddenLang lang={lang} />
            <Button type="submit" variant="secondary">
              {d.portal.button}
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-small text-fg-muted">
            {isOwner ? d.portal.none : d.buy.ownerOnly}
          </p>
        )}
      </section>

      {/* Historique */}
      <section aria-labelledby="history-title">
        <SectionTitle id="history-title">{d.history.title}</SectionTitle>
        {data.entries.length === 0 ? (
          <p className="mt-4 text-body text-fg-muted">{d.history.empty}</p>
        ) : (
          <div className="mt-6">
            <ScrollRegion label={d.history.caption}>
              <table className="w-full min-w-[40rem] border-collapse text-left text-small">
                <caption className="sr-only">{d.history.caption}</caption>
                <thead>
                  <tr className="border-b border-line text-fg-muted">
                    <th scope="col" className={TH}>
                      {d.history.date}
                    </th>
                    <th scope="col" className={TH}>
                      {d.history.type}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {d.history.amount}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {d.history.balance}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className={`whitespace-nowrap ${TD}`}>
                        <time dateTime={e.createdAt.toISOString()}>
                          {formatDate(lang, e.createdAt)}
                        </time>
                      </td>
                      <td className={TD}>
                        {(d.history.sources as Record<string, string>)[
                          e.source
                        ] ?? e.source}
                        {e.expiresAt ? (
                          <span className="block text-fg-muted">
                            {fmt(d.history.expires, {
                              date: formatDate(lang, e.expiresAt),
                            })}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${e.amountMicro < 0n ? NEGATIVE : "text-fg"}`}
                      >
                        {e.amountMicro > 0n ? "+" : ""}
                        {formatMicroCadExact(lang, e.amountMicro)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                        {formatMicroCadExact(lang, e.balanceAfterMicro)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
        )}
      </section>
    </div>
  );
}
