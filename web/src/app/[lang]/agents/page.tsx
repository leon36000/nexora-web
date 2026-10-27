import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { AgentCard } from "@/components/agents/agent-card";
import { CodeSamples } from "@/components/gateway/code-samples";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { fmt, formatDate } from "@/i18n/account";
import { getAgentsDictionary } from "@/i18n/agents";
import { isLang, localizePath } from "@/i18n/config";
import { agentSamples } from "@/lib/agent-samples";
import { buildPageMetadata } from "@/lib/metadata";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { SITE_URL } from "@/lib/site";
import { getPublicAgents } from "@/server/agents/read";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAgentsDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/agents",
    title: t.meta.list.title,
    description: t.meta.list.description,
    siteName: "Nexora",
  });
}

/** Catalogue public des agents hébergés (Nexora WorkStudio), appelables par l'API de la passerelle. */
export default async function AgentsPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAgentsDictionary(lang);
  const catalog = await getPublicAgents();
  const exampleId = catalog.agents[0]?.id ?? "agent/mon-agent";
  const g = t.guardrails;
  return (
    <>
      <Section tone="light" aria-labelledby="agents-title">
        <header className="max-w-3xl">
          <Badge tone="accent">{t.catalog.label}</Badge>
          <h1 id="agents-title" className="mt-4 text-h1 text-fg">
            {t.catalog.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lead text-fg-muted">
            {t.catalog.lead}
          </p>
        </header>

        <p
          className="mt-10 min-h-[3rem] text-small text-fg-muted"
          role="status"
        >
          {fmt(t.catalog.count, { count: catalog.agents.length })}
          {" · "}
          {t.catalog.priceNote}
          {catalog.publishedAt
            ? ` ${fmt(t.catalog.updated, { date: formatDate(lang, new Date(catalog.publishedAt)) })}`
            : ""}
        </p>
        {catalog.agents.some((a) => a.trial) ? (
          <p className="mt-1 text-small text-accent-text">
            {t.catalog.trialNote}
          </p>
        ) : null}
        {catalog.agents.length === 0 ? (
          <p className="mt-6 text-body text-fg-muted">
            {catalog.available ? t.catalog.empty : t.catalog.unavailable}
          </p>
        ) : (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.agents.map((a) => (
              <li key={a.id}>
                <AgentCard agent={a} lang={lang} t={t} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section tone="dark" aria-labelledby="how-title">
        <h2 id="how-title" className="text-h2 text-fg">
          {t.catalog.howTitle}
        </h2>
        <ol className="mt-6 grid max-w-3xl list-decimal gap-3 pl-6 text-body text-fg-muted">
          {t.catalog.howSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="mt-8">
          <CodeSamples
            samples={agentSamples(`${SITE_URL}/v1`, exampleId, lang)}
          />
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <ButtonLink href={localizePath(lang, "/compte")} arrow>
            {t.cta.createKey}
          </ButtonLink>
          <ButtonLink
            href={localizePath(lang, "/docs/api")}
            variant="secondary"
          >
            {t.cta.docs}
          </ButtonLink>
        </div>
      </Section>

      <Section tone="light" surface aria-labelledby="guard-title">
        <h2 id="guard-title" className="text-h2 text-fg">
          {g.title}
        </h2>
        <p className="mt-4 max-w-2xl text-lead text-fg-muted">{g.lead}</p>
        <dl className="mt-8 grid gap-8 md:grid-cols-2">
          {(
            [
              [g.hostingTitle, g.hosting],
              [g.retentionTitle, g.retention],
              [g.billingTitle, g.billing],
              [g.keyTitle, g.key],
              [g.revokeTitle, g.revoke],
            ] as const
          ).map(([title, text]) => (
            <div key={title}>
              <dt className="text-h4 text-fg">{title}</dt>
              <dd className="mt-2 max-w-xl text-body text-fg-muted">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-small">
          <Link
            href={localizePath(lang, "/modeles")}
            className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-4"
          >
            {t.cta.models}
          </Link>
        </p>
      </Section>
      <JsonLd
        data={appBreadcrumb(lang, [
          {
            name: t.meta.list.title.replace(/ \| Nexora$/, ""),
            path: "/agents",
          },
        ])}
      />
    </>
  );
}
