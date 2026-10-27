import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { answerParagraphs } from "@/components/blocks/faq-block";
import { CodeBlock } from "@/components/gateway/code-samples";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { Breadcrumb } from "@/components/vps/breadcrumb";
import { FaqList } from "@/components/vps/faq";
import { JsonLd } from "@/components/vps/json-ld";
import {
  catalogState,
  compatiblePlans,
  externalUrl,
  formatMemory,
  guideSteps,
} from "@/components/vps/logic";
import { PlanCard } from "@/components/vps/plan-card";
import { fmt } from "@/i18n/account";
import { isLang, localizePath } from "@/i18n/config";
import { getVpsDictionary } from "@/i18n/vps";
import { buildPageMetadata, notFoundMetadata } from "@/lib/metadata";
import { SITE_URL } from "@/lib/site";
import {
  buildBreadcrumbJsonLd,
  buildSoftwareApplicationJsonLd,
} from "@/lib/vps-jsonld";
import { getPublicVps } from "@/server/vps/read";

const APP_CODE = /^[a-z0-9][a-z0-9-]{0,59}$/;

/** Codes publiés connus au build ; les autres se rendent à la demande. Au moins une valeur est exigée. */
export async function generateStaticParams() {
  const vps = await getPublicVps();
  const codes = vps.apps.map((a) => a.code);
  return (codes.length > 0 ? codes : ["exemple"]).map((application) => ({
    application,
  }));
}

/** Application PUBLIÉE (installable ou guide) ; null si le code est inconnu ou non publié. */
async function findApp(code: string) {
  const decoded = decodeURIComponent(code);
  if (!APP_CODE.test(decoded)) return null;
  const vps = await getPublicVps();
  const app = vps.apps.find((a) => a.code === decoded);
  return app ? { app, vps } : null;
}

export async function generateMetadata(
  props: PageProps<"/[lang]/vps/[application]">,
): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const found = await findApp((await props.params).application);
  if (!found) return notFoundMetadata(lang);
  const { app } = found;
  const t = getVpsDictionary(lang);
  const m = app.kind === "guide" ? t.meta.guide : t.meta.app;
  const tagline = lang === "fr" ? app.taglineFr : app.taglineEn;
  return buildPageMetadata({
    lang,
    path: `/vps/${app.code}`,
    title: fmt(m.title, { name: app.name }),
    description: fmt(m.description, {
      name: app.name,
      tagline,
      version: app.version,
      license: app.license,
    }),
    siteName: "Nexora",
  });
}

