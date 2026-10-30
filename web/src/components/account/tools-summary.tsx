import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt, formatDate } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import { cn } from "@/lib/cn";
import type {
  CreditsView,
  PlanView,
  StorageView,
} from "@/server/products/panel-data";
import { Notice } from "./field";
import { formatBytes } from "./panel-format";
import { SectionTitle } from "./panel-ui";

type Role = "owner" | "member";

/** Barre de progression : l'équivalent textuel est dans la page, la barre est un complément visuel annoncé comme `progressbar`. */
function Meter({
  percent,
  label,
  valueText,
  tone,
}: {
  percent: number;
  label: string;
  valueText: string;
  tone: "ok" | "warning" | "full";
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      className="mt-3 h-3 w-full overflow-hidden rounded-full border border-line-strong"
    >
      <div
        className={cn(
          "h-full",
          tone === "ok" ? "bg-accent-graphic" : "bg-accent-text",
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Crédits : total, abonnement et recharge séparés, échéance de l'abonnement, ou « accès administrateur gratuit ». */
export function CreditsCard({
  lang,
  t,
  role,
  view,
}: {
  lang: Lang;
  t: AccountDictionary;
  role: Role;
  view: CreditsView;
}) {
  const c = t.panel.tools.credits;
  const count = (n: number) => formatInteger(lang, n);
  return (
    <Card as="section" aria-labelledby="tools-credits-title">
      <SectionTitle id="tools-credits-title">{c.title}</SectionTitle>
      {view.level === "free" ? (
        <>
          <p className="mt-3 font-display text-h3 text-fg">{c.freeTitle}</p>
          <p className="mt-2 text-small text-fg-muted">{c.freeText}</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-small text-fg-muted">{c.available}</p>
          <p
            className={cn(
              "mt-1 font-display text-h2 tabular-nums",
              view.level === "blocked" ? "text-accent-text" : "text-fg",
            )}
            data-testid="credits-total"
          >
            {fmt(view.total === 1 ? c.totalOne : c.total, {
              count: count(view.total),
            })}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
            <div>
              <dt className="text-small text-fg-muted">{c.subscription}</dt>
              <dd className="mt-1">
                <span
                  className="block font-display text-h4 tabular-nums text-fg"
                  data-testid="credits-subscription"
                >
                  {count(view.subscription)}
                </span>
                {view.subscriptionExpiresAt ? (
                  <span className="mt-0.5 block text-small text-fg-muted">
                    {fmt(c.expires, {
                      date: formatDate(lang, view.subscriptionExpiresAt),
                    })}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-small text-fg-muted">{c.refill}</dt>
              <dd className="mt-1">
                <span
                  className="block font-display text-h4 tabular-nums text-fg"
                  data-testid="credits-refill"
                >
                  {count(view.refill)}
                </span>
                <span className="mt-0.5 block text-small text-fg-muted">
                  {c.refillNever}
                </span>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-small text-fg-muted">{c.rule}</p>
          {view.level === "blocked" ? (
            <div className="mt-4">
              <Notice tone="error">
                <strong>{t.dashboard.balance.blockedTitle}</strong>{" "}
                {t.dashboard.balance.blockedText}
              </Notice>
            </div>
          ) : view.level === "empty" ? (
            <div className="mt-4">
              <Notice tone="info">{c.empty}</Notice>
            </div>
          ) : null}
          <div className="mt-5">
            {role === "owner" ? (
              <ButtonLink
                href={`${localizePath(lang, "/compte/facturation")}#ajouter-des-fonds`}
                arrow
              >
                {c.addFunds}
              </ButtonLink>
            ) : (
              <p className="text-small text-fg-muted">{c.ownerOnly}</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/** Espace disque : barre globale, avertissement à 80 %, message clair à 100 %, répartition par outil. */
export function StorageCard({
  lang,
  t,
  view,
}: {
  lang: Lang;
  t: AccountDictionary;
  view: StorageView;
}) {
  const s = t.panel.tools.storage;
  const used = formatBytes(lang, view.usedBytes);
  const seeOffers = (
    <div className="mt-4">
      <ButtonLink href={localizePath(lang, "/tarifs")} variant="secondary">
        {s.seeOffers}
      </ButtonLink>
    </div>
  );
  return (
    <Card as="section" aria-labelledby="tools-storage-title">
      <SectionTitle id="tools-storage-title">{s.title}</SectionTitle>
      {view.level === "none" ? (
        <>
          <p className="mt-3 text-body text-fg">{s.none}</p>
          {seeOffers}
        </>
      ) : view.level === "house" ? (
        <p className="mt-3 text-body text-fg">{fmt(s.house, { used })}</p>
      ) : (
        <>
          <p
            className="mt-3 font-display text-h3 tabular-nums text-fg"
            data-testid="storage-usage"
          >
            {fmt(s.usage, {
              used,
              total: formatBytes(lang, view.totalBytes),
            })}
          </p>
          <Meter
            percent={view.percent}
            label={s.meterLabel}
            valueText={fmt(s.meterValue, { percent: view.percent })}
            tone={
              view.level === "full"
                ? "full"
                : view.level === "warning"
                  ? "warning"
                  : "ok"
            }
          />
          {view.level === "warning" ? (
            <div className="mt-4">
              <Notice tone="info">
                {fmt(s.warning, { percent: view.percent })}
              </Notice>
            </div>
          ) : null}
          {view.level === "full" ? (
            <div className="mt-4">
              <Notice tone="error">{s.full}</Notice>
            </div>
          ) : null}
          {view.level === "warning" || view.level === "full" ? seeOffers : null}
        </>
      )}
      {view.level !== "none" ? (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-small font-medium text-fg">{s.breakdownTitle}</h3>
          {view.products.length === 0 ? (
            <p className="mt-2 text-small text-fg-muted">{s.nothingStored}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {view.products.map((p) => (
                <li key={p.product}>
                  <div className="flex items-baseline justify-between gap-4 text-small">
                    <span className="text-fg">{s.products[p.product]}</span>
                    <span className="tabular-nums text-fg-muted">
                      {formatBytes(lang, p.bytes)}
                    </span>
                  </div>
                  {view.level === "house" ? null : (
                    <div
                      aria-hidden="true"
                      className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                    >
                      <div
                        className="h-full bg-accent-graphic"
                        style={{ width: `${Math.max(2, p.percentOfTotal)}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/** Offre en cours (nom, rythme, échéance), ou « Aucun abonnement : rechargez ou choisissez une offre ». */
export function PlanStrip({
  lang,
  t,
  role,
  view,
}: {
  lang: Lang;
  t: AccountDictionary;
  role: Role;
  view: PlanView;
}) {
  const p = t.panel.tools.plan;
  const names: Record<string, string> = p.names;
  return (
    <Card as="section" aria-labelledby="tools-plan-title">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <SectionTitle id="tools-plan-title">{p.title}</SectionTitle>
          {view.kind === "none" ? (
            <p className="mt-2 text-body text-fg">{p.none}</p>
          ) : (
            <>
              <p className="mt-2 font-display text-h4 text-fg">
                {names[view.code] ?? view.code}
                {view.interval ? (
                  <span className="ml-3 text-small font-normal text-fg-muted">
                    {p.interval[view.interval]}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-small text-fg-muted">
                {view.ending && view.renewsAt
                  ? fmt(p.ends, { date: formatDate(lang, view.renewsAt) })
                  : view.renewsAt
                    ? fmt(p.renews, { date: formatDate(lang, view.renewsAt) })
                    : null}
              </p>
              {view.pastDue ? (
                <p className="mt-2 text-small text-accent-text" role="status">
                  {view.graceEndsAt
                    ? fmt(p.pastDue, {
                        date: formatDate(lang, view.graceEndsAt),
                      })
                    : p.pastDueNoDate}
                </p>
              ) : null}
            </>
          )}
        </div>
        <div className="shrink-0">
          {view.kind === "none" ? (
            <ButtonLink href={localizePath(lang, "/tarifs")} arrow>
              {p.seeOffers}
            </ButtonLink>
          ) : role === "owner" ? (
            <ButtonLink
              href={localizePath(lang, "/compte/facturation")}
              variant="secondary"
            >
              {p.manage}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
