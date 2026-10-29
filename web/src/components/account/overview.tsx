import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import type { DashboardData } from "@/server/billing/dashboard";
import type { SubscriptionPlan } from "@/server/billing/plans";
import type { OverviewData } from "@/server/gateway/activity-overview";
import { ChosenOfferCard } from "./billing-panel";
import { Notice } from "./field";
import { formatMicroCadExact } from "./panel-format";
import {
  isFreeAccess,
  type OnboardingStep,
  onboardingProgress,
  onboardingSteps,
} from "./panel-logic";
import { PanelHeading, SectionTitle, StatCard } from "./panel-ui";

type Role = "owner" | "member";

export interface OverviewProps {
  lang: Lang;
  t: AccountDictionary;
  role: Role;
  /** Solde, abonnements : lus par `loadDashboard`, comme la page de facturation. */
  dashboard: DashboardData;
  overview: OverviewData;
  /** Un abonnement WorkStudio donne actuellement accès (étape « Ouvrir WorkStudio »). */
  hasWorkstudio: boolean;
  /** Offre choisie sur la page Tarifs (`?offre=`), publiée, vendable et pas déjà en cours. */
  chosenOffer?: SubscriptionPlan | null;
  flash: { kind: "success" | "info" | "error"; message: string } | null;
}

function StepIcon({ done }: { done: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className="mt-0.5 size-5 shrink-0"
    >
      {done ? (
        <>
          <circle cx="10" cy="10" r="9" className="fill-success" />
          <path
            d="M5.5 10.5 8.5 13.5 14.5 6.5"
            fill="none"
            stroke="var(--bg)"
            strokeWidth="2"
            strokeLinecap="square"
          />
        </>
      ) : (
        <circle
          cx="10"
          cy="10"
          r="8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-fg-muted"
        />
      )}
    </svg>
  );
}

/** Carte « Portefeuille » : solde et bouton d'ajout de fonds, ou « Accès administrateur gratuit » (mode maison). */
export function WalletCard({
  lang,
  t,
  role,
  dashboard,
  overview,
}: Pick<OverviewProps, "lang" | "t" | "role" | "dashboard" | "overview">) {
  const w = t.panel.overview.wallet;
  const b = t.dashboard.balance;
  const { account } = dashboard;
  const free = isFreeAccess(overview.billingMode);
  return (
    <Card as="section" aria-labelledby="wallet-title">
      <SectionTitle id="wallet-title">{w.title}</SectionTitle>
      {free ? (
        <>
          <p className="mt-3 font-display text-h3 text-fg">{w.freeTitle}</p>
          <p className="mt-2 text-small text-fg-muted">{w.freeText}</p>
          {overview.last30.valueMicro > 0n ? (
            <p className="mt-3 text-small text-fg">
              {fmt(w.freeValue, {
                amount: formatMicroCadExact(lang, overview.last30.valueMicro),
              })}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 text-small text-fg-muted">{b.available}</p>
          <p
            className={`mt-1 font-display text-h2 tabular-nums ${account.blocked ? "text-accent-text" : "text-fg"}`}
            data-testid="balance"
          >
            {formatMicroCadExact(lang, account.availableMicro)}
          </p>
          {account.heldMicro > 0n ? (
            <p className="mt-2 text-small text-fg-muted">
              {fmt(b.held, {
                amount: formatMicroCadExact(lang, account.heldMicro),
              })}
            </p>
          ) : null}
          {account.blocked ? (
            <div className="mt-5">
              <Notice tone="error">
                <strong>{b.blockedTitle}</strong> {b.blockedText}
              </Notice>
            </div>
          ) : null}
          <div className="mt-6">
            {role === "owner" ? (
              <ButtonLink
                href={`${localizePath(lang, "/compte/facturation")}#ajouter-des-fonds`}
                arrow
              >
                {w.addFunds}
              </ButtonLink>
            ) : (
              <p className="text-small text-fg-muted">{w.ownerOnly}</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/** Liste « Pour démarrer » : quatre pas, cochés d'après les données réelles. */
export function StartCard({
  lang,
  t,
  steps,
}: {
  lang: Lang;
  t: AccountDictionary;
  steps: OnboardingStep[];
}) {
  const s = t.panel.overview.start;
  const progress = onboardingProgress(steps);
  return (
    <Card as="section" aria-labelledby="start-title">
      <SectionTitle id="start-title">{s.title}</SectionTitle>
      <p className="mt-1 text-small text-fg-muted">
        {fmt(s.progress, { done: progress.done, total: progress.total })}
      </p>
      <ol className="mt-5 space-y-4">
        {steps.map((step) => (
          <li key={step.id} className="flex gap-3">
            <StepIcon done={step.done} />
            <div className="min-w-0">
              <p className="text-body font-medium text-fg">
                <Link
                  href={localizePath(lang, step.href)}
                  prefetch={false}
                  className="underline decoration-1 underline-offset-4 hover:decoration-2"
                >
                  {s.steps[step.id].title}
                </Link>
                <span
                  className={`ml-2 font-mono text-label uppercase ${step.done ? "text-success" : "text-fg-muted"}`}
                >
                  {step.done ? s.done : s.todo}
                </span>
              </p>
              <p className="mt-0.5 text-small text-fg-muted">
                {s.steps[step.id].text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Aperçu du panneau : portefeuille, pour démarrer, résumé des 30 derniers jours. */
export function Overview({
  lang,
  t,
  role,
  dashboard,
  overview,
  hasWorkstudio,
  chosenOffer,
  flash,
}: OverviewProps) {
  const o = t.panel.overview;
  const a = t.panel.activity.summary;
  const free = isFreeAccess(overview.billingMode);
  const steps = onboardingSteps({
    hasApiKey: overview.hasApiKey,
    hasModelRequest: overview.hasModelRequest,
    hasWorkstudio,
    hasVps: overview.hasVps,
  });
  const { last30 } = overview;

  return (
    <div className="space-y-10">
      <PanelHeading id="overview-title" title={o.title} lead={o.lead} />

      {flash ? <Notice tone={flash.kind}>{flash.message}</Notice> : null}

      {chosenOffer && role === "owner" ? (
        <ChosenOfferCard lang={lang} t={t} offer={chosenOffer} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <WalletCard
          lang={lang}
          t={t}
          role={role}
          dashboard={dashboard}
          overview={overview}
        />
        <StartCard lang={lang} t={t} steps={steps} />
      </div>

      <section aria-labelledby="last30-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionTitle id="last30-title">{o.last30.title}</SectionTitle>
          <ButtonLink
            href={localizePath(lang, "/compte/activite")}
            variant="link"
          >
            {o.last30.seeAll}
          </ButtonLink>
        </div>
        {last30.requests === 0 ? (
          <p className="mt-4 text-body text-fg-muted">{o.last30.empty}</p>
        ) : (
          <dl className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label={free ? a.spendFree : a.spend}
              value={formatMicroCadExact(
                lang,
                free ? last30.valueMicro : last30.costMicro,
              )}
            />
            <StatCard
              label={a.requests}
              value={formatInteger(lang, last30.requests)}
              note={
                last30.errors > 0
                  ? fmt(a.failures, {
                      count: formatInteger(lang, last30.errors),
                    })
                  : undefined
              }
            />
            <StatCard
              label={a.promptTokens}
              value={formatInteger(lang, last30.promptTokens)}
            />
            <StatCard
              label={a.completionTokens}
              value={formatInteger(lang, last30.completionTokens)}
            />
          </dl>
        )}
      </section>
    </div>
  );
}
