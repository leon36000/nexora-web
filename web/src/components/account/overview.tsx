import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import { gitspaceVisible } from "@/lib/gitspace-flag";
import type { DashboardData } from "@/server/billing/dashboard";
import type { SubscriptionPlan } from "@/server/billing/plans";
import type { OverviewData } from "@/server/gateway/activity-overview";
import type {
  CreditsView,
  PlanView,
  ProductHint,
  StorageView,
} from "@/server/products/panel-data";
import type { ProductId, ResolvedProduct } from "@/server/products/registry";
import { ChosenOfferCard } from "./billing-panel";
import { Notice } from "./field";
import { formatMicroCadExact, formatTokensCompact } from "./panel-format";
import {
  isFreeAccess,
  type OnboardingStep,
  onboardingProgress,
  onboardingSteps,
} from "./panel-logic";
import { PanelHeading, SectionTitle, StatCard } from "./panel-ui";
import { ForgeEntry, ProductGroup } from "./tools-products";
import { CreditsCard, PlanStrip, StorageCard } from "./tools-summary";

type Role = "owner" | "member";

/** Crédits, espace et offre de l'organisation, lus par `getOrgEntitlements` ; null si la lecture a échoué. */
export interface ToolsSummaryData {
  credits: CreditsView;
  storage: StorageView;
  plan: PlanView;
}

export interface OverviewProps {
  lang: Lang;
  t: AccountDictionary;
  role: Role;
  /** Activité : consommation du mois, clés actives, 30 derniers jours (aucune donnée de solde). */
  overview: OverviewData;
  /** Un accès à WorkStudio est ouvert (étape « Ouvrir WorkStudio » de la liste « Pour démarrer »). */
  hasWorkstudio: boolean;
  /** Produits du panneau avec leur état réel (`resolveProducts`). */
  products: readonly ResolvedProduct[];
  /** Ce qui manque à chaque produit (crédits, espace). Vide si les droits n'ont pas pu être lus. */
  hints: Partial<Record<ProductId, ProductHint>>;
  /** Adresse sûre de l'instance WorkStudio, null tant qu'elle n'est pas connue. */
  workstudioUrl: string | null;
  /** Crédits, espace et offre ; null quand la lecture des droits a échoué (état d'erreur, jamais de faux chiffres). */
  summary: ToolsSummaryData | null;
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

/** « Où j'en suis » : consommation du mois et clés actives, en deux chiffres lisibles d'un coup d'œil. */
export function NowCards({
  lang,
  t,
  overview,
}: {
  lang: Lang;
  t: AccountDictionary;
  overview: OverviewData;
}) {
  const n = t.panel.overview.now;
  const free = isFreeAccess(overview.billingMode);
  const { month } = overview;
  return (
    <section aria-labelledby="now-title">
      <SectionTitle id="now-title">{n.title}</SectionTitle>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <StatCard
          label={n.month}
          value={formatMicroCadExact(
            lang,
            free ? month.valueMicro : month.costMicro,
          )}
          note={
            month.requests === 0
              ? n.monthNoteEmpty
              : fmt(n.monthNote, {
                  requests: formatInteger(lang, month.requests),
                  tokens: formatTokensCompact(
                    lang,
                    month.promptTokens + month.completionTokens,
                  ),
                })
          }
        />
        <StatCard
          label={n.keys}
          value={formatInteger(lang, overview.activeKeys)}
          note={
            <Link
              href={localizePath(lang, "/compte/modeles")}
              prefetch={false}
              className="underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              {n.keysManage}
            </Link>
          }
        />
      </dl>
    </section>
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
                </Link>{" "}
                <span
                  className={`ml-1 font-mono text-label uppercase ${step.done ? "text-success" : "text-fg-muted"}`}
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

/** Page « Mes outils » : crédits, espace et offre, grille des produits avec leur état réel, puis l'activité. */
export function Overview({
  lang,
  t,
  role,
  overview,
  hasWorkstudio,
  products,
  hints,
  workstudioUrl,
  summary,
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
    <div className="space-y-12">
      <PanelHeading id="overview-title" title={o.title} lead={o.lead} />

      {flash ? <Notice tone={flash.kind}>{flash.message}</Notice> : null}

      {chosenOffer && role === "owner" ? (
        <ChosenOfferCard lang={lang} t={t} offer={chosenOffer} />
      ) : null}

      <section
        aria-label={t.panel.tools.summaryTitle}
        className="space-y-6"
        data-testid="tools-summary"
      >
        {summary ? (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <CreditsCard
                lang={lang}
                t={t}
                role={role}
                view={summary.credits}
              />
              <StorageCard lang={lang} t={t} view={summary.storage} />
            </div>
            <PlanStrip lang={lang} t={t} role={role} view={summary.plan} />
          </>
        ) : (
          <Card as="div" variant="outline">
            <p className="text-body font-medium text-fg">
              {t.panel.tools.unavailable.title}
            </p>
            <p role="alert" className="mt-2 text-small text-fg-muted">
              {t.panel.tools.unavailable.text}
            </p>
          </Card>
        )}
      </section>

      <ProductGroup
        lang={lang}
        t={t}
        group="work"
        products={products}
        hints={hints}
        workstudioUrl={workstudioUrl}
      />
      <ProductGroup
        lang={lang}
        t={t}
        group="around"
        products={products}
        hints={hints}
        workstudioUrl={workstudioUrl}
      />
      {gitspaceVisible() ? <ForgeEntry lang={lang} t={t} /> : null}

      <NowCards lang={lang} t={t} overview={overview} />

      <StartCard lang={lang} t={t} steps={steps} />

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
