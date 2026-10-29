import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type AccountDictionary,
  fmt,
  formatCad,
  formatDate,
} from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import type { DashboardData } from "@/server/billing/dashboard";
import type { SubscriptionPlan } from "@/server/billing/plans";
import type { Wallet } from "@/server/billing/wallet";
import type { BillingConfig } from "@/server/ledger/config";
import { AddFundsForm } from "./add-funds-form";
import { BalanceAlertForm } from "./balance-alert-form";
import { HiddenLang, PromoField } from "./billing-fields";
import { Notice } from "./field";
import { IncludedMeter } from "./included-meter";
import { formatMicroCadExact } from "./panel-format";
import { presetAmountsCents } from "./panel-logic";
import { PanelHeading, ScrollRegion, SectionTitle, TD, TH } from "./panel-ui";

type Role = "owner" | "member";

const NEGATIVE = "text-accent-text";

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
  /** Lots de crédits et crédits inclus de la période. */
  wallet: Wallet;
  /** Organisation « maison » : accès gratuit, pas de solde à gérer. */
  free: boolean;
  /** Alerte de solde bas actuelle (seuil en dollars, texte), ou null. */
  alert: {
    enabled: boolean;
    thresholdCad: string;
    thresholdMicro: bigint;
  } | null;
  /** Le journal affiche toutes les écritures chargées (et non les dernières). */
  historyAll: boolean;
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
  wallet,
  free,
  alert,
  historyAll,
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

      {free ? (
        <Card as="section" aria-labelledby="free-title">
          <SectionTitle id="free-title">
            {t.panel.billing.free.title}
          </SectionTitle>
          <p className="mt-3 max-w-2xl text-body text-fg-muted">
            {t.panel.billing.free.text}
          </p>
        </Card>
      ) : (
        <>
          {/* Solde et fonds */}
          <div className="grid gap-6 xl:grid-cols-2">
            <Card as="section" aria-labelledby="balance-title">
              <SectionTitle id="balance-title">{d.balance.title}</SectionTitle>
              <p className="mt-1 text-small text-fg-muted">
                {d.balance.available}
              </p>
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
                {fmt(d.balance.expiryNote, {
                  months: config.creditExpiryMonths,
                })}
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
                <AddFundsForm
                  lang={lang}
                  t={t}
                  presetsCents={presetAmountsCents(
                    config.minPurchaseCents,
                    config.maxPurchaseCents,
                  )}
                  limitsText={fmt(d.buy.limits, { min, max })}
                  notes={[
                    d.buy.taxNote,
                    ...(payment.fee
                      ? [
                          fmt(d.buy.feeNote, {
                            percent: payment.fee.percent,
                            min: formatCad(lang, payment.fee.minCents),
                          }),
                        ]
                      : []),
                    ...(payment.liveMode ? [] : [d.buy.testNote]),
                  ]}
                />
              ) : (
                <p className="mt-5 text-small text-fg-muted">
                  {d.buy.ownerOnly}
                </p>
              )}
            </Card>
          </div>

          {/* Crédits inclus et lots */}
          <div className="grid gap-6 xl:grid-cols-2">
            <IncludedMeter lang={lang} t={t} included={wallet.included} />
            <Card as="section" aria-labelledby="auto-title">
              <div className="flex flex-wrap items-center gap-3">
                <SectionTitle id="auto-title">
                  {t.panel.billing.autoTopUp.title}
                </SectionTitle>
                <span className="rounded-md border border-line-strong px-2 py-0.5 font-mono text-label uppercase text-fg-muted">
                  {t.panel.billing.autoTopUp.badge}
                </span>
              </div>
              <p className="mt-3 text-small text-fg-muted">
                {t.panel.billing.autoTopUp.text}
              </p>
            </Card>
          </div>

          <Card as="section" aria-labelledby="alert-title">
            <SectionTitle id="alert-title">
              {t.panel.billing.alert.title}
            </SectionTitle>
            <p className="mt-2 max-w-2xl text-small text-fg-muted">
              {t.panel.billing.alert.lead}
            </p>
            <p className="mt-3 text-small text-fg" data-testid="alert-status">
              {alert?.enabled
                ? fmt(t.panel.billing.alert.statusOn, {
                    amount: formatMicroCadExact(lang, alert.thresholdMicro),
                  })
                : t.panel.billing.alert.statusOff}
            </p>
            {isOwner ? (
              <BalanceAlertForm
                t={t.panel.billing.alert}
                initialEnabled={alert?.enabled ?? false}
                initialThresholdCad={alert?.thresholdCad ?? ""}
              />
            ) : (
              <p className="mt-4 text-small text-fg-muted">
                {t.panel.billing.alert.ownerOnly}
              </p>
            )}
          </Card>

          <section aria-labelledby="lots-title">
            <SectionTitle id="lots-title">
              {t.panel.billing.lots.title}
            </SectionTitle>
            <p className="mt-2 max-w-2xl text-small text-fg-muted">
              {t.panel.billing.lots.lead}
            </p>
            {wallet.lots.filter((l) => l.remainingMicro > 0n).length === 0 ? (
              <p className="mt-4 text-body text-fg-muted">
                {t.panel.billing.lots.empty}
              </p>
            ) : (
              <div className="mt-5">
                <ScrollRegion label={t.panel.billing.lots.caption}>
                  <table className="w-full min-w-[34rem] border-collapse text-left text-small">
                    <caption className="sr-only">
                      {t.panel.billing.lots.caption}
                    </caption>
                    <thead>
                      <tr className="border-b border-line text-fg-muted">
                        <th scope="col" className={TH}>
                          {t.panel.billing.lots.source}
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          {t.panel.billing.lots.amount}
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          {t.panel.billing.lots.remaining}
                        </th>
                        <th scope="col" className={TH}>
                          {t.panel.billing.lots.expires}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {wallet.lots
                        .filter((l) => l.remainingMicro > 0n)
                        .map((l) => (
                          <tr
                            key={l.id}
                            className="border-b border-line last:border-0"
                          >
                            <td className={TD}>
                              {(d.history.sources as Record<string, string>)[
                                l.source
                              ] ?? l.source}
                            </td>
                            <td
                              className={`whitespace-nowrap ${TD} text-right tabular-nums`}
                            >
                              {formatMicroCadExact(lang, l.amountMicro)}
                            </td>
                            <td
                              className={`whitespace-nowrap ${TD} text-right tabular-nums`}
                            >
                              {formatMicroCadExact(lang, l.remainingMicro)}
                            </td>
                            <td className={`whitespace-nowrap ${TD}`}>
                              {l.expiresAt
                                ? formatDate(lang, l.expiresAt)
                                : t.panel.billing.lots.never}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </ScrollRegion>
              </div>
            )}
          </section>
        </>
      )}

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
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <p className="text-small text-fg-muted" role="status">
                {fmt(t.panel.billing.history.shown, {
                  count: data.entries.length,
                })}
              </p>
              {historyAll ? (
                <ButtonLink
                  href={localizePath(lang, "/compte/facturation")}
                  variant="secondary"
                >
                  {t.panel.billing.history.less}
                </ButtonLink>
              ) : (
                <ButtonLink
                  href={`${localizePath(lang, "/compte/facturation")}?historique=tout#history-title`}
                  variant="secondary"
                >
                  {t.panel.billing.history.more}
                </ButtonLink>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
