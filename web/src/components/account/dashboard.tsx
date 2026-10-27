import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import {
  type AccountDictionary,
  fmt,
  formatCad,
  formatDate,
  formatMicroCad,
} from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import type { DashboardData } from "@/server/billing/dashboard";
import type { SubscriptionPlan } from "@/server/billing/plans";
import type { BillingConfig } from "@/server/ledger/config";
import { INPUT_CLASS, Notice } from "./field";
import { SignOutButton } from "./sign-out-button";

type Role = "owner" | "member";

export interface DashboardProps {
  lang: Lang;
  t: AccountDictionary;
  data: DashboardData;
  role: Role;
  userName: string;
  config: BillingConfig;
  /** null : les offres n'ont pas pu être lues (Directus indisponible ou non configuré). */
  plans: SubscriptionPlan[] | null;
  flash: { kind: "success" | "info" | "error"; message: string } | null;
}

const NEGATIVE = "text-accent-text";

function Hidden({ lang }: { lang: Lang }) {
  return <input type="hidden" name="lang" value={lang} />;
}

/** Tableau de bord de l'espace client : organisation, crédits, historique, abonnements, facturation. */
export function Dashboard({
  lang,
  t,
  data,
  role,
  userName,
  config,
  plans,
  flash,
}: DashboardProps) {
  const d = t.dashboard;
  const { account } = data;
  const isOwner = role === "owner";
  const min = formatCad(lang, config.minPurchaseCents);
  const max = formatCad(lang, config.maxPurchaseCents);

  return (
    <Section tone="light" aria-labelledby="dashboard-title">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Badge tone="accent">{userName}</Badge>
          <h1 id="dashboard-title" className="mt-4 text-h1 text-fg">
            {d.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lead text-fg-muted">{d.lead}</p>
        </div>
        <SignOutButton lang={lang} label={d.signOut} />
      </header>

      {flash ? (
        <div className="mt-8">
          <Notice tone={flash.kind}>{flash.message}</Notice>
        </div>
      ) : null}

      <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-4 text-small">
        <div>
          <dt className="text-fg-muted">{d.organization}</dt>
          <dd className="mt-1 text-body font-medium text-fg">
            {data.organization.name}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">{d.role}</dt>
          <dd className="mt-1 text-body font-medium text-fg">
            {d.roles[role]}
          </dd>
        </div>
      </dl>

      {/* Solde */}
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="balance-title">
          <h2 id="balance-title" className="text-h4 text-fg">
            {d.balance.title}
          </h2>
          <p className="mt-1 text-small text-fg-muted">{d.balance.available}</p>
          <p
            className={`mt-1 font-display text-h2 ${account.blocked ? NEGATIVE : "text-fg"}`}
            data-testid="balance"
          >
            {formatMicroCad(lang, account.availableMicro)}
          </p>
          {account.heldMicro > 0n ? (
            <p className="mt-2 text-small text-fg-muted">
              {fmt(d.balance.held, {
                amount: formatMicroCad(lang, account.heldMicro),
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

        {/* Achat de crédits */}
        <Card as="section" aria-labelledby="buy-title">
          <h2 id="buy-title" className="text-h4 text-fg">
            {d.buy.title}
          </h2>
          <p className="mt-2 text-small text-fg-muted">{d.buy.lead}</p>
          {isOwner ? (
            <form
              method="post"
              action="/api/billing/checkout/credits"
              className="mt-5 space-y-4"
            >
              <Hidden lang={lang} />
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
              <Button type="submit" arrow>
                {d.buy.submit}
              </Button>
              <p className="text-small text-fg-muted">{d.buy.taxNote}</p>
              <p className="text-small text-fg-muted">{d.buy.testNote}</p>
            </form>
          ) : (
            <p className="mt-5 text-small text-fg-muted">{d.buy.ownerOnly}</p>
          )}
        </Card>
      </div>

      {/* VPS */}
      <section aria-labelledby="dashboard-vps-title" className="mt-16">
        <h2 id="dashboard-vps-title" className="text-h3 text-fg">
          {d.vps.title}
        </h2>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">{d.vps.lead}</p>
        <div className="mt-5">
          <ButtonLink
            href={localizePath(lang, "/compte/vps")}
            variant="secondary"
            arrow
          >
            {d.vps.link}
          </ButtonLink>
        </div>
      </section>

      {/* Abonnements */}
      <section aria-labelledby="subs-title" className="mt-16">
        <h2 id="subs-title" className="text-h3 text-fg">
          {d.subscriptions.title}
        </h2>
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
                      ) : isOwner ? (
                        <form
                          method="post"
                          action="/api/billing/checkout/subscription"
                        >
                          <Hidden lang={lang} />
                          <input type="hidden" name="plan" value={plan.code} />
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

      {/* Facturation */}
      <section aria-labelledby="portal-title" className="mt-16">
        <h2 id="portal-title" className="text-h3 text-fg">
          {d.portal.title}
        </h2>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">
          {d.portal.lead}
        </p>
        {isOwner && data.hasStripeCustomer ? (
          <form method="post" action="/api/billing/portal" className="mt-5">
            <Hidden lang={lang} />
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
      <section aria-labelledby="history-title" className="mt-16">
        <h2 id="history-title" className="text-h3 text-fg">
          {d.history.title}
        </h2>
        {data.entries.length === 0 ? (
          <p className="mt-4 text-body text-fg-muted">{d.history.empty}</p>
        ) : (
          // Région défilable au clavier : le tableau reste lisible sur petit écran.
          <section
            aria-label={d.history.caption}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
            tabIndex={0}
            className="mt-6 overflow-x-auto rounded-md border border-line"
          >
            <table className="w-full min-w-[40rem] border-collapse text-left text-small">
              <caption className="sr-only">{d.history.caption}</caption>
              <thead>
                <tr className="border-b border-line text-fg-muted">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {d.history.date}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {d.history.type}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {d.history.amount}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {d.history.balance}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-fg">
                      <time dateTime={e.createdAt.toISOString()}>
                        {formatDate(lang, e.createdAt)}
                      </time>
                    </td>
                    <td className="px-4 py-3 text-fg">
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
                      {formatMicroCad(lang, e.amountMicro)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                      {formatMicroCad(lang, e.balanceAfterMicro)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </section>
    </Section>
  );
}