/** Fiche d'une application : licence, version, ports, plans compatibles, guide d'installation (guides), questions. */
export default async function VpsApplicationPage(
  props: PageProps<"/[lang]/vps/[application]">,
) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const found = await findApp((await props.params).application);
  if (!found) notFound();
  const { app, vps } = found;
  const t = getVpsDictionary(lang);
  const a = t.appPage;
  const guide = app.kind === "guide";

  const tagline = lang === "fr" ? app.taglineFr : app.taglineEn;
  const description = lang === "fr" ? app.descriptionFr : app.descriptionEn;
  const warning = lang === "fr" ? app.licenseWarningFr : app.licenseWarningEn;
  const steps = guideSteps(lang === "fr" ? app.guideFr : app.guideEn);
  const licenseHref = externalUrl(app.licenseUrl);
  const upstreamHref = externalUrl(app.upstreamUrl);
  const ram = formatMemory(lang, app.minRamMb, t.units);
  const state = catalogState(vps);
  const plans = compatiblePlans(vps.plans, app);
  const tunnelPort = app.ports.find((p) => p.exposure === "tunnel");
  const pagePath = localizePath(lang, `/vps/${app.code}`);

  const breadcrumb = buildBreadcrumbJsonLd(SITE_URL, [
    { name: t.nav.home, path: localizePath(lang, "/") },
    { name: t.nav.vps, path: localizePath(lang, "/vps") },
    { name: app.name, path: pagePath },
  ]);
  const software = buildSoftwareApplicationJsonLd({
    siteUrl: SITE_URL,
    pagePath,
    app,
    description: tagline,
  });

  const faq = guide
    ? [
        {
          question: fmt(a.faq.whoInstalls.q, { name: app.name }),
          answer: fmt(a.faq.whoInstalls.a, { name: app.name }),
        },
        { question: a.faq.ram.q, answer: fmt(a.faq.ram.a, { ram }) },
        {
          question: fmt(a.faq.license.q, { name: app.name }),
          answer: fmt(a.faq.license.a, {
            name: app.name,
            license: app.license,
          }),
        },
      ]
    : [
        {
          question: fmt(a.faq.access.q, { name: app.name }),
          answer: fmt(a.faq.access.a, { name: app.name }),
        },
        {
          question: fmt(a.faq.license.q, { name: app.name }),
          answer: fmt(a.faq.license.a, {
            name: app.name,
            license: app.license,
          }),
        },
        {
          question: a.faq.version.q,
          answer: fmt(a.faq.version.a, { version: app.version }),
        },
      ];

  const linkClass =
    "inline-flex min-h-11 items-center rounded-xs text-accent-text underline underline-offset-4";

  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={software} />

      <Section tone="light" aria-labelledby="app-title">
        <Breadcrumb
          label={t.nav.breadcrumb}
          items={[
            { name: t.nav.home, href: localizePath(lang, "/") },
            { name: t.nav.vps, href: localizePath(lang, "/vps") },
            { name: app.name },
          ]}
        />
        <header className="mt-4 max-w-3xl">
          <Badge tone={guide ? "outline" : "accent"}>
            {guide ? a.kindGuide : a.kindApp}
          </Badge>
          <h1 id="app-title" className="mt-4 text-h1 text-fg">
            {app.name}
          </h1>
          {tagline ? (
            <p className="mt-5 max-w-2xl text-lead text-fg-muted">{tagline}</p>
          ) : null}
          {answerParagraphs(description).map((p) => (
            <p key={p} className="mt-4 max-w-2xl text-body text-fg-muted">
              {p}
            </p>
          ))}
        </header>

        <dl className="mt-10 grid gap-6 text-small sm:grid-cols-2 lg:grid-cols-4">
          {guide ? null : (
            <div>
              <dt className="text-fg-muted">{a.version}</dt>
              <dd className="mt-1 font-mono text-body text-fg">
                {app.version}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-fg-muted">{a.license}</dt>
            <dd className="mt-1 text-body text-fg">
              <span className="font-mono">{app.license}</span>
              {licenseHref ? (
                <>
                  <br />
                  <a
                    href={licenseHref}
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {a.licenseText}
                  </a>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{a.minRam}</dt>
            <dd className="mt-1 text-body tabular-nums text-fg">{ram}</dd>
          </div>
          {upstreamHref ? (
            <div>
              <dt className="text-fg-muted">{a.upstream}</dt>
              <dd className="mt-1 text-body text-fg">
                <a
                  href={upstreamHref}
                  rel="noopener noreferrer"
                  className={`${linkClass} break-all`}
                >
                  {upstreamHref.replace(/^https?:\/\//, "")}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>

        {warning ? (
          <aside
            aria-labelledby="license-warning-title"
            className="mt-10 max-w-3xl rounded-md border border-accent-text p-5"
          >
            <h2 id="license-warning-title" className="text-h4 text-fg">
              {a.licenseWarning}
            </h2>
            <p className="mt-2 text-body text-fg-muted">{warning}</p>
          </aside>
        ) : null}

        {guide ? null : (
          <div className="mt-10">
            <ButtonLink
              href={`${localizePath(lang, "/vps")}?app=${encodeURIComponent(app.code)}#configurateur`}
              size="lg"
              arrow
            >
              {a.order}
            </ButtonLink>
          </div>
        )}
      </Section>

      {guide ? (
        <Section tone="light" surface aria-labelledby="guide-title">
          <SectionHeader id="guide-title" title={a.guideTitle} />
          <p className="mt-5 max-w-2xl text-body font-medium text-fg">
            {fmt(a.guideNotice, { name: app.name })}
          </p>
          <p className="mt-2 max-w-2xl text-body text-fg-muted">
            {fmt(a.guideNoticeText, { name: app.name })}
          </p>
          {steps.length > 0 ? (
            <ol className="mt-8 max-w-2xl list-decimal space-y-3 pl-6 text-body text-fg marker:text-fg-muted">
              {steps.map((step) => (
                <li key={step} className="pl-2">
                  {step}
                </li>
              ))}
            </ol>
          ) : null}
          <p className="mt-8 max-w-2xl text-body text-fg-muted">
            {a.guideOrderNote}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={localizePath(lang, "/vps")} arrow>
              {a.guideSeeVps}
            </ButtonLink>
            <ButtonLink
              href={`${localizePath(lang, "/contact")}?sujet=demonstration`}
              variant="secondary"
            >
              {a.guideBlank}
            </ButtonLink>
          </div>
        </Section>
      ) : app.ports.length > 0 ? (
        <Section tone="light" surface aria-labelledby="ports-title">
          <SectionHeader id="ports-title" title={a.ports} lead={a.portsLead} />
          <ul className="mt-10 max-w-3xl divide-y divide-line border-y border-line">
            {app.ports.map((port) => (
              <li
                key={`${port.port}/${port.proto}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4"
              >
                <span className="text-body text-fg">
                  {lang === "fr" ? port.labelFr : port.labelEn}
                </span>
                <span className="flex items-center gap-4">
                  <span className="font-mono text-small tabular-nums text-fg">
                    {fmt(a.portLine, { port: port.port, proto: port.proto })}
                  </span>
                  <Badge
                    tone={port.exposure === "tunnel" ? "outline" : "accent"}
                  >
                    {port.exposure === "tunnel" ? a.portTunnel : a.portPublic}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
          {tunnelPort ? (
            <div className="mt-8 max-w-3xl">
              <p className="text-small text-fg-muted">
                {fmt(a.tunnelExample, { port: tunnelPort.port })}
              </p>
              <CodeBlock
                code={fmt(a.tunnelCommand, { port: tunnelPort.port })}
                label={fmt(a.tunnelExample, { port: tunnelPort.port })}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section tone="light" aria-labelledby="compat-title">
        <SectionHeader
          id="compat-title"
          title={a.plansTitle}
          lead={state === "ready" ? fmt(a.plansLead, { ram }) : undefined}
        />
        {state === "empty" ? (
          <p className="mt-10 max-w-2xl text-body text-fg-muted">
            {a.plansPending}
          </p>
        ) : state === "unavailable" ? (
          <p className="mt-10 max-w-2xl text-body text-fg-muted">
            {a.plansUnavailable}
          </p>
        ) : plans.length === 0 ? (
          <p className="mt-10 max-w-2xl text-body text-fg-muted">
            {a.noCompatible}
          </p>
        ) : (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <li key={plan.code}>
                <PlanCard
                  lang={lang}
                  plan={plan}
                  t={t}
                  orderHref={
                    guide
                      ? null
                      : `${localizePath(lang, "/vps")}?plan=${encodeURIComponent(plan.code)}&app=${encodeURIComponent(app.code)}#configurateur`
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {state === "ready" ? (
          <div className="mt-8 max-w-3xl space-y-2 text-small text-fg-muted">
            <p>{t.common.taxes}</p>
            <p>{t.common.renewal}</p>
          </div>
        ) : null}
      </Section>

      <Section tone="light" surface aria-labelledby="app-faq-title">
        <SectionHeader
          id="app-faq-title"
          title={fmt(a.faqTitle, { name: app.name })}
        />
        <div className="mt-12">
          <FaqList items={faq} />
        </div>
      </Section>
    </>
  );
}
